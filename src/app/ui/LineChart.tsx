"use client";

export function LineChart(props: {
  points: Array<{ x: number; y: number }>;
  height?: number;
  yLabel?: string;
  xLabel?: string;
  xTicks?: number[];
  xTickFormatter?: (x: number) => string;
}) {
  const height = props.height ?? 180;
  const width = 520;
  const pad = 28;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const xs = props.points.map((p) => p.x);
  const ys = props.points.map((p) => p.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 24);
  const maxY = Math.max(1e-6, ...ys, 1);

  const mapX = (x: number) => pad + ((x - minX) / Math.max(1e-6, maxX - minX)) * innerW;
  const mapY = (y: number) => pad + innerH - (y / maxY) * innerH;

  const d = props.points
    .sort((a, b) => a.x - b.x)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${mapX(p.x).toFixed(2)} ${mapY(p.y).toFixed(2)}`)
    .join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <rect x="0" y="0" width={width} height={height} fill="rgba(255,255,255,0.02)" rx="12" />
      {/* axes */}
      <line x1={pad} y1={pad + innerH} x2={pad + innerW} y2={pad + innerH} stroke="rgba(255,255,255,0.2)" />
      <line x1={pad} y1={pad} x2={pad} y2={pad + innerH} stroke="rgba(255,255,255,0.2)" />

      {/* x ticks */}
      {(props.xTicks ?? [0, 6, 12, 18, 24]).map((t) => {
        const x = mapX(t);
        const label = props.xTickFormatter ? props.xTickFormatter(t) : String(t);
        return (
          <g key={`xt-${t}`}>
            <line x1={x} y1={pad + innerH} x2={x} y2={pad + innerH + 5} stroke="rgba(255,255,255,0.25)" />
            <text x={x} y={pad + innerH + 18} fill="rgba(255,255,255,0.65)" fontSize="11" textAnchor="middle">
              {label}
            </text>
          </g>
        );
      })}

      {/* y ticks */}
      {(() => {
        const ticks = [0, maxY / 2, maxY].map((v) => Math.round(v));
        return ticks.map((v) => {
          const y = mapY(v);
          return (
            <g key={`yt-${v}`}>
              <line x1={pad - 5} y1={y} x2={pad} y2={y} stroke="rgba(255,255,255,0.25)" />
              <line x1={pad} y1={y} x2={pad + innerW} y2={y} stroke="rgba(255,255,255,0.08)" />
              <text x={pad - 8} y={y + 4} fill="rgba(255,255,255,0.65)" fontSize="11" textAnchor="end">
                {v}
              </text>
            </g>
          );
        });
      })()}
      <path d={d} fill="none" stroke="rgba(59,130,246,0.95)" strokeWidth="2.5" />

      {props.points.map((p, i) => (
        <circle key={i} cx={mapX(p.x)} cy={mapY(p.y)} r="2.2" fill="rgba(59,130,246,0.95)" />
      ))}

      <text x={pad} y={16} fill="rgba(255,255,255,0.65)" fontSize="11">
        {props.yLabel ?? ""}
      </text>
      <text x={width - pad} y={16} fill="rgba(255,255,255,0.65)" fontSize="11" textAnchor="end">
        max {maxY.toFixed(0)}
      </text>
      <text x={pad + innerW} y={pad + innerH + 18} fill="rgba(255,255,255,0.55)" fontSize="11" textAnchor="end">
        {props.xLabel ?? "x"}
      </text>
    </svg>
  );
}
