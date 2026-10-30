"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "../../lib/client-auth";
import { loadMyRooms, type MyRoom } from "../../lib/store";

type RoomFilter = "all" | "demo" | "real";

export default function RoomsPage() {
  const [rooms, setRooms] = useState<MyRoom[] | null>(null);
  const [error, setError] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RoomFilter>("all");

  useEffect(() => {
    const has = !!getAccessToken();
    setAuthed(has);
    if (!has) return;
    loadMyRooms()
      .then(setRooms)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"));
  }, []);

  if (authed === null) {
    return <div className="rooms-hub"><div className="rooms-loading" role="status">거래방을 준비하고 있어요...</div></div>;
  }
  if (!authed) {
    return (
      <div className="rooms-hub">
        <div className="rooms-empty" role="status">
          <span aria-hidden="true">⌂</span>
          <h1>거래방은 로그인 후 사용할 수 있어요.</h1>
          <p>참여 중인 거래 대화를 한곳에서 관리하세요.</p>
          <a href="/login" className="btn">로그인하기 →</a>
        </div>
      </div>
    );
  }

  const all = rooms ?? [];
  const demo = all.filter((r) => r.demo).length;
  const real = all.length - demo;
  const filtered = all
    .filter((r) => filter === "all" || (filter === "demo" ? r.demo : !r.demo))
    .filter((r) => r.listing_title.toLocaleLowerCase("ko-KR").includes(query.trim().toLocaleLowerCase("ko-KR")))
    .slice().sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="rooms-hub">
      <section className="rooms-hub-head">
        <div>
          <span className="eyebrow">DIRECTHOME · YOUR CONVERSATIONS</span>
          <h1>내 거래방 <span aria-label={all.length + "개 거래방"}>{all.length}</span></h1>
          <p>조건을 이야기하고, 약속을 잡고, 집톡이의 정리까지 한곳에서 확인하세요.</p>
        </div>
        <a href="/" className="rooms-explore-link">새 매물 둘러보기 <span aria-hidden="true">↗</span></a>
      </section>

      <div className="rooms-hub-body">
        <div className="rooms-hub-toolbar">
          <div className="rooms-tabs" role="group" aria-label="거래방 필터">
            {([
              ["all", "전체", all.length],
              ["demo", "AI 시연", demo],
              ["real", "실거래", real],
            ] as const).map(([key, label, count]) => (
              <button type="button" key={key} aria-pressed={filter === key}
                className={filter === key ? "is-active" : ""} onClick={() => setFilter(key)}>
                {label} <span>{count}</span>
              </button>
            ))}
          </div>
          <label className="rooms-search" htmlFor="rooms-query">
            <span aria-hidden="true">⌕</span>
            <input id="rooms-query" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="매물 이름으로 검색" />
          </label>
        </div>
        {error ? <div className="rooms-hub-error" role="alert">{error}</div> : null}
        {!rooms && !error ? (
          <div className="rooms-loading" role="status" aria-busy="true">거래방 목록을 불러오고 있어요...</div>
        ) : null}
        {rooms && filtered.length > 0 ? (
          <div className="rooms-inbox-list">
            {filtered.map((r) => (
              <a key={r.id} className="rooms-entry" href={"/rooms/" + r.id}>
                <span className={"rooms-entry-avatar " + (r.demo ? "is-ai" : "is-real")} aria-hidden="true">
                  {r.demo ? "⌂" : "●"}
                  {r.demo ? <i>✦</i> : null}
                </span>
                <span className="rooms-entry-copy">
                  <strong>{r.listing_title}</strong>
                  <span className="rooms-entry-subtitle">
                    {r.demo ? "AI 임대인/매도자와 대화 · 집톡이 정리 지원" : "거래 상대방과의 1:1 대화"}
                  </span>
                  <span className="rooms-entry-badges">
                    <small className={r.demo ? "is-ai" : "is-real"}>{r.demo ? "✦ AI 시연" : "개인 간 거래"}</small>
                    <small>생성 {r.created_at.slice(0, 10)}</small>
                  </span>
                </span>
                <span className="rooms-entry-arrow" aria-hidden="true">→</span>
              </a>
            ))}
          </div>
        ) : null}
        {rooms && filtered.length === 0 ? (
          <div className="rooms-empty-state">
            <span aria-hidden="true">✦</span>
            <strong>{rooms.length === 0 ? "아직 시작한 대화가 없어요." : "검색 조건에 맞는 거래방이 없어요."}</strong>
            <p>{rooms.length === 0 ? "마음에 드는 매물을 찾으면 문의하기를 눌러보세요." : "검색어를 바꾸거나 전체 탭을 선택해 보세요."}</p>
            {rooms.length === 0 ? <a href="/" className="btn">매물 탐색하기 →</a>
              : <button type="button" onClick={() => { setFilter("all"); setQuery(""); }}>전체 거래방 보기</button>}
          </div>
        ) : null}
      </div>
      <p className="rooms-hub-disclosure">AI 시연 대화는 실제 집주인·매매 계약을 의미하지 않습니다.</p>
    </div>
  );
}
