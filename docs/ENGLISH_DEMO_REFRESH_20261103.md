# English UI correction and fresh demo capture

Latest submission deliverable: the **three-feature kinetic edit** described at the end
of this document. It includes newly synthesized product-first narration and fixes
the inherited Jiptok caption timing. Earlier sections retain the review history.

**Public release:** https://github.com/hobism3/meta_p2p_realestate/releases/tag/directhome-kinetic-demo-20261103

The first dynamic edit reused the already released product recording. Its
editorial captions were English, but several product panels still contained
Korean controls, explanations and generated status text. This revision fixes
the app's English mode, then records the corrected product again.

## What changed in the product

- Registry-to-listing import: instructions, consent, extraction controls,
  streamed progress, service errors, field labels and safety cautions.
- Registration wizard: missing hints, review controls, transaction labels,
  amenity chips, preview states and fee/price formatting. Canonical prices remain
  in ten-thousand KRW units; English presentation expands monetary outputs into
  full KRW. Inputs explicitly show the existing units.
- Photo studio: upload count/button, optional preview heading, masking actions,
  selected-amenity actions, progress, privacy labels and completion messages.
  “Built-in A/C” replaces the overly specific “Central A/C”.
- Local registry extraction and review: candidate types, sections, ranks,
  amounts, review status, transfer notices, evidence caveats, findings, additional
  checks and copied review notes. Only presentation changes; parsing, review
  gates and transfer payloads remain unchanged.
- Generated listing-title labels use “Building”, “Unit/Floor” and “Needs review”
  in English mode. Original building names and numeric identifiers are preserved.

Unknown service messages are not silently suppressed or guessed. User-authored
text, original filenames and source-document quotations are not machine-translated.

## Video scope and source language

The listing/photo chapter and local rights-review chapter are freshly captured
from the modified app. The existing Korean Jiptok recording and its separate
English translation panel are retained at 79–124s, as allowed by the user.
The released source's timing discrepancy between the UI and its English panel
near 114s is consequently inherited; see the prior dynamic edit's QA record.

The fictional Korean PDF, quoted evidence, property name and address remain in
their original language. English labels explicitly identify original-language
source text; known fictional field values also have English glosses in the
import preview. Changing UI language does not rewrite documentary evidence.

The 175-second narration, motion style and original synthesized score are kept.
The new recording is cut into semantic shots aligned with narration; it is not
presented as an unedited real-time performance measurement. Full raw recording,
screenshots, shot times and source hashes stay available locally.

## Reproduce

From the repository root, with the app's dependencies installed and a recent
successful `npm run build` in `web/`:

```powershell
python -m pip install -r web/scripts/requirements-video.txt
cd web
npx playwright install chromium
node scripts/record-english-refresh.mjs --fetch-source
cd ..
python web/scripts/assemble-english-refresh.py
python web/scripts/render-dynamic-demo.py --output-dir web/demo-artifacts/english-refresh/final --ui-source web/demo-artifacts/english-refresh/english-source.mp4
python web/scripts/validate-dynamic-demo.py --output-dir web/demo-artifacts/english-refresh/final
```

Capture runs on `127.0.0.1:3159` with its own process-specific SQLite database,
fictional identity and Mock provider. `DATABASE_URL` is explicitly cleared.
The browser blocks external requests and replays checksum-verified prior Meta
photo responses. There are no fresh model or TTS calls, real users or production
database writes. The synthetic PDF hash remains unchanged.

`--fetch-source` retrieves missing inputs from the previous public release and
checks all five input hashes. The recorder explicitly uses `en-US` for native
browser UI, waits for English hydration, and checks all displayed text nodes
at each shot. Only tagged original source text and PDF textareas are excluded.
Any remaining Korean UI is reported and blocks assembly.

The public releases and the first local dynamic edit are retained. New outputs:

- `web/demo-artifacts/english-refresh/final/DirectHome_Dynamic_Editorial_20261103.mp4`
- `web/demo-artifacts/english-refresh/final/DirectHome_Dynamic_VoiceOnly_20261103.mp4`
- `web/demo-artifacts/english-refresh/capture-manifest.json`
- `web/demo-artifacts/english-refresh/alignment-manifest.json`
- `web/demo-artifacts/english-refresh/final/validation.json`

## Validation

