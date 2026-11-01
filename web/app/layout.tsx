import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import SiteNav from "../components/SiteNav";

export const metadata: Metadata = {
  title: "DirectHome | AI로 거래 조건을 더 명확하게",
  description: "AI 직거래 지원 시연 서비스. 기본 합성 매물과 사용자 등록 매물은 구분되며 소유자·권리관계 확인 및 법적 계약 기능은 제공하지 않습니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="topbar">
          <a className="brand" href="/">DirectHome</a>
          <span className="tag">AI 거래 시연 · 소유자 미검증</span>
          <SiteNav />
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          시연용 서비스입니다. 기본 예시 매물은 합성 데이터이며 사용자 등록 매물의 게시권한·소유권·권리관계는 검증하지 않았습니다. 플랫폼 내 조건 확인은 계약 효력 판단이 아닙니다.
        </footer>
      </body>
    </html>
  );
}
