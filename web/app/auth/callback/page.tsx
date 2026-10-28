"use client";

import { useEffect, useState } from "react";
import { setAccessToken } from "../../../lib/client-auth";

// 소셜 로그인 귀환점. URL fragment의 토큰을 저장하고 홈으로 보낸다.
// 토큰은 브라우저에만 두고 서버·DB에 비밀번호를 남기지 않는다.
export default function AuthCallbackPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const err = hash.get("error_description") ?? hash.get("error");
    if (err) {
      setError(err);
      return;
    }
    const token = hash.get("access_token");
    if (!token) {
      setError("토큰 없음. Supabase 제공자·리다이렉트 설정을 확인하세요.");
      return;
    }
    setAccessToken(token);
    window.location.replace("/");
  }, []);

  return (
    <div className="grid">
      <section className="card">
        <h2>로그인 처리 중</h2>
        {error ? (
          <div>
            <p className="error">{error}</p>
            <p>
              <a href="/login">로그인으로 돌아가기</a>
            </p>
          </div>
        ) : (
          <p className="meta">잠시만 기다리세요...</p>
        )}
      </section>
    </div>
  );
}
