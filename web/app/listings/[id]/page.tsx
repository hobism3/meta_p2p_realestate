"use client";

import { useEffect, useState } from "react";
import { formatPrice, type Listing } from "../../../lib/listings";
import { groupListingFeatures, initialTerms, listingPhoto, listingPhotoAlt } from "../../../lib/listing-presentation";
import { getAccessToken } from "../../../lib/client-auth";
import { createRoom, findListing, loadMyRooms } from "../../../lib/store";
import ListingReportPanel from "../../../components/ListingReportPanel";
import ListingRightsBrief from "../../../components/ListingRightsBrief";
import {useUiLocale} from "../../../lib/ui-locale";

export default function DetailPage({ params }: { params: { id: string } }) {
  const {tr,en}=useUiLocale();
  const [listing, setListing] = useState<Listing | null>(null);
  const [missing, setMissing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [existingRid, setExistingRid] = useState<string | null>(null);
  const [askError, setAskError] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [gallery,setGallery]=useState<Array<{id:string;url:string;room:string;masked:boolean}>>([]);

  useEffect(() => {
    findListing(params.id)
      .then((l) => {
        if (!l) setMissing(true);
        else {
          setListing(l);
          setIsCustom(l.editable);
        }
      })
      .catch(() => setMissing(true));
  }, [params.id]);

  useEffect(()=>{
    fetch("/api/listings/"+encodeURIComponent(params.id)+"/gallery",{cache:"no-store"})
      .then(r=>r.ok?r.json():null)
      .then(data=>setGallery(Array.isArray(data?.photos)?data.photos:[]))
      .catch(()=>setGallery([]));
  },[params.id]);

  useEffect(() => {
    if (!getAccessToken()) return;
    loadMyRooms()
      .then((rs) => {
        const f = rs.find((r) => r.listing_id === params.id);
        if (f) setExistingRid(f.id);
      })
      .catch(() => {});
  }, [params.id]);

  if (missing) return <div className="card">매물을 찾을 수 없습니다. <a href="/">{tr("돌아가기","Go back")}</a></div>;
  const onAsk = async () => {
    if (!getAccessToken()) {
      window.location.href = "/login";
      return;
    }
    if (!listing || asking) return;
    setAsking(true);
    setAskError("");
    try {
      const rid = await createRoom(listing.id);
      window.location.href = `/rooms/${rid}`;
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "문의 실패");
      setAsking(false);
    }
  };

  if (!listing) return <div className="card">{tr("불러오는 중...","Loading...")}</div>;

  return (
    <div className="grid detail-page">
      <nav className="detail-breadcrumb" aria-label={tr("위치 경로","Breadcrumb")}><a href="/">{tr("매물 탐색","Explore homes")}</a><span aria-hidden="true">›</span><span>{listing.tradeType}</span><span aria-hidden="true">›</span><span>{listing.title}</span></nav>
      <section className="detail-top">
        <div className="detail-gallery" aria-label={listing.synthetic?"AI 시연 이미지":"게시자 등록 매물 사진"}>
          {listing.synthetic?<><div className="detail-primary-photo">
            <img src={listingPhoto(listing)} alt={listingPhotoAlt()}/>
            <span className="photo-stamp">{tr("AI 생성 시연 이미지 · 실제 매물 사진 아님","AI demo image · Not an actual property photo")}</span>
          </div><div className="detail-secondary-photos">
            <img src="/images/demo-living-light.webp" alt={tr("AI 생성 시연용 실내 이미지","AI-generated demonstration interior")} loading="lazy"/>
            <img src="/images/demo-living-warm.webp" alt={tr("AI 생성 시연용 실내 이미지","AI-generated demonstration interior")} loading="lazy"/>
          </div></>:
          gallery.length?<><div className="detail-primary-photo">
            <img src={gallery[0].url} alt={tr("게시자가 공개한 실제 매물 사진 · 현장·권리관계 미검증","Owner-provided photo; property facts not verified")}/>
            <span className="photo-stamp">{tr("게시자 등록 사진 · 권리관계 인증 아님","Owner-uploaded photo · Rights unverified")}</span>
          </div><div className="detail-secondary-photos">
           {gallery.slice(1).map((photo,i)=><img key={photo.id} src={photo.url}
             alt={"게시자 등록 실내 사진 "+(i+2)} loading="lazy"/>)}
          </div></>:
          <div className="detail-primary-photo" style={{display:"grid",placeItems:"center",minHeight:220}}>
           <p>{tr("아직 게시된 실제 매물 사진이 없습니다. 게시자에게 사진을 요청해 주세요.","No verified real property photos are currently published. Ask the owner for photos.")}</p>
          </div>}
        </div>
        <div className="card listing-detail-head">
          <div className="listing-labels"><span className="listing-type">{listing.tradeType}</span>{!isCustom ? <span className="ai-pill">AI {listing.tradeType === "매매" ? "매도자" : "임대인"} 시연</span> : null}</div>
          <h1>{listing.title}</h1>
          <p className="detail-address">⌖ {listing.address}</p>
          <div className="detail-price">{formatPrice(listing)}</div>
          <div className="detail-highlights"><span><b>{listing.area}㎡</b><small>{tr("전용 면적(입력값)","Floor area (owner-supplied)")}</small></span><span><b>{listing.fee.toLocaleString()}만원</b><small>{tr("월 관리비","Monthly fee")}</small></span><span><b>{listing.moveIn}</b><small>{tr("입주 가능 정보","Move-in availability")}</small></span></div>
          <p className="demo-note">{isCustom ? tr("사용자 등록 매물입니다. 실제 계약 전 소유권과 조건을 반드시 확인하세요.","User-posted property: verify ownership and terms before any transaction.") : tr("24개 합성 시연 매물 중 하나입니다. AI 상대방과 대화를 체험할 수 있으며 실제 계약·예약은 진행되지 않습니다.","Fictional demo listing. You can talk to a simulated AI owner; there is no real contract or booking.")}</p>
          {existingRid ? <a className="btn detail-cta" href={`/rooms/${existingRid}`}>{tr("대화 이어하기 ↗","Continue conversation ↗")}</a> : <button className="btn detail-cta" aria-label={tr("문의하기","Inquire")} onClick={onAsk} disabled={asking}>{asking ? tr("거래방 여는 중...","Opening deal room...") : (isCustom?tr("문의하기","Contact owner"):tr("AI와 문의하기","Ask demo AI owner"))+" ↗"}</button>}
          {askError ? <p className="error">{askError}</p> : null}
        </div>
      </section>

      <section className="card detail-info-card">
        <div className="section-head"><div><span className="eyebrow">PROPERTY DETAILS</span><h2>{tr("매물 정보","Property details")}</h2></div></div>
        <div className="detail-terms">{initialTerms(listing).map((term) => <div key={term.label}><small>{term.label}</small><strong>{term.value}</strong></div>)}</div>
        <h3>{tr("상세 정보","Property information")}</h3>
        <table className="spec">
          <tbody>
            <tr><th>{tr("거래유형","Trade type")}</th><td>{listing.tradeType}</td></tr>
            {listing.tradeType === "매매" ? (
              <tr><th>{tr("매매가","Sale price")}</th><td>{listing.salePrice.toLocaleString()}만원</td></tr>
            ) : listing.tradeType === "전세" ? (
              <tr><th>{tr("전세보증금","Jeonse deposit")}</th><td>{listing.deposit.toLocaleString()}만원</td></tr>
            ) : (
              <><tr><th>{tr("보증금","Deposit")}</th><td>{listing.deposit.toLocaleString()}만원</td></tr>
              <tr><th>{tr("월세","Monthly rent")}</th><td>{listing.rent.toLocaleString()}만원</td></tr></>
            )}
            <tr><th>{tr("관리비","Monthly fee")}</th><td>{listing.fee}만원</td></tr>
            <tr><th>{tr("면적","Area")}</th><td>{listing.area}㎡</td></tr>
            <tr><th>{tr("입주일","Move-in date")}</th><td>{listing.moveIn}</td></tr>
            <tr><th>{tr("설명","Description")}</th><td>{listing.description || "별도 설명 없음"}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="card detail-info-card">
        <div className="section-head"><div><span className="eyebrow">FEATURES & AMENITIES</span><h2>{en?(listing.tradeType==="매매"?"Facilities & spaces":"Amenities & living terms"):(listing.tradeType === "매매" ? "설비 · 공간 특성" : "기본 옵션 · 주거 조건")}</h2></div></div>
        <p className="meta">{tr("매물 등록 시 입력된 옵션이며 제공 여부는 거래 당사자에게 확인하세요.","Amenities were entered by the owner and must be verified with the other party.")}</p>
        {(() => {
          const groups = groupListingFeatures(listing.options);
          return (
            <div className="feature-groups">
              {groups.facilities.length > 0 ? <div><h3>{tr("가전 · 설비","Appliances")}</h3><div className="feature-chips">{groups.facilities.map(x => <span key={x}>{x}</span>)}</div></div> : null}
              {groups.structure.length > 0 ? <div><h3>{tr("공간 · 시설","Spaces & facilities")}</h3><div className="feature-chips">{groups.structure.map(x => <span key={x}>{x}</span>)}</div></div> : null}
              {groups.lifestyle.length > 0 ? <div><h3>{tr("생활 조건","Living conditions")}</h3><div className="feature-chips">{groups.lifestyle.map(x => <span key={x}>{x}</span>)}</div></div> : null}
              {listing.options.length === 0 ? <p className="meta">{tr("아직 등록된 옵션이 없습니다.","No amenities have been added.")}</p> : null}
            </div>
          );
        })()}
      </section>
      <section id="registry-rights" className="card detail-info-card" aria-label={tr("권리관계 독립 확인","Independent title-record check")}>
        <h2>{tr("거래 전 권리관계 확인","Verify property rights before a transaction")}</h2>
        <ListingRightsBrief listingId={listing.id}/>
        <p>{tr("등기사항증명서는 소유자가 아니어도 직접 열람할 수 있습니다. 주소를 대법원 인터넷등기소에 입력해 발급 시점이 최근인지 확인하세요. 매물 게시자가 실제 계약 권한을 가진 사람인지는 별도 신원·위임장 대조가 필요합니다.","Korean title records can be obtained independently. Verify the document date, the named owner, any authorized representative, and their actual authority to contract.")}</p>
        <p className="meta">{tr("표제부: 주소·건물·면적 / 갑구: 소유권·압류·가압류·신탁 / 을구: 근저당·전세권 등. 선순위 임차인 보증금, 세금 체납, 건축물대장 등은 등기부만으로 확인되지 않을 수 있습니다.","Title records show selected property facts, ownership entries and registered liens. Senior tenants, unpaid taxes and other obligations may require additional documentation.")}</p>
        <a className="btn ghost" href="https://www.iros.go.kr/" target="_blank" rel="noopener noreferrer">{tr("대법원 인터넷등기소에서 직접 열람 ↗","View official Korean registry ↗")}</a>
        <a className="btn ghost" href="/registry/check">{tr("등기부 확인 항목 체크리스트 →","Rights verification checklist →")}</a>
        <p className="meta">{tr("이 링크는 공식 사이트로 이동할 뿐, 플랫폼이 등기기록을 조회하거나 진위·안전을 보증하는 것이 아닙니다.","This link opens the official registry. Our app does not certify title records, ownership or transaction safety.")}</p>
      </section>
      <section className="card detail-info-card">
        <h3>{tr("게시자 확인 상태","Owner verification status")}</h3>
        <p>
          <span className="badge no">{tr("게시자 신원 미검증","Owner identity unverified")}</span>
          <span className="badge no">{tr("소유자·게시권한 관계 미검증","Ownership and publishing rights unverified")}</span>
        </p>
        <p className="meta">게시자 표시명: {listing.publisher}. 이 플랫폼은 현재 신원·소유권·게시권한을 확인하지 않았습니다. 문서 업로드나 이메일 로그인은 소유자 인증이 아닙니다.</p>
        {!isCustom ? <p className="demo-note">{tr("이 매물은 합성 데이터입니다. AI 상대방과 조건 협의를 연습할 수 있으며 실제 계약·예약은 진행되지 않습니다.","This is a fictional demo listing. AI conversations do not result in real bookings or legal contracts.")}</p> : null}
        <div className="detail-footer-actions">
          {isCustom && <a className="btn ghost" href={`/register?edit=${listing.id}`}>{tr("수정하기","Edit listing")}</a>}
          <ListingReportPanel listingId={listing.id}/>
        </div>
      </section>
    </div>
  );
}
