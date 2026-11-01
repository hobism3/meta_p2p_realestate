"use client";
import {useMemo,useState} from "react";
import {REGISTRY_SIGNALS,registryReview,type RegistryFlag} from "../../../lib/registry-review";

const flags=Object.keys(REGISTRY_SIGNALS) as RegistryFlag[];
export default function RegistryReadingGuide(){
 const [selected,setSelected]=useState<RegistryFlag[]>([]);
 const result=useMemo(()=>registryReview(selected),[selected]);
 const toggle=(value:RegistryFlag,checked:boolean)=>
  setSelected(previous=>checked?[...previous,value]:previous.filter(x=>x!==value));
 return <div className="grid owner-page">
  <div className="owner-hero"><span>RIGHTS CHECK · SELF REVIEW</span>
   <h1>등기부 권리관계 읽기</h1>
   <p>대법원 등기사항증명서를 직접 열람하고, 확인해야 할 항목을 선택하세요. 이름·주소·주민등록번호·등기 PDF를 입력받거나 업로드하지 않습니다.</p>
  </div>
  <section className="card">
   <h2>1. 등기사항증명서를 직접 확인하세요</h2>
   <p>등기부는 소유자가 아니어도 수수료를 내고 열람할 수 있습니다. 표제부·갑구·을구의 내용과 발급일을 확인하세요.</p>
   <a className="btn ghost" href="https://www.iros.go.kr/" target="_blank" rel="noopener noreferrer">
    대법원 인터넷등기소에서 열람 ↗
   </a>
   <p className="meta">개별 등기사항증명서 열람과 외부 업체의 등기정보 재판매·개인정보 처리 권한은 서로 다른 문제입니다.</p>
  </section>
  <section className="card" aria-label="권리관계 수동 점검표">
   <h2>2. 확인된 사항만 선택하세요</h2>
   <p className="meta">선택하지 않은 항목은 해당 권리가 없다는 의미가 아닙니다. 스스로 확인하지 못한 항목도 선택해 후속 조치를 보세요.</p>
   <div className="grid" style={{gap:12}}>
    {flags.map(flag=><label key={flag} style={{display:"flex",alignItems:"flex-start",gap:12}}>
      <input type="checkbox" checked={selected.includes(flag)} onChange={e=>toggle(flag,e.target.checked)}/>
      <span>{REGISTRY_SIGNALS[flag].title}</span>
     </label>)}
   </div>
  </section>
  <section className="card" aria-live="polite">
   <h2>3. 다음 확인할 사항 ({result.findings.length})</h2>
   {result.findings.length===0?<p>선택한 항목이 없습니다. 점검을 마쳤거나 권리관계가 안전하다는 뜻은 아닙니다.</p>:null}
   {result.findings.map(item=><article key={item.flag} className="card" style={{marginBottom:12}}>
    <h3>{item.title}</h3><p>{item.description}</p><p><b>추가 확인:</b> {item.check}</p>
   </article>)}
   {result.notes.map(note=><p className="meta" key={note}>{note}</p>)}
   <button className="btn ghost" type="button" onClick={()=>setSelected([])}>점검 선택 초기화</button>
  </section>
 </div>;
}
