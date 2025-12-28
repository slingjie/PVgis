"use client";

type Datum = Record<string, unknown>;

export function BarChart(props: {
  data: Datum[];
  xKey: string;
  yKey: string;
  yLabel?: string;
  height?: number;
}) {
  const height = props.height ?? 180;
  const width = 520;
  const pad = 28;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const ys = props.data.map((d) => (typeof d[props.yKey] === "number" ? (d[props.yKey] as number) : 0));
  const maxY = Math.max(1e-6, ...ys);
  const barW = innerW / Math.max(1, props.data.length);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <rect x="0" y="0" width={width} height={height} fill="rgba(255,255,255,0.02)" rx="12" />
      {/* axes */}
      <line x1={pad} y1={pad + innerH} x2={pad + innerW} y2={pad + innerH} stroke="rgba(255,255,255,0.2)" />
      <line x1={pad} y1={pad} x2={pad} y2={pad + innerH} stroke="rgba(255,255,255,0.2)" />

      {/* bars */}
      {props.data.map((d, i) => {
        const yv = typeof d[props.yKey] === "number" ? (d[props.yKey] as number) : 0;
        const h = (yv / maxY) * innerH;
        const x = pad + i * barW + 6;
        const y = pad + innerH - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={Math.max(4, barW - 12)} height={h} fill="rgba(124,58,237,0.85)" rx="6" />
            <text x={x + (barW - 12) / 2} y={pad + innerH + 16} fill="rgba(255,255,255,0.65)" fontSize="11" textAnchor="middle">
              {String(d[props.xKey])}
            </text>
          </g>
        );
      })}

      <text x={pad} y={16} fill="rgba(255,255,255,0.65)" fontSize="11">
        {props.yLabel ?? ""}
      </text>
      <text x={width - pad} y={16} fill="rgba(255,255,255,0.65)" fontSize="11" textAnchor="end">
        max {maxY.toFixed(2)}
      </text>
    </svg>
  );
}

