import {test} from "node:test";
import assert from "node:assert/strict";
import {validateGalleryJpeg,validRoom,GALLERY_MAX_PHOTOS,parseBoundedGalleryJson} from "../lib/gallery-image.ts";

function fakeJpeg({exif=false,width=128,height=128}={}){
 const header=Buffer.from([0xff,0xd8]);
 const segment=Buffer.from([0xff,exif?0xe1:0xe0,0x00,0x06,0x4a,0x46,0x49,0x46]);
 const sof=Buffer.from([0xff,0xc0,0x00,0x11,0x08,(height>>8)&255,height&255,(width>>8)&255,width&255,0x03,0x01,0x11,0,0x02,0x11,0,0x03,0x11,0]);
 const sos=Buffer.from([0xff,0xda,0x00,0x08,0x01,0x01,0x00,0x00,0x3f,0x00]);
 return Buffer.concat([header,segment,sof,sos,Buffer.alloc(120,0x11),Buffer.from([0xff,0xd9])]);
}
test("accepts a small metadata-free JPEG scan and computes hash/geometry",()=>{
 const input="data:image/jpeg;base64,"+fakeJpeg().toString("base64");
 const a=validateGalleryJpeg(input);
 assert.equal(a?.width,128);assert.equal(a?.height,128);
 assert.match(a?.sha256??"",/^[a-f0-9]{64}$/);
 assert.equal(GALLERY_MAX_PHOTOS,6);
});
test("rejects EXIF payloads even if the browser claims they were re-encoded",()=>{
 assert.equal(validateGalleryJpeg("data:image/jpeg;base64,"+fakeJpeg({exif:true}).toString("base64")),null);
});
test("rejects URLs, SVGs, malformed base64, trailing script-like bytes and tiny images",()=>{
 assert.equal(validateGalleryJpeg("https://evil.invalid/x.jpg"),null);
 assert.equal(validateGalleryJpeg("data:image/svg+xml;base64,"+fakeJpeg().toString("base64")),null);
 assert.equal(validateGalleryJpeg("data:image/jpeg;base64,blah."),null);
 assert.equal(validateGalleryJpeg("data:image/jpeg;base64,"+Buffer.concat([fakeJpeg(),Buffer.from("<script>")]).toString("base64")),null);
 assert.equal(validateGalleryJpeg("data:image/jpeg;base64,"+fakeJpeg({width:12}).toString("base64")),null);
 assert.equal(validateGalleryJpeg("data:image/jpeg;base64,"+"A".repeat(250000)),null);
});
test("rejects unapproved room labels instead of storing arbitrary captions",()=>{
 assert.equal(validRoom("bathroom"),"bathroom");
 assert.equal(validRoom("<script>alert(1)</script>"),"unknown");
});
test("consumes bounded JSON; never reads an unbounded request body",async()=>{
 const ok=await parseBoundedGalleryJson(new Request("http://localhost/test",{
  method:"POST",body:JSON.stringify({checkedPersonalInfo:true})}));
 assert.equal(ok?.checkedPersonalInfo,true);
 const bad=await parseBoundedGalleryJson(new Request("http://localhost/test",{
  method:"POST",body:"a".repeat(260000)}));
 assert.equal(bad,null);
});
