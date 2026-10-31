import type { DealMessage, RoomCondition, RoomProposal, RoomVisit } from "./store.ts";

export type BrokerState = "pending" | "talking" | "checked" | "not-started";
export interface BrokerCheckpoint {
  key: "price" | "visit" | "living";
  label: string;
  status: BrokerState;
  description: string;
}
export interface BrokerNextStep {
  title: string;
  note: string;
  prompt: string;
}
export interface DealStage { key: string; label: string; status: BrokerState; detail: string }
export interface BrokerSnapshot {
  journey: DealStage[];
  quip: string;
  category: "welcome" | "price" | "visit" | "living" | "general";
  checkpoints: BrokerCheckpoint[];
  nextStep: BrokerNextStep;
}

/** Only matching persisted condition versions are considered confirmed. */
function confirmed(c: RoomCondition | undefined): boolean {
  return !!c && !!c.confirmed_by && Number(c.confirmed_version) === Number(c.version);
}
function koreanTime(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return "말씀하신 방문 시간";
  const month = Number(date.slice(5, 7)), day = Number(date.slice(8, 10));
  const hour = Number(time.slice(0, 2)), minute = Number(time.slice(3, 5));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return "말씀하신 방문 시간";
  const ap = hour < 12 ? "오전" : "오후", h = hour % 12 || 12;
  return month + "월 " + day + "일 " + ap + " " + h + "시" + (minute ? " " + minute + "분" : "");
}
function preferredVisit(visits: RoomVisit[]): RoomVisit | undefined {
  const active = visits.filter((v) => v.status === "제안됨" || v.status === "수락됨");
  // The endpoint sorts by visit date, not proposal creation time. If the
  // creation timestamps are available, the most recently proposed state wins.
  const withTimestamp = active.filter((v) => v.created_at && !Number.isNaN(Date.parse(v.created_at)));
  if (active.length > 0 && withTimestamp.length === active.length) {
    return [...active].sort((a, b) =>
      Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""))[0];
  }
  return active.find((v) => v.status === "제안됨") ??
    active.find((v) => v.status === "수락됨") ?? visits[0];
}

