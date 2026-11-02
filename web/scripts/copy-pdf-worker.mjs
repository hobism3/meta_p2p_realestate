/**
 * Build-time, local-only PDF worker copy.
 * The exact npm PDF.js worker is hosted from THIS application's /public,
 * preventing personal PDFs from being interpreted by a third-party CDN.
 */
import {readFile,copyFile,mkdir,stat} from "node:fs/promises";
import {join,resolve} from "node:path";

const cwd=process.cwd();
const version="4.10.38";
const manifest=JSON.parse(await readFile(join(cwd,"node_modules/pdfjs-dist/package.json"),"utf8"));
if(manifest.version!==version)throw Error("PDF worker JS version mismatch; pin "+version);
const source=resolve(cwd,"node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const targetDir=resolve(cwd,"public");
const target=join(targetDir,"pdf.worker."+version+".min.mjs");
const size=(await stat(source)).size;
if(size<50000||size>15*1024*1024)throw Error("Unexpected PDF worker bundle size");
await mkdir(targetDir,{recursive:true});
await copyFile(source,target);
console.log("Local PDF.js worker "+version+" ready ("+size+" bytes), same-origin only.");
