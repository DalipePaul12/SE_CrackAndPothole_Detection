import "./SkeletonRow.css";

/**
 * SkeletonTableRow
 * Renders a shimmer row that matches the proportional column layout of the real table.
 *
 * Props:
 *   cols      – array of flex weights for each non-thumb column, e.g. [3, 2, 1.5, 1.5, 1.5]
 *   hasThumb  – if true, prepends a square thumbnail placeholder (MySubmissions table)
 *   height    – row min-height in px (default 48)
 */
export function SkeletonTableRow({ cols = [3, 2, 1, 1, 1], hasThumb = false, height = 48 }) {
  return (
    <div className="sk-table-row" style={{ minHeight: height }}>
      {hasThumb && <div className="sk-cell-thumb" aria-hidden="true" />}
      {cols.map((w, i) => (
        <div key={i} className="sk-cell" style={{ flex: w }} aria-hidden="true" />
      ))}
    </div>
  );
}

/**
 * SkeletonCard
 * Renders a shimmer card matching the shape of the mobile report card.
 *
 * Props:
 *   lines – number of text-line placeholders in the body (default 3)
 */
export function SkeletonCard({ lines = 3 }) {
  const lineWidths = ["65%", "80%", "45%"];

  return (
    <div className="sk-card" aria-hidden="true">
      <div className="sk-thumb" />
      <div className="sk-card-body">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="sk-line"
            style={{ width: lineWidths[i % lineWidths.length] }}
          />
        ))}
      </div>
    </div>
  );
}
