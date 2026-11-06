import { parse } from 'csv-parse/sync';
import { all, one, insert, update, HttpError, type Row } from './db';
import { admin, audit, userDTO } from './auth';
import { relatedDTO, customerDTO, now, pick } from './records';
import { saveFile, downloadFile } from './storage';
export function amount(value:any,name='Amount'){
  const n=Number(value||0);if(!Number.isFinite(n)||n<0)throw new HttpError(400,`${name} must be a non-negative amount`);return Math.round(n*100)/100;
}
function status(value:any,contract=false){const s=String(value||'PENDING').toUpperCase().replaceAll(' ','_');if(!(contract?['PENDING','UNDER_REVIEW','APPROVED']:['PENDING','PAID']).includes(s))throw new HttpError(400,'Select a valid status');return s;}
export function period(value:any){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value)))throw new HttpError(400,'Choose a valid month');return String(value);}
function validDate(value:any){const v=String(value||now().slice(0,10));if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(new Date(v).getTime())||new Date(v).toISOString().slice(0,10)!==v)throw new HttpError(400,'Enter a valid date');return v;}
export function csvRecords(text:string):Row[]{
  try{const rows=parse(text,{bom:true,columns:(headers:string[])=>headers.map(h=>h.trim().toLowerCase()),skip_empty_lines:true,trim:true}) as Row[];if(rows.length>5000)throw new HttpError(400,'Import at most 5,000 rows');return rows;}
  catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Choose a valid UTF-8 CSV file');}
}
export async function uploadedCSV(form:FormData){const f=form.get('file');if(!(f instanceof File)||!f.name.toLowerCase().endsWith('.csv'))throw new HttpError(400,'Choose a CSV file');if(f.size>4*1024*1024)throw new HttpError(400,'CSV is too large');return f.text();}
async function employee(id:string){const u=await one('users',id);const dto=await userDTO(u);if(!dto.is_active||u.deleted_at||!['agent','team_leader'].includes(dto.role))throw new HttpError(400,'Choose an active employee');return dto;}
export async function adminRoute(user:Row,segments:string[],method:string,data:Row,form:FormData|null,params:URLSearchParams):Promise<any>{
  admin(user);const [area,id,action]=segments;
  if(area==='contracts'){
    const contractDTO=(c:Row)=>({...c,has_file:Boolean(c.stored_filename),stored_filename:undefined});
    if(method==='GET'&&!id)return {contracts:(await all('contracts','',[],'created_at DESC')).slice(0,1000).map(contractDTO)};
    if(method==='GET'&&action==='file'){const c=await one('contracts',id);if(!c.stored_filename)throw new HttpError(404,'No contract file uploaded');return downloadFile(c.stored_filename,c.original_filename);}
    if(method==='POST'&&id==='import'){
      const rows=csvRecords(await uploadedCSV(form!));if(!rows.length)throw new HttpError(400,'CSV contains no contracts');
      const prepared=rows.map(r=>{if(!r.business_name||!r.customer_name)throw new HttpError(400,'Business and customer names are required');return {...pick(r,['business_name','customer_name','notes']),contract_status:status(r.contract_status,true),commission_status:status(r.commission_status),commission_amount:amount(r.commission_amount),created_by_id:user.id};});
      for(const r of prepared)await insert('contracts',r);await audit(user,'CONTRACT_LIST_IMPORTED','CONTRACT',null,`Imported ${prepared.length} contracts`);return {message:`Imported ${prepared.length} contracts`,count:prepared.length};
    }
    if(method==='POST'&&!id){
      if(!data.business_name||!data.customer_name)throw new HttpError(400,'Business and customer names are required');
      const input:Row={...pick(data,['business_name','customer_name','notes']),contract_status:status(data.contract_status,true),commission_status:status(data.commission_status),commission_amount:amount(data.commission_amount),created_by_id:user.id};
      const f=form?.get('contract_file');if(f instanceof File&&f.size)Object.assign(input,await saveFile(f));
      const c=await insert('contracts',input);await audit(user,'CONTRACT_CREATED','CONTRACT',c.id,`Added contract for ${c.business_name}`);return {message:'Contract added',contract:contractDTO(c)};
    }
    if(method==='PATCH'&&id){await one('contracts',id);const changes=pick(data,['notes']);if('contract_status'in data)changes.contract_status=status(data.contract_status,true);if('commission_status'in data)changes.commission_status=status(data.commission_status);if('commission_amount'in data)changes.commission_amount=amount(data.commission_amount);return {message:'Contract updated',contract:contractDTO(await update('contracts',id,changes))};}
  }
  if(area==='finance'){
    if(method==='POST'&&id==='expenses'){
      if(!['SALARY','FOOD','DIALER','RENT','OTHER'].includes(String(data.category))||!data.description)throw new HttpError(400,'Choose an expense category and enter a description');
      const e=await insert('expenses',{category:data.category,description:data.description,amount:amount(data.amount),incurred_on:validDate(data.incurred_on),created_by_id:user.id});await audit(user,'EXPENSE_CREATED','EXPENSE',e.id,e.description);return {message:'Expense added',expense:e};
    }
    if(method==='GET'){
      const contracts=await all('contracts'),expenses=await all('expenses','',[],'incurred_on DESC'),salaries=await all('employee_salaries'),payouts=await all('employee_commission_payouts');
      const sum=(rows:Row[],field:string,s?:string)=>rows.filter(r=>!s||(r.commission_status||r.status)===s).reduce((n,r)=>n+Number(r[field]||0),0);
      const paid=sum(contracts,'commission_amount','PAID'),pending=sum(contracts,'commission_amount','PENDING'),total=sum(expenses,'amount');
      return {currency:'GBP',paid_commissions:paid,pending_commissions:pending,total_expenses:total,net_profit_loss:paid-total,projected_profit_loss:paid+pending-total,
        employee_salaries_paid_pkr:sum(salaries,'amount','PAID'),employee_salaries_pending_pkr:sum(salaries,'amount','PENDING'),employee_commissions_paid_pkr:sum(payouts,'amount_pkr','PAID'),employee_commissions_pending_pkr:sum(payouts,'amount_pkr','PENDING'),expenses:await Promise.all(expenses.slice(0,500).map(e=>relatedDTO('expenses',e)))};
    }
  }
  if(area==='employees'){
    if(method==='GET'&&!id){
      const month=period(params.get('period')||now().slice(0,7));const users=await all('users','deleted_at IS NULL AND is_active=?',[true]);
      const salaries=await all('employee_salaries','period=?',[month]),payouts=await all('employee_commission_payouts','period=?',[month]),stats=await all('employee_monthly_sales_stats','period=?',[month]),sales=(await all('employee_sales')).filter(s=>String(s.sale_date).slice(0,7)===month);
      const employees=[];for(const raw of users){const u=await userDTO(raw);if(!['agent','team_leader'].includes(u.role))continue;const ss=sales.filter(s=>s.employee_id===u.id),stat=stats.find(s=>s.employee_id===u.id);const sum=(field:string,statusValue?:string)=>ss.filter(s=>!statusValue||s.commission_status===statusValue).reduce((n,s)=>n+Number(s[field]),0);
        employees.push({id:u.id,name:u.full_name,username:u.username,role:u.role_display,role_key:u.role,salary:salaries.find(s=>s.employee_id===u.id)||null,commission_payout:payouts.find(s=>s.employee_id===u.id)||null,sales_count:stat?.sales_count??ss.length,sales_total_gbp:stat?.sales_amount_gbp??sum('sale_amount'),commission_earned_gbp:stat?.commission_amount_gbp??sum('commission_amount'),commission_paid_gbp:sum('commission_amount','PAID'),commission_pending_gbp:sum('commission_amount','PENDING'),sales_stats_uploaded:Boolean(stat)});}
      return {period:month,employees};
    }
    if(method==='GET'&&action==='activity'){
      const u=await employee(id),leads=(await all('customers','deleted_at IS NULL')).filter(c=>c.assigned_agent_id===id||c.created_by_id===id),ids=new Set(leads.map(c=>c.id));const callbacks=(await all('callbacks')).filter(c=>c.agent_id===id||ids.has(c.customer_id));
      return {agent:{id:u.id,name:u.full_name,username:u.username},leads:await Promise.all(leads.map(customerDTO)),callbacks:await Promise.all(callbacks.map(c=>relatedDTO('callbacks',c))),lead_count:leads.length,callback_count:callbacks.length};
    }
    if(['salaries','commissions'].includes(id)){
      const table=id==='salaries'?'employee_salaries':'employee_commission_payouts',key=id==='salaries'?'salary':'payout',field=id==='salaries'?'amount':'amount_pkr';
      if(method==='PATCH'&&action){await one(table,action);const record=await update(table,action,{status:status(data.status)});await audit(user,'PAYMENT_UPDATED',table,record.id,`Updated payment status to ${record.status}`);return {message:'Payment status updated',[key]:record};}
      if(method==='POST'){
        const u=await employee(data.employee_id),month=period(data.period);const existing=(await all(table,'employee_id=? AND period=?',[u.id,month]))[0];const input={employee_id:u.id,period:month,[field]:amount(data[field]),status:status(data.status),notes:String(data.notes||'').slice(0,500),created_by_id:user.id};
        const record=existing?await update(table,existing.id,input):await insert(table,input);await audit(user,'PAYMENT_SAVED',table,record.id,`Saved payment for ${u.full_name} (${month})`);return {message:'Payment saved in PKR',[key]:record};
      }
    }
    if(id==='sales-stats'&&action==='import'&&method==='POST'){
      const rows=csvRecords(await uploadedCSV(form!));const prepared:Row[]=[];const seen=new Set();
      for(const r of rows){const raw=(await all('users','username=?',[r.username]))[0];if(!raw)throw new HttpError(400,`Unknown employee ${r.username}`);const u=await employee(raw.id),month=period(r.period),key=`${u.id}:${month}`;if(seen.has(key))throw new HttpError(400,'Only one row per employee and month is allowed');seen.add(key);const count=Number(r.sales_count);if(!Number.isInteger(count)||count<0)throw new HttpError(400,'Sales count must be a non-negative integer');prepared.push({employee_id:u.id,period:month,sales_count:count,sales_amount_gbp:amount(r.sales_amount_gbp),commission_amount_gbp:amount(r.commission_amount_gbp),imported_by_id:user.id,imported_at:now()});}
      for(const r of prepared){const old=(await all('employee_monthly_sales_stats','employee_id=? AND period=?',[r.employee_id,r.period]))[0];if(old)await update('employee_monthly_sales_stats',old.id,r);else await insert('employee_monthly_sales_stats',r);}
      return {message:`Imported statistics for ${prepared.length} employees`,count:prepared.length};
    }
    if(id==='sales'){
      if(method==='GET'){const month=params.get('period');if(month)period(month);const rows=(await all('employee_sales','',[],'sale_date DESC')).filter(s=>!month||String(s.sale_date).slice(0,7)===month);return {sales:await Promise.all(rows.slice(0,500).map(async s=>({...s,employee_name:(await one('users',s.employee_id)).full_name})))};}
      if(method==='PATCH'&&action)return {message:'Sale updated',sale:await update('employee_sales',action,{commission_status:status(data.commission_status)})};
      if(method==='POST'){await employee(data.employee_id);if(!data.customer_name||!data.business_name)throw new HttpError(400,'Customer and business names are required');const sale=await insert('employee_sales',{...pick(data,['employee_id','customer_name','business_name','notes']),sale_amount:amount(data.sale_amount),commission_amount:amount(data.commission_amount),commission_status:status(data.commission_status),sale_date:validDate(data.sale_date),created_by_id:user.id});await audit(user,'EMPLOYEE_SALE_CREATED','EMPLOYEE_SALE',sale.id,'Employee sale recorded');return {message:'Sale recorded',sale};}
    }
  }
  throw new HttpError(404,'Endpoint not found');
}
