// Reusable inline-SVG sparkline. Pure SVG, no external dependencies.
// Renders a polyline scaled across the provided values with a small
// pad so the line never touches the edges of the SVG box. Optional
// faint fill polygon under the line, and a small dot on the final point.

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
  strokeWidth?: number;
}

export default function Sparkline({
  values,
  width = 80,
  height = 24,
  stroke = 'currentColor',
  fill = 'none',
  className,
  strokeWidth = 1.5,
}: SparklineProps) {
  if (!values || values.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden="true"
      />
    );
  }

  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + h - ((v - min) / span) * h;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');

  const last = points[points.length - 1];
  const first = points[0];
  const baseY = (height - pad).toFixed(2);
  const areaPath = `${linePath} L${last[0].toFixed(2)} ${baseY} L${first[0].toFixed(2)} ${baseY} Z`;

  const showFill = fill && fill !== 'none';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-hidden="true"
    >
      {showFill && <path d={areaPath} fill={fill} opacity={0.15} />}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={Math.max(1.5, strokeWidth)} fill={stroke} />
    </svg>
  );
}
