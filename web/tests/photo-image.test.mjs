import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkedJpegDataUrl, parseMuseEmptyViewResponse, EMPTY_VIEW_PROMPT,
  PHOTO_MAX_BODY_BYTES, readLimitedPhotoJson,
} from "../lib/photo-image.ts";

const validJpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(125, 48), Buffer.from([0xff, 0xd9])]);
const validWebp = () => Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.from([12, 0, 0, 0]), Buffer.from("WEBPVP8 ", "ascii")]);

test("only canonical JPEG data URLs pass preflight", () => {
  const encoded = validJpeg().toString("base64");
  assert.equal(checkedJpegDataUrl("data:image/jpeg;base64," + encoded), "data:image/jpeg;base64," + encoded);
  assert.equal(checkedJpegDataUrl("https://example.com/private.jpg"), null);
  assert.equal(checkedJpegDataUrl("data:image/png;base64," + encoded), null);
  assert.equal(checkedJpegDataUrl("data:image/jpeg;base64," + Buffer.alloc(200, 50).toString("base64")), null);
  assert.equal(checkedJpegDataUrl("data:image/jpeg;base64," + "A".repeat(PHOTO_MAX_BODY_BYTES + 1)), null);
});

test("generated image output must be a single size-limited real WEBP, not remote URL or HTML", () => {
  const encoded = validWebp().toString("base64");
  assert.equal(parseMuseEmptyViewResponse({data:[{b64_json:encoded}],output_format:"webp"}),
    "data:image/webp;base64," + encoded);
  assert.equal(parseMuseEmptyViewResponse({data:[{url:"https://vendor.example/image"}],output_format:"webp"}), null);
  assert.equal(parseMuseEmptyViewResponse({data:[{b64_json:Buffer.from("<svg onload=evil />").toString("base64")}]}), null);
  assert.equal(parseMuseEmptyViewResponse({data:[{b64_json:encoded},{b64_json:encoded}],output_format:"webp"}), null);
  assert.equal(parseMuseEmptyViewResponse({data:[{b64_json:encoded}],output_format:"svg"}), null);
});
test("bounded JSON reader rejects oversized untrusted data regardless of content-length", async () => {
  const big = new Request("http://localhost/test", {method:"POST",body:JSON.stringify({text:"Z".repeat(PHOTO_MAX_BODY_BYTES)})});
  assert.equal(await readLimitedPhotoJson(big), null);
  const ok = new Request("http://localhost/test", {method:"POST",body:JSON.stringify({consent:true})});
  assert.deepEqual(await readLimitedPhotoJson(ok), {consent:true});
});
test("image-edit prompt preserves walls/windows, disallows invented repair, and disallows undoing redaction", () => {
  assert.match(EMPTY_VIEW_PROMPT, /walls/);
  assert.match(EMPTY_VIEW_PROMPT, /wear and damage/);
  assert.match(EMPTY_VIEW_PROMPT, /redaction blocks/);
  assert.match(EMPTY_VIEW_PROMPT, /not evidence/);
});
