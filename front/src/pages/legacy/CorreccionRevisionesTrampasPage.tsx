import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth } from '@/context/LegacyAuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const STATUS_REVISADA_CON_CAPTURA = 2;

// ───────────────────────── Types ─────────────────────────

interface PfaRow     { folio: number; nombre: string; inicial: string | null; cedula: string | null }
interface RutaPfaRow { folio: number; nombre_ruta: string | null; inicial_ruta: string | null; modulo_nombre: string | null }
interface SemanaRow  { no_semana: number; revisiones: number }

interface CatalogoItem { folio: number; nombre: string }
interface Catalogos    { status_revision: CatalogoItem[]; productos: CatalogoItem[]; especies: CatalogoItem[] }

interface Identificacion {
  tipo_especie: number;
  hembras_silvestre: number;
  machos_silvestre: number;
  hembras_esteril: number;
  machos_esteril: number;
}

interface RevisionRow {
  folio: number;
  no_trampa: string;
  no_semana: number;
  fecha_revision: string | null;
  status_revision: number | null;
  tipo_producto: number | null;
  dias_exposicion: number | null;
  observaciones: string | null;
  validado: string | null;
  numeroinscripcion: string | null;
  tmimf_o_bloqueo: boolean;
  tmimf_o_folio: string | null;
  identificacion: Identificacion | null;
  identificacion_multiple: boolean;
}

interface DiasExposicionPreview {
  fecha_anterior: string | null;
  semana_anterior: number | null;
  dias_exposicion: number | null;
}

interface Draft {
  fecha_revision: string;
  status_revision: number;
  tipo_producto: number | null;
  dias_exposicion: number;
  validado: 'S' | 'N';
  identificacion: Identificacion;
}

interface Toast { kind: 'ok' | 'err' | 'warn'; text: string }

// ───────────────────────── Page ─────────────────────────

