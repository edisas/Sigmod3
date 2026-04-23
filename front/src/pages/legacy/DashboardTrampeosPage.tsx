import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth } from '@/context/LegacyAuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

// ───────────────────────── Types ─────────────────────────

interface Resumen {
  rango_semanas: number;
  sem_inicio_folio: number | null; sem_fin_folio: number | null;
  sem_inicio_label: string | null; sem_fin_label: string | null;
  revisiones_con_captura: number;
  trampas_con_captura: number;
  huertos_con_captura: number;
  moscas_silvestres: number;
  moscas_esteriles: number;
  especies_distintas: number;
}
interface Especie {
  folio: number; nombre: string;
  hembras_silvestre: number; machos_silvestre: number;
  hembras_esteril: number;  machos_esteril: number;
  total_silvestre: number; total_esteril: number; total: number;
}
interface SexoTotales { hembras_silvestre: number; machos_silvestre: number; hembras_esteril: number; machos_esteril: number }
interface SemanaCap {
  sem_folio: number; sem_anio: number | null; periodo: number | null; label: string;
  hembras_silvestre: number; machos_silvestre: number;
  hembras_esteril: number;  machos_esteril: number;
  silvestre: number; esteril: number;
  mtd_estatal: number;
}
interface PfaCap {
  clave_pfa: number; nombre: string; inicial: string | null;
  revisiones_con_captura: number; silvestre: number; esteril: number;
  semanas_con_captura: number;
}
interface ModuloCap {
  modulo_folio: number; nombre_modulo: string;
  revisiones_con_captura: number; huertos_con_captura: number;
  silvestre: number; esteril: number; mtd_modulo: number;
}

type PhaseKey = 'resumen' | 'especies' | 'sexo' | 'por-semana' | 'por-pfa' | 'por-modulo';
type PhaseStatus = 'pending' | 'loading' | 'done' | 'error';

interface PhaseDef { key: PhaseKey; roman: string; label: string; icon: string }
const PHASES: PhaseDef[] = [
  { key: 'resumen',    roman: 'I',   label: 'KPIs generales',    icon: 'insights' },
  { key: 'especies',   roman: 'II',  label: 'Ranking de especies', icon: 'bug_report' },
  { key: 'sexo',       roman: 'III', label: 'Hembras vs machos', icon: 'pie_chart' },
  { key: 'por-semana', roman: 'IV',  label: 'Capturas por semana', icon: 'timeline' },
  { key: 'por-pfa',    roman: 'V',   label: 'Ranking por PFA',   icon: 'leaderboard' },
  { key: 'por-modulo', roman: 'VI',  label: 'MTD por módulo',    icon: 'apartment' },
];

// ───────────────────────── Format helpers ─────────────────────────

const fInt = (n: number | undefined) => (n ?? 0).toLocaleString('es-MX');
const fDec = (n: number | undefined, d = 4) =>
  (n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });

// ───────────────────────── Page ─────────────────────────

