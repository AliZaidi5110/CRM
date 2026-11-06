import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { all, one, insert, update, HttpError, type Row } from './db';

let localSecret: string | undefined;
export function signingKey() {
  if (process.env.JWT_SECRET_KEY) return new TextEncoder().encode(process.env.JWT_SECRET_KEY);
  if (process.env.VERCEL) throw new HttpError(503, 'Set JWT_SECRET_KEY in the hosting environment.');
  if (!localSecret) {
    const file = '.local-secrets.json';
    if (existsSync(file)) localSecret = JSON.parse(readFileSync(file,'utf8')).JWT_SECRET_KEY;
    if (!localSecret) { localSecret=randomBytes(32).toString('hex'); writeFileSync(file,JSON.stringify({JWT_SECRET_KEY:localSecret}),{mode:0o600}); }
  }
  return new TextEncoder().encode(localSecret);
}
export async function userDTO(user: Row) {
  const role = await one('roles', user.role_id);
  const member = (await all('team_members', 'user_id=?', [user.id])).sort((a,b)=>Number(b.is_primary)-Number(a.is_primary))[0];
  const team = member ? await one('teams',member.team_id) : null;
  const rolePerms = await all('role_permissions','role_id=?',[role.id]);
  const perms = await all('permissions');
  return { id:user.id, username:user.username, full_name:user.full_name,email:user.email,phone:user.phone,
    role:role.name,role_id:role.id,role_display:role.display_name,team_id:team?.id ?? null,team_name:team?.name ?? null,
    is_active:user.is_active,last_login_at:user.last_login_at,created_at:user.created_at,updated_at:user.updated_at,
    permissions:perms.filter(p=>rolePerms.some(r=>r.permission_id===p.id)).map(p=>p.code) };
}
export async function actor(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /,'');
  if (!token) throw new HttpError(401,'Valid authentication token required');
  let payload;
  try { payload=(await jwtVerify(token,signingKey(),{algorithms:['HS256']})).payload; }
  catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(401,'Session expired. Please sign in again.'); }
  let u; try { u=await one('users',String(payload.sub)); } catch { throw new HttpError(401,'Account unavailable'); }
  if (!u.is_active || u.deleted_at) throw new HttpError(401,'Account unavailable');
  return userDTO(u);
}
export function permission(user: Row, code: string) {
  if (user.role !== 'super_admin' && !user.permissions.includes(code)) throw new HttpError(403,`Permission '${code}' required`);
}
export function admin(user: Row) { if (user.role !== 'super_admin') throw new HttpError(403,'Administrator access is required'); }
export async function teamIDs(user: Row): Promise<string[]> {
  return [...new Set([user.team_id,...(await all('teams','team_leader_id=? AND deleted_at IS NULL',[user.id])).map(t=>t.id)].filter(Boolean))];
}
export async function canAccess(user: Row, customer: Row) {
  if (user.role === 'super_admin') return true;
  if (customer.deleted_at) return false;
  if (user.role === 'team_leader') return (await teamIDs(user)).includes(customer.assigned_team_id);
  return customer.assigned_agent_id === user.id || (!customer.assigned_agent_id && Boolean(user.team_id) && customer.assigned_team_id===user.team_id);
}
export async function customerFor(user: Row, id: string) {
  const c=await one('customers',id); if (!await canAccess(user,c)) throw new HttpError(403,'Access to customer denied'); return c;
}
export async function audit(user: Row, action: string, type: string, id: string | null, summary: string, details: Row = {}) {
  return insert('audit_logs',{user_id:user.id,action,entity_type:type,entity_id:id,summary,details});
}
export async function login(data: Row) {
  if (!data.username || !data.password) throw new HttpError(400,'Username and password are required');
  const u=(await all('users','(username=? OR email=?) AND deleted_at IS NULL',[String(data.username).trim(),String(data.username).trim()]))[0];
  if (!u || !u.is_active) throw new HttpError(401,'Invalid username or password');
  if (u.locked_until && new Date(u.locked_until).getTime()>Date.now()) throw new HttpError(401,'Account is temporarily locked. Try again in 15 minutes.');
  if (!await bcrypt.compare(String(data.password),u.password_hash)) {
    const count=(u.locked_until ? 0 : Number(u.failed_login_count || 0))+1;
    await update('users',u.id,{failed_login_count:count,locked_until:count>=5?new Date(Date.now()+900000).toISOString():null});
    throw new HttpError(401,'Invalid username or password');
  }
  await update('users',u.id,{failed_login_count:0,locked_until:null,last_login_at:new Date().toISOString()});
  const user=await userDTO(await one('users',u.id));
  const device_id=String(data.device_id||randomUUID());
  const device=(await all('devices','device_token=?',[device_id]))[0];
  if(device)await update('devices',device.id,{user_id:u.id,last_active_at:new Date().toISOString()});
  else await insert('devices',{user_id:u.id,device_name:String(data.device_name||'Web Browser').slice(0,120),device_token:device_id});
  const token=await new SignJWT({username:user.username,role:user.role,role_id:user.role_id,team_id:user.team_id,permissions:user.permissions,device_id}).setProtectedHeader({alg:'HS256'}).setSubject(u.id).setIssuedAt().setExpirationTime('12h').sign(signingKey());
  await audit(user,'LOGIN_SUCCESS','USER',u.id,`User ${u.username} logged in`);
  return {message:'Login successful',token,user,device_id};
}
export { bcrypt };
