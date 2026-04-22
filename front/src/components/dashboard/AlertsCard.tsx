import Icon from '@/components/ui/Icon';
import type { Alert } from '@/types';

interface Props {
  alerts: Alert[];
}

const alertStyles = {
  critical: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-100 dark:border-red-800',
    iconColor: 'text-red-500',
    title: 'text-red-900 dark:text-red-100',
    text: 'text-red-700 dark:text-red-300',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-100 dark:border-amber-800',
    iconColor: 'text-amber-500',
    title: 'text-amber-900 dark:text-amber-100',
    text: 'text-amber-700 dark:text-amber-300',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-100 dark:border-blue-800',
    iconColor: 'text-blue-500',
    title: 'text-blue-900 dark:text-blue-100',
    text: 'text-blue-700 dark:text-blue-300',
  },
};

export default function AlertsCard({ alerts }: Props) {
  return (
    <div className="card p-6">
      <h3 className="font-bold mb-4 flex items-center gap-2">
        <Icon name="warning" className="text-amber-500" />
        Alertas de Sistema
      </h3>
      <div className="space-y-4">
        {alerts.map((alert) => {
          const s = alertStyles[alert.type];
          return (
            <div
              key={alert.id}
              className={`flex gap-3 p-3 ${s.bg} border ${s.border} rounded-xl`}
            >
              <Icon name={alert.icon} className={`${s.iconColor} shrink-0`} />
              <div>
                <p className={`text-xs font-bold ${s.title}`}>{alert.title}</p>
                <p className={`text-[10px] ${s.text}`}>{alert.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
