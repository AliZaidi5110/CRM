import { all, type Row } from './db';
import { scopedCustomers, relatedDTO } from './records';
import { teamIDs } from './auth';
export function dateBounds(range:string){
  const end=new Date();end.setUTCHours(23,59,59,999);const start=new Date();start.setUTCHours(0,0,0,0);
  if(range==='yesterday'){start.setUTCDate(start.getUTCDate()-1);end.setUTCDate(end.getUTCDate()-1);}
  else if(range==='this_week')start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));
  else if(range==='this_month')start.setUTCDate(1);
  else if(range!=='today')start.setUTCDate(start.getUTCDate()-30);
  return {start:start.getTime(),end:end.getTime()};
}
export async function report(user:Row,range='today'){
  const customers=await scopedCustomers(user),ids=new Set(customers.map(c=>c.id));
  const teams=await all('teams','deleted_at IS NULL'),users=await all('users','deleted_at IS NULL');
  const memberships=await all('team_members'),allowedTeams=await teamIDs(user);
  const calls=(await all('calls')).filter(c=>user.role==='super_admin'||(user.role==='team_leader'?allowedTeams.includes(c.team_id):c.agent_id===user.id));
  const bounds=dateBounds(range),period=calls.filter(c=>new Date(c.created_at).getTime()>=bounds.start&&new Date(c.created_at).getTime()<=bounds.end);
  const callbacks=(await all('callbacks')).filter(c=>ids.has(c.customer_id));
  const pending=callbacks.filter(c=>c.status==='PENDING'),today=new Date().toISOString().slice(0,10);
  const count=(status:string)=>customers.filter(c=>c.lead_status===status).length;
  const converted=count('CONVERTED'),rate=(n:number,d:number)=>d?Math.round(n/d*1000)/10:0;
  const funnel=Object.fromEntries(['NEW','CONTACTED','INTERESTED','FOLLOW_UP','QUALIFIED','CONVERTED'].map(k=>[k,count(k)]));funnel.LOST=count('LOST')+count('NOT_INTERESTED');
  const sources=[...new Set(customers.map(c=>c.lead_source||'Unknown'))].map(source=>({source,count:customers.filter(c=>(c.lead_source||'Unknown')===source).length}));
  const team_performance=teams.filter(t=>user.role==='super_admin'||allowedTeams.includes(t.id)).map(t=>{
    const leads=customers.filter(c=>c.assigned_team_id===t.id),conversions=leads.filter(c=>c.lead_status==='CONVERTED').length;
    return {team_id:t.id,team_name:t.name,team_leader:users.find(u=>u.id===t.team_leader_id)?.full_name||'Unassigned',leads:leads.length,calls:period.filter(c=>c.team_id===t.id).length,conversions,conversion_rate:rate(conversions,leads.length)};
  });
  const agent_leaderboard=users.filter(u=>user.role==='super_admin'||memberships.some(m=>m.user_id===u.id&&allowedTeams.includes(m.team_id))).map(u=>{
    const leads=customers.filter(c=>c.assigned_agent_id===u.id),conversions=leads.filter(c=>c.lead_status==='CONVERTED').length;
    return {agent_id:u.id,agent_name:u.full_name,username:u.username,leads_count:leads.length,calls_count:period.filter(c=>c.agent_id===u.id).length,conversions,conversion_rate:rate(conversions,leads.length)};
  }).sort((a,b)=>b.conversions-a.conversions);
  return {user_role:user.role,total_users:users.length,total_teams:teams.length,total_leads:customers.length,total_converted:converted,
    total_assigned_leads:customers.length,total_team_leads:customers.length,total_team_members:memberships.filter(m=>allowedTeams.includes(m.team_id)).length,team_count:allowedTeams.length,
    new_leads:count('NEW'),interested_leads:count('INTERESTED'),converted_leads:converted,lost_leads:funnel.LOST,
    conversion_rate:rate(converted,customers.length),team_conversion_rate:rate(converted,customers.length),calls_period:period.length,team_calls_period:period.length,
    calls_today:calls.filter(c=>String(c.created_at).slice(0,10)===today).length,calls_duration_seconds:period.reduce((s,c)=>s+Number(c.duration_seconds||0),0),
    callbacks_today:pending.filter(c=>String(c.scheduled_at).slice(0,10)===today).length,overdue_callbacks:pending.filter(c=>new Date(c.scheduled_at).getTime()<Date.now()).length,
    funnel,lead_sources:sources,team_performance,agent_leaderboard,recent_calls:await Promise.all(calls.sort((a,b)=>String(b.created_at).localeCompare(a.created_at)).slice(0,5).map(c=>relatedDTO('calls',c)))};
}