export default function DashboardTrampeosPage() {
  const { token, user } = useLegacyAuth();
  const [semanas, setSemanas] = useState(10);

  const [resumen, setResumen]       = useState<Resumen | null>(null);
  const [especies, setEspecies]     = useState<Especie[] | null>(null);
  const [sexo, setSexo]             = useState<SexoTotales | null>(null);
  const [porSemana, setPorSemana]   = useState<SemanaCap[] | null>(null);
  const [porPfa, setPorPfa]         = useState<PfaCap[] | null>(null);
  const [porModulo, setPorModulo]   = useState<ModuloCap[] | null>(null);

  const [phaseStatus, setPhaseStatus] = useState<Record<PhaseKey, PhaseStatus>>({
    'resumen': 'pending', 'especies': 'pending', 'sexo': 'pending',
    'por-semana': 'pending', 'por-pfa': 'pending', 'por-modulo': 'pending',
  });
  const [phaseError, setPhaseError] = useState<Partial<Record<PhaseKey, string>>>({});
  const [generando, setGenerando]   = useState(false);
  const generationIdRef = useRef(0);

  const resetData = () => {
    setResumen(null); setEspecies(null); setSexo(null); setPorSemana(null); setPorPfa(null); setPorModulo(null);
    setPhaseStatus({
      'resumen': 'pending', 'especies': 'pending', 'sexo': 'pending',
      'por-semana': 'pending', 'por-pfa': 'pending', 'por-modulo': 'pending',
    });
    setPhaseError({});
  };

  const handleGenerar = async () => {
    if (!token || generando) return;
    resetData();
    setGenerando(true);
    const myGenId = ++generationIdRef.current;
    // arranque de fases
    setPhaseStatus({
      'resumen': 'loading', 'especies': 'loading', 'sexo': 'loading',
      'por-semana': 'loading', 'por-pfa': 'loading', 'por-modulo': 'loading',
    });

    const runPhase = async <T,>(key: PhaseKey, ep: string, setter: (d: T) => void) => {
      try {
        const res = await fetch(`${API_BASE}/legacy/dashboard-trampeos/${ep}?semanas=${semanas}`, {
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
        runPhase<Resumen>('resumen',        'resumen',    setResumen),
        runPhase<Especie[]>('especies',     'especies',   setEspecies),
        runPhase<SexoTotales>('sexo',       'sexo',       setSexo),
        runPhase<SemanaCap[]>('por-semana', 'por-semana', setPorSemana),
        runPhase<PfaCap[]>('por-pfa',       'por-pfa',    setPorPfa),
        runPhase<ModuloCap[]>('por-modulo', 'por-modulo', setPorModulo),
      ]);
    } finally {
      if (generationIdRef.current === myGenId) setGenerando(false);
    }
  };

  // auto-run una vez al cargar
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
            Dashboard de trampeos con captura
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Análisis de revisiones con status "Revisada con captura" —{' '}
            <span className="font-semibold text-amber-700 dark:text-amber-400">{user?.nombre_estado}</span>
          </p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label htmlFor="sem" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              Rango (últimas N semanas)
            </label>
            <select
              id="sem"
              value={semanas}
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
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-[width] duration-500"
              style={{ width: `${progressPct}%` }}
            />
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
                      <Icon
                        name={st === 'done' ? 'check_circle' : st === 'error' ? 'error' : p.icon}
                        className="text-2xl"
                      />
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

      {/* Contenido */}
      <PhaseStatusContext.Provider value={phaseStatus}>
        <SectionResumen data={resumen} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionEspecies data={especies} />
          <SectionSexo data={sexo} />
        </div>
        <SectionPorSemana data={porSemana} />
        <SectionPorPfa data={porPfa} />
        <SectionPorModulo data={porModulo} />
      </PhaseStatusContext.Provider>
    </div>
  );
}

// Contexto para skeleton por sección
const PhaseStatusContext = createContext<Record<PhaseKey, PhaseStatus>>({
  'resumen': 'done', 'especies': 'done', 'sexo': 'done', 'por-semana': 'done', 'por-pfa': 'done', 'por-modulo': 'done',
});

function useSectionStatus(key: PhaseKey): PhaseStatus {
  return useContext(PhaseStatusContext)[key];
}

// ───────────────────────── Sections ─────────────────────────

function SectionResumen({ data }: { data: Resumen | null }) {
  const st = useSectionStatus('resumen');
  const loading = st === 'loading' || st === 'pending';
  const kpis = [
    { label: 'Revisiones con captura', value: data?.revisiones_con_captura, icon: 'checklist' },
    { label: 'Trampas con captura',    value: data?.trampas_con_captura,    icon: 'track_changes' },
    { label: 'Huertos con captura',    value: data?.huertos_con_captura,    icon: 'forest' },
    { label: 'Moscas silvestres',      value: data?.moscas_silvestres,      icon: 'bug_report' },
    { label: 'Moscas estériles',       value: data?.moscas_esteriles,       icon: 'science' },
    { label: 'Especies distintas',     value: data?.especies_distintas,     icon: 'category' },
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
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums animate-fade-in">{fInt(k.value)}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionEspecies({ data }: { data: Especie[] | null }) {
  const st = useSectionStatus('especies');
  const loading = st === 'loading' || st === 'pending';
  const maxTotal = useMemo(() => Math.max(1, ...(data ?? []).map((e) => e.total)), [data]);
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="bug_report" className="text-amber-700 dark:text-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">Ranking de especies capturadas</h2>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-5 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Sin capturas en este rango.</p>
      ) : (
        <div className="space-y-2 animate-fade-in">
          {data.map((e) => {
            const pctSilv = (e.total_silvestre / maxTotal) * 100;
            const pctEst  = (e.total_esteril  / maxTotal) * 100;
            return (
              <div key={e.folio} className="text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{e.nombre}</span>
                  <span className="tabular-nums text-slate-600 dark:text-slate-400">
                    {fInt(e.total)} <span className="text-slate-400">({fInt(e.total_silvestre)} silv · {fInt(e.total_esteril)} est)</span>
                  </span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                  <div className="bg-emerald-500" style={{ width: `${pctSilv}%` }} title={`Silvestre: ${e.total_silvestre}`} />
                  <div className="bg-sky-500"     style={{ width: `${pctEst}%`  }} title={`Estéril: ${e.total_esteril}`} />
                </div>
              </div>
            );
          })}
          <div className="flex gap-4 mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><span className="inline-block size-3 bg-emerald-500 rounded-sm" /> Silvestre</span>
            <span className="flex items-center gap-1"><span className="inline-block size-3 bg-sky-500 rounded-sm" /> Estéril</span>
          </div>
        </div>
      )}
    </section>
  );
}

