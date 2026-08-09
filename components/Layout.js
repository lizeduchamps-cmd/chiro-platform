"use client";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Layout({ session, children }) {
  const pathname = usePathname();
  const recht = session?.user?.platformRecht;
  const [manueelOpen, setManueelOpen] = useState(new Set());
  const [mobielOpen, setMobielOpen] = useState(false);

  // Zijbalk dichtklappen bij het navigeren op mobiel, anders blijft het paneel
  // openstaan boven de nieuwe pagina.
  useEffect(() => setMobielOpen(false), [pathname]);

  const groups = [
    {
      href: "/",
      label: "Jaaroverzicht",
      children: [
        { href: "/kasboek", label: "Kasboek" },
        { href: "/kasboek/upload", label: "CSV Upload" },
      ],
    },
    {
      href: "/fv",
      label: "Financieel Verslag",
      children: [
        { href: "/streepjes", label: "Streepjes" },
        { href: "/bestellingen", label: "Bestellingen" },
      ],
    },
    {
      href: "/evenementen",
      label: "Evenementen",
      children: [],
    },
    {
      href: "/kampbudgetten",
      label: "Kampbudgetten",
      children: [
        { href: "/wisselgeld", label: "Wisselgeld" },
        { href: "/kalender", label: "Kalender" },
      ],
    },
  ];
  if (recht === "admin") {
    groups.push({ href: "/beheer/gebruikers", label: "Gebruikers & rollen", children: [] });
  }

  const linkStyle = (actief) => ({
    display: "block",
    padding: "8px 10px",
    borderRadius: 8,
    fontSize: 13,
    textDecoration: "none",
    color: actief ? "#1b315c" : "#D6DEEA",
    background: actief ? "#F9F9FA" : "transparent",
    fontWeight: actief ? 600 : 400,
  });

  const toggleManueel = (href) => {
    setManueelOpen((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div className="no-print mobile-topbar">
        <button onClick={() => setMobielOpen(true)} aria-label="Menu openen" style={{ background: "none", border: "none", fontSize: 20, color: "#1b315c" }}>☰</button>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Chiro Hoepertingen</span>
      </div>

      {mobielOpen && <div className="no-print sidebar-overlay" onClick={() => setMobielOpen(false)} />}

      <div className={`no-print app-sidebar${mobielOpen ? " open" : ""}`} style={{ width: 220, flexShrink: 0, background: "#1b315c", color: "#F9F9FA", padding: 16, display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 24, padding: "0 8px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>Chiro Hoepertingen</div>
            <div style={{ fontSize: 11, color: "#A9B7CE" }}>Financiënplatform</div>
          </div>
          <button className="sidebar-close-btn" onClick={() => setMobielOpen(false)} aria-label="Menu sluiten" style={{ background: "none", border: "none", color: "#D6DEEA", fontSize: 18 }}>✕</button>
        </div>
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          {groups.map((g) => {
            const kindActief = g.children.some((c) => pathname === c.href);
            // startsWith zodat dynamische subpagina's (bv. /evenementen/<id>, niet
            // apart in het menu opgelijst) hun groep toch actief tonen.
            const actief = pathname === g.href || pathname.startsWith(g.href + "/");
            // Uitgeklapt = we zitten op die pagina, óf iemand heeft het handmatig
            // opengeklikt — los van elkaar per sectie, dus andere secties
            // klappen niet automatisch dicht.
            const uitgeklapt = actief || kindActief || manueelOpen.has(g.href);
            return (
              <div key={g.href}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <Link href={g.href} style={{ ...linkStyle(actief), flex: 1 }}>
                    {g.label}
                  </Link>
                  {g.children.length > 0 && (
                    <button
                      onClick={() => toggleManueel(g.href)}
                      aria-label={uitgeklapt ? "Inklappen" : "Uitklappen"}
                      style={{ background: "none", border: "none", padding: "8px 10px", color: "#D6DEEA", cursor: "pointer" }}
                    >
                      <span style={{ display: "inline-block", fontSize: 10, opacity: 0.7, transform: uitgeklapt ? "rotate(90deg)" : "none", transition: "transform 0.12s" }}>▸</span>
                    </button>
                  )}
                </div>
                {uitgeklapt && g.children.length > 0 && (
                  <div style={{ marginLeft: 12, borderLeft: "1px solid rgba(255,255,255,0.15)", paddingLeft: 8, marginTop: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                    {g.children.map((c) => (
                      <Link key={c.href} href={c.href} style={linkStyle(pathname === c.href)}>
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
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
      <div style={{ flex: 1, minHeight: "100vh", minWidth: 0 }}>{children}</div>
    </div>
  );
}
