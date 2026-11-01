import type { OwnerAiPolicy } from "./owner-ai.ts";

export interface DelegateListing {
  tradeType: string;
  deposit: number;
  rent: number;
  salePrice: number;
  area: number;
  address: string;
  options: string[];
  moveIn: string;
}
export type DelegateAnswer = {
  response: string;
  handoff: boolean;
  kind: "price_review" | "visit_review" | "contract_review" | "policy_review" | "other";
};
const dayNames = ["일","월","화","수","목","금","토"];
const money = (n:number) => Number.isFinite(n) ? Number(n).toLocaleString("ko-KR") : "확인되지 않음";
export function ownerVisitWindows(policy: OwnerAiPolicy): string {
  if (!policy.availability.length) return "방문 가능 시간이 아직 등록되지 않았습니다.";
  const schedule=policy.availability.map(s => `${dayNames[s.weekday]}요일 ${s.start}~${s.end}`).join(", ");
  return `방문 가능 시간(한국 시간)은 ${schedule}입니다. 아직 방문 예약은 확정되지 않았습니다.`;
}
function handoff(kind:DelegateAnswer["kind"],text:string):DelegateAnswer {
  return { kind, handoff:true, response:text+" 집주인에게 확인 요청을 남겼습니다. 답변을 받으면 이 거래방에서 확인할 수 있어요." };
}
function fact(text:string):DelegateAnswer {
  return {kind:"other",handoff:false,response:text};
}
/**
 * First-party, deterministic RAG-like policy response. This function does not
 * use an LLM and may only quote structured owner/immutable listing facts.
 * Any request to make a promise, amend terms or reserve a time is escalated.
 */
export function answerOwnerInquiry(text:string, listing:DelegateListing, policy:OwnerAiPolicy):DelegateAnswer {
  const t=text.trim();
  if (!t) return handoff("other","문의 내용을 다시 확인해주세요.");
  const contract=/(계약|가계약|특약|잔금|계약금|보증보험|근저당|등기|보증금 반환|환불|위임|소유권|세금)/;
  const priceOffer=/(할인|깎|네고|인하|낮춰|올리면|내리면|협상|조정|흥정|흥정|맞춰|제안|딜|후려|싼값|에\s*해|만원[에로]\s*가능)/;
  if (contract.test(t)) return handoff("contract_review","계약·권리관계·금전 관련 판단은 AI가 대신 확정하지 않습니다.");
  if (priceOffer.test(t)) return handoff("price_review","가격이나 보증금 변경 요청은 집주인이 직접 결정합니다.");
  const askingVisit=/(방문|집\s*보|방\s*보|보러|보여|내일|모레|예약|시간대|일정|몇\s*시)/.test(t);
  const explicitSlot=/(\d{1,2}\s*(?:시|:)|\d{1,2}\s*월\s*\d{1,2}|\d{4}-\d\d-\d\d|이번\s*주|다음\s*주|토요일|일요일|월요일|화요일|수요일|목요일|금요일|내일|모레)/.test(t);
  const booking=/(예약|잡아|확정|갈게|가겠습니다|보러\s*갈|찾아갈|방문하고\s*싶|볼\s*수|가능할까요|괜찮나요|해도\s*되)/.test(t);
  if (askingVisit) {
    const window=ownerVisitWindows(policy);
    if (booking && explicitSlot || /예약|방문하고\s*싶|잡아/.test(t))
      return handoff("visit_review",window+" 요청하신 방문 일정은 아직 예약되지 않았습니다.");
    return fact(window);
  }
  if (/(반려|고양이|강아지|애완|펫|동물)/.test(t)){
    if (policy.answers.pets) return fact("집주인이 입력한 반려동물 조건은 '"+policy.answers.pets+"'입니다. 예외는 집주인에게 직접 확인해주세요.");
    return handoff("policy_review","반려동물 허용 여부가 아직 등록되지 않았습니다.");
  }
  if (/(주차|차량|주차장|차를\s*댈)/.test(t)){
    if (policy.answers.parking) return fact("집주인이 입력한 주차 조건은 '"+policy.answers.parking+"'입니다.");
    return handoff("policy_review","주차 조건이 아직 등록되지 않았습니다.");
  }
  if (/(가격|금액|월세|매매가|보증금|얼마|몇\s*만)/.test(t)){
    const value=listing.tradeType==="월세" ? `보증금 ${money(listing.deposit)}만원 / 월세 ${money(listing.rent)}만원`
      : listing.tradeType==="전세" ? `전세보증금 ${money(listing.deposit)}만원` : `매매가 ${money(listing.salePrice)}만원`;
    return fact("현재 등록된 매물 조건은 "+value+"입니다. 조건 변경은 집주인 확인이 필요합니다.");
  }
  if (/(면적|평수|몇\s*평|몇\s*제곱|크기|넓이)/.test(t))return fact(`등록된 면적은 ${money(listing.area)}㎡입니다.`);
  if (/(주소|위치|어디|동네)/.test(t))return fact("매물에 등록된 주소는 "+listing.address+"입니다.");
  if (/(입주|언제\s*들어|이사)/.test(t))return fact("등록된 입주 가능 조건은 "+listing.moveIn+"입니다. 날짜 변경은 집주인 확인이 필요합니다.");
  if (/(옵션|가전|에어컨|세탁기|가구|냉장고|시설)/.test(t)){
    return fact(listing.options.length ? "등록된 기본 옵션은 "+listing.options.join(", ")+"입니다." : "별도로 등록된 기본 옵션이 없습니다.");
  }
  if (/(추가\s*안내|특이사항|기타\s*안내|주의\s*사항)/.test(t) && policy.answers.notes)
    return fact("집주인이 입력한 안내는 '"+policy.answers.notes+"'입니다.");
  if (/^(안녕하세요|안녕|문의드립니다|문의요|반갑습니다)[\s!?.~]*$/.test(t))
    return fact("안녕하세요. 집주인이 설정한 AI 대리인입니다. 등록된 매물 정보와 방문 가능 시간을 알려드릴 수 있습니다.");
  return handoff("other","등록된 정보만으로는 정확하게 답변하기 어렵습니다.");
}
