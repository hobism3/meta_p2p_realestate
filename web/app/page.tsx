"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { EMPTY_FILTERS, filterListings, formatPrice, type Filters, type Listing } from "../lib/listings";
import { loadAllListings, seedCount } from "../lib/store";

const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

const PHOTO_COLORS = ["#2e6b4f", "#375f8a", "#7a5c38", "#5d4a7a"];

function photoColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997;
  return PHOTO_COLORS[h % PHOTO_COLORS.length];
}

export default function HomePage() {
  const [all, setAll] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"list" | "map">("list");
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    setError("");
    loadAllListings()
      .then(setAll)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const results = useMemo(() => filterListings(all, f), [all, f]);

  const set = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }));

  return (
    <div className="grid">
      <section className="card">
        <h2>관악구 신림동 가상 매물 탐색</h2>
        <p className="meta">
          합성 데이터 {all.length}건(기본 {seedCount()}건 포함)입니다. 실매물·소유자 인증이 아닙니다.
        </p>
        {loading && <p className="meta">불러오는 중...</p>}
        {error && <p className="error">{error} <button className="btn ghost" onClick={reload}>다시 시도</button></p>}
        <div className="searchbar">
          <input
            placeholder="지역·주소·키워드 검색 (예: 신림로, 투룸)"
            value={f.query}
            onChange={(e) => set({ query: e.target.value })}
          />
          <select value={f.tradeType} onChange={(e) => set({ tradeType: e.target.value as Filters["tradeType"] })}>
            <option value="">전체 유형</option>
            <option value="월세">월세</option>
            <option value="전세">전세</option>
          </select>
        </div>
        <div className="searchbar" style={{ marginTop: 8 }}>
          <select
            value={f.depositMax === null ? "" : String(f.depositMax)}
            onChange={(e) => set({ depositMax: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">보증금 무관</option>
            <option value="1000">보증금 1000만원 이하</option>
            <option value="3000">보증금 3000만원 이하</option>
            <option value="10000">보증금 1억원 이하</option>
          </select>
          <select
            value={f.rentMax === null ? "" : String(f.rentMax)}
            onChange={(e) => set({ rentMax: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">월세 무관</option>
            <option value="70">월세 70만원 이하</option>
            <option value="90">월세 90만원 이하</option>
            <option value="120">월세 120만원 이하</option>
          </select>
          <select
            value={f.areaMin === null ? "" : String(f.areaMin)}
            onChange={(e) => set({ areaMin: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">면적 무관</option>
            <option value="23">23㎡ 이상</option>
            <option value="40">40㎡ 이상</option>
            <option value="60">60㎡ 이상</option>
          </select>
        </div>
      </section>

      <div className="viewtoggle">
        <button className={view === "list" ? "btn" : "btn ghost"} onClick={() => setView("list")}>리스트형</button>
        <button className={view === "map" ? "btn" : "btn ghost"} onClick={() => setView("map")}>지도형</button>
        <span className="meta" style={{ alignSelf: "center" }}>검색 결과 {results.length}건</span>
      </div>

      {view === "list" ? (
        <section className="grid">
          {results.map((l) => (
            <a key={l.id} className="card listing" href={`/listings/${l.id}`}>
              <div className="photo" style={{ background: photoColor(l.id) }}>가상 이미지</div>
              <h3>{l.title}</h3>
              <div className="price">{formatPrice(l)}</div>
              <div className="meta">{l.address} · {l.area}㎡ · 관리비 {l.fee}만원</div>
              <div><span className="synth">합성 데이터</span></div>
            </a>
          ))}
          {results.length === 0 && <div className="card">조건에 맞는 매물이 없습니다.</div>}
        </section>
      ) : (
        <div className="layout">
          <MapView listings={results} selectedId={selected} onSelect={setSelected} />
          <div className="side grid">
            {results.map((l) => (
              <a
                key={l.id}
                className="card listing"
                href={`/listings/${l.id}`}
                style={l.id === selected ? { borderColor: "#0f6c3f", borderWidth: 2 } : undefined}
                onMouseEnter={() => setSelected(l.id)}
              >
                <h3>{l.title}</h3>
                <div className="price">{formatPrice(l)}</div>
                <div className="meta">{l.address} · {l.area}㎡</div>
              </a>
            ))}
            {results.length === 0 && <div className="card">조건에 맞는 매물이 없습니다.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
