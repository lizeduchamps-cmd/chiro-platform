"use client";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";

function isActief(href, pathname) {
  return !!href && (pathname === href || pathname.startsWith(href + "/"));
}

function groepIsActief(g, pathname) {
  if (isActief(g.href, pathname)) return true;
  return (g.children || []).some((c) => isActief(c.href, pathname));
}

// Eén eenvoudige set lijniconen voor de 7 hoofditems — gebruikt in zowel de
// zijbalk (desktop) als de onderste tabbalk (mobiel), zodat beide navigaties
// visueel bij elkaar horen.
// Klein rood bolletje met aantal — bv. hoeveel kasboektransacties nog niet
// helemaal zeker gecategoriseerd zijn, zichtbaar zonder de pagina te openen.
function NavBolletje({ aantal }) {
  return (
    <span
      style={{
        position: "absolute", top: -4, right: -5, background: "var(--danger)", color: "white",
        fontSize: 9, fontWeight: 800, borderRadius: 999, minWidth: 14, height: 14, lineHeight: "14px",
        textAlign: "center", padding: "0 3px",
      }}
    >
      {aantal > 9 ? "9+" : aantal}
    </span>
  );
}

function NavIcon({ naam, color }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (naam) {
    case "dashboard":
      return <svg {...common}><path d="M4 11l8-7 8 7" /><path d="M6 10v9h12v-9" /></svg>;
    case "kasboek":
      return <svg {...common}><path d="M5.5 4.5a2 2 0 012-2h10a1 1 0 011 1v17l-2.5-1.5-2.5 1.5-2.5-1.5L8.5 20l-2.5-1.5v-14z" /><path d="M9 8.5h6M9 12h6" /></svg>;
    case "fv":
      return <svg {...common}><rect x="6" y="4" width="12" height="16" rx="3" /><path d="M9 9h6M9 12.5h6M9 16h3.5" /></svg>;
    case "evenementen":
      return <svg {...common}><path d="M12 21s7-7.2 7-12a7 7 0 10-14 0c0 4.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.4" /></svg>;
    case "wisselgeld":
      return <svg {...common}><circle cx="9" cy="10" r="6" /><path d="M13.5 15.5A6 6 0 109 4" /></svg>;
    case "kalender":
      return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M8 3v4M16 3v4" /></svg>;
    case "gebruikers":
      return <svg {...common}><circle cx="9" cy="8.5" r="3" /><path d="M4 19c0-3 2.3-5 5-5s5 2 5 5" /><circle cx="17" cy="9.5" r="2.3" /><path d="M15.3 19c.2-2 1.6-3.5 3.3-3.9" /></svg>;
    default:
      return null;
  }
}

