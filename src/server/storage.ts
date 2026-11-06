import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError } from './db';
const allowed=new Set(['pdf','doc','docx','xls','xlsx','csv','jpg','jpeg','png']);
function credentials(){
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new HttpError(503,'Connect Supabase Storage before uploading documents.');
  return {url:process.env.SUPABASE_URL.replace(/\/$/,''),key:process.env.SUPABASE_SERVICE_ROLE_KEY,bucket:process.env.SUPABASE_STORAGE_BUCKET||'crm-contracts'};
}
export async function saveFile(file:File){
  const extension=file.name.split('.').pop()?.toLowerCase()||'';
  if(!allowed.has(extension)||file.size>16*1024*1024)throw new HttpError(400,'Upload a PDF, Office document, CSV or image no larger than 16 MB');
  const filename=`${randomUUID()}.${extension}`,bytes=Buffer.from(await file.arrayBuffer());
  if(process.env.VERCEL||process.env.SUPABASE_URL){
    const {url,key,bucket}=credentials();
    const response=await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${filename}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,apikey:key,'Content-Type':file.type||'application/octet-stream'},body:bytes});
    if(!response.ok)throw new HttpError(502,'Cloud document upload failed');
  }else{const dir=path.resolve('uploads/contracts');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,filename),bytes);}
  return {stored_filename:filename,original_filename:path.basename(file.name)};
}
export async function downloadFile(filename:string,original:string){
  if(path.basename(filename)!==filename)throw new HttpError(400,'Invalid document path');
  let bytes:Uint8Array;
  if(process.env.VERCEL||process.env.SUPABASE_URL){const {url,key,bucket}=credentials();const r=await fetch(`${url}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodeURIComponent(filename)}`,{headers:{Authorization:`Bearer ${key}`,apikey:key},cache:'no-store'});if(!r.ok)throw new HttpError(404,'Document not found');bytes=new Uint8Array(await r.arrayBuffer());}
  else {try{bytes=await readFile(path.resolve('uploads/contracts',filename));}catch{throw new HttpError(404,'Document not found');}}
  return new Response(bytes as BodyInit,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(original||'contract')}`,'Cache-Control':'private, no-store'}});
}
