"use client";

import { useCallback, useEffect, useState } from "react";
import { CHECKLIST_ITEMS, type Listing } from "../../../lib/listings";
import {
  addAgreement,
  findListing,
  loadAgreements,
  loadChecks,
  loadMessages,
  loadRole,
  loadVisits,
  proposeVisit,
  saveChecks,
  saveRole,
  sendMessage,
  setVisitStatus,
  type DealAgreement,
  type DealMessage,
  type DealVisit,
} from "../../../lib/store";

const ROLE_LABEL: Record<string, string> = { landlord: "임대인", tenant: "임차인" };

export default function DealPage({ params }: { params: { id: string } }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [messages, setMessages] = useState<DealMessage[]>([]);
  const [visits, setVisits] = useState<DealVisit[]>([]);
  const [agreements, setAgreements] = useState<DealAgreement[]>([]);
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [role, setRole] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [agree, setAgree] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [m, v, a, c] = await Promise.all([
        loadMessages(params.id),
        loadVisits(params.id),
        loadAgreements(params.id),
        loadChecks(params.id),
      ]);
      setMessages(m); setVisits(v); setAgreements(a); setChecks(c);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    }
  }, [params.id]);

  useEffect(() => {
    findListing(params.id).then((l) => {
      if (!l) setMissing(true);
      else setListing(l);
    }).catch((e) => setError(e instanceof Error ? e.message : "조회 실패"));
    setRole(loadRole(params.id));
    refresh();
  }, [params.id, refresh]);

  if (missing) return <div className="card">매물을 찾을 수 없습니다. <a href="/">돌아가기</a></div>;
  if (!listing) return <div className="card">불러오는 중...</div>;

  const needRole = () => {
    if (!role) { setError("역할을 먼저 고르세요"); return false; }
    if (!name.trim()) { setError("이름을 입력하세요"); return false; }
    return true;
  };

  const onSend = async () => {
    if (!msg.trim() || !needRole()) return;
    try { await sendMessage(params.id, name.trim(), role, msg.trim()); setMsg(""); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "전송 실패"); }
  };
  const onPropose = async () => {
    if (!date || !time) { setError("날짜·시간을 고르세요"); return; }
    try { await proposeVisit(params.id, date, time); setDate(""); setTime(""); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "제안 실패"); }
  };
  const onVisit = async (vid: string, status: string) => {
    try { await setVisitStatus(params.id, vid, status); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "변경 실패"); }
  };
  const onAgree = async () => {
    if (!agree.trim()) return;
    try { await addAgreement(params.id, agree.trim()); setAgree(""); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "기록 실패"); }
  };
  const onCheck = async (item: string) => {
    const next = { ...checks, [item]: checks[item] === "done" ? "" : "done" };
    setChecks(next);
    try { await saveChecks(params.id, next); }
    catch (e) { setError(e instanceof Error ? e.message : "저장 실패"); }
  };
  const pickRole = (r: string) => { setRole(r); saveRole(params.id, r); };

  return (
    <div className="grid">
      <section className="card">
        <h2>거래방: {listing.title}</h2>
        <p className="meta">서버에 저장됩니다. AI 정리·결제·계약 확정 기능은 없습니다.</p>
        <div className="dealrow">
          <select value={role} onChange={(e) => pickRole(e.target.value)}>
            <option value="">역할 선택</option>
            <option value="landlord">임대인</option>
            <option value="tenant">임차인</option>
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름(별명)" />
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      <div className="grid two">
        <section className="card">
          <h3>문의 메시지</h3>
          {messages.map((m) => (
            <div key={m.id} className="msg">
              <div className="who">{m.author}({ROLE_LABEL[m.role] ?? m.role}) · {m.created_at}</div>{m.text}
            </div>
          ))}
          {messages.length === 0 && <p className="meta">아직 메시지가 없습니다.</p>}
          <div className="dealrow">
            <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="메시지 입력" />
            <button className="btn" onClick={onSend}>전송</button>
          </div>
        </section>

        <section className="card">
          <h3>방문 일정</h3>
          {visits.map((v) => (
            <div key={v.id} className="msg">
              <div>{v.visit_date} {v.visit_time} · {v.status}</div>
              {v.status === "제안됨" && (
                <div style={{ marginTop: 6 }}>
                  <button className="btn ghost" onClick={() => onVisit(v.id, "수락됨")}>수락</button>{" "}
                  <button className="btn ghost" onClick={() => onVisit(v.id, "거절됨")}>거절</button>
                </div>
              )}
            </div>
          ))}
          {visits.length === 0 && <p className="meta">제안된 일정이 없습니다.</p>}
          <div className="dealrow">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            <button className="btn" onClick={onPropose}>제안</button>
          </div>
        </section>
      </div>

      <section className="card">
        <h3>합의 로그</h3>
        {agreements.map((a) => (
          <div key={a.id} className="msg"><div className="who">{a.created_at}</div>{a.text}</div>
        ))}
        {agreements.length === 0 && <p className="meta">합의 내용이 없습니다.</p>}
        <div className="dealrow">
          <input value={agree} onChange={(e) => setAgree(e.target.value)} placeholder="예: 보증금 1000만원, 월세 65만원, 11월 10일 입주" />
          <button className="btn" onClick={onAgree}>기록</button>
        </div>
      </section>

      <section className="card">
        <h3>거래 준비 체크리스트(기본)</h3>
        {CHECKLIST_ITEMS.map((item) => (
          <div key={item} className="msg">
            <label>
              <input type="checkbox" checked={checks[item] === "done"} onChange={() => onCheck(item)} /> {item}
            </label>
          </div>
        ))}
        <p className="meta">안내용입니다. 법률 자문이 아닙니다.</p>
      </section>
    </div>
  );
}
