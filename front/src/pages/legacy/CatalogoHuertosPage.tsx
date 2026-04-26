import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ExportButton from '@/components/legacy/ExportButton';
import KpiBar, { type KpiItem } from '@/components/legacy/KpiBar';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import type { ExportColumn } from '@/lib/excelExport';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

interface PfaOption { folio: number; nombre: string | null; inicial: string | null }
interface RutaOption { folio: number; nombre_ruta: string | null; inicial_ruta: string | null }

interface HuertoListRow {
  numeroinscripcion: string;
  nombre_unidad: string | null;
  nombre_propietario: string | null;
  municipio: string | null; zona: string | null;
  folio_ruta: number | null; nombre_ruta: string | null;
  clave_pfa: number | null; pfa_nombre: string | null;
  clave_especie: number | null; especie_nombre: string | null;
  mercado_destino: number | null; mercado_nombre: string | null;
  aprobado_exportacion: number;
  status: string | null;
  temporada_ano: string | null;
}

interface HuertosPage {
  total: number; offset: number; limit: number;
  rows: HuertoListRow[];
}

interface HuertoDetalle extends HuertoListRow {
  direccion: string | null; telefono: string | null; ubicacion: string | null;
  cumple_023: string | null;
  observaciones_sv02: string | null;
  motivo_rechazo: string | null; fecha_rechazo: string | null;
  fecha_alta_sv01: string | null; fecha_alta_sv02: string | null;
  fecha_captura_datos: string | null;
  htl: string | null;
}

interface PatchBody {
  nombre_unidad?: string; nombre_propietario?: string;
  direccion?: string; telefono?: string; ubicacion?: string;
  municipio?: string; zona?: string;
  folio_ruta?: number;
  mercado_destino?: number; aprobado_exportacion?: number;
  observaciones_sv02?: string;
}

interface Toast { kind: 'ok' | 'err'; text: string }

const PAGE = 50;

