import { all, one, insert, update, HttpError, type Row } from './db';
import { canAccess, customerFor, permission, teamIDs, audit } from './auth';
export const now=()=>new Date().toISOString();
export const pick=(data:Row,keys:string[])=>Object.fromEntries(keys.filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));
export const customerFields=['first_name','last_name','full_name','company_name','phone','secondary_phone','email','address','city','postcode','country','industry','customer_type','lead_source','previous_provider','lead_status','priority','notes','custom_fields'];
export async function customerDTO(c: Row) {
  const users=await all('users'); const teams=await all('teams');
  const team=teams.find(t=>t.id===c.assigned_team_id);
  const name=(id:string)=>users.find(u=>u.id===id)?.full_name ?? null;
  return {...c,tags:c.tags_list||[],custom_fields:c.custom_fields||{},closing_details:c.custom_fields?.closing_details,
    assigned_team_name:team?.name,assigned_agent_name:name(c.assigned_agent_id),created_by_name:name(c.created_by_id),
    team_leader_id:team?.team_leader_id,team_leader_name:name(team?.team_leader_id)};
}
export async function scopedCustomers(user:Row) {
  const rows=await all('customers','deleted_at IS NULL',[],'updated_at DESC');
  const result:Row[]=[]; for(const c of rows) if(await canAccess(user,c)) result.push(c); return result;
}
export function pageRows(rows:Row[],params:URLSearchParams,key:string):Row {
  const page=Math.max(1,Number(params.get('page'))||1), per_page=Math.min(500,Math.max(1,Number(params.get('per_page'))||20));
  return {[key]:rows.slice((page-1)*per_page,page*per_page),page,per_page,total:rows.length,pages:Math.ceil(rows.length/per_page)};
}
export async function duplicates(user:Row,data:Row) {
  const phone=(v:any)=>String(v||'').replace(/\D/g,'').replace(/^44(?=\d{10}$)/,'0');
  return (await scopedCustomers(user)).filter(c=>c.id!==data.exclude_id && (
    (phone(data.phone).length>=7&&[c.phone,c.secondary_phone].some(p=>phone(p)===phone(data.phone)))||
    ['email','company_name'].some(k=>data[k]&&String(c[k]||'').trim().toLowerCase()===String(data[k]).trim().toLowerCase())));
}
export async function createCustomer(user:Row,data:Row) {
  permission(user,'customers.create');
  const full_name=String(data.full_name||`${data.first_name||''} ${data.last_name||''}`).trim();
  if(!full_name||!String(data.phone||'').trim())throw new HttpError(400,'Customer name and phone number are required');
  if(!data.force){const d=await duplicates(user,data);if(d.length)throw new HttpError(409,'Potential existing customer found',{duplicates:await Promise.all(d.map(customerDTO))});}
  let team_id=user.team_id,agent_id=user.id;
  if(user.role!=='agent'){
    team_id=data.assigned_team_id||team_id;agent_id=data.assigned_agent_id||null;
    if(user.role==='team_leader'&&!(await teamIDs(user)).includes(team_id))throw new HttpError(403,'Select a team you manage');
    if(agent_id){const a=await one('users',agent_id);if(!a.is_active||a.deleted_at)throw new HttpError(400,'Choose an active agent');
      if(team_id&&!(await all('team_members','team_id=? AND user_id=?',[team_id,agent_id])).length)throw new HttpError(400,'Agent must belong to the selected team');}
  }
  const c=await insert('customers',{...pick(data,customerFields),full_name,phone:String(data.phone).trim(),
    tags_list:data.tags||[],assigned_team_id:team_id||null,assigned_agent_id:agent_id||null,created_by_id:user.id,updated_by_id:user.id});
  await insert('conversations',{customer_id:c.id,agent_id:user.id,interaction_type:'LEAD_CREATED',summary:`Lead created by ${user.full_name}`,notes:data.notes||''});
  await audit(user,'CUSTOMER_CREATED','CUSTOMER',c.id,`Created lead ${full_name}`);
  if(data.assign_to_team_lead===true)await assign(user,{customer_id:c.id},'assign-to-leader');
  return one('customers',c.id);
}
export async function relatedDTO(table:string,r:Row){
  const c=r.customer_id?(await all('customers','id=?',[r.customer_id]))[0]:null;
  const users=await all('users');const name=(id:string)=>users.find(u=>u.id===id)?.full_name||null;
  const teams=await all('teams');const team=teams.find(t=>t.id===(r.team_id||c?.assigned_team_id));
  const result:Row={...r,customer_name:c?.full_name,customer_company:c?.company_name,customer_phone:c?.phone,
    agent_name:name(r.agent_id),created_by_name:name(r.created_by_id),team_name:team?.name,
    from_user_name:name(r.from_user_id),to_user_name:name(r.to_user_id),assigned_by_name:name(r.assigned_by_id),
    from_agent_name:name(r.from_agent_id),resolved_by_name:name(r.resolved_by_id),user_name:name(r.user_id),
    from_team_name:teams.find(t=>t.id===r.from_team_id)?.name,to_team_name:teams.find(t=>t.id===r.to_team_id)?.name};
  if(table==='calls')result.duration_formatted=`${String(Math.floor(r.duration_seconds/60)).padStart(2,'0')}:${String(r.duration_seconds%60).padStart(2,'0')}`;
  if(table==='callbacks')Object.assign(result,{is_today:String(r.scheduled_at).slice(0,10)===now().slice(0,10),is_overdue:r.status==='PENDING'&&new Date(r.scheduled_at).getTime()<Date.now(),scheduled_formatted:new Date(r.scheduled_at).toLocaleString('en-GB',{timeZone:'UTC'})});
  return result;
}
export async function schedule(user:Row,data:Row){
  permission(user,'callbacks.create');const c=await customerFor(user,data.customer_id);
  const scheduled_at=new Date(data.scheduled_at);if(!Number.isFinite(scheduled_at.getTime())||!data.reason)throw new HttpError(400,'Valid callback date and reason are required');
  let agent_id=user.id;if(user.role!=='agent'&&data.agent_id){
    const agent=await one('users',data.agent_id);if(!agent.is_active||agent.deleted_at)throw new HttpError(400,'Choose an active agent');
    if(user.role!=='super_admin'&&!(await all('team_members','user_id=? AND team_id=?',[agent.id,c.assigned_team_id])).length)throw new HttpError(403,'Agent must belong to the customer team');agent_id=agent.id;
  }
  const cb=await insert('callbacks',{...pick(data,['reason','priority','notes','reminder_minutes']),customer_id:c.id,agent_id,created_by_id:user.id,team_id:c.assigned_team_id,scheduled_at:scheduled_at.toISOString()});
  await update('customers',c.id,{next_callback_date:cb.scheduled_at,updated_by_id:user.id});
  await insert('conversations',{customer_id:c.id,agent_id:user.id,interaction_type:'CALLBACK_SCHEDULED',summary:`Callback scheduled: ${data.reason}`,callback_info:cb.scheduled_at});return cb;
}
export async function logCall(user:Row,data:Row){
  permission(user,'calls.create');const c=await customerFor(user,data.customer_id);
  const duration=Number(data.duration_seconds||0);if(!Number.isInteger(duration)||duration<0)throw new HttpError(400,'Duration must be a positive number of seconds');
  const call=await insert('calls',{...pick(data,['call_type','outcome','notes','next_action','callback_date','callback_time','telephony_session_id']),duration_seconds:duration,
    outcome:data.outcome||'No Answer',customer_id:c.id,agent_id:user.id,team_id:user.team_id||c.assigned_team_id});
  const outcome=String(call.outcome).toUpperCase().replaceAll('_',' ');
  const status=outcome.includes('NOT INTEREST')?'NOT_INTERESTED':outcome.includes('CONVERT')?'CONVERTED':outcome.includes('INTEREST')?'INTERESTED':outcome.includes('WRONG NUMBER')?'WRONG_NUMBER':outcome.includes('DO NOT CALL')?'DO_NOT_CONTACT':'CONTACTED';
  await update('customers',c.id,{last_contact_date:now(),last_contacted_by_id:user.id,updated_by_id:user.id,lead_status:status,...(status==='CONVERTED'?{customer_type:'Customer'}:{})});
  const conversation=await insert('conversations',{customer_id:c.id,agent_id:user.id,call_id:call.id,interaction_type:'CALL',outcome:call.outcome,summary:call.notes||`Call completed: ${call.outcome}`,next_action:call.next_action});
  if(data.callback_date&&data.callback_time)await schedule(user,{customer_id:c.id,scheduled_at:`${data.callback_date}T${data.callback_time}`,reason:data.callback_reason||`Follow-up after call (${call.outcome})`,notes:data.notes});
  await audit(user,'CALL_LOGGED','CALL',call.id,`Logged call for ${c.full_name}`);return {call,conversation};
}
export async function assign(user:Row,data:Row,action:string){
  permission(user,action==='transfer'?'leads.transfer':'leads.assign');const c=await customerFor(user,data.customer_id);
  if(action==='transfer'){
    const team=await one('teams',data.target_team_id);if(team.deleted_at||!team.is_active)throw new HttpError(400,'Target team is unavailable');
    const transfer=await insert('lead_transfers',{customer_id:c.id,from_agent_id:user.id,target_type:'team',target_id:team.id,reason:data.reason||'Cross-team transfer',notes:data.notes});
    await audit(user,'LEAD_TRANSFER_REQUESTED','CUSTOMER',c.id,`Transfer requested to ${team.name}`);return {transfer};
  }
  const team=await one('teams',action==='assign-to-leader'?(c.assigned_team_id||user.team_id):(data.team_id||data.target_team_id||c.assigned_team_id));
  let target_id=c.assigned_agent_id;
  if(action==='assign-to-leader') {if(!team.team_leader_id)throw new HttpError(400,'No Team Leader configured for this team');}
  else{
    if(user.role==='agent')throw new HttpError(403,'A team leader must reassign leads');
    if(user.role==='team_leader'&&!(await teamIDs(user)).includes(team.id))throw new HttpError(403,'Cannot reassign outside your teams');
    target_id=data.agent_id||data.target_agent_id||null;
    if(target_id){const target=await one('users',target_id);if(!target.is_active||target.deleted_at||!(await all('team_members','user_id=? AND team_id=?',[target_id,team.id])).length)throw new HttpError(400,'Select an active member of the target team');}
  }
  const assignment=await insert('lead_assignments',{customer_id:c.id,from_user_id:c.assigned_agent_id,to_user_id:action==='assign-to-leader'?team.team_leader_id:target_id,
    from_team_id:c.assigned_team_id,to_team_id:team.id,assigned_by_id:user.id,reason:data.reason,notes:data.notes,priority:data.priority||c.priority,
    status:action==='assign-to-leader'?'PENDING_LEADER_REVIEW':'ACCEPTED'});
  await update('customers',c.id,{assigned_team_id:team.id,assigned_agent_id:target_id,updated_by_id:user.id});
  await insert('conversations',{customer_id:c.id,agent_id:user.id,interaction_type:action==='assign-to-leader'?'ASSIGNED_TO_LEADER':'LEAD_REASSIGNED',summary:action==='assign-to-leader'?`Lead shared with Team Lead by ${user.full_name}`:`Lead reassigned by ${user.full_name}. ${data.reason||''}`,notes:data.notes});
  await audit(user,'LEAD_ASSIGNED','CUSTOMER',c.id,`Lead ${action} by ${user.full_name}`);return {assignment};
}
