interface BarDatum {
  nombre: string;
  toneladas: number;
  porcentaje: number;
}

interface Props {
  data: BarDatum[];
  emptyMessage?: string;
}

const formatTon = (n: number): string =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default function BarChartHorizontal({ data, emptyMessage = 'Sin datos' }: Props) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">{emptyMessage}</p>
    );
  }
  const max = Math.max(...data.map((d) => d.toneladas));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => {
        const widthPct = max > 0 ? (d.toneladas / max) * 100 : 0;
        return (
          <li key={d.nombre}>
            <div className="flex items-center justify-between mb-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">{d.nombre}</span>
              <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                {formatTon(d.toneladas)} t ({d.porcentaje.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600 transition-[width] duration-500"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
