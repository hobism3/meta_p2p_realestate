#!/usr/bin/env node
/** Operator-only Supabase Auth test account provisioning.
 * Requires: PROVISION_TEST_ACCOUNTS=YES, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, TEST_OWNER_EMAIL, TEST_VISITOR_EMAIL.
 * Never run from a public API, CI or Vercel build.
 */
import { randomBytes } from "node:crypto";
const names=["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","TEST_OWNER_EMAIL","TEST_VISITOR_EMAIL"];
if(process.env.PROVISION_TEST_ACCOUNTS!=="YES"||names.some(n=>!process.env[n])){
  console.error("Explicit YES and four environment variables required.");
  process.exit(2);
}
const url=process.env.SUPABASE_URL.replace(/\/+$/,"");
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const users=[
  {email:process.env.TEST_OWNER_EMAIL.trim(),name:"테스트 집주인"},
  {email:process.env.TEST_VISITOR_EMAIL.trim(),name:"테스트 방문자"},
];
if(users[0].email.toLowerCase()===users[1].email.toLowerCase()||
 users.some(x=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email))){
 console.error("Distinct, valid email addresses required.");process.exit(2);
}
async function call(path,method,body){
  const r=await fetch(url+path,{method,headers:{apikey:key,Authorization:"Bearer "+key,
    "Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw Error("Auth Admin API failed ("+r.status+").");
  return result;
}
const created=[];
try{
  for(const user of users){
    const password="DH-"+randomBytes(24).toString("base64url")+"9a";
    const r=await call("/auth/v1/admin/users","POST",{email:user.email,password,
      email_confirm:true,user_metadata:{name:user.name,directhome_test_account:true}});
    if(!r.id)throw Error("User ID missing.");
    created.push({id:r.id,email:user.email,password,name:user.name});
  }
  // Show passwords once to the operator. Never print the service-role key.
  for(const u of created)process.stdout.write(u.name+"\nID: "+u.email+"\nPassword: "+u.password+"\n\n");
}catch(e){
  for(const u of created){try{await call("/auth/v1/admin/users/"+encodeURIComponent(u.id),"DELETE");}catch{}}
  console.error(e instanceof Error?e.message:"Provisioning failed.");process.exitCode=1;
}
