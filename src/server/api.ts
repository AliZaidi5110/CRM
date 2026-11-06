import { randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { all, one, insert, update, query, transaction, databaseReady, cloud, HttpError, type Row } from './db';
import { actor, login, userDTO, permission, admin, customerFor, canAccess, teamIDs, audit, bcrypt } from './auth';
import { customerDTO, scopedCustomers, pageRows, duplicates, createCustomer, relatedDTO, schedule, logCall, assign, pick, customerFields, now } from './records';
import { adminRoute, uploadedCSV } from './admin';
import { report } from './reports';
import rebuttals from './rebuttals.json';

async function teamDTO(team:Row){
  const members=await all('team_members','team_id=?',[team.id]);const users=await all('users');
  return {...team,team_leader_name:users.find(u=>u.id===team.team_leader_id)?.full_name,member_count:members.length,
    members:await Promise.all(members.map(async m=>({...m,...await userDTO(await one('users',m.user_id)),user_id:m.user_id,user_name:(await one('users',m.user_id)).full_name,is_primary:m.is_primary}))) };
}
async function primaryMembership(user_id:string,team_id:string|null){
  if(team_id)await one('teams',team_id);
  const existing=await all('team_members','user_id=?',[user_id]);
  for(const m of existing)if(m.is_primary)await update('team_members',m.id,{is_primary:false});
  if(team_id){const found=existing.find(m=>m.team_id===team_id);if(found)await update('team_members',found.id,{is_primary:true});else await insert('team_members',{team_id,user_id,is_primary:true});}
}
async function usersRoute(user:Row,id:string,action:string,method:string,data:Row,params:URLSearchParams){
  if(id==='roles'&&method==='GET')return {roles:await all('roles')};
  if(method==='GET'){
    permission(user,'users.view');if(id)return {user:await userDTO(await one('users',id))};
    let rows=await all('users','deleted_at IS NULL',[],'full_name ASC');
    const dtos=await Promise.all(rows.map(userDTO));const filtered=dtos.filter(u=>(!params.get('role')||u.role===params.get('role'))&&(!params.get('team_id')||u.team_id===params.get('team_id'))&&(!params.get('search')||`${u.full_name} ${u.username}`.toLowerCase().includes(params.get('search')!.toLowerCase())));
    return {users:filtered,total:filtered.length};
  }
  permission(user,method==='POST'&&!id?'users.create':'users.edit');
  let row=id?await one('users',id):null;
  if(action==='toggle-status'){
    if(id===user.id)throw new HttpError(400,'You cannot deactivate your own account');
    row=await update('users',id,{is_active:!row!.is_active});
  }else if(action==='reset-password'){
    if(String(data.new_password||'').length<6)throw new HttpError(400,'Password must contain at least 6 characters');
    row=await update('users',id,{password_hash:await bcrypt.hash(data.new_password,12),failed_login_count:0,locked_until:null});
  }else{
    const input=pick(data,['username','email','full_name','phone','is_active']);
    if(data.role||!id){const role=(await all('roles','name=?',[data.role||'agent']))[0];if(!role)throw new HttpError(400,'Invalid role');input.role_id=role.id;}
    if(!id){if(!data.username||!data.full_name||!data.email||String(data.password||'').length<6)throw new HttpError(400,'Name, username, email and a password of at least 6 characters are required');input.password_hash=await bcrypt.hash(data.password,12);row=await insert('users',input);}
    else row=await update('users',id,input);
    if('team_id'in data)await primaryMembership(row!.id,data.team_id||null);
  }
  await audit(user,'USER_UPDATED','USER',row!.id,`Updated user ${row!.username}`);return {message:'User saved',user:await userDTO(row!)};
}
async function teamsRoute(user:Row,id:string,action:string,member_id:string,method:string,data:Row){
  if(method==='GET')return id?{team:await teamDTO(await one('teams',id))}:{teams:await Promise.all((await all('teams','deleted_at IS NULL',[],'name ASC')).map(teamDTO))};
  permission(user,id?'teams.edit':'teams.create');
  if(action==='members'){
    await one('teams',id);
    if(method==='DELETE')await query('DELETE FROM team_members WHERE team_id=? AND user_id=?',[id,member_id]);
    else{await one('users',data.user_id);await primaryMembership(data.user_id,id);}
    return {message:'Team membership updated',team:await teamDTO(await one('teams',id))};
  }
  if(!id&&!String(data.name||'').trim())throw new HttpError(400,'Team name is required');
  if(data.team_leader_id){const leader=await userDTO(await one('users',data.team_leader_id));if(!leader.is_active||!['team_leader','super_admin'].includes(leader.role))throw new HttpError(400,'Choose an active team leader');}
  const input=pick(data,['name','description','team_leader_id','is_active']);
  const team=id?await update('teams',id,input):await insert('teams',input);
  for(const uid of [...(data.agent_ids||[]),...(data.team_leader_id?[data.team_leader_id]:[])]){await one('users',uid);await primaryMembership(uid,team.id);}
  await audit(user,'TEAM_UPDATED','TEAM',team.id,`Saved team ${team.name}`);return {message:'Team saved',team:await teamDTO(team)};
}
async function closeDeal(user:Row,c:Row,data:Row){
  permission(user,'customers.edit');const business=data.business_details||{},personal=data.personal_details||{},bank=data.bank_details||{},plan=data.selected_plan||{};
  const business_name=String(business.business_name||c.company_name||'').trim(),full_name=String(personal.full_name||c.full_name||'').trim(),mobile=String(personal.mobile_number||c.phone||'').trim();
  if(!business_name||!full_name||!mobile||!bank.bank_name||!bank.account_title)throw new HttpError(400,'Business, signatory, mobile and bank details are required');
  const sort=String(bank.sort_code||'').replace(/\D/g,''),account=String(bank.account_number||'').replace(/\D/g,'');if(sort.length!==6||account.length!==8)throw new HttpError(400,'Sort code must have 6 digits and account number 8 digits');
  const closing={business:{entity_type:'Sole Trader',business_address:c.address||'',...business,business_name},personal:{email:c.email||'',...personal,full_name,mobile_number:mobile},bank:{...bank,sort_code:`${sort.slice(0,2)}-${sort.slice(2,4)}-${sort.slice(4)}`,account_number:account,account_number_masked:`••••${account.slice(-4)}`},plan:{provider_plan:'Shift4',monthly_turnover:0,debit_rate:.7,credit_rate:.7,terminal_rental:0,...plan},closed_at:now(),closed_by_id:user.id,closed_by_name:user.full_name};
  const updated=await update('customers',c.id,{company_name:business_name,full_name,phone:mobile,email:personal.email||c.email,lead_status:'CONVERTED',customer_type:'Customer',custom_fields:{...c.custom_fields,closing_details:closing},updated_by_id:user.id});
  await insert('conversations',{customer_id:c.id,agent_id:user.id,interaction_type:'DEAL_CLOSED',summary:`Deal closed for ${business_name} by ${user.full_name}`});await audit(user,'DEAL_CLOSED','CUSTOMER',c.id,`Closed merchant deal for ${business_name}`);return {message:'Deal successfully closed',customer:await customerDTO(updated),closing_details:closing};
}
async function customersRoute(user:Row,id:string,action:string,method:string,data:Row,params:URLSearchParams){
  if(method==='GET'&&id==='statuses')return {statuses:await all('lead_statuses','',[],'sort_order ASC')};
  if(method==='GET'&&id==='tags')return {tags:await all('tags','',[],'name ASC')};
  if(method==='POST'&&id==='check-duplicate'){const d=await duplicates(user,data);return {has_duplicates:Boolean(d.length),duplicates:await Promise.all(d.map(customerDTO))};}
  if(!id&&method==='GET'){
    let rows=await scopedCustomers(user);const search=(params.get('search')||'').trim().toLowerCase();
    rows=rows.filter(c=>(!search||['full_name','phone','company_name','email','postcode','code'].some(k=>String(c[k]||'').toLowerCase().includes(search)))&&
      ['lead_status','priority','industry','lead_source'].every(k=>!params.get(k)||c[k]===params.get(k))&&(!params.get('team_id')||c.assigned_team_id===params.get('team_id'))&&(!params.get('agent_id')||c.assigned_agent_id===params.get('agent_id'))&&(!params.get('tag')||(c.tags_list||[]).includes(params.get('tag'))));
    const result=pageRows(rows,params,'customers');result.customers=await Promise.all(result.customers.map(customerDTO));result.items=result.customers;return result;
  }
  if(!id&&method==='POST')return {message:'Lead created successfully',visible_to_admin:true,customer:await customerDTO(await createCustomer(user,data))};
  const c=await customerFor(user,id);
  if(action==='close-deal'&&method==='POST')return closeDeal(user,c,data);
  if(action==='closing-details'&&method==='GET')return {has_closed_deal:Boolean(c.custom_fields?.closing_details),closing_details:c.custom_fields?.closing_details||null};
  if(method==='GET'){
    const result:Row={customer:await customerDTO(c)};
    for(const [key,table]of Object.entries({calls:'calls',callbacks:'callbacks',conversations:'conversations',assignments:'lead_assignments'}))result[key]=await Promise.all((await all(table,'customer_id=?',[id],'created_at DESC')).map(r=>relatedDTO(table,r)));return result;
  }
  permission(user,method==='DELETE'?'customers.delete':'customers.edit');
  if(method==='DELETE'){await update('customers',id,{deleted_at:now()});await audit(user,'CUSTOMER_SOFT_DELETED','CUSTOMER',id,`Moved ${c.full_name} to trash`);return {message:'Customer moved to trash'};}
  if(method==='PUT'){
    const changes={...pick(data,customerFields),updated_by_id:user.id,...('tags'in data?{tags_list:data.tags}:{})};
    if(data.lead_status&&data.lead_status!==c.lead_status)await insert('conversations',{customer_id:id,agent_id:user.id,interaction_type:'STATUS_CHANGED',summary:`Lead status changed from ${c.lead_status} to ${data.lead_status} by ${user.full_name}`});
    const updated=await update('customers',id,changes);await audit(user,'CUSTOMER_UPDATED','CUSTOMER',id,`Updated customer ${c.full_name}`);return {message:'Customer updated',customer:await customerDTO(updated)};
  }
  throw new HttpError(405,'Method not allowed');
}
async function callsRoute(user:Row,id:string,method:string,data:Row,params:URLSearchParams){
  if(id==='dispositions'){
    if(method==='GET')return {dispositions:await all('call_dispositions','',[],'sort_order ASC')};
    permission(user,'settings.manage');if(!data.name||!data.code)throw new HttpError(400,'Name and code required');return {disposition:await insert('call_dispositions',pick(data,['name','code','category','color','is_conversion','is_callback']))};
  }
  if(method==='POST'){const result=await logCall(user,data);return {message:'Call logged',call:await relatedDTO('calls',result.call),conversation:result.conversation};}
  const customers=await scopedCustomers(user),ids=new Set(customers.map(c=>c.id));
  const rows=(await all('calls','',[],'created_at DESC')).filter(c=>ids.has(c.customer_id)&&(!params.get('customer_id')||c.customer_id===params.get('customer_id'))&&(!params.get('agent_id')||c.agent_id===params.get('agent_id'))&&(!params.get('outcome')||c.outcome===params.get('outcome')));
  const result=pageRows(rows,params,'calls');result.calls=await Promise.all(result.calls.map((r:Row)=>relatedDTO('calls',r)));return result;
}
async function callbacksRoute(user:Row,id:string,action:string,method:string,data:Row):Promise<Row>{
  if(method==='POST'&&action==='complete'){
    permission(user,'callbacks.edit');const cb=await one('callbacks',id);await customerFor(user,cb.customer_id);
    const updated=await update('callbacks',id,{status:'COMPLETED',completed_at:now(),completed_by_id:user.id,notes:[cb.notes,data.notes?`Resolution: ${data.notes}`:''].filter(Boolean).join('\n')});
    const pending=await all('callbacks','customer_id=? AND status=? AND id<>?',[cb.customer_id,'PENDING',id],'scheduled_at ASC');await update('customers',cb.customer_id,{next_callback_date:pending[0]?.scheduled_at||null});await audit(user,'CALLBACK_COMPLETED','CALLBACK',id,'Callback completed');return {message:'Callback completed',callback:await relatedDTO('callbacks',updated)};
  }
  if(method==='POST')return {message:'Callback scheduled',callback:await relatedDTO('callbacks',await schedule(user,data))};
  const ids=new Set((await scopedCustomers(user)).map(c=>c.id));
  const rows=await Promise.all((await all('callbacks','',[],'scheduled_at ASC')).filter(c=>ids.has(c.customer_id)).map(c=>relatedDTO('callbacks',c)));
  const grouped:Row={today:[],overdue:[],upcoming:[],completed:[]};for(const r of rows)grouped[r.status!=='PENDING'?'completed':r.is_overdue?'overdue':r.is_today?'today':'upcoming'].push(r);
  return {...grouped,counts:{today:grouped.today.length,overdue:grouped.overdue.length,upcoming:grouped.upcoming.length,completed:grouped.completed.length,total_pending:grouped.today.length+grouped.overdue.length+grouped.upcoming.length}};
}
function quote(data:Row){
  const turnover=Number(data.turnover||0),rate=Number(data.current_rate??1.75),rental=Number(data.current_rental??25),transactions=Number(data.transactions_count??(turnover?Math.floor(turnover/25):100));
  if([turnover,rate,rental,transactions].some(n=>!Number.isFinite(n)||n<0))throw new HttpError(400,'Enter valid non-negative values');
  const current=turnover*rate/100+rental,srate=turnover<5000?1.25:.7,shift=turnover*srate/100,mypos=turnover*.7*.0032+turnover*.3*.0066+transactions*.03+25;
  const round=(n:number)=>Math.round(n*100)/100;
  return {inputs:{turnover,current_provider:data.current_provider||'Competitor',current_rate:rate,current_rental:rental,transactions_count:transactions},current_provider:{provider_name:data.current_provider||'Competitor',rate_percent:rate,monthly_rental:rental,monthly_cost:round(current),annual_cost:round(current*12)},
    shift4:{plan_name:'Shift4',applied_rate:srate,tier_description:turnover<5000?'1.25% Standard (<£5k)':'0.70% Volume Tier (≥£5k)',monthly_rental:0,monthly_cost:round(shift),annual_cost:round(shift*12),monthly_savings:round(Math.max(0,current-shift)),annual_savings:round(Math.max(0,(current-shift)*12)),pitch_script:`Estimated annual savings: £${round(Math.max(0,(current-shift)*12))}`},
    mypos:{plan_name:'myPOS',debit_rate:.32,credit_rate:.66,auth_fee:.03,auth_pence:3,contract_months:18,monthly_rental:25,monthly_cost:round(mypos),annual_cost:round(mypos*12),annual_savings:round(Math.max(0,(current-mypos)*12))}};
}
async function summarize(user:Row,customer_id:string){
  const c=await customerFor(user,customer_id),calls=await all('calls','customer_id=?',[c.id]),history=await all('conversations','customer_id=?',[c.id]);
  const notes=[...calls.map(c=>c.notes),...history.map(c=>c.summary)].filter(Boolean).join(' ').toLowerCase();
  const provider=c.previous_provider||['Worldpay','Barclays','Stripe','Zettle','Square','Clover','Tyl','Elavon'].find(p=>notes.includes(p.toLowerCase()))||'Unknown';
  const summary=`${c.full_name} (${c.company_name||'Independent Merchant'}) is ${c.lead_status}. ${calls.length} calls and ${history.length} interactions recorded.`;
  return {customer_id:c.id,customer_name:c.full_name,company:c.company_name,status:c.lead_status,provider_detected:provider,intent:c.lead_status,pricing_sensitive:/rate|price|monthly|£/.test(notes),ai_summary:summary,recommended_next_action:c.lead_status==='INTERESTED'?'Present a tailored comparison against the current provider.':'Review customer history and schedule the next follow-up.',total_calls:calls.length,total_interactions:history.length};
}
export async function dispatch(user:Row,path:string[],method:string,data:Row,params:URLSearchParams,form:FormData|null):Promise<any>{
  const [resource,id,action,detail]=path;
  if(resource==='auth'){
    if(id==='me'&&method==='GET')return {user};
    if(id==='logout'&&method==='POST'){await audit(user,'LOGOUT','USER',user.id,'User logged out');return {message:'Logged out successfully'};}
    if(id==='change-password'&&method==='POST'){if(String(data.new_password||'').length<6)throw new HttpError(400,'New password must be at least 6 characters');const u=await one('users',user.id);if(!await bcrypt.compare(data.current_password||'',u.password_hash))throw new HttpError(403,'Current password is incorrect');await update('users',user.id,{password_hash:await bcrypt.hash(data.new_password,12)});return {message:'Password updated successfully'};}
  }
  if(resource==='users')return usersRoute(user,id,action,method,data,params);
  if(resource==='teams')return teamsRoute(user,id,action,detail,method,data);
  if(resource==='customers')return customersRoute(user,id,action,method,data,params);
  if(resource==='calls')return callsRoute(user,id,method,data,params);
  if(resource==='callbacks')return callbacksRoute(user,id,action,method,data);
  if(resource==='admin')return adminRoute(user,path.slice(1),method,data,form,params);
  if(resource==='assignments'){
    if(id==='pending'&&method==='GET')return {pending:user.role==='agent'?[]:await Promise.all((await all('lead_assignments','status=?',['PENDING_LEADER_REVIEW'],'created_at DESC')).filter(a=>user.role==='super_admin'||a.to_user_id===user.id).map(a=>relatedDTO('lead_assignments',a)))};
    if(['assign-to-leader','reassign','transfer'].includes(id)&&method==='POST')return {message:'Lead assignment updated',...await assign(user,data,id)};
  }
  if(resource==='audit'&&method==='GET'){
    permission(user,'audit.view');const rows=(await all('audit_logs','',[],'created_at DESC')).filter(r=>['action','entity_type','user_id'].every(k=>!params.get(k)||r[k]===params.get(k))&&(!params.get('search')||`${r.summary} ${r.action}`.toLowerCase().includes(params.get('search')!.toLowerCase())));const result=pageRows(rows,params,'logs');result.logs=await Promise.all(result.logs.map((r:Row)=>relatedDTO('audit_logs',r)));return result;
  }
  if(resource==='reports'){
    if(id==='export'&&method==='POST'){
      permission(user,'reports.export');const rows=await scopedCustomers(user),keys=['code','full_name','company_name','phone','email','postcode','industry','lead_status','priority','lead_source'];
      const csv=(v:any)=>`"${String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')}"`;
      return new Response([keys.join(','),...rows.map(r=>keys.map(k=>csv(r[k])).join(','))].join('\r\n'),{headers:{'Content-Type':'text/csv','Content-Disposition':'attachment; filename=crm_export.csv'}});
    }
    if(method==='GET'){
      let target=user;if(id!=='dashboard')permission(user,'reports.view');
      if(id==='admin'&&user.role!=='super_admin')throw new HttpError(403,'Administrator report required');
      if(id==='agent'){const u=await userDTO(await one('users',action));if(user.role!=='super_admin'&&!(await teamIDs(user)).includes(u.team_id))throw new HttpError(403,'Cannot view other agent reports');target=u;}
      if(id==='team'){const t=await one('teams',action);if(user.role!=='super_admin'&&!(await teamIDs(user)).includes(t.id))throw new HttpError(403,'Cannot view other team reports');target={...user,role:'team_leader',team_id:t.id,id:t.team_leader_id||user.id};}
      return report(target,params.get('range')||'today');
    }
  }
  if(resource==='rebuttals'){
    if(id==='calculate'&&method==='POST')return quote(data);
    if(method==='GET')return {rebuttals:rebuttals.REBUTTALS_DATA,call_flows:{...rebuttals.CALL_FLOWS,opening:{...rebuttals.CALL_FLOWS.opening,raw_template:rebuttals.CALL_FLOWS.opening.script,script:rebuttals.CALL_FLOWS.opening.script.replace('{agent_name}',user.full_name.split(' ')[0])}},pricing_plans:rebuttals.PRICING_PLANS};
  }
  if(resource==='telephony'&&method==='POST'){
    if(id==='call'){const c=await customerFor(user,data.customer_id);if(!data.phone)throw new HttpError(400,'Phone number required');return {session_id:`MOCK-${randomUUID()}`,status:'IN_PROGRESS',phone:c.phone,started_at:now(),driver:'MOCK_VOIP',message:'Simulated call. No real telephone connection is made.'};}
    if(id==='hangup'){if(!data.session_id)throw new HttpError(400,'Session ID required');return {session_id:data.session_id,status:'COMPLETED',duration_seconds:0,ended_at:now()};}
  }
  if(resource==='ai'&&method==='POST'){
    if(id==='summarize')return summarize(user,data.customer_id);
    if(id==='query'){
      if(!data.query)throw new HttpError(400,'Query text required');const search=String(data.query).toLowerCase().trim();
      if(search.includes('callback')){const grouped=await callbacksRoute(user,'','','GET',{}),key=search.includes('overdue')?'overdue':'today';return {success:true,intent:'QUERY_CALLBACKS',response:`Found ${grouped[key].length} ${key} callbacks.`,data:grouped[key]};}
      let customers=await scopedCustomers(user);
      if(search.startsWith('summarize ')){const name=search.slice(10);const c=customers.find(c=>`${c.full_name} ${c.company_name}`.toLowerCase().includes(name));if(!c)return {success:false,response:'No accessible customer matched your search.'};const s=await summarize(user,c.id);return {success:true,intent:'SUMMARIZE_CUSTOMER',response:s.ai_summary,data:s};}
      if(search.includes('interested'))customers=customers.filter(c=>c.lead_status==='INTERESTED');
      else if(search.includes('my lead')||search.includes('assigned to me'))customers=customers.filter(c=>c.assigned_agent_id===user.id);
      else customers=customers.filter(c=>`${c.full_name} ${c.company_name} ${c.phone}`.toLowerCase().includes(search));
      return {success:true,intent:'GENERAL_SEARCH',response:`Found ${customers.length} matching records in your authorized scope.`,data:await Promise.all(customers.slice(0,20).map(customerDTO))};
    }
  }
  if(resource==='sync')return syncRoute(user,path,method,data,params,form);
  throw new HttpError(404,'Endpoint not found');
}

async function syncRoute(user:Row,path:string[],method:string,data:Row,params:URLSearchParams,form:FormData|null):Promise<any>{
  if(path[1]==='bootstrap'&&method==='GET')return {customers:await Promise.all((await scopedCustomers(user)).slice(0,500).map(customerDTO)),statuses:await all('lead_statuses'),dispositions:await all('call_dispositions'),tags:await all('tags'),teams:await all('teams','deleted_at IS NULL'),user};
  if(path[1]==='import'&&method==='POST'){
    permission(user,'customers.create');const text=await uploadedCSV(form!);
    let raw:string[][];try{raw=parse(text,{bom:true,skip_empty_lines:true});}catch{throw new HttpError(400,'Invalid CSV file');}
    if(raw.length>5001)throw new HttpError(400,'Import at most 5,000 rows');const headers=raw[0]||[];
    if(path[2]==='preview')return {headers,preview_rows:raw.slice(1,6),total_rows:Math.max(0,raw.length-1)};
    let mapping:Row;try{mapping=JSON.parse(String(form!.get('column_mapping')||'{}'));}catch{throw new HttpError(400,'Invalid column mapping');}
    let imported=0,duplicate=0,invalid=0,failed=0;const errors:string[]=[];
    for(const [index,row]of raw.slice(1).entries()){
      const payload:Row=Object.fromEntries(Object.entries(mapping).map(([field,header])=>[field,String(row[headers.indexOf(header)]||'').trim()]));
      if(!payload.full_name)payload.full_name=`${payload.first_name||''} ${payload.last_name||''}`.trim();
      if(!payload.full_name||!payload.phone){invalid++;errors.push(`Row ${index+2}: missing name or phone`);continue;}
      const d=await duplicates(user,payload);if(d.length){duplicate++;if(form!.get('duplicate_strategy')!=='create')continue;}
      try{await transaction(()=>createCustomer(user,{...payload,force:true,assigned_team_id:form!.get('team_id'),assigned_agent_id:form!.get('agent_id')}));imported++;}
      catch(e){failed++;errors.push(`Row ${index+2}: ${(e as Error).message}`);}
    }
    return {message:'Import completed',total_rows:Math.max(0,raw.length-1),imported_count:imported,duplicate_count:duplicate,invalid_count:invalid,failed_count:failed,error_summary:errors.slice(0,50)};
  }
  if(method==='POST'&&path.length===1){
    if(!Array.isArray(data.items)||data.items.length>500)throw new HttpError(400,'Send at most 500 sync items');
    const results:Row={processed:0,synced:[],conflicts:[],errors:[],id_mapping:{}};
    for(const item of data.items){
      try{
        if(!item.local_id)throw new HttpError(400,'Every sync item requires a local ID');
        const payload={...item.payload};let entity_id=results.id_mapping[item.entity_id]||item.entity_id;
        if(payload.customer_id)payload.customer_id=results.id_mapping[payload.customer_id]||payload.customer_id;
        let server_id:string,replayed=false;
        await transaction(async()=>{
          if(cloud())await query('SELECT pg_advisory_xact_lock(hashtext(?))',[`${user.id}:${item.local_id}`]);
          const existing=(await all('sync_queue','user_id=? AND local_id=? AND sync_status=?',[user.id,item.local_id,'SYNCED']))[0];
          if(existing){server_id=existing.server_id;replayed=true;return;}
          if(item.entity_type==='CUSTOMER'&&item.operation==='CREATE')server_id=(await createCustomer(user,payload)).id;
          else if(item.entity_type==='CUSTOMER'&&item.operation==='UPDATE'){
            permission(user,'customers.edit');const c=await customerFor(user,entity_id);
            if(item.client_timestamp&&new Date(c.updated_at).getTime()>new Date(item.client_timestamp).getTime()){
              results.conflicts.push({entity_id:c.id,reason:'Server record was modified while offline'});
              throw new HttpError(409,'Conflict detected. Server record preserved; review your offline changes.');
            }
            await update('customers',c.id,{...pick(payload,customerFields),updated_by_id:user.id});server_id=c.id;
          }else if(item.entity_type==='CALL')server_id=(await logCall(user,{...payload,customer_id:payload.customer_id||entity_id})).call.id;
          else if(item.entity_type==='CALLBACK')server_id=(await schedule(user,{...payload,customer_id:payload.customer_id||entity_id})).id;
          else if(item.entity_type==='NOTE'){permission(user,'customers.edit');const c=await customerFor(user,payload.customer_id||entity_id);server_id=(await insert('conversations',{customer_id:c.id,agent_id:user.id,interaction_type:'NOTE',summary:payload.note||payload.summary||'Note added offline',notes:payload.notes})).id;}
          else if(item.entity_type==='ASSIGNMENT')server_id=(await assign(user,{...payload,customer_id:payload.customer_id||entity_id},'assign-to-leader')).assignment!.id;
          else throw new HttpError(400,'Unsupported sync operation');
          await insert('sync_queue',{local_id:item.local_id,user_id:user.id,device_id:data.device_id||'web',operation:item.operation,entity_type:item.entity_type,entity_id:entity_id||null,payload,client_timestamp:item.client_timestamp,sync_status:'SYNCED',server_id:server_id!,processed_at:now()});
        });
        results.id_mapping[item.local_id]=server_id!;results.synced.push({local_id:item.local_id,server_id:server_id!,entity_type:item.entity_type,status:'SYNCED'});if(!replayed)results.processed++;
      }catch(e){results.errors.push({local_id:item.local_id,error:(e as Error).message});}
    }
    return {message:'Sync processing complete',results};
  }
  throw new HttpError(404,'Endpoint not found');
}

const allowedMethods=new Set(['GET','POST','PUT','PATCH','DELETE']);
export async function handle(request:Request,path:string[]):Promise<Response>{
  try{
    const params=new URL(request.url).searchParams;
    if(path[0]==='health')return Response.json({status:databaseReady()?'ready':'setup_required',framework:'Next.js',database:databaseReady(),authentication:!process.env.VERCEL||Boolean(process.env.JWT_SECRET_KEY)},{headers:{'Cache-Control':'no-store'}});
    if(!allowedMethods.has(request.method))throw new HttpError(405,'Method not allowed');
    if(!databaseReady())throw new HttpError(503,'Cloud database is not connected. Set DATABASE_URL to your Supabase PostgreSQL connection string.');
    let data:Row={},form:FormData|null=null;
    if(!['GET','HEAD'].includes(request.method)){
      const type=request.headers.get('content-type')||'';
      if(type.includes('multipart/form-data')){form=await request.formData();for(const [k,v]of form.entries())if(typeof v==='string')data[k]=v;}
      else{try{data=await request.json();}catch{throw new HttpError(400,'Request body must be valid JSON');}if(!data||typeof data!=='object'||Array.isArray(data))throw new HttpError(400,'Request body must be a JSON object');}
    }
    if(path.join('/')==='auth/login'&&request.method==='POST')return Response.json(await login(data),{headers:{'Cache-Control':'no-store'}});
    const user=await actor(request);
    const execute=()=>dispatch(user,path,request.method,data,params,form);
    const result=path[0]==='sync'?await execute():await transaction(execute);
    if(result instanceof Response)return result;
    const created=request.method==='POST'&&['customers','calls','calls/dispositions','callbacks','users','teams','admin/contracts','admin/contracts/import','admin/finance/expenses','admin/employees/sales','admin/employees/sales-stats/import'].includes(path.join('/'));
    return Response.json(result,{status:created?201:200,headers:{'Cache-Control':'no-store'}});
  }catch(e){
    if(e instanceof HttpError)return Response.json({error:e.message,message:e.message,...e.details},{status:e.status,headers:{'Cache-Control':'no-store'}});
    const error=e as Error&{code?:string};
    if(error.code==='23505'||/UNIQUE constraint failed/.test(error.message))return Response.json({error:'Conflict',message:'A record with these details already exists'},{status:409});
    console.error('CRM API error',error);
    const setup=/no such table|does not exist/.test(error.message);
    return Response.json({error:setup?'Database setup required':'Server error',message:setup?'Initialize or migrate the CRM database before signing in.':'The request could not be completed. Check server logs.'},{status:setup?503:500});
  }
}
