"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { EMPTY_FILTERS, filterListings, formatPrice, type Filters, type Listing } from "../lib/listings";
import { loadAllListings, seedCount } from "../lib/store";
import { listingPhoto, listingPhotoAlt, groupListingFeatures } from "../lib/listing-presentation";

const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

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
  const resetFilters = () => setF({ ...EMPTY_FILTERS, tradeType: market === "sale" ? "매매" : "" });
  const buying = market === "sale";

  return (
    <div className="grid home-page">
      <section className="site-intro">
        <div className="intro-copy">
          <span className="intro-kicker"><span aria-hidden="true">✦</span> DirectHome · AI 거래 도우미</span>
          <h1>집을 찾는 일부터,<br /><em>조건을 확인하는 일</em>까지.</h1>
          <p>찾고, 묻고, 합의하는 부동산 직거래.<br />AI 임대인·매도자와 대화하고, 집톡이와 거래 조건을 한눈에 정리하세요.</p>
          <div className="intro-actions">
            <a className="btn intro-primary" href="#properties">매물 둘러보기 <span aria-hidden="true">↗</span></a>
            <a className="btn intro-secondary" href="/rooms">내 거래방</a>
          </div>
          <div className="intro-steps" aria-label="이용 순서">
            <span><b>01</b> 관심 매물 찾기</span><span><b>02</b> AI와 조건 협상</span><span><b>03</b> 집톡이로 합의 확인</span>
          </div>
        </div>
        <div className="intro-visual" aria-hidden="true">
          <img src="/images/demo-living-skyline.webp" alt="" />
          <div className="intro-floating-card"><span className="intro-floating-icon">✦</span><span><b>집톡이 AI</b><small>대화 속 조건을 정확하게 정리</small></span></div>
          <span className="intro-photo-label">AI 생성 시연 이미지</span>
        </div>
      </section>
      <section className="card search-panel" id="properties">
        <div className="section-head"><div><span className="eyebrow">FIND YOUR SPACE</span><h2>관악구 신림동에서 내게 맞는 집 둘러보기</h2></div><span className="pill">시연용 합성 매물</span></div>
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
        <span className="meta" style={{ alignSelf: "center" }}>조건에 맞는 매물 <b>{results.length}건</b></span>
      </div>

      {view === "list" ? (
        <section className="listings-grid" aria-label="검색된 매물">
          {results.map((l) => (
            <a key={l.id} className="card listing" href={`/listings/${l.id}`}>
              <div className="photo listing-photo"><img src={listingPhoto(l)} alt={listingPhotoAlt()} loading="lazy" /><span className="photo-stamp">AI 생성 시연 이미지</span></div>
              <div className="listing-labels"><span className="listing-type">{l.tradeType}</span>{!l.editable ? <span className="ai-pill">AI {l.tradeType === "매매" ? "매도자" : "임대인"} 상담</span> : null}</div>
              <h3>{l.title}</h3>
              <div className="price">{formatPrice(l)}</div>
              <div className="listing-specs"><span>{l.area}㎡</span><span>관리비 {l.fee}만원</span><span>{l.moveIn}</span></div>
              <div className="meta">{l.address}</div>
              <div className="listing-feature-preview">{groupListingFeatures(l.options).lifestyle.slice(0,1).concat(l.options.filter(x => !groupListingFeatures(l.options).lifestyle.includes(x)).slice(0,2)).map(x => <span key={x}>{x}</span>)}</div>
            </a>
          ))}
          {results.length === 0 && <div className="card empty-state">조건에 맞는 매물이 없습니다. <button className="btn ghost" onClick={resetFilters}>필터 초기화</button></div>}
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
                onFocus={() => setSelected(l.id)}
              >
                <div className="map-listing-thumbnail"><img src={listingPhoto(l)} alt={listingPhotoAlt()} loading="lazy" /></div>
                <span className="listing-type">{l.tradeType}</span>
                <h3>{l.title}</h3>
                <div className="price">{formatPrice(l)}</div>
                <div className="meta">{l.address} · {l.area}㎡</div>
              </a>
            ))}
            {results.length === 0 && <div className="card empty-state">조건에 맞는 매물이 없습니다. <button className="btn ghost" onClick={resetFilters}>필터 초기화</button></div>}
          </div>
        </div>
      )}
    </div>
  );
}