/** Pure UI presenter. Never invent a concluded agreement or appointment. */
export function brokerSnapshot(input: {
  tradeType?: string;
  conditions: RoomCondition[];
  visits: RoomVisit[];
  proposals?: RoomProposal[];
  chat: DealMessage[];
  latestNote?: DealMessage | null;
}): BrokerSnapshot {
  const { conditions, visits, chat, latestNote } = input;
  const byName = new Map(conditions.map((c) => [c.name, c]));
  const trade = input.tradeType ?? "월세";
  const finalName = trade === "매매" ? "최종 매매가" : trade === "전세" ? "최종 전세보증금" : "월세 조건";
  const finalPrice = byName.get(finalName);
  // A persisted condition confirmation is not bilateral approval.
  // The approval service is the single source of truth for a concluded term.
  const latestProposal = (name: string) =>
    (input.proposals ?? []).filter((p) => p.name === name && p.status !== "superseded").slice(-1)[0];
  const priceProposal = latestProposal(finalName);
  const offers = trade === "매매" ? ["매수 희망가", "매도 제안가"]
    : ["임차 희망 조건", "임대 제안 조건"];
  const wishText = byName.get(offers[0])?.value ?? "";
  const offeredText = byName.get(offers[1])?.value ?? "";
  const hasPriceTalk = offers.some((name) => !!byName.get(name)?.value);
  const priceStatus: BrokerState = priceProposal?.status === "agreed" ? "checked"
    : priceProposal?.status === "proposed" ? "pending"
      : finalPrice?.value || hasPriceTalk ? "talking" : "not-started";
  const visit = preferredVisit(visits);
  const visitCondition = byName.get("방문일");
  const visitProposal = latestProposal("방문일");
  const visitStatus: BrokerState = visit?.status === "제안됨" ? "pending"
    : visit?.status === "수락됨" || visitProposal?.status === "agreed" ? "checked"
      : visitProposal?.status === "proposed" ? "pending"
        : visitCondition?.value ? "talking" : "not-started";
  const lifeConditions = ["입주일", "옵션", "관리비", "수리 요청"].map((key) => byName.get(key));
  const lifeMentioned = chat.some((m) => m.author_type !== "assistant" &&
    /고양이|강아지|반려동물|반려묘|반려견|입주|관리비|옵션|가전|수리/.test(m.text));
  const lifeStatus: BrokerState = ["입주일", "옵션", "관리비", "수리 요청"].some((key) => latestProposal(key)?.status === "agreed") ? "checked"
    : lifeConditions.some((c) => !!c?.value) || lifeMentioned ? "talking" : "not-started";

  const checkpoints: BrokerCheckpoint[] = [
    {
      key: "price", label: "가격 이야기", status: priceStatus,
      description: priceStatus === "checked" ? "서로 확인됨"
        : priceStatus === "pending" ? "제안 답변 대기"
        : hasPriceTalk ? "양측 확인 전" : "아직 시작 전",
    },
    {
      key: "visit", label: "집 보러 가기", status: visitStatus,
      description: visitStatus === "checked" ? "일정 확인됨"
        : visitStatus === "pending" ? "확인할 일정 있어요"
        : visitStatus === "talking" ? "날짜 얘기 중" : "아직 미정",
    },
    {
      key: "living", label: "생활 조건", status: lifeStatus,
      description: lifeStatus === "checked" ? "확인한 내용 있어요"
        : lifeStatus === "talking" ? "대화 중" : "챙겨볼 차례",
    },
  ];

  const spoken = latestNote?.text ?? "";
  const hasPetQuestion = chat.some((m) => m.author_type === "human" &&
    /고양이|강아지|반려동물|반려묘|반려견/.test(m.text));
  const visitText = visit ? koreanTime(visit.visit_date, visit.visit_time) : "방문 일정";
  let category: BrokerSnapshot["category"] = "welcome";
  let quip = "어머, 반가워요! 얘기 편하게 나누세요. 중요한 건 제가 옆에서 적어둘게요. 📝";
  if (spoken) {
    if (/방문|보러|일정|시간|뵐게|뵙/.test(spoken)) {
      category = "visit";
      quip = visitStatus === "pending"
        ? "어머, " + visitText + " 얘기가 나왔네요! 아직 제안 단계니까, 한 번만 확인해 보세요."
        : visitStatus === "checked"
          ? "집 보는 일정은 확인됐네요! 혹시 다른 조건도 같이 챙겨볼까요?"
          : "집 보러 갈 날짜 얘기가 나왔네요. 시간까지 맞았는지 제가 같이 살펴볼게요.";
    } else if (/보증금|월세|매매가|가격|임차|임대|금액|전세/.test(spoken)) {
      category = "price";
      quip = priceStatus === "checked"
        ? "어머, 금액 조건은 확인됐네요! 남은 일정도 제가 챙겨볼게요."
        : wishText && offeredText
          ? "어머, 원하신 건 " + wishText + ", 상대 제안은 " + offeredText + "이네요! 아직 확정 전이에요. 각자 조건이 같은지 확인해 주세요."
          : wishText || offeredText
            ? "어머, " + (wishText || offeredText) + " 이야기가 나왔네요! 아직 상대방 확인이 남아 있어요."
            : "양쪽에서 금액 이야기가 오갔네요. 제가 메모했어요! 아직 합의됐다고 보긴 이르죠.";
    } else if (/옵션|반려|고양이|강아지|입주|관리비|수리/.test(spoken)) {
      category = "living";
      quip = hasPetQuestion
        ? "어머, 반려동물 이야기도 나왔네요! 허용 여부뿐 아니라 세부 조건도 같이 확인해 두면 좋아요."
        : "이런 생활 조건이 은근 중요하거든요! 나중에 놓치지 않게 같이 챙겨봐요.";
    } else {
      category = "general";
      quip = "아유, 중요한 얘기는 제가 잘 적어두고 있어요. 지금 정리한 메모를 같이 볼까요?";
    }
  }

  const viewingDone = chat.some((m) => m.author_type === "human" &&
    /(?:방|집|매물)\s*보고\s*왔|보고\s*왔는데/.test(m.text));
  let nextStep: BrokerNextStep;
  if (visitStatus === "pending" && !viewingDone) {
    nextStep = {
      title: "방문 시간, 한 번만 확인해 봐요",
      note: visitText + " 일정이 제안됐어요. 아직 예약이 확정된 건 아니에요.",
      prompt: visitText + "에 방문하는 일정으로 확인해도 될까요?",
    };
  } else if (priceStatus === "pending" || priceStatus === "talking") {
    nextStep = {
      title: "가격은 서로 맞았는지 물어봐요",
      note: "희망 금액과 상대방 제안은 합의와 다르니까요.",
      prompt: "지금 이야기한 가격 조건을 한 번 더 정리해 주실 수 있나요?",
    };
  } else if (hasPetQuestion) {
    nextStep = {
      title: "반려동물 조건도 챙겨볼까요?",
      note: "대화에 나온 허용 여부와 세부 조건은 따로 확인해 두는 게 좋아요.",
      prompt: "반려동물을 키울 때 특별히 지켜야 할 조건이 있을까요?",
    };
  } else if (visitStatus === "not-started" && !viewingDone) {
    nextStep = {
      title: "집은 언제 볼 수 있을까요?",
      note: "일정을 물어보면 다음 단계가 훨씬 쉬워져요.",
      prompt: "집을 직접 보고 싶은데, 방문 가능한 날짜와 시간이 언제인가요?",
    };
  } else {
    nextStep = {
      title: "생활 조건을 한번 챙겨봐요",
      note: "관리비와 입주 가능일은 나중에 꼭 확인할 부분이에요.",
      prompt: "관리비와 입주 가능일, 추가 생활 조건을 알려주실 수 있나요?",
    };
  }
  const contract = latestProposal("계약일");
  const earnest = latestProposal("계약금");
  const handover = latestProposal("인도일");
  const balance = latestProposal("잔금일");
  const moveIn = latestProposal("입주일");
  const options = ["옵션", "수리 요청", "관리비"].map(latestProposal);

  const optionPending = options.some((p) => p?.status === "proposed");
  const hasPetTalk = chat.some((m) => m.author_type !== "assistant" && /고양이|강아지|반려동물|반려묘|반려견/.test(m.text));
  const anyContractStep = contract?.status === "agreed" || earnest?.status === "agreed";
  const stage = (key: string, label: string, status: BrokerState, detail: string): DealStage => ({key,label,status,detail});
  const journey: DealStage[] = [
    stage("visit", "집 확인·방문", viewingDone || visitStatus === "checked" ? "checked" : visitStatus, viewingDone ? "방문했다는 대화 있음" : visit?.status === "수락됨" ? "일정 확인" : "날짜·시간 확인"),
    stage("price", "가격 확정", priceStatus, priceStatus === "checked" ? "양측 동의 완료" : "가격 카드 양측 동의 필요"),
    stage("options", "옵션·특약", optionPending ? "pending" : options.some((p) => p?.status === "agreed") ? "checked" : hasPetTalk ? "talking" : "not-started", optionPending ? "제안 카드 응답 대기" : "반려동물·수리·관리비 확인"),
    stage("contract", trade === "매매" ? "계약·가계약 여부" : "임대차 계약", contract?.status === "agreed" ? "checked" : contract?.status === "proposed" ? "pending" : "not-started", "계약일과 필요한 서류 확인"),
    stage("earnest", "계약금", earnest?.status === "agreed" ? "checked" : earnest?.status === "proposed" ? "pending" : "not-started", "금액·지급 시점 확인"),
    stage("handover", "잔금·입주", balance?.status === "agreed" && (handover?.status === "agreed" || moveIn?.status === "agreed") ? "checked" :
      [balance,handover,moveIn].some((p) => p?.status === "proposed") ? "pending" : "not-started", "잔금일·인도/입주일·실제 열쇠 전달")
  ];
  if (priceStatus === "pending") {
    nextStep = {title:"가격 조건, 두 분이 확정해 주세요",note:"제안 카드를 확인하고 임대인·임차인이 각각 동의해야 합니다.",prompt:"이 가격 조건으로 최종 확정할까요?"};
  } else if (priceStatus === "checked" && optionPending) {
    nextStep = {title:"옵션과 특약도 확정할까요?",note:"반려동물 허용이나 수리 같은 조건은 양측 확인 뒤 기록합니다.",prompt:"이 옵션 조건에 두 분 모두 동의하시나요?"};
  } else if (priceStatus === "checked" && contract?.status === "proposed") {
    nextStep = {title:"계약일을 확정할까요?",note:"제안된 계약 날짜를 카드에서 양측이 확인해 주세요.",prompt:"말씀하신 날짜로 계약일을 확정할까요?"};
  } else if (priceStatus === "checked" && !contract?.value && !anyContractStep) {
    nextStep = {title:"계약일은 언제로 할까요?",note:trade === "매매" ? "가계약은 필수가 아닙니다. 계약일과 가계약 여부를 먼저 정해 보세요." : "계약일, 계약금, 입주 가능일을 차례로 확인해요.",prompt:"두 분, 계약일은 언제로 하실까요?"};
  } else if (contract?.status === "agreed" && earnest?.status !== "agreed") {
    nextStep = {title:"계약금 금액과 시점을 확인할까요?",note:"계약일이 정해졌으니 계약금 지급 조건을 두 분이 확인해 주세요.",prompt:"계약금은 얼마를 언제 지급할까요?"};
  } else if (anyContractStep && !balance?.value) {
    nextStep = {title:"잔금일은 언제로 할까요?",note:"매매는 인도일, 임대차는 입주일과 함께 확인해요.",prompt:"잔금 지급일과 인도/입주일은 언제로 정할까요?"};
  }
  return { quip, category, checkpoints, nextStep, journey };
}