function NavNode({ node, depth, pathname, manueelOpen, toggleManueel, linkStyle, meldingen }) {
  const heeftKinderen = node.children?.length > 0;
  const actief = isActief(node.href, pathname);
  const kindActief = heeftKinderen && (node.children || []).some((c) => isActief(c.href, pathname));
  const uitgeklapt = actief || kindActief || manueelOpen.has(node.key);
  const melding = meldingen?.[node.key];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Link href={node.href} className="nav-link" style={{ ...linkStyle(actief, depth), flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          {depth === 0 && (
            <span style={{ position: "relative", display: "flex" }}>
              <NavIcon naam={node.key} color={actief ? "var(--accent)" : "#B9C2D1"} />
              {melding > 0 && <NavBolletje aantal={melding} />}
            </span>
          )}
          {node.label}
        </Link>
        {heeftKinderen && (
          <button
            className="btn-plain"
            onClick={() => toggleManueel(node.key)}
            aria-label={uitgeklapt ? "Inklappen" : "Uitklappen"}
            style={{ padding: "8px 10px", color: "#B9C2D1", cursor: "pointer" }}
          >
            <span style={{ display: "inline-block", fontSize: 10, opacity: 0.7, transform: uitgeklapt ? "rotate(90deg)" : "none", transition: "transform 0.12s" }}>▸</span>
          </button>
        )}
      </div>
      {uitgeklapt && heeftKinderen && (
        <div style={{ marginLeft: 12, borderLeft: "1px solid rgba(255,255,255,0.15)", paddingLeft: 8, marginTop: 2, display: "flex", flexDirection: "column", gap: 2 }}>
          {node.children.map((c) => (
            <NavNode key={c.key} node={c} depth={depth + 1} pathname={pathname} manueelOpen={manueelOpen} toggleManueel={toggleManueel} linkStyle={linkStyle} meldingen={meldingen} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout({ session, children }) {
  const pathname = usePathname();
  const [manueelOpen, setManueelOpen] = useState(new Set());
  const [evenementen, setEvenementen] = useState([]);
  const [nietZekerCount, setNietZekerCount] = useState(0);

  // Evenementen komen uit de database (huidig werkjaar) i.p.v. vaste namen in de
  // code, zodat nieuwe/verwijderde evenementen meteen in het menu kloppen.
  // Meteen ook tellen hoeveel kasboektransacties nog niet helemaal zeker
  // gecategoriseerd zijn, voor het bolletje op het Kasboek-tabblad.
  useEffect(() => {
    fetch("/api/werkjaren").then((r) => r.json()).then((d) => {
      const werkjaarId = d.werkjaren?.[0]?.id;
      if (!werkjaarId) return;
      fetch(`/api/evenementen?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((ed) => setEvenementen(ed.evenementen || []));
      fetch(`/api/transacties?werkjaarId=${werkjaarId}`).then((r) => r.json()).then((td) => {
        const aantal = (td.transacties || []).filter((t) => t.categorie_zekerheid === "waarschijnlijk" || t.categorie_zekerheid === "onzeker").length;
        setNietZekerCount(aantal);
      });
    });
  }, []);

  // 7 vaste hoofditems, voor iedereen in dezelfde volgorde (ook Gebruikers &
  // rollen — niet-admins zien het tabblad, de pagina zelf toont voor hen enkel
  // een melding dat ze geen toegang hebben). Kampbudgetten/Kampkosten/
  // Documenten staan voorlopig nog als aparte kinderen onder Evenementen &
  // uitstappen — dat is hun toekomstige plek zodra Kamp een echt evenement
  // wordt (latere fase), maar zo blijven ze intussen gewoon bereikbaar.
  const groups = [
    { key: "dashboard", href: "/", kort: "Overzicht", label: "Overzicht", children: [] },
    {
      key: "kasboek",
      href: "/kasboek",
      kort: "Kasboek",
      label: "Kasboek",
      children: [{ key: "csv", href: "/kasboek/upload", label: "CSV Upload" }],
    },
    { key: "fv", href: "/fv", kort: "FV", label: "Financieel verslag", children: [] },
    {
      key: "evenementen",
      href: "/evenementen",
      kort: "Uitstappen",
      label: "Evenementen & uitstappen",
      children: [
        ...evenementen.map((e) => ({ key: `evenement-${e.id}`, href: `/evenementen/${e.id}`, label: e.naam })),
        { key: "kampbudgetten", href: "/kampbudgetten", label: "Kampbudgetten" },
        { key: "kampkosten", href: "/kampkosten", label: "Kampkosten" },
        { key: "documenten", href: "/documenten", label: "Documenten" },
      ],
    },
    { key: "wisselgeld", href: "/wisselgeld", kort: "Wisselgeld", label: "Wisselgeld", children: [] },
    { key: "kalender", href: "/kalender", kort: "Kalender", label: "Kalender", children: [] },
    { key: "gebruikers", href: "/beheer/gebruikers", kort: "Gebruikers", label: "Gebruikers & rollen", children: [] },
  ];

  const actieveGroep = groups.find((g) => groepIsActief(g, pathname));

  const linkStyle = (actief, depth = 0) => ({
    display: "block",
    padding: "8px 10px",
    borderRadius: 8,
    fontSize: depth > 1 ? 12 : 13,
    textDecoration: "none",
    color: actief ? "var(--primary)" : "#D6DEEA",
    background: actief ? "#F4F1E8" : undefined,
    fontWeight: actief ? 700 : 400,
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
      <div className="no-print app-sidebar" style={{ width: 220, flexShrink: 0, background: "var(--primary)", color: "#F4F1E8", padding: 16, flexDirection: "column" }}>
        <div style={{ marginBottom: 24, padding: "0 8px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Chiro Hoepertingen</div>
          <div style={{ fontSize: 11, color: "#9FAAC2" }}>Financiënplatform</div>
        </div>
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {groups.map((g) => (
            <NavNode key={g.key} node={g} depth={0} pathname={pathname} manueelOpen={manueelOpen} toggleManueel={toggleManueel} linkStyle={linkStyle} meldingen={{ kasboek: nietZekerCount }} />
          ))}
        </nav>
        <div style={{ paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.15)", fontSize: 11, color: "#9FAAC2" }}>
          Ingelogd als
          <div style={{ color: "white", fontWeight: 700 }}>{session?.user?.name}</div>
          <button
            className="sidebar-signout-btn"
            onClick={() => signOut()}
            style={{ marginTop: 10, border: "1px solid rgba(255,255,255,0.25)", color: "#E7E2D4", borderRadius: 6, padding: "4px 8px", fontSize: 11 }}
          >
            Uitloggen
          </button>
        </div>
      </div>

      <div className="app-content" style={{ flex: 1, minHeight: "100vh", minWidth: 0, display: "flex", flexDirection: "column" }}>
        {actieveGroep?.children?.length > 0 && (
          <div className="no-print mobile-subnav">
            {actieveGroep.children.map((c) => (
              <Link key={c.key} href={c.href} className={`mobile-subnav-pill${isActief(c.href, pathname) ? " active" : ""}`}>
                {c.label}
              </Link>
            ))}
          </div>
        )}

        <div className="app-content-inner" style={{ flex: 1 }}>{children}</div>

        <div className="no-print mobile-tabbar">
          {groups.map((g) => {
            const actief = groepIsActief(g, pathname);
            return (
              <Link key={g.key} href={g.href} className={`mobile-tab${actief ? " active" : ""}`}>
                <span style={{ position: "relative", display: "flex" }}>
                  <NavIcon naam={g.key} color={actief ? "var(--accent)" : "var(--text-subtle)"} />
                  {g.key === "kasboek" && nietZekerCount > 0 && <NavBolletje aantal={nietZekerCount} />}
                </span>
                <span>{g.kort}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
