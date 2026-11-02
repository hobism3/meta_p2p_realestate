"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { EMPTY_FILTERS, filterListings, formatPrice, type Filters, type Listing } from "../lib/listings";
import { loadAllListings, seedCount } from "../lib/store";
import { listingPhoto, listingPhotoAlt, groupListingFeatures } from "../lib/listing-presentation";
import { useUiLocale } from "../lib/ui-locale";

const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

export default function HomePage() {
  const {tr,en} = useUiLocale();
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
      <section className="entry-hero" aria-labelledby="entry-heading">
        <div className="entry-heading">
          <span className="intro-kicker">✦ DirectHome · {tr("AI 직거래 파트너","AI-assisted home transactions")}</span>
          <h1 id="entry-heading">{tr("어떤 목적으로 오셨나요?","What would you like to do?")}</h1>
          <p className="meta"><a className="btn ghost" href="/showcase">{tr("DirectHome 기능을 순서대로 체험하기 ↗","Explore the DirectHome guided demo ↗")}</a></p>
          <p>{tr("집을 내놓는 사람도, 새로운 집을 찾는 사람도.","Owners and home seekers, welcome.")}<br />{tr("원하는 일을 골라 시작하세요.","Choose where to begin.")}</p>
        </div>
        <div className="entry-options" role="group" aria-label={tr("이용 목적 선택","Choose your role")}>
          <a className="entry-role-card is-owner" href="/owner" aria-label={tr("집주인이신가요? 내 집 관리로 이동","Go to owner workspace")}>
            <span className="entry-role-symbol" aria-hidden="true">⌂</span>
            <span className="entry-role-tag">{tr("임대인 · 매도인","Owner · Seller")}</span>
            <strong>{tr("집주인이신가요?","Are you a homeowner?")}</strong>
            <span className="entry-role-detail">{tr("매물 등록부터 AI 문의 응대, 방문 예약 승인까지 한곳에서 관리하세요.","List your home, handle repeat inquiries with AI, and approve visits in one place.")}</span>
            <span className="entry-role-link">{tr("내 집 관리 시작하기 ","Open owner hub ")}<span aria-hidden="true">↗</span></span>
          </a>
          <a className="entry-role-card is-seeker" href="#properties" aria-label={tr("집을 구하시나요? 매물 둘러보기","Browse available homes")}>
            <span className="entry-role-symbol" aria-hidden="true">⌕</span>
            <span className="entry-role-tag">{tr("임차인 · 매수인","Renter · Buyer")}</span>
            <strong>{tr("집을 구하시나요?","Looking for a home?")}</strong>
            <span className="entry-role-detail">{tr("지도와 리스트로 매물을 찾고, 문의하고, 방문 일정을 신청하세요.","Search homes on a map or in a list, ask questions, and request visits.")}</span>
            <span className="entry-role-link">{tr("집 찾아보기 ","Explore homes ")}<span aria-hidden="true">↗</span></span>
          </a>
        </div>
        <p className="entry-note">{tr("같은 계정으로 두 기능을 모두 이용할 수 있습니다. 선택은 권한이나 소유자 인증을 변경하지 않습니다.","One account can be used for both roles. Choosing a path does not verify ownership or change permissions.")}</p>
      </section>
      <section className="card search-panel" id="properties">
        <div className="section-head"><div><span className="eyebrow">FIND YOUR SPACE</span><h2>{tr("관악구 신림동에서 내게 맞는 집 둘러보기","Explore homes around Sillim, Seoul")}</h2></div><span className="pill">{tr("시연용 합성 매물","Fictional demo listings")}</span></div>
        <p className="meta">
          {en ? `Fictional demos: ${seedCount()} · User listings: ${Math.max(0,all.length-seedCount())}. Ownership and posting rights are not verified.` : <>기본 합성 매물 {seedCount()}건 · 사용자 등록 매물 {Math.max(0, all.length - seedCount())}건. 사용자 등록 정보의 소유자·게시권한·권리관계는 검증되지 않았습니다.</>}
        </p>
        {loading && <p className="meta">{tr("불러오는 중...","Loading listings...")}</p>}
        {error && <p className="error">{error} <button className="btn ghost" onClick={reload}>{tr("다시 시도","Try again")}</button></p>}
        <div className="viewtoggle">
          <button className={buying ? "btn ghost" : "btn"} aria-pressed={!buying} onClick={() => { setMarket("rent"); set({ tradeType: "", salePriceMax: null }); }}>{tr("월세·전세 구하기","Rent or jeonse")}</button>
          <button className={buying ? "btn" : "btn ghost"} aria-pressed={buying} onClick={() => { setMarket("sale"); set({ tradeType: "매매", depositMax: null, rentMax: null }); }}>{tr("집 사기","Buy a home")}</button>
        </div>
        <div className="searchbar">
          <input
            placeholder={tr("지역·주소·키워드 검색 (예: 신림로, 투룸)","Search location, address, or keywords")}
            value={f.query}
            onChange={(e) => set({ query: e.target.value })}
          />
          <select aria-label={tr("거래유형 상세","Transaction type")} value={f.tradeType} onChange={(e) => set({ tradeType: e.target.value as Filters["tradeType"] })}>
            {buying ? <option value="매매">{tr("매매","Sale")}</option> : <><option value="">{tr("월세·전세 전체","All rentals")}</option><option value="월세">{tr("월세","Monthly rent")}</option><option value="전세">{tr("전세","Jeonse deposit")}</option></>}
          </select>
        </div>
        <div className="searchbar" style={{ marginTop: 8 }}>
          {!buying ? <><select
            aria-label={tr("보증금 상한","Max deposit")}
            value={f.depositMax === null ? "" : String(f.depositMax)}
            onChange={(e) => set({ depositMax: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">{tr("보증금 무관","Any deposit")}</option>
            <option value="1000">{tr("보증금 1000만원 이하","Deposit ≤ ₩10M")}</option>
            <option value="3000">{tr("보증금 3000만원 이하","Deposit ≤ ₩30M")}</option>
            <option value="10000">{tr("보증금 1억원 이하","Deposit ≤ ₩100M")}</option>
          </select>
          <select
            value={f.rentMax === null ? "" : String(f.rentMax)}
            onChange={(e) => set({ rentMax: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">{tr("월세 무관","Any rent")}</option>
            <option value="70">{tr("월세 70만원 이하","Rent ≤ ₩700K")}</option>
            <option value="90">{tr("월세 90만원 이하","Rent ≤ ₩900K")}</option>
            <option value="120">{tr("월세 120만원 이하","Rent ≤ ₩1.2M")}</option>
          </select>
          </> : null}
          {buying ? <select
            aria-label={tr("매매가 상한","Maximum sale price")}
            value={f.salePriceMax === null ? "" : String(f.salePriceMax)}
            onChange={(e) => set({ salePriceMax: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">{tr("매매가 무관","Any sale price")}</option>
            <option value="30000">{tr("매매 3억원 이하","Sale ≤ ₩300M")}</option>
            <option value="50000">{tr("매매 5억원 이하","Sale ≤ ₩500M")}</option>
            <option value="100000">{tr("매매 10억원 이하","Sale ≤ ₩1B")}</option>
          </select> : null}
          <select
            value={f.areaMin === null ? "" : String(f.areaMin)}
            onChange={(e) => set({ areaMin: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">{tr("면적 무관","Any area")}</option>
            <option value="23">{tr("23㎡ 이상","23㎡+")}</option>
            <option value="40">{tr("40㎡ 이상","40㎡+")}</option>
            <option value="60">{tr("60㎡ 이상","60㎡+")}</option>
          </select>
        </div>
      </section>

      <div className="viewtoggle results-header" aria-label={tr("결과 보기 방식","Results display")}>
        <button className={view === "list" ? "btn" : "btn ghost"} aria-pressed={view === "list"} onClick={() => setView("list")}>{tr("리스트형","List view")}</button>
        <button className={view === "map" ? "btn" : "btn ghost"} aria-pressed={view === "map"} onClick={() => setView("map")}>{tr("지도형","Map view")}</button>
        <span className="meta" style={{ alignSelf: "center" }}>{tr("조건에 맞는 매물","Matching homes")} <b>{results.length}</b></span>
      </div>

      {view === "list" ? (
        <section className="listings-grid" aria-label={tr("검색된 매물","Search results")}>
          {results.map((l) => (
            <a key={l.id} className="card listing" href={`/listings/${l.id}`}>
              <div className="photo listing-photo">
                {l.synthetic?<><img src={listingPhoto(l)} alt={listingPhotoAlt()} loading="lazy"/><span className="photo-stamp">{tr("AI 생성 시연 이미지","AI-generated demo image")}</span></>:
                 l.coverPhotoUrl?<><img src={l.coverPhotoUrl} alt={tr("게시자가 직접 공개한 매물 사진 · 소유권과 현장 상태 미검증","Owner-provided photo; ownership and condition unverified")} loading="lazy"/><span className="photo-stamp">{tr("게시자 등록 사진 · 미검증","Owner-uploaded · unverified")}</span></>:
                 <span className="photo-stamp">{tr("실제 매물 사진 준비 중","Property photo not available")}</span>}
              </div>
              <div className="listing-labels"><span className="listing-type">{l.tradeType}</span>{!l.editable ? <span className="ai-pill">AI {en?(l.tradeType === "매매" ? "seller":"landlord"):(l.tradeType === "매매" ? "매도자" : "임대인")} {tr("상담","demo")}</span> : null}</div>
              <h3>{l.title}</h3>
              <div className="price">{formatPrice(l)}</div>
              <div className="listing-specs"><span>{l.area}㎡</span><span>{tr("관리비","Monthly fee")} {l.fee}{tr("만원"," × ₩10K")}</span><span>{l.moveIn}</span></div>
              <div className="meta">{l.address}</div>
              <div className="listing-feature-preview">{groupListingFeatures(l.options).lifestyle.slice(0,1).concat(l.options.filter(x => !groupListingFeatures(l.options).lifestyle.includes(x)).slice(0,2)).map(x => <span key={x}>{x}</span>)}</div>
            </a>
          ))}
          {results.length === 0 && <div className="card empty-state">{tr("조건에 맞는 매물이 없습니다.","No homes match these filters.")} <button className="btn ghost" onClick={resetFilters}>{tr("필터 초기화","Clear filters")}</button></div>}
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
                <div className="map-listing-thumbnail">
                  {l.synthetic?<img src={listingPhoto(l)} alt={listingPhotoAlt()} loading="lazy"/>:
                   l.coverPhotoUrl?<img src={l.coverPhotoUrl} alt="게시자 등록 매물 사진" loading="lazy"/>:
                   <span className="meta">{tr("사진 준비 중","Photo pending")}</span>}
                </div>
                <span className="listing-type">{l.tradeType}</span>
                <h3>{l.title}</h3>
                <div className="price">{formatPrice(l)}</div>
                <div className="meta">{l.address} · {l.area}㎡</div>
              </a>
            ))}
            {results.length === 0 && <div className="card empty-state">{tr("조건에 맞는 매물이 없습니다.","No homes match these filters.")} <button className="btn ghost" onClick={resetFilters}>{tr("필터 초기화","Clear filters")}</button></div>}
          </div>
        </div>
      )}
    </div>
  );
}
