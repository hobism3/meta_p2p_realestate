/**
 * Shared safe photo transport for the opt-in Meta VLM / image-edit endpoints.
 * API receives only browser-rendered JPEG and keeps it ephemeral; no raw EXIF.
 */
export const PHOTO_MAX_IMAGE_BYTES = 950_000;
export const PHOTO_MAX_BODY_BYTES = 1_550_000;
export const EMPTY_VIEW_MAX_OUTPUT_BYTES = 6_000_000;

export function checkedJpegDataUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > PHOTO_MAX_BODY_BYTES) return null;
  const prefix = "data:image/jpeg;base64,";
  if (!value.startsWith(prefix)) return null;
  const encoded = value.slice(prefix.length);
  if (encoded.length < 100 || encoded.length > Math.ceil(PHOTO_MAX_IMAGE_BYTES * 4 / 3) + 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 75 || bytes.length > PHOTO_MAX_IMAGE_BYTES ||
      bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9 ||
      bytes.toString("base64") !== encoded) return null;
  return value;
}

/** Always bound streaming request bytes, including requests without content-length. */
export async function readLimitedPhotoJson(req: Request): Promise<Record<string, unknown> | null> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > PHOTO_MAX_BODY_BYTES) return null;
      chunks.push(Buffer.from(part.value));
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

/** No remote output URLs or provider HTML: only size-bound genuine WebP data URLs. */
export function parseMuseEmptyViewResponse(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as { output_format?: unknown; data?: unknown };
  if (v.output_format !== undefined && v.output_format !== "webp") return null;
  if (!Array.isArray(v.data) || v.data.length !== 1) return null;
  const entry = v.data[0];
  if (!entry || typeof entry !== "object") return null;
  const encoded = (entry as { b64_json?: unknown }).b64_json;
  if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ||
      encoded.length < 20 || encoded.length > Math.ceil(EMPTY_VIEW_MAX_OUTPUT_BYTES * 4 / 3) + 4) return null;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 16 || bytes.length > EMPTY_VIEW_MAX_OUTPUT_BYTES ||
      bytes.toString("base64") !== encoded || bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  return "data:image/webp;base64," + encoded;
}

export const EMPTY_VIEW_PROMPT = [
  "Create an illustrative empty-furniture version of this exact indoor property photograph.",
  "Remove only movable furniture, freestanding appliances, and loose personal clutter.",
  "Keep walls, floor, ceiling, doorways, windows, fixed kitchen cabinets, fixed bathroom fixtures,",
  "lighting position, architectural details, visible wear and damage, camera angle and perspective unchanged.",
  "Do not expand the space, add a window, change the dimensions, repaint or repair damage.",
  "Treat opaque privacy redaction blocks as intentional: do not restore or invent their hidden content.",
  "Keep image photorealistic. This is an imagined visualization, not evidence of actual condition.",
].join(" ");
