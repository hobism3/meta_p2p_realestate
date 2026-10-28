"use client";

// 집톡이 조건 카드 UI 틀. mock 데이터를 그대로 그린다. AI 연결 없음.
// 확인 체크는 사람이 직접 누른다. AI가 대신 확인하지 않는다.

export interface ZiptalkDraft {
  id: string;
  field: string;
  value: string;
  version: number;
  sourceQuotes: string[];
  confirmed: { landlord: boolean; tenant: boolean };
}

export default function ZiptalkCard({
  drafts,
  unconfirmed,
}: {
  drafts: ZiptalkDraft[];
  unconfirmed: string[];
}) {
  return (
    <div className="card">
      <h2>🏠 집톡이 (중립 정리, 초안)</h2>
      <p className="meta">자동 합의가 아닙니다. 법적 효력을 보장하지 않습니다.</p>
      {drafts.map((d) => (
        <div key={d.id} className="field">
          <strong>
            {d.field}: {d.value} (v{d.version})
          </strong>
          <ul>
            {d.sourceQuotes.map((q, i) => (
              <li key={i}>“{q}”</li>
            ))}
          </ul>
          <p className="meta">
            임대인 확인: {d.confirmed.landlord ? "済" : "미확인"} · 임차인 확인:{" "}
            {d.confirmed.tenant ? "済" : "미확인"}
          </p>
        </div>
      ))}
      {unconfirmed.length > 0 ? (
        <div className="field">
          <strong>미확인 사항</strong>
          <ul>
            {unconfirmed.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
