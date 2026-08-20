// Gedeelde koptekst voor de Financieel Verslag-module (FV zelf + de
// sub-pagina's Bestellingen/Streepjes): een band in de merkkleur i.p.v.
// platte tekst op de paginabackground, zodat je meteen ziet dat je in
// dezelfde module zit. Bewust enkel titel + subtitel — selects/knoppen
// eronder houden hun gewone (lichte) stijl, geen "op-donker"-varianten nodig.
export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="no-print page-header">
      <div>
        <h1 className="page-header-title">{title}</h1>
        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </div>
  );
}
