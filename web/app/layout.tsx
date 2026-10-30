import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import SiteNav from "../components/SiteNav";

export const metadata: Metadata = {
  title: "DirectHome | AI로 거래 조건을 더 명확하게",
  description: "매물 탐색부터 AI 대화, 집톡이의 조건 정리와 양측 동의까지. 합성 데이터로 제공되는 부동산 직거래 시연 서비스.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="topbar">
          <a className="brand" href="/">DirectHome</a>
          <span className="tag">AI 거래 시연 · 합성 매물</span>
          <SiteNav />
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          합성 데이터로 동작하는 시연용 화면입니다. 실매물·소유자 인증이 아닙니다.
        </footer>
      </body>
    </html>
  );
}
