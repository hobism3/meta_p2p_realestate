# 지도 사용 조건 기록

- 사용: Leaflet 1.9.4 + OpenStreetMap 표준 타일(`tile.openstreetmap.org`).
- 키: 불필요. API 키를 코드에 저장하지 않음.
- 조건(OpenStreetMap 타일 사용 정책):
  - 과도한 대량 호출 금지. MVP 시연 수준에서 사용.
  - 출처 표기 필수. 앱 지도에 `© OpenStreetMap contributors` 표시함.
  - 타일 URL을 하드코딩하지 않고 정책 변경 시 교체 가능하게 `MapView` 한 곳에 둠.
- 미확정: 정식 서비스 시 자체 타일 또는 상용 지도 SDK 전환 검토.
