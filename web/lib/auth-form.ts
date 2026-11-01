/**
 * Supabase Auth requests are kept server-side. Credentials are never stored
 * in application tables, user_metadata.role, logs or the Git repository.
 */
export const EMAIL_RE = /^[^\s@\x00-\x1f]{1,64}@[^\s@\x00-\x1f]{1,190}\.[^\s@\x00-\x1f]+$/;
export function cleanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}
export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10 && value.length <= 72 &&
    /[A-Za-z]/.test(value) && /[0-9]/.test(value);
}
export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name=value.trim();
  if (name.length < 2 || name.length > 40 || /[\x00-\x1f\x7f]/.test(name)) return null;
  return name;
}
/** Avoid reporting Supabase account existence, raw provider error details or tokens. */
export function authFailure(status:number):{status:number;message:string} {
  if (status === 429) return {status:429,message:"요청이 많습니다. 잠시 후 다시 시도해주세요."};
  if (status >= 500) return {status:502,message:"인증 서비스가 일시적으로 응답하지 않습니다."};
  if (status === 400 || status === 422) return {status:400,message:"회원가입을 처리하지 못했습니다. 비밀번호 조건이나 이메일 인증 설정을 확인해주세요."};
  if (status === 403) return {status:403,message:"현재 이메일 회원가입이 제한되어 있습니다."};
  return {status:400,message:"요청을 처리하지 못했습니다. 입력 내용을 확인해주세요."};
}