- Final application build: exit 0.
- Unit/API/DAL tests: **719 passed, 0 failed**, exit 0; isolated databases and
  Mock provider. New tests cover currency conversion, reversible amenity input,
  generated-title translation, warning coverage, source preservation and JSX
  translation whitespace.
- Playwright `english-core.spec.ts` and `showcase-language.spec.ts`: **8 passed**
  across desktop and mobile, exit 0. Includes locale persistence, registration,
  photo studio, account entry and Jiptok summary.
- Fresh live capture: **18 shots**, saved listing, **3 extracted rights
  candidates**, successful reviewed transfer, **0 untranslated UI findings**
  outside explicitly marked original-language source material; exit 0.
- Independent read-only QA corrected a generated Korean title suffix, source
  note spacing and a fragment-spacing issue, then reviewed the final corrected
  screenshots. No remaining blocker was found in those captures.
- Both new MP4s: full decode with `-xerror`, exit 0; **175.000 seconds,
  5,250 frames, 1920×1080, 30 fps, H.264/AAC, faststart**.
- Music master: **−18.8 LUFS / −4.0 dBFS true peak**, 16,141,150 bytes.
  Minimum five-second narration correlation: **0.99646**. The voice-only file
  retains the source AAC bit-for-bit, 14,403,406 bytes.
- Nineteen frames were decoded from the final file; the new English registration
  and rights-result frames were visually checked again after encoding.

The media validator performs the checks described in
[the dynamic edit guide](DYNAMIC_DEMO_20261103.md) and additionally verifies the
hash of the freshly assembled UI footage.

## 내레이션·화면 문구 전체 재검토 (2026-11-03)

사용자 피드백: 음성은 “교육용 자료를 올립니다”가 아니라 “등기부등본을 업로드합니다”처럼 사용 과정을 설명하고, 교육용 자료라는 사실은 별도 화면 표기로 알린다.

**검토 결론:** 현재 영상에 해당 문제가 남아 있다. 영어 UI 재촬영 때 음성은 교체하지 않았으므로, 기존 대본의 7초·34초·125초 제작 과정 설명도 유지되었다. 아래는 수정 대본과 화면 수정 지시이며, 새 음성 합성·MP4 출력은 아직 실행하지 않았다. 기존 영상 및 기존 음성 생성 스크립트는 보존했다.

### 검토 근거와 범위

- 대상: `web/demo-artifacts/english-refresh/final/DirectHome_Dynamic_Editorial_20261103.mp4` (175초, SHA-256 `07c3bbb1d31b0ba917c60494ded987542744008e9634cd542fb9dd8dd9e4b895`).
- 전체 15개 음성 구간: `web/scripts/generate-natural-demo-voice.py`. 최종 `edit-manifest.json`의 기존 Kokoro 음성 유지 기록과 이전 AAC 동일성 검증으로 연결했다. 이번 검토는 새로운 청취 전사 결과가 아니다.
- 현재 MP4에서 추출한 19개 프레임의 contact sheet 및 화면 합성·녹화 스크립트를 대조했다. 모든 프레임을 이번에 새로 검사한 것은 아니다.
- `vision_actual.json`의 감지 결과는 `living_room`, `에어컨`이다. 모델이 스탠드형이라는 세부 종류까지 판정했다고 설명하지 않는다.
- 독립 읽기 전용 QA에서도 제작 설명의 음성 중복, 새 생성처럼 들리는 문장, 검토와 법적 검증의 혼동을 확인했다.

### 전체 15구간 판정

