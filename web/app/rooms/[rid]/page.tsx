"use client";

import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "../../../lib/client-auth";
import {
  invokeAgent,
  loadRoomMessages,
  loadRoomMeta,
  sendRoomMessage,
  type DealMessage,
  type RoomMeta,
} from "../../../lib/store";

function aiName(tradeType: string | undefined): string {
  return tradeType === "매매" ? "AI 매도자" : "AI 임대인";
}

export default function RoomPage({ params }: { params: { rid: string } }) {
  const [messages, setMessages] = useState<DealMessage[]>([]);
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [authed, setAuthed] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState("");
  const [lastTriggerId, setLastTriggerId] = useState<string | null>(null);
  const [lastProvider, setLastProvider] = useState("");

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

  const callAi = async (triggerId: string) => {
    setAiPending(true);
    setAiError("");
    try {
      const r = await invokeAgent(params.rid, triggerId);
      setLastProvider(r.provider);
      await refresh();
    } catch (e) {
      // 모델 실패를 성공처럼 표시하지 않는다. 사람 메시지는 이미 저장돼 있다.
      // 사유(키·원문 없음)까지 보여줘서 개발자도구 없이 원인을 알 수 있게 한다.
      setAiError(`AI 응답을 가져오지 못했습니다(${e instanceof Error ? e.message : "오류"}). 다시 시도해 주세요.`);
    } finally {
      setAiPending(false);
    }
  };

  const onSend = async () => {
    if (!msg.trim() || sending) return;
    setSending(true);
    try {
      // 사람 메시지를 먼저 저장하고 즉시 보여준다. AI 생성은 별도 단계다.
      const id = await sendRoomMessage(params.rid, msg.trim());
      setMsg("");
      setLastTriggerId(id);
      await refresh();
      await callAi(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setSending(false);
    }
  };

  const onRetry = async () => {
    if (!lastTriggerId || aiPending) return;
    await callAi(lastTriggerId);
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
        {meta?.demo ? (
          <p className="meta">
            AI 상대방과 대화 중입니다(시연{lastProvider ? `, ${lastProvider}` : ""}). 실제 소유자가 아닙니다.
          </p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <div>
          {messages.map((m) => (
            <p key={m.id}>
              <strong>{m.author}</strong>
              {m.author_type && m.author_type !== "human" ? <span> (AI)</span> : null}: {m.text}
            </p>
          ))}
        </div>
        {aiPending && meta?.demo ? <p className="meta">{aiName(meta?.listing?.tradeType)}가 입력 중...</p> : null}
        {aiError ? (
          <p className="error">
            {aiError} <button className="btn ghost" onClick={onRetry} disabled={aiPending}>다시 시도</button>
          </p>
        ) : null}
        <div className="field">
          <label>메시지 입력</label>
          <input value={msg} placeholder="메시지 입력" onChange={(e) => setMsg(e.target.value)} />
        </div>
        <button onClick={onSend} disabled={sending}>{sending ? "전송 중..." : "전송"}</button>
      </section>
    </div>
  );
}


