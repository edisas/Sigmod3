import { useEffect, useState } from 'react';
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

interface ModuloOverview {
  modulo_folio: number;
  nombre_modulo: string;
  huertos_activos: number;
  rutas: number;
  trampas_instaladas: number;
  tmimfs_emitidas: number;
  toneladas_movilizadas: number;
}

const LINE_PALETTE = ['#f59e0b', '#0ea5e9', '#10b981', '#8b5cf6', '#ec4899', '#ef4444', '#14b8a6', '#eab308'];

const formatInt = (n: number) => n.toLocaleString('es-MX');
const formatTon = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

type PhaseKey = 'overview' | 'modulos';
type PhaseStatus = 'pending' | 'loading' | 'done' | 'error';
interface PhaseDef { key: PhaseKey; roman: string; label: string; icon: string }
const PHASES: PhaseDef[] = [
  { key: 'overview', roman: 'I',  label: 'Resumen global',       icon: 'insights' },
  { key: 'modulos',  roman: 'II', label: 'Indicadores por módulo', icon: 'apartment' },
];

export default function LegacyDashboardPage() {
  const { user, token } = useLegacyAuth();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [modulos, setModulos]   = useState<ModuloOverview[] | null>(null);
  const [phaseStatus, setPhaseStatus] = useState<Record<PhaseKey, PhaseStatus>>({
    'overview': 'pending', 'modulos': 'pending',
  });
  const [phaseError, setPhaseError] = useState<Partial<Record<PhaseKey, string>>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };
    setError('');
    setPhaseStatus({ 'overview': 'loading', 'modulos': 'loading' });

    const runPhase = async <T,>(key: PhaseKey, url: string, setter: (d: T) => void) => {
      try {
        const res = await fetch(url, { headers: h });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setter((await res.json()) as T);
        setPhaseStatus((p) => ({ ...p, [key]: 'done' }));
      } catch (e) {
        setPhaseStatus((p) => ({ ...p, [key]: 'error' }));
        setPhaseError((p) => ({ ...p, [key]: e instanceof Error ? e.message : 'Error' }));
        if (key === 'overview') setError(e instanceof Error ? e.message : 'Error');
      }
    };

    void Promise.all([
      runPhase<DashboardOverview>('overview',  `${API_BASE}/legacy/dashboard/overview`,    setOverview),
      runPhase<ModuloOverview[]>('modulos',    `${API_BASE}/legacy/dashboard/por-modulo`,  setModulos),
    ]);
  }, [token]);

  const phasesDone  = Object.values(phaseStatus).filter((s) => s === 'done').length;
  const phasesTotal = PHASES.length;
  const progressPct = (phasesDone / phasesTotal) * 100;
  const anyLoading  = Object.values(phaseStatus).some((s) => s === 'loading' || s === 'pending');
  const overviewLoading = phaseStatus.overview === 'loading' || phaseStatus.overview === 'pending';

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

      {/* Loader por fase */}
      {anyLoading && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-3">
            <span className="font-semibold uppercase tracking-wider">Cargando dashboard</span>
            <span className="tabular-nums">{phasesDone} / {phasesTotal} fases</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-4">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-[width] duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PHASES.map((p) => {
              const st = phaseStatus[p.key];
              const bg =
                st === 'done'    ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                st === 'loading' ? 'bg-amber-100 dark:bg-amber-900/30' :
                st === 'error'   ? 'bg-red-100 dark:bg-red-900/30' :
                                   'bg-slate-100 dark:bg-slate-800';
              const fg =
                st === 'done'    ? 'text-emerald-700 dark:text-emerald-400' :
                st === 'loading' ? 'text-amber-700 dark:text-amber-400' :
                st === 'error'   ? 'text-red-700 dark:text-red-400' :
                                   'text-slate-400 dark:text-slate-500';
              return (
                <div key={p.key} className={`rounded-lg p-3 ${bg} flex items-center gap-3`} title={phaseError[p.key] ?? ''}>
                  <div className={fg}>
                    {st === 'loading' ? (
                      <span className="inline-block size-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                    ) : (
                      <Icon name={st === 'done' ? 'check_circle' : st === 'error' ? 'error' : p.icon} className="text-2xl" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${fg}`}>{p.roman}</span>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{p.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {error && !overviewLoading && !overview && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icon name="error" className="text-red-500 text-lg shrink-0" />
          No se pudo cargar el dashboard: {error}
        </div>
      )}
      {overview && !overviewLoading && (
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

      {/* Indicadores por módulo */}
      {modulos && modulos.length > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
            <Icon name="apartment" className="text-amber-700 dark:text-amber-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
              Indicadores por módulo
            </h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Módulo</th>
                  <th className="px-3 py-2 text-right">Rutas</th>
                  <th className="px-3 py-2 text-right">Huertos activos</th>
                  <th className="px-3 py-2 text-right">Trampas instaladas</th>
                  <th className="px-3 py-2 text-right">TMIMFs emitidas</th>
                  <th className="px-3 py-2 text-right">Toneladas movilizadas</th>
                </tr>
              </thead>
              <tbody>
                {modulos.map((m) => (
                  <tr key={m.modulo_folio} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{m.nombre_modulo}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatInt(m.rutas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatInt(m.huertos_activos)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatInt(m.trampas_instaladas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatInt(m.tmimfs_emitidas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatTon(m.toneladas_movilizadas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

    </div>
  );
}
