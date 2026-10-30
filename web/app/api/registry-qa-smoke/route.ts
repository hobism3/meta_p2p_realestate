import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { buildRegistryMetaRequest, isPlausiblePdf, validateRegistryDraft } from "@/lib/registry-draft";
import { parseChatResponse } from "@/lib/meta";

export const runtime = "nodejs";
export const maxDuration = 60;

// EPHEMERAL QA-ONLY ROUTE: REMOVE IMMEDIATELY AFTER PREVIEW/PRODUCTION VERIFICATION.
// Not a user feature. Only an exact public, fictitious PDF is permitted.
// Requires a strong independent secret in the x-registry-smoke-token HEADER.
// The existing real registration endpoint does not use this bypass.
const SOURCE_URL = "https://dangdang.io/blog/registry-samples/normal.pdf";
const SOURCE_SHA = "2ddff3f07aa134c04456685db796ffb8029e007159eabc3c07c6c0fad1e87b50";
const EXPIRES = Date.parse("2026-10-31T23:59:00Z");
let calls = 0;

function respond(data: Record<string, unknown>, status = 200): Response {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REGISTRY_SMOKE_TOKEN ?? "";
  const provided = request.headers.get("x-registry-smoke-token") ?? "";
  // Invalid-token responses intentionally reveal nothing about the route.
  const good = secret.length >= 60 && provided.length === secret.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  if (!good) return respond({ error: "not_found" }, 404);
  if (Date.now() > EXPIRES) return respond({ error: "test_expired" }, 410);
  if (process.env.AGENT_PROVIDER !== "meta" || process.env.REGISTRY_AI_ENABLED !== "true" || !process.env.MODEL_API_KEY) {
    return respond({ error: "meta_not_enabled" }, 503);
  }
  if (++calls > 1) return respond({ error: "qa_budget_exhausted" }, 429);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    let pdf: Buffer;
    try {
      const response = await fetch(SOURCE_URL, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) return respond({ error: "sample_download_failed", httpStatus: response.status }, 502);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 2 * 1024 * 1024) return respond({ error: "sample_oversized" }, 413);
      pdf = Buffer.from(bytes);
    } finally { clearTimeout(timer); }
    const digest = createHash("sha256").update(pdf).digest("hex");
    if (digest !== SOURCE_SHA || !isPlausiblePdf(pdf)) {
      return respond({ error: "sample_sha_mismatch", bytes: pdf.length }, 412);
    }
    const modelController = new AbortController();
    const kill = setTimeout(() => modelController.abort(), 40000);
    try {
      const response = await fetch("https://api.meta.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MODEL_API_KEY}` },
        body: JSON.stringify(buildRegistryMetaRequest(pdf)),
        signal: modelController.signal,
        cache: "no-store",
      });
      const rawText = await response.text();
      if (!response.ok) {
        let safeDetail = "";
        try { const body = JSON.parse(rawText); safeDetail = String(body?.error?.message ?? "").slice(0, 210); } catch {}
        return respond({ error: "meta_http_error", httpStatus: response.status, details: safeDetail }, 502);
      }
      let raw: unknown;
      try { raw = JSON.parse(rawText); } catch { return respond({ error: "meta_invalid_json" }, 502); }
      const msg = parseChatResponse(raw);
      if (!msg) return respond({ error: "meta_no_text" }, 502);
      let extracted: unknown;
      try { extracted = JSON.parse(msg.text); } catch {
        return respond({ error: "meta_no_structured_json", excerpt: msg.text.slice(0, 170) }, 502);
      }
      const draft = validateRegistryDraft(extracted);
      if (!draft) return respond({ error: "validation_rejected" }, 422);
      return respond({
        provider: "meta",
        model: process.env.MODEL_MODEL ?? "muse-spark-1.3",
        source: "synthetic-normal.pdf",
        validated: true,
        draft,
        checks: {
          address: draft.address.value === "서울특별시 가상구 샘플로 10길 101",
          buildingName: draft.buildingName.value === "당당아파트",
          buildingDong: draft.buildingDong.value === "105",
          floor: draft.floor.value === "5",
          unit: draft.unit.value === "501",
          exclusiveArea: draft.exclusiveAreaSqm.value === "59.84",
        },
      });
    } finally { clearTimeout(kill); }
  } catch (error) {
    return respond({ error: error instanceof Error && error.name === "AbortError" ? "timeout" : "unexpected_error" }, 502);
  }
}