| 기존 음성 시작 | 판정·수정 이유 | 수정 방향 |
|---|---|---|
| 00:00 | 제작 설명 문제 없음. 도입이 길고 추상적 | 매물 정보·대화·다음 단계 소개 |
| 00:07 | **직접 해당:** “educational registry PDF”, “This example uses fictional data” | 등기부등본 업로드 → 수정 가능한 초안 → 원문 대조. 교육용·Mock 안내는 화면 |
| 00:24 | 문제 없음. 직접적인 사용 흐름 | 입력값 검토·수정 후 보증금·월세 입력 |
| 00:34 | **직접 해당:** “previously captured, genuine … response” | 사진 추가 → 방과 눈에 보이는 옵션 제안. 녹화 결과 표기는 화면 |
| 00:46 | “floor standing”은 저장된 모델 결과보다 구체적 | “air conditioner”로 수정. 소유자의 선택 과정 유지 |
| 01:00 | “creates”가 방금 생성하는 것처럼 들림. 긴 부정문으로 기능 설명 중단 | 원본과 가구 제거 가상 뷰 비교. 음성에 “virtual view”, 화면에 AI simulation 유지 |
| 01:15 | 매물 저장 장면의 “agreed automatically”는 거래 합의와 혼동 | 검토 후 저장이라는 행동만 설명 |
| 01:20 | 제작 설명은 없으나 “does not bargain”으로 기능 소개 마무리 | 제안·확인·미결 질문을 정리하는 집톡이 역할 설명 |
| 01:36 | 핵심 흐름에 맞음 | 같은 버전의 보증금·월세를 각자 검토 |
| 01:47 | 핵심 흐름에 맞음 | 방문자 확인, 소유자 응답 대기. 다음 상태와 겹치지 않게 짧게 |
| 01:56 | “without signing”보다 실제 화면 동작 설명이 자연스러움 | 동일 버전 양측 확인 → 카드 갱신 → 다음 단계 표시. 계약 체결과 다름은 화면에 유지 |
| 02:05 | **직접 해당:** “educational”, “fictional example” 반복 | 등기부등본 열기 → 브라우저 내부 텍스트 읽기 → 항목 표시. 로컬 처리는 이 점검 단계에 한정 |
| 02:21 | “unverified until …”는 사용자 검토 후 법적 검증이 된다는 오해 가능 | 원문 대조 → 날짜·채권최고액 확인 → 체크리스트에 가져오기. 별도 확인 필요성 유지 |
| 02:37 | “registered liens” 단정 및 “never … legally safe”로 끝나는 문장 개선 | 문서상 항목·선순위 임차인·세금·서명 권한 등 후속 확인 질문 소개 |
| 02:50 | 제작 설명 문제 없음 | 정보·공동 결정·사용자 주도권으로 마무리 |

### 수정 영어 대본

기계 판독용 원본: [narration-product-review.en.json](../web/scripts/video-assets/narration-product-review.en.json). 시간은 기존 편집 기준 목표이며, 새 음성의 실제 길이·발화 속도는 아직 검증하지 않았다.

| 시작 | 수정 대본 |
|---|---|
| 00:00 | Meet DirectHome. Bring property details, conversations, and next steps into one clear journey. |
| 00:07 | The owner starts by uploading a property registry document. DirectHome brings the address, unit details, and floor area into an editable draft. The owner checks the details against the document before adding them to the listing. |
| 00:24 | The details appear in the listing form, ready to review and edit. Next, the owner adds the deposit and monthly rent. |
| 00:34 | Next, the owner adds a living room photo. Muse Spark identifies the room and visible amenities, turning details in the image into suggestions for the listing. |
| 00:46 | Here, Muse Spark identifies an air conditioner. DirectHome suggests it as an amenity, and the owner checks the photo before selecting it. The owner decides which suggestions become part of the listing. |
| 01:00 | Next, compare the original photo with a furniture-free preview from Muse Image. This virtual view makes it easier to imagine the space with a different layout. The original stays alongside it for comparison. |
| 01:15 | Review the listing, then save it when you are ready. |
| 01:20 | Now, meet Jiptok, the neutral conversation companion. It brings proposals, confirmations, and open questions into view as the owner and visitor talk. Both people can follow the same discussion and see what still needs a decision. |
| 01:36 | The proposed deposit and monthly rent appear together on a versioned card. Both participants can review the same terms before responding. |
| 01:47 | The visitor has confirmed. The owner's response is still pending on the same proposal. |
| 01:56 | Once both confirm the same version, the card updates. Jiptok then highlights the next steps for the participants to review. |
| 02:05 | Next, open the property registry document for a closer review. DirectHome reads its text locally in the browser, bringing recorded entries, dates, and amounts into view. The document stays on the device during this check. |
| 02:21 | Compare each candidate entry with the original document. Check the date and maximum secured amount, then select the items to carry into the checklist. These notes help organize the follow-up checks that still need to be made. |
| 02:37 | The checklist brings the remaining questions together: recorded entries, prior tenants, unpaid taxes, and authority to sign. It helps the participants see what to check next before moving forward. |
| 02:50 | DirectHome. Clearer information. Shared decisions. People in control. |

### 현재 화면에서 함께 고칠 부분

