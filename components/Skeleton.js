// Simpele shimmer-placeholders die de vorm van de echte content alvast
// aangeven tijdens het laden, i.p.v. enkel "Laden…"-tekst.

export function SkeletonLine({ width = "100%", height = 14, style }) {
  return <span className="skeleton" style={{ width, height, ...style }} />;
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card">
      <SkeletonLine width="40%" height={16} style={{ marginBottom: 12 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={`${85 - i * 12}%`} style={{ marginBottom: 8 }} />
      ))}
    </div>
  );
}

export function SkeletonStatRow({ count = 3 }) {
  return (
    <div className={`grid-${count}`} style={{ marginBottom: 24 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stat">
          <SkeletonLine width="60%" height={12} style={{ marginBottom: 10 }} />
          <SkeletonLine width="45%" height={22} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 4, cols = 4 }) {
  return (
    <div className="table-wrap">
      <table>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <SkeletonLine width={c === 0 ? "70%" : "50%"} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
