import { initializeSchema, all, insert, closeDB, transaction, type Row } from '../src/server/db';
import bcrypt from 'bcryptjs';
import seed from '../src/server/seed.json';

export async function seedMetadata(){
  for(const [table,rows]of Object.entries(seed)){
    const existing=await all(table);
    for(const row of rows as Row[])if(!existing.some(r=>row.id?r.id===row.id:r.role_id===row.role_id&&r.permission_id===row.permission_id))await insert(table,row);
  }
}
async function main(){
  let exists=false;
  try{await all('roles');exists=true;}catch(e){if(!/no such table|does not exist/.test((e as Error).message))throw e;}
  if(!exists)await initializeSchema();
  await transaction(async()=>{
    await seedMetadata();
    if(!(await all('users')).length){
      const password=process.env.ADMIN_PASSWORD,email=process.env.ADMIN_EMAIL;
      if(!password||password.length<12||!email)throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) to create the first administrator.');
      const role=(await all('roles','name=?',['super_admin']))[0];
      await insert('users',{username:process.env.ADMIN_USERNAME||'admin',email,full_name:process.env.ADMIN_NAME||'Administrator',password_hash:await bcrypt.hash(password,12),role_id:role.id,is_active:true});
      console.log('Created initial administrator.');
    }
  });
  console.log('CRM database initialized. Existing records were preserved.');
}
if(process.argv[1]?.endsWith('init-db.ts'))main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(closeDB);
