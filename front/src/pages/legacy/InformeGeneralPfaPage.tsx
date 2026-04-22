import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth } from '@/context/LegacyAuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const MAX_SEMANAS_RANGO = 4;

// ───────────────────────── Types ─────────────────────────

interface PfaOption { folio: number; nombre: string; cedula: string | null; label: string }
interface SemanaOption { folio: number; no_semana: number; periodo: number; label: string }

interface Huertos { huertos_atendidos: number; superficie_ha: number; huertos_alta_prevalencia: number; huertos_baja_prevalencia: number; huertos_nula_prevalencia: number }
interface Trampeo { trampas_instaladas_total: number; semanas_en_rango: number; trampas_instaladas_x_semanas: number; trampas_revisadas: number; porcentaje_revisadas: number; trampas_con_mosca_fertil: number; trampas_con_mosca_esteril: number; dias_exposicion_promedio: number; mtd_region: number }
interface Muestreo { muestreos_tomados: number; muestreos_con_larva: number; larvas_por_kg: number; kg_fruta_muestreada: number }
interface Hallazgo { numeroinscripcion: string; no_trampa: string; no_semana: number; fecha_revision: string | null; status_revision: number }
interface Hallazgos { total: number; items: Hallazgo[] }
interface ControlQuimico { hectareas_asperjadas: number; litros_asperjados: number; estaciones_cebo: number; huertos_con_control: number }
interface ControlCultural { kgs_destruidos: number; arboles_eliminados: number; hectareas_rastreadas: number }
interface Generalidades { tmimf_emitidas: number; toneladas_movilizadas: number; embarques_exportacion: number; embarques_nacional: number; toneladas_exportacion: number; toneladas_nacional: number }

type PhaseKey = 'huertos' | 'trampeo' | 'muestreo' | 'control-quimico' | 'control-cultural' | 'generalidades';
type PhaseStatus = 'pending' | 'loading' | 'done' | 'error';

interface PhaseDef {
  key: PhaseKey;
  roman: string;
  label: string;
  icon: string;
  endpoint: string;
}

const PHASES: PhaseDef[] = [
  { key: 'huertos',         roman: 'I',   label: 'Huertos atendidos',         icon: 'forest',            endpoint: 'huertos' },
  { key: 'trampeo',         roman: 'II',  label: 'Trampeo',                    icon: 'track_changes',     endpoint: 'trampeo' },
  { key: 'muestreo',        roman: 'III', label: 'Muestreo de frutos',        icon: 'science',           endpoint: 'muestreo' },
  { key: 'control-quimico', roman: 'IV',  label: 'Control químico',           icon: 'sanitizer',         endpoint: 'control-quimico' },
  { key: 'control-cultural',roman: 'V',   label: 'Control mecánico-cultural', icon: 'agriculture',       endpoint: 'control-cultural' },
  { key: 'generalidades',   roman: 'VI',  label: 'Generalidades (TMIMF)',     icon: 'local_shipping',    endpoint: 'generalidades' },
];

// ───────────────────────── Helpers de formato ─────────────

const fInt = (n: number | undefined): string =>
  (n ?? 0).toLocaleString('es-MX');
