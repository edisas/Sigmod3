import Icon from '@/components/ui/Icon';
import type { MetricCard as MetricCardType } from '@/types';

interface Props {
  metrics: MetricCardType[];
}

const trendColors = {
  up: 'text-emerald-600',
  down: 'text-emerald-600',
  flat: 'text-amber-500',
};

const trendIcons = {
  up: 'trending_up',
  down: 'trending_down',
  flat: 'trending_flat',
};

export default function MetricCards({ metrics }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 animate-fade-in">
      {metrics.map((m) => (
        <div key={m.label} className="card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-500 text-sm font-medium">{m.label}</span>
            <div className={`p-2 rounded-lg ${m.colorClass}`}>
              <Icon name={m.icon} />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{m.value}</p>
          <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${trendColors[m.trend]}`}>
            <Icon name={trendIcons[m.trend]} className="text-sm" />
            <span>{m.trendLabel}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
