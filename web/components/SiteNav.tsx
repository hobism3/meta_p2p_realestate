"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { clearAccessToken, getAccessToken } from "../lib/client-auth";
import { useUiLocale } from "../lib/ui-locale";

type Me = { userId: string; name: string; mode: string };

// 로그인되면 로그인 링크를 숨기고 이름+로그아웃을 보여준다.
export default function SiteNav() {
  const [me, setMe] = useState<Me | null>(null);
  const {locale, choose, tr} = useUiLocale();
  const pathname = usePathname();
  const loginUrl = pathname && pathname !== "/" && pathname !== "/login"
    ? "/login?next=" + encodeURIComponent(pathname)
    : "/login";

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
    <nav className="site-nav" aria-label="주요 메뉴">
      <a href="/">{tr("집 찾기","Explore homes")}</a>
      <a href="/register">{tr("매물 등록","List a home")}</a>
      <a href="/registry/check">{tr("등기 권리 확인","Property rights")}</a>
      <a href="/showcase">{tr("서비스 체험","Demo tour")}</a>
      {me ? (
        <>
          <a href="/rooms">{tr("내 거래방","Deal rooms")}</a>
          <a href="/owner">{tr("내 집 관리","Owner hub")}</a>
          <span className="meta nav-user" title={me.name}>{me.name}</span>
          <button className="btn ghost" onClick={logout}>
            {tr("로그아웃","Log out")}
          </button>
        </>
      ) : (
        <><a href="/login?mode=signup">{tr("회원가입","Sign up")}</a><a href={loginUrl}>{tr("로그인","Log in")}</a></>
      )}
      <div className="nav-locale" role="group" aria-label="Interface language / 언어">
        <button type="button" aria-pressed={locale==="ko"} className={locale==="ko"?"is-selected":""}
          onClick={()=>choose("ko")}>KR</button>
        <span aria-hidden="true">/</span>
        <button type="button" aria-pressed={locale==="en"} className={locale==="en"?"is-selected":""}
          onClick={()=>choose("en")}>EN</button>
      </div>
    </nav>
  );
}
