export type TradeType = "월세" | "전세" | "매매";

export const ROLES = ["landlord", "tenant"];
export const VISIT_STATUS = ["제안됨", "수락됨", "거절됨"];

export interface Verification {
  identity: boolean;
  ownershipDoc: boolean;
}

export interface Listing {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  tradeType: TradeType;
  deposit: number;
  rent: number;
  /** 매매가(만원). 보증금·월세와 별도 필드. 전월세는 0이다. */
  salePrice: number;
  fee: number;
  area: number;
  moveIn: string;
  options: string[];
  description: string;
  publisher: string;
  verification: Verification;
  synthetic: boolean;
  editable: boolean;
}

export interface Filters {
  query: string;
  tradeType: "" | TradeType;
  depositMax: number | null;
  rentMax: number | null;
  salePriceMax: number | null;
  areaMin: number | null;
}

export const EMPTY_FILTERS: Filters = {
  query: "",
  tradeType: "",
  depositMax: null,
  rentMax: null,
  salePriceMax: null,
  areaMin: null,
};

export function filterListings(listings: Listing[], f: Filters): Listing[] {
  const q = f.query.trim().toLowerCase();
  return listings.filter((l) => {
    if (q && !(l.title + " " + l.address + " " + l.description).toLowerCase().includes(q)) return false;
    if (f.tradeType && l.tradeType !== f.tradeType) return false;
    if (f.depositMax !== null && l.deposit > f.depositMax) return false;
    if (f.rentMax !== null && l.rent > f.rentMax) return false;
    if (f.salePriceMax !== null && (l.tradeType !== "매매" || l.salePrice > f.salePriceMax)) return false;
    if (f.areaMin !== null && l.area < f.areaMin) return false;
    return true;
  });
}

export function formatPrice(l: Listing): string {
  if (l.tradeType === "매매") return `매매 ${l.salePrice.toLocaleString()}만원`;
  if (l.tradeType === "전세") return `전세 ${l.deposit.toLocaleString()}만원`;
  return `${l.deposit.toLocaleString()}/${l.rent.toLocaleString()}만원`;
}

const V = (identity: boolean, ownershipDoc: boolean): Verification => ({ identity, ownershipDoc });

function L(
  id: string, title: string, address: string, lat: number, lng: number,
  tradeType: TradeType, deposit: number, rent: number, salePrice: number, fee: number, area: number,
  moveIn: string, options: string[], description: string, publisher: string,
  verification: Verification,
): Listing {
  return { id, title, address, lat, lng, tradeType, deposit, rent, salePrice, fee, area, moveIn, options, description, publisher, verification, synthetic: true, editable: false };
}