현재 영상에는 이미 앱 배지와 `ABOUT THIS SCENE`에 출처 안내가 있다. 이를 읽을 수 있는 별도 표기로 유지하고, 기능 설명 영역의 중복만 정리한다. 교육용 자료라는 말을 제품 기능명처럼 쓰지 않는다.

| 현재 화면 위치 | 현재 문구 | 제안 문구/처리 |
|---|---|---|
| 34초 오른쪽 기능 설명 | Recorded Meta Muse Spark response. | Room type and amenity suggestions. |
| 60초 오른쪽 기능 설명 | Recorded Muse Image furniture-removal edit. | Compare the original and a furniture-free view. |
| 64–73초 비교 화면 상단 | A PREVIOUSLY CAPTURED, GENUINE MODEL OUTPUT | 기능 설명은 ORIGINAL / FURNITURE-FREE PREVIEW. Recorded Meta output은 별도 출처 배지로 이동 |
| 124초 오른쪽 기능 설명 | The same fictional PDF, processed in-browser. | Read the document in your browser. |
| 141초 오른쪽 기능 설명 | Candidates stay unverified until reviewed. | Compare with the source. Select items for review. |
| 157초 오른쪽 기능 설명 | Liens, prior tenants, taxes and signing authority. | Recorded entries and checks still to complete. |

별도 출처 표기 권장: 등록 `Educational sample PDF · Mock extraction`, 사진 `Recorded Meta output`, 집톡이 `Synthetic participants · Mock AI`, 권리 점검 `Educational sample PDF · Browser-local extraction`. 사진 비교의 `AI simulation`과 양측 확인 화면의 `In-app confirmation · Not a signed contract`는 기능의 성격을 알리는 표기로 유지한다. 현재 등록 기능은 승인된 합성 PDF만 허용하므로 화면에 sample/Mock 안내가 필요하다. 음성에서 일반 문서 업로드 흐름을 설명한다고 이 구현 제한이 사라진 것은 아니다.

### 다음 출력 시 동기화 확인

- 기존 집톡이 화면은 113.9초에 양측 확인이 보이지만 편집 레일은 114초에 전환된다. 원본에 들어간 영어 패널도 함께 맞춰야 한다. 새 음성에서 “pending”이 확인 완료 화면까지 이어지지 않도록 재검증한다.
- 저장은 76.5–79초, 권리 점검 전환은 124초, 마무리는 169초다. 새 발화 길이에 따라 음성 큐 또는 편집 길이를 조정한다. 초안의 타임코드만 보고 동기화가 완료됐다고 판단하지 않는다.
- 이 검토에서 새 TTS 호출·재녹화·렌더는 하지 않았다. 현재 제공된 MP4에는 위 수정이 아직 들어가지 않았다.

## 세 가지 피처를 먼저 보여주는 키네틱 편집 (2026-11-03)

위 재검토 이후 사용자가 새 제작을 요청했고, 결과부터 보여주는 도입 대신 **세 가지 주요 피처를 짧고 강하게 먼저 보여주는 구성**으로 지정했다. 이전 검토 대본의 도입은 아래 구성으로 교체했다. 본문 대본은 사용자 행동 중심 수정안을 사용한다.

### 시나리오와 편집

| 구간 | 화면·설명 |
|---|---|
| 0–2초 | **LIST SMARTER.** 수정 가능한 등기 초안 화면. 매물 등록 기능 소개 |
| 2–4초 | **AGREE CLEARLY.** 집톡이 제안 카드 화면. 확인 완료 결과 대신 조건 검토 기능 소개 |
| 4–5.8초 | **CHECK THE RECORD.** 등기 텍스트·후보 항목 화면. 점검 기능 소개 |
| 5.8–7초 | 세 피처와 DirectHome을 한 화면에 모아 연결 |
| 7–79초 | 문서 업로드 → 정보·조건 검토 → 사진 옵션 선택 → 가상 뷰 비교 → 저장 |
| 79–124초 | 큰 타이포그래피 전환 → 제안 → 방문자 확인 → 소유자 확인 → 다음 단계 |
| 124–169초 | 큰 타이포그래피 전환 → 브라우저 내부 문서 읽기 → 원문 대조 → 후속 점검 목록 |
| 169–175초 | 세 가지 피처를 다시 연결하고 사용자 결정권으로 마무리 |

