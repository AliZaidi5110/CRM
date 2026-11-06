import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeSchema, insert, all, one, update, closeDB, transaction } from '../src/server/db';
import { seedMetadata } from '../scripts/init-db';
import { handle } from '../src/server/api';
import { userDTO, bcrypt } from '../src/server/auth';

const dir=mkdtempSync(path.join(tmpdir(),'crm-next-test-'));
process.env.SQLITE_PATH=path.join(dir,'test.db');process.env.JWT_SECRET_KEY='test-only-signing-secret-that-is-long-enough';
delete process.env.DATABASE_URL;delete process.env.VERCEL;
const tokens:Record<string,string>={},users:Record<string,any>={};let team:any,other:any,lead:any;
async function api(method:string,endpoint:string,body?:any,as='admin'){
  const isForm=body instanceof FormData;
  const response=await handle(new Request(`http://localhost/api/${endpoint}`,{method,headers:{...(tokens[as]?{Authorization:`Bearer ${tokens[as]}`} : {}),...(!isForm&&body!==undefined?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:isForm?body:JSON.stringify(body)})}),endpoint.split('?')[0].split('/'));
  const content=response.headers.get('Content-Type')?.includes('json')?await response.json():await response.text();return {status:response.status,data:content};
}
before(async()=>{
  await initializeSchema();await seedMetadata();
  for(const [username,role]of [['admin','super_admin'],['leader','team_leader'],['alice','agent'],['bob','agent'],['outside','agent']]){
    const r=(await all('roles','name=?',[role]))[0];users[username]=await insert('users',{username,email:`${username}@example.test`,full_name:username,password_hash:await bcrypt.hash('Testing12345!',4),role_id:r.id,is_active:true});
  }
  team=await insert('teams',{name:'Team A',team_leader_id:users.leader.id});other=await insert('teams',{name:'Team B'});
  for(const username of ['leader','alice','bob'])await insert('team_members',{team_id:team.id,user_id:users[username].id,is_primary:true});
  await insert('team_members',{team_id:other.id,user_id:users.outside.id,is_primary:true});
  for(const username of Object.keys(users)){const r=await api('POST','auth/login',{username,password:'Testing12345!'},'anonymous');assert.equal(r.status,200);tokens[username]=r.data.token;}
});
after(async()=>{await closeDB();rmSync(dir,{recursive:true,force:true});});

