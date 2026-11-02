"use client";
import {useUiLocale} from "../lib/ui-locale";

/** Global explanatory text only; property facts and user chat are never translated. */
export default function LocalizedShellCopy({kind}:{kind:"tag"|"footer"}){
 const {tr}=useUiLocale();
 if(kind==="tag")
  return <span className="tag">{tr("AI 거래 시연 · 소유자 미검증","AI transaction demo · Ownership unverified")}</span>;
 return <footer className="footer">{tr(
  "시연용 서비스입니다. 기본 예시 매물은 합성 데이터이며 사용자 등록 매물의 게시권한·소유권·권리관계는 검증하지 않았습니다. 플랫폼 내 조건 확인은 계약 효력 판단이 아닙니다.",
  "This is a prototype. Sample properties are fictional; real ownership, posting rights, and title records have not been independently verified. In-app agreement does not establish a legally binding contract."
 )}</footer>;
}
