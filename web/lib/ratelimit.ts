// 메모리 고정윈도우 rate limit. 서버리스 다중 인스턴스에서는 근사치다.
// 정확 제한은 Supabase 이후 게이트웨이에서 처리한다.
interface Bucket {
  count: number;
  reset: number;
}

export function limitFor(): number {
  const n = Number(process.env.RATE_LIMIT_PER_MIN ?? 120);
  return Number.isFinite(n) && n > 0 ? n : 120;
}

export function allow(
  buckets: Map<string, Bucket>,
  key: string,
  nowMs: number,
  limit: number,
): { ok: boolean; retryAfter: number } {
  const b = buckets.get(key);
  if (!b || nowMs >= b.reset) {
    buckets.set(key, { count: 1, reset: nowMs + 60_000 });
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > limit) return { ok: false, retryAfter: Math.ceil((b.reset - nowMs) / 1000) };
  return { ok: true, retryAfter: 0 };
}

const buckets = new Map<string, Bucket>();

export function checkRate(key: string): { ok: boolean; retryAfter: number } {
  if (buckets.size > 10000) buckets.clear();
  return allow(buckets, key, Date.now(), limitFor());
}
