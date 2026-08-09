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
      <style>{"@media print { .no-print { display: none !important; } }"}</style>
      <div className="no-print" style={{ width: 220, flexShrink: 0, background: "#1E2A22", color: "#F5F3EE", padding: 16, display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 24, padding: "0 8px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#D9A62E" }}>Chiro Hoepertingen</div>
          <div style={{ fontSize: 11, color: "#9AA69C" }}>Financiënplatform</div>
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
                  color: actief ? "white" : "#C6CFC7",
                  background: actief ? "#2F4A3C" : "transparent",
                }}
              >
                {l.label}
              </a>
            );
          })}
        </nav>
        <div style={{ paddingTop: 16, borderTop: "1px solid #33443A", fontSize: 11, color: "#9AA69C", padding: "16px 8px 0" }}>
          Ingelogd als
          <div style={{ color: "#F5F3EE", fontWeight: 600 }}>{session?.user?.name}</div>
          <button
            onClick={() => signOut()}
            style={{ marginTop: 10, background: "none", border: "1px solid #33443A", color: "#C6CFC7", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
          >
            Uitloggen
          </button>
        </div>
      </div>
      <div style={{ flex: 1, background: "#F5F3EE", minHeight: "100vh" }}>{children}</div>
    </div>
  );
}
