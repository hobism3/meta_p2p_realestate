import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { clientKey } from "@/lib/api";
import { checkRate } from "@/lib/ratelimit";
import { parseChatResponse } from "@/lib/meta";
import {
  REGISTRY_MAX_JSON_BYTES, REGISTRY_MAX_PDF_BYTES,
  buildRegistryMetaRequest, isPlausiblePdf, mockRegistryDraft, validateRegistryDraft,
} from "@/lib/registry-draft";

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_HOUR = 60 * 60 * 1000;
const perUser = new Map<string, { count: number; expires: number }>();
function budget(userId: string): boolean {
  if (perUser.size > 10000) perUser.clear();
  const prev = perUser.get(userId);
  if (!prev || prev.expires <= Date.now()) {
    perUser.set(userId, { count: 1, expires: Date.now() + RATE_HOUR });
    return true;
  }
  if (prev.count >= 3) return false;
  prev.count += 1;
  return true;
}

async function readLimitedJson(req: Request): Promise<Record<string, unknown> | null> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > REGISTRY_MAX_JSON_BYTES) return null;
      chunks.push(Buffer.from(part.value));
    }
    const data = JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Ephemeral document extraction only; no storage, no publish, no ownership assertion.
 * Deliberately separate from 256 KiB guardWrite because an inline PDF needs ~2 MiB.
 */
export async function POST(req: Request): Promise<Response> {
  if (process.env.READ_ONLY === "true") return json({ error: "읽기 전용 모드" }, 403);
  const token = process.env.WRITE_TOKEN;
  if (token && req.headers.get("x-write-token") !== token) return json({ error: "인증 필요" }, 401);
  const a = await authenticate(req);
  if ("error" in a) return json({ error: a.error }, a.status);
  if (!checkRate(`w:${clientKey(req)}`).ok) return json({ error: "요청 과다" }, 429);
  if (!budget(a.identity.userId)) return json({ error: "문서 분석은 계정당 시간당 최대 3회 가능합니다." }, 429);
  const provider = process.env.AGENT_PROVIDER === "meta" ? "meta" : "mock";
  if (provider === "meta" && process.env.REGISTRY_AI_ENABLED !== "true") {
    return json({ error: "문서 AI 분석은 서버에서 아직 활성화되지 않았습니다." }, 503);
  }
  if (provider === "meta" && !process.env.MODEL_API_KEY) return json({ error: "Meta 모델 키가 설정되지 않았습니다." }, 503);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (!Number.isFinite(len) || len > REGISTRY_MAX_JSON_BYTES) return json({ error: "업로드 용량 초과(최대 2MB PDF)" }, 413);
  if (!req.headers.get("content-type")?.includes("application/json")) return json({ error: "JSON 전송만 지원합니다." }, 415);
  const body = await readLimitedJson(req);
  if (!body || body.consent !== true) return json({ error: "가림 처리 및 문서 분석에 대한 명시적 동의가 필요합니다." }, 400);
  const filename = typeof body.filename === "string" ? body.filename : "";
  const b64 = typeof body.pdf_base64 === "string" ? body.pdf_base64 : "";
  if (!/\.pdf$/i.test(filename) || filename.length > 120 || !b64 || b64.length > Math.ceil(REGISTRY_MAX_PDF_BYTES * 4 / 3) + 8 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    return json({ error: "2MB 이하의 PDF만 허용됩니다." }, 400);
  }
  const pdf = Buffer.from(b64, "base64");
  if (pdf.length > REGISTRY_MAX_PDF_BYTES || pdf.toString("base64") !== b64 || !isPlausiblePdf(pdf)) {
    return json({ error: "올바른 암호화되지 않은 PDF가 아닙니다." }, 400);
  }

  if (provider === "mock") {
    const draft = mockRegistryDraft(pdf);
    if (!draft) return json({ error: "Mock 모드에서는 제공된 합성 PDF 예시만 분석할 수 있습니다." }, 422);
    return json({ provider: "mock", model: "synthetic-fixture", draft });
  }

  // No file is uploaded to the Files API or persisted. The explicit redacted document is
  // embedded once in the Meta request. Do not log requests, owner identifiers, or replies.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    const res = await fetch("https://api.meta.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MODEL_API_KEY}` },
      body: JSON.stringify(buildRegistryMetaRequest(pdf)),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return json({ error: `Meta 분석에 실패했습니다(HTTP ${res.status}). 다시 시도하거나 직접 입력해 주세요.` }, 502);
    const raw = await res.json().catch(() => null);
    const msg = parseChatResponse(raw);
    if (!msg) return json({ error: "Meta 응답에서 분석 결과를 읽지 못했습니다." }, 502);
    let parsed: unknown;
    try { parsed = JSON.parse(msg.text); } catch { return json({ error: "Meta 응답을 구조화하지 못했습니다." }, 502); }
    const draft = validateRegistryDraft(parsed);
    if (!draft) return json({ error: "등기 정보에서 검토 가능한 필드를 찾지 못했습니다." }, 422);
    return json({ provider: "meta", model: process.env.MODEL_MODEL ?? "muse-spark-1.3", draft });
  } catch {
    return json({ error: "문서 분석 시간이 초과되었거나 네트워크 연결에 실패했습니다." }, 502);
  } finally {
    clearTimeout(timer);
  }
}
