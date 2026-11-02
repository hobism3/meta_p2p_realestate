import {createHash} from "node:crypto";
import {PHOTO_ROOMS,type PhotoRoom} from "./photo-guide.ts";

/** Published derivatives only. The source must be re-encoded in a browser
 * canvas BEFORE the owner explicitly approves publication. This guard
 * rejects EXIF/APP/COM and non-JPEG inputs, but is not a malware/PII scanner.
 */
export const GALLERY_MAX_BYTES=180_000;
export const GALLERY_MAX_PHOTOS=6;
export type GalleryImage={base64:string;sha256:string;width:number;height:number};
export function validateGalleryJpeg(value:unknown):GalleryImage|null{
 if(typeof value!=="string"||!value.startsWith("data:image/jpeg;base64,"))return null;
 const base64=value.slice("data:image/jpeg;base64,".length);
 if(base64.length>Math.ceil(GALLERY_MAX_BYTES/3)*4+4||base64.length<100||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))return null;
 let buffer:Buffer;
 try{buffer=Buffer.from(base64,"base64");}catch{return null;}
 if(buffer.toString("base64")!==base64 || buffer.length>GALLERY_MAX_BYTES || buffer.length<100)return null;
 if(buffer[0]!==0xff||buffer[1]!==0xd8||buffer[buffer.length-2]!==0xff||
  buffer[buffer.length-1]!==0xd9)return null;
 let i=2,width=0,height=0,scan=false;
 const frames=new Set([0xc0,0xc1,0xc2]);
 const supported=new Set([0xe0,0xdb,0xc0,0xc1,0xc2,0xc4,0xdd,0xda]);
 while(i+4<=buffer.length){
  if(buffer[i]!==0xff)return null;
  while(buffer[i]===0xff)i++;
  const marker=buffer[i++];
  if(!supported.has(marker))return null; // APP1 EXIF, COM, ICC, malformed markers.
  if(i+2>buffer.length)return null;
  const length=buffer.readUInt16BE(i);
  if(length<2||i+length>buffer.length)return null;
  if(frames.has(marker)){
   if(length<7||width||height)return null;
   height=buffer.readUInt16BE(i+3);width=buffer.readUInt16BE(i+5);
  }
  i+=length;
  if(marker===0xda){scan=true;break;}
 }
 if(!scan||!width||!height||width>1600||height>1600||width<100||height<100)return null;
 return {base64,sha256:createHash("sha256").update(buffer).digest("hex"),width,height};
}
export function validRoom(value:unknown):PhotoRoom{
 return typeof value==="string"&&PHOTO_ROOMS.includes(value as PhotoRoom)?value as PhotoRoom:"unknown";
}
export function galleryImageUrl(listingId:string,id:string):string{
 return "/api/listings/"+encodeURIComponent(listingId)+"/gallery/"+encodeURIComponent(id);
}
export async function parseBoundedGalleryJson(req:Request):Promise<Record<string,unknown>|null>{
 if(!req.body)return null;
 const reader=req.body.getReader();const chunks:Uint8Array[]=[];let n=0;
 try{
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   n+=value.byteLength;
   if(n>256*1024){await reader.cancel().catch(()=>{});return null;}
   chunks.push(value);
  }
  const bytes=new Uint8Array(n);let at=0;
  for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
  const obj=JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if(!obj||typeof obj!=="object"||Array.isArray(obj))return null;
  return obj as Record<string,unknown>;
 }catch{return null;}finally{reader.releaseLock();}
}
