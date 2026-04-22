import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import KpiCard from '@/components/legacy/KpiCard';
import BarChartHorizontal from '@/components/legacy/BarChartHorizontal';
import DonutChart from '@/components/legacy/DonutChart';
import LineChart from '@/components/legacy/LineChart';
import StackedBarChart from '@/components/legacy/StackedBarChart';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

interface DashboardOverview {
  kpis: {
    unidades_produccion_activas: number;
    productores_unicos: number;
    tmimfs_emitidos: number;
    toneladas_totales: number;
  };
  variedades_top: Array<{ nombre: string; toneladas: number; porcentaje: number }>;
  mercado_split: {
    exportacion: { toneladas: number; porcentaje: number };
    nacional: { toneladas: number; porcentaje: number };
  };
  tendencia_semanal: {
    semanas: Array<{ folio: number; label: string }>;
    series: Array<{ nombre: string; valores: number[] }>;
  };
  comparativo_semanal: {
    semanas: Array<{ folio: number; label: string }>;
    exportacion: number[];
    nacional: number[];
  };
  generated_at: number;
}

const LINE_PALETTE = ['#f59e0b', '#0ea5e9', '#10b981', '#8b5cf6', '#ec4899', '#ef4444', '#14b8a6', '#eab308'];

const formatInt = (n: number) => n.toLocaleString('es-MX');
const formatTon = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default function LegacyDashboardPage() {
  const { user, token } = useLegacyAuth();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/legacy/dashboard/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setOverview((await res.json()) as DashboardOverview);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar el dashboard');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [token]);

  return (
    <div className="p-6 sm:p-8 space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          Dashboard Legacy
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Estás conectado a{' '}
          <span className="font-semibold text-amber-700 dark:text-amber-400">{user?.nombre_estado}</span>{' '}
          como <span className="font-semibold">{user?.nombre ?? user?.usuario}</span>.
        </p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
        <Icon name="info" className="text-amber-600 text-xl shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900 dark:text-amber-200">
          <p className="font-semibold mb-1">Modo SIGMOD 2 activo</p>
          <p>
            Las acciones que realices aquí escriben directamente en la base de datos legacy. Los reportes y
            formularios de corrección se irán publicando en este módulo.
          </p>
        </div>
      </div>

      {/* KPIs */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 h-[100px] animate-pulse"
            />
          ))}
        </div>
      )}
      {error && !loading && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icon name="error" className="text-red-500 text-lg shrink-0" />
          No se pudo cargar el dashboard: {error}
        </div>
      )}
      {overview && !loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon="agriculture"
              label="Unidades de producción"
              value={formatInt(overview.kpis.unidades_produccion_activas)}
              hint="Activas · especie mango"
              accent="amber"
            />
            <KpiCard
              icon="groups"
              label="Productores únicos"
              value={formatInt(overview.kpis.productores_unicos)}
              hint="Con unidad activa"
              accent="emerald"
            />
            <KpiCard
              icon="local_shipping"
              label="TMIMFs movilización"
              value={formatInt(overview.kpis.tmimfs_emitidos)}
              hint="Tipo M · no cancelados"
              accent="sky"
            />
            <KpiCard
              icon="scale"
              label="Toneladas movilizadas"
              value={formatTon(overview.kpis.toneladas_totales)}
              hint="Mango · histórico"
              accent="violet"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                  Top variedades movilizadas
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Toneladas acumuladas · especie mango
                </p>
              </header>
              <div className="p-5 sm:p-6">
                <BarChartHorizontal data={overview.variedades_top} emptyMessage="Sin movilizaciones de mango" />
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                  Exportación vs Nacional
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Toneladas de mango</p>
              </header>
              <div className="p-5 flex items-center justify-center min-h-[220px]">
                <DonutChart
                  segments={[
                    {
                      label: 'Exportación',
                      value: overview.mercado_split.exportacion.toneladas,
                      percentage: overview.mercado_split.exportacion.porcentaje,
                      color: '#0ea5e9',
                    },
                    {
                      label: 'Nacional',
                      value: overview.mercado_split.nacional.toneladas,
                      percentage: overview.mercado_split.nacional.porcentaje,
                      color: '#f59e0b',
                    },
                  ]}
                  centerLabel="Total"
                  centerValue={`${formatTon(
                    overview.mercado_split.exportacion.toneladas + overview.mercado_split.nacional.toneladas,
                  )} t`}
                />
              </div>
            </section>
          </div>

          {/* Tendencia semanal por variedad — full width */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                Tendencia últimas 10 semanas
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Toneladas por variedad (top 6)
              </p>
            </header>
            <div className="p-5 sm:p-6">
              <LineChart
                labels={overview.tendencia_semanal.semanas.map((s) => s.label)}
                series={overview.tendencia_semanal.series.map((s, i) => ({
                  nombre: s.nombre,
                  valores: s.valores,
                  color: LINE_PALETTE[i % LINE_PALETTE.length],
                }))}
                emptyMessage="Sin movilizaciones de mango con semana asignada"
              />
            </div>
          </section>

          {/* Comparativo semanal Export/Nacional — full width */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                Comparativo últimas 10 semanas
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Exportación vs Nacional por semana
              </p>
            </header>
            <div className="p-5 sm:p-6">
              <StackedBarChart
                labels={overview.comparativo_semanal.semanas.map((s) => s.label)}
                series={[
                  {
                    nombre: 'Exportación',
                    valores: overview.comparativo_semanal.exportacion,
                    color: '#0ea5e9',
                  },
                  {
                    nombre: 'Nacional',
                    valores: overview.comparativo_semanal.nacional,
                    color: '#f59e0b',
                  },
                ]}
                emptyMessage="Sin movilizaciones con semana asignada"
              />
            </div>
          </section>
        </>
      )}

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-3">
          Accesos rápidos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            to="/legacy/reportes/concentrado-en-linea"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-start gap-3 hover:border-amber-400 dark:hover:border-amber-600 transition-colors"
          >
            <div className="size-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Icon name="summarize" className="text-amber-700 dark:text-amber-400 text-xl" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">Movilización en línea</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Concentrado por módulo, mercado y variedad
              </p>
            </div>
          </Link>
          <Link
            to="/legacy/reportes/concentrado-en-linea-semanal"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-start gap-3 hover:border-amber-400 dark:hover:border-amber-600 transition-colors"
          >
            <div className="size-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Icon name="date_range" className="text-amber-700 dark:text-amber-400 text-xl" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">Movilización semanal</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mismo concentrado filtrado por semana
              </p>
            </div>
          </Link>
          {[
            { icon: 'edit_note', title: 'Correcciones', desc: 'Próximamente' },
            { icon: 'history', title: 'Bitácora', desc: 'Próximamente' },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-start gap-3"
            >
              <div className="size-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Icon name={card.icon} className="text-amber-700 dark:text-amber-400 text-xl" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{card.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{card.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
