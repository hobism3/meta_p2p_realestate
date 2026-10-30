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
  const [market, setMarket] = useState<"rent" | "sale">("rent");
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

  // Supabase가 콜백 대신 Site URL로 돌려보낸 경우 토큰을 회수한다.
  useEffect(() => {
    if (window.location.hash.includes("access_token")) {
      window.location.replace(`/auth/callback${window.location.hash}`);
    }
  }, []);

  const results = useMemo(() => filterListings(all, f).filter((l) => market === "sale" ? l.tradeType === "매매" : l.tradeType !== "매매"), [all, f, market]);

  const set = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }));
  const buying = market === "sale";

  return (
    <div className="grid home-page">
      <section className="site-intro">
        <span className="intro-kicker">DIRECTHOME · AI 직거래 시연</span>
        <h1>집을 찾는 순간부터,<br />조건을 확인하는 순간까지</h1>
        <p>매물 탐색, 자연스러운 거래 대화, 집톡이의 조건 정리와 양측 동의까지 하나의 흐름으로 경험하세요.</p>
        <div className="intro-actions">
          <a className="btn intro-primary" href="#properties">매물 둘러보기</a>
          <a className="btn intro-secondary" href="/rooms">내 거래방</a>
        </div>
        <div className="intro-steps" aria-label="이용 순서">
          <span><b>01</b> 매물 선택</span><span><b>02</b> AI 상담·협상</span><span><b>03</b> 집톡이 조건 확인</span>
        </div>
      </section>
      <section className="card search-panel" id="properties">
        <div className="section-head"><h2>관악구 신림동 가상 매물 탐색</h2><span className="pill">시연용 합성 매물</span></div>
        <p className="meta">
          합성 데이터 {all.length}건(기본 {seedCount()}건 포함)입니다. 실매물·소유자 인증이 아닙니다.
        </p>
        {loading && <p className="meta">불러오는 중...</p>}
        {error && <p className="error">{error} <button className="btn ghost" onClick={reload}>다시 시도</button></p>}
        <div className="viewtoggle">
          <button className={buying ? "btn ghost" : "btn"} aria-pressed={!buying} onClick={() => { setMarket("rent"); set({ tradeType: "", salePriceMax: null }); }}>월세·전세 구하기</button>
          <button className={buying ? "btn" : "btn ghost"} aria-pressed={buying} onClick={() => { setMarket("sale"); set({ tradeType: "매매", depositMax: null, rentMax: null }); }}>집 사기</button>
        </div>
        <div className="searchbar">
          <input
            placeholder="지역·주소·키워드 검색 (예: 신림로, 투룸)"
            value={f.query}
            onChange={(e) => set({ query: e.target.value })}
          />
          <select aria-label="거래유형 상세" value={f.tradeType} onChange={(e) => set({ tradeType: e.target.value as Filters["tradeType"] })}>
            {buying ? <option value="매매">매매</option> : <><option value="">월세·전세 전체</option><option value="월세">월세</option><option value="전세">전세</option></>}
          </select>
        </div>
        <div className="searchbar" style={{ marginTop: 8 }}>
          {!buying ? <><select
            aria-label="보증금 상한"
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
          </> : null}
          {buying ? <select
            aria-label="매매가 상한"
            value={f.salePriceMax === null ? "" : String(f.salePriceMax)}
            onChange={(e) => set({ salePriceMax: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">매매가 무관</option>
            <option value="30000">매매 3억원 이하</option>
            <option value="50000">매매 5억원 이하</option>
            <option value="100000">매매 10억원 이하</option>
          </select> : null}
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

      <div className="viewtoggle results-header" aria-label="결과 보기 방식">
        <button className={view === "list" ? "btn" : "btn ghost"} aria-pressed={view === "list"} onClick={() => setView("list")}>리스트형</button>
        <button className={view === "map" ? "btn" : "btn ghost"} aria-pressed={view === "map"} onClick={() => setView("map")}>지도형</button>
        <span className="meta" style={{ alignSelf: "center" }}>검색 결과 {results.length}건</span>
      </div>

      {view === "list" ? (
        <section className="listings-grid" aria-label="검색된 매물">
          {results.map((l) => (
            <a key={l.id} className="card listing" href={`/listings/${l.id}`}>
              <div className="photo" style={{ background: photoColor(l.id) }}><span>가상 이미지 · 합성 매물</span></div>
              <div className="listing-labels"><span className="listing-type">{l.tradeType}</span>{!l.editable ? <span className="ai-pill">AI {l.tradeType === "매매" ? "매도자" : "임대인"} 상담</span> : null}</div>
              <h3>{l.title}</h3>
              <div className="price">{formatPrice(l)}</div>
              <div className="meta">{l.address} · {l.area}㎡ · 관리비 {l.fee}만원</div>
              <div><span className="synth">합성 데이터</span></div>
            </a>
          ))}
          {results.length === 0 && <div className="card empty-state">조건에 맞는 매물이 없습니다. <button className="btn ghost" onClick={() => { setF(EMPTY_FILTERS); }}>필터 초기화</button></div>}
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
            {results.length === 0 && <div className="card empty-state">조건에 맞는 매물이 없습니다. <button className="btn ghost" onClick={() => { setF(EMPTY_FILTERS); }}>필터 초기화</button></div>}
          </div>
        </div>
      )}
    </div>
  );
}
