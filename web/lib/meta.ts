/**
 * Meta Muse Spark Model API 전송 계층. 서버 전용 모듈이다.
 * 클라이언트 컴포넌트에서 import하지 마. 키는 환경변수에서만 읽는다.
 * 근거: Meta Model API (base https://api.meta.ai/v1, Authorization: Bearer 키,
 * OpenAI 호환 chat completions). base·model은 환경변수로 바꿀 수 있다.
 */

export const META_DEFAULT_BASE = "https://api.meta.ai/v1";
export const META_DEFAULT_MODEL = "muse-spark-1.3";
export const META_TIMEOUT_MS = 20000;
export const META_MAX_TOKENS = 1024;
export const META_HISTORY_LIMIT = 8;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface MetaUsage {
  inputTokens: number;
  outputTokens: number;
}

export type MetaResult =
  | { ok: true; text: string; usage: MetaUsage; latencyMs: number }
  | { ok: false; kind: "no_key" | "timeout" | "http" | "network" | "bad_response"; status?: number; detail?: string; latencyMs: number };

type FetchImpl = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/** chat completions 응답에서 본문·사용량을 뽑는다. 키·대화 원문은 다루지 않는다. */
export function parseChatResponse(data: unknown): { text: string; usage: MetaUsage } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { choices?: unknown; usage?: unknown };
  if (!Array.isArray(d.choices) || d.choices.length === 0) return null;
  const msg = (d.choices[0] as { message?: unknown }).message as
    | { content?: unknown }
    | undefined;
  const c = msg?.content;
  let text = "";
  if (typeof c === "string") text = c;
  else if (Array.isArray(c)) {
    text = c
      .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : ""))
      .join("");
  }
  text = text.trim();
  if (!text) return null;
  const u = (d.usage ?? {}) as { prompt_tokens?: unknown; completion_tokens?: unknown };
  return { text, usage: { inputTokens: num(u.prompt_tokens), outputTokens: num(u.completion_tokens) } };
}

/** 오류 envelope에서 안전한 한 줄 메시지만 뽑는다. 키·대화 원문은 여기에 없다. */
export function errorEnvelopeMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const err = (data as { error?: unknown }).error;
  const msg = typeof err === "string" ? err : (err as { message?: unknown } | null)?.message;
  if (typeof msg !== "string") return "";
  return msg.trim().slice(0, 150);
}

/** 파싱 실패 때 원인 파악용 모양 설명. 값 원문은 담지 않는다. */
export function describeBodyShape(data: unknown): string {
  if (data === null || data === undefined) return "empty";
  if (typeof data !== "object") return `type:${typeof data}`;
  const d = data as { choices?: unknown };
  const keys = Object.keys(d).join(",");
  if (!Array.isArray(d.choices)) return `keys:${keys} choices:-1`;
  if (d.choices.length === 0) return `keys:${keys} choices:0`;
  const first = d.choices[0] as { message?: unknown; finish_reason?: unknown; finishReason?: unknown };
  const m = (first?.message ?? {}) as Record<string, unknown>;
  const mkeys = Object.keys(m).join("+") || "none";
  const c = m.content;
  const ctype = Array.isArray(c) ? `array[${c.length}]` : c === null ? "null" : typeof c;
  const fin = first?.finish_reason ?? (first as { finishReason?: unknown }).finishReason ?? "?";
  return `keys:${keys} choices:${d.choices.length} msg:${mkeys} content:${ctype} finish:${String(fin)}`;
}

function refusalMessage(data: unknown): string {
  try {
    const ch = (data as { choices?: unknown[] }).choices;
    if (!Array.isArray(ch) || ch.length === 0) return "";
    const m = (ch[0] as { message?: unknown }).message as { refusal?: unknown } | undefined;
    const r = m?.refusal;
    if (typeof r === "string" && r.trim()) return r.trim().slice(0, 150);
    return "";
  } catch {
    return "";
  }
}

/** envelope → refusal → 모양 순으로 안전한 단서를 뽑는다. */
export function responseAnomaly(data: unknown): string {
  return errorEnvelopeMessage(data) || refusalMessage(data) || describeBodyShape(data);
}

export interface MetaCallInput {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  timeoutMs: number;
}

export interface MetaCallOptions {
  key?: string;
  base?: string;
  model?: string;
  fetchImpl?: FetchImpl;
}

/** 실제 모델 호출 1회. 키가 없으면 네트워크에 닿기 전에 no_key로 끝난다. */
export async function callMeta(input: MetaCallInput, opts: MetaCallOptions = {}): Promise<MetaResult> {
  const started = Date.now();
  const key = opts.key ?? process.env.MODEL_API_KEY ?? "";
  if (!key) return { ok: false, kind: "no_key", latencyMs: 0 };
  const base = (opts.base ?? process.env.MODEL_API_BASE ?? META_DEFAULT_BASE).replace(/\/+$/, "");
  const model = opts.model ?? process.env.MODEL_MODEL ?? META_DEFAULT_MODEL;
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchImpl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs);
  try {
    const r = await fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: input.system }, ...input.messages],
        max_tokens: input.maxTokens,
        temperature: 0.7,
        reasoning_effort: "minimal",
      }),
      signal: ctrl.signal,
    });
    const latencyMs = Date.now() - started;
    if (!r.ok) {
      const detail = errorEnvelopeMessage(await r.json().catch(() => null));
      return { ok: false, kind: "http", status: r.status, detail, latencyMs };
    }
    const raw = (await r.json().catch(() => null)) as unknown;
    const parsed = parseChatResponse(raw);
    if (!parsed) {
      return { ok: false, kind: "bad_response", status: r.status, detail: responseAnomaly(raw), latencyMs };
    }
    return { ok: true, text: parsed.text, usage: parsed.usage, latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - started;
    if (e instanceof Error && e.name === "AbortError") return { ok: false, kind: "timeout", latencyMs };
    return { ok: false, kind: "network", latencyMs };
  } finally {
    clearTimeout(timer);
  }
}
