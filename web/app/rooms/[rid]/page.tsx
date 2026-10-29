"use client";

import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "../../../lib/client-auth";
import {
  invokeAgent,
  invokeZiptalk,
  loadConditions,
  loadRoomMessages,
  loadRoomMeta,
  sendRoomMessage,
  type ConditionHistoryRow,
  type DealMessage,
  type RoomCondition,
  type RoomMeta,
} from "../../../lib/store";

function aiName(tradeType: string | undefined): string {
  return tradeType === "매매" ? "AI 매도자" : "AI 임대인";
}

function authorTag(m: DealMessage): string {
  if (m.author_type === "assistant") return " (집톡이)";
  if (m.author_type && m.author_type !== "human") return " (AI)";
  return "";
}

function evidenceIds(c: RoomCondition): string[] {
  try {
    const v = JSON.parse(c.source_msg_ids) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [conditions, setConditions] = useState<RoomCondition[]>([]);
  const [history, setHistory] = useState<ConditionHistoryRow[]>([]);
  const [zipPending, setZipPending] = useState(false);
  const [zipError, setZipError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const m = await loadRoomMessages(params.rid);
      setMessages(m);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    }
  }, [params.rid]);

  const refreshConditions = useCallback(async () => {
    try {
      const c = await loadConditions(params.rid);
      setConditions(c.conditions);
      setHistory(c.history);
    } catch {
      // 패널은 조용히 비워 둔다. 채팅 흐름을 막지 않는다.
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

  // 집톡이 분석은 매도자 응답과 분리 실행한다. 조용하면 말풍선을 남기지 않는다.
  const callZiptalk = async (triggerId?: string) => {
    if (zipPending) return;
    setZipPending(true);
    setZipError("");
    try {
      await invokeZiptalk(params.rid, triggerId);
      await refresh();
      if (panelOpen) await refreshConditions();
    } catch (e) {
      setZipError(`집톡이 분석 실패(${e instanceof Error ? e.message : "오류"})`);
    } finally {
      setZipPending(false);
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
      if (meta?.demo) await callZiptalk(id);
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

  const onTogglePanel = async () => {
    const next = !panelOpen;
    setPanelOpen(next);
    if (next) await refreshConditions();
  };

  const scrollToEvidence = (id: string) => {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const unconfirmed = conditions.filter((c) => c.status === "unconfirmed" || !c.value);

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
        {meta?.demo ? (
          <div>
            <button className="btn ghost" onClick={onTogglePanel}>{panelOpen ? "거래 현황 닫기" : "거래 현황"}</button>{" "}
            <button className="btn ghost" onClick={() => callZiptalk()} disabled={zipPending}>
              {zipPending ? "집톡이 분석 중..." : "집톡이 호출"}
            </button>
          </div>
        ) : null}
        {zipError ? <p className="error">{zipError}</p> : null}
        {panelOpen && meta?.demo ? (
          <div className="card">
            <h3>거래 현황</h3>
            <p className="meta">초안이며 자동 합의가 아닙니다.</p>
            {conditions.length === 0 ? <p className="meta">정리된 조건이 아직 없습니다.</p> : null}
            <ul>
              {conditions.map((c) => (
                <li key={c.name}>
                  <strong>{c.name}</strong>: {c.value || "(미확인)"}{" "}
                  <span className={c.status === "confirmed" ? "badge ok" : "badge no"}>
                    {c.status === "confirmed" ? "확정" : c.status === "unconfirmed" ? "미확인" : "제안됨"}
                  </span>{" "}
                  {evidenceIds(c).length > 0 ? (
                    <button className="btn ghost" onClick={() => scrollToEvidence(evidenceIds(c)[0])}>근거 보기</button>
                  ) : null}
                </li>
              ))}
            </ul>
            {unconfirmed.length > 0 ? (
              <>
                <h4>미확인 사항</h4>
                <ul>
                  {unconfirmed.map((c) => (
                    <li key={c.name}>{c.name}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {history.length > 0 ? (
              <>
                <h4>변경 이력</h4>
                <ul>
                  {history.map((h, i) => (
                    <li key={`${h.name}-${h.created_at}-${i}`}>
                      {h.name}: {h.old_value || "(없음)"} → {h.new_value || "(미확인)"}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <div>
          {messages.map((m) => (
            <p key={m.id} id={`msg-${m.id}`}>
              <strong>{m.author}</strong>
              {authorTag(m) ? <span>{authorTag(m)}</span> : null}: {m.text}
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