- 차콜·크림·라임 배경의 연속 컷, 단어별 슬라이드, 120 BPM 자체 합성 음악 및 타이포그래피 전환 효과음. 오프닝 음성도 세 문구와 브랜드를 별도 큐로 배치한다.
- 본편은 입력값·제안·후보 항목을 읽을 수 있도록 실제 제품 화면 전체를 유지한다. 움직이는 요소는 주로 화면 바깥 제목과 챕터 전환이다. 새로운 UI나 기능을 그려 넣지 않는다.
- 교육용 PDF, Mock 추출/집톡이, 녹화된 Meta 결과는 화면의 별도 출처 표기로 유지한다. 음성은 “등기부등본 업로드”, “사진에서 옵션 선택”, “원문과 항목 대조”를 설명한다.
- 사진의 가구 제거 결과는 가상 뷰, 양측 확인은 앱 내부 조건 확인으로 구분한다. 사용자 검토를 법적 검증 완료로 표현하지 않는다.

### 집톡이의 기존 자막 시차 수정

원본을 프레임 단위로 확인하니 방문자 확인은 100.4667초, 양측 확인은 112.9667초였고, 별도 영어 패널은 103초·114초에 바뀌었다. 하단 양측 확인 캡션은 더 이른 112.7667초에 등장했다.

전체 실제 프레임을 짧게 유지하는 편집으로 상태와 캡션을 함께 맞춘다. 앱의 상태 문자열이나 화면 일부를 다시 그리지 않는다.

- 원본 프레임 3013(양측 대기)을 출력 프레임 3014–3089에서 유지하고 103초에 방문자 확인 장면으로 전환.
- 원본 프레임 3382(방문자 확인·소유자 대기)를 출력 프레임 3383–3419에서 유지하고 114초에 양측 확인 장면으로 전환.
- 수정된 음성의 대기 설명은 113초 이전에 끝나도록 별도 길이 제한을 둔다.

### 재현과 파일

- 렌더: `web/scripts/render-kinetic-demo.py`
- 음성 생성: `web/scripts/generate-product-demo-voice.py`
- 실제 사용 대본: `web/scripts/video-assets/narration-product-review.en.json`
- 검증: `web/scripts/validate-kinetic-demo.py`
- 출력 폴더: `web/demo-artifacts/kinetic-refresh/` (Git 제외). 기존 dynamic/english-refresh 출력은 보존.

음성은 별도 Python 가상환경의 `kokoro-onnx==0.6.1` 및 Kokoro `af_heart`로 로컬 합성한다. 모델·프리셋은 공개 릴리스에서 내려받고 SHA-256으로 확인한다. 등록·권리 점검 영상은 이전에 영어 UI를 수정해 촬영한 실제 앱 녹화이며, 이번에는 새 Meta 요청을 하지 않는다.

저장소 루트에서:

먼저 기존 소스 자산과 릴리스에 보존한 정확한 영어 UI 중간본을 준비한다. 새로 녹화한 파일은 타임스탬프·인코딩에 따라 해시가 달라지므로, 현재 렌더러의 고정 해시로 재현할 때에는 아래 릴리스 파일을 사용한다.

```powershell
python web/scripts/render-dynamic-demo.py --fetch-source --preview-only
New-Item -ItemType Directory -Force web/demo-artifacts/english-refresh | Out-Null
Invoke-WebRequest https://github.com/hobism3/meta_p2p_realestate/releases/download/directhome-kinetic-demo-20261103/english-source.mp4 -OutFile web/demo-artifacts/english-refresh/english-source.mp4
Get-FileHash web/demo-artifacts/english-refresh/english-source.mp4 -Algorithm SHA256
```

영어 UI SHA-256은 `9cb7b382da07ec494744b817a038d11aad8d70d589caefedca2ef3cf87143e60`이며 렌더러가 다시 검사한다. 새 음성을 합성하려면:

```powershell
python -m venv web/demo-artifacts/kinetic-refresh/voice/.venv
& web/demo-artifacts/kinetic-refresh/voice/.venv/Scripts/python.exe -m pip install kokoro-onnx==0.6.1 soundfile imageio-ffmpeg
& web/demo-artifacts/kinetic-refresh/voice/.venv/Scripts/python.exe web/scripts/generate-product-demo-voice.py --fetch-models --synthesize
python web/scripts/render-kinetic-demo.py
python web/scripts/validate-kinetic-demo.py
```

