# P8 · 등기 권리관계 사례 수집 / 실험·개발 이력

Date: 2026-11-01 · repository: hobism3/meta_p2p_realestate · branch: feat/p8-registry-casebook-benchmark-20261101 · PR #26.

## 목표
- 공개된 공공기관/부동산 해설 블로그 사례를 수집해 **등기 권리 유형별 Goldens**를 만들고 규칙 기반 분석 결과와 비교한다.
- 각 사례의 **원문 출처, 데이터가 실제/허구인지, 구조화 근거, 원래 문서로는 알 수 없는 영역**을 기록한다.
- 사진 VLM 가이드 개발과 충돌하지 않는다. 두 브랜치가 서로의 소스를 수정하지 않는다는 범위를 약속한다.
- 정식 출시 전 단계이므로 법률 전문가의 최종 판단·실계정 양측 거래 테스트는 보류하되 법률상 확정 불가를 숨기지 않는다.

## 출처/데이터셋 v1
- 13개 출처 링크. HUG 전세사기예방센터(공식 교육·사건 소개) 10개, 당당·토스·하나은행 해설 3개.
- 38개 **synthetic_derived_pattern** fixture (P8-001~038). 사용된 권리자/부동산/계약 당사자의 개인정보/원본 PDF는 **없다**.
- 가압류·압류·경매개시·가등기·신탁·임차권등기·근저당·공동담보/말소 약속·등기 외 세금/선순위 임차인/허위 임대인/시점 위험/복합 사례 포함.
- 출처 원장: [CASE_CATALOG_20261101.md](CASE_CATALOG_20261101.md).
- 데이터: `web/tests/fixtures/registry-cases.v1.json` (출처 ID, 종류/검출성/정형 input, 독립 예상 finding IDs·수치 및 주석).

## 실제 구현
- `web/lib/registry-rights-analysis.ts`: auction_commencement/provisional_registration/lease_registration, jointCollateralMentioned, cancellationPromised에 따른 설명. 후속 권리확인 단위 테스트 강화. 이전 P7의 금액/정형화 정책 유지.
- `web/app/registry/check/page.tsx`: 공동담보/말소 약속 사용자 체크, 사례 연구실 링크.
- `web/app/registry/cases/page.tsx`: 전체 유형 탐색, 가상 입력·분석 결과/출처, 골든 기대값 비교 (브라우저 로컬 계산).
- `web/tests/registry-casebook.test.mjs`: 38개 x 독립 expected 및 데이터 품질/비식별/신호 누락·false clearance 회귀, 공동담보/말소 변형 불변식.
- `web/tests/registry-rights-analysis.test.mjs`: 기존 CI 실행 목록에서 P8 casebook을 import. CI 워크플로 파일은 **건드리지 않음**.

## CI 실패/보완 기록 (불변)
1. 초기 P8 CI Next build FAIL: 말소 항목이 이미 조기 continue됐는데 `status !== cancelled`를 중복 비교해 TS 타입 비교 오류 발생. 해결: 불필요 조건 삭제. 커밋 `fe9df304`.
2. 다음 CI 294개 Node 중 293 PASS/1 FAIL: 사유 note가 너무 짧은 3건이 데이터셋 품질 게이트(>=10자)에서 실패. **테스트 기준 완화 없이** 세 사례 note를 근거와 한계가 드러나도록 보완. 커밋 `5efaa91a`.
3. 다음 CI 294개 중 293 PASS/1 FAIL: 압류 시나리오 이름이 짧아 메타데이터 품질 게이트(>=6자) 실패. 해당 사례 제목을 정확한 설명으로 수정. 커밋 `5ed867e`.
4. 이미지/교육용 PDF 원본을 웹 링크에서 직접 가져오는 시도는 cache miss/다운로드 실패. **실제 PDF 판독/OCR 성능을 평가했다고 주장하지 않음**. 원문 링크와 정책 회귀 goldens만 수집.
5. 사진 AI PR #25가 생성된 것을 실제 Git에서 확인. **공유 파일 충돌 발견:** `.github/workflows/verify-fast.yml`와 `docs/DEVELOPMENT_LOG.md`. P8은 두 파일을 base main 버전으로 돌리고 `web/tests/registry-rights-analysis.test.mjs`에서 P8 goldens import, 로그는 본 전용 파일에 저장. **PR #25와 #26 변경 파일 교집합 0개** 확인. 커밋 `394ba11e` 뒤 Git 파일 비교 증거.

## 검증 의미
**Goldens PASS**: P8에서 사람이 정의한 구조화 입력의 권리유형별 발견 ID/말소/금액누락·계산이 같은 코드 버전에서 보존된다. 이것은 권리/사실관계 법률판정 정확도도, VLM/OCR의 사진 추출 정확도도, 실제 타인 부동산의 안전성 검증도 아니다.
- 방어 규칙: 권리 기록이 없다는 입력을 안전으로 간주하지 않는다.
- 공동담보 표기만으로 실제 채무액/호실별 배분액을 계산하지 않는다.
- 근저당 말소 **약속**은 등기상 **말소 완료**로 승격하지 않는다.
- 신탁원부·임대권한·선순위 미등기 임차인·세금은 별도 증빙 필요.
- 사용자 입력/교육용 예시 ≠ 공적 등기/법률상 우선순위.

