import {createHmac,timingSafeEqual} from "node:crypto";

type Config={
 startUrl:string;apiKey:string;callbackUrl:string;callbackSecret:string;
 subjectPepper:string;allowedRedirectOrigin:string;
};
/** Contract is with an independently trusted identity-provider bridge, NOT a
 * third-party vendor API guess. Vendor-specific response verification must
 * happen inside that bridge before it sends a signed attestation.
 */
export function identityProviderConfig():Config|null{
 const startUrl=process.env.IDENTITY_BRIDGE_START_URL??"";
 const apiKey=process.env.IDENTITY_BRIDGE_API_KEY??"";
 const callbackUrl=process.env.IDENTITY_BRIDGE_CALLBACK_URL??"";
 const callbackSecret=process.env.IDENTITY_BRIDGE_CALLBACK_SECRET??"";
 const subjectPepper=process.env.IDENTITY_BRIDGE_SUBJECT_PEPPER??"";
 const allowedRedirectOrigin=process.env.IDENTITY_BRIDGE_REDIRECT_ORIGIN??"";
 if(!startUrl||apiKey.length<24||!callbackUrl||callbackSecret.length<32||
    subjectPepper.length<32||!allowedRedirectOrigin)return null;
 try{
  const start=new URL(startUrl),callback=new URL(callbackUrl),redirect=new URL(allowedRedirectOrigin);
  if(start.protocol!=="https:"||callback.protocol!=="https:"||redirect.protocol!=="https:" ||
     start.username||start.password||callback.username||callback.password ||
     redirect.pathname!=="/"||redirect.search||redirect.hash)return null;
  return {startUrl,apiKey,callbackUrl,callbackSecret,subjectPepper,allowedRedirectOrigin:redirect.origin};
 }catch{return null;}
}
export function safeVerificationUrl(raw:unknown,origin:string):string|null{
 if(typeof raw!=="string"||raw.length>2048)return null;
 try{const url=new URL(raw);return url.protocol==="https:"&&url.origin===origin&&!url.username&&!url.password?url.toString():null;}
 catch{return null;}
}
export function callbackSignatureOk(body:string,timestamp:string,signature:string,secret:string,nowSeconds=Math.floor(Date.now()/1000)):boolean{
 if(!/^\d{10}$/.test(timestamp)||Math.abs(nowSeconds-Number(timestamp))>300)return false;
 if(!/^[a-f0-9]{64}$/i.test(signature)||secret.length<32)return false;
 const mac=createHmac("sha256",secret).update(timestamp+"."+body).digest("hex");
 const supplied=Buffer.from(signature.toLowerCase(),"hex"),expected=Buffer.from(mac,"hex");
 return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}
export function hashProviderSubject(subject:string,pepper:string):string{
 return createHmac("sha256",pepper).update(subject).digest("hex");
}
