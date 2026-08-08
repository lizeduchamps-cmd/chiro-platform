import Providers from "./providers";

export const metadata = {
  title: "Chiro Hoepertingen — Financiën",
  description: "Financiënplatform voor Chiro Hoepertingen",
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F5F3EE", margin: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
