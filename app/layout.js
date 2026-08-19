import Providers from "./providers";
import "./globals.css";

export const metadata = {
  title: "Chiro Hoepertingen — Financiën",
  description: "Financiënplatform voor Chiro Hoepertingen",
};

// viewport-fit=cover is vereist opdat env(safe-area-inset-bottom) in
// globals.css (onderste tabbalk) effectief iets anders dan 0 teruggeeft —
// zonder dit blijft de balk te dicht bij de rand op telefoons met een
// home-indicator, ongeacht hoeveel padding de CSS zelf toevoegt.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
