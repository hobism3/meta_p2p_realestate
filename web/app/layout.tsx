import type { Metadata } from "next";
import "./globals.css";
import "./locale.css";
import "./jiptok-digest.css";
import "leaflet/dist/leaflet.css";
import SiteNav from "../components/SiteNav";
import LocalizedShellCopy from "../components/LocalizedShellCopy";

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
          <LocalizedShellCopy kind="tag" />
          <SiteNav />
        </header>
        <main className="container">{children}</main>
        <LocalizedShellCopy kind="footer" />
      </body>
    </html>
  );
}