음성을 다시 합성하지 않고 동일한 영상만 렌더하려면 릴리스의 `narration.m4a`를 `web/demo-artifacts/kinetic-refresh/voice/narration.m4a`에 저장한다. SHA-256은 `1be4930bdf4da4f678b7d1191ba22da7667aa36fd10f27b277ffa8bba82e0099`이다. 이 경로는 `render-kinetic-demo.py`의 렌더·믹스 재현용이며, 전체 음성 검증기는 로컬 합성 단계가 만든 per-cue WAV 및 `voice-cues.json`도 필요하다. 공개 `validation-summary.json`은 이전 완료된 검증의 공유 기록이다.

화면과 음성을 병렬로 제작할 때는 `--picture-only` 렌더 후 `--audio-only`로 결합할 수 있다. 이 경로는 기존 화면 파일과 렌더러의 해시가 일치하는지 확인한다. `--preview-only`는 스토리보드만 출력한다.

### 최종 출력·검증 — DONE

출력 폴더 `web/demo-artifacts/kinetic-refresh/`:

| 파일 | 용도 | 길이 | 크기 |
|---|---|---|---|
| `DirectHome_Kinetic_Editorial_20261103.mp4` | 새 음성 + 음악, 최종본 | 175초 | 14,714,103 bytes |
| `DirectHome_Kinetic_VoiceOnly_20261103.mp4` | 새 음성만 | 175초 | 12,449,669 bytes |
| `DirectHome_Kinetic_Opening_7s.mp4` | 오프닝 빠른 확인 | 7초 | 560,091 bytes |
| `DirectHome_Kinetic_Poster.jpg` | 포스터 | — | — |

- 전체 두 MP4: 전체 디코드 `-xerror` exit 0, 1920×1080, 30fps, 5,250프레임, H.264/AAC, faststart 확인.
- 음악 최종본 −19.0 LUFS / −5.0 dBFS true peak. 음성 전용 −19.0 LUFS / −2.0 dBFS true peak. 5초 구간별 새 음성 상관계수 최저 0.99829. 음성 전용 AAC는 새 합성 원본과 동일.
- 18개 발화 큐 모두 Kokoro native speed 1.06에서 맞음. 절단·겹침 없음. 브랜드 5.82–6.7883초, 대기 설명 107–111.9465초, 마지막 음성 종료 174.4595초.
- 원래 제품 영상과 최종 영상의 13개 UI 영역 표본을 대조. RGB 평균 절대 오차 최대 1.601/255로 인코딩 오차 범위 내. 모든 작은 글자의 자동 의미 검증을 뜻하지는 않는다.
- 최종 인코딩 파일에서 31개 프레임을 추출. 독립 읽기 전용 QA가 오프닝·본문·마무리의 잘림/가독성, 102.9/103.1초 및 113.9/114.1초의 UI·번역 패널·편집 상태 일치를 확인. 차단 문제 없음.
- 오프닝 별도 MP4도 전체 디코드 exit 0, 7.000초·210프레임·1080p·30fps 확인.
- Python 스크립트 컴파일 exit 0, 기존 Node 단위/API/DAL 테스트 719/719 통과, `git diff --check` exit 0. 이번 작업은 영상 도구·대본·문서이며 앱 구현에는 추가 변경 없음.
- 검토 범위: 실제 인코딩 프레임, 전체 디코드, 음성 타이밍·레벨·파형 측정. 사람처럼 전체 재생을 듣고 발음을 평가한 검사는 수행하지 않았다.

검증 근거: `validation.json`, `opening-validation.json`, `edit-manifest.json`, `voice/voice-cues.json`, `encoded-contact-sheet.jpg`, `render.log`, `mix.log`, `validation.log`, `tests.log`.

최종본 SHA-256: `1ee8eb89b2604f9542f35a6a3a56724ddf1c4eb138d8f600ce59a1e60f677c56`.

제작 중 수정: 첫 브랜드 음성이 5.92초 시작 슬롯을 넘겨 5.82초로 옮겼고, 음성을 자르지 않고 native 1.06으로 해결했다. 이전 실패 기록은 `voice/timing-review-required.json`에 `resolved: true`로 보존하고 성공은 `voice/assemble.log`에 기록했다. FFmpeg 9에서 제거된 `-vsync` 옵션은 `-fps_mode passthrough`로 변경 후 미리보기가 통과했다. 초기 검토에서 발견한 하단 캡션 조기 등장도 원본 프레임 3382 유지로 해결했다.