test('unauthenticated API calls and role escalation are rejected',async()=>{
  assert.equal((await api('GET','customers',undefined,'anonymous')).status,401);
  assert.equal((await api('GET','admin/finance',undefined,'alice')).status,403);
  assert.equal((await api('POST','users',{username:'hacker'},'alice')).status,403);
});
test('agent creates lead and only its owner, leader and administrator can access it',async()=>{
  const r=await api('POST','customers',{full_name:'Merchant One',phone:'07700900100',company_name:'Merchant Ltd',assigned_agent_id:users.bob.id},'alice');
  assert.equal(r.status,201);lead=r.data.customer;assert.equal(lead.assigned_agent_id,users.alice.id);
  assert.equal((await api('GET',`customers/${lead.id}`,undefined,'bob')).status,403);
  assert.equal((await api('GET',`customers/${lead.id}`,undefined,'outside')).status,403);
  assert.equal((await api('GET',`customers/${lead.id}`,undefined,'leader')).status,200);
  const list=await api('GET','customers?search=merchant',undefined,'alice');assert.equal(list.data.items.length,1);
});
test('normalized duplicate phone numbers are detected within scope',async()=>{
  const r=await api('POST','customers/check-duplicate',{phone:'+44 7700 900100'},'alice');assert.equal(r.data.has_duplicates,true);
});
test('logging a call preserves timeline and handles Not Interested correctly',async()=>{
  const r=await api('POST','calls',{customer_id:lead.id,outcome:'Not Interested',duration_seconds:75,notes:'Customer declined'},'alice');assert.equal(r.status,201);
  const profile=await api('GET',`customers/${lead.id}`,undefined,'alice');assert.equal(profile.data.customer.lead_status,'NOT_INTERESTED');assert.equal(profile.data.calls[0].duration_formatted,'01:15');assert.equal(profile.data.conversations[0].summary,'Customer declined');
});
test('callbacks retain next pending date when completed',async()=>{
  const first=await api('POST','callbacks',{customer_id:lead.id,scheduled_at:'2027-01-01T10:00:00Z',reason:'Follow-up'},'alice');
  const second=await api('POST','callbacks',{customer_id:lead.id,scheduled_at:'2027-01-02T10:00:00Z',reason:'Second follow-up'},'alice');
  assert.equal(first.status,201);assert.equal(second.status,201);
  assert.equal((await api('POST',`callbacks/${first.data.callback.id}/complete`,{notes:'Done'},'bob')).status,403);
  assert.equal((await api('POST',`callbacks/${first.data.callback.id}/complete`,{notes:'Done'},'alice')).status,200);
  assert.equal((await one('customers',lead.id)).next_callback_date,'2027-01-02T10:00:00.000Z');
});
test('sharing with leader retains original owner; reassignment changes access',async()=>{
  assert.equal((await api('POST','assignments/assign-to-leader',{customer_id:lead.id},'alice')).status,200);
  assert.equal((await one('customers',lead.id)).assigned_agent_id,users.alice.id);
  assert.equal((await api('POST','assignments/reassign',{customer_id:lead.id,target_agent_id:users.outside.id},'leader')).status,400);
  assert.equal((await api('POST','assignments/reassign',{customer_id:lead.id,target_agent_id:users.bob.id},'leader')).status,200);
  assert.equal((await api('GET',`customers/${lead.id}`,undefined,'alice')).status,403);
  assert.equal((await api('GET',`customers/${lead.id}`,undefined,'bob')).status,200);
});
test('closing deals validates bank fields and preserves full package',async()=>{
  assert.equal((await api('POST',`customers/${lead.id}/close-deal`,{},'bob')).status,400);
  const r=await api('POST',`customers/${lead.id}/close-deal`,{business_details:{business_name:'Merchant Ltd'},personal_details:{full_name:'Merchant One',mobile_number:'07700900100'},bank_details:{bank_name:'Test Bank',account_title:'Merchant Ltd',sort_code:'12-34-56',account_number:'12345678'},selected_plan:{provider_plan:'Shift4',monthly_turnover:5000}},'bob');assert.equal(r.status,200);assert.equal(r.data.customer.lead_status,'CONVERTED');assert.equal(r.data.closing_details.bank.sort_code,'12-34-56');
});
test('offline sync retries are idempotent and stale updates preserve server data',async()=>{
  const item={local_id:'offline-customer-1',operation:'CREATE',entity_type:'CUSTOMER',payload:{full_name:'Offline Merchant',phone:'07700900222'},client_timestamp:'2025-01-01T00:00:00Z'};
  const a=await api('POST','sync',{items:[item]},'alice'),b=await api('POST','sync',{items:[item]},'alice');
  assert.equal(a.data.results.processed,1);assert.equal(b.data.results.synced[0].server_id,a.data.results.synced[0].server_id);
  const id=a.data.results.synced[0].server_id;
  const stale=await api('POST','sync',{items:[{local_id:'stale-1',operation:'UPDATE',entity_type:'CUSTOMER',entity_id:id,payload:{full_name:'Overwrite'},client_timestamp:'2020-01-01T00:00:00Z'}]},'alice');
  assert.equal(stale.data.results.conflicts.length,1);assert.equal((await one('customers',id)).full_name,'Offline Merchant');
});
test('finance validates amounts and monthly payroll upserts one record',async()=>{
  assert.equal((await api('POST','admin/finance/expenses',{category:'RENT',description:'Office',amount:-1})).status,400);
  assert.equal((await api('POST','admin/finance/expenses',{category:'RENT',description:'Office',amount:100})).status,201);
  const input={employee_id:users.alice.id,period:'2026-11',amount:50000,status:'PENDING'};
  assert.equal((await api('POST','admin/employees/salaries',input)).status,200);
  await api('POST','admin/employees/salaries',{...input,amount:60000,status:'PAID'});
  const summary=await api('GET','admin/finance');assert.equal(summary.data.employee_salaries_paid_pkr,60000);assert.equal(summary.data.total_expenses,100);
});
test('CSV preview, import and contract batch validation work without Python',async()=>{
  const form=new FormData();form.set('file',new File(['Name,Phone\nCSV Merchant,07700900333'], 'leads.csv'));form.set('column_mapping',JSON.stringify({full_name:'Name',phone:'Phone'}));
  assert.equal((await api('POST','sync/import/preview',form)).data.total_rows,1);
  assert.equal((await api('POST','sync/import/execute',form)).data.imported_count,1);
  const contracts=new FormData();contracts.set('file',new File(['business_name,customer_name,contract_status,commission_status,commission_amount\nMerchant Ltd,Alex,Approved,Paid,250'], 'contracts.csv'));
  assert.equal((await api('POST','admin/contracts/import',contracts)).data.count,1);
  assert.equal((await api('GET','admin/finance')).data.paid_commissions,250);
});
test('dashboard reporting is scoped and exports require permission',async()=>{
  const r=await api('GET','reports/dashboard',undefined,'alice');assert.equal(r.status,200);assert.equal(r.data.total_converted,0);
  assert.equal((await api('POST','reports/export',{},'alice')).status,403);
  assert.equal((await api('GET','reports/admin',undefined,'leader')).status,403);
  assert.equal((await api('POST','reports/export',{})).status,200);
});
test('failed logins persist lockout and cloud setup never uses local SQLite',async()=>{
  for(let i=0;i<5;i++)assert.equal((await api('POST','auth/login',{username:'outside',password:'bad'},'anonymous')).status,401);
  assert.ok((await one('users',users.outside.id)).locked_until);
  process.env.VERCEL='1';assert.equal((await api('GET','customers')).status,503);delete process.env.VERCEL;
});
test('multi-record mutations rollback on failure',async()=>{
  const before=(await all('expenses')).length;
  await assert.rejects(transaction(async()=>{await insert('expenses',{category:'OTHER',description:'Rollback',amount:1,incurred_on:'2026-11-06'});throw new Error('abort');}));
  assert.equal((await all('expenses')).length,before);
});
test('simultaneous offline retries create one record',async()=>{
  const payload={items:[{local_id:'simultaneous-1',operation:'CREATE',entity_type:'CUSTOMER',payload:{full_name:'Simultaneous',phone:'07700900888'},client_timestamp:nowForTest()}]};
  const [a,b]=await Promise.all([api('POST','sync',payload,'alice'),api('POST','sync',payload,'alice')]);
  assert.equal(a.data.results.errors.length,0);assert.equal(b.data.results.errors.length,0);
  assert.equal(a.data.results.synced[0].server_id,b.data.results.synced[0].server_id);
  assert.equal((await all('customers','full_name=?',['Simultaneous'])).length,1);
});
function nowForTest(){return new Date().toISOString();}
test('contract create/update and quote tiers retain their API contracts',async()=>{
  const body=new FormData();body.set('business_name','Direct Contract');body.set('customer_name','Test Customer');body.set('commission_amount','125');
  const c=await api('POST','admin/contracts',body);assert.equal(c.status,201);assert.equal(c.data.contract.has_file,false);
  const u=await api('PATCH',`admin/contracts/${c.data.contract.id}`,{contract_status:'APPROVED',commission_status:'PAID'});assert.equal(u.data.contract.contract_status,'APPROVED');
  const low=await api('POST','rebuttals/calculate',{turnover:4999},'alice'),high=await api('POST','rebuttals/calculate',{turnover:5000},'alice');
  assert.equal(low.data.shift4.applied_rate,1.25);assert.equal(high.data.shift4.applied_rate,.7);
});
