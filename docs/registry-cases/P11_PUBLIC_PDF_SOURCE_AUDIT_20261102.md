# P11 공개 등기부 교육용 PDF 원본 확보·해석 벤치마크 (2026-11-02)

## 0. 완료 판정의 기준
이전 P9/P10은 자체 제작 합성 PDF/텍스트만 검증했다. **이번에는 공개 사이트가 제공하는 원본 PDF 7개의 바이트가 실제로 외부 CI 실행 환경에 다운로드되고 SHA-256으로 고정**되었다. GitHub Actions [원본 확보 실험](https://github.com/hobism3/meta_p2p_realestate/actions/runs/41369533054)의 stdout에는 파일의 원문이 아니라 해시·바이트·페이지·텍스트층·검출 수치만 남는다.

- **파일 확보 사실** = 2026-11-02 CI Runner 메모리에서 실 PDF 바이트 수신 및 PDF.js 로드/정형화 평가.
- **지속 보관 사실이 아님** = 원본 PDF 자체는 repo·CI artifact·서버 DB·외부 LLM·사용자 대화 파일로 재배포하지 않았다. 필요하면 원 출처 링크에서 동일 해시 재확인.
- **공식 등기부 아님** = 아래 5종은 출처 제작자가 '교육용 가상'이라고 직접 밝힌 자료; 추가 2종은 PDF 내의 등기기록례가 포함된 일반 교육자료다.
- **성능 검증 수준** = PDF.js 실제 텍스트층을 읽은 결과와 기존 P9 권리 해석기의 성공/실패를 관찰. 페이지 이미지의 취소선·셀 경계를 사람이 시각 정답화한 ground truth는 아직 없다.
- **라이선스 주의** = 공개 열람/다운로드 가능성이 외부 PDF 전체의 재배포·상업적 학습 허용을 뜻하지 않는다. 원문 PDF는 Git에 넣지 않는다.

## 1. 외부 공개 PDF 5종 — 당당의 교육용 가상 샘플

[출처: 등기부등본 보는 법](https://dangdang.io/blog/registry-document-guide), 2026-05-19 작성. 페이지 본문이 자체 제작한 교육용 가상 PDF·이미지라고 명시한다.

|ID|문서 링크|수신 바이트|SHA-256|PDF.js 텍스트층|최초 P10 파서 결과|
|---|---|---:|---|---|---|
|DANGDANG-NORMAL|[normal.pdf](https://dangdang.io/blog/registry-samples/normal.pdf)|908854|`2ddff3f07aa1…a87b50`|1페이지 826 items|권리 0건(정상 예시로 기대)|
|DANGDANG-PROVISIONAL|[provisional-attachment.pdf](https://dangdang.io/blog/registry-samples/provisional-attachment.pdf)|909534|`f4acf20a41ca…ef4021125f06875aef0cb4251f07f1`|1페이지 847 items|**가압류 0건: 누락 결함**|
|DANGDANG-MORTGAGE|[mortgage-60.pdf](https://dangdang.io/blog/registry-samples/mortgage-60.pdf)|908370|`c0d795a2c6dd…053e506c13f9`|1페이지 850 items|**근저당 0건: 누락 결함**|
|DANGDANG-MULTI|[multi-risk.pdf](https://dangdang.io/blog/registry-samples/multi-risk.pdf)|913157|`b2ea6887d754…394d879192dab09`|2페이지 954 items|**복합 위험 0건: 누락 결함**|
|DANGDANG-FIXED-DATE|[lease-fixed-date-only.pdf](https://dangdang.io/blog/registry-samples/lease-fixed-date-only.pdf)|1087433|`b65aed6cd76d…e506c13f9` (정확 해시는 JSON 참조)|1페이지 855 items|0건; 실제 권리 여부와 다른 절차 구분은 원문 대조 필요|

> 해시의 정확한 64자리 값, URL, 용량은 `web/tests/fixtures/registry-public-sources.v1.json`에서 관리. 이 표의 짧은 SHA는 가독용이며 정밀 무결성 비교에는 사용하지 않는다. 5개 모두 PDF.js 로드 및 텍스트층 복원 성공. 단계별 `sectionHeaders=3`으로 표제부/갑·을구 헤더를 추출했으나 권리기재 **행 파싱은 기존 규칙에서 실패**했다.

## 2. 추가 공개 실무 교육자료 PDF 2종

|ID|출처|수신 바이트/페이지|첫 검사 결과/용도|
|---|---|---|---|
|EBS-LEGAL-2008|[EBS 법과사회 2009학년도 6월 모의평가](https://wdown.ebsi.co.kr/W61001/01exam/20080604/s_bns_mun.pdf)|588005 / 4페이지|수신 SHA 고정. 시험 문항에 **등기부 표와 근저당** 교육 예시; 기존 P10에서 mortgage 1건. 시험지 전체를 법원의 등기사항증명서로 해석하지 않는다.|
|JOBGO-GA-2017|[부동산등기실무·가등기 교육](https://cont0.jobgo.ne.kr/contents/K353TQ/pc/down/66.pdf)|754970 / 24페이지|바이트 다운로드 및 해시 고정. P10의 **20p 상한에 따라 전체 PDF 분석을 거절**; 자료가 불완전했는데도 권리 없음 판정하지 않음.|

검토 참조로 별도 [한성대 KOCW 강의 PDF](https://kocw-n.xcache.kinxcdn.com/data/document/2025/hansung/kimhyunju0623/12-2.pdf)와 [공시법 강의노트](https://att.eduspa.com/EtcData/board/4052/2017%20%EC%9E%84%EC%9D%98%EC%84%AD%20%EA%B3%B5%EC%8B%9C%EB%B2%95%20%EA%B0%95%EC%9D%98%EB%85%B8%ED%8A%B8.pdf)의 등기 표 형태를 확인했다. **이 2개는 이번 CI 원본 수집 목록에는 포함하지 않아 실파일 분석했다고 보고하지 않는다**.

## 3. 확인된 원래 코드의 한계
- PDF.js `getTextContent`는 성공하고 텍스트층에서 1~2페이지 글자·표 제목이 추출됨. 하지만 P9 parser는 단일 행의 맨 앞에 순위번호+등기목적이 잘 나타난다는 가정이 강해서 실제 표의 복잡한 셀 좌표/여러 줄 기재에서 **가압류·근저당·경매 모두 0건**을 반환했다.
- 기술적으로 결측 발견과 권리 미존재는 다르다. `candidateCount=0`만으로 안전·정상 결론을 내리는 UX는 금지.
- 공개 교육 PDF 포맷의 〖 갑 구 〗 헤더, 1900년대 등기일자, 순위번호 `3-1`/이기 `전(10)`, 채권최고액 금액 뒤 슬래시 구분 등을 처리/검토하도록 P11 파서 골든을 별도로 만들었다.
- **다음 기술 과제는 PDF의 2D 열 위치/셀 병합을 사용해 '순위번호' 셀과 '등기목적' 셀이 같은 논리적 행에 속하는지 복원하는 것**. PDF 글자가 있다는 사실만으로 해당 구조를 잘못 추측해선 안 된다.

## 4. 재현 가능한 감사 스크립트
- `web/scripts/probe-public-registry-pdfs.mjs`: URL 화이트리스트(출처 7개), 공개 PDF만 8MiB 제한, SHA256 고정, PDF.js 문자/페이지/기존 P10 복원과 P9 후보 추출. **원본 비저장, stdout 비식별 통계만**.
- `.github/workflows/public-registry-educational-corpus.yml`: PR/수동 실행, GitHub 격리 runner, 민감 원본 artifacts 없음, Node/npm 고정.
- `web/tests/fixtures/registry-public-sources.v1.json`: 원문 URL, 공개 가상/교육 문서 구분, 수신 바이트·SHA256, 이용 범위, 개인정보 정책.
- 다운로드에 실패하면 실패 상태 그대로 기록하고 빈 결과를 다른 가상 PDF로 대체해 '실제 검증 성공'이라 주장하지 않는다.
- 공개 교육용 자료라 해도 사람이 작성한 원문 좌표·표·말소선의 정답과 연결되기 전에는 **문서 파싱 precision/recall 등의 수치를 계산하지 않는다**.

## 5. 보안·법률 및 외부 제약
- `공개 열람/발급 가능`은 `원문 수집·재배포·국외 AI 전송 동의`의 대체 수단이 아니다.
- 검색 결과에는 실재 부동산 등기사항증명서(성명·주소·권리자 포함) PDF도 있었으나 **의도적으로 수집 대상에서 제외**하고 그 링크와 주소를 샘플 목록에 넣지 않았다.
- 법적 소유권/B/C 본인확인, 임차권 우선순위, 체납액, 보증금 반환 가능성은 이 벤치마크의 결과가 아니다.
- 지금도 P10 브라우저 업로드는 로컬 텍스트층만 처리하며 원문을 외부 Meta/서버 API로 전송하지 않는다.

## 6. 판정 메모
초기 수집 상태: **7/7 교육용 PDF 파일 수신**, 그중 **6건 텍스트층 복원**, 24p 자료 1건 상한 거부. 핵심 5건에서 **실제 권리 행 탐지 품질 미달(가압류·근저당·복합 위험 false negative)**. 후속 코드 수정과 골든 통과 여부는 `P11_DEVELOPMENT_LOG_20261102.md`에 재검증 결과를 누적한다.
