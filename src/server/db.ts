import { Pool, types, type PoolClient } from 'pg';
import { createRequire } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import schemaData from './schema.json';

// Legacy SQLAlchemy timestamps are UTC without a zone. Interpret them consistently
// in Node regardless of the operating system's timezone.
types.setTypeParser(1114, value => `${value.replace(' ', 'T')}Z`);
types.setTypeParser(1082, value => value);

export type Row = Record<string, any>;
export const schema: Record<string, Record<string, { type: string; nullable: boolean; default: any; primary: boolean }>> = schemaData;
const scope = new AsyncLocalStorage<PoolClient>();
let pool: Pool | undefined;
let sqlite: any;
export const cloud = () => Boolean(process.env.DATABASE_URL?.startsWith('postgres'));
export class HttpError extends Error {
  constructor(public status: number, message: string, public details: Row = {}) { super(message); }
}
export function databaseReady() { return !process.env.VERCEL || cloud(); }
function localDB() {
  if (process.env.VERCEL) throw new HttpError(503, 'Connect your PostgreSQL database to enable the CRM.');
  if (!sqlite) {
    // Loaded only in local Node.js; never use ephemeral SQLite for cloud records.
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    sqlite = new DatabaseSync(process.env.SQLITE_PATH || path.resolve('crm.db'));
    sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  }
  return sqlite;
}
export function getPool() {
  return pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000 });
}
function pgSQL(sql: string) { let n = 0; return sql.replace(/\?/g, () => `$${++n}`); }
export async function query(sql: string, args: any[] = []): Promise<Row[]> {
  if (cloud()) return (await (scope.getStore() || getPool()).query(pgSQL(sql), args)).rows;
  const params = args.map(v => typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);
  const statement = localDB().prepare(sql);
  return statement.columns().length ? statement.all(...params).map((r: Row) => ({ ...r })) : (statement.run(...params), []);
}
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (scope.getStore()) return fn();
  if (cloud()) {
    const client = await getPool().connect();
    try { await client.query('BEGIN'); const value = await scope.run(client, fn); await client.query('COMMIT'); return value; }
    catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  // Local SQLite transactions must not interleave while async service calls yield.
  const prior = localTail;
  let release!: () => void;
  localTail = new Promise<void>(resolve => { release = resolve; });
  await prior;
  try { localDB().exec('BEGIN IMMEDIATE'); const result = await fn(); localDB().exec('COMMIT'); return result; }
  catch (e) { localDB().exec('ROLLBACK'); throw e; } finally { release(); }
}
let localTail: Promise<void> = Promise.resolve();
function tableName(table: string) { if (!schema[table]) throw new Error('Unknown table'); return `"${table}"`; }
export function decode(table: string, row: Row): Row {
  const result = { ...row };
  for (const [key, col] of Object.entries(schema[table])) {
    if (result[key] == null) continue;
    if (col.type === 'JSON' && typeof result[key] === 'string') result[key] = JSON.parse(result[key]);
    if (col.type === 'BOOLEAN') result[key] = Boolean(result[key]);
    if (/NUMERIC/.test(col.type)) result[key] = Number(result[key]);
    if (result[key] instanceof Date) result[key] = result[key].toISOString();
    else if (col.type === 'DATETIME' && typeof result[key] === 'string') {
      const stamp = result[key].replace(' ', 'T');
      const date = new Date(/[Zz]$|[+-]\d\d:\d\d$/.test(stamp) ? stamp : `${stamp}Z`);
      if (Number.isFinite(date.getTime())) result[key] = date.toISOString();
    }
  }
  return result;
}
export async function all(table: string, where = '', args: any[] = [], order = '') {
  return (await query(`SELECT * FROM ${tableName(table)}${where ? ` WHERE ${where}` : ''}${order ? ` ORDER BY ${order}` : ''}`, args)).map(r => decode(table, r));
}
export async function one(table: string, id: string): Promise<Row> {
  const row = (await all(table, 'id=?', [id]))[0]; if (!row) throw new HttpError(404, 'Record not found'); return row;
}
export async function insert(table: string, input: Row) {
  const data: Row = {};
  for (const [key, col] of Object.entries(schema[table])) {
    if (key in input && input[key] !== undefined) data[key] = input[key];
    else if (key === 'id') data[key] = randomUUID();
    else if (['created_at','updated_at','imported_at','last_active_at','joined_at'].includes(key)) data[key] = new Date().toISOString();
    else if (col.default !== null) data[key] = col.default;
    else if (col.type === 'JSON') data[key] = key === 'tags_list' ? [] : {};
  }
  if (table === 'customers' && !data.code) data.code = `CUST-${randomUUID().slice(0,12)}`;
  if (table === 'calls' && !data.call_code) data.call_code = `CALL-${randomUUID().slice(0,12)}`;
  const keys = Object.keys(data);
  const args = keys.map(k => schema[table][k].type === 'JSON' ? JSON.stringify(data[k]) : data[k]);
  await query(`INSERT INTO ${tableName(table)} (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`, args);
  return decode(table, data);
}
export async function update(table: string, id: string, input: Row) {
  const data = Object.fromEntries(Object.entries(input).filter(([k,v]) => k !== 'id' && schema[table][k] && v !== undefined));
  if (schema[table].updated_at) data.updated_at = new Date().toISOString();
  const keys = Object.keys(data); if (!keys.length) return one(table,id);
  await query(`UPDATE ${tableName(table)} SET ${keys.map(k=>`"${k}"=?`).join(',')} WHERE id=?`, [...keys.map(k=>schema[table][k].type==='JSON'?JSON.stringify(data[k]):data[k]),id]);
  return one(table,id);
}
export async function initializeSchema() {
  const sql = readFileSync(path.resolve('src/server', cloud() ? 'postgres.sql' : 'sqlite.sql'), 'utf8');
  if (cloud()) await getPool().query(sql); else localDB().exec(sql);
}
export async function closeDB() { if (pool) { await pool.end(); pool=undefined; } if (sqlite) { sqlite.close(); sqlite=undefined; } }
