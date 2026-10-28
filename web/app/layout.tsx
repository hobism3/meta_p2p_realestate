import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "DirectHome - 소형 월세 직거래",
  description: "집주인과 임차인의 직접 거래. 가상 매물 MVP.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="topbar">
          <a className="brand" href="/">DirectHome</a>
          <span className="tag">가상 매물 MVP</span>
          <nav>
            <a href="/">탐색</a>
            <a href="/register">매물 등록</a>
            <a href="/login">로그인</a>
          </nav>
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          합성 데이터로 동작하는 시연용 화면입니다. 실매물·소유자 인증이 아닙니다.
        </footer>
      </body>
    </html>
  );
}
