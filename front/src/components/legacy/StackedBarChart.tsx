interface StackSerie {
  nombre: string;
  valores: number[];
  color: string;
}

interface Props {
  labels: string[];
  series: StackSerie[];
  height?: number;
  emptyMessage?: string;
}

const PAD = { top: 28, right: 32, bottom: 44, left: 60 };
const DEFAULT_HEIGHT = 360;
const MIN_WIDTH_PER_BAR = 110;
const BAR_GAP = 0.35;

const formatTon = (n: number): string =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const frac = value / exp;
  const mult = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return mult * exp;
}

export default function StackedBarChart({
  labels,
  series,
  height = DEFAULT_HEIGHT,
  emptyMessage = 'Sin datos',
}: Props) {
  const totalsByIndex = labels.map((_, i) =>
    series.reduce((acc, s) => acc + (s.valores[i] ?? 0), 0),
  );
  const hasData = totalsByIndex.some((t) => t > 0);
  if (!hasData || labels.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-slate-500 dark:text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  const width = Math.max(labels.length * MIN_WIDTH_PER_BAR, 400);
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const yMax = niceMax(Math.max(...totalsByIndex));
  const yTicks = [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax];

  const bandW = innerW / labels.length;
  const barW = bandW * (1 - BAR_GAP);
  const barX = (i: number) => PAD.left + i * bandW + (bandW - barW) / 2;
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <svg width={width} height={height} className="min-w-full">
          {/* Y grid + labels */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(v)}
                y2={y(v)}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeDasharray={i === 0 ? '' : '3,3'}
              />
              <text
                x={PAD.left - 8}
                y={y(v) + 3}
                textAnchor="end"
                className="fill-slate-500 dark:fill-slate-400 text-[10px] tabular-nums"
              >
                {formatTon(v)}
              </text>
            </g>
          ))}

          {/* Stacked bars */}
          {labels.map((label, i) => {
            let yAccum = y(0);
            return (
              <g key={i}>
                {series.map((s) => {
                  const v = s.valores[i] ?? 0;
                  if (v === 0) return null;
                  const barH = y(0) - y(v);
                  yAccum -= barH;
                  return (
                    <rect
                      key={s.nombre}
                      x={barX(i)}
                      y={yAccum}
                      width={barW}
                      height={barH}
                      fill={s.color}
                      rx={2}
                    >
                      <title>{`${label} · ${s.nombre}: ${formatTon(v)} t`}</title>
                    </rect>
                  );
                })}
                <text
                  x={barX(i) + barW / 2}
                  y={yAccum - 4}
                  textAnchor="middle"
                  className="fill-slate-700 dark:fill-slate-200 text-[10px] font-semibold tabular-nums"
                >
                  {formatTon(totalsByIndex[i])}
                </text>
                <text
                  x={barX(i) + barW / 2}
                  y={height - PAD.bottom + 16}
                  textAnchor="middle"
                  className="fill-slate-600 dark:fill-slate-400 text-[10px]"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {series.map((s) => (
          <li key={s.nombre} className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <span className="font-medium text-slate-700 dark:text-slate-300">{s.nombre}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
