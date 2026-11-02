# 집톡 Visual Listing Guide — 개발 설계 및 실행 기록 (2026-11-01)

## 목표 / 범위
매물 등록자에게 사진 기반 가이드 제공. **3D, 사진 기반 집톡이 Q&A, 자동 중개, 실제 매물 사진 게시 기능은 제외**.
2026-11-01 기준 main `bd7c56f`에서 별도 브랜치 `feat/visual-listing-guide-20261101`를 시작함.
기존 P7 권리관계 분석, 집톡이 실거래방, 집주인 AI 응대 흐름 변경 금지.

## AI가 필요한 부분 vs 아닌 부분
- AI 불필요: 이미지 파일 검증, JPEG/EXIF 제거, 축소·화질 힌트, perceptual-hash 중복 후보, 불투명 사각형 수동 가림, 누락 공간 추천 룰.
- VLM 선택 사용: 거실/침실/주방/욕실 등 공간 분류, 사진에 보이는 옵션 후보, 개인정보 노출 후보.
- SAM segmentation: 후속 과제. 자유형 자동 마스킹은 품질·누락 위험 검증 후 도입. 현 단계 수동 가림이 더 예측 가능함.
- AI가 해서는 안 되는 일: 사진만 보고 실제 제공 옵션·면적·소유권·물리적 안전·법적 사실 확정, 계약/게시정보 자동 변경.

## 현재 구현된 Vertical Slice
1. 등록 Wizard '생활 정보' 단계에 사진 가이드 UI 배치.
2. 사진은 최대 6장, JPG/PNG/WebP, 각 8MiB 이하 입력, 메모리 내 1600px JPEG 변환·EXIF 제거. **DB/서버 저장 및 매물 게시 연결 없음**. 새로고침 시 사진 데이터 소멸.
3. 클라이언트에서 9x8 dHash 기반 근사 중복 사진 검토, 밝기/해상도/압축 경고.
4. 캔버스에서 사각형을 직접 선택해 불투명 덮개 적용. 마스크는 저장된 JPEG에 합성. 모델 검토가 있던 사진을 가리면 해당 결과 무효화.
5. 별도 opt-in Meta Muse Spark API: 사진별 분석 버튼/동의 체크, 서버 유저 인증·서버키·전송 용량 제한·사용량 제한, JSON allowlist 검증. 반환 값은 room, features, privacyFlags 3종뿐.
6. 옵션 후보는 사용자가 직접 눌러 기존 입력 필드로 옮김. **입주 시 제공 옵션으로 확정된다는 의미 아님**.
7. VLM 사용 불가/비활성화 시 사진 선택·수동 마스킹·기본 검사는 계속 작동.

## 보안·개인정보 경계
- 실 사진은 가림 여부와 관계없이 개인 정보가 있을 수 있음. 이용자 명시 동의 이전에는 Meta로 전송되지 않음.
- 사진을 내부 서버로 POST하면 Meta로 전달하지만 업로드 원본·VLM OCR·이름·주소·전화번호 등 자유텍스트는 서버에 저장하거나 반환하지 않음.
- Meta 호출당 사진 1장, 계정당 인스턴스 기준 6회/시간(서버리스 다중 인스턴스에서 전역 정확 한도 아님). 유료 API 자동 재시도 금지.
- 모든 사진 개인정보를 자동 검출한다는 보장 불가. 외부 제공/약관/보관·학습 정책 별도 법률·보안 검토 필요.
- 현재 서버 이미지 magic-byte 검사는 기본 JPEG signature이며 완전한 이미지 디코딩·멀웨어 검사 대신할 수 없음.
- **현재 검증은 합성 이미지 중심만 허용**. 실거주 사진 검증과 제삼자 개인 정보가 있는 자료의 외부 전송은 출시 검토 전 금지.

## 충돌 가능성
- 신규 파일: `web/lib/photo-guide.ts`, `web/components/ListingPhotoGuide.tsx`, `web/app/api/listings/photo-review/route.ts`, 테스트, 스타일, 본 문서.
- 기존 파일: `web/app/register/page.tsx`의 생활정보 UI에 독립 컴포넌트 연결 1개. `web/app/globals.css` 끝에 스타일.
- 기존 등기부 모듈/거래방/매물 POST API/DB schema는 무변경.
- 병합 전에 상대 개발 브랜치가 등록 화면을 수정했다면 UI 위치 재검토 후 리베이스 필요.

