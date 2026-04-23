import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth } from '@/context/LegacyAuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

// ───────────────────────── Types ─────────────────────────

interface Resumen {
  rango_semanas: number;
  sem_inicio_folio: number | null; sem_fin_folio: number | null;
  sem_inicio_label: string | null; sem_fin_label: string | null;
  muestreos_realizados: number;
  kg_totales_muestreados: number;
  huertos_muestreados: number;
  muestreos_debidos: number;
  muestreos_cumplidos: number;
  porcentaje_cumplimiento: number;
  muestreos_con_larvas: number;
}
interface Cumpl {
  sem_folio: number; sem_anio: number | null; periodo: number | null; label: string;
  debidos: number; cumplidos: number; porcentaje: number;
}
interface VarSem {
  sem_folio: number; sem_anio: number | null; periodo: number | null; label: string;
  variedad_folio: number; variedad_nombre: string;
  muestreos: number; kgs: number;
}
interface Pfa {
  clave_pfa: number; nombre: string; inicial: string | null;
  muestreos: number; kgs: number; semanas_con_muestreo: number; huertos_muestreados: number;
}

type PhaseKey = 'resumen' | 'cumplimiento' | 'muestreos-variedad' | 'kgs-variedad' | 'por-pfa';
type PhaseStatus = 'pending' | 'loading' | 'done' | 'error';
interface PhaseDef { key: PhaseKey; roman: string; label: string; icon: string }
const PHASES: PhaseDef[] = [
  { key: 'resumen',              roman: 'I',   label: 'KPIs generales',       icon: 'insights' },
  { key: 'cumplimiento',         roman: 'II',  label: 'Cumplimiento semanal', icon: 'fact_check' },
  { key: 'muestreos-variedad',   roman: 'III', label: 'Muestreos por variedad', icon: 'category' },
  { key: 'kgs-variedad',         roman: 'IV',  label: 'Kg por variedad',      icon: 'scale' },
  { key: 'por-pfa',              roman: 'V',   label: 'Ranking por PFA',      icon: 'leaderboard' },
];

// ───────────────────────── Format helpers ─────────────────────────

