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

export function parseVisitProposal(text: string, refISO: string): VisitDateTime | null {
  const base = kstParts(refISO);
  if (!base) return null;
  const t = text.replace(/\s/g, "");
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