## 검증 기준 및 미해결
- Node 단위 테스트, Next build, API 인증/동의/용량 차단 테스트, Github verify-fast/e2e를 별도 기록. 실행되지 않은 것은 PASS로 적지 않음.
- Meta 실호출/과금, 개인정보 보호 성능, 실제 사용자 E2E, 영속 사진 보관, 매물 상세 이미지 렌더는 **미완료**.
- 사진 저장은 운영 스토리지 및 파일 접근제어 설계 후 별도 PR로 연결. 이번 컴포넌트의 객체 URL은 임시 로컬 값이며 공유·지속 불가.
- 다음 단계: owner/listing 접근 권한 있는 비공개 스토리지, 제출 전 사진 관리, 자동 segmentation 선택적 추가, 이미지 기반 테스트셋/비전 성능 평가.


## 2026-11-02 · 사용자 피드백 반영: 사진으로 옵션 추천 + 공간 누락 안내 + 가구 없는 모습

### 사용자 경험 결정
- 기존 'AI 공간·옵션 분석' 사진별 버튼/Meta 분석 독립 메뉴 **폐지**. 사용자는 사진 여러 장을 고른 후 '사진에서 옵션·공간 자동 정리' 한 번으로 안내를 받는다.
- 추출 결과는 공간/보이는 물건/개인정보 노출 후보. 집주인에게 **사진에 보이는 가전·가구가 실제 제공 옵션인지** 확인받고 선택한 후보만 기존 '그 밖의 옵션' 필드에 반영한다.
- 집에 없는 방을 단정하지 않고 **"욕실 사진은 아직 확인되지 않았어요. 해당 공간이 있다면 사진을 추가하면 좋아요."**처럼 조심스러운 촬영 가이드를 제공한다. 원룸 등은 거실과 침실을 별개 필수공간으로 가정하지 않는다. 일부 사진만 분석됐으면 범위 불완전 경고.
- 기존 로컬 사진품질/중복검사는 부기능, 개인정보 불투명 사각형 가리기는 유지.
- 별도 '가구 없는 모습 미리보기'는 **Meta Muse Image 단일 이미지 편집**으로 구현. 원본 vs AI 생성 결과 비교 + AI 가상 이미지 라벨 + 실제 면적/하자/벽/창문 등 사실 증거 아님 경고. 3D/가상 투어/집톡이 사진 채팅은 제외.
- 가구 시뮬레이션은 AI에게 '고정 건축구조/손상/카메라 시점은 바꾸지 말라'고 지시하지만 기하 정확성을 보증할 수 없다. 가림 처리 영역을 생성 결과에 브라우저에서 다시 덮어 개인 정보 복원 위험을 완화한다. 완전 자동 가림/SAM은 검증 전 미구현.

