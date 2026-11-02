/**
 * Optional local educational PDF downloader (explicit opt-in).
 * This is for a developer's PRIVATE workspace, not a public test artifact.
 * The five allowlisted publisher-created fictional PDFs are downloaded
 * directly to .local-registry-training-docs/ (gitignored), with exact SHA pins.
 *
 * Usage: cd web && node scripts/cache-fictional-registry-pdfs.mjs --private-corpus
 * No actual property records, scraped personal-data records or third-party
 * mirrors are accepted. Do not commit/redistribute any downloaded PDFs.
 */
import {readFile,mkdir,writeFile,stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,dirname,join} from "node:path";
import {createHash} from "node:crypto";
const outDir=fileURLToPath(new URL("../.local-registry-training-docs/",import.meta.url));
const manifest=JSON.parse(await readFile(new URL("../tests/fixtures/registry-public-sources.v1.json",import.meta.url),"utf8"));
const active=process.argv.includes("--private-corpus");
if(!active){
 console.error("Refusing to download. Use --private-corpus to acknowledge private-use/no-redistribution.");
 process.exitCode=2;
}else{
 await mkdir(outDir,{recursive:true,mode:0o700});
 const maxBytes=8*1024*1024;
 let ok=0;
 for(const source of manifest.references){
  const target=new URL(source.url);
  const localName=source.id.toLowerCase()+".pdf";
  const output=join(outDir,localName);
  let status="SKIPPED";
  try{
   if(target.protocol!=="https:"||target.hostname!=="dangdang.io"||!/^[a-z0-9-]+\.pdf$/i.test(target.pathname.split("/").pop()??""))
    throw Error("Unapproved source");
   if(!/^[0-9a-f]{64}$/.test(source.sha256)||source.kind!=="explicit_educational_fiction")
    throw Error("Unpinned or not explicitly fictional");
   const response=await fetch(target,{signal:AbortSignal.timeout(25000)});
   if(!response.ok||new URL(response.url).hostname!==target.hostname)throw Error("Unavailable source");
   const length=Number(response.headers.get("content-length")??0);
   if(length>maxBytes||!response.body)throw Error("Invalid document size");
   const chunks=[];let count=0;
   for await(const chunk of response.body){
    count+=chunk.byteLength;if(count>maxBytes)throw Error("Invalid document size");
    chunks.push(Buffer.from(chunk));
   }
   const bytes=Buffer.concat(chunks,count);
   if(bytes.subarray(0,5).toString("ascii")!=="%PDF-"||bytes.length!==source.priorObservedBytes)
    throw Error("PDF signature or expected size differs");
   if(createHash("sha256").update(bytes).digest("hex")!==source.sha256)
    throw Error("Pinned document hash differs");
   // Refuse any overwrite, never log document contents, honor restrictive file mode.
   await writeFile(output,bytes,{flag:"wx",mode:0o600});
   ok++;status="SAVED_PRIVATE";
  }catch{
   try{await stat(output);status="NOT_WRITTEN_ALREADY_EXISTS_OR_FAILED";}
   catch{status="NOT_WRITTEN_DOWNLOAD_OR_VALIDATION_FAILED";}
  }
  console.log(source.id+" "+status);
 }
 console.log("Private educational PDF corpus: "+ok+"/"+manifest.references.length+" new files saved. Do not commit or redistribute.");
 if(ok!==manifest.references.length)process.exitCode=2;
}
