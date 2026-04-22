import { CHART_DATA } from '@/utils/constants';

export default function ResourceChart() {
  const maxVal = 100;

  return (
    <div className="card p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h3 className="font-bold text-lg">Consumo de Recursos (Mensual)</h3>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" /> Fertilizantes
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-secondary" /> Agua
          </div>
        </div>
      </div>

      <div className="h-48 flex items-end gap-2 px-2">
        {CHART_DATA.map((d) => (
          <div
            key={d.month}
            className="flex-1 bg-primary/20 rounded-t-lg relative group cursor-pointer"
            style={{ height: `${(d.water / maxVal) * 100}%` }}
          >
            <div
              className="absolute inset-x-0 bottom-0 bg-primary rounded-t-lg transition-all group-hover:opacity-90"
              style={{ height: `${(d.fertilizer / d.water) * 100}%` }}
            />
            {/* Tooltip */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              F: {d.fertilizer} | A: {d.water}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between mt-4 text-[10px] font-bold text-slate-400 px-2">
        {CHART_DATA.map((d) => (
          <span key={d.month}>{d.month}</span>
        ))}
      </div>
    </div>
  );
}
