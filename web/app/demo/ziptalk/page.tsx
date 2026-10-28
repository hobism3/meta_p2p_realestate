import ZiptalkCard from "../../../components/ZiptalkCard";

// 시연용 집톡이 미리보기. 전부 mock 데이터이며 AI 연결이 없다.
const MOCK_DRAFTS = [
  {
    id: "d1",
    field: "보증금",
    value: "900만원",
    version: 2,
    sourceQuotes: ["900에 해주세요", "시연용으로 900만원에 가능합니다"],
    confirmed: { landlord: false, tenant: true },
  },
];

export default function DemoZiptalkPage() {
  return (
    <div className="grid">
      <ZiptalkCard drafts={MOCK_DRAFTS} unconfirmed={["입주일 미확인"]} />
      <p>
        <a href="/">돌아가기</a>
      </p>
    </div>
  );
}