// 가상 매물 24건(전월세 20 + 매매 4). 관악구 신림동 한 지역. 전부 합성 데이터이며 좌표도 가상의 근사치다.
// 시드 매물에는 실제 소유자 계정이 없다. 실매물·실소유자 인증으로 오인하지 말 것.
export const SEED_LISTINGS: Listing[] = [
  L("s01", "신림역 도보 5분 역세권 원룸", "서울 관악구 신림로 100 (가상)", 37.4842, 126.9291, "월세", 1000, 65, 0, 8, 23, "2026-11-10", ["에어컨", "냉장고", "세탁기", "엘리베이터"], "남향이라 낮에 밝습니다. 집주인이 직접 관리합니다.", "김직거", V(true, true)),
  L("s02", "조용한 주택가 투룸", "서울 관악구 신림로 120 (가상)", 37.4831, 126.9312, "월세", 2000, 85, 0, 10, 43, "2026-12-01", ["에어컨", "냉장고", "주차"], "아이 키우기 좋은 조용한 골목입니다.", "박임대", V(true, false)),
  L("s03", "신축급 풀옵션 원룸", "서울 관악구 신림로 140 (가상)", 37.4855, 126.9280, "월세", 500, 75, 0, 12, 21, "즉시 입주", ["에어컨", "냉장고", "세탁기", "건조기", "엘리베이터"], "가전 전부 새것입니다. 사진은 가상 이미지입니다.", "이집주", V(false, false)),
  L("s04", "전세 안심 투룸", "서울 관악구 호암로 60 (가상)", 37.4820, 126.9270, "전세", 18000, 0, 0, 7, 52, "2026-11-20", ["에어컨", "냉장고", "베란다"], "장기 거주 환영합니다. 관리비 별도 확인 필요.", "최전세", V(true, true)),
  L("s05", "햇살 좋은 1.5룸", "서울 관악구 신림로 90 (가상)", 37.4860, 126.9300, "월세", 1500, 70, 0, 9, 32, "2026-11-15", ["에어컨", "세탁기"], "로프트 구조라 수납이 넉넉합니다.", "정월세", V(true, false)),
  L("s06", "초역세권 소형 투룸", "서울 관악구 신림로 110 (가상)", 37.4848, 126.9295, "월세", 3000, 95, 0, 11, 45, "2026-12-10", ["에어컨", "냉장고", "세탁기", "엘리베이터", "주차"], "출퇴근 편한 위치가 장점입니다.", "강남아님", V(true, true)),
  L("s07", "가성비 원룸", "서울 관악구 난곡로 40 (가상)", 37.4810, 126.9250, "월세", 300, 55, 0, 5, 19, "즉시 입주", ["냉장고"], "옵션은 적지만 가격이 저렴합니다.", "가성비", V(false, false)),
  L("s08", "신혼부부 추천 쓰리룸", "서울 관악구 호암로 80 (가상)", 37.4805, 126.9285, "전세", 25000, 0, 0, 10, 66, "2027-01-05", ["에어컨", "냉장고", "세탁기", "주차", "베란다"], "넓은 거실이 장점입니다.", "신혼집", V(true, true)),
  L("s09", "반려동물 가능 원룸", "서울 관악구 신림로 130 (가상)", 37.4835, 126.9320, "월세", 1000, 72, 0, 8, 24, "2026-11-25", ["에어컨", "냉장고", "세탁기", "반려동물 가능"], "소형견 1마리까지 가능합니다.", "펫홈", V(true, false)),
  L("s10", "고층 전망 투룸", "서울 관악구 신림로 150 (가상)", 37.4870, 126.9275, "월세", 5000, 110, 0, 15, 50, "2026-12-20", ["에어컨", "냉장고", "세탁기", "건조기", "엘리베이터"], "고층이라 뻥 뚫립니다.", "전망좋", V(true, true)),
  L("s11", "단기 가능 원룸", "서울 관악구 난곡로 55 (가상)", 37.4815, 126.9260, "월세", 800, 68, 0, 7, 22, "협의 가능", ["에어컨", "냉장고"], "6개월 단기 계약 가능합니다.", "단기집", V(false, false)),
  L("s12", "역 앞 오피스텔형", "서울 관악구 신림로 105 (가상)", 37.4845, 126.9298, "월세", 2000, 90, 0, 13, 28, "2026-11-30", ["에어컨", "냉장고", "세탁기", "엘리베이터"], "보안과 관리가 잘 됩니다.", "오피스", V(true, false)),
  L("s13", "전세 소형 원룸", "서울 관악구 호암로 70 (가상)", 37.4825, 126.9280, "전세", 12000, 0, 0, 6, 25, "2026-12-15", ["에어컨", "냉장고"], "전세자금대출 상담은 은행에 직접 문의하세요.", "전세집", V(true, true)),
  L("s14", "가족용 투룸", "서울 관악구 난곡로 70 (가상)", 37.4800, 126.9240, "월세", 2500, 80, 0, 9, 48, "2027-02-01", ["에어컨", "냉장고", "세탁기", "주차"], "학교가 가까워 통학이 편합니다.", "가족집", V(true, false)),
  L("s15", "리모델링 원룸", "서울 관악구 신림로 95 (가상)", 37.4850, 126.9305, "월세", 1200, 66, 0, 8, 23, "2026-11-12", ["에어컨", "냉장고", "세탁기"], "화장실과 주방을 새로 했습니다.", "리모델", V(false, true)),
  L("s16", "저층 테라스 투룸", "서울 관악구 호암로 90 (가상)", 37.4795, 126.9290, "월세", 1800, 78, 0, 8, 46, "협의 가능", ["에어컨", "세탁기", "테라스"], "작은 테라스가 있습니다.", "테라스", V(true, false)),
  L("s17", "보증금 낮은 월세방", "서울 관악구 난곡로 50 (가상)", 37.4812, 126.9255, "월세", 200, 60, 0, 6, 20, "즉시 입주", ["냉장고", "세탁기"], "초기 비용이 적게 듭니다.", "저보증", V(false, false)),
  L("s18", "신축 투룸", "서울 관악구 신림로 160 (가상)", 37.4875, 126.9285, "월세", 4000, 100, 0, 12, 47, "2026-12-05", ["에어컨", "냉장고", "세탁기", "건조기", "엘리베이터", "주차"], "준신축이라 깔끔합니다.", "준신축", V(true, true)),
  L("s19", "전세 역세권 원룸", "서울 관악구 신림로 115 (가상)", 37.4840, 126.9300, "전세", 15000, 0, 0, 8, 27, "2026-11-28", ["에어컨", "냉장고", "세탁기", "엘리베이터"], "역에서 정말 가깝습니다.", "역전세", V(true, false)),
  L("s20", "넓은 1.5룸", "서울 관악구 호암로 65 (가상)", 37.4828, 126.9275, "월세", 1600, 74, 0, 9, 33, "2026-12-01", ["에어컨", "냉장고"], "짐 많은 분께 좋습니다.", "넓은집", V(false, false)),
  L("s21", "신림역 초역세권 매매 투룸", "서울 관악구 신림로 108 (가상)", 37.4846, 126.9293, "매매", 0, 0, 45000, 11, 45, "협의 가능", ["에어컨", "냉장고", "세탁기", "엘리베이터"], "역세권 실거주용입니다. 합성 시연 매물입니다.", "매매집", V(false, false)),
  L("s22", "남향 매매 원룸", "서울 관악구 난곡로 60 (가상)", 37.4813, 126.9258, "매매", 0, 0, 28000, 7, 24, "2026-12-01", ["에어컨", "냉장고"], "첫 집 마련용으로 적당합니다. 합성 시연 매물입니다.", "첫집", V(false, false)),
  L("s23", "신축급 매매 쓰리룸", "서울 관악구 호암로 85 (가상)", 37.4802, 126.9288, "매매", 0, 0, 72000, 12, 68, "2027-01-10", ["시스템에어컨", "확장형", "주차", "베란다"], "가족 실거주용입니다. 합성 시연 매물입니다.", "내집", V(false, false)),
  L("s24", "급매 매매 투룸", "서울 관악구 신림로 125 (가상)", 37.4838, 126.9315, "매매", 0, 0, 39000, 9, 47, "협의 가능", ["시스템에어컨", "비확장형", "세탁기"], "가격 협의 가능합니다. 합성 시연 매물입니다.", "급매", V(false, false)),
];

export interface DealMessage {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface VisitSchedule {
  id: string;
  date: string;
  time: string;
  status: "제안됨" | "수락됨" | "거절됨";
}

export interface AgreementLog {
  id: string;
  text: string;
  createdAt: string;
}

export const CHECKLIST_ITEMS: string[] = [
  "신분 확인",
  "소유자 확인",
  "대리인 위임장 확인",
  "관리비 체납 확인",
  "확정일자 안내 확인",
  "전입신고 안내 확인",
  "거래신고 의무 안내 확인",
];
