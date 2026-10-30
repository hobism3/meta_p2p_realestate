import type { TradeType } from "./listings";

export interface RegisterDraft {
  title: string;
  address: string;
  tradeType: TradeType;
  deposit: string;
  rent: string;
  salePrice: string;
  fee: string;
  area: string;
  moveIn: string;
  options: string;
  description: string;
  publisher: string;
}

export const EMPTY_REGISTER_DRAFT: RegisterDraft = {
  title: "", address: "", tradeType: "월세",
  deposit: "", rent: "", salePrice: "", fee: "", area: "", moveIn: "",
  options: "", description: "", publisher: "",
};

export const REGISTER_STEPS = [
  { label: "시작", short: "시작" },
  { label: "공간 정보", short: "공간" },
  { label: "거래 조건", short: "가격" },
  { label: "생활 정보", short: "생활" },
  { label: "최종 확인", short: "확인" },
] as const;

export type RegisterStep = 0 | 1 | 2 | 3 | 4;
export interface RegisterIssue { field: keyof RegisterDraft; message: string; step: RegisterStep; }

const isNonnegative = (value: string): boolean =>
  value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
const isPositive = (value: string): boolean => isNonnegative(value) && Number(value) > 0;

export function registrationIssue(form: RegisterDraft, step: RegisterStep): RegisterIssue | null {
  const issue = (field: keyof RegisterDraft, message: string): RegisterIssue => ({ field, message, step });
  if (step === 1) {
    if (!form.title.trim()) return issue("title", "매물 제목을 입력해 주세요.");
    if (!form.address.trim()) return issue("address", "주소를 입력해 주세요.");
    if (!isPositive(form.area)) return issue("area", "면적은 0보다 큰 숫자로 입력해 주세요.");
  }
  if (step === 2) {
    if (form.tradeType === "매매") {
      if (!isPositive(form.salePrice)) return issue("salePrice", "매매가는 0보다 큰 숫자로 입력해 주세요.");
    } else {
      if (!isNonnegative(form.deposit)) return issue("deposit", "보증금을 숫자로 입력해 주세요.");
      if (form.tradeType === "월세" && !isNonnegative(form.rent)) return issue("rent", "월세를 숫자로 입력해 주세요.");
    }
  }
  if (step === 3) {
    if (!form.moveIn.trim()) return issue("moveIn", "입주 가능 시기를 입력해 주세요.");
    if (form.fee.trim() && !isNonnegative(form.fee)) return issue("fee", "관리비는 0 이상의 숫자로 입력해 주세요.");
    if (!form.publisher.trim()) return issue("publisher", "게시자명을 입력해 주세요.");
  }
  return null;
}

export function firstRegistrationIssue(form: RegisterDraft): RegisterIssue | null {
  return registrationIssue(form, 1) ?? registrationIssue(form, 2) ?? registrationIssue(form, 3);
}

export function listingPriceLabel(form: Pick<RegisterDraft, "tradeType" | "deposit" | "rent" | "salePrice">): string {
  const fmt = (n: string) => {
    if (!n.trim() || !Number.isFinite(Number(n))) return "—";
    return Number(n).toLocaleString("ko-KR");
  };
  if (form.tradeType === "매매") return "매매 " + fmt(form.salePrice) + "만";
  if (form.tradeType === "전세") return "전세 " + fmt(form.deposit) + "만";
  return fmt(form.deposit) + " / " + fmt(form.rent) + "만";
}
