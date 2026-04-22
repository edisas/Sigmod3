import { useState } from 'react';
import MetricCards from '@/components/dashboard/MetricCards';
import MapCard from '@/components/dashboard/MapCard';
import ResourceChart from '@/components/dashboard/ResourceChart';
import WeatherCard from '@/components/dashboard/WeatherCard';
import AlertsCard from '@/components/dashboard/AlertsCard';
import { DASHBOARD_METRICS, SYSTEM_ALERTS, WEATHER_DATA } from '@/utils/constants';

type TimeRange = 'today' | 'week' | 'month';

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('today');

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-primary dark:text-accent tracking-tight">
            Resumen de Producción
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base">
            Monitorización en tiempo real y métricas de sostenibilidad:{' '}
            <span className="text-primary dark:text-secondary font-medium">Hacienda El Rosal</span>
          </p>
        </div>
        <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl self-start sm:self-auto">
          {(['today', 'week', 'month'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTimeRange(t)}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                timeRange === t
                  ? 'bg-white dark:bg-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'today' ? 'Hoy' : t === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics */}
      <MetricCards metrics={DASHBOARD_METRICS} />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6 lg:space-y-8">
          <MapCard />
          <ResourceChart />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <WeatherCard weather={WEATHER_DATA} />
          <AlertsCard alerts={SYSTEM_ALERTS} />

          {/* Sustainability Goal */}
          <div className="bg-accent/10 border border-accent/20 p-6 rounded-2xl">
            <h3 className="font-bold text-primary mb-2 text-sm">Meta de Sostenibilidad</h3>
            <div className="w-full bg-slate-200 dark:bg-white/10 h-2 rounded-full overflow-hidden mb-2">
              <div className="bg-primary h-full w-[78%] rounded-full transition-all duration-1000" />
            </div>
            <p className="text-[10px] font-bold text-primary/70 uppercase">
              78% Completado • Reducción Huella Nitrógeno
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
