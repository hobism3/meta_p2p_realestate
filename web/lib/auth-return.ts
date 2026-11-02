/**
 * Local return-target validation shared by OAuth initiation and callback.
 * Never trust a query-param redirect as a full URL: protect against open redirects,
 * protocol-relative URLs, backslash normalization and encoded variants.
 */
export function safeAuthDestination(value: string | null | undefined, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith("/") || decoded.startsWith("//") ||
        decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) return fallback;
    const parsed = new URL(value, "https://local-login.invalid");
    if (parsed.origin !== "https://local-login.invalid") return fallback;
    return value;
  } catch {
    return fallback;
  }
}
