import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth } from '@/context/LegacyAuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

// ───────────────────────── Types ─────────────────────────

interface RutaRow {
  folio: number;
  nombre_ruta: string | null;
  inicial_ruta: string | null;
  descripcion: string | null;
  status: string | null;
  modulo_folio: number | null;
  modulo_nombre: string | null;
  tipo_folio: string | null;
  pfa_clave: number | null;
  pfa_nombre: string | null;
  pfa_inicial: string | null;
  huertos: number;
  trampas: number;
}

interface ModuloRow { folio: number; nombre_modulo: string; tipo_folio: string | null }
interface PfaRow   { folio: number; nombre: string; inicial: string | null; cedula: string | null }

interface Draft {
  modulo: number | null;
  clave_pfa: number | null;
  nombre_ruta: string;
  inicial_ruta: string;
  status: 'A' | 'I';
}

interface CascadaPreview { trampas_afectadas: number }

interface Toast { kind: 'ok' | 'err'; text: string }

// ───────────────────────── Page ─────────────────────────

export default function RutasCatalogoPage() {
  const { token, user } = useLegacyAuth();
  const [rutas, setRutas]       = useState<RutaRow[]>([]);
  const [modulos, setModulos]   = useState<ModuloRow[]>([]);
  const [pfas, setPfas]         = useState<PfaRow[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError]       = useState<string>('');
  const [q, setQ]               = useState('');
  const [onlyActive, setOnlyActive] = useState(false);

  const [editingFolio, setEditingFolio] = useState<number | null>(null);
  const [draft, setDraft]               = useState<Draft | null>(null);
  const [guardando, setGuardando]       = useState(false);
  const [confirmCascade, setConfirmCascade] = useState<{ ruta: RutaRow; preview: number } | null>(null);
  const [toast, setToast]               = useState<Toast | null>(null);

  // ── Carga inicial ──────────────────────────────────────
  // q y onlyActive se leen desde ref para que cambiarlos (tecleo) no
  // dispare refetch; la recarga se hace explícitamente por botón.
  const filtrosRef = useRef({ q, onlyActive });
  useEffect(() => { filtrosRef.current = { q, onlyActive }; }, [q, onlyActive]);

  const cargarTodo = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError('');
    try {
      const h = { Authorization: `Bearer ${token}` };
      const qs = new URLSearchParams();
      const { q: qf, onlyActive: only } = filtrosRef.current;
      if (qf) qs.set('q', qf);
      if (only) qs.set('only_active', 'true');
      const [rutasRes, modRes, pfasRes] = await Promise.all([
        fetch(`${API_BASE}/legacy/catalogos/rutas?${qs.toString()}`, { headers: h }),
        fetch(`${API_BASE}/legacy/catalogos/modulos`, { headers: h }),
        fetch(`${API_BASE}/legacy/catalogos/pfas`,   { headers: h }),
      ]);
      if (!rutasRes.ok || !modRes.ok || !pfasRes.ok) throw new Error('No se pudo cargar el catálogo');
      setRutas(await rutasRes.json());
      setModulos(await modRes.json());
      setPfas(await pfasRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setCargando(false);
    }
  }, [token]);

  // setCargando(true) al inicio de cargarTodo dispara set-state-in-effect — patrón
  // legítimo de "cargar en mount/cambio de token" que la regla v6 sobre-marca.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarTodo(); }, [cargarTodo]);

  // ── Edición ────────────────────────────────────────────
  const startEdit = (r: RutaRow) => {
    setEditingFolio(r.folio);
    setDraft({
      modulo:       r.modulo_folio,
      clave_pfa:    r.pfa_clave,
      nombre_ruta:  r.nombre_ruta ?? '',
      inicial_ruta: r.inicial_ruta ?? '',
      status:       (r.status === 'I' ? 'I' : 'A'),
    });
  };

  const cancelEdit = () => { setEditingFolio(null); setDraft(null); };

  const diffContraRuta = (r: RutaRow, d: Draft) => {
    const d2: Record<string, unknown> = {};
    if (d.modulo       !== r.modulo_folio)             d2.modulo       = d.modulo;
    if (d.clave_pfa    !== r.pfa_clave)                d2.clave_pfa    = d.clave_pfa;
    if (d.nombre_ruta  !== (r.nombre_ruta  ?? ''))     d2.nombre_ruta  = d.nombre_ruta;
    if (d.inicial_ruta !== (r.inicial_ruta ?? ''))     d2.inicial_ruta = d.inicial_ruta;
    if (d.status       !== (r.status === 'I' ? 'I' : 'A')) d2.status   = d.status;
    return d2;
  };

  const guardarEdit = async (ruta: RutaRow) => {
    if (!draft || !token) return;
    const cambios = diffContraRuta(ruta, draft);
    if (Object.keys(cambios).length === 0) { cancelEdit(); return; }

    // Si el PFA cambió, consulta cuántas trampas se tocan y pide confirmación si >0
    if ('clave_pfa' in cambios && cambios.clave_pfa !== ruta.pfa_clave && cambios.clave_pfa !== null) {
      try {
        const res = await fetch(
          `${API_BASE}/legacy/catalogos/rutas/${ruta.folio}/cascada-preview?clave_pfa=${cambios.clave_pfa}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const prev = (await res.json()) as CascadaPreview;
          if (prev.trampas_afectadas > 0) {
            setConfirmCascade({ ruta, preview: prev.trampas_afectadas });
            return; // se aplica al confirmar
          }
        }
      } catch { /* si falla el preview, igual avanzamos */ }
    }

    await aplicarPatch(ruta, cambios);
  };

  const aplicarPatch = async (ruta: RutaRow, cambios: Record<string, unknown>) => {
    if (!token) return;
    setGuardando(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/catalogos/rutas/${ruta.folio}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { detail?: string }));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      const { cascada } = (await res.json()) as { cascada: { trampas_actualizadas: number } };
      const tAct = cascada?.trampas_actualizadas ?? 0;
      setToast({
        kind: 'ok',
        text: tAct > 0
          ? `Ruta ${ruta.folio} actualizada · ${tAct} trampa${tAct !== 1 ? 's' : ''} reasignada${tAct !== 1 ? 's' : ''}`
          : `Ruta ${ruta.folio} actualizada`,
      });
      cancelEdit();
      setConfirmCascade(null);
      await cargarTodo();
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error al guardar' });
    } finally {
      setGuardando(false);
    }
  };

  // Auto-dismiss toasts
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  // ── Filtro local adicional (búsqueda en cliente sobre lo ya cargado) ─
  const rutasFiltradas = useMemo(() => {
    if (!q.trim()) return rutas;
    const needle = q.toLowerCase();
    return rutas.filter((r) =>
      (r.nombre_ruta ?? '').toLowerCase().includes(needle) ||
      (r.inicial_ruta ?? '').toLowerCase().includes(needle) ||
      (r.pfa_nombre ?? '').toLowerCase().includes(needle) ||
      (r.modulo_nombre ?? '').toLowerCase().includes(needle)
    );
  }, [rutas, q]);

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
            Catálogo de rutas
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Corrige módulo, PFA responsable, nombre, iniciales y status —{' '}
            <span className="font-semibold text-amber-700 dark:text-amber-400">{user?.nombre_estado}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={cargarTodo}
          disabled={cargando}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm"
        >
          <Icon name="refresh" className={`text-base ${cargando ? 'animate-spin' : ''}`} />
          Recargar
        </button>
      </div>

      {/* Filtros */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px] relative">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca por nombre, iniciales, PFA o módulo..."
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => { setOnlyActive(e.target.checked); }}
            className="size-4 rounded accent-amber-600"
          />
          Solo activas
        </label>
        <button
          type="button"
          onClick={cargarTodo}
          className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
        >
          Aplicar
        </button>
      </section>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Tabla */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2.5 text-left">Folio</th>
                <th className="px-3 py-2.5 text-left">Inicial</th>
                <th className="px-3 py-2.5 text-left">Nombre</th>
                <th className="px-3 py-2.5 text-left">Módulo</th>
                <th className="px-3 py-2.5 text-left">PFA</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5 text-right">Huertos</th>
                <th className="px-3 py-2.5 text-right">Trampas</th>
                <th className="px-3 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rutasFiltradas.map((r, idx) => {
                const isEditing = editingFolio === r.folio;
                const bg = idx % 2 === 1 ? 'bg-slate-50/40 dark:bg-slate-800/20' : '';
                return (
                  <tr key={r.folio} className={`border-t border-slate-100 dark:border-slate-800 ${bg} ${isEditing ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{r.folio}</td>

                    {/* Inicial */}
                    <td className="px-3 py-2">
                      {isEditing && draft ? (
                        <input
                          type="text"
                          value={draft.inicial_ruta}
                          onChange={(e) => setDraft({ ...draft, inicial_ruta: e.target.value })}
                          className="w-24 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                        />
                      ) : (
                        <span className="font-mono text-xs">{r.inicial_ruta ?? '—'}</span>
                      )}
                    </td>

                    {/* Nombre */}
                    <td className="px-3 py-2">
                      {isEditing && draft ? (
                        <input
                          type="text"
                          value={draft.nombre_ruta}
                          onChange={(e) => setDraft({ ...draft, nombre_ruta: e.target.value })}
                          className="w-full min-w-[180px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                        />
                      ) : (
                        <span>{r.nombre_ruta ?? '—'}</span>
                      )}
                    </td>

                    {/* Módulo */}
                    <td className="px-3 py-2">
                      {isEditing && draft ? (
                        <select
                          value={draft.modulo ?? ''}
                          onChange={(e) => setDraft({ ...draft, modulo: e.target.value ? Number(e.target.value) : null })}
                          className="w-full min-w-[160px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                        >
                          <option value="">—</option>
                          {modulos.map((m) => (
                            <option key={m.folio} value={m.folio}>{m.nombre_modulo}</option>
                          ))}
                        </select>
                      ) : (
                        <span>{r.modulo_nombre ?? '—'}</span>
                      )}
                    </td>

                    {/* PFA */}
                    <td className="px-3 py-2">
                      {isEditing && draft ? (
                        <select
                          value={draft.clave_pfa ?? ''}
                          onChange={(e) => setDraft({ ...draft, clave_pfa: e.target.value ? Number(e.target.value) : null })}
                          className="w-full min-w-[240px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                        >
                          <option value="">—</option>
                          {pfas.map((p) => (
                            <option key={p.folio} value={p.folio}>
                              {p.inicial ? `${p.inicial} · ` : ''}{p.nombre}
                            </option>
                          ))}
                        </select>
                      ) : r.pfa_nombre ? (
                        <span>
                          {r.pfa_inicial && <span className="font-mono text-xs text-slate-500 mr-1">{r.pfa_inicial}</span>}
                          {r.pfa_nombre}
                        </span>
                      ) : '—'}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2 text-center">
                      {isEditing && draft ? (
                        <select
                          value={draft.status}
                          onChange={(e) => setDraft({ ...draft, status: e.target.value === 'I' ? 'I' : 'A' })}
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                        >
                          <option value="A">Activa</option>
                          <option value="I">Inactiva</option>
                        </select>
                      ) : (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                          r.status === 'A'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        }`}>
                          {r.status === 'A' ? 'Activa' : r.status === 'I' ? 'Inactiva' : r.status ?? '—'}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{r.huertos}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{r.trampas}</td>

                    {/* Acciones */}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void guardarEdit(r)}
                            disabled={guardando}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60"
                          >
                            <Icon name="save" className="text-sm" />
                            Guardar
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
                          disabled={editingFolio !== null}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs disabled:opacity-40"
                        >
                          <Icon name="edit" className="text-sm" />
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!cargando && rutasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-500 dark:text-slate-400">
                    No hay rutas que coincidan con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal de confirmación de cascada */}
      {confirmCascade && draft && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <Icon name="warning" className="text-amber-500 text-2xl" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Confirmar cascada a trampas</h2>
            </div>
            <div className="p-5 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <p>
                Al cambiar el PFA de la ruta <strong>{confirmCascade.ruta.nombre_ruta}</strong>{' '}
                se reasignarán <strong className="text-amber-700 dark:text-amber-400">{confirmCascade.preview} trampa{confirmCascade.preview !== 1 ? 's' : ''}</strong>{' '}
                (se actualizará <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">trampas.folio_tecnico</code>).
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Esta acción se registra en la bitácora central de escrituras legacy.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmCascade(null)}
                disabled={guardando}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void aplicarPatch(confirmCascade.ruta, diffContraRuta(confirmCascade.ruta, draft))}
                disabled={guardando}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-60"
              >
                {guardando && <span className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Sí, aplicar cambio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 max-w-md p-3 pr-4 rounded-lg shadow-lg border text-sm animate-fade-in flex items-start gap-2 ${
          toast.kind === 'ok'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-200'
            : 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-900/30 dark:border-rose-700 dark:text-rose-200'
        }`}>
          <Icon name={toast.kind === 'ok' ? 'check_circle' : 'error'} className="text-xl shrink-0 mt-0.5" />
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
