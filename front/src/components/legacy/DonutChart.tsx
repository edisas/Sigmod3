interface Segment {
  label: string;
  value: number;
  percentage: number;
  color: string;
}

interface Props {
  segments: Segment[];
  centerLabel?: string;
  centerValue?: string;
}

const SIZE = 160;
const STROKE = 28;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const formatTon = (n: number): string =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default function DonutChart({ segments, centerLabel, centerValue }: Props) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  let offset = 0;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div
          className="rounded-full border-[28px] border-slate-200 dark:border-slate-700"
          style={{ width: SIZE, height: SIZE }}
        />
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">Sin datos</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-slate-100 dark:stroke-slate-800"
          />
          {segments.map((s) => {
            const len = (s.value / total) * CIRCUMFERENCE;
            const circle = (
              <circle
                key={s.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                strokeWidth={STROKE}
                stroke={s.color}
                strokeDasharray={`${len} ${CIRCUMFERENCE - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return circle;
          })}
        </svg>
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerValue && (
              <span className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {centerValue}
              </span>
            )}
            {centerLabel && (
              <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {centerLabel}
              </span>
            )}
          </div>
        )}
      </div>

      <ul className="space-y-2 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-3">
            <span
              className="inline-block size-3 rounded-sm shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">{s.label}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {formatTon(s.value)} t · {s.percentage.toFixed(1)}%
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
