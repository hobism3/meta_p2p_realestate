"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatPrice, type Listing } from "../lib/listings";

// Seed listings have synthetic addresses and APPROXIMATE coordinates.
// A marker is a demo placement, never verified property geolocation.
export default function MapView({
  listings,
  selectedId,
  onSelect,
}: {
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [ready, setReady] = useState(false);
  const selected = useMemo(() => listings.find((l) => l.id === selectedId), [listings, selectedId]);

  useEffect(() => {
    let disposed = false;
    let localMap: any;
    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !node.current) return;
      localMap = L.map(node.current, { scrollWheelZoom: false, zoomControl: false }).setView([37.4835, 126.9285], 15);
      L.control.zoom({ position: "bottomright" }).addTo(localMap);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(localMap);
      mapRef.current = { map: localMap, L };
      layerRef.current = L.layerGroup().addTo(localMap);
      setReady(true);
      window.requestAnimationFrame(() => localMap.invalidateSize());
    })();
    return () => {
      disposed = true;
      if (localMap) localMap.remove();
      mapRef.current = null;
      layerRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current) return;
    const { L, map } = mapRef.current;
    layerRef.current.clearLayers();
    markersRef.current.clear();
    const valid = listings.filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng) && Math.abs(l.lat) <= 90 && Math.abs(l.lng) <= 180);
    for (const l of valid) {
      const marker = L.marker([l.lat, l.lng]).addTo(layerRef.current);
      marker.bindTooltip(formatPrice(l), { direction: "top", offset: [0, -9] });
      marker.on("click", () => onSelect(l.id));
      markersRef.current.set(l.id, marker);
    }
    if (valid.length) {
      map.fitBounds(L.latLngBounds(valid.map((l) => [l.lat, l.lng] as [number, number])), {
        padding: [36, 36], maxZoom: 16, animate: false,
      });
    }
    window.requestAnimationFrame(() => map.invalidateSize());
  }, [ready, listings, onSelect]);

  useEffect(() => {
    if (!ready || !mapRef.current || !selectedId) return;
    const marker = markersRef.current.get(selectedId);
    if (!marker) return;
    marker.openTooltip();
    mapRef.current.map.panTo(marker.getLatLng(), { animate: true });
  }, [selectedId, ready]);

  return (
    <div className="map-shell">
      <div className="map-caption">
        <span className="map-caption-dot" aria-hidden="true" />
        <span>가상 좌표로 표시된 시연 매물입니다. 실제 주소·건물 위치가 아닙니다.</span>
      </div>
      <div ref={node} className="mapbox" role="application" aria-label="가상 매물 위치 지도" />
      {selected ? (
        <a href={`/listings/${selected.id}`} className="map-selection">
          <span className="listing-type">{selected.tradeType}</span>
          <strong>{selected.title}</strong>
          <span>{formatPrice(selected)}</span>
          <span className="map-selection-cta">매물 상세 보기 →</span>
        </a>
      ) : <p className="map-tip">지도 마커 또는 옆의 매물을 선택해 상세 정보를 확인하세요.</p>}
    </div>
  );
}