const fDec = (n: number | undefined, digits = 4): string =>
  (n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fTon = (n: number | undefined): string =>
  (n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fPct = (n: number | undefined): string =>
  `${(n ?? 0).toFixed(2)}%`;

// ───────────────────────── Componente ─────────────────────

export default function InformeGeneralPfaPage() {
  const { token, user } = useLegacyAuth();
  const [pfas, setPfas] = useState<PfaOption[]>([]);
  const [semanas, setSemanas] = useState<SemanaOption[]>([]);
  const [pfaFolio, setPfaFolio] = useState<number | null>(null);
  const [semIni, setSemIni] = useState<number | null>(null);
  const [semFin, setSemFin] = useState<number | null>(null);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [generando, setGenerando] = useState(false);

  const [phaseStatus, setPhaseStatus] = useState<Record<PhaseKey, PhaseStatus>>({
    'huertos': 'pending',
    'trampeo': 'pending',
    'muestreo': 'pending',
    'control-quimico': 'pending',
    'control-cultural': 'pending',
    'generalidades': 'pending',
  });
  const [phaseError, setPhaseError] = useState<Partial<Record<PhaseKey, string>>>({});

  const [seccionHuertos, setSeccionHuertos] = useState<Huertos | null>(null);
  const [seccionTrampeo, setSeccionTrampeo] = useState<Trampeo | null>(null);
  const [seccionMuestreo, setSeccionMuestreo] = useState<Muestreo | null>(null);
  const [seccionQuimico, setSeccionQuimico] = useState<ControlQuimico | null>(null);
  const [seccionCultural, setSeccionCultural] = useState<ControlCultural | null>(null);
  const [seccionGeneralidades, setSeccionGeneralidades] = useState<Generalidades | null>(null);
  const [hallazgos, setHallazgos] = useState<Hallazgos | null>(null);
  const [sinActividad, setSinActividad] = useState(false);

  const [contexto, setContexto] = useState<{ pfa: PfaOption; sIni: SemanaOption; sFin: SemanaOption } | null>(null);
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [rangoError, setRangoError] = useState('');
  const [duracionReporteMs, setDuracionReporteMs] = useState<number | null>(null);
  const [pdfRestanteMs, setPdfRestanteMs] = useState<number | null>(null);
  const pdfIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generationIdRef = useRef(0);

  // Carga inicial de catálogos
  useEffect(() => {
    if (!token) return;
    const load = async () => {
      setLoadingCatalogs(true);
      try {
        const [pfaRes, semRes] = await Promise.all([
          fetch(`${API_BASE}/legacy/reportes/huertos-por-pfa/pfas`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE}/legacy/reportes/semanas-disponibles`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (pfaRes.ok) {
          const list = (await pfaRes.json()) as PfaOption[];
          setPfas(list);
          if (list.length > 0) setPfaFolio(list[0].folio);
        }
        if (semRes.ok) {
          const list = (await semRes.json()) as SemanaOption[];
          setSemanas(list);
          if (list.length > 0) {
            setSemFin(list[0].folio);
            setSemIni(list[Math.min(MAX_SEMANAS_RANGO - 1, list.length - 1)].folio);
          }
        }
      } finally {
        setLoadingCatalogs(false);
      }
    };
    void load();
  }, [token]);

  const resetData = () => {
    setSeccionHuertos(null); setSeccionTrampeo(null); setSeccionMuestreo(null);
    setSeccionQuimico(null); setSeccionCultural(null); setSeccionGeneralidades(null);
    setHallazgos(null);
    setSinActividad(false);
    setPhaseStatus({
      'huertos': 'pending', 'trampeo': 'pending', 'muestreo': 'pending',
      'control-quimico': 'pending', 'control-cultural': 'pending', 'generalidades': 'pending',
    });
    setPhaseError({});
    setContexto(null);
    setRangoError('');
  };

  const handleSelectChange = () => {
    if (contexto || sinActividad) resetData();
  };

  // Cuántas semanas cubre el rango (solo si ambas están en el catálogo)
  const semanasEnRango = (() => {
    if (semIni === null || semFin === null) return 0;
    const ini = semanas.find((s) => s.folio === semIni);
    const fin = semanas.find((s) => s.folio === semFin);
    if (!ini || !fin) return 0;
    // semanas.folio es cronológico (a más folio, más reciente)
    if (ini.folio > fin.folio) return 0;
    return fin.folio - ini.folio + 1;
  })();

  const seleccionCompleta = semIni !== null && semFin !== null;
  const rangoExcedido = seleccionCompleta && semanasEnRango > MAX_SEMANAS_RANGO;
  const rangoInvalido = seleccionCompleta && semanasEnRango <= 0;

  const handleGenerar = async () => {
    if (!token || pfaFolio === null || semIni === null || semFin === null) return;
    if (rangoInvalido) {
      setRangoError('La semana inicial debe ser anterior o igual a la final.');
      return;
    }
    if (rangoExcedido) {
      setRangoError(`El rango no puede exceder ${MAX_SEMANAS_RANGO} semanas (seleccionaste ${semanasEnRango}).`);
      return;
    }
    const pfaSel = pfas.find((p) => p.folio === pfaFolio);
    const sIniSel = semanas.find((s) => s.folio === semIni);
    const sFinSel = semanas.find((s) => s.folio === semFin);
    if (!pfaSel || !sIniSel || !sFinSel) return;

    resetData();
    setContexto({ pfa: pfaSel, sIni: sIniSel, sFin: sFinSel });
    setGenerando(true);
    setDuracionReporteMs(null);

    const qs = `pfa_folio=${pfaFolio}&semana_inicio=${semIni}&semana_fin=${semFin}`;
    const t0 = performance.now();
    const myGenId = ++generationIdRef.current;

    try {
      // Gate: ¿tiene actividad?
      try {
        const r = await fetch(`${API_BASE}/legacy/reportes/informe-general/tiene-actividad?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const { tiene_actividad } = (await r.json()) as { tiene_actividad: boolean };
          if (!tiene_actividad) {
            setSinActividad(true);
            return;
          }
        }
      } catch {
        // si el gate falla, seguimos y dejamos que los endpoints propios reporten
      }

      // Marca todos en loading
      setPhaseStatus({
        'huertos': 'loading', 'trampeo': 'loading', 'muestreo': 'loading',
        'control-quimico': 'loading', 'control-cultural': 'loading', 'generalidades': 'loading',
      });

      const fetchPhase = async <T,>(phase: PhaseKey, ep: string, setter: (d: T) => void) => {
        try {
          const res = await fetch(`${API_BASE}/legacy/reportes/informe-general/${ep}?${qs}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({} as { detail?: string }));
            throw new Error(body.detail ?? `HTTP ${res.status}`);
          }
          const data = (await res.json()) as T;
          setter(data);
          setPhaseStatus((prev) => ({ ...prev, [phase]: 'done' }));
        } catch (err) {
          setPhaseStatus((prev) => ({ ...prev, [phase]: 'error' }));
          setPhaseError((prev) => ({ ...prev, [phase]: err instanceof Error ? err.message : 'Error' }));
        }
      };

      // Hallazgos se dispara en paralelo pero NO bloquea el render del resultado:
      // cuando resuelva se inyecta la sección. Guardamos la generación para descartar
      // respuestas obsoletas si el usuario vuelve a generar con otros parámetros.
      fetch(`${API_BASE}/legacy/reportes/informe-general/hallazgos-trampeo?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: Hallazgos | null) => {
          if (data && generationIdRef.current === myGenId) setHallazgos(data);
        })
        .catch(() => { /* silencioso */ });

      await Promise.all([
        fetchPhase<Huertos>('huertos', 'huertos', setSeccionHuertos),
        fetchPhase<Trampeo>('trampeo', 'trampeo', setSeccionTrampeo),
        fetchPhase<Muestreo>('muestreo', 'muestreo', setSeccionMuestreo),
        fetchPhase<ControlQuimico>('control-quimico', 'control-quimico', setSeccionQuimico),
        fetchPhase<ControlCultural>('control-cultural', 'control-cultural', setSeccionCultural),
        fetchPhase<Generalidades>('generalidades', 'generalidades', setSeccionGeneralidades),
      ]);
    } finally {
      // Garantiza que el botón siempre vuelve al estado original,
      // aunque alguna fase haya tirado un error no capturado.
      setGenerando(false);
      setDuracionReporteMs(performance.now() - t0);
    }
  };

  const handleDescargarPdf = async () => {
    if (!token || !contexto) return;
    setDescargandoPdf(true);

    // ETA: asumimos que el PDF tarda ~lo mismo que la generación en pantalla.
    // Fallback razonable si por alguna razón no tenemos medición previa.
    const estimateMs = Math.max(duracionReporteMs ?? 5000, 2000);
    const startedAt = performance.now();
    setPdfRestanteMs(estimateMs);
    pdfIntervalRef.current = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setPdfRestanteMs(Math.max(0, estimateMs - elapsed));
    }, 100);

    try {
      const qs = `pfa_folio=${contexto.pfa.folio}&semana_inicio=${contexto.sIni.folio}&semana_fin=${contexto.sFin.folio}`;
      const res = await fetch(`${API_BASE}/legacy/reportes/informe-general/pdf?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { detail?: string }));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `informe-general-pfa_${contexto.pfa.folio}_sem${contexto.sIni.no_semana}-${contexto.sFin.no_semana}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al descargar PDF');
    } finally {
      if (pdfIntervalRef.current) {
        clearInterval(pdfIntervalRef.current);
        pdfIntervalRef.current = null;
      }
      setPdfRestanteMs(null);
      setDescargandoPdf(false);
    }
  };

  // Limpia el interval si el componente se desmonta mientras descarga
  useEffect(() => {
    return () => {
      if (pdfIntervalRef.current) clearInterval(pdfIntervalRef.current);
    };
  }, []);

  const phasesDone = Object.values(phaseStatus).filter((s) => s === 'done').length;
  const phasesTotal = PHASES.length;
  const progressPct = (phasesDone / phasesTotal) * 100;

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          Informe general por PFA
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Reporte consolidado de actividad de un PFA en un rango de semanas —{' '}
          <span className="font-semibold text-amber-700 dark:text-amber-400">{user?.nombre_estado}</span>
        </p>
      </div>

      {/* Selectores */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="pfa" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              PFA
            </label>
            <select
              id="pfa"
              value={pfaFolio ?? ''}
              onChange={(e) => { setPfaFolio(Number(e.target.value)); setRangoError(''); handleSelectChange(); }}
              disabled={loadingCatalogs || generando}
              className="input-field"
            >
              {pfas.map((p) => (
                <option key={p.folio} value={p.folio}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sini" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              Semana inicial
            </label>
            <select
              id="sini"
              value={semIni ?? ''}
              onChange={(e) => { setSemIni(Number(e.target.value)); setRangoError(''); handleSelectChange(); }}
              disabled={loadingCatalogs || generando}
              className="input-field"
            >
              {semanas.slice().reverse().map((s) => (
                <option key={s.folio} value={s.folio}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sfin" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              Semana final
            </label>
            <select
              id="sfin"
              value={semFin ?? ''}
              onChange={(e) => { setSemFin(Number(e.target.value)); setRangoError(''); handleSelectChange(); }}
              disabled={loadingCatalogs || generando}
              className="input-field"
            >
              {semanas.map((s) => (
                <option key={s.folio} value={s.folio}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleGenerar}
            disabled={generando || loadingCatalogs || pfaFolio === null || semIni === null || semFin === null || rangoExcedido || rangoInvalido}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold"
          >
            {generando ? (
              <>
                <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Icon name="play_arrow" className="text-base" />
                Generar informe
              </>
            )}
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Rango seleccionado: <span className={`font-semibold tabular-nums ${rangoExcedido ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
              {semanasEnRango > 0 ? `${semanasEnRango} ${semanasEnRango === 1 ? 'semana' : 'semanas'}` : '—'}
            </span> · máximo {MAX_SEMANAS_RANGO}
          </span>
        </div>
        {!loadingCatalogs && (rangoExcedido || rangoInvalido || rangoError) && (
          <div className="mt-3 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <Icon name="error" className="text-rose-500 text-base shrink-0" />
            {rangoError || (rangoExcedido
              ? `El rango no puede exceder ${MAX_SEMANAS_RANGO} semanas (seleccionaste ${semanasEnRango}).`
              : 'La semana inicial debe ser anterior o igual a la final.')}
          </div>
        )}
      </section>

      {/* Barra de progreso por fase */}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {PHASES.map((p) => {
              const st = phaseStatus[p.key];
              const colorBg =
                st === 'done' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                st === 'loading' ? 'bg-amber-100 dark:bg-amber-900/30' :
                st === 'error' ? 'bg-red-100 dark:bg-red-900/30' :
                'bg-slate-100 dark:bg-slate-800';
              const colorFg =
                st === 'done' ? 'text-emerald-700 dark:text-emerald-400' :
                st === 'loading' ? 'text-amber-700 dark:text-amber-400' :
                st === 'error' ? 'text-red-700 dark:text-red-400' :
                'text-slate-400 dark:text-slate-500';
              return (
                <div
                  key={p.key}
                  className={`rounded-lg p-3 ${colorBg} transition-colors flex flex-col items-center text-center gap-1`}
                  title={phaseError[p.key] ?? ''}
                >
                  <div className={`${colorFg} relative`}>
                    {st === 'loading' ? (
                      <span className="inline-block size-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                    ) : (
                      <Icon
                        name={st === 'done' ? 'check_circle' : st === 'error' ? 'error' : p.icon}
                        className="text-2xl"
                      />
                    )}
                  </div>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${colorFg}`}>{p.roman}</p>
                  <p className="text-[11px] leading-tight font-medium text-slate-700 dark:text-slate-300">{p.label}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Sin actividad */}
      {contexto && sinActividad && !generando && (
        <section className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 p-6 text-center">
          <Icon name="info" className="text-amber-600 text-4xl mb-2 inline-block" />
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {contexto.pfa.nombre} no tiene TMIMF emitida en este período.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {contexto.sIni.label} → {contexto.sFin.label}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
            Sin información disponible para generar el informe.
          </p>
        </section>
      )}

      {/* Resultado del informe (se muestra cuando termina, sin importar si alguna fase tuvo error) */}
      {contexto && !sinActividad && !generando && (
        <InformeResultado
          contexto={contexto}
          huertos={seccionHuertos}
          trampeo={seccionTrampeo}
          muestreo={seccionMuestreo}
          quimico={seccionQuimico}
          cultural={seccionCultural}
          generalidades={seccionGeneralidades}
          hallazgos={hallazgos}
          onDescargarPdf={handleDescargarPdf}
          descargandoPdf={descargandoPdf}
          pdfRestanteMs={pdfRestanteMs}
        />
      )}
    </div>
  );
}

// ───────────────────────── Resultado ─────────────────────

interface ResultadoProps {
  contexto: { pfa: PfaOption; sIni: SemanaOption; sFin: SemanaOption };
  huertos: Huertos | null;
  trampeo: Trampeo | null;
  muestreo: Muestreo | null;
  quimico: ControlQuimico | null;
  cultural: ControlCultural | null;
  generalidades: Generalidades | null;
  hallazgos: Hallazgos | null;
  onDescargarPdf: () => void;
  descargandoPdf: boolean;
  pdfRestanteMs: number | null;
}

const STATUS_REV_LABEL: Record<number, string> = {
  1: 'Revisada', 2: 'Con captura', 6: 'Extemporánea',
};

function InformeResultado({ contexto, huertos, trampeo, muestreo, quimico, cultural, generalidades, hallazgos, onDescargarPdf, descargandoPdf, pdfRestanteMs }: ResultadoProps) {
  return (
    <>
      <section className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 p-4 sm:p-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-amber-800 dark:text-amber-300 font-semibold mb-1">PFA evaluado</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{contexto.pfa.nombre}</p>
          {contexto.pfa.cedula && <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{contexto.pfa.cedula}</p>}
          <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">
            Rango: <strong>{contexto.sIni.label}</strong> → <strong>{contexto.sFin.label}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={onDescargarPdf}
          disabled={descargandoPdf}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-90 disabled:cursor-not-allowed text-white text-sm font-semibold whitespace-nowrap min-w-[220px] justify-center"
        >
          {descargandoPdf ? (
            <>
              <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {pdfRestanteMs !== null && pdfRestanteMs > 500
                ? <>Generando PDF · <span className="tabular-nums">{Math.ceil(pdfRestanteMs / 1000)}s</span></>
                : 'Finalizando PDF...'}
            </>
          ) : (
            <>
              <Icon name="picture_as_pdf" className="text-base" />
              Descargar PDF
            </>
          )}
        </button>
      </section>

      {/* I */}
      <Card roman="I" titulo="Huertos atendidos" icon="forest">
        <Fila c="Huertos atendidos"          u="Huertos"    v={fInt(huertos?.huertos_atendidos)} />
        <Fila c="I.1 Superficie atendida"    u="Hectáreas"  v={fDec(huertos?.superficie_ha)} />
        <Fila c="I.2 Huertos en alta prevalencia"  u="Huertos" v={fInt(huertos?.huertos_alta_prevalencia)} />
        <Fila c="I.3 Huertos en baja prevalencia"  u="Huertos" v={fInt(huertos?.huertos_baja_prevalencia)} />
        <Fila c="I.4 Huertos en nula prevalencia"  u="Huertos" v={fInt(huertos?.huertos_nula_prevalencia)} />
      </Card>

      {/* II */}
      <Card roman="II" titulo="Trampeo" icon="track_changes">
        <Fila c="II.1 Trampas instaladas"        u="Trampas"  v={`${fInt(trampeo?.trampas_instaladas_total)} × ${trampeo?.semanas_en_rango ?? 0} sem = ${fInt(trampeo?.trampas_instaladas_x_semanas)}`} />
        <Fila c="II.2 Trampas revisadas"         u="Trampas"  v={fInt(trampeo?.trampas_revisadas)} />
        <Fila c="II.3 Porcentaje de revisadas"   u="%"        v={fPct(trampeo?.porcentaje_revisadas)} />
        <Fila c="II.4 Trampas con mosca fértil"  u="Trampas"  v={fInt(trampeo?.trampas_con_mosca_fertil)} />
        <Fila c="II.5 Trampas con mosca estéril" u="Trampas"  v={fInt(trampeo?.trampas_con_mosca_esteril)} />
        <Fila c="II.6 Días de exposición (prom)" u="Días"     v={(trampeo?.dias_exposicion_promedio ?? 0).toFixed(2)} />
        <Fila c="II.7 MTD región"                u="MTD"      v={fDec(trampeo?.mtd_region)} highlight />
      </Card>

      {/* III */}
      <Card roman="III" titulo="Muestreo de frutos" icon="science">
        <Fila c="III.1 Muestreos tomados"         u="Muestreos" v={fInt(muestreo?.muestreos_tomados)} />
        <Fila c="III.2 Muestreos con larva"       u="Muestreos" v={fInt(muestreo?.muestreos_con_larva)} />
        <Fila c="III.3 Larvas / kilogramo (suma)" u="L/KG"      v={fDec(muestreo?.larvas_por_kg, 2)} />
        <Fila c="III.4 Kg fruta muestreada"       u="Kg"        v={fDec(muestreo?.kg_fruta_muestreada, 2)} />
      </Card>

      {/* IV */}
      <Card roman="IV" titulo="Control químico" icon="sanitizer">
        <Fila c="IV.1 Hectáreas asperjadas"  u="Hectáreas"  v={fDec(quimico?.hectareas_asperjadas)} />
        <Fila c="IV.2 Litros asperjados"     u="Litros"     v={(quimico?.litros_asperjados ?? 0).toFixed(2)} />
        <Fila c="IV.3 Estaciones cebo"       u="Estaciones" v={fInt(quimico?.estaciones_cebo)} />
        <Fila c="IV.4 Huertos con control"   u="Huertos"    v={fInt(quimico?.huertos_con_control)} />
      </Card>

      {/* V */}
      <Card roman="V" titulo="Control mecánico-cultural" icon="agriculture">
        <Fila c="V.1 Kgs de frutos destruidos" u="Kg"         v={(cultural?.kgs_destruidos ?? 0).toFixed(2)} />
        <Fila c="V.2 Árboles eliminados"       u="Árboles"    v={fInt(cultural?.arboles_eliminados)} />
        <Fila c="V.3 Hectáreas rastreadas"     u="Hectáreas"  v={fDec(cultural?.hectareas_rastreadas)} />
      </Card>

      {/* VI */}
      <Card roman="VI" titulo="Generalidades (TMIMF)" icon="local_shipping">
        <Fila c="VI.1 TMIMF emitidas"                  u="Emitidas"   v={fInt(generalidades?.tmimf_emitidas)} />
        <Fila c="VI.2 Toneladas movilizadas"            u="Toneladas"  v={fTon(generalidades?.toneladas_movilizadas)} />
        <Fila c="VI.3 Embarques para exportación"       u="Embarques"  v={fInt(generalidades?.embarques_exportacion)} />
        <Fila c="VI.4 Embarques para mercado nacional"  u="Embarques"  v={fInt(generalidades?.embarques_nacional)} />
        <Fila c="VI.5 Toneladas exportación"            u="Toneladas"  v={fTon(generalidades?.toneladas_exportacion)} />
        <Fila c="VI.6 Toneladas nacional"               u="Toneladas"  v={fTon(generalidades?.toneladas_nacional)} />
      </Card>

      {/* Hallazgos (solo si hay) */}
      {hallazgos && hallazgos.total > 0 && (
        <section className="rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/10 overflow-hidden">
          <header className="px-5 py-3 border-b border-rose-200 dark:border-rose-800 bg-rose-100/60 dark:bg-rose-900/20 flex items-start gap-3">
            <Icon name="warning" className="text-rose-600 text-xl shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-rose-900 dark:text-rose-200 uppercase tracking-wide">
                Hallazgos: trampeo sin TMIMF asociada
              </h2>
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                {hallazgos.total} revisión{hallazgos.total !== 1 ? 'es' : ''} de trampeo sin TMIMF tipo 'O' correspondiente para el huerto y semana.
              </p>
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-rose-50 dark:bg-rose-900/20 text-rose-900 dark:text-rose-200 text-xs">
                  <th className="px-3 py-2 text-center font-semibold">Semana</th>
                  <th className="px-3 py-2 text-left font-semibold">Huerto (inscripción)</th>
                  <th className="px-3 py-2 text-center font-semibold">Trampa</th>
                  <th className="px-3 py-2 text-center font-semibold">Fecha revisión</th>
                  <th className="px-3 py-2 text-center font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {hallazgos.items.map((h, i) => (
                  <tr key={`${h.no_semana}-${h.numeroinscripcion}-${h.no_trampa}-${i}`}
                      className={`border-t border-rose-100 dark:border-rose-900/40 ${i % 2 === 1 ? 'bg-rose-50/50 dark:bg-rose-950/20' : ''}`}>
                    <td className="px-3 py-1.5 text-center tabular-nums">{h.no_semana}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{h.numeroinscripcion}</td>
                    <td className="px-3 py-1.5 text-center font-mono text-xs">{h.no_trampa}</td>
                    <td className="px-3 py-1.5 text-center text-xs">{h.fecha_revision ?? '—'}</td>
                    <td className="px-3 py-1.5 text-center text-xs">{STATUS_REV_LABEL[h.status_revision] ?? h.status_revision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Card({ roman, titulo, icon, children }: { roman: string; titulo: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
        <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Icon name={icon} className="text-amber-700 dark:text-amber-400 text-lg" />
        </div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
          <span className="text-amber-700 dark:text-amber-400 mr-2">{roman}.</span>{titulo}
        </h2>
      </header>
      <table className="w-full text-sm">
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

function Fila({ c, u, v, highlight = false }: { c: string; u: string; v: string; highlight?: boolean }) {
  return (
    <tr className={`border-t border-slate-100 dark:border-slate-800 ${highlight ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
      <td className="px-5 py-2.5 text-slate-700 dark:text-slate-300">{c}</td>
      <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{u}</td>
      <td className="px-5 py-2.5 text-right font-semibold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">{v}</td>
    </tr>
  );
}
