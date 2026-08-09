import Providers from "./providers";
import "./globals.css";

export const metadata = {
  title: "Chiro Hoepertingen — Financiën",
  description: "Financiënplatform voor Chiro Hoepertingen",
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
