"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "../../../lib/client-auth";
import { brokerSnapshot } from "../../../lib/broker-companion";
import { hasNewProposalCue } from "../../../lib/agent";
import { groupListingFeatures, initialTerms } from "../../../lib/listing-presentation";
import {
  invokeAgent,
  invokeZiptalk,
  decideProposal,
  loadConditions,
  loadProposals,
  loadRoomMessages,
  loadRoomMeta,
  loadRoomVisits,
  sendRoomMessage,
  setRoomVisitStatus,
  type AgentInvokeResult,
  type ConditionHistoryRow,
  type DealMessage,
  type ProposalsData,
  type RoomCondition,
  type RoomMeta,
  type RoomProposal,
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
  if (c.confirmed_by) return "재협의 필요";
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

function approvalOf(approvals: Record<string, { actor_id: string; actor_type: string; decision: string }[]>, pid: string, sideKey: string, demo: boolean): string {
  const list = approvals[pid] ?? [];
  const hit = list.find((a) =>
    sideKey === "demo" ? a.actor_type === "demo" : demo ? a.actor_type === "human" : a.actor_id === sideKey.replace(/^human:/, ""),
  );
  if (!hit) return "대기";
  return hit.decision === "agree" ? "동의함" : "거절함";
}

function HistoryRow({ name, cond, onEvidence }: {
  name: string;
  cond: RoomCondition | undefined;
  onEvidence: (id: string) => void;
}) {
  if (!cond || !cond.value) return null;
  const ev = evidenceIds(cond);
  return (
    <li>
      <strong>{name}</strong>: {cond.value}{" "}
      <span className="badge no">협상 이력</span>{" "}
      {ev[0] ? <button className="btn ghost" onClick={() => onEvidence(ev[0])}>근거 보기</button> : null}
    </li>
  );
}

function AgreementRow({ name, cond, propData, me, onDecide, onEvidence }: {
  name: string;
  cond: RoomCondition | undefined;
  propData: ProposalsData | null;
  me: string;
  onDecide: (pid: string, decision: "agree" | "refuse", version: number) => void;
  onEvidence: (id: string) => void;
}) {
  const props = (propData?.proposals ?? []).filter((p) => p.name === name && p.status !== "superseded");
  const p = props.length > 0 ? props[props.length - 1] : undefined;
  const approvals = propData?.approvals ?? {};
  const sides = propData?.sides ?? [];
  const demo = propData?.demo ?? true;
  const mine = p ? (approvals[p.id] ?? []).some((a) => a.actor_id === me) : false;
  const badge = !p ? "합의 없음" : p.status === "agreed" ? "양측 동의" : p.status === "refused" ? "거절됨" : "동의 대기";
  const ev = p?.source_msg_ids[0] ?? (cond ? evidenceIds(cond)[0] : undefined);
  const shown = p ? p.value : cond && cond.value ? cond.value : "미정";
  return (
    <li>
      <strong>{name}</strong>: {shown}{" "}
      <span className={badge === "양측 동의" ? "badge ok" : "badge no"}>{badge}</span>
      {p ? (
        <span className="meta"> v{p.version} {sides.map((s) => `${s.label} ${approvalOf(approvals, p.id, s.key, demo)}`).join(" · ")}</span>
      ) : null}{" "}
      {p && p.reason ? <span className="meta">{p.reason}</span> : null}{" "}
      {ev ? <button className="btn ghost" onClick={() => onEvidence(ev)}>근거 보기</button> : null}{" "}
      {p && p.status === "proposed" && !mine ? (
        <>
          <button className="btn ghost" onClick={() => onDecide(p.id, "agree", p.version)}>동의하기</button>{" "}
          <button className="btn ghost" onClick={() => onDecide(p.id, "refuse", p.version)}>거절하기</button>
        </>
      ) : null}
    </li>
  );
}

function ProposalCard({ p, approvals, sides, demo, me, onDecide, onSuggest, onHold, onEvidence }: {
  p: RoomProposal;
  approvals: Record<string, { actor_id: string; actor_type: string; decision: string }[]>;
  sides: { key: string; label: string }[];
  demo: boolean;
  me: string;
  onDecide: (pid: string, decision: "agree" | "refuse", version: number) => void;
  onSuggest: (name: string, value: string) => void;
  onHold: (pid: string) => void;
  onEvidence: (id: string) => void;
}) {
  const mine = (approvals[p.id] ?? []).some((a) => a.actor_id === me);
  const open = p.status === "proposed";
  const badge = p.status === "agreed" ? "양측 동의" : p.status === "refused" ? "거절됨" : "동의 대기";
  const isFinal = p.name === "최종 매매가" || p.name === "최종 전세보증금" || p.name === "월세 조건";
  return (
    <div className="card proposal-card">
      <div>
        {isFinal ? <strong>{p.value} 조건에 동의할까요?</strong> : <><strong>{p.name}</strong>: {p.value}</>}{" "}
        <span className={p.status === "agreed" ? "badge ok" : "badge no"}>{badge}</span>
      </div>
      <ul>
        {sides.map((s) => (
          <li key={s.key}>{s.label}: {approvalOf(approvals, p.id, s.key, demo)}</li>
        ))}
      </ul>
      {p.reason ? <p className="meta">{p.reason}</p> : null}
      {p.source_msg_ids[0] ? (
        <div>
          <button className="btn ghost" onClick={() => onEvidence(p.source_msg_ids[0])}>근거 보기</button>
        </div>
      ) : null}
      {open && !mine ? (
        <div>
          <button className="btn ghost" onClick={() => onDecide(p.id, "agree", p.version)}>동의하기</button>{" "}
          <button className="btn ghost" onClick={() => onDecide(p.id, "refuse", p.version)}>거절하기</button>{" "}
          <button className="btn ghost" onClick={() => onSuggest(p.name, p.value)}>변경 제안</button>
          {isFinal ? null : (
            <>{" "}<button className="btn ghost" onClick={() => onHold(p.id)}>보류</button></>
          )}
        </div>
      ) : null}
      {open && mine ? <p className="meta">상대방의 동의를 기다립니다.</p> : null}
      {demo && isFinal ? <p className="meta">AI 시연 동의는 실제 계약이 아닙니다.</p> : null}
    </div>
  );
}

export default function RoomPage({ params }: { params: { rid: string } }) {
  const [messages, setMessages] = useState<DealMessage[]>([]);
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
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
  const [zipNotice, setZipNotice] = useState("");
  const [zipOpen, setZipOpen] = useState(false);
  const [zipPeek, setZipPeek] = useState(false);
  const [zipUnread, setZipUnread] = useState(false);
  const lastZipId = useRef<string | null>(null);
  const zipInitialized = useRef(false);
  const zipPanelRef = useRef<HTMLDivElement | null>(null);
  const composingRef = useRef(false);
  const [me] = useState(() => myId());
  const [propData, setPropData] = useState<ProposalsData | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const msgsRef = useRef<HTMLDivElement | null>(null);
  const zipBusy = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const m = await loadRoomMessages(params.rid);
      const newest = m.filter((item) => item.author_type === "assistant").slice(-1)[0]?.id ?? null;
      if (!zipInitialized.current) {
        zipInitialized.current = true;
        lastZipId.current = newest;
      } else if (newest && newest !== lastZipId.current) {
        lastZipId.current = newest;
        // A broker should gently tap the shoulder, not take over the chat.
        // Never cover a transaction drawer or an actively focused composer.
        if (!panelOpen && !composingRef.current) setZipPeek(true);
        setZipUnread(true);
      }
      setMessages(m);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    }
  }, [params.rid, panelOpen]);

  const refreshConditions = useCallback(async () => {
    try {
      const c = await loadConditions(params.rid);
      setConditions(c.conditions);
      setHistory(c.history);
      setVisits(await loadRoomVisits(params.rid));
      setPropData(await loadProposals(params.rid));
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

  useEffect(() => {
    if (zipOpen) {
      if (zipPanelRef.current) zipPanelRef.current.scrollTop = zipPanelRef.current.scrollHeight;
      setZipUnread(false);
    }
  }, [zipOpen, messages]);

  if (authed === null) {
    return <div className="deal-route-skeleton" role="status">거래방을 준비하는 중...</div>;
  }
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
  const callZiptalk = async (triggerId?: string, openOnRequest = false) => {
    if (zipBusy.current) return;
    zipBusy.current = true;
    setZipPending(true);
    if (openOnRequest) {
      setZipOpen(true);
      setZipPeek(false);
    }
    setZipError("");
    setZipNotice("");
    try {
      const result = await invokeZiptalk(params.rid, triggerId);
      if (result.fallback === "meta_truncated") {
        setZipNotice("모델 응답이 길이 제한에 걸려 기본 규칙으로 분석했습니다. 대화 근거와 거래 현황을 확인해 주세요.");
        setZipOpen(true);
        setZipPeek(false);
      }
      await refresh();
      // 채팅 카드(ProposalCard)도 제안 목록에 의존하므로 패널이 닫혀 있어도 갱신한다.
      await refreshConditions();
    } catch (e) {
      setZipOpen(true);
      setZipPeek(false);
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
    setZipPeek(false);
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
    // AI 답에 새 제안·날짜 단서가 있으면 AI 메시지를, 아니면 사람 메시지를 분석한다.
    // 답변이 끝난 질문(아는 가격 등)은 사람 메시지로 넘겨 집톡이가 정리하게 한다.
    if (ai && hasNewProposalCue(ai.text)) {
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
    if (next) {
      setZipOpen(false);
      setZipPeek(false);
    }
    if (next) await refreshConditions();
  };

  const openPanel = async () => {
    setZipOpen(false);
    setZipPeek(false);
    setPanelOpen(true);
    await refreshConditions();
  };

  const scrollToEvidence = (id: string) => {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const findC = (name: string): RoomCondition | undefined => conditions.find((c) => c.name === name);
  const unconfirmed = conditions.filter((c) => statusOf(c) === "미확인");

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
    setZipPeek(false);
    setPanelOpen(true);
    document.getElementById("room-input")?.focus();
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const onDecide = async (pid: string, decision: "agree" | "refuse", version: number) => {
    try {
      await decideProposal(params.rid, pid, decision, version);
      await refreshConditions();
    } catch (e) {
      setZipError(`합의 실패(${e instanceof Error ? e.message : "오류"})`);
      await refreshConditions();
    }
  };

  const onSuggest = (name: string, value: string) => {
    setZipPeek(false);
    setMsg(`${name} ${value} 말고 다른 조건을 제안합니다. `);
    document.getElementById("room-input")?.focus();
  };

  const onHold = (pid: string) => {
    setDismissed((d) => (d.includes(pid) ? d : [...d, pid]));
  };

  const quickAsk = (q: string) => {
    setMsg(q);
    setZipPeek(false);
    document.getElementById("room-input")?.focus();
  };

  const placeBrokerQuestion = (q: string) => {
    setMsg(q);
    setZipOpen(false);
    setZipPeek(false);
    window.requestAnimationFrame(() => document.getElementById("room-input")?.focus());
  };

  const chatMessages = messages.filter((m) => m.author_type !== "assistant");
  const zipMessages = messages.filter((m) => m.author_type === "assistant");
  const newestZip = zipMessages[zipMessages.length - 1] ?? null;
  const broker = brokerSnapshot({
    tradeType: meta?.listing?.tradeType,
    conditions, visits, chat: chatMessages, latestNote: newestZip,
  });
  const participant = meta?.demo ? aiName(meta?.listing?.tradeType) : "거래 상대방";
  const listing = meta?.listing;
  const formattedPrice = !listing ? "" : listing.tradeType === "매매"
    ? "매매 " + listing.salePrice.toLocaleString() + "만원"
    : listing.tradeType === "전세" ? "전세 " + listing.deposit.toLocaleString() + "만원"
    : listing.deposit.toLocaleString() + " / " + listing.rent.toLocaleString() + "만원";

  return (
    <div className="grid deal-page">
      <section className="deal-header deal-hero">
        <div className="deal-hero-main">
          <span className="deal-room-kicker"><span className="deal-live-dot" /> DIRECTHOME · PRIVATE ROOM</span>
          <h1>{listing ? listing.title : "독립 거래방"}</h1>
          <div className="deal-hero-tags">
            <span className={"deal-room-type " + (meta?.demo ? "is-demo" : "is-live")}>
              {meta?.demo ? "✦ AI 시연 거래" : "개인 간 거래"}
            </span>
            {listing ? <span className="deal-hero-trade">{listing.tradeType}</span> : null}
            {formattedPrice ? <strong className="deal-hero-price">{formattedPrice}</strong> : null}
          </div>
          <p>{meta?.demo
            ? "AI 임대인·매도자와 편하게 대화해 보세요. 집톡이가 옆에서 조건과 방문 일정을 정리해 드려요."
            : "이 거래방은 참여자가 직접 대화합니다. AI 임대인은 참여하지 않습니다."}</p>
        </div>
        <div className="deal-hero-symbol" aria-hidden="true">
          <span className="deal-hero-house">⌂</span>
          <span className="deal-hero-sparkle">✦</span>
        </div>
      </section>
      <div className={panelOpen ? "deal-layout open" : "deal-layout"}>
        <section className="deal-chat">
          <div className="conversation-head">
            <div className="conversation-identity">
              <span className="conversation-avatar" aria-hidden="true">⌂</span>
              <div>
                <strong>{participant}</strong>
                <span className="conversation-status"><i aria-hidden="true" />
                  {meta?.demo ? "AI 시연 · 실제 소유자가 아닙니다" : "개인 거래 · 참여자 간 메시지"}
                </span>
              </div>
            </div>
            <div className="conversation-head-actions">
              <button type="button" className="conversation-tools-button" onClick={onTogglePanel}>
                <span aria-hidden="true">▤</span> {panelOpen ? "거래 현황 닫기" : "거래 현황"}
              </button>
              {meta?.demo ? (
                <button type="button" className="conversation-tools-button is-accent"
                  onClick={() => void callZiptalk(undefined, true)} disabled={zipPending}>
                  <span aria-hidden="true">✦</span> {zipPending ? "집톡이가 메모 중" : "집톡이야, 정리해줘!"}
                </button>
              ) : null}
            </div>
          </div>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="msgs conversation-feed" ref={msgsRef} role="log" aria-label="거래 대화" aria-relevant="additions text">
            <div className="conversation-day-label"><span>메시지 · {meta?.demo ? "AI 시연" : "개인 간 거래"}</span></div>
            {chatMessages.map((m) => (
              <div key={m.id} id={"msg-" + m.id}
                className={"conversation-row " + (m.author_type === "human" ? "is-mine" : "is-theirs")}>
                {m.author_type !== "human" ? <span className="conversation-small-avatar" aria-hidden="true">⌂</span> : null}
                <div className="conversation-message">
                  {m.author_type !== "human" ? <span className="conversation-author">{m.author}{authorTag(m)}</span> : null}
                  <div className={m.author_type === "human" ? "bubble mine" : "bubble theirs"}>{m.text}</div>
                  <time className="conversation-time" dateTime={m.created_at}>
                    {new Date(m.created_at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}
                  </time>
                </div>
              </div>
            ))}
            {aiPending && meta?.demo ? (
              <div className="conversation-row is-theirs" role="status">
                <span className="conversation-small-avatar" aria-hidden="true">⌂</span>
                <div className="conversation-message">
                  <span className="conversation-author">{participant}</span>
                  <div className="bubble theirs conversation-typing" aria-label="AI가 답변 중입니다"><i/><i/><i/></div>
                </div>
              </div>
            ) : null}
          </div>
          {aiError ? (
            <p className="conversation-inline-error" role="alert">
              {aiError} <button type="button" className="btn ghost" onClick={onRetry} disabled={aiPending}>다시 시도</button>
            </p>
          ) : null}
          {meta?.demo && chatMessages.length < 3 ? (
            <div className="conversation-suggestions" aria-label="빠른 질문">
              <span>이런 이야기로 시작해 보세요</span>
              <div className="quickrow">
                <button type="button" onClick={() => quickAsk("가격 협의 가능할까요?")}>💬 가격 협의</button>
                <button type="button" onClick={() => quickAsk("방문 가능일이 언제인가요?")}>📅 방문 일정</button>
                <button type="button" onClick={() => quickAsk("옵션이 어떻게 되나요?")}>⌂ 주거 옵션</button>
              </div>
            </div>
          ) : null}
          <div className="composer conversation-composer">
            <div className="field">
              <label htmlFor="room-input">메시지 입력 <span>Enter 전송 · Shift+Enter 줄바꿈</span></label>
              <textarea id="room-input" rows={2} value={msg} placeholder="메시지 입력"
                onFocus={() => {
                  composingRef.current = true;
                  setZipOpen(false);
                  setZipPeek(false);
                }}
                onBlur={() => { composingRef.current = false; }}
                onChange={(e) => {
                  setZipOpen(false);
                  setZipPeek(false);
                  setMsg(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void onSend();
                  }
                }} />
            </div>
            <button type="button" className="conversation-send" onClick={onSend} disabled={sending || !msg.trim()}>
              {sending ? "전송 중..." : "전송"} <span aria-hidden="true">↗</span>
            </button>
          </div>
          <p className="conversation-privacy">시연용 AI의 제안은 실제 계약이나 방문 확정이 아닙니다. 거래 현황에서 확인하세요.</p>
        </section>
        {panelOpen ? (
          <aside className="card drawer open" aria-label="거래 현황 상세">
            <div>
              <button className="btn ghost" onClick={() => setPanelOpen(false)}>닫기</button>
            </div>
            <h3>거래 현황</h3>
            <p className="meta">등록 조건과 협상 조건을 구분합니다. 동일한 조건 버전에 양측이 동의해야 시연 합의로 표시됩니다.</p>
            <h4>{meta?.listing?.tradeType === "매매" ? "매매 가격" : meta?.listing?.tradeType === "전세" ? "전세 조건" : "월세 조건"}</h4>
            {meta?.listing ? <div className="deal-terms-baseline" aria-label="매물 등록 조건">
              {initialTerms(meta.listing as { tradeType: "매매" | "전세" | "월세"; salePrice: number; deposit: number; rent: number }).map(term => (
                <div key={term.label} className="deal-terms-field"><small>{term.label}</small><strong>{term.value}</strong></div>
              ))}
            </div> : null}
            <ul>
              {(meta?.listing?.tradeType ?? "매매") === "매매" ? (
                <>
                  <HistoryRow name="매수 희망가" cond={findC("매수 희망가")} onEvidence={scrollToEvidence} />
                  <HistoryRow name="매도 제안가" cond={findC("매도 제안가")} onEvidence={scrollToEvidence} />
                  <AgreementRow name="최종 매매가" cond={findC("최종 매매가")} propData={propData} me={me} onDecide={onDecide} onEvidence={scrollToEvidence} />
                </>
              ) : (meta?.listing?.tradeType ?? "매매") === "전세" ? (
                <>
                  <HistoryRow name="임차 희망 조건" cond={findC("임차 희망 조건")} onEvidence={scrollToEvidence} />
                  <HistoryRow name="임대 제안 조건" cond={findC("임대 제안 조건")} onEvidence={scrollToEvidence} />
                  <AgreementRow name="최종 전세보증금" cond={findC("최종 전세보증금")} propData={propData} me={me} onDecide={onDecide} onEvidence={scrollToEvidence} />
                </>
              ) : (
                <>
                  <HistoryRow name="임차 희망 조건" cond={findC("임차 희망 조건")} onEvidence={scrollToEvidence} />
                  <HistoryRow name="임대 제안 조건" cond={findC("임대 제안 조건")} onEvidence={scrollToEvidence} />
                  <AgreementRow name="월세 조건" cond={findC("월세 조건")} propData={propData} me={me} onDecide={onDecide} onEvidence={scrollToEvidence} />
                </>
              )}
              <AgreementRow name="계약금" cond={findC("계약금")} propData={propData} me={me} onDecide={onDecide} onEvidence={scrollToEvidence} />
            </ul>
            {(() => {
              const bal = findC("잔금일");
              const mv = findC("입주일");
              const ho = findC("인도일");
              if (!bal?.value || !mv?.value || bal.value === mv.value || ho?.value) return null;
              const balEv = evidenceIds(bal);
              const mvEv = evidenceIds(mv);
              return (
                <p className="card">
                  <span className="badge no">재협의 필요</span> 잔금일({bal.value})과 입주일({mv.value})이 다릅니다. 인도일을 정할까요?{" "}
                  {balEv[0] ? <button className="btn ghost" onClick={() => scrollToEvidence(balEv[0])}>잔금 근거</button> : null}{" "}
                  {mvEv[0] ? <button className="btn ghost" onClick={() => scrollToEvidence(mvEv[0])}>입주 근거</button> : null}
                </p>
              );
            })()}
            <h4>일정 · 방문</h4>
            {visits.length === 0 ? (
              <ul>
                <AgreementRow name="방문일" cond={findC("방문일")} propData={propData} me={me} onDecide={onDecide} onEvidence={scrollToEvidence} />
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
              {["계약일", "잔금일", "인도일", "입주일"].map((n) => (
                <AgreementRow key={n} name={n} cond={findC(n)} propData={propData} me={me} onDecide={onDecide} onEvidence={scrollToEvidence} />
              ))}
            </ul>
            <h4>{meta?.listing?.tradeType === "매매" ? "설비 · 공간 특성" : "옵션 · 생활 조건"}</h4>
            {meta?.listing?.options?.length ? (() => {
              const groups = groupListingFeatures(meta.listing.options);
              return <div className="deal-options-summary">
                {groups.facilities.length ? <div><small>가전·설비</small><div className="feature-chips">{groups.facilities.map(v => <span key={v}>{v}</span>)}</div></div> : null}
                {groups.structure.length ? <div><small>시설·공간</small><div className="feature-chips">{groups.structure.map(v => <span key={v}>{v}</span>)}</div></div> : null}
                {groups.lifestyle.length ? <div><small>생활 조건</small><div className="feature-chips">{groups.lifestyle.map(v => <span key={v}>{v}</span>)}</div></div> : null}
              </div>;
            })() : <p className="meta">등록된 옵션이 없습니다.</p>}
            <p className="meta">아래는 대화 중에 새로 협의한 옵션이며, 매물의 기본 옵션과 구별됩니다.</p>
            <ul>
              <AgreementRow name="옵션" cond={findC("옵션")} propData={propData} me={me} onDecide={onDecide} onEvidence={scrollToEvidence} />
              <AgreementRow name="수리 요청" cond={findC("수리 요청")} propData={propData} me={me} onDecide={onDecide} onEvidence={scrollToEvidence} />
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
      {meta?.demo && !panelOpen ? (
        <aside className={"ziptalk-companion broker-companion " + (zipOpen ? "is-open" : "")} aria-label="집톡이 거래 도우미">
          {zipPeek && !zipOpen && newestZip ? (
            <div className={"broker-peek broker-peek-" + broker.category} role="status">
              <div className="broker-peek-eyebrow">✦ 집톡이가 옆에서 한마디</div>
              <p>{broker.quip}</p>
              <div className="broker-peek-actions">
                <button type="button" onClick={() => {
                  setZipOpen(true);
                  setZipPeek(false);
                }}>제가 적은 거 볼래요? ↗</button>
                <button type="button" className="broker-peek-dismiss"
                  onClick={() => setZipPeek(false)} aria-label="집톡이 한마디 닫기">나중에요</button>
              </div>
            </div>
          ) : null}
          {zipOpen ? (
            <div className="ziptalk-popover broker-notebook" role="region"
              aria-label="집톡이의 조건 정리" onKeyDown={(e) => {
                if (e.key === "Escape") setZipOpen(false);
              }}>
              <div className="broker-notebook-head">
                <span className="ziptalk-mascot is-small" aria-hidden="true">
                  <span className="ziptalk-mascot-roof" />
                  <span className="ziptalk-mascot-face"><i/><i/><b/></span>
                  <span className="ziptalk-mascot-star">✦</span>
                </span>
                <div>
                  <span className="broker-notebook-overline">AI 이웃 도우미 · 집톡이의 중개수첩</span>
                  <h3>아유, 제가 적어뒀어요! <span aria-hidden="true">✎</span></h3>
                  <small>대화 사이사이 중요한 것만 살짝 챙길게요.</small>
                </div>
                <button type="button" className="ziptalk-close" onClick={() => setZipOpen(false)}
                  aria-label="집톡이 안내 닫기">×</button>
              </div>
              <div className="ziptalk-popover-content broker-notebook-body" ref={zipPanelRef}>
                {zipNotice ? <div className="ziptalk-status-note" role="status">{zipNotice}</div> : null}
                {zipError ? <div className="ziptalk-error" role="alert">{zipError}</div> : null}
                {zipPending ? <div className="broker-listening" role="status">
                  <span aria-hidden="true">✏️</span> 귀 쫑긋! 중요한 이야기만 메모하는 중이에요...
                </div> : null}
                <section className="broker-comment" aria-label="집톡이 한마디">
                  <span className="broker-section-label">집톡이가 한마디</span>
                  <p>{broker.quip}</p>
                </section>
                <section className="broker-progress" aria-label="지금까지 챙긴 조건">
                  <div className="broker-section-title">
                    <strong>제가 챙겨보고 있는 것들</strong>
                    <span>3가지</span>
                  </div>
                  <ul>
                    {broker.checkpoints.map((point) => (
                      <li key={point.key} className={"broker-checkpoint is-" + point.status}>
                        <span className="broker-checkpoint-icon" aria-hidden="true">
                          {point.status === "checked" ? "✓" : point.status === "pending" ? "!" : point.status === "talking" ? "·" : "○"}
                        </span>
                        <div><strong>{point.label}</strong><small>{point.description}</small></div>
                        <span className="broker-checkpoint-hint">
                          {point.status === "checked" ? "확인" : point.status === "pending" ? "살펴봐요" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="broker-next" aria-label="집톡이의 다음 제안">
                  <span className="broker-section-label">💡 다음엔 이거 하나만!</span>
                  <strong>{broker.nextStep.title}</strong>
                  <p>{broker.nextStep.note}</p>
                  <button type="button" onClick={() => placeBrokerQuestion(broker.nextStep.prompt)}>
                    그 질문, 대화창에 넣어줘 ↗
                  </button>
                  <small>메시지만 적어드려요. 보내기는 직접 선택하세요.</small>
                </section>
                {newestZip ? (
                  <section className="broker-latest-note" aria-label="방금 적은 메모">
                    <span className="broker-section-label">📝 방금 적은 메모</span>
                    <article className="ziptalk-note" id={"msg-" + newestZip.id}>
                      <p>{newestZip.text}</p>
                      {newestZip.text.includes("거래 현황에서 확인") ? (
                        <button type="button" className="ziptalk-note-link" onClick={() => void openPanel()}>
                          거래 현황에서 확인 ↗
                        </button>
                      ) : null}
                      {propData ? propData.proposals
                        .filter((p) => p.card_msg_id === newestZip.id && p.status !== "superseded" && !dismissed.includes(p.id))
                        .map((p) => (
                          <ProposalCard key={p.id} p={p} approvals={propData.approvals}
                            sides={propData.sides} demo={propData.demo} me={me}
                            onDecide={onDecide}
                            onSuggest={(name, value) => { setZipOpen(false); onSuggest(name, value); }}
                            onHold={onHold}
                            onEvidence={(id) => { setZipOpen(false); scrollToEvidence(id); }} />
                        )) : null}
                    </article>
                  </section>
                ) : null}
                {zipMessages.length > 1 ? (
                  <details className="broker-history">
                    <summary>예전에 적어둔 메모 {zipMessages.length - 1}개 <span aria-hidden="true">⌄</span></summary>
                    <div className="broker-history-list">
                      {zipMessages.slice(0, -1).map((m) => (
                        <article key={m.id} id={"msg-" + m.id} className="ziptalk-note">
                          <p>{m.text}</p>
                          {propData ? propData.proposals
                            .filter((p) => p.card_msg_id === m.id && p.status !== "superseded" && !dismissed.includes(p.id))
                            .map((p) => (
                              <ProposalCard key={p.id} p={p} approvals={propData.approvals}
                                sides={propData.sides} demo={propData.demo} me={me}
                                onDecide={onDecide}
                                onSuggest={(name, value) => { setZipOpen(false); onSuggest(name, value); }}
                                onHold={onHold}
                                onEvidence={(id) => { setZipOpen(false); scrollToEvidence(id); }} />
                            )) : null}
                        </article>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
              <div className="ziptalk-popover-footer broker-notebook-footer">
                <span>집톡이는 AI 도우미예요. 실제 중개·계약 확정은 대신하지 않아요.</span>
                <button type="button" onClick={() => void openPanel()}>거래 현황 ↗</button>
              </div>
            </div>
          ) : null}
          <button type="button" className={"ziptalk-dock-button broker-dock " + (zipPending ? "is-thinking" : "") + (zipUnread ? " has-new" : "")}
            aria-label={zipOpen ? "집톡이 안내 닫기" : "집톡이 열기"}
            aria-expanded={zipOpen}
            onClick={() => {
              setZipOpen((prev) => !prev);
              setZipPeek(false);
              setZipUnread(false);
            }}>
            <span className="ziptalk-mascot" aria-hidden="true">
              <span className="ziptalk-mascot-roof" />
              <span className="ziptalk-mascot-face"><i/><i/><b/></span>
              <span className="ziptalk-mascot-star">✦</span>
            </span>
            <span className="ziptalk-dock-caption">
              <strong>집톡이</strong>
              <small>{zipPending ? "귀 쫑긋! 듣는 중" : zipUnread ? "어머, 메모 하나 생겼어요!" : "옆에서 챙겨드려요"}</small>
            </span>
            {zipUnread && !zipOpen ? <i className="ziptalk-unread" aria-label="새 안내" /> : null}
            <span className="ziptalk-dock-chevron" aria-hidden="true">{zipOpen ? "⌄" : "⌃"}</span>
          </button>
        </aside>
      ) : null}
    </div>
  );
}
