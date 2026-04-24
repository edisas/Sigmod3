import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth } from '@/context/LegacyAuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

// ───────────────────────── Types ─────────────────────────

interface PfaConRutasRow { folio: number; nombre: string; inicial: string | null; rutas_count: number }
interface RutaPfaRow     { folio: number; nombre_ruta: string | null; inicial_ruta: string | null; modulo_nombre: string | null }
interface TipoTrampaRow  { folio: number; nombre: string }

interface TrampaRow {
  folio: number;
  no_trampa: string;
  numeroinscripcion: string | null;
  nombre_huerto: string | null;
  ruta_nombre: string | null;
  ruta_inicial: string | null;
  tipo_trampa: number | null;
  fecha_ultima_revision: string | null;
  fecha_colocacion: string | null;
  status: string | null;
}

interface PreviewEliminar {
  permitido: boolean;
  motivo_bloqueo: string | null;
  revisiones_afectadas: number;
  identificaciones_afectadas: number;
  tmimf_o_recalculadas: number;
  trampas_activas_restantes_huerto: number;
}

interface Draft {
  no_trampa: string;
  fecha_ultima_revision: string;
  tipo_trampa: number | null;
}

interface Toast { kind: 'ok' | 'err' | 'warn'; text: string }

// ───────────────────────── Page ─────────────────────────