## 정확한 검증·병합 결과
- PR #26 최종 fast / e2e 및 main 병합 여부: **미확정 (후속 로그에서 실제 결과 확인 후 기입)**.
- PR #25 사진 시각 가이드: 별도 병렬 브랜치/PR, 실구현·CI·병합 상태 독립. P8은 해당 브랜치를 병합하지 않는다.
- 실생활 사용자의 등기부 PDF/개인정보·실거래 2인 거래: 사용자 요청대로 테스트 제외.
- 다음 단계: 교육용 PDF의 적법한 사용/오프라인 판독 truth set 확보, 구조화→원문 발췌 근거 표시, CI 실패형/판단불가형 분리, 실제 제휴 등기 API 가능성의 기술·법률 실사. 사진/시각 가이드와는 별도.

## 지속 업데이트 규칙
매 사례마다 신규 출처/사실과 허구 금액/법적 가정/expected output을 분리한다. 품질 게이트 실패는 원인을 먼저 조사하고 종전 사실/문서를 소급 삭제하지 않고 추가 기록한다. 중앙 DEVELOPMENT_LOG에 P8 PR main 병합의 최종 축약 기록을 남길 때에도 상대 PR #25의 병렬 변경을 우선 확인한다.

## 2026-11-01 · P8 최종 병합 검증 결과 (후속 불변 로그)
- PR #26 `feat/p8-registry-casebook-benchmark-20261101` head `bb6888bb` 기준 GitHub **verify-fast SUCCESS**. 단계: Next production build PASS, unit + DAL PASS (38개 사례별 사전 정의 golden 포함), API + READ_ONLY PASS.
- PR #26 **main 병합 성공**, squash commit `52fd46b669b263610bcb616ee9f3242eb9610823`.
- CI 실패 이력: 최초 TypeScript 취소 상태 불필요 비교 빌드 실패(수정), 사례 note 3개 길이·내용 부족(수정), 압류 사례 제목 길이 부족(수정). 정책·기대값 완화 없이 원인 수정한 뒤 PASS. 테스트의 기대값은 실제 법원 문서로부터 전사한 '공인 정답'이 아니라 소스 유형을 바탕으로 사람 손으로 만든 구조화 골든.
- `verify-e2e`의 마지막 실행은 **main 병합 당시 in_progress (최종 결과 추후 확인)**; 이 실험은 실거래 2인 QA/진짜 등기부 PDF 판독을 의미하지 않는다.
- 사진/VLM 별도 PR #25는 head `5fda26ca`에서 verify-fast/e2e SUCCESS였으나 이번 P8 병합 당시 OPEN. 상대 사진 기능 병합 여부는 상대 PR 관리 흐름에 위임. P8과 PR #25 변경 파일은 겹치지 않음.
- 외부 사업자 등기 API 계약, 본인확인기관 B/소유·위임관계 C 검증, 실제 등기 PDF OCR 및 실제 사용자 거래 검증은 미진행. P8은 사례 기반 **권리 정책 회귀**와 증거 공백 노출 단계만 완료.

## 2026-11-01 · 최종 CI 결과 확인 (PR #26 병합 후)
- 최종 P8 코드 head `bb6888bb81fab6298e8e2dd52529fb22d88d3612`:
  - `verify-fast`: **SUCCESS** — Next build PASS; Node unit+DAL **294/294 PASS**; API/READ_ONLY **206/206 PASS**.
  - `verify-e2e`: **SUCCESS** — Playwright **82 PASS / 4 SKIP**, 실패 0.
- 병합 commit: `52fd46b669b263610bcb616ee9f3242eb9610823`, PR #26 MERGED. 구현·자동 테스트 범위를 갖춘 PoC 완료.
- 38개 골든 시나리오의 통과는 **가상 구조화 입력 정책 검증**. 실제 등기사항증명서 원본 판독/이미지 OCR·VLM/개인정보 적법성/보증금 회수액 추산·실거래/전문 법률자문 검증으로 확대 해석하면 안 됨.
- PR #25 사진 AI 개발은 최종 확인 시 **OPEN**(head `5fda26ca`, verify-fast/e2e SUCCESS). 사진 시각 기능과 P8 권리관계 분석의 코드 변경은 겹치지 않음.
- 중앙 공유 개발로그는 PR #25도 같은 파일을 수정하고 있으므로 추가 충돌을 피하기 위해 건드리지 않았고, **본 파일 + README + 법률 Wiki + ROADMAP**에 P8 증거를 연결함.
