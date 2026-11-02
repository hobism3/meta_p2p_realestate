/**
 * One-shot, paid Meta smoke test. Never in CI or automatic on page load.
 * Usage (run from web/): MODEL_API_KEY=... node scripts/meta-photo-minimal-smoke.mjs --image path/to/SYNTHETIC.jpg --vision
 * Optional second request only with --edit; default is DRY RUN and sends nothing.
 * Does not write photos, API keys, model text/OCR, or full provider responses to disk.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { sanitizePhotoReview, parsePhotoModelText } from "../lib/photo-guide.ts";
import { checkedJpegDataUrl, parseMuseEmptyViewResponse, EMPTY_VIEW_PROMPT } from "../lib/photo-image.ts";

const args = process.argv.slice(2);
const has = (x) => args.includes(x);
const idx = args.indexOf("--image");
const imagePath = idx >= 0 ? args[idx + 1] : null;
const doVision = has("--vision");
const doEdit = has("--edit");
const execute = has("--execute");
const maximumRequests = (doVision ? 1 : 0) + (doEdit ? 1 : 0);
if (!imagePath || (!doVision && !doEdit) || (execute && !has("--synthetic-confirmed"))) {
  console.error("Usage: --image SYNTHETIC.jpg --vision [--edit] [--execute --synthetic-confirmed]");
  process.exit(2);
}
const bytes = readFileSync(resolve(imagePath));
const input = "data:image/jpeg;base64," + bytes.toString("base64");
if (!checkedJpegDataUrl(input)) throw Error("Use a valid synthetic JPEG <=950KB; strip EXIF before testing.");
const fingerprint = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
const base = (process.env.MODEL_API_BASE ?? "https://api.meta.ai/v1").replace(/\/+$/, "");
if (!base.startsWith("https://api.meta.ai/v1") && !has("--allow-custom-endpoint")) {
  throw Error("Unexpected API base; refuse sending pictures except to Meta Model API.");
}
const result = { mode: execute ? "paid_single_shot" : "dry_run", synthetic: true,
  inputSha256Prefix: fingerprint, inputBytes: bytes.length, maximumRequests,
  requestCount: 0, vision: "not_requested", imageEdit: "not_requested",
  estimatedCostUsd: "provider usage; not an account balance" };
if (!execute) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
const key = process.env.MODEL_API_KEY;
if (!key) throw Error("MODEL_API_KEY not available in this runtime. No requests sent.");
if (has("--edit") && has("--vision") && !has("--allow-two-calls")) {
  throw Error("For two calls explicitly add --allow-two-calls. No requests sent.");
}
async function invoke(path, payload) {
  result.requestCount += 1;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(base + path, {
      method:"POST",
      headers:{ Authorization:"Bearer " + key, "Content-Type":"application/json" },
      body:JSON.stringify(payload), signal:controller.signal,
    });
    if (!response.ok) return { httpStatus:response.status, error:true };
    // For an image response large base64 may be returned; never persist or print.
    return { httpStatus:response.status, body:await response.json() };
  } catch (error) {
    return { error:true, transport: error instanceof Error ? error.name : "unknown" };
  } finally { clearTimeout(timer); }
}
if (doVision) {
  const system = [
    "Classify only visible residential room/facility facts. Do not transcribe text.",
    "JSON ONLY: {room,features,privacyFlags}.",
    "room=one of living_room,bedroom,kitchen,bathroom,entrance,balcony,other,unknown.",
    "features subset of 에어컨,시스템에어컨,냉장고,세탁기,건조기,침대,옷장,인덕션,가스레인지,전자레인지,비데,싱크대.",
    "privacyFlags subset of person,face,photo_frame,document,screen,address_label,reflection.",
  ].join(" ");
  const v = await invoke("/chat/completions", { model: "muse-spark-1.3", max_tokens: 450,
    reasoning_effort:"minimal", temperature:0,
    messages:[{role:"system",content:system},{role:"user",content:[
      {type:"text",text:"Classify photo and return enum JSON only."},
      {type:"image_url",image_url:{url:input}},
    ]}] });
  if (v.error) {
    result.vision = { httpStatus:v.httpStatus ?? null, status:"ERROR_STOPPED" };
    console.log(JSON.stringify(result,null,2)); process.exit(1);
  }
  const choice = v.body?.choices?.[0];
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ?
    content.map(x=>typeof x?.text==="string"?x.text:"").join("") : "";
  const reviewed = parsePhotoModelText(text);
  result.vision = { status: reviewed ? "PARSE_PASS":"PARSE_FAIL",
    finishReason:choice?.finish_reason ?? "unknown",
    usage:{inputTokens:Number(v.body?.usage?.prompt_tokens||0),
      outputTokens:Number(v.body?.usage?.completion_tokens||0)},
    review: reviewed ?? undefined };
  if (!reviewed) {
    console.log(JSON.stringify(result,null,2)); process.exit(1);
  }
}
if (doEdit) {
  // One successful output is billed at $0.01 on current public Meta pricing, but this
  // script never presumes provider price/balance. Never auto-retry on errors.
  const e = await invoke("/images/edits", {
    model:"muse-image-1.0", prompt:EMPTY_VIEW_PROMPT,
    images:[{image_url:input}], n:1, output_format:"webp",
    response_format:"b64_json", reasoning_strength:"low",
    tool_enablement:{enable_web_search:false,enable_image_search:false,enable_shell:false},
  });
  if (e.error) result.imageEdit = { status:"HTTP_ERROR",httpStatus:e.httpStatus ?? null };
  else {
    const good = parseMuseEmptyViewResponse(e.body);
    result.imageEdit = { status:good?"FORMAT_PASS":"FORMAT_FAIL",
      returnedImageBytes:good ? Buffer.from(good.split(",")[1],"base64").length : 0,
      warning:"Image visual quality and architectural fidelity require manual review" };
  }
}
console.log(JSON.stringify(result,null,2));
process.exit(result.imageEdit?.status?.includes("FAIL")||result.imageEdit?.status==="HTTP_ERROR"?1:0);
