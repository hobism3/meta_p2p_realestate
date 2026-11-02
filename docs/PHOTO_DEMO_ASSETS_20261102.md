# 매물 등록 고해상도 예시 사진 (2026-11-02)

## 용도와 경계
- 매물 등록 단계의 **옵션·공간 자동 분류 시연**을 위한 사진 3장. 사용자가 사진 카드를 선택하여 브라우저에 업로드한 것처럼 미리보기한다.
- 사진은 **서로 다른 공개 Unsplash 스톡 사진**이며, 집톡에 등록된 실제 주택·동일한 매물의 사진이 아니다. 실제 임대/매매 조건과 연결하지 않는다.
- 이미지 선택만으로 서버에 업로드하거나 Meta API를 호출하지 않는다. 모든 외부 분석은 사용자 명시적 동의와 분석 버튼이 필요하다.
- 파일 이름은 P13의 기존 게시 제한(`synthetic-demo-` prefix)에 맞춰 브라우저에서 생성한다. 스톡 사진이 실제 매물의 공개 갤러리에 게시되는 것을 막는다.
- 기존 2KB 시연용 그래픽과 구분하기 위해 별도 `photo-example-*.jpg` 3종을 추가한다. 기존 그래픽은 화면의 시연 매물용으로 유지한다.

## 파일 및 원출처
아래 파일은 `martin-minghetti/norhaven-lodge`의 Unsplash 사진을 원본 바이너리로 재사용한다. 해당 프로젝트 [CREDITS.md](https://github.com/martin-minghetti/norhaven-lodge/blob/main/public/images/CREDITS.md)는 모든 이미지를 [Unsplash License](https://unsplash.com/license) 출처로 명시한다. 사진작가의 개별 이름은 별도 확인하지 않았다.

| 저장 파일 | 분류 카드 | 원본 공개 경로 | 크기 | Git blob SHA |
| --- | --- | --- | ---: | --- |
| `web/public/images/photo-example-living.jpg` | 거실(의자·벽난로) | `public/images/cabins/loft-bosque/loft.jpg` | 635,984 B | `745733097884af03e340f8fd8b08344e911f8cbe` |
| `web/public/images/photo-example-kitchen.jpg` | 주방(가전) | `public/images/life/modern-kitchen-forest.jpg` | 521,439 B | `743d5f75ebb57a5bae86ce208da85c5be5f8c0ac` |
| `web/public/images/photo-example-lounge.jpg` | 라운지(소파·TV) | `public/images/cabins/cabana-cerro/bedroom-master.jpg` | 778,501 B | `7852639ffe96195a5df92c2e3b79d5c69583693f` |

원본 파일을 집톡 자체 GitHub 저장소에 로컬로 제공하므로 Preview 외부 Unsplash CDN 가용성에 종속되지 않는다. 이미지 처리 시 브라우저 Canvas에서 JPEG로 다시 인코딩하여 앱 내부 분석용 입력으로 사용한다.

## QA 계획
- GitHub에서 파일 자체가 올바른 Git SHA의 JPEG Blob로 저장됐는지 확인.
- Playwright desktop+mobile: 예시 3종 선택 → 화면 미리보기 및 파일명 확인 → AI 전송 동의 이전 POST 호출 0건.
- Meta 실제 호출/공간 분류 정확도/사람·개인정보 탐지 정확도는 **이번 이미지 제공 작업과 별개**, 검증하지 않았으면 PASS로 기록하지 않는다.
