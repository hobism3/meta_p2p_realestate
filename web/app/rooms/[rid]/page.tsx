"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "../../../lib/client-auth";
import {
  confirmCondition,
  invokeAgent,
  invokeZiptalk,
  loadConditions,
  loadRoomMessages,
  loadRoomMeta,
  loadRoomVisits,
  sendRoomMessage,
  setRoomVisitStatus,
  type AgentInvokeResult,
  type ConditionHistoryRow,
  type DealMessage,
  type RoomCondition,
  type RoomMeta,
  type RoomVisit,
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

function statusOf(c: RoomCondition): string {
  if (c.confirmed_by && Number(c.confirmed_version) === Number(c.version)) return "확인됨";
  if (c.confirmed_by) return "확인 지남";
  if (c.status === "unconfirmed" || !c.value) return "미확인";
  return "제안됨";
}

function formatVisit(v: RoomVisit): string {
  const m = parseInt(v.visit_date.slice(5, 7), 10);
  const d = parseInt(v.visit_date.slice(8, 10), 10);
  const h = parseInt(v.visit_time.slice(0, 2), 10);
  const min = v.visit_time.slice(3, 5);
  const ap = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${m}월 ${d}일 ${ap} ${h12}시${min === "30" ? " 반" : ""}`;
}

function visitLabel(v: RoomVisit): string {
  if (v.status === "수락됨" && v.proposed_by === "demo") return "시연 수락";
  return v.status;
}

function myId(): string {
  try {
    const t = getAccessToken();
    if (!t) return "";
    const p = JSON.parse(atob(t.split(".")[1])) as { sub?: string };
    return String(p.sub ?? "");
  } catch {
    return "";
  }
}

function ConditionRow({ name, cond, me, onEvidence, onConfirm }: {
  name: string;
  cond: RoomCondition | undefined;
  me: string;
  onEvidence: (id: string) => void;
  onConfirm: (name: string) => void;
}) {
  const ev = cond ? evidenceIds(cond) : [];
  const st = cond ? statusOf(cond) : "미정";
  const label = cond && st === "확인됨" && cond.confirmed_by && cond.confirmed_by === me ? "내가 확인함" : st;
  return (
    <li>
      <strong>{name}</strong>: {cond && cond.value ? cond.value : "미정"}{" "}
      <span className={st === "확인됨" ? "badge ok" : "badge no"}>{label}</span>
      {cond && st === "확인됨" ? <span className="meta"> 확인: {cond.confirmed_name || cond.confirmed_by}</span> : null}{" "}
      {ev.length > 0 ? (
        <button className="btn ghost" onClick={() => onEvidence(ev[0])}>근거 보기</button>
      ) : null}{" "}
      {cond && cond.value && st !== "확인됨" ? (
        <button className="btn ghost" onClick={() => onConfirm(name)}>확인하기</button>
      ) : null}
    </li>
  );
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
  const [visits, setVisits] = useState<RoomVisit[]>([]);
  const [zipPending, setZipPending] = useState(false);
  const [zipError, setZipError] = useState("");
  const [me] = useState(() => myId());
  const msgsRef = useRef<HTMLDivElement | null>(null);
  const zipBusy = useRef(false);

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
      setVisits(await loadRoomVisits(params.rid));
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

  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, aiPending]);

  if (!authed) {
    return (
      <div className="card">
        독립 거래방은 로그인이 필요합니다. <a href="/login">로그인하기</a>
      </div>
    );
  }

  const callAi = async (triggerId: string): Promise<AgentInvokeResult | null> => {
    setAiPending(true);
    setAiError("");
    try {
      const r = await invokeAgent(params.rid, triggerId);
      setLastProvider(r.provider);
      await refresh();
      return r;
    } catch (e) {
      // 모델 실패를 성공처럼 표시하지 않는다. 사람 메시지는 이미 저장돼 있다.
      setAiError(`AI 응답을 가져오지 못했습니다(${e instanceof Error ? e.message : "오류"}). 다시 시도해 주세요.`);
      return null;
    } finally {
      setAiPending(false);
    }
  };

  // 집톡이 분석은 매도자 응답과 분리 실행한다. 조용하면 말풍선을 남기지 않는다.
  const callZiptalk = async (triggerId?: string) => {
    if (zipBusy.current) return;
    zipBusy.current = true;
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
      zipBusy.current = false;
    }
  };

  const onSend = async () => {
    if (!msg.trim() || sending) return;
    // 실거래방은 사람 채팅만 한다. AI 호출은 시연방 전용이다.
    const demo = meta?.demo === true;
    const text = msg.trim();
    setSending(true);
    let id: string;
    try {
      // 사람 메시지를 먼저 저장하고 입력창을 즉시 되돌린다. AI 처리는 뒤에서 돈다.
      id = await sendRoomMessage(params.rid, text);
      setMsg("");
      setLastTriggerId(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
      setSending(false);
      return;
    }
    setSending(false);
    if (!demo) return;
    const ai = await callAi(id);
    // AI 답에 숫자·날짜 단서가 있으면 AI 메시지를, 아니면 사람 메시지를 분석한다.
    if (ai && /[0-9내일모레다음주월화수목금토요일시]/.test(ai.text)) {
      await callZiptalk(ai.id);
    } else {
      await callZiptalk(id);
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

  const openPanel = async () => {
    setPanelOpen(true);
    await refreshConditions();
  };

  const scrollToEvidence = (id: string) => {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const findC = (name: string): RoomCondition | undefined => conditions.find((c) => c.name === name);
  const unconfirmed = conditions.filter((c) => statusOf(c) === "미확인");

  const onConfirm = async (name: string) => {
    const c = findC(name);
    try {
      await confirmCondition(params.rid, name, c ? Number(c.version) : undefined);
      await refreshConditions();
    } catch (e) {
      setZipError(`확인 실패(${e instanceof Error ? e.message : "오류"})`);
      await refreshConditions();
    }
  };

  const onAcceptVisit = async (v: RoomVisit) => {
    const c = findC("방문일");
    try {
      // 수락과 조건 확인을 한 번에 묶는다(부분 성공 없음).
      await setRoomVisitStatus(
        params.rid,
        v.id,
        "수락됨",
        c ? { confirm_visit: true, condition_version: Number(c.version) } : { confirm_visit: true },
      );
      await refreshConditions();
    } catch (e) {
      setZipError(`일정 확인 실패(${e instanceof Error ? e.message : "오류"})`);
      await refreshConditions();
    }
  };

  const onDeclineVisit = async (vid: string) => {
    try {
      await setRoomVisitStatus(params.rid, vid, "거절됨");
      await refreshConditions();
    } catch (e) {
      setZipError(`일정 거절 실패(${e instanceof Error ? e.message : "오류"})`);
    }
  };

  const onChangeRequest = () => {
    setPanelOpen(true);
    document.getElementById("room-input")?.focus();
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const quickAsk = (q: string) => {
    setMsg(q);
    document.getElementById("room-input")?.focus();
  };

  return (
    <div className="grid">
      <section className="card">
        <h2>{meta?.listing ? meta.listing.title : "독립 거래방"}</h2>
        <p className="meta">
          <span className={meta?.demo ? "badge no" : "badge ok"}>{meta?.demo ? "시연 거래방" : "실거래방"}</span>{" "}
          {meta?.listing ? `${meta.listing.tradeType}` : ""}
          {meta?.listing && meta.listing.tradeType === "매매" ? ` · 매매 ${meta.listing.salePrice.toLocaleString()}만원` : null}
        </p>
        {meta?.demo ? (
          <p className="meta">
            AI 상대방과 대화 중입니다(시연{lastProvider ? `, ${lastProvider}` : ""}). 실제 소유자가 아닙니다.
          </p>
        ) : (
          <p className="meta">이 방의 대화는 참여자만 볼 수 있습니다. 사람이 직접 대화합니다.</p>
        )}
        {meta?.demo && messages.length < 3 ? (
          <div>
            <p className="meta">AI 매도자와 자유롭게 대화하세요. 집톡이가 가격·일정을 정리합니다.</p>
            <div className="quickrow">
              <button className="btn ghost" onClick={() => quickAsk("가격 협의 가능할까요?")}>가격 협의</button>
              <button className="btn ghost" onClick={() => quickAsk("방문 가능일이 언제인가요?")}>방문 가능일</button>
              <button className="btn ghost" onClick={() => quickAsk("옵션이 어떻게 되나요?")}>옵션</button>
            </div>
          </div>
        ) : null}
      </section>
      <div className={panelOpen ? "deal-layout open" : "deal-layout"}>
        <section className="card">
          {meta?.demo ? (
            <div>
              <button className="btn ghost" onClick={onTogglePanel}>{panelOpen ? "거래 현황 닫기" : "거래 현황"}</button>{" "}
              <button className="btn ghost" onClick={() => callZiptalk()} disabled={zipPending}>
                {zipPending ? "집톡이 분석 중..." : "집톡이 호출"}
              </button>
            </div>
          ) : null}
          {zipError ? <p className="error">{zipError}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          <div className="msgs" ref={msgsRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                id={`msg-${m.id}`}
                className={m.author_type === "human" ? "bubble mine" : m.author_type === "assistant" ? "zipcard" : "bubble theirs"}
              >
                <div className="who">{m.author}{authorTag(m)}</div>
                <div>{m.text}</div>
                {m.author_type === "assistant" && m.text.includes("거래 현황에서 확인") ? (
                  <div>
                    <button className="btn ghost" onClick={openPanel}>거래 현황 열기</button>
                  </div>
                ) : null}
              </div>
            ))}
            {aiPending && meta?.demo ? (
              <div className="bubble theirs">
                <div className="who">{aiName(meta?.listing?.tradeType)}</div>
                <div>입력 중...</div>
              </div>
            ) : null}
          </div>
          {zipPending ? <p className="meta">집톡이 분석 중...</p> : null}
          {aiError ? (
            <p className="error">
              {aiError} <button className="btn ghost" onClick={onRetry} disabled={aiPending}>다시 시도</button>
            </p>
          ) : null}
          <div className="composer">
            <div className="field">
              <label>메시지 입력</label>
              <textarea
                id="room-input"
                rows={2}
                value={msg}
                placeholder="메시지 입력"
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
              />
            </div>
            <button onClick={onSend} disabled={sending}>{sending ? "전송 중..." : "전송"}</button>
          </div>
        </section>
        {panelOpen && meta?.demo ? (
          <aside className="card drawer open">
            <div>
              <button className="btn ghost" onClick={() => setPanelOpen(false)}>닫기</button>
            </div>
            <h3>거래 현황</h3>
            <p className="meta">초안이며 자동 합의가 아닙니다. 확인은 사람이 직접 누른 것만 기록됩니다.</p>
            <h4>가격</h4>
            <ul>
              {["최초가", "매수 희망가", "매도 제안가"].map((n) => (
                <ConditionRow key={n} name={n} cond={findC(n)} me={me} onEvidence={scrollToEvidence} onConfirm={onConfirm} />
              ))}
            </ul>
            <h4>일정</h4>
            {visits.length === 0 ? (
              <ul>
                <ConditionRow name="방문일" cond={findC("방문일")} me={me} onEvidence={scrollToEvidence} onConfirm={onConfirm} />
              </ul>
            ) : (
              <ul>
                {visits.map((v) => (
                  <li key={v.id}>
                    <strong>방문 {formatVisit(v)}</strong>{" "}
                    <span className={v.status === "수락됨" ? "badge ok" : "badge no"}>{visitLabel(v)}</span>{" "}
                    {v.proposed_by === "demo" && v.status === "제안됨" ? (
                      <span className="meta">시연 제안(실제 예약 아님)</span>
                    ) : null}{" "}
                    {v.status === "제안됨" ? (
                      <>
                        <button className="btn ghost" onClick={() => onAcceptVisit(v)}>일정 확인</button>{" "}
                        <button className="btn ghost" onClick={() => onDeclineVisit(v.id)}>거절</button>{" "}
                        <button className="btn ghost" onClick={onChangeRequest}>변경 요청</button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <ul>
              {["계약일", "잔금일", "입주일"].map((n) => (
                <ConditionRow key={n} name={n} cond={findC(n)} me={me} onEvidence={scrollToEvidence} onConfirm={onConfirm} />
              ))}
            </ul>
            <h4>조건</h4>
            <ul>
              {["옵션", "수리 요청"].map((n) => (
                <ConditionRow key={n} name={n} cond={findC(n)} me={me} onEvidence={scrollToEvidence} onConfirm={onConfirm} />
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
          </aside>
        ) : null}
      </div>
    </div>
  );
}
