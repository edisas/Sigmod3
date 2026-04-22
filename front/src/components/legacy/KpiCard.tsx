import Icon from '@/components/ui/Icon';

interface Props {
  icon: string;
  label: string;
  value: string;
  hint?: string;
  accent?: 'amber' | 'emerald' | 'sky' | 'violet';
}

const accentMap = {
  amber:   { bg: 'bg-amber-100 dark:bg-amber-900/30',     fg: 'text-amber-700 dark:text-amber-400' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', fg: 'text-emerald-700 dark:text-emerald-400' },
  sky:     { bg: 'bg-sky-100 dark:bg-sky-900/30',         fg: 'text-sky-700 dark:text-sky-400' },
  violet:  { bg: 'bg-violet-100 dark:bg-violet-900/30',   fg: 'text-violet-700 dark:text-violet-400' },
};

export default function KpiCard({ icon, label, value, hint, accent = 'amber' }: Props) {
  const { bg, fg } = accentMap[accent];
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-start gap-4">
      <div className={`size-12 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
        <Icon name={icon} className={`${fg} text-2xl`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {label}
        </p>
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums truncate">
          {value}
        </p>
        {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{hint}</p>}
      </div>
    </div>
  );
}
