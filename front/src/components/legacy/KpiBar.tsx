import { type ReactNode } from 'react';
import Icon from '@/components/ui/Icon';

export interface KpiItem {
  label: string;
  value: string | number;
  hint?: string;
  icon?: string;
  /** Acento — verde para números positivos importantes, rojo para alertas, ámbar default. */
  tone?: 'amber' | 'emerald' | 'rose' | 'slate';
}

interface Props {
  items: KpiItem[];
  /** Render extra a la derecha — típicamente el ExportButton. */
  trailing?: ReactNode;
}

/**
 * Barra superior de KPIs para reportes — debe ir entre PageHeader y la tabla.
 * Cada KPI ocupa el espacio mínimo necesario; en mobile se apilan en grid 2.
 */
export default function KpiBar({ items, trailing }: Props) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-stretch gap-4 flex-wrap">
        <div className="grid grid-cols-2 sm:flex sm:flex-1 gap-4 sm:gap-6">
          {items.map((it, i) => (
            <Kpi key={i} item={it} />
          ))}
        </div>
        {trailing && <div className="flex items-end gap-2">{trailing}</div>}
      </div>
    </section>
  );
}

function Kpi({ item }: { item: KpiItem }) {
  const tone = item.tone ?? 'amber';
  const toneCls = {
    amber:   'text-amber-700 dark:text-amber-400',
    emerald: 'text-emerald-700 dark:text-emerald-400',
    rose:    'text-rose-700 dark:text-rose-400',
    slate:   'text-slate-700 dark:text-slate-300',
  }[tone];
  return (
    <div className="flex items-center gap-3 min-w-[140px]">
      {item.icon && (
        <span className={`flex-shrink-0 size-9 rounded-lg bg-amber-50 dark:bg-amber-950/30 inline-flex items-center justify-center ${toneCls}`}>
          <Icon name={item.icon} className="text-xl" />
        </span>
      )}
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {item.label}
        </div>
        <div className={`text-xl font-bold ${toneCls} tabular-nums`}>
          {typeof item.value === 'number' ? item.value.toLocaleString('es-MX') : item.value}
        </div>
        {item.hint && (
          <div className="text-[11px] text-slate-500">{item.hint}</div>
        )}
      </div>
    </div>
  );
}
