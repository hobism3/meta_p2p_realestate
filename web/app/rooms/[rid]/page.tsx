"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "../../../lib/client-auth";
import { brokerSnapshot } from "../../../lib/broker-companion";
import { hasNewProposalCue } from "../../../lib/agent";
import { groupListingFeatures, initialTerms } from "../../../lib/listing-presentation";
import {
  invokeAgent,
  invokeZiptalk,
  reconcileZiptalk,
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
  const [me] = useState(() => myId());
  const [propData, setPropData] = useState<ProposalsData | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const msgsRef = useRef<HTMLDivElement | null>(null);
  const zipBusy = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setMessages(await loadRoomMessages(params.rid));
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
      setPropData(await loadProposals(params.rid));
    } catch {
      // 패널은 조용히 비워 둔다. 채팅 흐름을 막지 않는다.
    }
  }, [params.rid]);

  useEffect(() => {
    setAuthed(!!getAccessToken());
    loadRoomMeta(params.rid).then(setMeta).catch(() => setMeta(null));
    refresh();
    void refreshConditions();
    // 상대방 메시지를 5초마다 갱신한다.
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [params.rid, refresh, refreshConditions]);

  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, aiPending]);

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

  // Group chat participant. Every note is persisted as a normal assistant message.
  const callZiptalk = async (triggerId?: string) => {
    if (zipBusy.current) return;
    zipBusy.current = true;
    setZipPending(true);
    setZipError("");
    setZipNotice("");
    try {
      const result = await invokeZiptalk(params.rid, triggerId);
      if (result.fallback === "meta_truncated")
        setZipNotice("기본 규칙으로 조건을 정리했습니다. 중요한 합의는 아래 카드에서 각자 확인해 주세요.");
      await refresh();
      await refreshConditions();
    } catch (e) {
      setZipError(`집톡이 확인 실패(${e instanceof Error ? e.message : "오류"})`);
    } finally {
      setZipPending(false);
      zipBusy.current = false;
    }
  };

  const onReconcile = async () => {
    if (zipBusy.current || !meta?.demo) return;
    zipBusy.current = true;
    setZipPending(true);
    setZipError("");
    setZipNotice("");
    try {
      const result = await reconcileZiptalk(params.rid);
      await refresh();
      await refreshConditions();
      setZipNotice(result.applied > 0
        ? "이전 대화에서 조건을 복구했어요. 아직 합의되지 않은 내용은 아래 카드에서 각자 확인해 주세요."
        : "이전 대화에 새로운 제안 근거가 없거나 이미 정리돼 있어요.");
    } catch (e) {
      setZipError(`이전 대화 재정리 실패(${e instanceof Error ? e.message : "오류"})`);
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
    if (!panelOpen) await refreshConditions();
    setPanelOpen(!panelOpen);
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

    setPanelOpen(true);
    document.getElementById("room-input")?.focus();
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const onDecide = async (pid: string, decision: "agree" | "refuse", version: number) => {
    try {
      await decideProposal(params.rid, pid, decision, version);
      await refreshConditions();
      await refresh();
    } catch (e) {
      setZipError(`합의 실패(${e instanceof Error ? e.message : "오류"})`);
      await refreshConditions();
    }
  };

  const onSuggest = (name: string, value: string) => {

    setMsg(`${name} ${value} 말고 다른 조건을 제안합니다. `);
    document.getElementById("room-input")?.focus();
  };

  const onHold = (pid: string) => {
    setDismissed((d) => (d.includes(pid) ? d : [...d, pid]));
  };

  const quickAsk = (q: string) => {
    setMsg(q);

    document.getElementById("room-input")?.focus();
  };

  const chatMessages = messages.filter((m) => m.author_type !== "assistant");
  const zipMessages = messages.filter((m) => m.author_type === "assistant");
  const newestZip = zipMessages[zipMessages.length - 1] ?? null;
  const broker = brokerSnapshot({
    tradeType: meta?.listing?.tradeType,
    conditions, visits, proposals: propData?.proposals ?? [], chat: chatMessages, latestNote: newestZip,
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
            ? "집톡이도 그룹채팅에 참여해 조건과 남은 확인 절차를 챙깁니다."
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
                <strong>{meta?.demo ? participant + " · 집톡이" : participant}</strong>
                <span className="conversation-status"><i aria-hidden="true" />
                  {meta?.demo ? "그룹채팅 · 임대인·임차인·집톡이 (AI 시연)" : "개인 거래 · 참여자 간 메시지"}
                </span>
              </div>
            </div>
            <div className="conversation-head-actions">
              <button type="button" className="conversation-tools-button" onClick={onTogglePanel}>
                <span aria-hidden="true">▤</span> {panelOpen ? "거래 현황 닫기" : "거래 현황"}
              </button>
            </div>
          </div>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="msgs conversation-feed" ref={msgsRef} role="log" aria-label="거래 대화" aria-relevant="additions text">
            <div className="conversation-day-label"><span>메시지 · {meta?.demo ? "그룹채팅 시연" : "개인 간 거래"}</span></div>
            {meta?.demo ? (
              <section className="jiptok-progress" aria-label="집톡이 진행 현황">
                <strong>✦ 집톡이가 챙기는 거래 진행</strong>
                <div className="jiptok-progress-grid">
                  {broker.checkpoints.map((point) => (
                    <div key={point.key} className={"jiptok-checkpoint is-" + point.status}>
                      <strong>{point.label}</strong>
                      <span>{point.status === "checked" ? "✓ 양측 확인" : point.status === "pending" ? "동의 대기" : point.status === "talking" ? "확인 필요" : "미정"}</span>
                      <small>{point.description}</small>
                    </div>
                  ))}
                </div>
                <div className="jiptok-journey" aria-label="거래 진행 단계">
                  {broker.journey.map((step, index) => (
                    <div key={step.key} className={"jiptok-journey-step is-" + step.status} title={step.detail}>
                      <span className="jiptok-stage-number">{step.status === "checked" ? "✓" : index + 1}</span>
                      <span>{step.label}</span>
                      <small>{step.status === "checked" ? "완료" : step.status === "pending" ? "동의 대기" : step.status === "talking" ? "확인 중" : "예정"}</small>
                    </div>
                  ))}
                </div>
                <p className="jiptok-next"><strong>집톡이의 다음 확인</strong> · {broker.nextStep.title} — {broker.nextStep.note}</p>
                <button type="button" className="jiptok-reconcile" onClick={() => void onReconcile()} disabled={zipPending}>
                  {zipPending ? "집톡이가 확인 중" : "↻ 기존 대화에서 빠진 조건 다시 정리"}
                </button>
              </section>
            ) : null}
            {messages.map((m) => {
              const jiptok = m.author_type === "assistant";
              const mine = m.author_type === "human";
              return (
                <div key={m.id} id={"msg-" + m.id} className={"conversation-row " + (jiptok ? "is-jiptok" : mine ? "is-mine" : "is-theirs")}>
                  {!mine ? <span className={"conversation-small-avatar" + (jiptok ? " jiptok-avatar" : "")} aria-hidden="true">{jiptok ? "✦" : "⌂"}</span> : null}
                  <div className="conversation-message">
                    {!mine ? <span className="conversation-author">{jiptok ? "집톡이 · 거래 진행 도우미" : m.author + authorTag(m)}</span> : null}
                    <div className={mine ? "bubble mine" : jiptok ? "bubble jiptok" : "bubble theirs"}>{m.text}</div>
                    {jiptok && propData ? propData.proposals.filter((p) => p.card_msg_id === m.id && p.status !== "superseded" && !dismissed.includes(p.id)).map((p) => (
                      <ProposalCard key={p.id} p={p} approvals={propData.approvals} sides={propData.sides} demo={propData.demo} me={me} onDecide={onDecide} onSuggest={onSuggest} onHold={onHold} onEvidence={scrollToEvidence}/>
                    )) : null}
                    <time className="conversation-time" dateTime={m.created_at}>
                      {new Date(m.created_at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}
                    </time>
                  </div>
                </div>
              );
            })}
            {zipPending && meta?.demo ? (
              <div className="conversation-row is-jiptok" role="status">
                <span className="conversation-small-avatar jiptok-avatar" aria-hidden="true">✦</span>
                <div className="conversation-message">
                  <span className="conversation-author">집톡이</span>
                  <div className="bubble jiptok conversation-typing" aria-label="집톡이가 남은 사항을 확인 중입니다"><i/><i/><i/></div>
                </div>
              </div>
            ) : null}
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
          {zipError ? <p className="conversation-inline-error" role="alert">{zipError}</p> : null}
          {zipNotice ? <p className="meta" role="status">{zipNotice}</p> : null}
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
                onChange={(e) => setMsg(e.target.value)}
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
          <p className="conversation-privacy">집톡이는 남은 확인 사항을 챙깁니다. 조건과 방문은 당사자 확인 후 확정되며, AI 시연 동의는 실제 계약이 아닙니다.</p>
        </section>
        {panelOpen ? (
          <aside className="card drawer open" aria-label="거래 현황 상세">
            <div>
              <button className="btn ghost" onClick={() => setPanelOpen(false)}>닫기</button>
            </div>
            <h3>거래 현황</h3>
            <p className="meta">등록 조건과 대화 중 제안은 구분됩니다. 동일한 조건 버전에 양측이 동의해야 합의로 표시됩니다.</p>
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
    </div>
  );
}