### 기술 구현 / 인터페이스
- 기존 PR #25 브랜치 내 사진 시스템에만 수정을 적용. P8 [VISUAL_PARALLEL_INTERFACE_20261101](registry-cases/VISUAL_PARALLEL_INTERFACE_20261101.md) 준수. P8 권리/등기법칙, registry-check, 권리 goldens, 거래방은 전혀 변경하지 않는다.
- \`web/lib/photo-guide.ts\`: 옵션 후보 허용목록, '사진에서 찾지 못한 공간' 결정적 메시지.
- \`web/components/ListingPhotoGuide.tsx\`: 일괄 VLM 분석, 옵션 후보 체크 후 반영, 공간 누락 안내, 수동 가림, 전송별 동의, 원본/가구 제거 이미지 비교. 모든 픽셀과 생성 결과는 브라우저 임시 메모리에만 존재.
- \`web/lib/photo-image.ts\`: JPEG data URL, 제한형 JSON, 안전한 WEBP 출력 검증, 이미지 편집 고정 프롬프트.
- \`web/app/api/listings/photo-review/route.ts\`: 사진 1장당 VLM + 서버인증 + 요청 크기/전송 동의/enum 검증(기존 경로 유지). 클라이언트가 순차 호출. \`PHOTO_AI_ENABLED=true\`와 \`MODEL_API_KEY\` 필요, 계정/인스턴스 기준 시간당 6장.
- \`web/app/api/listings/photo-empty-view/route.ts\`: 서버 전용 Muse Image \`POST /v1/images/edits\` JSON \`images:[{image_url: dataURL}]\`, \`muse-image-1.0\`, WEBP base64. \`PHOTO_EMPTY_VIEW_ENABLED=true\`와 \`MODEL_API_KEY\` 필요. 사진별 유료 버튼, 별도 동의, 계정/인스턴스 기준 2회/시간. 웹·이미지 검색 및 shell tool을 명시적으로 비활성화. 출력 최대 6MB 제한, 외부 URL/SVG를 브라우저에 노출하지 않음. 유료 분석 자동 재시도 없음.
- 파일 영구보관/공개 사진 업로드, DB/매물 상세 갤러리 연결, 외부 실사 이미지 자동 판독, 실제 모델 호출은 **이번 범위 아님**. 현재 사진이 등록 시 저장된다고 착각하지 않도록 UX 설명을 유지.
- 동의 없는 외부 전송 금지. 모델 입력에 주소, 소유자 신상, 등기 문서 원문 전달 금지. 이 동의는 등기부 PDF 외부 전송 동의가 아니다.

### 검증 / 게이트
- \`web/tests/photo-guide.test.mjs\`: 공간누락·원룸/복합 공간·옵션 허용목록.
- \`web/tests/photo-image.test.mjs\`: 입력 JPEG/출력 WEBP / 외부 URL 거부 / 용량 / 마스킹 프롬프트.
- \`web/tests/photo-empty-view-api.test.mjs\`: 독립 Mock Meta HTTP Server, 인증/동의/용량/정상 이미지 편집/호출한도; 실과금 0.
- \`web/e2e/visual-listing-guide.spec.ts\`: Playwright 가상 이미지+route mock, 옵션선택/욕실 누락/원본/AI 비교 및 별도 동의. CI로 실행 전에는 PASS 미확정.
- \`verify-fast\`에 신규 Node + API 스위트 등록, E2E는 전체 자동 실행.
- 현재 단계 표기는 **IMPLEMENTED**. NEXT/빌드/Playwright/GitHub CI 종료코드 및 마지막 SHA 확인 후 DONE 승격.
- 실제 Muse Spark 이미지 인식 정확도와 Muse Image 구조 보존/개인정보 악화 여부는 **별도 벤치마크 필요**. CI Mock/E2E 성공을 실제 VLM 정확도 증명으로 간주하지 않음.

### 2026-11-02 · 자동 게이트 최종 성공 및 의미
- 검증 코드 head: `188b1049a15579e2931ac1c500015e8245da4eb3`.
- [GitHub verify-fast](https://github.com/hobism3/meta_p2p_realestate/actions/runs/41366165456) **completed SUCCESS**. Next production build PASS, Node unit+DAL **302 PASS / 0 FAIL**, 격리 API+READ_ONLY 회귀 **214 PASS / 0 FAIL**.
- [GitHub verify-e2e](https://github.com/hobism3/meta_p2p_realestate/actions/runs/41366165575) **completed SUCCESS**. Playwright 전체 PC/모바일 **86 PASS / 4 SKIP / 0 FAIL**. 신규 시각 사진 2개 시나리오는 각각 desktop/mobile에서 실행되고 PASS; 사진 가림, VLM JSON Mock 후보, 욕실 누락, 옵션 수동 반영, 등록 단계 후퇴 시 복원, 원본/AI 가상 이미지 비교 포함.
- 사진 모델 실호출/생성모델 정확도·스토리지·제삼자 실사진·법률·보안 검증은 미수행. **자동화 기능 검증 DONE, 실제 모델 성능·공개 서비스 검증 BLOCKED/후속**으로 구분.
- 사진 스토리지·매물 상세 갤러리 후속 설계는 [Issue #28](https://github.com/hobism3/meta_p2p_realestate/issues/28)로 분리.
- 본 기록 추가 자체는 docs-only 커밋이므로 이 마지막 코드 SHA에서 확인한 PASS를 뒤따르는 문서 SHA의 재검증으로 오인하지 않음. 브랜치 및 PR #25는 main 미병합 상태.
