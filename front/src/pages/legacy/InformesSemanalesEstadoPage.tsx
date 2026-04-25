import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ExportButton from '@/components/legacy/ExportButton';
import KpiBar, { type KpiItem } from '@/components/legacy/KpiBar';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import type { ExportColumn } from '@/lib/excelExport';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

// ───────────────────────── Types ─────────────────────────

interface SemanaOption {
  folio: number; no_semana: number | null; periodo: number | null;
  fecha_inicio: string | null; fecha_final: string | null; label: string;
}

interface ControlQuimicoRow {
  folio: number; fecha_aplicacion: string | null;
  numeroinscripcion: string | null; propietario: string | null; municipio: string | null;
  tipo_aplicacion_nombre: string | null;
  superficie: number; estaciones_cebo: number;
  proteina_lts: number; malathion_lts: number; agua_lts: number;
  observaciones: string | null;
}

interface ControlCulturalRow {
  folio: number; fecha: string | null;
  numeroinscripcion: string | null; propietario: string | null; municipio: string | null;
  hospedero_nombre: string | null;
  kgs_destruidos: number; no_arboles: number; has_rastreadas: number;
  observaciones: string | null;
}

interface MuestreoFrutosRow {
  folio: number; no_muestra: string | null;
  fecha_muestreo: string | null; fecha_diseccion: string | null;
  numeroinscripcion: string | null; propietario: string | null; municipio: string | null;
  hospedero_nombre: string | null;
  no_frutos: number; frutos_infestados: number;
  kgs_muestreados: number; kgs_disectados: number; larvas_por_kg: number;
  usuario: string | null;
}

interface ResponseBase<T> { semana: SemanaOption; rows: T[]; totales: Record<string, number> }

type Tab = 'quimico' | 'cultural' | 'muestreo';

// ───────────────────────── Page ─────────────────────────

