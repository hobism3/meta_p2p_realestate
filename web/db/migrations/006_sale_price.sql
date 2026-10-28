-- 006 매매가 필드. 보증금·월세와 별도 컬럼으로 모델링한다.
-- 기존 전월세 데이터는 그대로 보존된다(기본값 0).
ALTER TABLE custom_listings ADD COLUMN sale_price INTEGER NOT NULL DEFAULT 0;