export default function CorreccionTrampasPage() {
  const { token, user } = useLegacyAuth();

  const [pfas, setPfas]       = useState<PfaConRutasRow[]>([]);
  const [rutas, setRutas]     = useState<RutaPfaRow[]>([]);
  const [trampas, setTrampas] = useState<TrampaRow[]>([]);
  const [tipos, setTipos]     = useState<TipoTrampaRow[]>([]);

  const [pfaId, setPfaId]   = useState<number | null>(null);
  const [rutaId, setRutaId] = useState<number | null>(null);

  const [cargando, setCargando]     = useState(false);
  const [cargandoTr, setCargandoTr] = useState(false);

  const [editingFolio, setEditingFolio] = useState<number | null>(null);
  const [draft, setDraft]               = useState<Draft | null>(null);
  const [guardando, setGuardando]       = useState(false);

  const [confirmDel, setConfirmDel] = useState<{ trampa: TrampaRow; preview: PreviewEliminar } | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [toast, setToast]           = useState<Toast | null>(null);

  // ── Carga inicial ──────────────────────────────────────
  // Patrón legítimo de "cargar en mount/cambio de token"; la regla v6
  // sobre-marca setState síncronos en useEffect.
  useEffect(() => {
    if (!token) return;
    (async () => {
      setCargando(true);
      try {
        const h = { Authorization: `Bearer ${token}` };
        const [pfasRes, tiposRes] = await Promise.all([
          fetch(`${API_BASE}/legacy/correcciones/pfas-con-rutas`, { headers: h }),
          fetch(`${API_BASE}/legacy/correcciones/catalogo-tipos-trampa`, { headers: h }),
        ]);
        if (pfasRes.ok)  setPfas(await pfasRes.json());
        if (tiposRes.ok) setTipos(await tiposRes.json());
      } finally { setCargando(false); }
    })();
  }, [token]);

  // Rutas al cambiar PFA
  // Reset + carga al cambiar PFA; la regla v6 sobre-marca setState síncronos.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!token || pfaId === null) { setRutas([]); setRutaId(null); setTrampas([]); return; }
    (async () => {
      const res = await fetch(`${API_BASE}/legacy/correcciones/rutas-por-pfa?pfa=${pfaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { setRutas(await res.json()); setRutaId(null); setTrampas([]); }
    })();
  }, [token, pfaId]);

  // Trampas al cambiar ruta
  const cargarTrampas = useCallback(async () => {
    if (!token || rutaId === null) return;
    setCargandoTr(true);
    setEditingFolio(null); setDraft(null);
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/trampas-por-ruta?ruta=${rutaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudieron cargar las trampas');
      setTrampas(await res.json());
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally { setCargandoTr(false); }
  }, [token, rutaId]);
  // Carga al cambiar ruta; la regla v6 sobre-marca setState síncronos.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarTrampas(); }, [cargarTrampas]);

  // ── Edición inline ─────────────────────────────────────
  const startEdit = (t: TrampaRow) => {
    setEditingFolio(t.folio);
    setDraft({
      no_trampa:             (t.no_trampa ?? '').trim(),
      fecha_ultima_revision: t.fecha_ultima_revision ?? '',
      tipo_trampa:           t.tipo_trampa,
    });
  };
  const cancelEdit = () => { setEditingFolio(null); setDraft(null); };

  const guardar = async (t: TrampaRow) => {
    if (!draft || !token) return;
    const body: Record<string, unknown> = {};
    const nt = draft.no_trampa.trim();
    if (nt && nt !== (t.no_trampa ?? '').trim())            body.no_trampa = nt;
    if (draft.fecha_ultima_revision && draft.fecha_ultima_revision !== t.fecha_ultima_revision)
      body.fecha_ultima_revision = draft.fecha_ultima_revision;
    if (draft.tipo_trampa !== t.tipo_trampa)                body.tipo_trampa = draft.tipo_trampa;

    if (Object.keys(body).length === 0) { cancelEdit(); return; }

    setGuardando(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/trampas/${t.folio}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(typeof detail === 'string' ? detail : 'Error al guardar');
      }
      setToast({ kind: 'ok', text: `Trampa ${t.folio} actualizada` });
      cancelEdit();
      await cargarTrampas();
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally { setGuardando(false); }
  };

  // ── Eliminar con preview ───────────────────────────────
  const pedirEliminar = async (t: TrampaRow) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/trampas/${t.folio}/preview-eliminar`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(typeof detail === 'string' ? detail : 'Error al consultar impacto');
      }
      const preview = (await res.json()) as PreviewEliminar;
      setConfirmDel({ trampa: t, preview });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    }
  };

  const confirmarEliminar = async () => {
    if (!confirmDel || !token) return;
    setEliminando(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/trampas/${confirmDel.trampa.folio}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(typeof detail === 'string' ? detail : 'Error al eliminar');
      }
      const result = await res.json();
      const c = result?.cascada ?? {};
      setToast({
        kind: 'ok',
        text: `Trampa ${confirmDel.trampa.folio} eliminada · ${c.revisiones ?? 0} revisiones · ${c.identificaciones ?? 0} identificaciones · ${c.tmimf_o_recalculadas ?? 0} TMIMF 'O' recalculadas`,
      });
      setConfirmDel(null);
      await cargarTrampas();
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally { setEliminando(false); }
  };

  // Auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(id);
  }, [toast]);

  const tipoTrampaNombre = (folio: number | null): string =>
    folio === null ? '—' : tipos.find((t) => t.folio === folio)?.nombre ?? `#${folio}`;

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          Corrección de trampas
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Ajusta no_trampa, fecha última revisión, tipo de trampa. Eliminar en cascada revisiones, identificaciones
          y recalcula TMIMF operativas —{' '}
          <span className="font-semibold text-amber-700 dark:text-amber-400">{user?.nombre_estado}</span>
        </p>
      </div>

      {/* Selectores */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pfa" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              1. PFA (con rutas asignadas)
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
                  {p.inicial ? `${p.inicial} · ` : ''}{p.nombre} — {p.rutas_count} ruta{p.rutas_count !== 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
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
          </div>
        </div>
      </section>

      {/* Tabla de trampas */}
      {rutaId !== null && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
            <Icon name="track_changes" className="text-amber-700 dark:text-amber-400 text-lg" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
              {trampas.length} trampa{trampas.length !== 1 ? 's' : ''}
            </h2>
            {cargandoTr && (
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
                  <th className="px-3 py-2 text-left">Inscripción · Huerto · Ruta</th>
                  <th className="px-3 py-2 text-left">no_trampa</th>
                  <th className="px-3 py-2 text-left">Última revisión</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {trampas.map((t) => {
                  const isEditing = editingFolio === t.folio;
                  return (
                    <tr key={t.folio} className={`border-t border-slate-100 dark:border-slate-800 ${isEditing ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs text-slate-900 dark:text-slate-100">{t.numeroinscripcion ?? '—'}</span>
                          <span className="text-xs text-slate-600 dark:text-slate-400">{t.nombre_huerto ?? '—'}</span>
                          <span className="text-[11px] text-slate-500">
                            {t.ruta_inicial ? `${t.ruta_inicial} · ` : ''}{t.ruta_nombre ?? '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {isEditing && draft ? (
                          <input
                            type="text"
                            value={draft.no_trampa}
                            onChange={(e) => setDraft({ ...draft, no_trampa: e.target.value })}
                            className="w-full min-w-[220px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                          />
                        ) : (t.no_trampa ?? '').trim()}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing && draft ? (
                          <input
                            type="date"
                            value={draft.fecha_ultima_revision}
                            onChange={(e) => setDraft({ ...draft, fecha_ultima_revision: e.target.value })}
                            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                          />
                        ) : (t.fecha_ultima_revision ?? '—')}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing && draft ? (
                          <select
                            value={draft.tipo_trampa ?? ''}
                            onChange={(e) => setDraft({ ...draft, tipo_trampa: e.target.value ? Number(e.target.value) : null })}
                            className="w-full min-w-[140px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                          >
                            <option value="">—</option>
                            {tipos.map((x) => (
                              <option key={x.folio} value={x.folio}>{x.nombre}</option>
                            ))}
                          </select>
                        ) : (<span className="text-xs">{tipoTrampaNombre(t.tipo_trampa)}</span>)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                          (t.status === 'A' || t.status === null)
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        }`}>{t.status === 'I' ? 'Inactiva' : 'Activa'}</span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void guardar(t)}
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
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(t)}
                              disabled={editingFolio !== null}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs disabled:opacity-40"
                            >
                              <Icon name="edit" className="text-sm" /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void pedirEliminar(t)}
                              disabled={editingFolio !== null}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rose-300 dark:border-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-xs text-rose-700 dark:text-rose-300 disabled:opacity-40 ml-2"
                            >
                              <Icon name="delete" className="text-sm" /> Eliminar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!cargandoTr && trampas.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">No hay trampas en esta ruta.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal eliminar */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <Icon name={confirmDel.preview.permitido ? 'warning' : 'block'} className={`text-2xl ${confirmDel.preview.permitido ? 'text-rose-500' : 'text-slate-500'}`} />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {confirmDel.preview.permitido ? 'Confirmar eliminación' : 'Eliminación bloqueada'}
              </h2>
            </div>
            <div className="p-5 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <p>
                Trampa <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{confirmDel.trampa.no_trampa.trim()}</code>{' '}
                del huerto <strong>{confirmDel.trampa.numeroinscripcion}</strong>
                {confirmDel.trampa.nombre_huerto && <> ({confirmDel.trampa.nombre_huerto})</>}.
              </p>
              {!confirmDel.preview.permitido ? (
                <p className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
                  {confirmDel.preview.motivo_bloqueo}
                </p>
              ) : (
                <>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                    <div>Revisiones (trampas_revision) a borrar: <strong className="tabular-nums">{confirmDel.preview.revisiones_afectadas}</strong></div>
                    <div>Identificaciones de moscas a borrar: <strong className="tabular-nums">{confirmDel.preview.identificaciones_afectadas}</strong></div>
                    <div>TMIMF 'O' activas del huerto a recalcular: <strong className="tabular-nums">{confirmDel.preview.tmimf_o_recalculadas}</strong></div>
                    <div>Trampas activas que quedan en el huerto: <strong className="tabular-nums">{confirmDel.preview.trampas_activas_restantes_huerto}</strong></div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Todo se registra en la bitácora central de escrituras legacy. Esta acción no se puede deshacer
                    automáticamente (solo vía consulta de <code>legacy_audit_log</code>).
                  </p>
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDel(null)}
                disabled={eliminando}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
              >
                {confirmDel.preview.permitido ? 'Cancelar' : 'Cerrar'}
              </button>
              {confirmDel.preview.permitido && (
                <button
                  type="button"
                  onClick={() => void confirmarEliminar()}
                  disabled={eliminando}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {eliminando && <span className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Sí, eliminar trampa
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 max-w-lg p-3 pr-4 rounded-lg shadow-lg border text-sm animate-fade-in flex items-start gap-2 ${
          toast.kind === 'ok'   ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-200' :
          toast.kind === 'warn' ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200'            :
                                  'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-900/30 dark:border-rose-700 dark:text-rose-200'
        }`}>
          <Icon name={toast.kind === 'ok' ? 'check_circle' : toast.kind === 'warn' ? 'warning' : 'error'} className="text-xl shrink-0 mt-0.5" />
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
