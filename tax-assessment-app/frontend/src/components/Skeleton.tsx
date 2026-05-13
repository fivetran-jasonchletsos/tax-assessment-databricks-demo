// Animated placeholder bars/blocks shown while data is downloading.
// Uses Tailwind's animate-pulse for the shimmer.

export function SkeletonBlock({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} style={style} />;
}

export function SkeletonText({
  lines = 1,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className={`h-3 ${i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

// "Loading 575,310 parcels" banner — shows over slow snapshot fetches.
export function LoadingBanner({
  label = 'Loading snapshot…',
  detail,
}: {
  label?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
      <div className="h-2 w-2 rounded-full bg-primary-500 animate-pulse" />
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {detail && <div className="text-xs text-slate-500">{detail}</div>}
      </div>
    </div>
  );
}

// Skeleton card matching the rounded panel style.
export function PanelSkeleton({
  title,
  height = 200,
}: {
  title?: string;
  height?: number;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      {title && (
        <div className="mb-3">
          <div className="text-sm font-semibold text-slate-300">{title}</div>
          <SkeletonBlock className="h-3 w-1/3 mt-1" />
        </div>
      )}
      <SkeletonBlock className="w-full" style={{ height }} />
    </section>
  );
}

// Inline KPI skeleton: tile shape with placeholder bars.
export function KPISkeleton({ primary }: { primary?: boolean }) {
  return (
    <div
      className={`rounded-lg p-4 border ${
        primary ? 'bg-primary-100 border-primary-200' : 'bg-white border-slate-200'
      }`}
    >
      <SkeletonBlock className="h-2 w-16" />
      <SkeletonBlock className="h-6 w-24 mt-2" />
      <SkeletonBlock className="h-2 w-20 mt-1.5" />
    </div>
  );
}
