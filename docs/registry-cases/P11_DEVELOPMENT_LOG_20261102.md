# P11 · 공개 등기사항증명서 교육용 PDF 기반 개발·감사 로그

Date: 2026-11-02 · branch `feat/p11-public-registry-corpus-20261102` · PR #31.

## 절대 목표
P8(38개 권리 구조 입력) → P9(문자층 정형 후보 15개) → P10(PDF.js 브라우저 텍스트 좌표 복원) 이후, **실제로 공개 다운로드되는 PDF 원본에서 권리항목을 누락 없이 추출할 수 있는지**를 확인한다. 과거의 테스트는 합성 자료만 있어 문서 정확성을 주장하기 어려웠다. 이제 게시자가 **'교육용 가상'**이라고 밝힌 5개 문서와 2개 공개 교재를 CI runner에서 실제 다운로드하여 평가한다.

## 1. 공개 원문 확보 진위
- [수집 첫 실제 성공 Actions #41369533054](https://github.com/hobism3/meta_p2p_realestate/actions/runs/41369533054): 7/7 공개 PDF 원본 파일을 Runner 메모리로 다운로드, PDF SHA256/바이트 길이 확인.
- 5/5 당당 허구 교육용 PDF `normal`, `provisional-attachment`, `mortgage-60`, `multi-risk`, `lease-fixed-date-only`; EBS 2008 시험 PDF, 부동산등기실무 2017 교재 PDF 추가.
- 6/7개는 P10 규격(≤20페이지)에서 텍스트층 복원. 24페이지 실무교재는 **전체 분석 상한으로 거부**. 더 길면 그냥 앞 20페이지에서 '안전' 결론을 내지 않는다.
- 7개 원본의 URL, SHA256 정확한 64자리, 크기와 공개/가상 구분은 `web/tests/fixtures/registry-public-sources.v1.json`.
- 바이트는 GitHub CI **임시 프로세스 메모리에서만 사용**, Git/Actions artifact/문서/DB/Meta에 PDF 원본이나 추출한 이름·주소·문장을 보관·재배포하지 않음. 공개 검색 중 식별 가능한 실제 권리자/주소가 포함된 등기 PDF는 연구 대상에서 제외.

## 2. 첫 벤치마크 — 원본 확보로 발견한 결함
- 첫 P10 parser: 당당 5종 **갑구/을구 섹션 제목 3개 인식**, 근저당·가압류·경매 등의 권리 **모두 0건**, 정상 문서만 우연히 맞아 보였음.
- 원본 PDF.js 텍스트층에는 우선순위·등기목적 숫자 행이 명백히 있었으며, **그 한 행만 분리해 parser에 넣으면 올바른 후보**가 나옴.
- 비식별 행 형식 분석에서 `갑|구`, `을|구`처럼 PDF.js 좌표 기반 재구성 중 구역 글자 사이에 칼럼 구분 기호가 생기는 문제가 확인됨. `sectionOf`가 그 기호를 제거하지 않아 표제부→갑구/을구 전환 실패.
- 수정: PDF 구역 헤더의 `|`/`│`/`¦`/`·` 정규화. 더 많은 구역 제목 서식 `〖 갑 구 〗` 지원. 원본 문서 전체 재실행 후 **근저당/가압류/경매 후보 검출** 복구.

## 3. 수정 후 실제 공개 PDF 인식 결과
[실원본 기반 의미 게이트 SUCCESS Actions #41370802954](https://github.com/hobism3/meta_p2p_realestate/actions/runs/41370802954):
|자료|페이지/텍스트층|검출된 후보|채권최고액 합계|
|---|---|---|---:|
|DANGDANG-NORMAL|1/1|0|0|
|DANGDANG-PROVISIONAL|1/1|가압류 1, 근저당 1|12,000만원|
|DANGDANG-MORTGAGE|1/1|근저당 2|**29,000만원**|
|DANGDANG-MULTI|2/2|가압류 1, 경매개시 1, 근저당 2|32,000만원|
|DANGDANG-FIXED-DATE|1/1|0|0|
|EBS-LEGAL-2008|4/4|근저당 후보 1|금액 미확정|
|JOBGO-GA-2017|24페이지|상한(20페이지) 초과: 해석 거부|검증 대상 아님|

- 위 5종은 **해당 발행자의 가상 사례에 대한 타입 존재 및 최소건수**, 그리고 발행 설명의 교육용 근저당 합계(29,000만원)까지 출처에 부합해 **5/5 의미 게이트 PASS**.
- 12,000/32,000만원은 **현 코드의 산출값**이므로 사람이 원문에서 권리/금액/말소 상태를 독립 주석한 Truth Set으로 검증한 정확도라고 주장하지 않는다.
- 이 검증은 **진위·소유자 확인·최신 권리·가처분/말소선·법률상 우선순위·보증금 회수 가능성**을 확인한 것이 아니다. 감지 후보는 모두 `unknown` 상태 유지.

## 4. 테스트/운영 도구
- `.github/workflows/public-registry-educational-corpus.yml`: 7개 원본 URL 화이트리스트, 8MiB 본문 제한, PDF 파서 범위 제한, SHA256 확인, PDF/원문 텍스트 저장·출력 금지, 당당 허구 5건의 필수 타입/건수/합계 게이트. 입력 또는 외부 파일이 바뀌면 **명시적 FAIL**, 다운로드 불가면 `inconclusive` 대신 FAIL로 기록(단, 네트워크 변동은 앱 기능 정확도와 구분).
- `web/scripts/probe-public-registry-pdfs.mjs`: 외부 PDF를 프로세스 메모리에서 읽고 `PUBLIC_REGISTRY_CORPUS` 및 `PUBLIC_REGISTRY_EVIDENCE_GATE` 통계만 stdout. 디버깅용 PDF 글자행 내용, 좌표, 이름·주소·번호는 출력하지 않음.
- `web/scripts/cache-fictional-registry-pdfs.mjs`: 선택적 **개인 개발 PC 전용 파일 캐시**. `cd web && node scripts/cache-fictional-registry-pdfs.mjs --private-corpus`; 당당 허구 5개만 SHA/바이트 검사 후 `web/.local-registry-training-docs/`(Gitignore) 0600 mode로 신규 기록, 기존 파일 덮어쓰기 금지. 원본 재배포 금지.
- `web/tests/fixtures/registry-published-format.v1.json`: 공개 교재에 등장하는 `〖 갑 구 〗`, 1995년 등기일, `3-1` 부기순위·슬래시 금액을 토대로 **직접 작성한 별도 합성** 6개 골든 (원본 PDF 전사 아님).
- `web/tests/registry-published-format.test.mjs`, `web/tests/registry-public-corpus.test.mjs`: 각 가상 형식 및 출처 pin/권한 경계 정책 검사. 기존 `web/tests/registry-rights-analysis.test.mjs`가 import해 verify-fast에 포함.

## 5. 원인별 실패와 수정이력(테스트 기준 완화 없음)
1. 공개 자료 첫 수집: Node/PDF.js로는 7개 다운로드 성공, parser 권리 0건 → 제목 섹션 정규화와 행 구분자 보완 `68efd15e`. 대조값은 별도 6개 가상 골든.
2. P11 추가 테스트: 1800줄 초과 시 일부 1건 후보가 반환되는 문제 발견 → **1800줄 초과 전체 결과 거부**. 원인: 페이지 마커를 포함해 계산해 실제 데이터 줄을 덜 읽음, 수정 과정에서 line 변수 선언이 빠져 TypeScript build fail/ PDF probe ReferenceError. 이후 `a4caf237`에서 `number` 선언/증가를 복구하고 실제 추출 줄수 상한과 단순 line locator를 함께 유지. 이후 fast+source+e2e SUCCESS 확인.
3. 50건 초과 권리 후보를 첫 50개만 반환하던 규칙은 **부분 데이터 오판**을 일으킬 수 있으므로 목록 전체 거부로 변경. 기존 테스트 기대값도 '50건 반환'에서 '전체 거부'로 강화.
4. 교육용 원본의 웹 다운로드가 한시적으로 실패하는 경우 네트워크 장애를 실제 '권리 없음/안전'으로 해석하지 않는다.
5. 초기 probe는 단순 '바이트 수집 성공'만으로 CI 성공을 반환했으나, 별도 **SHA·구조·권리 타입/최소건수·근저당 출처 가상합계** 게이트를 추가. `3c4500ea` 이후 공개 교육용 5건 ALL PASS.
6. 문서 원문 디버그 출력 대신 몇 글자·행 구조만 요약했으며, 최종 CI에서는 행 shape 출력 자체를 제거하여 누출 여지를 더 줄임.
7. Github 실행 로그/출처 SHA가 남지만 **실제 원본 PDF raw/extracted owner/creditor identifiers는 남기지 않는 정책**은 기존 P9/P10과 동일.

## 6. 범위 제한·병렬 작업
- 시각사진 매물등록 PR #25 소스 변경 없음. P11의 원본 PDF 검증은 사진/옵션 VLM과 별개.
- 실거래 2인 E2E/본인확인 제휴/등기소 API·재배포 허가/법률 자문은 사용자 계획상 별도 단계.
- 최종 PR main squash SHA/CI 수치 및 사용 권한 관련 근거는 병합 시 후속 이력 append.
- 화면 `/registry/extract`에 적용되는 실제 파서 개선은 다음 배포에서만 반영. Vercel Production이 최신인지 불확실한 문제는 기존 Issue #30 별도.

## 2026-11-02 · P11 최종 자동 검증·Git 병합 (확정 로그)

- 작업 PR [#31](https://github.com/hobism3/meta_p2p_realestate/pull/31) head `66e301478b0e4ae72c8c0035224003031036dbaf`. `main` squash merge **`26ed25a89ce8f616f3e0c107a8a20ae7d19dcfd5`**.
- `verify-fast` **SUCCESS** — Next.js production build PASS, Node unit+DAL **340/340 PASS**, API+READ_ONLY **206/206 PASS**.
- `verify-e2e` **SUCCESS** — Playwright 데스크톱·모바일 **90 PASS / 4 SKIP / 0 FAIL**. P11 추가된 웹 페이지 테스트는 공개 가상 원본 PDF 5종 링크를 표시하되 최초 방문 시 원본을 자동 요청하지 않음을 검증.
- `public-registry-educational-corpus` **SUCCESS** — 실제 외부 PDF 7개 SHA256/규모 검사, P10 전체 페이지 범위 내 6개 파싱, 24페이지 실무 PDF는 상한 초과 중단. **당당 가상 등기부 5종 중 5/5 독립 게이트 PASS**(SHA + 페이지/구역 + 타입 최소 검출 + 공개 설명의 2억9천만원 합계). [해당 실원본 재검증 Actions #41371365593](https://github.com/hobism3/meta_p2p_realestate/actions/runs/41371365593).
- 기존 CI 실패/수정: 1800줄/50건 입력 제한을 강화하면서 줄번호 지역변수 누락으로 TS build/Probe ReferenceError 발생 → `a4caf237` 수정 후 위 검증 모두 PASS. 테스트 기준을 완화하지 않았음.
- 사용자 화면 `web/app/registry/extract/page.tsx`에 제작자가 게시한 가상 PDF 5종 직접 링크 추가; 클릭하여 외부 제공자 원본을 사용자가 내려받은 후 **로컬 PDF.js 자동 추출**으로 검토하도록 UX 연결. 초기 페이지 접근만으로 제3자 PDF 자동 fetch 없음.
- 개인 로컬 수집용 `web/scripts/cache-fictional-registry-pdfs.mjs`는 명시적 `--private-corpus` 옵션 없이는 다운로드하지 않고, 허구 교육용 5개 URL/해시/크기를 확인해 `web/.local-registry-training-docs/`(Gitignore) 파일 0600으로 보존·기존 파일 덮어쓰기 금지. 사용 조건이 허락하는 개인 개발 테스트 외 재배포 안 함.
- 사진·VLM 병렬 PR #25와 P11 PR #31의 GitHub changed-file 교집합은 최종 확인 **0개**. 사진 PR #25의 코드/상태는 이번 병합에서 변경하지 않음.
- **법률 결론/제품 출시는 미완료**: 모든 후보는 status=unknown, 원문 대조 필수. 원본 교육용 PDF 5종에서 검출된 권리타입·29,000만원 합계 일부만 공개 발행자 설명과 대조한 게이트임. 개별 줄/취소선/실제 소유권·채무잔액·임차인 선순위/실발급본 진위는 전문가 truth set 미구축.
- **Vercel production 자동배포와 Git main 병합은 별개**. P10 시점의 불일치는 [#30](https://github.com/hobism3/meta_p2p_realestate/issues/30)으로 관리 중이므로, 배포 SHA/워커를 확인하기 전까지 라이브 사이트에 P11이 반영됐다고 단정하지 않는다.

### 후속 P12 후보 (기능/품질)
1. 공식 서식에 가까운 **허가받은 교육용 PDF의 페이지별 권리 행 bounding box / 취소선 / 금액 열 truth set** 정립. P11의 공개 문서 타입 게이트는 아직 전문가의 완전한 문서별 정답이 아님.
2. 근저당 말소 여부, 여러 장에서 이어지는 같은 등기번호, 부기번호/압류·신탁·임차권 등 다양한 공개 사례 확장.
3. 스캔 이미지 페이지 OCR의 *문자 정확도*와 *권리 해석 정확도*를 분리 평가하고 로컬/서버 전송·재이용 조건을 검토.
4. Vercel 배포 #30 조사, 본인 B/임대권한 C 확인, 실제 사용자 거래·법률 자문은 별도 운영 게이트 유지.

## 2026-11-02 · P12 검증 전략 변경 (P11 후속 정정)
- 사용자 요청에 따라 **개발 단계에 사람이 PDF별 전문가 정답 라벨을 직접 작성해야 한다는 P11 후속 제안은 더 이상 선행 조건이 아니다.** 과거 제안은 개발 당시 검토안으로만 남긴다.
- P12 PR #32(main squash `bf33ee1`)에서 HUG 등 공개 기관/발행자의 명시적 **부분 사실**, 독립 번호·등기목적 셀 탐색기의 누락 비교, PDF 좌표·문자 순서 변형 검증, 외부 HTML 설명 확인을 구현했다. [검증 설계](P12_WEB_EVIDENCE_VALIDATION_20261102.md) 및 [개발 로그](P12_DEVELOPMENT_LOG_20261102.md) 참조.
- 이 체계는 **완전한 문서 정답 또는 법적 효력 판정을 대체했다고 주장하지 않는다.** 정확도/재현율의 완전한 분모가 없으므로 임의의 퍼센트로 과장하지 않고 확인 불가를 유지한다.
