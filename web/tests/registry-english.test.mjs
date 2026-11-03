import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {registryEnglish,formatRegistryAmount} from "../lib/registry-english.ts";
import {registryEnglishView} from "../components/RegistryEnglish.ts";
import {reviewRegistryRights,RIGHT_LABELS,REVIEW_CHECKS} from "../lib/registry-rights-analysis.ts";
import {REGISTRY_SIGNALS} from "../lib/registry-review.ts";
import {extractRegistryText} from "../lib/registry-text-extraction.ts";

const hangul=/[가-힣]/;
function requireEnglish(value){
  if(typeof value==="string")assert.equal(hangul.test(registryEnglish(value)),false,value);
  else if(value&&typeof value==="object")Object.values(value).forEach(requireEnglish);
}

describe("English registry presentation preserves evidence and legal uncertainty",()=>{
  it("converts manwon output to full KRW without changing canonical inputs",()=>{
    assert.equal(formatRegistryAmount(12000),"₩120,000,000");
    assert.equal(formatRegistryAmount(6000),"₩60,000,000");
    assert.equal(registryEnglish("18,000만원"),"₩180,000,000");
    assert.equal(registryEnglish("0만원"),"₩0");
  });
  it("preserves JSX fragment boundary spaces through exact, pattern and composite translations",()=>{
    assert.equal(registryEnglish("\n원문에서 현행 확인\t")," Shown as active in source ");
    assert.equal(registryEnglish("\t1/2페이지 텍스트 복원 중\n")," Reconstructing text: page 1 of 2 ");
    assert.equal(registryEnglish(" / 순위번호 ")," / Entry rank ");
    assert.equal(registryEnglish("건 검토")," candidates");
    const row=createElement("h3",null,"갑구"," / 순위번호 ",2);
    assert.equal(renderToStaticMarkup(registryEnglishView(row,true)),"<h3>Section A (ownership) / Entry rank 2</h3>");
  });
  it("covers actual extraction labels and warnings for every fictional text-layer case",()=>{
    const fixture=JSON.parse(readFileSync(new URL("./fixtures/registry-text-layer.v1.json",import.meta.url),"utf8"));
    for(const sample of fixture.cases){
      const before=sample.text;
      const result=extractRegistryText(sample.text);
      requireEnglish(sample.name);
      requireEnglish(result.warnings);
      for(const c of result.candidates){requireEnglish(c.evidence.label);requireEnglish(c.warnings);}
      assert.equal(sample.text,before);
    }
  });
  it("covers all review kinds, checks, quick signals and dynamic result descriptions",()=>{
    requireEnglish(REVIEW_CHECKS);requireEnglish(REGISTRY_SIGNALS);
    for(const status of ["active","unknown","cancelled"]){
      const rights=Object.keys(RIGHT_LABELS).map((kind,i)=>({
        id:String(i),kind,status,section:"갑구",rankNumber:i+1,registrationDate:"2026-01-01",
        claimMaximumManwon:12000,jointCollateralMentioned:true,cancellationPromised:true,
      }));
      const result=reviewRegistryRights({rights,issuedOn:"2026-01-01",asOfDate:"2026-11-03",proposedDepositManwon:3000});
      requireEnglish(result.findings);requireEnglish(result.notes);
      assert.equal(rights[0].section,"갑구");assert.equal(rights[0].claimMaximumManwon,12000);
    }
    const empty=reviewRegistryRights({rights:[],issuedOn:"",asOfDate:"2026-11-03"});
    requireEnglish(empty.findings);
  });
  it("translates persisted Korean notices at render time but preserves source text and select values",()=>{
    const source="【갑 구】 가압류 원본 근거";
    const node=createElement("section",null,
      createElement("p",null,"이전 화면에서 사용자가 대조한 정형 권리 후보 3건을 불러왔습니다. 진위 또는 법률상 효력 확인은 아닙니다."),
      createElement("select",{defaultValue:"갑구"},createElement("option",{value:"갑구"},"갑구")),
      createElement("textarea",{"data-registry-source":true,defaultValue:source}),
      createElement("strong",{"data-registry-source":true},"내 등기부.pdf"),
    );
    assert.equal(registryEnglishView(node,false),node);
    const markup=renderToStaticMarkup(registryEnglishView(node,true));
    assert.match(markup,/Loaded 3 structured candidates/);
    assert.match(markup,/not authentication or verification of legal effect/);
    assert.match(markup,/value="갑구"/);
    assert.match(markup,/Section A \(ownership\)/);
    assert.ok(markup.includes(source));assert.ok(markup.includes("내 등기부.pdf"));
  });
});