export default function InformesSemanalesEstadoPage() {
  const { token, user } = useLegacyAuth();

  const [semanas, setSemanas] = useState<SemanaOption[]>([]);
  const [semana, setSemana]   = useState<number | null>(null);
  const [tab, setTab]         = useState<Tab>('quimico');

  const [cq, setCq] = useState<ResponseBase<ControlQuimicoRow> | null>(null);
  const [cc, setCc] = useState<ResponseBase<ControlCulturalRow> | null>(null);
  const [mf, setMf] = useState<ResponseBase<MuestreoFrutosRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSemanas, setLoadingSemanas] = useState(true);
  const [error, setError] = useState('');

  const cargarSemanas = useCallback(async () => {
    if (!token) return;
    setLoadingSemanas(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/reportes/informes-semanales/semanas-disponibles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const list = await res.json() as SemanaOption[];
        setSemanas(list);
        if (list.length > 0 && semana === null) setSemana(list[0].folio);
      }
    } finally { setLoadingSemanas(false); }
  }, [token, semana]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarSemanas(); }, [cargarSemanas]);

  const generar = async () => {
    if (!token || semana === null) return;
    setLoading(true);
    setError('');
    try {
      const h = { Authorization: `Bearer ${token}` };
      const [r1, r2, r3] = await Promise.all([
        fetch(`${API_BASE}/legacy/reportes/informes-semanales/control-quimico?semana=${semana}`, { headers: h }),
        fetch(`${API_BASE}/legacy/reportes/informes-semanales/control-cultural?semana=${semana}`, { headers: h }),
        fetch(`${API_BASE}/legacy/reportes/informes-semanales/muestreo-frutos?semana=${semana}`, { headers: h }),
      ]);
      if (!r1.ok || !r2.ok || !r3.ok) throw new Error('Error al cargar uno o más reportes');
      setCq(await r1.json());
      setCc(await r2.json());
      setMf(await r3.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setLoading(false); }
  };

  // KPIs según tab activo
  const kpis: KpiItem[] = useMemo(() => {
    if (tab === 'quimico' && cq) {
      return [
        { label: 'Aplicaciones',  value: cq.rows.length,                 icon: 'science', tone: 'amber' },
        { label: 'Superficie ha', value: cq.totales.superficie.toFixed(2), icon: 'forest', tone: 'amber' },
        { label: 'Estaciones cebo', value: cq.totales.estaciones_cebo,    icon: 'pin_drop', tone: 'slate' },
        { label: 'Proteína lts',  value: cq.totales.proteina_lts.toFixed(2), icon: 'water_drop', tone: 'emerald' },
        { label: 'Malathion lts', value: cq.totales.malathion_lts.toFixed(2), icon: 'sanitizer', tone: 'rose' },
      ];
    }
    if (tab === 'cultural' && cc) {
      return [
        { label: 'Acciones',        value: cc.rows.length,                       icon: 'agriculture', tone: 'amber' },
        { label: 'Kg destruidos',   value: cc.totales.kgs_destruidos.toFixed(2), icon: 'delete_sweep', tone: 'rose' },
        { label: 'Árboles derribados', value: cc.totales.no_arboles,             icon: 'park', tone: 'slate' },
        { label: 'Has rastreadas',  value: cc.totales.has_rastreadas.toFixed(2), icon: 'forest', tone: 'amber' },
      ];
    }
    if (tab === 'muestreo' && mf) {
      const lkg = mf.totales.kgs_muestreados > 0 ? (mf.totales.frutos_infestados / mf.totales.kgs_muestreados) : 0;
      return [
        { label: 'Muestras',       value: mf.rows.length,                          icon: 'science', tone: 'amber' },
        { label: 'No. frutos',     value: mf.totales.no_frutos,                    icon: 'eco', tone: 'amber' },
        { label: 'Infestados',     value: mf.totales.frutos_infestados, hint: mf.totales.no_frutos ? `${(mf.totales.frutos_infestados/mf.totales.no_frutos*100).toFixed(2)}%` : undefined, icon: 'bug_report', tone: 'rose' },
        { label: 'Kgs muestreados', value: mf.totales.kgs_muestreados.toFixed(2), icon: 'monitor_weight', tone: 'slate' },
        { label: 'Larvas / kg',    value: lkg.toFixed(4),                          icon: 'analytics', tone: lkg > 0 ? 'rose' : 'slate' },
      ];
    }
    return [];
  }, [tab, cq, cc, mf]);

  const sem = cq?.semana ?? cc?.semana ?? mf?.semana ?? null;
  const semHumano = sem ? sem.label : '';
  const fechaRango = sem?.fecha_inicio ? ` · ${sem.fecha_inicio} a ${sem.fecha_final}` : '';
  const stamp = new Date().toISOString().slice(0, 10);
  const baseSubtitle = (n: number, unidad: string) => `Semana ${semHumano}${fechaRango} · ${n} ${unidad}`;

  const colsQuimico: ExportColumn<ControlQuimicoRow>[] = useMemo(() => [
    { header: 'Fecha',          key: 'fecha_aplicacion',       format: 'date' },
    { header: 'Inscripción',    key: 'numeroinscripcion',      width: 18 },
    { header: 'Propietario',    key: 'propietario',            width: 28 },
    { header: 'Municipio',      key: 'municipio',              width: 18 },
    { header: 'Aplicación',     key: 'tipo_aplicacion_nombre', width: 14 },
    { header: 'Superficie (ha)', key: 'superficie',             format: 'decimal', totals: 'sum' },
    { header: 'Est. cebo',      key: 'estaciones_cebo',        format: 'integer', totals: 'sum' },
    { header: 'Proteína lts',   key: 'proteina_lts',           format: 'decimal', totals: 'sum' },
    { header: 'Malathion lts',  key: 'malathion_lts',          format: 'decimal', totals: 'sum' },
    { header: 'Agua lts',       key: 'agua_lts',               format: 'decimal', totals: 'sum' },
    { header: 'Observaciones',  key: 'observaciones',          width: 28 },
  ], []);
  const colsCultural: ExportColumn<ControlCulturalRow>[] = useMemo(() => [
    { header: 'Fecha',         key: 'fecha',             format: 'date' },
    { header: 'Inscripción',   key: 'numeroinscripcion', width: 18 },
    { header: 'Propietario',   key: 'propietario',       width: 28 },
    { header: 'Municipio',     key: 'municipio',         width: 18 },
    { header: 'Hospedero',     key: 'hospedero_nombre',  width: 14 },
    { header: 'Kg destruidos', key: 'kgs_destruidos',    format: 'decimal', totals: 'sum' },
    { header: 'Árboles',       key: 'no_arboles',        format: 'integer', totals: 'sum' },
    { header: 'Has rastreadas', key: 'has_rastreadas',    format: 'decimal', totals: 'sum' },
    { header: 'Observaciones', key: 'observaciones',     width: 28 },
  ], []);
  const colsMuestreo: ExportColumn<MuestreoFrutosRow>[] = useMemo(() => [
    { header: 'No. muestra',     key: 'no_muestra',         width: 22 },
    { header: 'Fecha muestreo',  key: 'fecha_muestreo',     format: 'date' },
    { header: 'Fecha disección', key: 'fecha_diseccion',    format: 'date' },
    { header: 'Inscripción',     key: 'numeroinscripcion',  width: 18 },
    { header: 'Municipio',       key: 'municipio',          width: 18 },
    { header: 'Hospedero',       key: 'hospedero_nombre',   width: 14 },
    { header: 'Frutos',          key: 'no_frutos',          format: 'integer', totals: 'sum' },
    { header: 'Infestados',      key: 'frutos_infestados',  format: 'integer', totals: 'sum' },
    { header: 'Kgs muestreados', key: 'kgs_muestreados',    format: 'decimal', totals: 'sum' },
    { header: 'Kgs disectados',  key: 'kgs_disectados',     format: 'decimal', totals: 'sum' },
    { header: 'Larvas/kg',       key: 'larvas_por_kg',      format: 'decimal' },
    { header: 'Usuario',         key: 'usuario',            width: 16 },
  ], []);

  const renderExport = () => {
    if (!sem) return null;
    if (tab === 'quimico' && cq) {
      return (
        <ExportButton<ControlQuimicoRow>
          filename={`informe-control-quimico_${user?.legacy_db ?? 'legacy'}_sem${sem.no_semana}-${sem.periodo}_${stamp}`}
          title={`Informe semanal de Control Químico — ${user?.nombre_estado ?? ''}`}
          subtitle={baseSubtitle(cq.rows.length, 'aplicaciones')}
          columns={colsQuimico}
          rows={cq.rows}
        />
      );
    }
    if (tab === 'cultural' && cc) {
      return (
        <ExportButton<ControlCulturalRow>
          filename={`informe-control-cultural_${user?.legacy_db ?? 'legacy'}_sem${sem.no_semana}-${sem.periodo}_${stamp}`}
          title={`Informe semanal de Control Cultural — ${user?.nombre_estado ?? ''}`}
          subtitle={baseSubtitle(cc.rows.length, 'acciones')}
          columns={colsCultural}
          rows={cc.rows}
        />
      );
    }
    if (tab === 'muestreo' && mf) {
      return (
        <ExportButton<MuestreoFrutosRow>
          filename={`informe-muestreo-frutos_${user?.legacy_db ?? 'legacy'}_sem${sem.no_semana}-${sem.periodo}_${stamp}`}
          title={`Informe semanal de Muestreo y Disección de Frutos — ${user?.nombre_estado ?? ''}`}
          subtitle={baseSubtitle(mf.rows.length, 'muestras')}
          columns={colsMuestreo}
          rows={mf.rows}
        />
      );
    }
    return null;
  };

  const yaGenerado = !!(cq || cc || mf);

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="summarize"
        title="Informes semanales SAGARPA"
        subtitle="Control químico, control cultural y muestreo de frutos por semana epidemiológica."
        estado={user?.nombre_estado}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 max-w-md">
            <label htmlFor="semana" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              Semana
            </label>
            <select
              id="semana"
              value={semana ?? ''}
              onChange={(e) => setSemana(e.target.value ? Number(e.target.value) : null)}
              disabled={loadingSemanas || semanas.length === 0}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              {loadingSemanas && <option>Cargando…</option>}
              {!loadingSemanas && semanas.length === 0 && <option>Sin semanas con datos</option>}
              {semanas.map((s) => (
                <option key={s.folio} value={s.folio}>
                  {s.label}{s.fecha_inicio ? ` · ${s.fecha_inicio} a ${s.fecha_final}` : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={generar}
            disabled={loading || semana === null}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium inline-flex items-center gap-2"
          >
            <Icon name={loading ? 'progress_activity' : 'play_arrow'} className={`text-base ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Generando…' : 'Generar reporte'}
          </button>
        </div>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icon name="error" className="text-red-500 text-lg shrink-0" /> {error}
        </div>
      )}

      {yaGenerado && (
        <>
          <KpiBar items={kpis} trailing={renderExport()} />

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <nav className="flex gap-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <TabBtn tab="quimico"  current={tab} setTab={setTab} icon="science"     label={`Control Químico (${cq?.rows.length ?? 0})`} />
              <TabBtn tab="cultural" current={tab} setTab={setTab} icon="agriculture" label={`Control Cultural (${cc?.rows.length ?? 0})`} />
              <TabBtn tab="muestreo" current={tab} setTab={setTab} icon="bug_report"  label={`Muestreo Frutos (${mf?.rows.length ?? 0})`} />
            </nav>

            <div className="overflow-x-auto max-h-[60vh]">
              {tab === 'quimico'  && cq && <TablaQuimico  rows={cq.rows} />}
              {tab === 'cultural' && cc && <TablaCultural rows={cc.rows} />}
              {tab === 'muestreo' && mf && <TablaMuestreo rows={mf.rows} />}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ───────────────────────── Sub-components ─────────────────────────

function TabBtn({ tab, current, setTab, icon, label }: { tab: Tab; current: Tab; setTab: (t: Tab) => void; icon: string; label: string }) {
  const active = tab === current;
  return (
    <button
      type="button"
      onClick={() => setTab(tab)}
      className={`px-4 py-3 text-sm font-medium inline-flex items-center gap-2 border-b-2 transition-colors ${
        active
          ? 'border-amber-600 text-amber-700 dark:text-amber-400 bg-white dark:bg-slate-900'
          : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      <Icon name={icon} className="text-base" />
      {label}
    </button>
  );
}

function TablaQuimico({ rows }: { rows: ControlQuimicoRow[] }) {
  if (rows.length === 0) return <p className="px-4 py-8 text-center text-slate-500">Sin aplicaciones químicas en esta semana.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
        <tr>
          <th className="px-3 py-2 text-left">Fecha</th>
          <th className="px-3 py-2 text-left">Inscripción · Municipio</th>
          <th className="px-3 py-2 text-left">Propietario</th>
          <th className="px-3 py-2 text-center">Aplicación</th>
          <th className="px-3 py-2 text-right">Sup. ha</th>
          <th className="px-3 py-2 text-right">Est. cebo</th>
          <th className="px-3 py-2 text-right">Prot. lts</th>
          <th className="px-3 py-2 text-right">Mal. lts</th>
          <th className="px-3 py-2 text-right">Agua lts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.folio} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td className="px-3 py-2 text-xs">{r.fecha_aplicacion ?? '—'}</td>
            <td className="px-3 py-2"><div className="font-mono text-xs">{r.numeroinscripcion ?? '—'}</div><div className="text-xs text-slate-500">{r.municipio ?? '—'}</div></td>
            <td className="px-3 py-2 text-xs">{r.propietario ?? '—'}</td>
            <td className="px-3 py-2 text-center text-xs">{r.tipo_aplicacion_nombre ?? '—'}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.superficie.toFixed(2)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.estaciones_cebo}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.proteina_lts.toFixed(2)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.malathion_lts.toFixed(2)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.agua_lts.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaCultural({ rows }: { rows: ControlCulturalRow[] }) {
  if (rows.length === 0) return <p className="px-4 py-8 text-center text-slate-500">Sin acciones de control cultural en esta semana. (Tabla legacy históricamente no llenada en producción.)</p>;
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
        <tr>
          <th className="px-3 py-2 text-left">Fecha</th>
          <th className="px-3 py-2 text-left">Inscripción · Municipio</th>
          <th className="px-3 py-2 text-left">Propietario</th>
          <th className="px-3 py-2 text-left">Hospedero</th>
          <th className="px-3 py-2 text-right">Kg destruidos</th>
          <th className="px-3 py-2 text-right">Árboles</th>
          <th className="px-3 py-2 text-right">Has rastreadas</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.folio} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td className="px-3 py-2 text-xs">{r.fecha ?? '—'}</td>
            <td className="px-3 py-2"><div className="font-mono text-xs">{r.numeroinscripcion ?? '—'}</div><div className="text-xs text-slate-500">{r.municipio ?? '—'}</div></td>
            <td className="px-3 py-2 text-xs">{r.propietario ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.hospedero_nombre ?? '—'}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.kgs_destruidos.toFixed(2)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.no_arboles}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.has_rastreadas.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaMuestreo({ rows }: { rows: MuestreoFrutosRow[] }) {
  if (rows.length === 0) return <p className="px-4 py-8 text-center text-slate-500">Sin muestreos en esta semana.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
        <tr>
          <th className="px-3 py-2 text-left">No. muestra</th>
          <th className="px-3 py-2 text-left">Fecha</th>
          <th className="px-3 py-2 text-left">Inscripción · Municipio</th>
          <th className="px-3 py-2 text-left">Hospedero</th>
          <th className="px-3 py-2 text-right">Frutos</th>
          <th className="px-3 py-2 text-right">Infestados</th>
          <th className="px-3 py-2 text-right">Kgs muest.</th>
          <th className="px-3 py-2 text-right">Larvas/kg</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const positivo = r.frutos_infestados > 0;
          return (
            <tr key={r.folio} className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 ${positivo ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''}`}>
              <td className="px-3 py-2 font-mono text-xs">{r.no_muestra ?? '—'}</td>
              <td className="px-3 py-2 text-xs">{r.fecha_muestreo ?? '—'}</td>
              <td className="px-3 py-2"><div className="font-mono text-xs">{r.numeroinscripcion ?? '—'}</div><div className="text-xs text-slate-500">{r.municipio ?? '—'}</div></td>
              <td className="px-3 py-2 text-xs">{r.hospedero_nombre ?? '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.no_frutos}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${positivo ? 'font-semibold text-rose-700 dark:text-rose-400' : ''}`}>{r.frutos_infestados}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.kgs_muestreados.toFixed(2)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${positivo ? 'font-semibold text-rose-700 dark:text-rose-400' : ''}`}>{r.larvas_por_kg.toFixed(4)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
