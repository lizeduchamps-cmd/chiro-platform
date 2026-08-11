"use client";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";

// Bepaalt of een pad bij een nav-item hoort — enkel het deel vóór een
// eventuele '?' vergelijken, want links naar vaste evenementen (bv.
// '/evenementen/ga?naam=Lazarus') herleiden na het klikken altijd naar een
// '/evenementen/<id>'-URL zonder querystring.
function padVan(href) {
  return href ? href.split("?")[0] : null;
}

function heeftActiefKind(node, pathname) {
  return (node.children || []).some((c) => {
    const pad = padVan(c.href);
    const actief = pad && (pathname === pad || pathname.startsWith(pad + "/"));
    return actief || heeftActiefKind(c, pathname);
  });
}

function NavNode({ node, depth, pathname, manueelOpen, toggleManueel, linkStyle }) {
  const heeftKinderen = node.children?.length > 0;
  const pad = padVan(node.href);
  const actief = !!pad && (pathname === pad || pathname.startsWith(pad + "/"));
  const kindActief = heeftKinderen && heeftActiefKind(node, pathname);
  const uitgeklapt = actief || kindActief || manueelOpen.has(node.key);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center" }}>
        {node.href ? (
          <Link href={node.href} style={{ ...linkStyle(actief, depth), flex: 1 }}>
            {node.label}
          </Link>
        ) : (
          <span
            onClick={() => toggleManueel(node.key)}
            style={{ ...linkStyle(false, depth), flex: 1, cursor: "pointer", opacity: 0.85 }}
          >
            {node.label}
          </span>
        )}
        {heeftKinderen && (
          <button
            onClick={() => toggleManueel(node.key)}
            aria-label={uitgeklapt ? "Inklappen" : "Uitklappen"}
            style={{ background: "none", border: "none", padding: "8px 10px", color: "#D6DEEA", cursor: "pointer" }}
          >
            <span style={{ display: "inline-block", fontSize: 10, opacity: 0.7, transform: uitgeklapt ? "rotate(90deg)" : "none", transition: "transform 0.12s" }}>▸</span>
          </button>
        )}
      </div>
      {uitgeklapt && heeftKinderen && (
        <div style={{ marginLeft: 12, borderLeft: "1px solid rgba(255,255,255,0.15)", paddingLeft: 8, marginTop: 2, display: "flex", flexDirection: "column", gap: 2 }}>
          {node.children.map((c) => (
            <NavNode key={c.key} node={c} depth={depth + 1} pathname={pathname} manueelOpen={manueelOpen} toggleManueel={toggleManueel} linkStyle={linkStyle} />
          ))}
        </div>
      )}
    </div>
  );
}

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
      key: "dashboard",
      href: "/",
      label: "Financieel dashboard",
      children: [
        { key: "kasboek", href: "/kasboek", label: "Kasboek" },
        { key: "csv", href: "/kasboek/upload", label: "CSV Upload" },
      ],
    },
    {
      key: "fv",
      href: "/fv",
      label: "Financieel Verslag",
      children: [
        { key: "streepjes", href: "/streepjes", label: "Streepjes" },
        { key: "bestellingen", href: "/bestellingen", label: "Bestellingen" },
      ],
    },
    {
      key: "evenementen",
      href: "/evenementen",
      label: "Evenementen & uitstappen",
      children: [
        { key: "lazarus", href: "/evenementen/ga?naam=Lazarus", label: "Lazarus" },
        { key: "vlaams-weekend", href: "/evenementen/ga?naam=Vlaams%20Weekend", label: "Vlaams Weekend" },
        { key: "taartenslag", href: "/evenementen/ga?naam=Taartenslag", label: "Taartenslag" },
        {
          key: "leiding-weekend-activiteit",
          href: null,
          label: "Leidingsweekend & -activiteit",
          children: [
            { key: "leidingsweekend", href: "/evenementen/ga?naam=Leidingsweekend", label: "Leidingsweekend" },
            { key: "leidingsactiviteit", href: "/evenementen/ga?naam=Leidingsactiviteit", label: "Leidingsactiviteit" },
          ],
        },
        {
          key: "leden-weekend-activiteit",
          href: null,
          label: "Ledenweekend & -activiteit",
          children: [
            { key: "ledenweekend", href: "/evenementen/ga?naam=Ledenweekend", label: "Ledenweekend" },
            { key: "ledenactiviteit", href: "/evenementen/ga?naam=Ledenactiviteit", label: "Ledenactiviteit" },
          ],
        },
        {
          key: "kamp",
          href: "/kamp",
          label: "Kamp",
          children: [
            { key: "kampbudgetten", href: "/kampbudgetten", label: "Kampbudgetten" },
            { key: "kampkosten", href: "/kampkosten", label: "Kampkosten" },
          ],
        },
      ],
    },
    { key: "documenten", href: "/documenten", label: "Documenten", children: [] },
    { key: "wisselgeld", href: "/wisselgeld", label: "Wisselgeld", children: [] },
    { key: "kalender", href: "/kalender", label: "Kalender", children: [] },
  ];
  if (recht === "admin") {
    groups.push({ key: "gebruikers", href: "/beheer/gebruikers", label: "Gebruikers & rollen", children: [] });
  }

  const linkStyle = (actief, depth = 0) => ({
    display: "block",
    padding: "8px 10px",
    borderRadius: 8,
    fontSize: depth > 1 ? 12 : 13,
    textDecoration: "none",
    color: actief ? "#1b315c" : "#D6DEEA",
    background: actief ? "#F9F9FA" : "transparent",
    fontWeight: actief ? 600 : 400,
  });

  const toggleManueel = (key) => {
    setManueelOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {groups.map((g) => (
            <NavNode key={g.key} node={g} depth={0} pathname={pathname} manueelOpen={manueelOpen} toggleManueel={toggleManueel} linkStyle={linkStyle} />
          ))}
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
