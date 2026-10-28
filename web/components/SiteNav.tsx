"use client";

import { useEffect, useState } from "react";
import { clearAccessToken, getAccessToken } from "../lib/client-auth";

type Me = { userId: string; name: string; mode: string };

// 로그인되면 로그인 링크를 숨기고 이름+로그아웃을 보여준다.
export default function SiteNav() {
  const [me, setMe] = useState<Me | null>(null);

  const refresh = async () => {
    const token = getAccessToken();
    if (!token) {
      setMe(null);
      return;
    }
    try {
      const r = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) setMe(null);
      else setMe((await r.json()) as Me);
    } catch {
      setMe(null);
    }
  };

  useEffect(() => {
    refresh();
    window.addEventListener("directhome:auth", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("directhome:auth", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

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
    <nav style={{ alignItems: "center" }}>
      <a href="/">탐색</a>
      <a href="/register">매물 등록</a>
      {me ? (
        <>
          <span className="meta">{me.name}</span>
          <button className="btn ghost" onClick={logout}>
            로그아웃
          </button>
        </>
      ) : (
        <a href="/login">로그인</a>
      )}
    </nav>
  );
}
