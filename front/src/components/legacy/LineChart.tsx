interface Serie {
  nombre: string;
  valores: number[];
  color: string;
}

interface Props {
  labels: string[];
  series: Serie[];
  height?: number;
  emptyMessage?: string;
}

const PAD = { top: 24, right: 32, bottom: 44, left: 60 };
const DEFAULT_HEIGHT = 360;
const MIN_WIDTH_PER_POINT = 100;

const formatTon = (n: number): string =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const frac = value / exp;
  const mult = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return mult * exp;
}

export default function LineChart({
  labels,
  series,
  height = DEFAULT_HEIGHT,
  emptyMessage = 'Sin datos',
}: Props) {
  const hasData = series.some((s) => s.valores.some((v) => v > 0));
  if (!hasData || labels.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-slate-500 dark:text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  const width = Math.max(labels.length * MIN_WIDTH_PER_POINT, 400);
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const rawMax = Math.max(...series.flatMap((s) => s.valores), 0);
  const yMax = niceMax(rawMax);
  const yTicks = [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax];

  const x = (i: number) =>
    labels.length === 1 ? PAD.left + innerW / 2 : PAD.left + (i / (labels.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

  const pathFor = (valores: number[]): string =>
    valores
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ');

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

          {/* X labels */}
          {labels.map((label, i) => (
            <text
              key={i}
              x={x(i)}
              y={height - PAD.bottom + 16}
              textAnchor="middle"
              className="fill-slate-600 dark:fill-slate-400 text-[10px]"
            >
              {label}
            </text>
          ))}

          {/* Lines */}
          {series.map((s) => (
            <g key={s.nombre}>
              <path
                d={pathFor(s.valores)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {s.valores.map((v, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={3}
                  fill={s.color}
                  stroke="white"
                  strokeWidth={1.5}
                  className="dark:stroke-slate-900"
                >
                  <title>{`${s.nombre} · ${labels[i]}: ${formatTon(v)} t`}</title>
                </circle>
              ))}
            </g>
          ))}
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
