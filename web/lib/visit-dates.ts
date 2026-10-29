/**
 * VS-3C 방문 일시 해석. 순수 함수(네트워크·DB 없음).
 * 기준 시각은 메시지 작성 시각을 Asia/Seoul 벽시계로 읽는다.
 * 모호한 표현(다음 주 단독·어제 등 과거)은 null을 낸다. 임의 확정 금지.
 */

export interface VisitDateTime {
  date: string;
  time: string | null;
  display: string;
}

const DOW: Record<string, number> = {
  일요일: 0, 월요일: 1, 화요일: 2, 수요일: 3, 목요일: 4, 금요일: 5, 토요일: 6,
  일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
};

function kstParts(refISO: string): { y: number; m: number; d: number; dow: number } | null {
  const ref = new Date(refISO);
  if (Number.isNaN(ref.getTime())) return null;
  const k = new Date(ref.getTime() + 9 * 3600 * 1000);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), dow: k.getUTCDay() };
}

function daysIn(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function fmt(date: string, time: string | null): string {
  const m = parseInt(date.slice(5, 7), 10);
  const d = parseInt(date.slice(8, 10), 10);
  if (!time) return `${m}월 ${d}일`;
  const h = parseInt(time.slice(0, 2), 10);
  const min = time.slice(3, 5);
  const ap = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${m}월 ${d}일 ${ap} ${h12}시${min === "30" ? " 반" : ""}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function shift(base: { y: number; m: number; d: number }, days: number): { y: number; m: number; d: number } {
  const t = Date.UTC(base.y, base.m - 1, base.d) + days * 86400000;
  const k = new Date(t);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate() };
}

function parseTime(t: string): string | null {
  const hm = t.match(/(\d{1,2}):(\d{2})/);
  if (hm) {
    const h = parseInt(hm[1], 10);
    const mi = hm[2];
    if (h > 23 || (mi !== "00" && mi !== "30")) return null;
    return `${pad(h)}:${mi}`;
  }
  const m = t.match(/(오전|오후|낮|밤|저녁)?\s*(\d{1,2})시(?:\s*(반))?/);
  if (!m) return null;
  const raw = parseInt(m[2], 10);
  const min = m[3] ? "30" : "00";
  const mark = m[1] ?? "";
  if (!mark) {
    if (raw > 12 && raw <= 23) return `${pad(raw)}:${min}`;
    return null;
  }
  if (raw < 1 || raw > 12) return null;
  let h = raw;
  if (mark === "오전") h = raw % 12;
  else if (mark === "오후") h = raw % 12 + 12;
  else if (mark === "밤" || mark === "저녁") h = raw === 12 ? 12 : raw + 12;
  if (h === 24) h = 12;
  return `${pad(h)}:${min}`;
}

/**
 * 표기 오타를 정규화한다. 토오일→토요일 등.
 */
export function normalizeDateTypo(text: string): string {
  return text.replace(/토오일/g, "토요일").replace(/수오일/g, "수요일");
}

/**
 * 오전/오후 표시 없는 1~11시를 돌려준다. 낮 시간대 추측이 아니라 확인 후보용이다.
 * 표시가 있거나 12시·24시 표기면 null이다.
 */
export function bareHour(text: string): number | null {
  const t = text.replace(/\s/g, "");
  if (/(오전|오후|낮|밤|저녁|새벽|아침|자정|정오)/.test(t)) return null;
  const m = t.match(/(\d{1,2})\s*시/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (h < 1 || h > 11) return null;
  return h;
}

export function parseVisitProposal(text: string, refISO: string): VisitDateTime | null {
  const base = kstParts(refISO);
  if (!base) return null;
  const t = normalizeDateTypo(text).replace(/\s/g, "");
  let ymd: string | null = null;

  const full = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/) ?? t.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (full) {
    const y = parseInt(full[1], 10);
    const m = parseInt(full[2], 10);
    const d = parseInt(full[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m)) ymd = iso(y, m, d);
  }
  if (!ymd) {
    const md = t.match(/(\d{1,2})월(\d{1,2})일/);
    if (md) {
      const m = parseInt(md[1], 10);
      const d = parseInt(md[2], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        if (m === base.m && d < base.d) return null;
        let y = base.y;
        if (m < base.m) y++;
        if (d <= daysIn(y, m)) ymd = iso(y, m, d);
      }
    }
  }
  if (!ymd) {
    const rel = t.match(/(오늘|내일|모레|글피)/);
    if (rel) {
      const off = rel[1] === "오늘" ? 0 : rel[1] === "내일" ? 1 : rel[1] === "모레" ? 2 : 3;
      const s = shift(base, off);
      ymd = iso(s.y, s.m, s.d);
    }
  }
  if (!ymd) {
    const nw = t.match(/다음주(일요일|월요일|화요일|수요일|목요일|금요일|토요일|일|월|화|수|목|금|토)/);
    if (nw) {
      const target = DOW[nw[1]];
      const dw = base.dow === 0 ? 7 : base.dow;
      let off = 7 - dw + target;
      if (off <= 0) off += 7;
      const s = shift(base, off);
      ymd = iso(s.y, s.m, s.d);
    } else if (/다음주/.test(t)) {
      return null;
    }
  }
  if (!ymd) {
    const wk = t.match(/(이번주)?(일요일|월요일|화요일|수요일|목요일|금요일|토요일)/);
    if (wk && !/다음주/.test(t)) {
      const target = DOW[wk[2]];
      const off = (target - base.dow + 7) % 7;
      const s = shift(base, off);
      ymd = iso(s.y, s.m, s.d);
    }
  }
  if (!ymd) {
    const nm = t.match(/다다음달\s*(\d{1,2})일/) ?? t.match(/다음달\s*(\d{1,2})일/);
    if (nm) {
      const d = parseInt(nm[1], 10);
      if (d >= 1 && d <= 31) {
        let y = base.y;
        let m = base.m + (/다다음달/.test(t) ? 2 : 1);
        while (m > 12) {
          m -= 12;
          y++;
        }
        if (d <= daysIn(y, m)) ymd = iso(y, m, d);
      }
    }
  }
  if (!ymd) {
    const dd = t.match(/(\d{1,2})일/);
    if (dd && !/월/.test(t)) {
      const d = parseInt(dd[1], 10);
      if (d >= 1 && d <= 31) {
        let y = base.y;
        let m = base.m;
        if (d < base.d) {
          m++;
          if (m > 12) {
            m = 1;
            y++;
          }
        }
        if (d <= daysIn(y, m)) ymd = iso(y, m, d);
      }
    }
  }
  if (!ymd) return null;
  if (ymd < iso(base.y, base.m, base.d)) return null;
  const time = parseTime(text);
  return { date: ymd, time, display: fmt(ymd, time) };
}

/**
 * "38,500만원"·"3억 8,500만원" 같은 표기를 만원 정수로 바꾼다. 파싱 불가면 null.
 */
/**
 * 공통 만원 정수 파서. extractPriceManwon·parseManwonInt·normalizeValue가 공유한다.
 * - 7억1천/7억1천만원/7.1억/71,000만원 → 71000
 * - 3억8천 → 38000, 3억8,500만원 → 38500, 1천만 → 1000
 * - 단위 없는 맨 숫자는 만원으로 본다(3억8500 → 38500). 천은 천만원이다.
 * - 시·일·월·년은 금액 단위가 아니라서 null이다. 해석 실패도 null이다.
 */
export function parseManwon(text: string): number | null {
  const clean = text.replace(/,/g, "");
  let total = 0;
  let seen = false;
  let rest = clean;
  const eok = clean.match(/(\d+(?:\.\d+)?)\s*억/);
  if (eok) {
    total += Math.round(parseFloat(eok[1]) * 10000);
    seen = true;
    rest = clean.slice((eok.index ?? 0) + eok[0].length);
  }
  const scope = eok ? rest : clean;
  const um = scope.match(/(\d+(?:\.\d+)?)\s*(천만|천|만)/);
  if (um) {
    const n = parseFloat(um[1]);
    const unit = um[2];
    total += Math.round(n * (unit === "만" ? 1 : 1000));
    seen = true;
  } else {
    const bm = scope.match(/(\d+(?:\.\d+)?)/);
    if (bm && !eok) return null;
    if (bm) {
      const n = parseFloat(bm[1]);
      total += Math.round(n >= 1000 ? n : n * 1000);
      seen = true;
    }
  }
  return seen && total > 0 ? total : null;
}

export function parseManwonInt(value: string): number | null {
  return parseManwon(value);
}

export interface MonthRef {
  year: number;
  month: number;
  display: string;
}

/**
 * 일 없는 월 표현을 KST 기준 YYYY년 M월로 정규화한다. 일을 임의로 만들지 않는다.
 * 내년 M월·다음달·다다음달·이번달·M월(지나간 월은 내년)을 지원한다.
 */
export function parseMonthRef(text: string, refISO: string): MonthRef | null {
  const base = kstParts(refISO);
  if (!base) return null;
  const t = text.replace(/\s/g, "");
  const ny = t.match(/내년(\d{1,2})월/);
  if (ny) {
    const m = parseInt(ny[1], 10);
    if (m < 1 || m > 12) return null;
    return { year: base.y + 1, month: m, display: `${base.y + 1}년 ${m}월` };
  }
  if (/다다음달/.test(t)) {
    let y = base.y;
    let m = base.m + 2;
    while (m > 12) {
      m -= 12;
      y++;
    }
    return { year: y, month: m, display: `${y}년 ${m}월` };
  }
  if (/다음달/.test(t)) {
    let y = base.y;
    let m = base.m + 1;
    if (m > 12) {
      m = 1;
      y++;
    }
    return { year: y, month: m, display: `${y}년 ${m}월` };
  }
  if (/이번달/.test(t)) {
    return { year: base.y, month: base.m, display: `${base.y}년 ${base.m}월` };
  }
  const bm = t.match(/(\d{1,2})월/);
  if (bm && !/(\d{1,2})월(\d{1,2})일/.test(t)) {
    const m = parseInt(bm[1], 10);
    if (m < 1 || m > 12) return null;
    const y = m < base.m ? base.y + 1 : base.y;
    return { year: y, month: m, display: `${y}년 ${m}월` };
  }
  return null;
}
