"use client";

import { useEffect, useState } from "react";

export type UiLocale = "ko" | "en";
const KEY = "directhome.ui.locale";
const EVENT = "directhome:ui-locale";

function readLocale(): UiLocale {
  if (typeof window === "undefined") return "ko";
  const query = new URLSearchParams(window.location.search).get("lang");
  if (query === "en" || query === "ko") return query;
  try { return window.localStorage.getItem(KEY) === "en" ? "en" : "ko"; }
  catch { return "ko"; }
}

export function useUiLocale() {
  // Korean server/default rendering avoids mismatched hydration.
  const [locale, setLocaleState] = useState<UiLocale>("ko");
  useEffect(() => {
    const sync = () => {
      const current = readLocale();
      setLocaleState(current);
      document.documentElement.lang = current;
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const choose = (value: UiLocale) => {
    try { window.localStorage.setItem(KEY, value); } catch { /* optional */ }
    // Explicit query overrides storage; keep it in sync for shareable EN links.
    const url = new URL(window.location.href);
    if (url.pathname === "/showcase") {
      url.searchParams.set("lang", value);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    setLocaleState(value);
    document.documentElement.lang = value;
    window.dispatchEvent(new Event(EVENT));
  };
  return { locale, choose, en: locale === "en", tr: (ko: string, en: string) => locale === "en" ? en : ko };
}
