"use client";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

export default function Layout({ session, children }) {
  const pathname = usePathname();
  const recht = session?.user?.platformRecht;

  const links = [
    { href: "/", label: "Jaaroverzicht" },
    { href: "/kasboek", label: "Kasboek" },
    { href: "/kasboek/upload", label: "↳ CSV Upload", indent: true },
    { href: "/streepjes", label: "Streepjes" },
    { href: "/fv", label: "Financieel Verslag" },
  ];
  if (recht === "admin") {
    links.push({ href: "/beheer/gebruikers", label: "Gebruikers & rollen" });
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div className="no-print" style={{ width: 220, flexShrink: 0, background: "#1b315c", color: "#F9F9FA", padding: 16, display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 24, padding: "0 8px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>Chiro Hoepertingen</div>
          <div style={{ fontSize: 11, color: "#A9B7CE" }}>Financiënplatform</div>
        </div>
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          {links.map((l) => {
            const actief = pathname === l.href;
            return (
              <a
                key={l.href}
                href={l.href}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  fontSize: 13,
                  textDecoration: "none",
                  color: actief ? "#1b315c" : "#D6DEEA",
                  background: actief ? "#F9F9FA" : "transparent",
                  fontWeight: actief ? 600 : 400,
                }}
              >
                {l.label}
              </a>
            );
          })}
        </nav>
        <div style={{ paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.15)", fontSize: 11, color: "#A9B7CE", padding: "16px 8px 0" }}>
          Ingelogd als
          <div style={{ color: "#F9F9FA", fontWeight: 600 }}>{session?.user?.name}</div>
          <button
            onClick={() => signOut()}
            style={{ marginTop: 10, background: "none", border: "1px solid rgba(255,255,255,0.25)", color: "#D6DEEA", borderRadius: 6, padding: "4px 8px", fontSize: 11 }}
          >
            Uitloggen
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: "100vh" }}>{children}</div>
    </div>
  );
}