export default function CatalogoHuertosPage() {
  const { token, user } = useLegacyAuth();

  // Filtros
  const [pfas, setPfas] = useState<PfaOption[]>([]);
  const [pfa, setPfa] = useState<number | null>(null);
  const [rutas, setRutas] = useState<RutaOption[]>([]);
  const [folioRuta, setFolioRuta] = useState<number | null>(null);
  const [mercado, setMercado] = useState<string>('');
  const [statusF, setStatusF] = useState<string>('A');
  const [busqueda, setBusqueda] = useState<string>('');

  const [page, setPage] = useState<HuertosPage>({ total: 0, offset: 0, limit: PAGE, rows: [] });
  const [loading, setLoading] = useState(false);
  const [loadingMas, setLoadingMas] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Edición
  const [seleccionado, setSeleccionado] = useState<HuertoDetalle | null>(null);
  const [draft, setDraft] = useState<PatchBody | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargarPfas = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/legacy/reportes/inventario-pfa/pfas`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setPfas(await res.json());
  }, [token]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarPfas(); }, [cargarPfas]);

  const cargarRutas = useCallback(async () => {
    if (!token || pfa === null) { setRutas([]); setFolioRuta(null); return; }
    const res = await fetch(`${API_BASE}/legacy/correcciones/rutas-por-pfa?pfa=${pfa}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      setRutas(await res.json());
      setFolioRuta(null);
    }
  }, [token, pfa]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarRutas(); }, [cargarRutas]);

  const cargar = useCallback(async (offset: number) => {
    if (!token) return;
    const append = offset > 0;
    if (append) setLoadingMas(true); else setLoading(true);
    try {
      const qs = new URLSearchParams({ offset: String(offset), limit: String(PAGE) });
      if (pfa !== null) qs.set('pfa', String(pfa));
      if (folioRuta !== null) qs.set('folio_ruta', String(folioRuta));
      if (mercado) qs.set('mercado_destino', mercado);
      if (statusF) qs.set('status', statusF);
      if (busqueda.trim().length >= 2) qs.set('busqueda', busqueda.trim());
      const res = await fetch(`${API_BASE}/legacy/catalogos/huertos?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HuertosPage = await res.json();
      setPage((prev) => append ? { ...data, rows: [...prev.rows, ...data.rows] } : data);
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally {
      if (append) setLoadingMas(false); else setLoading(false);
    }
  }, [token, pfa, folioRuta, mercado, statusF, busqueda]);

  const verDetalle = async (numeroinscripcion: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/legacy/catalogos/huertos/${encodeURIComponent(numeroinscripcion)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as HuertoDetalle;
      setSeleccionado(d);
      setDraft({
        nombre_unidad: d.nombre_unidad ?? '',
        nombre_propietario: d.nombre_propietario ?? '',
        direccion: d.direccion ?? '',
        telefono: d.telefono ?? '',
        ubicacion: d.ubicacion ?? '',
        municipio: d.municipio ?? '',
        zona: d.zona ?? '',
        folio_ruta: d.folio_ruta ?? undefined,
        mercado_destino: d.mercado_destino ?? undefined,
        aprobado_exportacion: d.aprobado_exportacion,
        observaciones_sv02: d.observaciones_sv02 ?? '',
      });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    }
  };

  const guardar = async () => {
    if (!token || !seleccionado || !draft) return;
    setGuardando(true);
    try {
      // Solo enviar campos cambiados
      const body: PatchBody = {};
      if (draft.nombre_unidad !== (seleccionado.nombre_unidad ?? '')) body.nombre_unidad = draft.nombre_unidad;
      if (draft.nombre_propietario !== (seleccionado.nombre_propietario ?? '')) body.nombre_propietario = draft.nombre_propietario;
      if (draft.direccion !== (seleccionado.direccion ?? '')) body.direccion = draft.direccion;
      if (draft.telefono !== (seleccionado.telefono ?? '')) body.telefono = draft.telefono;
      if (draft.ubicacion !== (seleccionado.ubicacion ?? '')) body.ubicacion = draft.ubicacion;
      if (draft.municipio !== (seleccionado.municipio ?? '')) body.municipio = draft.municipio;
      if (draft.zona !== (seleccionado.zona ?? '')) body.zona = draft.zona;
      if (draft.folio_ruta !== (seleccionado.folio_ruta ?? undefined)) body.folio_ruta = draft.folio_ruta;
      if (draft.mercado_destino !== (seleccionado.mercado_destino ?? undefined)) body.mercado_destino = draft.mercado_destino;
      if (draft.aprobado_exportacion !== seleccionado.aprobado_exportacion) body.aprobado_exportacion = draft.aprobado_exportacion;
      if (draft.observaciones_sv02 !== (seleccionado.observaciones_sv02 ?? '')) body.observaciones_sv02 = draft.observaciones_sv02;

      if (Object.keys(body).length === 0) {
        setToast({ kind: 'ok', text: 'Sin cambios.' });
        setSeleccionado(null);
        return;
      }

      const res = await fetch(`${API_BASE}/legacy/catalogos/huertos/${encodeURIComponent(seleccionado.numeroinscripcion)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(typeof detail === 'string' ? detail : 'Error');
      }
      const upd = await res.json() as HuertoDetalle;
      setSeleccionado(null);
      setDraft(null);
      // Refrescar la fila en la tabla
      setPage((prev) => ({
        ...prev,
        rows: prev.rows.map((r) => r.numeroinscripcion === upd.numeroinscripcion ? upd : r),
      }));
      setToast({ kind: 'ok', text: `Huerto ${upd.numeroinscripcion} actualizado.` });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally { setGuardando(false); }
  };

  const cambiarStatus = async (numeroinscripcion: string, accion: 'desactivar' | 'reactivar') => {
    if (!token) return;
    if (accion === 'desactivar' && !confirm(`Desactivar huerto ${numeroinscripcion}? Marca status='I' (soft delete).`)) return;
    try {
      const res = await fetch(`${API_BASE}/legacy/catalogos/huertos/${encodeURIComponent(numeroinscripcion)}/${accion}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const upd = await res.json() as HuertoDetalle;
      setPage((prev) => ({ ...prev, rows: prev.rows.map((r) => r.numeroinscripcion === upd.numeroinscripcion ? upd : r) }));
      if (seleccionado?.numeroinscripcion === numeroinscripcion) setSeleccionado(upd);
      setToast({ kind: 'ok', text: `Huerto ${upd.numeroinscripcion} ${accion === 'desactivar' ? 'desactivado' : 'reactivado'}.` });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    }
  };

  const kpis: KpiItem[] = useMemo(() => {
    if (page.total === 0) return [];
    const exp = page.rows.filter((r) => r.aprobado_exportacion === 1).length;
    return [
      { label: 'Huertos',         value: page.total,             icon: 'agriculture', tone: 'amber' },
      { label: 'Aprobados exp.',  value: exp, hint: `${Math.round(exp/page.rows.length*100)}% del visible`, icon: 'flight_takeoff', tone: 'emerald' },
      { label: 'Mostrando',       value: page.rows.length,       icon: 'visibility', tone: 'slate' },
    ];
  }, [page]);

  const cols: ExportColumn<HuertoListRow>[] = [
    { header: 'Inscripción',    key: 'numeroinscripcion',    width: 18 },
    { header: 'Huerto',         key: 'nombre_unidad',        width: 26 },
    { header: 'Propietario',    key: 'nombre_propietario',   width: 28 },
    { header: 'Municipio',      key: 'municipio',            width: 18 },
    { header: 'Zona',           key: 'zona',                 width: 14 },
    { header: 'Ruta',           key: 'nombre_ruta',          width: 18 },
    { header: 'PFA',            key: 'pfa_nombre',           width: 28 },
    { header: 'Especie',        key: 'especie_nombre',       width: 14 },
    { header: 'Mercado',        key: 'mercado_nombre',       width: 12 },
    { header: 'Apr. exp.',      key: 'aprobado_exportacion', format: 'integer' },
    { header: 'Status',         key: 'status',               width: 7 },
    { header: 'Temporada',      key: 'temporada_ano',        width: 10 },
  ];

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="agriculture"
        title="Catálogo legacy de huertos"
        subtitle="Vista, edición y desactivación de huertos sv01_sv02 con filtros por PFA, ruta, mercado y status."
        estado={user?.nombre_estado}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label htmlFor="pfa" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">PFA</label>
            <select id="pfa" value={pfa ?? ''} onChange={(e) => setPfa(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              <option value="">— Todos —</option>
              {pfas.map((p) => <option key={p.folio} value={p.folio}>{p.inicial ? `${p.inicial} · ` : ''}{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ruta" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Ruta</label>
            <select id="ruta" value={folioRuta ?? ''} onChange={(e) => setFolioRuta(e.target.value ? Number(e.target.value) : null)}
              disabled={pfa === null}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm disabled:opacity-50">
              <option value="">— Todas —</option>
              {rutas.map((r) => <option key={r.folio} value={r.folio}>{r.nombre_ruta}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="mer" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Mercado</label>
            <select id="mer" value={mercado} onChange={(e) => setMercado(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              <option value="">Todos</option>
              <option value="1">Exportación</option>
              <option value="2">Nacional</option>
            </select>
          </div>
          <div>
            <label htmlFor="st" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Status</label>
            <select id="st" value={statusF} onChange={(e) => setStatusF(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              <option value="A">Activos</option>
              <option value="I">Inactivos</option>
              <option value="">Todos</option>
            </select>
          </div>
          <div>
            <label htmlFor="q" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Búsqueda</label>
            <input id="q" type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="inscripción/nombre/propietario"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </div>
        </div>
        <div className="mt-3">
          <button type="button" onClick={() => void cargar(0)} disabled={loading}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium inline-flex items-center gap-2">
            <Icon name={loading ? 'progress_activity' : 'search'} className={`text-base ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </section>

      {page.total > 0 && (
        <KpiBar items={kpis} trailing={
          <ExportButton<HuertoListRow>
            filename={`huertos_${user?.legacy_db ?? 'legacy'}_${stamp}`}
            title={`Catálogo de huertos — ${user?.nombre_estado ?? ''}`}
            subtitle={`${page.total} huertos · status=${statusF || 'todos'}`}
            columns={cols} rows={page.rows}
          />
        } />
      )}

      {page.total > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
                <tr>
                  <th className="px-3 py-2 text-left">Inscripción · Huerto</th>
                  <th className="px-3 py-2 text-left">Propietario</th>
                  <th className="px-3 py-2 text-left">Municipio · Zona</th>
                  <th className="px-3 py-2 text-left">Ruta · PFA</th>
                  <th className="px-3 py-2 text-center">Especie</th>
                  <th className="px-3 py-2 text-center">Mercado</th>
                  <th className="px-3 py-2 text-center">Exp.</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((r) => (
                  <tr key={r.numeroinscripcion} className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 ${r.status === 'I' ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-2"><div className="font-mono text-xs">{r.numeroinscripcion}</div><div className="text-xs text-slate-500">{r.nombre_unidad ?? '—'}</div></td>
                    <td className="px-3 py-2 text-xs">{r.nombre_propietario ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{r.municipio ?? '—'}<div className="text-slate-500">{r.zona ?? ''}</div></td>
                    <td className="px-3 py-2 text-xs">{r.nombre_ruta ?? '—'}<div className="text-slate-500">{r.pfa_nombre ?? ''}</div></td>
                    <td className="px-3 py-2 text-center text-xs">{r.especie_nombre ?? '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                        r.mercado_destino === 1 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
                        r.mercado_destino === 2 ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' :
                                                  'bg-slate-100 text-slate-600'
                      }`}>{r.mercado_nombre ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-center"><Icon name={r.aprobado_exportacion === 1 ? 'check_circle' : 'remove_circle'} className={r.aprobado_exportacion === 1 ? 'text-emerald-600' : 'text-slate-400'} /></td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                        r.status === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
                        r.status === 'I' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                                           'bg-slate-100 text-slate-600'
                      }`}>{r.status ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => void verDetalle(r.numeroinscripcion)}
                        className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs inline-flex items-center gap-1">
                        <Icon name="edit" className="text-sm" /> Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page.rows.length < page.total && (
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-center">
              <button type="button" onClick={() => void cargar(page.rows.length)} disabled={loadingMas}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">
                {loadingMas ? 'Cargando…' : `Cargar más (${page.total - page.rows.length} restantes)`}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Drawer / Modal de edición */}
      {seleccionado && draft && (
        <DrawerEdicion
          huerto={seleccionado}
          draft={draft}
          setDraft={setDraft}
          rutas={rutas}
          guardando={guardando}
          onClose={() => { setSeleccionado(null); setDraft(null); }}
          onGuardar={() => void guardar()}
          onCambiarStatus={(accion) => void cambiarStatus(seleccionado.numeroinscripcion, accion)}
        />
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 max-w-lg p-3 pr-4 rounded-lg shadow-lg border text-sm flex items-start gap-2 cursor-pointer ${
          toast.kind === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-200'
                              : 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-900/30 dark:border-rose-700 dark:text-rose-200'
        }`} onClick={() => setToast(null)}>
          <Icon name={toast.kind === 'ok' ? 'check_circle' : 'error'} className="text-xl shrink-0 mt-0.5" /><span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

function DrawerEdicion({
  huerto, draft, setDraft, rutas, guardando, onClose, onGuardar, onCambiarStatus,
}: {
  huerto: HuertoDetalle; draft: PatchBody;
  setDraft: (d: PatchBody) => void;
  rutas: RutaOption[]; guardando: boolean;
  onClose: () => void;
  onGuardar: () => void;
  onCambiarStatus: (accion: 'desactivar' | 'reactivar') => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-end" role="dialog" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-l-xl shadow-2xl max-w-2xl w-full h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <Icon name="edit_location" className="text-amber-700 dark:text-amber-400 text-xl" />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">{huerto.nombre_unidad ?? huerto.numeroinscripcion}</h2>
            <p className="text-xs text-slate-500 font-mono">{huerto.numeroinscripcion}</p>
          </div>
          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
            huerto.status === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
                                    'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
          }`}>{huerto.status ?? '—'}</span>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"><Icon name="close" /></button>
        </header>

        <div className="p-5 space-y-4">
          {/* Datos no editables */}
          <details className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-sm" open>
            <summary className="text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer">Histórico (read-only)</summary>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <Item label="Especie" value={huerto.especie_nombre ?? '—'} />
              <Item label="Cumple NOM-023" value={huerto.cumple_023 ?? '—'} />
              <Item label="Fecha alta SV01" value={huerto.fecha_alta_sv01 ?? '—'} />
              <Item label="Fecha alta SV02" value={huerto.fecha_alta_sv02 ?? '—'} />
              <Item label="Captura datos" value={huerto.fecha_captura_datos ?? '—'} />
              <Item label="Temporada" value={huerto.temporada_ano ?? '—'} />
              {huerto.motivo_rechazo && <Item label="Motivo rechazo" value={huerto.motivo_rechazo} />}
            </dl>
          </details>

          {/* Editables */}
          <div className="space-y-3">
            <Field label="Nombre del huerto"
              value={draft.nombre_unidad ?? ''}
              onChange={(v) => setDraft({ ...draft, nombre_unidad: v })} />
            <Field label="Propietario"
              value={draft.nombre_propietario ?? ''}
              onChange={(v) => setDraft({ ...draft, nombre_propietario: v })} />
            <Field label="Dirección"
              value={draft.direccion ?? ''}
              onChange={(v) => setDraft({ ...draft, direccion: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Teléfono" value={draft.telefono ?? ''} onChange={(v) => setDraft({ ...draft, telefono: v })} />
              <Field label="Ubicación" value={draft.ubicacion ?? ''} onChange={(v) => setDraft({ ...draft, ubicacion: v })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Municipio" value={draft.municipio ?? ''} onChange={(v) => setDraft({ ...draft, municipio: v })} />
              <Field label="Zona" value={draft.zona ?? ''} onChange={(v) => setDraft({ ...draft, zona: v })} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">Ruta</label>
              <select value={draft.folio_ruta ?? ''} onChange={(e) => setDraft({ ...draft, folio_ruta: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                <option value="">— Sin ruta —</option>
                {rutas.map((r) => <option key={r.folio} value={r.folio}>{r.nombre_ruta}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">Mercado destino</label>
                <select value={draft.mercado_destino ?? ''} onChange={(e) => setDraft({ ...draft, mercado_destino: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                  <option value="">— No definido —</option>
                  <option value="1">Exportación</option>
                  <option value="2">Nacional</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">Aprobado exportación</label>
                <select value={draft.aprobado_exportacion ?? 0} onChange={(e) => setDraft({ ...draft, aprobado_exportacion: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                  <option value={0}>No</option>
                  <option value={1}>Sí</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">Observaciones SV02</label>
              <textarea value={draft.observaciones_sv02 ?? ''} onChange={(e) => setDraft({ ...draft, observaciones_sv02: e.target.value })}
                rows={3} maxLength={200}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
            </div>
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-900 flex items-center gap-2 flex-wrap">
          <button type="button" onClick={onGuardar} disabled={guardando}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-semibold inline-flex items-center gap-2">
            <Icon name={guardando ? 'progress_activity' : 'save'} className={`text-base ${guardando ? 'animate-spin' : ''}`} />
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {huerto.status === 'A' ? (
            <button type="button" onClick={() => onCambiarStatus('desactivar')}
              className="px-3 py-2 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-sm inline-flex items-center gap-1">
              <Icon name="block" /> Desactivar
            </button>
          ) : (
            <button type="button" onClick={() => onCambiarStatus('reactivar')}
              className="px-3 py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-sm inline-flex items-center gap-1">
              <Icon name="restart_alt" /> Reactivar
            </button>
          )}
          <button type="button" onClick={onClose} className="ml-auto px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm">
            Cancelar
          </button>
        </footer>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
    </div>
  );
}
