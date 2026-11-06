import { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import schema from '../src/server/schema.json';

// Explicit migration into an EMPTY PostgreSQL schema. Source SQLite is read-only.
async function main(){
  if(!process.env.DATABASE_URL?.startsWith('postgres'))throw new Error('Set DATABASE_URL to the target PostgreSQL database.');
  const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
  const source=new DatabaseSync(path.resolve(process.env.SQLITE_PATH||'crm.db'),{readOnly:true});
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const existing=await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])",[Object.keys(schema)]);
    if(existing.rowCount)throw new Error('Target already contains CRM tables. Migration stopped without changing data. Use an empty database or schema.');
    const sql=readFileSync(path.resolve('src/server/postgres.sql'),'utf8');
    const at=sql.indexOf('ALTER TABLE');
    await client.query(at<0?sql:sql.slice(0,at));
    for(const [table,columns]of Object.entries(schema)){
      let rows;try{rows=source.prepare(`SELECT * FROM "${table}"`).all();}catch{console.log(`Skipping missing legacy table: ${table}`);continue;}
      for(const row of rows){
        const keys=Object.keys(row).filter(k=>k in columns);
        const values=keys.map(k=>{const col=(columns as Record<string,{type:string}>)[k];return row[k]==null?null:col.type==='BOOLEAN'?Boolean(row[k]):row[k];});
        await client.query(`INSERT INTO "${table}" (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')})`,values);
      }
      const count=Number((await client.query(`SELECT COUNT(*) AS count FROM "${table}"`)).rows[0].count);
      if(count!==rows.length)throw new Error(`Row count mismatch for ${table}`);
      console.log(`${table}: verified ${count} records`);
    }
    if(at>=0)await client.query(sql.slice(at));
    await client.query('COMMIT');console.log('Migration verified and committed. Source database unchanged. Uploaded files require a separate storage transfer.');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{source.close();client.release();await pool.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
