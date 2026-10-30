"use client";

import { useEffect, useState } from "react";
import { formatPrice, type Listing } from "../../../lib/listings";
import { getAccessToken } from "../../../lib/client-auth";
import { createRoom, findListing, loadMyRooms } from "../../../lib/store";

export default function DetailPage({ params }: { params: { id: string } }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [missing, setMissing] = useState(false);
  const [reported, setReported] = useState(false);
  const [asking, setAsking] = useState(false);
  const [existingRid, setExistingRid] = useState<string | null>(null);
  const [askError, setAskError] = useState("");
  const [isCustom, setIsCustom] = useState(false);

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

  useEffect(() => {
    if (!getAccessToken()) return;
    loadMyRooms()
      .then((rs) => {
        const f = rs.find((r) => r.listing_id === params.id);
        if (f) setExistingRid(f.id);
      })
      .catch(() => {});
  }, [params.id]);

  if (missing) return <div className="card">매물을 찾을 수 없습니다. <a href="/">돌아가기</a></div>;
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

  if (!listing) return <div className="card">불러오는 중...</div>;

  return (
    <div className="grid">
      <section className="card listing-detail-head">
        <div className="photo detail-photo" style={{ background: "#375f8a" }}>가상 이미지 · 실제 사진 아님</div>
        <div className="listing-labels"><span className="listing-type">{listing.tradeType}</span>{!isCustom ? <span className="ai-pill">AI {listing.tradeType === "매매" ? "매도자" : "임대인"} 시연</span> : null}</div>
        <h2>{listing.title}</h2>
        <div className="price">{formatPrice(listing)}</div>
        <p className="meta">{listing.address}</p>
        {isCustom ? (
          <p>사용자 등록 매물입니다. 문의하면 소유자와의 독립 거래방이 열립니다.</p>
        ) : (
          <p><span className="synth">합성 데이터</span> 소유자 없는 시연 매물입니다. 문의하면 시연 거래방이 열립니다.</p>
        )}
      </section>

      <section className="card">
        <h3>기본 정보</h3>
        <table className="spec">
          <tbody>
            <tr><th>거래유형</th><td>{listing.tradeType}</td></tr>
            {listing.tradeType === "매매" ? (
              <tr><th>매매가</th><td>{listing.salePrice.toLocaleString()}만원</td></tr>
            ) : listing.tradeType === "전세" ? (
              <tr><th>전세보증금</th><td>{listing.deposit.toLocaleString()}만원</td></tr>
            ) : (
              <><tr><th>보증금</th><td>{listing.deposit.toLocaleString()}만원</td></tr>
              <tr><th>월세</th><td>{listing.rent.toLocaleString()}만원</td></tr></>
            )}
            <tr><th>관리비</th><td>{listing.fee}만원</td></tr>
            <tr><th>면적</th><td>{listing.area}㎡</td></tr>
            <tr><th>입주일</th><td>{listing.moveIn}</td></tr>
            <tr><th>옵션</th><td>{listing.options.join(", ") || "없음"}</td></tr>
            <tr><th>설명</th><td>{listing.description}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>게시자 확인 상태</h3>
        <p>
          <span className={listing.verification.identity ? "badge ok" : "badge no"}>
            본인 인증 {listing.verification.identity ? "제출됨" : "미제출"}
          </span>
          <span className={listing.verification.ownershipDoc ? "badge ok" : "badge no"}>
            소유 확인 서류 {listing.verification.ownershipDoc ? "제출됨" : "미제출"}
          </span>
        </p>
        <p className="meta">게시자: {listing.publisher}. 제출 여부만 표시하며 실제 소유권 인증·거래 안전을 보장하지 않습니다.</p>
        {!isCustom ? <p className="demo-note">이 매물은 합성 데이터입니다. AI 상대방과 조건 협의를 연습할 수 있으며 실제 계약·예약은 진행되지 않습니다.</p> : null}
        <p>
          {existingRid ? (
            <a className="btn ghost" href={`/rooms/${existingRid}`}>대화 이어하기</a>
          ) : (
            <button className="btn" onClick={onAsk} disabled={asking}>
              {asking ? "생성 중..." : "문의하기"}
            </button>
          )}{" "}
          {askError ? <span className="error">{askError}</span> : null}
          {isCustom && <a className="btn ghost" href={`/register?edit=${listing.id}`}>수정하기</a>}{" "}
          {!reported ? (
            <button className="btn ghost" onClick={() => setReported(true)}>허위 매물 신고</button>
          ) : (
            <span className="meta">신고가 접수되었습니다(시연용).</span>
          )}
        </p>
      </section>
    </div>
  );
}
