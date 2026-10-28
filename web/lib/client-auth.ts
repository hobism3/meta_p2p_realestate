// 브라우저에 저장된 Supabase access_token을 쓰기 요청에 붙인다.
// 서버 검증은 Authorization: Bearer 하나로만 한다.
const KEY = "directhome.access_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setAccessToken(token: string): void {
  window.localStorage.setItem(KEY, token);
}

export function clearAccessToken(): void {
  window.localStorage.removeItem(KEY);
}

export function authHeaders(): Record<string, string> {
  const t = getAccessToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