const fInt = (n: number | undefined) => (n ?? 0).toLocaleString('es-MX');
const fKg = (n: number | undefined) =>
  (n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fPct = (n: number | undefined) => `${(n ?? 0).toFixed(1)}%`;

// ───────────────────────── Page ─────────────────────────

export default function DashboardMuestreoPage() {
  const { token, user } = useLegacyAuth();
  const [semanas, setSemanas] = useState(10);

  const [resumen, setResumen]               = useState<Resumen | null>(null);
  const [cumplimiento, setCumplimiento]     = useState<Cumpl[] | null>(null);
  const [muesVar, setMuesVar]               = useState<VarSem[] | null>(null);
  const [kgsVar, setKgsVar]                 = useState<VarSem[] | null>(null);
  const [porPfa, setPorPfa]                 = useState<Pfa[] | null>(null);

  const [phaseStatus, setPhaseStatus] = useState<Record<PhaseKey, PhaseStatus>>({
    'resumen': 'pending', 'cumplimiento': 'pending', 'muestreos-variedad': 'pending',
    'kgs-variedad': 'pending', 'por-pfa': 'pending',
  });
  const [phaseError, setPhaseError] = useState<Partial<Record<PhaseKey, string>>>({});
  const [generando, setGenerando]   = useState(false);
  const generationIdRef = useRef(0);

  const resetData = () => {
    setResumen(null); setCumplimiento(null); setMuesVar(null); setKgsVar(null); setPorPfa(null);
    setPhaseStatus({
      'resumen': 'pending', 'cumplimiento': 'pending', 'muestreos-variedad': 'pending',
      'kgs-variedad': 'pending', 'por-pfa': 'pending',
    });
    setPhaseError({});
  };

  const handleGenerar = async () => {
    if (!token || generando) return;
    resetData();
    setGenerando(true);
    const myGenId = ++generationIdRef.current;
    setPhaseStatus({
      'resumen': 'loading', 'cumplimiento': 'loading', 'muestreos-variedad': 'loading',
      'kgs-variedad': 'loading', 'por-pfa': 'loading',
    });

    const runPhase = async <T,>(key: PhaseKey, ep: string, setter: (d: T) => void) => {
      try {
        const res = await fetch(`${API_BASE}/legacy/dashboard-muestreo/${ep}?semanas=${semanas}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as { detail?: string }));
          throw new Error(body.detail ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as T;
        if (generationIdRef.current !== myGenId) return;
        setter(data);
        setPhaseStatus((p) => ({ ...p, [key]: 'done' }));
      } catch (e) {
        if (generationIdRef.current !== myGenId) return;
        setPhaseStatus((p) => ({ ...p, [key]: 'error' }));
        setPhaseError((p) => ({ ...p, [key]: e instanceof Error ? e.message : 'Error' }));
      }
    };

    try {
      await Promise.all([
        runPhase<Resumen>('resumen',                  'resumen',               setResumen),
        runPhase<Cumpl[]>('cumplimiento',             'cumplimiento-por-semana', setCumplimiento),
        runPhase<VarSem[]>('muestreos-variedad',      'muestreos-por-variedad', setMuesVar),
        runPhase<VarSem[]>('kgs-variedad',            'kgs-por-variedad',      setKgsVar),
        runPhase<Pfa[]>('por-pfa',                    'por-pfa',               setPorPfa),
      ]);
    } finally {
      if (generationIdRef.current === myGenId) setGenerando(false);
    }
  };

  useEffect(() => {
    if (token && !generando && resumen === null && phaseStatus.resumen === 'pending') {
      void handleGenerar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const phasesDone  = Object.values(phaseStatus).filter((s) => s === 'done').length;
  const phasesTotal = PHASES.length;
  const progressPct = (phasesDone / phasesTotal) * 100;

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
            Dashboard de muestreo de frutos
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Realizados vs debidos (huertos con estado fenológico 3 en TMIMF 'O') —{' '}
            <span className="font-semibold text-amber-700 dark:text-amber-400">{user?.nombre_estado}</span>
          </p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label htmlFor="sem" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              Rango (últimas N semanas)
            </label>
            <select
              id="sem" value={semanas}
              onChange={(e) => setSemanas(Number(e.target.value))}
              disabled={generando}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              {[4, 8, 10, 12, 16, 20, 26, 52].map((n) => (
                <option key={n} value={n}>{n} semanas</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleGenerar()}
            disabled={generando}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold"
          >
            {generando ? (
              <><span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generando...</>
            ) : (
              <><Icon name="refresh" className="text-base" /> Generar</>
            )}
          </button>
        </div>
      </div>

      {/* Progreso por fase */}
      {(generando || phasesDone > 0) && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-3">
            <span className="font-semibold uppercase tracking-wider">Progreso</span>
            <span className="tabular-nums">{phasesDone} / {phasesTotal} fases</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-4">
            <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-[width] duration-500"
                 style={{ width: `${progressPct}%` }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
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
                <div key={p.key} className={`rounded-lg p-3 ${bg} flex flex-col items-center text-center gap-1`} title={phaseError[p.key] ?? ''}>
                  <div className={`${fg} relative`}>
                    {st === 'loading' ? (
                      <span className="inline-block size-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                    ) : (
                      <Icon name={st === 'done' ? 'check_circle' : st === 'error' ? 'error' : p.icon} className="text-2xl" />
                    )}
                  </div>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${fg}`}>{p.roman}</p>
                  <p className="text-[11px] leading-tight font-medium text-slate-700 dark:text-slate-300">{p.label}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <PhaseStatusContext.Provider value={phaseStatus}>
        <SectionResumen data={resumen} />
        <SectionCumplimiento data={cumplimiento} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionVariedadMuestreos data={muesVar} />
          <SectionVariedadKgs data={kgsVar} />
        </div>
        <SectionPorPfa data={porPfa} />
      </PhaseStatusContext.Provider>
    </div>
  );
}

const PhaseStatusContext = createContext<Record<PhaseKey, PhaseStatus>>({
  'resumen': 'done', 'cumplimiento': 'done', 'muestreos-variedad': 'done', 'kgs-variedad': 'done', 'por-pfa': 'done',
});
function useSectionStatus(key: PhaseKey): PhaseStatus {
  return useContext(PhaseStatusContext)[key];
}

// ───────────────────────── Sections ─────────────────────────

function SectionResumen({ data }: { data: Resumen | null }) {
  const st = useSectionStatus('resumen');
  const loading = st === 'loading' || st === 'pending';
  const kpis = [
    { label: 'Muestreos realizados', value: data?.muestreos_realizados,    icon: 'science',     fmt: fInt },
    { label: 'Kg totales (muestreados)', value: data?.kg_totales_muestreados, icon: 'scale',    fmt: fKg },
    { label: 'Huertos muestreados',  value: data?.huertos_muestreados,     icon: 'forest',      fmt: fInt },
    { label: 'Muestreos debidos',    value: data?.muestreos_debidos,       icon: 'checklist',   fmt: fInt },
    { label: 'Muestreos cumplidos',  value: data?.muestreos_cumplidos,     icon: 'check_circle', fmt: fInt },
    { label: '% cumplimiento estatal', value: data?.porcentaje_cumplimiento, icon: 'verified',  fmt: fPct },
  ];
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="insights" className="text-amber-700 dark:text-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          Resumen
          {data?.sem_inicio_label && data?.sem_fin_label && (
            <span className="ml-2 text-xs text-slate-500 dark:text-slate-400 font-normal normal-case">
              · {data.sem_inicio_label} → {data.sem_fin_label}
            </span>
          )}
        </h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 mb-1">
              <Icon name={k.icon} className="text-sm" />
              <span className="uppercase tracking-wider font-semibold">{k.label}</span>
            </div>
            {loading ? (
              <div className="h-7 w-20 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums animate-fade-in">{k.fmt(k.value)}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionCumplimiento({ data }: { data: Cumpl[] | null }) {
  const st = useSectionStatus('cumplimiento');
  const loading = st === 'loading' || st === 'pending';
  const max = useMemo(() => Math.max(1, ...(data ?? []).map((d) => d.debidos)), [data]);
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="fact_check" className="text-amber-700 dark:text-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">Cumplimiento por semana — debidos vs realizados</h2>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-6 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Sin datos en este rango.</p>
      ) : (
        <div className="space-y-3 animate-fade-in">
          {data.map((w) => {
            const pctD = (w.debidos / max) * 100;
            const pctC = (w.cumplidos / max) * 100;
            return (
              <div key={w.sem_folio} className="text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{w.label}</span>
                  <span className="tabular-nums text-slate-600 dark:text-slate-400">
                    <strong className={w.porcentaje >= 80 ? 'text-emerald-600' : w.porcentaje >= 50 ? 'text-amber-600' : 'text-rose-600'}>
                      {fPct(w.porcentaje)}
                    </strong>{' '}
                    · {fInt(w.cumplidos)} / {fInt(w.debidos)}
                  </span>
                </div>
                <div className="relative h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-slate-300 dark:bg-slate-600" style={{ width: `${pctD}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${pctC}%` }} />
                </div>
              </div>
            );
          })}
          <div className="flex gap-4 pt-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><span className="inline-block size-3 bg-slate-300 dark:bg-slate-600 rounded-sm" /> Debidos</span>
            <span className="flex items-center gap-1"><span className="inline-block size-3 bg-emerald-500 rounded-sm" /> Cumplidos</span>
          </div>
        </div>
      )}
    </section>
  );
}

// Colores predefinidos para variedades (rotación)
const VARIEDAD_COLORS = [
  'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500',
  'bg-rose-500', 'bg-teal-500', 'bg-orange-500', 'bg-fuchsia-500',
  'bg-lime-500', 'bg-indigo-500',
];

function useVariedadStructure(data: VarSem[] | null, metric: 'muestreos' | 'kgs') {
  return useMemo(() => {
    if (!data || data.length === 0) return { semanas: [], variedades: [], matriz: new Map<string, number>() };
    // orden por total del metric desc
    const totales = new Map<number, { nombre: string; total: number }>();
    const semanasSet = new Map<number, { sem_folio: number; label: string }>();
    for (const r of data) {
      semanasSet.set(r.sem_folio, { sem_folio: r.sem_folio, label: r.label });
      const prev = totales.get(r.variedad_folio) ?? { nombre: r.variedad_nombre, total: 0 };
      prev.total += r[metric];
      totales.set(r.variedad_folio, prev);
    }
    const variedades = Array.from(totales.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([folio, v], i) => ({ folio, nombre: v.nombre, total: v.total, color: VARIEDAD_COLORS[i % VARIEDAD_COLORS.length] }));
    const semanas = Array.from(semanasSet.values()).sort((a, b) => a.sem_folio - b.sem_folio);
    const matriz = new Map<string, number>();
    for (const r of data) matriz.set(`${r.sem_folio}:${r.variedad_folio}`, r[metric]);
    return { semanas, variedades, matriz };
  }, [data, metric]);
}

function SectionVariedadMuestreos({ data }: { data: VarSem[] | null }) {
  const st = useSectionStatus('muestreos-variedad');
  const loading = st === 'loading' || st === 'pending';
  const { semanas, variedades, matriz } = useVariedadStructure(data, 'muestreos');
  return <ChartStackedVariedad
    titulo="Muestreos por variedad × semana"
    icono="category"
    loading={loading}
    data={data}
    semanas={semanas}
    variedades={variedades}
    matriz={matriz}
    formato={fInt}
  />;
}

function SectionVariedadKgs({ data }: { data: VarSem[] | null }) {
  const st = useSectionStatus('kgs-variedad');
  const loading = st === 'loading' || st === 'pending';
  const { semanas, variedades, matriz } = useVariedadStructure(data, 'kgs');
  return <ChartStackedVariedad
    titulo="Kg muestreados por variedad × semana"
    icono="scale"
    loading={loading}
    data={data}
    semanas={semanas}
    variedades={variedades}
    matriz={matriz}
    formato={fKg}
  />;
}

interface VariedadChartProps {
  titulo: string;
  icono: string;
  loading: boolean;
  data: VarSem[] | null;
  semanas: { sem_folio: number; label: string }[];
  variedades: { folio: number; nombre: string; total: number; color: string }[];
  matriz: Map<string, number>;
  formato: (n: number) => string;
}

function ChartStackedVariedad({ titulo, icono, loading, data, semanas, variedades, matriz, formato }: VariedadChartProps) {
  const topVars = variedades.slice(0, 8);

  // Suma total por semana (solo variedades top para que el stacking sea consistente con la leyenda)
  const totalBySem: Record<number, number> = {};
  for (const s of semanas) {
    let t = 0;
    for (const v of topVars) t += matriz.get(`${s.sem_folio}:${v.folio}`) ?? 0;
    totalBySem[s.sem_folio] = t;
  }
  const maxTotal = Math.max(1, ...Object.values(totalBySem));

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name={icono} className="text-amber-700 dark:text-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">{titulo}</h2>
      </div>
      {loading ? (
        <div className="h-56 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ) : !data || data.length === 0 || topVars.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Sin datos en este rango.</p>
      ) : (
        <div className="animate-fade-in">
          {/* bars container — default align-items: stretch hace que cada columna
              herede la altura del contenedor (h-56). flex-1 interno puede entonces
              dar altura real a la barra (antes colapsaba por items-end). */}
          <div className="flex gap-1 h-56 border-b border-slate-200 dark:border-slate-700 mb-2 overflow-x-auto relative">
            {/* eje Y con 5 marcas */}
            <div className="absolute inset-0 pointer-events-none">
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <div key={t} className="absolute left-0 right-0 border-t border-dashed border-slate-100 dark:border-slate-800 flex items-center" style={{ top: `${t * 100}%` }}>
                  <span className="text-[9px] text-slate-400 tabular-nums ml-1 -translate-y-2">{formato(Math.round(maxTotal * (1 - t)))}</span>
                </div>
              ))}
            </div>
            {semanas.map((s) => {
              const total = totalBySem[s.sem_folio] ?? 0;
              // mínimo 2% si hay algún valor para que sea visible
              const heightPct = total > 0 ? Math.max((total / maxTotal) * 100, 2) : 0;
              return (
                <div key={s.sem_folio} className="flex flex-col min-w-[40px] flex-1 relative z-10">
                  <div className="flex-1 flex items-end w-full px-[2px]">
                    <div
                      className="w-full flex flex-col-reverse overflow-hidden rounded-t transition-[height] duration-500"
                      style={{ height: `${heightPct}%` }}
                      title={`${s.label} · total ${formato(total)}`}
                    >
                      {topVars.map((v) => {
                        const val = matriz.get(`${s.sem_folio}:${v.folio}`) ?? 0;
                        const pct = total > 0 ? (val / total) * 100 : 0;
                        if (pct === 0) return null;
                        return <div key={v.folio} className={v.color} style={{ height: `${pct}%` }} title={`${v.nombre}: ${formato(val)}`} />;
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* etiquetas X */}
          <div className="flex gap-1 overflow-x-auto">
            {semanas.map((s) => (
              <div key={s.sem_folio} className="min-w-[40px] flex-1 text-center">
                <span className="text-[10px] text-slate-500 whitespace-nowrap">{s.label}</span>
              </div>
            ))}
          </div>
          {/* leyenda */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400 mt-3">
            {topVars.map((v) => (
              <span key={v.folio} className="flex items-center gap-1">
                <span className={`inline-block size-3 rounded-sm ${v.color}`} />
                {v.nombre} <span className="tabular-nums text-slate-400">({formato(v.total)})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SectionPorPfa({ data }: { data: Pfa[] | null }) {
  const st = useSectionStatus('por-pfa');
  const loading = st === 'loading' || st === 'pending';
  const maxMues = useMemo(() => Math.max(1, ...(data ?? []).map((p) => p.muestreos)), [data]);
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="leaderboard" className="text-amber-700 dark:text-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">Ranking PFA por muestreos y kg</h2>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-6 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Sin muestreos por PFA en este rango.</p>
      ) : (
        <div className="animate-fade-in overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">PFA</th>
                <th className="px-2 py-2 text-left w-[30%]">Muestreos</th>
                <th className="px-2 py-2 text-right">Kg</th>
                <th className="px-2 py-2 text-right">Huertos</th>
                <th className="px-2 py-2 text-right">Semanas</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p, i) => (
                <tr key={p.clave_pfa} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-2 tabular-nums text-slate-500">{i + 1}</td>
                  <td className="px-2 py-2">
                    {p.inicial && <span className="font-mono text-xs text-slate-500 mr-1">{p.inicial}</span>}
                    <span className="text-slate-900 dark:text-slate-100">{p.nombre}</span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: `${(p.muestreos / maxMues) * 100}%` }} />
                      </div>
                      <span className="tabular-nums text-xs w-14 text-right">{fInt(p.muestreos)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{fKg(p.kgs)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fInt(p.huertos_muestreados)}</td>
                  <td className="px-2 py-2 text-right">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-semibold">
                      {p.semanas_con_muestreo} sem
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
