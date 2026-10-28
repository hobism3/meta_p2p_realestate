"use client";

import { useEffect, useRef, useState } from "react";
import type { Listing } from "../lib/listings";

// OpenStreetMap 타일 사용 조건:
// - 상업적 과다 호출 금지(Tile Usage Policy), attribution 표기 필수.
// - 키 없이 사용 가능하므로 MVP 개발 환경으로 채택. 별도 SDK 키 없음.
export default function MapView({
  listings,
  selectedId,
  onSelect,
}: {
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let map: any = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || ref.current.dataset.ready) return;
      ref.current.dataset.ready = "1";
      map = L.map(ref.current).setView([37.4835, 126.9285], 15);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      (ref.current as any)._leaflet = { L, map };
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
      if (map) map.remove();
      if (ref.current) delete ref.current.dataset.ready;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const holder = ref.current as any;
    if (!holder || !holder._leaflet) return;
    const { L, map } = holder._leaflet;
    if (holder._layer) holder._layer.remove();
    const layer = L.layerGroup().addTo(map);
    holder._layer = layer;
    listings.forEach((l) => {
      const m = L.marker([l.lat, l.lng]).addTo(layer);
      m.bindTooltip(`${l.tradeType} ${l.deposit}/${l.rent}`);
      m.on("click", () => onSelect(l.id));
      if (l.id === selectedId) m.openTooltip();
    });
    if (listings.length > 0) {
      map.fitBounds(L.latLngBounds(listings.map((l) => [l.lat, l.lng] as [number, number])), { padding: [30, 30] });
    }
  }, [listings, selectedId, onSelect, ready]);

  return <div ref={ref} className="mapbox" role="application" aria-label="매물 지도" />;
}
