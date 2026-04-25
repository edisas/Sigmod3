import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ExportButton from '@/components/legacy/ExportButton';
import KpiBar, { type KpiItem } from '@/components/legacy/KpiBar';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import type { ExportColumn, SheetSpec } from '@/lib/excelExport';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

// ───────────────────────── Types ─────────────────────────

interface PfaInfo {
  folio: number;
  nombre: string | null;
  cedula: string | null;
  inicial: string | null;
}

interface RutaRow {
  folio: number;
  nombre_ruta: string | null;
  inicial_ruta: string | null;
  modulo_folio: number | null;
  modulo_nombre: string | null;
  fecha_primera_revision: string | null;
  descripcion: string | null;
  dia_revision: string | null;
  tipo_folio: string | null;
}

interface HuertoRow {
  numeroinscripcion: string;
  nombre_unidad: string | null;
  nombre_propietario: string | null;
  folio_ruta: number | null;
  nombre_ruta: string | null;
  especie_folio: number | null;
  especie_nombre: string | null;
  mercado_destino: number | null;
  mercado_nombre: string | null;
}

interface TrampaRow {
  folio: number;
  no_trampa: string | null;
  numeroinscripcion: string | null;
  folio_ruta: number | null;
  nombre_ruta: string | null;
  tipo_trampa: number | null;
  fecha_colocacion: string | null;
  fecha_ultima_revision: string | null;
}

interface InventarioResponse {
  pfa: PfaInfo;
  rutas: RutaRow[];
  huertos: HuertoRow[];
  trampas: TrampaRow[];
}

type Tab = 'rutas' | 'huertos' | 'trampas';

// ───────────────────────── Page ─────────────────────────

