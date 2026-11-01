# Legal review issue register — 2026-11-01

|ID|Priority|Status|Owner|Evidence|Closure criterion|
|---|---|---|---|---|---|
|LEG-01|P0|OPEN|Legal + product|공인중개사법 제2·9조, 대법원 2024다280898|기능·요금 모델별 중개업 해당성 서면 검토|
|LEG-02|P0|OPEN|Privacy + backend|개인정보보호법 제15·21·29·30조, RegistryImport|실문서 외부전송 정지 확인, 처리흐름·국외이전·파기 검증|
|LEG-03|P0|OPEN|Legal + frontend|전자문서법 제4조, agreement-service/room UI|법적 계약 효력과 플랫폼 내 조건 확인 구분 검증|
|LEG-04|P1|OPEN|Legal + operations|공인중개사법 제18조의2, 등록 UX|허위·무권리 게시 정책 및 실제 사업자 역할별 광고 책임|
|LEG-05|P1|OPEN|Legal + product|부동산거래신고법 제3조|거래유형별 신고·전입·확정일자 체크리스트 검수|
|LEG-06|P1|OPEN|AI safety + product|AI owner & Jiptalk role|안전 보장·법률 자문 오인 문구 제거와 회귀 테스트|

## Definition of done
각 이슈는 담당자, 수정 커밋/스크린샷·정책/계약 자료, 공식 출처, 2차 검토 날짜와 근거를 남긴 뒤에만 CLOSED. Mock CI pass만으로 해제하지 않는다.

## Work hold
실사용자 양측 거래 QA는 유저 요청에 따라 보류. 개인정보 포함 실 등기 PDF 업로드, 실제 계약 체결/자금 이동, 유료 중개 서비스도 법률 적합성 판단 전 보류.
