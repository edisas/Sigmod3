import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

interface CatalogoMeta {
  clave: string; tabla: string; nombre_humano: string;
  editable: boolean; col_pk: string; col_nombre: string;
  cols_extra: string[]; tiene_status: boolean;
}

interface CatalogoRow {
  folio: number; nombre: string | null;
  extra: Record<string, string | number | null>;
  status: string | null;
}

interface Toast { kind: 'ok' | 'err'; text: string }

interface DraftBase { nombre: string; extra: Record<string, string> }

export default function CatalogosAuxiliaresPage() {
  const { token, user } = useLegacyAuth();

  const [catalogos, setCatalogos] = useState<CatalogoMeta[]>([]);
  const [catSel, setCatSel] = useState<string>('');
  const [filas, setFilas] = useState<CatalogoRow[]>([]);
  const [loadingCat, setLoadingCat] = useState(true);
  const [loadingFilas, setLoadingFilas] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const [editingFolio, setEditingFolio] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftBase | null>(null);
  const [creando, setCreando] = useState(false);
  const [draftNuevo, setDraftNuevo] = useState<DraftBase | null>(null);
  const [busqueda, setBusqueda] = useState<string>('');

  const cargarCatalogos = useCallback(async () => {
    if (!token) return;
    setLoadingCat(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/catalogos-auxiliares`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const list = await res.json() as CatalogoMeta[];
        setCatalogos(list);
        if (list.length > 0 && !catSel) setCatSel(list[0].clave);
      }
    } finally { setLoadingCat(false); }
  }, [token, catSel]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarCatalogos(); }, [cargarCatalogos]);

  const cargarFilas = useCallback(async () => {
    if (!token || !catSel) return;
    setLoadingFilas(true);
    setEditingFolio(null); setDraft(null); setCreando(false); setDraftNuevo(null);
    try {
      const res = await fetch(`${API_BASE}/legacy/catalogos-auxiliares/${catSel}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setFilas(await res.json());
    } finally { setLoadingFilas(false); }
  }, [token, catSel]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarFilas(); }, [cargarFilas]);

  const meta = useMemo(() => catalogos.find((c) => c.clave === catSel), [catalogos, catSel]);
  const filasFiltradas = useMemo(() => {
    if (!busqueda.trim()) return filas;
    const q = busqueda.toLowerCase();
    return filas.filter((f) =>
      (f.nombre ?? '').toLowerCase().includes(q) ||
      Object.values(f.extra).some((v) => String(v ?? '').toLowerCase().includes(q))
    );
  }, [filas, busqueda]);

  const startEdit = (f: CatalogoRow) => {
    if (!meta || !meta.editable) return;
    setEditingFolio(f.folio);
    const extra: Record<string, string> = {};
    for (const c of meta.cols_extra) extra[c] = String(f.extra[c] ?? '');
    setDraft({ nombre: f.nombre ?? '', extra });
  };

  const cancelEdit = () => { setEditingFolio(null); setDraft(null); };

  const saveEdit = async (f: CatalogoRow) => {
    if (!token || !meta || !draft) return;
    if (draft.nombre.trim().length === 0) {
      setToast({ kind: 'err', text: 'El nombre es obligatorio.' });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/legacy/catalogos-auxiliares/${meta.clave}/${f.folio}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: draft.nombre.trim(), extra: draft.extra }),
      });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(typeof detail === 'string' ? detail : 'Error');
      }
      const updated = await res.json() as CatalogoRow;
      setFilas((prev) => prev.map((x) => x.folio === f.folio ? updated : x));
      cancelEdit();
      setToast({ kind: 'ok', text: `${meta.nombre_humano} #${f.folio} actualizado.` });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    }
  };

  const startCrear = () => {
    if (!meta) return;
    const extra: Record<string, string> = {};
    for (const c of meta.cols_extra) extra[c] = '';
    setDraftNuevo({ nombre: '', extra });
    setCreando(true);
  };

  const guardarNuevo = async () => {
    if (!token || !meta || !draftNuevo) return;
    if (draftNuevo.nombre.trim().length === 0) {
      setToast({ kind: 'err', text: 'El nombre es obligatorio.' });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/legacy/catalogos-auxiliares/${meta.clave}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: draftNuevo.nombre.trim(), extra: draftNuevo.extra }),
      });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(typeof detail === 'string' ? detail : 'Error');
      }
      const created = await res.json() as CatalogoRow;
      setFilas((prev) => [...prev, created]);
      setCreando(false); setDraftNuevo(null);
      setToast({ kind: 'ok', text: `${meta.nombre_humano} creado (folio ${created.folio}).` });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    }
  };

  const desactivar = async (f: CatalogoRow) => {
    if (!token || !meta || !meta.tiene_status) return;
    if (!confirm(`Desactivar ${f.nombre} (folio ${f.folio})?`)) return;
    try {
      const res = await fetch(`${API_BASE}/legacy/catalogos-auxiliares/${meta.clave}/${f.folio}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(typeof detail === 'string' ? detail : 'Error');
      }
      const updated = await res.json() as CatalogoRow;
      setFilas((prev) => prev.map((x) => x.folio === f.folio ? updated : x));
      setToast({ kind: 'ok', text: `${meta.nombre_humano} #${f.folio} desactivado.` });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="folder_managed"
        title="Catálogos auxiliares"
        subtitle="Vista y edición de los catálogos legacy. CRUD inline para los simples; los complejos quedan read-only."
        estado={user?.nombre_estado}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label htmlFor="cat" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Catálogo</label>
            <select id="cat" value={catSel} onChange={(e) => setCatSel(e.target.value)} disabled={loadingCat}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              {loadingCat && <option>Cargando…</option>}
              {catalogos.map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.editable ? '✏️' : '🔒'} {c.nombre_humano} ({c.tabla})
                </option>
              ))}
            </select>
          </div>
          {meta && meta.editable && (
            <button type="button" onClick={startCrear} disabled={creando}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium inline-flex items-center gap-2">
              <Icon name="add" /> Nuevo registro
            </button>
          )}
        </div>
      </section>

      {meta && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3 flex-wrap">
            <Icon name={meta.editable ? 'edit_note' : 'lock'} className="text-amber-700 dark:text-amber-400 text-lg" />
            <h2 className="text-sm font-semibold uppercase tracking-wide">{meta.nombre_humano}</h2>
            <span className="text-xs text-slate-500">· {filas.length} fila{filas.length !== 1 ? 's' : ''}</span>
            <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Filtrar…"
              className="ml-auto px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs w-48" />
          </header>
          <div className="overflow-x-auto max-h-[65vh]">
            {loadingFilas ? (
              <p className="px-4 py-8 text-center text-slate-500">Cargando…</p>
            ) : filasFiltradas.length === 0 && !creando ? (
              <p className="px-4 py-8 text-center text-slate-500">Sin filas{busqueda ? ' con ese filtro' : ''}.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left w-16">Folio</th>
                    <th className="px-3 py-2 text-left">{meta.col_nombre}</th>
                    {meta.cols_extra.map((c) => (
                      <th key={c} className="px-3 py-2 text-left">{c}</th>
                    ))}
                    {meta.tiene_status && <th className="px-3 py-2 text-center">Status</th>}
                    {meta.editable && <th className="px-3 py-2 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {creando && draftNuevo && (
                    <tr className="bg-amber-50/60 dark:bg-amber-950/20 border-t border-amber-200 dark:border-amber-900">
                      <td className="px-3 py-2 text-xs text-slate-500">nuevo</td>
                      <td className="px-3 py-2">
                        <input type="text" value={draftNuevo.nombre} onChange={(e) => setDraftNuevo({ ...draftNuevo, nombre: e.target.value })}
                          autoFocus className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs" />
                      </td>
                      {meta.cols_extra.map((c) => (
                        <td key={c} className="px-3 py-2">
                          <input type="text" value={draftNuevo.extra[c] ?? ''} onChange={(e) => setDraftNuevo({ ...draftNuevo, extra: { ...draftNuevo.extra, [c]: e.target.value } })}
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs" />
                        </td>
                      ))}
                      {meta.tiene_status && <td className="px-3 py-2 text-center text-xs">A</td>}
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button type="button" onClick={guardarNuevo} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs"><Icon name="save" /> Guardar</button>
                        <button type="button" onClick={() => { setCreando(false); setDraftNuevo(null); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs ml-1">Cancelar</button>
                      </td>
                    </tr>
                  )}
                  {filasFiltradas.map((f) => {
                    const editing = editingFolio === f.folio;
                    return (
                      <tr key={f.folio} className={`border-t border-slate-100 dark:border-slate-800 ${editing ? 'bg-amber-50/60 dark:bg-amber-950/20' : f.status === 'I' ? 'opacity-50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                        <td className="px-3 py-2 font-mono text-xs">{f.folio}</td>
                        <td className="px-3 py-2">
                          {editing && draft ? (
                            <input type="text" value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
                              className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs" />
                          ) : (f.nombre ?? '—')}
                        </td>
                        {meta.cols_extra.map((c) => (
                          <td key={c} className="px-3 py-2 text-xs">
                            {editing && draft ? (
                              <input type="text" value={draft.extra[c] ?? ''} onChange={(e) => setDraft({ ...draft, extra: { ...draft.extra, [c]: e.target.value } })}
                                className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs" />
                            ) : (f.extra[c] !== null && f.extra[c] !== undefined ? String(f.extra[c]) : '—')}
                          </td>
                        ))}
                        {meta.tiene_status && (
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                              f.status === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
                              f.status === 'I' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                                                 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}>{f.status ?? '—'}</span>
                          </td>
                        )}
                        {meta.editable && (
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {editing ? (
                              <>
                                <button type="button" onClick={() => void saveEdit(f)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs"><Icon name="save" /> Guardar</button>
                                <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs ml-1">Cancelar</button>
                              </>
                            ) : (
                              <>
                                <button type="button" onClick={() => startEdit(f)} disabled={editingFolio !== null}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs disabled:opacity-40">
                                  <Icon name="edit" /> Editar
                                </button>
                                {meta.tiene_status && f.status === 'A' && (
                                  <button type="button" onClick={() => void desactivar(f)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs ml-1">
                                    <Icon name="block" /> Desactivar
                                  </button>
                                )}
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 max-w-lg p-3 pr-4 rounded-lg shadow-lg border text-sm flex items-start gap-2 cursor-pointer ${
          toast.kind === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-200'
                              : 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-900/30 dark:border-rose-700 dark:text-rose-200'
        }`} onClick={() => setToast(null)}>
          <Icon name={toast.kind === 'ok' ? 'check_circle' : 'error'} className="text-xl shrink-0 mt-0.5" />
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