export default function InventarioPorPfaPage() {
  const { token, user } = useLegacyAuth();

  const [pfas, setPfas] = useState<PfaInfo[]>([]);
  const [pfaFolio, setPfaFolio] = useState<number | null>(null);
  const [data, setData] = useState<InventarioResponse | null>(null);
  const [loadingPfas, setLoadingPfas] = useState(true);
  const [loadingReporte, setLoadingReporte] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('rutas');

  const cargarPfas = useCallback(async () => {
    if (!token) return;
    setLoadingPfas(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/reportes/inventario-pfa/pfas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = (await res.json()) as PfaInfo[];
      setPfas(list);
      if (list.length > 0 && pfaFolio === null) setPfaFolio(list[0].folio);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar PFAs');
    } finally {
      setLoadingPfas(false);
    }
  }, [token, pfaFolio]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarPfas(); }, [cargarPfas]);

  const generar = useCallback(async () => {
    if (!token || !pfaFolio) return;
    setLoadingReporte(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/legacy/reportes/inventario-pfa?pfa=${pfaFolio}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as InventarioResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el reporte');
    } finally {
      setLoadingReporte(false);
    }
  }, [token, pfaFolio]);

  // KPIs
  const kpis: KpiItem[] = useMemo(() => {
    if (!data) return [];
    const huertosExp = data.huertos.filter((h) => h.mercado_destino === 1).length;
    const totalHuertos = data.huertos.length;
    return [
      { label: 'Rutas',    value: data.rutas.length,    icon: 'alt_route', tone: 'amber' },
      { label: 'Huertos',  value: totalHuertos,         icon: 'agriculture', tone: 'amber' },
      { label: 'Exportación', value: huertosExp, hint: totalHuertos ? `${Math.round(huertosExp/totalHuertos*100)}%` : undefined, icon: 'flight_takeoff', tone: 'emerald' },
      { label: 'Trampas instaladas', value: data.trampas.length, icon: 'track_changes', tone: 'slate' },
    ];
  }, [data]);

  const sheets: SheetSpec<RutaRow | HuertoRow | TrampaRow>[] = useMemo(() => {
    if (!data) return [];
    const colsRutas: ExportColumn<RutaRow>[] = [
      { header: 'Folio',                key: 'folio',                  width: 8 },
      { header: 'Nombre ruta',          key: 'nombre_ruta',            width: 24 },
      { header: 'Iniciales',            key: 'inicial_ruta',           width: 14 },
      { header: 'Módulo',               key: 'modulo_nombre',          width: 16 },
      { header: 'Tipo folio',           key: 'tipo_folio',             width: 10 },
      { header: 'Día revisión',         key: 'dia_revision',           width: 12 },
      { header: 'Fecha primera rev.',   key: 'fecha_primera_revision', format: 'date' },
      { header: 'Descripción',          key: 'descripcion',            width: 30 },
    ];
    const colsHuertos: ExportColumn<HuertoRow>[] = [
      { header: 'Inscripción',  key: 'numeroinscripcion',  width: 18 },
      { header: 'Huerto',       key: 'nombre_unidad',      width: 26 },
      { header: 'Propietario',  key: 'nombre_propietario', width: 28 },
      { header: 'Ruta',         key: 'nombre_ruta',        width: 18 },
      { header: 'Especie',      key: 'especie_nombre',     width: 14 },
      { header: 'Mercado',      key: 'mercado_nombre',     width: 12 },
    ];
    const colsTrampas: ExportColumn<TrampaRow>[] = [
      { header: 'Folio',            key: 'folio',                 width: 8 },
      { header: 'No. trampa',       key: 'no_trampa',             width: 22 },
      { header: 'Inscripción',      key: 'numeroinscripcion',     width: 18 },
      { header: 'Ruta',             key: 'nombre_ruta',           width: 18 },
      { header: 'Tipo',             key: 'tipo_trampa',           format: 'integer' },
      { header: 'Fecha colocación', key: 'fecha_colocacion',      format: 'date' },
      { header: 'Última revisión',  key: 'fecha_ultima_revision', format: 'date' },
    ];
    return [
      { sheetName: 'Rutas',   title: `Rutas activas — ${data.rutas.length}`,         columns: colsRutas   as ExportColumn<RutaRow | HuertoRow | TrampaRow>[],   rows: data.rutas   as (RutaRow | HuertoRow | TrampaRow)[] },
      { sheetName: 'Huertos', title: `Huertos en rutas — ${data.huertos.length}`,    columns: colsHuertos as ExportColumn<RutaRow | HuertoRow | TrampaRow>[], rows: data.huertos as (RutaRow | HuertoRow | TrampaRow)[] },
      { sheetName: 'Trampas', title: `Trampas instaladas — ${data.trampas.length}`,  columns: colsTrampas as ExportColumn<RutaRow | HuertoRow | TrampaRow>[], rows: data.trampas as (RutaRow | HuertoRow | TrampaRow)[] },
    ];
  }, [data]);

  const pfaSel = pfas.find((p) => p.folio === pfaFolio);
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="assignment"
        title="Inventario por PFA"
        subtitle="Rutas, huertos y trampas activas asignados a un Profesional Fitosanitario Autorizado."
        estado={user?.nombre_estado}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <label htmlFor="pfa" className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Seleccione PFA
        </label>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="relative flex-1 max-w-xl">
            <Icon name="badge" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
            <select
              id="pfa"
              value={pfaFolio ?? ''}
              onChange={(e) => { setPfaFolio(e.target.value ? Number(e.target.value) : null); setData(null); }}
              disabled={loadingPfas || pfas.length === 0}
              className="input-field pl-12 appearance-none w-full"
            >
              {loadingPfas && <option value="">Cargando PFAs...</option>}
              {!loadingPfas && pfas.length === 0 && <option value="">No hay PFAs con rutas</option>}
              {pfas.map((p) => (
                <option key={p.folio} value={p.folio}>
                  {p.inicial ? `${p.inicial} · ` : ''}{p.nombre}
                </option>
              ))}
            </select>
            <Icon name="expand_more" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={generar}
            disabled={loadingReporte || pfaFolio === null}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold whitespace-nowrap"
          >
            {loadingReporte ? (<><span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generando...</>)
                            : (<><Icon name="play_arrow" className="text-base" />Generar reporte</>)}
          </button>
        </div>
        {pfaSel && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {pfaSel.cedula && <>Cédula: <span className="font-mono">{pfaSel.cedula}</span> · </>}
            folio {pfaSel.folio}
          </p>
        )}
      </section>

      {error && !loadingReporte && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icon name="error" className="text-red-500 text-lg shrink-0" />
          {error}
        </div>
      )}

      {data && !loadingReporte && (
        <>
          <KpiBar
            items={kpis}
            trailing={
              <ExportButton
                filename={`inventario-pfa_${user?.legacy_db ?? 'legacy'}_pfa${data.pfa.folio}_${stamp}`}
                title={`Inventario por PFA — ${user?.nombre_estado ?? ''}`}
                subtitle={`${data.pfa.nombre ?? `Folio ${data.pfa.folio}`}${data.pfa.cedula ? ` (${data.pfa.cedula})` : ''} · Generado ${new Date().toLocaleString('es-MX')}`}
                sheets={sheets}
              />
            }
          />

          {/* Tabs */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <nav className="flex gap-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <TabBtn tab="rutas"   current={tab} setTab={setTab} icon="alt_route"     label={`Rutas (${data.rutas.length})`} />
              <TabBtn tab="huertos" current={tab} setTab={setTab} icon="agriculture"   label={`Huertos (${data.huertos.length})`} />
              <TabBtn tab="trampas" current={tab} setTab={setTab} icon="track_changes" label={`Trampas (${data.trampas.length})`} />
            </nav>

            <div className="overflow-x-auto max-h-[60vh]">
              {tab === 'rutas'   && <TablaRutas   rows={data.rutas}   />}
              {tab === 'huertos' && <TablaHuertos rows={data.huertos} />}
              {tab === 'trampas' && <TablaTrampas rows={data.trampas} />}
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

function TablaRutas({ rows }: { rows: RutaRow[] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-slate-500">Este PFA no tiene rutas activas.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
        <tr>
          <th className="px-3 py-2 text-left">Folio</th>
          <th className="px-3 py-2 text-left">Ruta</th>
          <th className="px-3 py-2 text-left">Módulo</th>
          <th className="px-3 py-2 text-left">Tipo folio</th>
          <th className="px-3 py-2 text-left">Día rev.</th>
          <th className="px-3 py-2 text-left">1ra revisión</th>
          <th className="px-3 py-2 text-left">Descripción</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.folio} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td className="px-3 py-2 font-mono text-xs">{r.folio}</td>
            <td className="px-3 py-2"><div className="font-medium">{r.nombre_ruta ?? '—'}</div><div className="text-xs text-slate-500">{r.inicial_ruta ?? ''}</div></td>
            <td className="px-3 py-2">{r.modulo_nombre ?? '—'}</td>
            <td className="px-3 py-2 font-mono text-xs">{r.tipo_folio ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.dia_revision ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.fecha_primera_revision ?? '—'}</td>
            <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{r.descripcion ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaHuertos({ rows }: { rows: HuertoRow[] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-slate-500">Sin huertos activos en las rutas.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
        <tr>
          <th className="px-3 py-2 text-left">Inscripción</th>
          <th className="px-3 py-2 text-left">Huerto</th>
          <th className="px-3 py-2 text-left">Propietario</th>
          <th className="px-3 py-2 text-left">Ruta</th>
          <th className="px-3 py-2 text-left">Especie</th>
          <th className="px-3 py-2 text-center">Mercado</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.numeroinscripcion} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td className="px-3 py-2 font-mono text-xs">{r.numeroinscripcion}</td>
            <td className="px-3 py-2">{r.nombre_unidad ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.nombre_propietario ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.nombre_ruta ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.especie_nombre ?? '—'}</td>
            <td className="px-3 py-2 text-center">
              <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                r.mercado_destino === 1 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
                r.mercado_destino === 2 ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' :
                                          'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                {r.mercado_nombre ?? '—'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaTrampas({ rows }: { rows: TrampaRow[] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-slate-500">Sin trampas activas.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
        <tr>
          <th className="px-3 py-2 text-left">Folio</th>
          <th className="px-3 py-2 text-left">No. trampa</th>
          <th className="px-3 py-2 text-left">Inscripción</th>
          <th className="px-3 py-2 text-left">Ruta</th>
          <th className="px-3 py-2 text-center">Tipo</th>
          <th className="px-3 py-2 text-left">Colocación</th>
          <th className="px-3 py-2 text-left">Última revisión</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.folio} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td className="px-3 py-2 font-mono text-xs">{r.folio}</td>
            <td className="px-3 py-2 font-mono text-xs">{r.no_trampa ?? '—'}</td>
            <td className="px-3 py-2 font-mono text-xs">{r.numeroinscripcion ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.nombre_ruta ?? '—'}</td>
            <td className="px-3 py-2 text-center text-xs">{r.tipo_trampa ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.fecha_colocacion ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.fecha_ultima_revision ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
