"use client";

import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "../../../lib/client-auth";
import {
  loadRoomMessages,
  loadRoomMeta,
  sendRoomMessage,
  type DealMessage,
  type RoomMeta,
} from "../../../lib/store";

export default function RoomPage({ params }: { params: { rid: string } }) {
  const [messages, setMessages] = useState<DealMessage[]>([]);
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [authed, setAuthed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const m = await loadRoomMessages(params.rid);
      setMessages(m);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    }
  }, [params.rid]);

  useEffect(() => {
    setAuthed(!!getAccessToken());
    loadRoomMeta(params.rid).then(setMeta).catch(() => setMeta(null));
    refresh();
    // 상대방 메시지를 5초마다 갱신한다.
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [params.rid, refresh]);

  if (!authed) {
    return (
      <div className="card">
        독립 거래방은 로그인이 필요합니다. <a href="/login">로그인하기</a>
      </div>
    );
  }

  const onSend = async () => {
    if (!msg.trim()) return;
    try {
      await sendRoomMessage(params.rid, msg.trim());
      setMsg("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
    }
  };

  return (
    <div className="grid">
      <section className="card">
        <h2>{meta?.listing ? meta.listing.title : "독립 거래방"}</h2>
        <p className="meta">
          {meta ? (
            <>
              <span className={meta.demo ? "badge no" : "badge ok"}>{meta.demo ? "시연 거래방" : "실거래방"}</span>{" "}
              {meta.listing ? `${meta.listing.tradeType}` : ""} · 이 방의 대화는 참여자만 볼 수 있습니다. 합성 데이터 시연용입니다.
            </>
          ) : (
            "이 방의 대화는 참여자만 볼 수 있습니다. 합성 데이터 시연용입니다."
          )}
        </p>
        {error ? <p className="error">{error}</p> : null}
        <div>
          {messages.map((m) => (
            <p key={m.id}>
              <strong>{m.author}</strong>
              {m.author_type && m.author_type !== "human" ? <span> (AI)</span> : null}: {m.text}
            </p>
          ))}
        </div>
        <div className="field">
          <label>메시지 입력</label>
          <input value={msg} placeholder="메시지 입력" onChange={(e) => setMsg(e.target.value)} />
        </div>
        <button onClick={onSend}>전송</button>
      </section>
    </div>
  );
}
