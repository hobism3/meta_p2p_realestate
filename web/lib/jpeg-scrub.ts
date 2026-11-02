/**
 * Chromium Canvas.toBlob("image/jpeg") can include APP2 ICC_PROFILE metadata,
 * which the privacy-first gallery endpoint deliberately rejects. Strip all
 * APPn/COM metadata *before* transferring a publish derivative.
 *
 * Only strips segments before SOS. The compressed image scan is copied
 * byte-for-byte, no transcode to PNG and no original image uploaded.
 * Malformed JPEGs fail closed. The server must still validate the result.
 */
export function stripJpegMetadata(jpeg: Uint8Array): Uint8Array {
  if (jpeg.length < 16 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 ||
    jpeg[jpeg.length - 2] !== 0xff || jpeg[jpeg.length - 1] !== 0xd9) {
    throw new Error("JPEG 형식이 올바르지 않습니다.");
  }
  const segments: Uint8Array[] = [jpeg.subarray(0, 2)];
  let index = 2;
  let total = 2;
  let foundScan = false;
  while (index + 4 <= jpeg.length) {
    const start = index;
    if (jpeg[index] !== 0xff) throw new Error("JPEG 마커가 올바르지 않습니다.");
    while (jpeg[index] === 0xff) index++;
    const marker = jpeg[index++];
    // Standalone markers do not belong to the pre-scan region of Canvas JPEG.
    if (marker === 0x00 || marker === 0xff || marker === 0xd8 ||
        marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      throw new Error("JPEG 마커 순서가 올바르지 않습니다.");
    }
    if (index + 2 > jpeg.length) throw new Error("JPEG 세그먼트가 잘렸습니다.");
    const length = (jpeg[index] << 8) | jpeg[index + 1];
    const end = index + length;
    if (length < 2 || end > jpeg.length) throw new Error("JPEG 세그먼트 길이가 올바르지 않습니다.");
    if (marker === 0xda) {
      segments.push(jpeg.subarray(start));
      total += jpeg.length - start;
      foundScan = true;
      break;
    }
    // All metadata, including JFIF APP0, ICC APP2, EXIF APP1, and comments,
    // is excluded. Leave actual DQT/SOF/DHT image structure untouched.
    if (!((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe)) {
      segments.push(jpeg.subarray(start, end));
      total += end - start;
    }
    index = end;
  }
  if (!foundScan) throw new Error("JPEG 영상 데이터를 확인할 수 없습니다.");
  const output = new Uint8Array(total);
  let pos = 0;
  for (const segment of segments) { output.set(segment, pos); pos += segment.length; }
  return output;
}

/** Convert a browser-created JPEG Blob to an APP-free, metadata-free Blob. */
export async function scrubCanvasJpeg(blob: Blob): Promise<Blob> {
  if (blob.type !== "image/jpeg") throw new Error("JPEG만 게시할 수 있습니다.");
  const src = new Uint8Array(await blob.arrayBuffer());
  const clean = stripJpegMetadata(src);
  // Uint8Array copies ensure the buffer is a regular, transferable ArrayBuffer.
  const out = new Uint8Array(clean.length);
  out.set(clean);
  return new Blob([out.buffer], { type: "image/jpeg" });
}
