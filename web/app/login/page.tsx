"use client";

import { useEffect, useState } from "react";
import { clearAccessToken, getAccessToken, setAccessToken } from "../../lib/client-auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [me, setMe] = useState<{ userId: string; name: string; mode: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [queryError, setQueryError] = useState("");

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e === "unconfigured") setQueryError("서버 인증 미설정입니다. 관리자에게 문의하세요.");
    else if (e === "provider") setQueryError("지원하지 않는 로그인 방식입니다.");
    else if (e) setQueryError(e);
  }, []);

  const loadMe = async () => {
    const token = getAccessToken();
    if (!token) { setMe(null); return; }
    try {
      const r = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { setMe(null); return; }
      setMe((await r.json()) as { userId: string; name: string; mode: string });
    } catch {
      setMe(null);
    }
  };

  useEffect(() => { loadMe(); }, []);

  const login = async () => {
    if (!email.trim() || !password) { setError("이메일·비밀번호 필수"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = (await r.json()) as { error?: string; access_token?: string };
      if (!r.ok || !body.access_token) {
        setError(r.status === 503 ? "서버 인증 미설정(로컬 dev 모드)" : (body.error ?? "로그인 실패"));
        return;
      }
      setAccessToken(body.access_token);
      setPassword("");
      setError("");
      await loadMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인 실패");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    const token = getAccessToken();
    try {
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } finally {
      clearAccessToken();
      setMe(null);
    }
  };

  return (
    <div className="grid">
      <section className="card">
        <h2>로그인</h2>
        <p className="meta">시연용입니다. 실제 개인정보를 입력하지 마세요.</p>
        {me ? (
          <div>
            <p>로그인됨: {me.name} ({me.mode})</p>
            <button onClick={logout}>로그아웃</button>
          </div>
        ) : (
          <div>
            <div className="field">
              <label>이메일</label>
              <input value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>비밀번호</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button onClick={login} disabled={busy}>{busy ? "확인 중..." : "로그인"}</button>
            {error ? <p className="error">{error}</p> : null}
            {queryError ? <p className="error">{queryError}</p> : null}
            <div className="field">
              <label>간편 로그인</label>
              <p className="meta">Google 계정으로 계속합니다.</p>
              <p>
                <a className="btn" href="/api/auth/oauth?provider=google">Google로 계속</a>
              </p>
            </div>
          </div>
        )}
        <p><a href="/">돌아가기</a></p>
      </section>
    </div>
  );
}
