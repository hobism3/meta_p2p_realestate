"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "../../lib/client-auth";
import { loadMyRooms, type MyRoom } from "../../lib/store";

export default function RoomsPage() {
  const [rooms, setRooms] = useState<MyRoom[] | null>(null);
  const [error, setError] = useState("");
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const has = !!getAccessToken();
    setAuthed(has);
    if (!has) return;
    loadMyRooms()
      .then(setRooms)
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"));
  }, []);

  if (!authed) {
    return (
      <div className="card">
        내 거래방은 로그인이 필요합니다. <a href="/login">로그인하기</a>
      </div>
    );
  }
  if (error) return <div className="card"><p className="error">{error}</p></div>;
  if (!rooms) return <div className="card">불러오는 중...</div>;

  return (
    <div className="grid">
      <section className="card">
        <h2>내 거래방</h2>
        <p className="meta">내가 참여한 방만 보입니다.</p>
      </section>
      {rooms.map((r) => (
        <a key={r.id} className="card listing" href={`/rooms/${r.id}`}>
          <h3>{r.listing_title}</h3>
          <div className="meta">
            <span className={r.demo ? "badge no" : "badge ok"}>{r.demo ? "시연" : "실거래"}</span> {r.created_at}
          </div>
        </a>
      ))}
      {rooms.length === 0 && <div className="card">참여 중인 거래방이 없습니다. 매물에서 문의해 보세요.</div>}
    </div>
  );
}
