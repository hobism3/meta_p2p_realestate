import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { reservePhotoAiAttempt, photoAiTotalCap } from "@/lib/photo-ai-budget";
import { clientKey } from "@/lib/api";
import { checkRate } from "@/lib/ratelimit";
import {
  checkedJpegDataUrl, readLimitedPhotoJson, parseMuseEmptyViewResponse,
  PHOTO_MAX_BODY_BYTES, EMPTY_VIEW_PROMPT,
} from "@/lib/photo-image";

export const runtime = "nodejs";
export const maxDuration = 60;

// This is an optional paid generative preview. Default off, separately from VLM.
const EDITS_PER_HOUR = 2;
const quota = new Map<string, { count: number; expires: number }>();

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

function enabled(): boolean {
  return process.env.PHOTO_EMPTY_VIEW_ENABLED === "true" && !!process.env.MODEL_API_KEY;
}
function allowance(id: string): boolean {
  if (quota.size > 10000) quota.clear();
  const previous = quota.get(id);
  const timestamp = Date.now();
  if (!previous || timestamp >= previous.expires) {
    quota.set(id, { count: 1, expires: timestamp + 3600_000 });
    return true;
  }
  if (previous.count >= EDITS_PER_HOUR) return false;
  previous.count++;
  return true;
}

export function GET(): Response {
  return json({ enabled: enabled(), model: "muse-image-1.0", maximumEditsPerHour: EDITS_PER_HOUR, maxTotalAttempts: photoAiTotalCap("edit"), provider: enabled() ? "meta" : "disabled" });
}

async function readLimitedProviderJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 9_000_000) return null;
      chunks.push(Buffer.from(result.value));
    }
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8")) as unknown;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

/** On-demand AI illustration only; no database/object-store write or auto-publish. */
export async function POST(req: Request): Promise<Response> {
  if (process.env.READ_ONLY === "true") return json({ error: "읽기 전용 모드" }, 403);
  if (process.env.WRITE_TOKEN && req.headers.get("x-write-token") !== process.env.WRITE_TOKEN) {
    return json({ error: "인증 필요" }, 401);
  }
  const auth = await authenticate(req);
  if ("error" in auth) return json({ error: auth.error }, auth.status);
  if (!checkRate("w:" + clientKey(req)).ok) return json({ error: "요청 과다" }, 429);
  if (!enabled()) return json({ error: "빈 공간 미리보기 기능이 비활성화되어 있습니다." }, 503);
  if (!req.headers.get("content-type")?.includes("application/json")) return json({ error: "JSON 형식만 허용합니다." }, 415);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (!Number.isFinite(len) || len > PHOTO_MAX_BODY_BYTES) return json({ error: "사진 크기를 줄여 주세요." }, 413);
  const data = await readLimitedPhotoJson(req);
  if (!data || data.consent !== true || data.purpose !== "empty-room-preview") {
    return json({ error: "가구 없는 이미지 생성을 위해 별도 외부 전송 동의가 필요합니다." }, 400);
  }
  const image = checkedJpegDataUrl(data.image);
  if (!image) return json({ error: "950KB 이하의 JPEG 이미지만 허용합니다." }, 422);
  if (!allowance(auth.identity.userId)) return json({ error: "이미지 생성은 계정당 시간당 최대 2회입니다." }, 429);
  if (!await reservePhotoAiAttempt("edit")) return json({ error: "가구 없는 이미지 시연의 전체 호출 한도를 모두 사용했어요." }, 429);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const base = (process.env.MODEL_API_BASE ?? "https://api.meta.ai/v1").replace(/\/+$/, "");
    const reply = await fetch(base + "/images/edits", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.MODEL_API_KEY },
      body: JSON.stringify({
        model: "muse-image-1.0",
        prompt: EMPTY_VIEW_PROMPT,
        images: [{ image_url: image }],
        n: 1,
        output_format: "webp",
        response_format: "b64_json",
        reasoning_strength: "low",
        tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!reply.ok) return json({ error: "빈 공간 이미지를 생성하지 못했습니다. 원본 사진을 이용해 주세요." }, 502);
    const providerData = await readLimitedProviderJson(reply);
    const preview = parseMuseEmptyViewResponse(providerData);
    if (!preview) return json({ error: "생성된 이미지의 형식이 올바르지 않아 표시하지 않았습니다." }, 502);
    return json({ kind: "ai_simulation", provider: "meta", image: preview });
  } catch {
    return json({ error: "이미지 생성 요청에 실패했습니다. 원본 사진은 계속 사용할 수 있습니다." }, 502);
  } finally {
    clearTimeout(timer);
  }
}