export default function CorreccionRevisionesTrampasPage() {
  const { token, user } = useLegacyAuth();

  const [pfas, setPfas]       = useState<PfaRow[]>([]);
  const [rutas, setRutas]     = useState<RutaPfaRow[]>([]);
  const [semanas, setSemanas] = useState<SemanaRow[]>([]);
  const [revisiones, setRevisiones] = useState<RevisionRow[]>([]);
  const [catalogos, setCatalogos]   = useState<Catalogos | null>(null);

  const [pfaId, setPfaId]         = useState<number | null>(null);
  const [rutaId, setRutaId]       = useState<number | null>(null);
  const [semana, setSemana]       = useState<number | null>(null);

  const [cargando, setCargando]   = useState(false);
  const [cargandoRevs, setCargandoRevs] = useState(false);

  const [editingFolio, setEditingFolio] = useState<number | null>(null);
  const [draft, setDraft]               = useState<Draft | null>(null);
  const [preview, setPreview]           = useState<DiasExposicionPreview | null>(null);
  const [guardando, setGuardando]       = useState(false);
  const [toast, setToast]               = useState<Toast | null>(null);

  // ── Carga inicial (PFAs + catalogos) ──────────────────
  useEffect(() => {
    if (!token) return;
    (async () => {
      setCargando(true);
      try {
        const h = { Authorization: `Bearer ${token}` };
        const [pfasRes, catRes] = await Promise.all([
          fetch(`${API_BASE}/legacy/catalogos/pfas`, { headers: h }),
          fetch(`${API_BASE}/legacy/correcciones/catalogos`, { headers: h }),
        ]);
        if (pfasRes.ok) setPfas(await pfasRes.json());
        if (catRes.ok)  setCatalogos(await catRes.json());
      } finally {
        setCargando(false);
      }
    })();
  }, [token]);

  // ── Carga rutas al cambiar PFA ─────────────────────────
  useEffect(() => {
    if (!token || pfaId === null) { setRutas([]); setRutaId(null); setSemanas([]); setSemana(null); return; }
    (async () => {
      const res = await fetch(`${API_BASE}/legacy/correcciones/rutas-por-pfa?pfa=${pfaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const rs = (await res.json()) as RutaPfaRow[];
        setRutas(rs);
        setRutaId(null);
        setSemanas([]);
        setSemana(null);
      }
    })();
  }, [token, pfaId]);

  // ── Carga semanas al cambiar ruta ──────────────────────
  useEffect(() => {
    if (!token || rutaId === null) { setSemanas([]); setSemana(null); return; }
    (async () => {
      const res = await fetch(`${API_BASE}/legacy/correcciones/semanas-por-ruta?ruta=${rutaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const ss = (await res.json()) as SemanaRow[];
        setSemanas(ss);
        setSemana(null);
        setRevisiones([]);
      }
    })();
  }, [token, rutaId]);

  // ── Carga revisiones al cambiar semana ─────────────────
  const cargarRevisiones = async () => {
    if (!token || rutaId === null || semana === null) return;
    setCargandoRevs(true);
    setEditingFolio(null); setDraft(null);
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/revisiones?ruta=${rutaId}&semana=${semana}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudieron cargar las revisiones');
      setRevisiones(await res.json());
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally {
      setCargandoRevs(false);
    }
  };
  useEffect(() => { void cargarRevisiones(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [semana]);

  // ── Helpers de edición ─────────────────────────────────
  const startEdit = (r: RevisionRow) => {
    if (r.tmimf_o_bloqueo) {
      setToast({
        kind: 'warn',
        text: `Bloqueado: TMIMF operativa ${r.tmimf_o_folio} ya fue emitida para el huerto ${r.numeroinscripcion} en la semana ${r.no_semana}.`,
      });
      return;
    }
    if (r.identificacion_multiple) {
      setToast({
        kind: 'warn',
        text: 'Esta revisión tiene múltiples especies capturadas. Corrige en SIGMOD 2 directamente (V3 MVP soporta una sola especie).',
      });
      return;
    }
    setEditingFolio(r.folio);
    setDraft({
      fecha_revision:  r.fecha_revision ?? '',
      status_revision: r.status_revision ?? 1,
      tipo_producto:   r.tipo_producto,
      dias_exposicion: r.dias_exposicion ?? 0,
      validado:        (r.validado === 'S' ? 'S' : 'N'),
      identificacion:  r.identificacion ?? { tipo_especie: 0, hembras_silvestre: 0, machos_silvestre: 0, hembras_esteril: 0, machos_esteril: 0 },
    });
    setPreview(null);
  };
  const cancelEdit = () => { setEditingFolio(null); setDraft(null); setPreview(null); };

  // ── Preview de días de exposición al cambiar fecha ────
  const actualizarPreviewDias = async (r: RevisionRow, nuevaFecha: string) => {
    if (!token || !draft) return;
    if (!nuevaFecha) { setPreview(null); return; }
    try {
      const qs = `no_trampa=${encodeURIComponent(r.no_trampa)}&semana=${r.no_semana}&fecha=${nuevaFecha}`;
      const res = await fetch(`${API_BASE}/legacy/correcciones/dias-exposicion-preview?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const pv = (await res.json()) as DiasExposicionPreview;
        setPreview(pv);
        if (pv.dias_exposicion !== null && pv.dias_exposicion !== undefined) {
          setDraft({ ...draft, fecha_revision: nuevaFecha, dias_exposicion: pv.dias_exposicion });
          return;
        }
      }
    } catch { /* silencioso */ }
    setDraft({ ...draft, fecha_revision: nuevaFecha });
  };

  // ── Guardar ────────────────────────────────────────────
  const guardar = async (r: RevisionRow) => {
    if (!draft || !token) return;
    // Diff contra la revisión
    const body: Record<string, unknown> = {};
    if (draft.fecha_revision && draft.fecha_revision !== r.fecha_revision) body.fecha_revision = draft.fecha_revision;
    if (draft.status_revision !== r.status_revision)                       body.status_revision = draft.status_revision;
    if (draft.tipo_producto !== r.tipo_producto)                           body.tipo_producto = draft.tipo_producto;
    if (draft.dias_exposicion !== r.dias_exposicion)                       body.dias_exposicion = draft.dias_exposicion;
    if (draft.validado !== (r.validado === 'S' ? 'S' : 'N'))               body.validado = draft.validado;

    const entraA2 = draft.status_revision === STATUS_REVISADA_CON_CAPTURA && r.status_revision !== STATUS_REVISADA_CON_CAPTURA;
    const manteneEn2 = draft.status_revision === STATUS_REVISADA_CON_CAPTURA && r.status_revision === STATUS_REVISADA_CON_CAPTURA;

    if (entraA2) {
      if (!draft.identificacion.tipo_especie) {
        setToast({ kind: 'err', text: 'Selecciona la especie identificada antes de guardar.' });
        return;
      }
      body.identificacion = draft.identificacion;
    } else if (manteneEn2) {
      // incluir identificacion solo si hubo cambios contra el original
      const o = r.identificacion;
      const d = draft.identificacion;
      const cambio =
        !o ||
        o.tipo_especie !== d.tipo_especie ||
        o.hembras_silvestre !== d.hembras_silvestre ||
        o.machos_silvestre !== d.machos_silvestre ||
        o.hembras_esteril !== d.hembras_esteril ||
        o.machos_esteril !== d.machos_esteril;
      if (cambio) {
        if (!d.tipo_especie) { setToast({ kind: 'err', text: 'Selecciona la especie identificada.' }); return; }
        body.identificacion = d;
      }
    }

    if (Object.keys(body).length === 0) { cancelEdit(); return; }

    setGuardando(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/revisiones/${r.folio}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        const { detail } = await res.json().catch(() => ({ detail: 'Conflicto' }));
        setToast({ kind: 'err', text: detail });
        return;
      }
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(typeof detail === 'string' ? detail : 'Error al guardar');
      }
      const result = await res.json();
      const identOp = result?.cambios_identificacion?.op ?? 'noop';
      const identMsg =
        identOp === 'insert' ? ' · identificación registrada' :
        identOp === 'update' ? ' · identificación actualizada' :
        identOp === 'delete' ? ' · identificación eliminada' : '';
      setToast({ kind: 'ok', text: `Revisión ${r.folio} actualizada${identMsg}` });
      cancelEdit();
      await cargarRevisiones();
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally {
      setGuardando(false);
    }
  };

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  const statusNombre = (folio: number | null | undefined): string => {
    if (folio === null || folio === undefined || !catalogos) return '—';
    return catalogos.status_revision.find((s) => s.folio === folio)?.nombre ?? `#${folio}`;
  };
  const productoNombre = (folio: number | null | undefined): string => {
    if (folio === null || folio === undefined || !catalogos) return '—';
    return catalogos.productos.find((p) => p.folio === folio)?.nombre ?? `#${folio}`;
  };

  const semanaDetalle = useMemo(
    () => semanas.find((s) => s.no_semana === semana),
    [semanas, semana],
  );

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          Corrección de revisiones de trampas
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Ajusta fecha, status, producto, días de exposición, validación e identificación —{' '}
          <span className="font-semibold text-amber-700 dark:text-amber-400">{user?.nombre_estado}</span>
        </p>
      </div>

      {/* Selectores en cascada */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* PFA */}
          <div>
            <label htmlFor="pfa" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              1. PFA
            </label>
            <select
              id="pfa"
              value={pfaId ?? ''}
              onChange={(e) => setPfaId(e.target.value ? Number(e.target.value) : null)}
              disabled={cargando}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">— Selecciona un PFA —</option>
              {pfas.map((p) => (
                <option key={p.folio} value={p.folio}>
                  {p.inicial ? `${p.inicial} · ` : ''}{p.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Ruta */}
          <div>
            <label htmlFor="ruta" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              2. Ruta
            </label>
            <select
              id="ruta"
              value={rutaId ?? ''}
              onChange={(e) => setRutaId(e.target.value ? Number(e.target.value) : null)}
              disabled={pfaId === null || rutas.length === 0}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">— Selecciona una ruta —</option>
              {rutas.map((r) => (
                <option key={r.folio} value={r.folio}>
                  {r.inicial_ruta ? `${r.inicial_ruta} · ` : ''}{r.nombre_ruta}
                  {r.modulo_nombre ? ` (${r.modulo_nombre})` : ''}
                </option>
              ))}
            </select>
            {pfaId !== null && rutas.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Este PFA no tiene rutas asignadas.</p>
            )}
          </div>

          {/* Semana */}
          <div>
            <label htmlFor="semana" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              3. Semana
            </label>
            <select
              id="semana"
              value={semana ?? ''}
              onChange={(e) => setSemana(e.target.value ? Number(e.target.value) : null)}
              disabled={rutaId === null || semanas.length === 0}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">— Selecciona una semana —</option>
              {semanas.map((s) => (
                <option key={s.no_semana} value={s.no_semana}>
                  Semana {s.no_semana} · {s.revisiones} revisiones
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Tabla de revisiones */}
      {rutaId !== null && semana !== null && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
            <Icon name="checklist" className="text-amber-700 dark:text-amber-400 text-lg" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
              Semana {semana} · {semanaDetalle?.revisiones ?? revisiones.length} revisiones
            </h2>
            {cargandoRevs && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
                <span className="size-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                Cargando...
              </span>
            )}
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 dark:bg-slate-800/30 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Trampa</th>
                  <th className="px-3 py-2 text-left">Huerto</th>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Producto</th>
                  <th className="px-3 py-2 text-right">Días exp.</th>
                  <th className="px-3 py-2 text-center">Validado</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {revisiones.map((r) => {
                  const isEditing = editingFolio === r.folio;
                  const bloqueado = r.tmimf_o_bloqueo;
                  return (
                    <>
                      <tr
                        key={r.folio}
                        className={`border-t border-slate-100 dark:border-slate-800 ${
                          isEditing ? 'bg-amber-50/60 dark:bg-amber-900/10' :
                          bloqueado ? 'bg-slate-50/60 dark:bg-slate-800/30 opacity-75' : ''
                        }`}
                      >
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.no_trampa.trim()}</td>
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                          {r.numeroinscripcion ?? '—'}
                          {bloqueado && (
                            <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" title={`TMIMF ${r.tmimf_o_folio}`}>
                              TMIMF O · {r.tmimf_o_folio}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing && draft ? (
                            <input
                              type="date"
                              value={draft.fecha_revision}
                              onChange={(e) => void actualizarPreviewDias(r, e.target.value)}
                              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                            />
                          ) : (r.fecha_revision ?? '—')}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing && draft ? (
                            <select
                              value={draft.status_revision}
                              onChange={(e) => setDraft({ ...draft, status_revision: Number(e.target.value) })}
                              className="w-full min-w-[180px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                            >
                              {catalogos?.status_revision.map((s) => (
                                <option key={s.folio} value={s.folio}>{s.folio} · {s.nombre}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`text-xs ${r.status_revision === 2 ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''}`}>
                              {statusNombre(r.status_revision)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing && draft ? (
                            <select
                              value={draft.tipo_producto ?? ''}
                              onChange={(e) => setDraft({ ...draft, tipo_producto: e.target.value ? Number(e.target.value) : null })}
                              className="w-full min-w-[150px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                            >
                              <option value="">—</option>
                              {catalogos?.productos.map((p) => (
                                <option key={p.folio} value={p.folio}>{p.nombre}</option>
                              ))}
                            </select>
                          ) : (<span className="text-xs">{productoNombre(r.tipo_producto)}</span>)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {isEditing && draft ? (
                            <div className="flex flex-col items-end">
                              <input
                                type="number"
                                min={0}
                                max={90}
                                value={draft.dias_exposicion}
                                onChange={(e) => setDraft({ ...draft, dias_exposicion: Number(e.target.value) })}
                                className="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-right"
                              />
                              {preview?.fecha_anterior && (
                                <span className="text-[10px] text-slate-500 mt-0.5 text-right whitespace-nowrap" title={`Revisión anterior: ${preview.fecha_anterior} (sem ${preview.semana_anterior})`}>
                                  prev: {preview.fecha_anterior} · {preview.dias_exposicion}d
                                </span>
                              )}
                            </div>
                          ) : (r.dias_exposicion ?? '—')}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isEditing && draft ? (
                            <select
                              value={draft.validado}
                              onChange={(e) => setDraft({ ...draft, validado: e.target.value === 'S' ? 'S' : 'N' })}
                              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                            >
                              <option value="N">No</option>
                              <option value="S">Sí</option>
                            </select>
                          ) : (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                              r.validado === 'S'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                            }`}>{r.validado === 'S' ? 'Sí' : 'No'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void guardar(r)}
                                disabled={guardando}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60"
                              >
                                <Icon name="save" className="text-sm" /> Guardar
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={guardando}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs ml-2"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(r)}
                              disabled={editingFolio !== null || bloqueado}
                              title={bloqueado ? `TMIMF operativa ${r.tmimf_o_folio} ya emitida — bloqueado` : undefined}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Icon name={bloqueado ? 'lock' : 'edit'} className="text-sm" />
                              {bloqueado ? 'Bloqueada' : 'Editar'}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Sub-form de identificación cuando status=2 en edición */}
                      {isEditing && draft && draft.status_revision === STATUS_REVISADA_CON_CAPTURA && (
                        <tr key={`${r.folio}-ident`} className="bg-emerald-50/40 dark:bg-emerald-900/10 border-t border-emerald-100 dark:border-emerald-900/30">
                          <td colSpan={8} className="px-3 py-3">
                            <div className="flex items-start gap-3 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 whitespace-nowrap">
                                <Icon name="bug_report" className="text-sm" /> Identificación
                              </span>
                              <div className="flex items-center gap-2 flex-wrap">
                                <label className="text-xs text-slate-600 dark:text-slate-400">Especie</label>
                                <select
                                  value={draft.identificacion.tipo_especie}
                                  onChange={(e) => setDraft({ ...draft, identificacion: { ...draft.identificacion, tipo_especie: Number(e.target.value) } })}
                                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs min-w-[200px]"
                                >
                                  <option value={0}>— Selecciona —</option>
                                  {catalogos?.especies.map((es) => (
                                    <option key={es.folio} value={es.folio}>{es.folio} · {es.nombre}</option>
                                  ))}
                                </select>
                              </div>
                              <IntField label="♀ silvestre" value={draft.identificacion.hembras_silvestre} onChange={(v) => setDraft({ ...draft, identificacion: { ...draft.identificacion, hembras_silvestre: v } })} />
                              <IntField label="♂ silvestre" value={draft.identificacion.machos_silvestre}  onChange={(v) => setDraft({ ...draft, identificacion: { ...draft.identificacion, machos_silvestre:  v } })} />
                              <IntField label="♀ estéril"  value={draft.identificacion.hembras_esteril}   onChange={(v) => setDraft({ ...draft, identificacion: { ...draft.identificacion, hembras_esteril:   v } })} />
                              <IntField label="♂ estéril"  value={draft.identificacion.machos_esteril}    onChange={(v) => setDraft({ ...draft, identificacion: { ...draft.identificacion, machos_esteril:    v } })} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {!cargandoRevs && revisiones.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                      No hay revisiones para esta ruta y semana.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 max-w-lg p-3 pr-4 rounded-lg shadow-lg border text-sm animate-fade-in flex items-start gap-2 ${
          toast.kind === 'ok'   ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-200' :
          toast.kind === 'warn' ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200'              :
                                  'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-900/30 dark:border-rose-700 dark:text-rose-200'
        }`}>
          <Icon name={toast.kind === 'ok' ? 'check_circle' : toast.kind === 'warn' ? 'warning' : 'error'} className="text-xl shrink-0 mt-0.5" />
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

function IntField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
      {label}
      <input
        type="number"
        min={0}
        max={9999}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-20 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-right tabular-nums"
      />
    </label>
  );
}