function SectionSexo({ data }: { data: SexoTotales | null }) {
  const st = useSectionStatus('sexo');
  const loading = st === 'loading' || st === 'pending';
  const total = (data?.hembras_silvestre ?? 0) + (data?.machos_silvestre ?? 0)
              + (data?.hembras_esteril ?? 0)  + (data?.machos_esteril ?? 0);
  const pct = (n: number) => total === 0 ? 0 : (n / total) * 100;
  const rows = [
    { label: '♀ silvestre', value: data?.hembras_silvestre ?? 0, cls: 'bg-rose-500' },
    { label: '♂ silvestre', value: data?.machos_silvestre  ?? 0, cls: 'bg-emerald-500' },
    { label: '♀ estéril',  value: data?.hembras_esteril  ?? 0, cls: 'bg-rose-300' },
    { label: '♂ estéril',  value: data?.machos_esteril   ?? 0, cls: 'bg-sky-400' },
  ];
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="pie_chart" className="text-amber-700 dark:text-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">Hembras vs machos</h2>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-6 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />)}
        </div>
      ) : total === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Sin capturas en este rango.</p>
      ) : (
        <div className="space-y-3 animate-fade-in">
          {rows.map((r) => (
            <div key={r.label} className="text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-700 dark:text-slate-300">{r.label}</span>
                <span className="tabular-nums">{fInt(r.value)} <span className="text-slate-400">({pct(r.value).toFixed(1)}%)</span></span>
              </div>
              <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className={`h-full ${r.cls}`} style={{ width: `${pct(r.value)}%` }} />
              </div>
            </div>
          ))}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold">Total</span>
            <span className="tabular-nums font-bold text-slate-900 dark:text-slate-100">{fInt(total)}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function SectionPorSemana({ data }: { data: SemanaCap[] | null }) {
  const st = useSectionStatus('por-semana');
  const loading = st === 'loading' || st === 'pending';
  const hasData = data && data.length > 0;

  // ── SVG dimensions
  const W = 800, H = 280, M = { t: 20, r: 60, b: 30, l: 48 };
  const IW = W - M.l - M.r;
  const IH = H - M.t - M.b;

  const maxCap = useMemo(() => Math.max(1, ...(data ?? []).map((s) => s.silvestre + s.esteril)), [data]);
  const maxMtd = useMemo(() => Math.max(0.001, ...(data ?? []).map((s) => s.mtd_estatal)), [data]);

  const x = (i: number) => (data && data.length > 1 ? (i / (data.length - 1)) * IW : IW / 2);
  const yCap = (v: number) => IH - (v / maxCap) * IH;
  const yMtd = (v: number) => IH - (v / maxMtd) * IH;

  const pathMtd = hasData
    ? data!.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${yMtd(s.mtd_estatal)}`).join(' ')
    : '';

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="timeline" className="text-amber-700 dark:text-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">Capturas por semana · MTD estatal</h2>
      </div>
      {loading ? (
        <div className="h-[280px] rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ) : !hasData ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Sin datos en este rango.</p>
      ) : (
        <div className="overflow-x-auto animate-fade-in">
          <svg width={W} height={H} className="max-w-full">
            {/* grid horizontal */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={M.l} y1={M.t + IH * t} x2={M.l + IW} y2={M.t + IH * t} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
                <text x={M.l - 6} y={M.t + IH * t + 4} textAnchor="end" className="fill-slate-500 text-[10px] tabular-nums">
                  {fInt(Math.round(maxCap * (1 - t)))}
                </text>
                <text x={M.l + IW + 6} y={M.t + IH * t + 4} textAnchor="start" className="fill-slate-500 text-[10px] tabular-nums">
                  {fDec(maxMtd * (1 - t), 3)}
                </text>
              </g>
            ))}
            {/* barras stacked silvestre + esteril */}
            {data!.map((s, i) => {
              const bw = Math.max(6, IW / data!.length * 0.55);
              const cx = M.l + x(i) - bw / 2;
              const hSil = (s.silvestre / maxCap) * IH;
              const hEst = (s.esteril   / maxCap) * IH;
              const topSil = M.t + IH - hSil;
              const topEst = topSil - hEst;
              return (
                <g key={s.sem_folio}>
                  {hSil > 0 && <rect x={cx} y={topSil} width={bw} height={hSil} className="fill-emerald-500" />}
                  {hEst > 0 && <rect x={cx} y={topEst} width={bw} height={hEst} className="fill-sky-500" />}
                  <text x={M.l + x(i)} y={M.t + IH + 16} textAnchor="middle" className="fill-slate-500 text-[10px]">{s.label}</text>
                </g>
              );
            })}
            {/* línea MTD */}
            <path d={pathMtd.replace(/M /g, 'M ' + M.l + ' ').replace(/L /g, 'L ' + M.l + ' ')} />
            <g transform={`translate(${M.l}, ${M.t})`}>
              <path d={pathMtd} className="fill-none stroke-rose-600" strokeWidth="2" />
              {data!.map((s, i) => (
                <circle key={s.sem_folio} cx={x(i)} cy={yMtd(s.mtd_estatal)} r="3" className="fill-rose-600" />
              ))}
            </g>
            {/* etiquetas ejes */}
            <text x={M.l}            y={M.t - 6} textAnchor="start" className="fill-slate-500 text-[10px] uppercase tracking-wider">Capturas</text>
            <text x={M.l + IW}       y={M.t - 6} textAnchor="end"   className="fill-rose-600 text-[10px] uppercase tracking-wider">MTD estatal</text>
          </svg>
          <div className="flex gap-4 text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            <span className="flex items-center gap-1"><span className="inline-block size-3 bg-emerald-500 rounded-sm" /> Silvestre</span>
            <span className="flex items-center gap-1"><span className="inline-block size-3 bg-sky-500 rounded-sm" /> Estéril</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-rose-600" /> MTD estatal (eje derecho)</span>
          </div>
        </div>
      )}
    </section>
  );
}

function SectionPorPfa({ data }: { data: PfaCap[] | null }) {
  const st = useSectionStatus('por-pfa');
  const loading = st === 'loading' || st === 'pending';
  const maxRev = useMemo(() => Math.max(1, ...(data ?? []).map((p) => p.revisiones_con_captura)), [data]);
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="leaderboard" className="text-amber-700 dark:text-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">Ranking PFA por capturas y frecuencia</h2>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-6 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Sin capturas por PFA en este rango.</p>
      ) : (
        <div className="animate-fade-in">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">PFA</th>
                <th className="px-2 py-2 text-left w-[40%]">Revisiones con captura</th>
                <th className="px-2 py-2 text-right">Silvestre</th>
                <th className="px-2 py-2 text-right">Estéril</th>
                <th className="px-2 py-2 text-right">Semanas / {(data[0]?.semanas_con_captura !== undefined) ? '' : ''}</th>
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
                        <div className="h-full bg-amber-500" style={{ width: `${(p.revisiones_con_captura / maxRev) * 100}%` }} />
                      </div>
                      <span className="tabular-nums text-xs w-12 text-right">{fInt(p.revisiones_con_captura)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{fInt(p.silvestre)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fInt(p.esteril)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-semibold">
                      {p.semanas_con_captura} sem
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

function SectionPorModulo({ data }: { data: ModuloCap[] | null }) {
  const st = useSectionStatus('por-modulo');
  const loading = st === 'loading' || st === 'pending';
  const maxTotal = (data ?? []).reduce((m, x) => Math.max(m, x.silvestre + x.esteril), 1);
  const maxMtd   = (data ?? []).reduce((m, x) => Math.max(m, x.mtd_modulo), 0.0001);
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="apartment" className="text-amber-700 dark:text-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">MTD y capturas por módulo</h2>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-6 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Sin capturas por módulo en este rango.</p>
      ) : (
        <div className="animate-fade-in overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Módulo</th>
                <th className="px-2 py-2 text-left w-[30%]">Capturas (silv+est)</th>
                <th className="px-2 py-2 text-right">Silvestre</th>
                <th className="px-2 py-2 text-right">Estéril</th>
                <th className="px-2 py-2 text-right">Huertos</th>
                <th className="px-2 py-2 text-left w-[20%]">MTD módulo</th>
              </tr>
            </thead>
            <tbody>
              {data.map((m, i) => {
                const total = m.silvestre + m.esteril;
                return (
                  <tr key={m.modulo_folio} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-2 tabular-nums text-slate-500">{i + 1}</td>
                    <td className="px-2 py-2 text-slate-900 dark:text-slate-100 font-medium">{m.nombre_modulo}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full bg-amber-500" style={{ width: `${(total / maxTotal) * 100}%` }} />
                        </div>
                        <span className="tabular-nums text-xs w-14 text-right">{fInt(total)}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{fInt(m.silvestre)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fInt(m.esteril)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fInt(m.huertos_con_captura)}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full bg-rose-500" style={{ width: `${(m.mtd_modulo / maxMtd) * 100}%` }} />
                        </div>
                        <span className="tabular-nums text-xs w-16 text-right">{fDec(m.mtd_modulo, 4)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
