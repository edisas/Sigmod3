import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface Trampa {
  id: number;
  numero_trampa: string;
  ruta_id: number | null;
  ruta_nombre: string | null;
  tipo_trampa_id: number | null;
  tipo_trampa_nombre: string | null;
  unidad_produccion_id: number | null;
  unidad_produccion_ni: string | null;
  estado_id: number | null;
  estatus_id: number;
}

interface Revision {
  id: number;
  trampa_id: number;
  numero_semana: number | null;
  fecha_revision: string | null;
  status_revision_id: number | null;
  dias_exposicion: number | null;
  observaciones: string | null;
  validado: number;
  estatus_id: number;
}

interface Identificacion {
  id: number;
  revision_id: number;
  especie_mosca_id: number | null;
  hembras_silvestre: number;
  machos_silvestre: number;
  hembras_esteril: number;
  machos_esteril: number;
  tecnico_id: number | null;
  fecha: string | null;
  hora: string | null;
  especie_mosca_nombre: string | null;
  tecnico_nombre: string | null;
  estatus_id: number;
}

interface SimpleOption { id: number; nombre: string; }

function authHeaders(): HeadersInit {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) } });
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try { const b = await r.json(); if (b?.detail) detail = String(b.detail); } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

function semanaActualISO(): number {
  // Cálculo simple de semana ISO 8601.
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

const REVISION_DEFAULT = {
  status_revision_id: '' as number | '',
  fecha_revision: new Date().toISOString().slice(0, 10),
  dias_exposicion: '7',
  observaciones: '',
  validado: 0 as 0 | 1,
};

const IDENT_DEFAULT = {
  especie_mosca_id: '' as number | '',
  hembras_silvestre: '0',
  machos_silvestre: '0',
  hembras_esteril: '0',
  machos_esteril: '0',
  tecnico_id: '' as number | '',
};

export default function CapturaSemanalPage() {
  const { activeStateName } = useAuth();
  const [semana, setSemana] = useState<number>(semanaActualISO());
  const [trampas, setTrampas] = useState<Trampa[]>([]);
  const [revisiones, setRevisiones] = useState<Map<number, Revision>>(new Map()); // trampa_id -> revisión
  const [identCounts, setIdentCounts] = useState<Map<number, number>>(new Map()); // revision_id -> count
  const [filtroPendientes, setFiltroPendientes] = useState(false);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Catálogos
  const [statusRevisiones, setStatusRevisiones] = useState<SimpleOption[]>([]);
  const [especiesMosca, setEspeciesMosca] = useState<SimpleOption[]>([]);
  const [tramperos, setTramperos] = useState<SimpleOption[]>([]);

  // Drawer state
  const [activeTrampa, setActiveTrampa] = useState<Trampa | null>(null);
  const [revForm, setRevForm] = useState(REVISION_DEFAULT);
  const [identForm, setIdentForm] = useState(IDENT_DEFAULT);
  const [identsList, setIdentsList] = useState<Identificacion[]>([]);
  const [editingIdentId, setEditingIdentId] = useState<number | null>(null);
  const [savingRev, setSavingRev] = useState(false);
  const [savingIdent, setSavingIdent] = useState(false);
  const [drawerError, setDrawerError] = useState('');
  const [drawerSuccess, setDrawerSuccess] = useState('');

  const loadCatalogos = useCallback(async () => {
    try {
      const [srs, esps, trs] = await Promise.all([
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/status-revision?estatus_id=1`).catch(() => []),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/especies-mosca?estatus_id=1`).catch(() => []),
        fetchJson<{ items: SimpleOption[] }>(`${API_BASE}/tramperos/listado?estatus_id=1&page_size=500`).catch(() => ({ items: [] })),
      ]);
      setStatusRevisiones(Array.isArray(srs) ? srs : []);
      setEspeciesMosca(Array.isArray(esps) ? esps : []);
      setTramperos(trs.items ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadCatalogos(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [loadCatalogos]);

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      // Trampas activas del estado actual
      const tdata = await fetchJson<{ items: Trampa[] }>(`${API_BASE}/trampas/listado?estatus_id=1&page_size=500`);
      setTrampas(tdata.items ?? []);

      // Revisiones de esa semana
      const rdata = await fetchJson<{ items: Revision[] }>(`${API_BASE}/revisiones/listado?numero_semana=${semana}&estatus_id=1&page_size=500`);
      const rmap = new Map<number, Revision>();
      for (const r of rdata.items ?? []) rmap.set(r.trampa_id, r);
      setRevisiones(rmap);

      // Conteo de identificaciones por revisión (consulta paralela liviana)
      const counts = new Map<number, number>();
      const promises = (rdata.items ?? []).map(async (r) => {
        try {
          const res = await fetchJson<{ total: number }>(`${API_BASE}/identificaciones/listado?revision_id=${r.id}&estatus_id=1&page_size=5`);
          counts.set(r.id, res.total);
        } catch { /* ignore */ }
      });
      await Promise.all(promises);
      setIdentCounts(counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las trampas.');
    } finally {
      setIsLoading(false);
    }
  }, [semana]);

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('es');
    return trampas.filter((t) => {
      if (filtroPendientes && revisiones.has(t.id)) return false;
      if (!q) return true;
      return (
        t.numero_trampa.toLocaleLowerCase('es').includes(q)
        || (t.ruta_nombre ?? '').toLocaleLowerCase('es').includes(q)
        || (t.unidad_produccion_ni ?? '').toLocaleLowerCase('es').includes(q)
      );
    });
  }, [trampas, search, filtroPendientes, revisiones]);

  const completadas = useMemo(() => trampas.filter((t) => revisiones.has(t.id)).length, [trampas, revisiones]);
  const pendientes = trampas.length - completadas;

  const openTrampa = useCallback(async (t: Trampa) => {
    setActiveTrampa(t);
    setDrawerError(''); setDrawerSuccess('');
    setIdentForm(IDENT_DEFAULT);
    setEditingIdentId(null);

    const existing = revisiones.get(t.id);
    if (existing) {
      setRevForm({
        status_revision_id: existing.status_revision_id ?? '',
        fecha_revision: existing.fecha_revision ?? new Date().toISOString().slice(0, 10),
        dias_exposicion: existing.dias_exposicion == null ? '' : String(existing.dias_exposicion),
        observaciones: existing.observaciones ?? '',
        validado: (existing.validado ? 1 : 0),
      });
      try {
        const idata = await fetchJson<{ items: Identificacion[] }>(`${API_BASE}/identificaciones/listado?revision_id=${existing.id}&estatus_id=1&page_size=200`);
        setIdentsList(idata.items ?? []);
      } catch { setIdentsList([]); }
    } else {
      setRevForm(REVISION_DEFAULT);
      setIdentsList([]);
    }
  }, [revisiones]);

  const closeDrawer = () => {
    setActiveTrampa(null);
    setRevForm(REVISION_DEFAULT);
    setIdentForm(IDENT_DEFAULT);
    setIdentsList([]);
    setEditingIdentId(null);
  };

  const submitRevision = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    if (!activeTrampa) return;
    setSavingRev(true); setDrawerError(''); setDrawerSuccess('');
    try {
      const body = {
        trampa_id: activeTrampa.id,
        numero_semana: semana,
        fecha_revision: revForm.fecha_revision || null,
        status_revision_id: revForm.status_revision_id === '' ? null : Number(revForm.status_revision_id),
        tipo_producto: null,
        dias_exposicion: revForm.dias_exposicion === '' ? null : Number(revForm.dias_exposicion),
        observaciones: revForm.observaciones.trim() || null,
        validado: Number(revForm.validado),
        estatus_id: 1,
      };
      const existing = revisiones.get(activeTrampa.id);
      let revisionId: number;
      if (existing) {
        const updated = await fetchJson<Revision>(`${API_BASE}/revisiones/${existing.id}`, { method: 'PUT', body: JSON.stringify(body) });
        revisionId = updated.id;
        setRevisiones((prev) => new Map(prev).set(activeTrampa.id, updated));
      } else {
        const created = await fetchJson<Revision>(`${API_BASE}/revisiones`, { method: 'POST', body: JSON.stringify(body) });
        revisionId = created.id;
        setRevisiones((prev) => new Map(prev).set(activeTrampa.id, created));
        setIdentCounts((prev) => new Map(prev).set(revisionId, 0));
      }
      setDrawerSuccess(existing ? 'Revisión actualizada.' : 'Revisión creada — ahora puedes agregar identificaciones.');
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : 'No se pudo guardar la revisión.');
    } finally {
      setSavingRev(false);
    }
  };

  const editIdent = (i: Identificacion) => {
    setEditingIdentId(i.id);
    setIdentForm({
      especie_mosca_id: i.especie_mosca_id ?? '',
      hembras_silvestre: String(i.hembras_silvestre),
      machos_silvestre: String(i.machos_silvestre),
      hembras_esteril: String(i.hembras_esteril),
      machos_esteril: String(i.machos_esteril),
      tecnico_id: i.tecnico_id ?? '',
    });
  };

  const cancelEditIdent = () => {
    setEditingIdentId(null);
    setIdentForm(IDENT_DEFAULT);
  };

  const submitIdent = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    if (!activeTrampa) return;
    const revision = revisiones.get(activeTrampa.id);
    if (!revision) {
      setDrawerError('Primero guarda la revisión.');
      return;
    }
    setSavingIdent(true); setDrawerError(''); setDrawerSuccess('');
    try {
      const body = {
        revision_id: revision.id,
        trampa_id: activeTrampa.id,
        numero_semana: semana,
        especie_mosca_id: identForm.especie_mosca_id === '' ? null : Number(identForm.especie_mosca_id),
        hembras_silvestre: Number(identForm.hembras_silvestre || 0),
        machos_silvestre: Number(identForm.machos_silvestre || 0),
        hembras_esteril: Number(identForm.hembras_esteril || 0),
        machos_esteril: Number(identForm.machos_esteril || 0),
        tecnico_id: identForm.tecnico_id === '' ? null : Number(identForm.tecnico_id),
        fecha: revForm.fecha_revision || null,
        hora: null,
        estatus_id: 1,
      };
      if (editingIdentId == null) {
        await fetchJson(`${API_BASE}/identificaciones`, { method: 'POST', body: JSON.stringify(body) });
        setDrawerSuccess('Identificación agregada.');
      } else {
        await fetchJson(`${API_BASE}/identificaciones/${editingIdentId}`, { method: 'PUT', body: JSON.stringify(body) });
        setDrawerSuccess('Identificación actualizada.');
      }
      // Refrescar lista
      const idata = await fetchJson<{ items: Identificacion[] }>(`${API_BASE}/identificaciones/listado?revision_id=${revision.id}&estatus_id=1&page_size=200`);
      setIdentsList(idata.items ?? []);
      setIdentCounts((prev) => new Map(prev).set(revision.id, idata.items.length));
      // Reset form
      setIdentForm(IDENT_DEFAULT);
      setEditingIdentId(null);
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : 'No se pudo guardar la identificación.');
    } finally {
      setSavingIdent(false);
    }
  };

  const deleteIdent = async (id: number) => {
    if (!window.confirm('¿Inactivar esta identificación?')) return;
    try {
      await fetchJson(`${API_BASE}/identificaciones/${id}`, { method: 'DELETE' });
      setIdentsList((prev) => prev.filter((i) => i.id !== id));
      const revision = activeTrampa ? revisiones.get(activeTrampa.id) : null;
      if (revision) setIdentCounts((prev) => new Map(prev).set(revision.id, (prev.get(revision.id) ?? 1) - 1));
      setDrawerSuccess('Identificación inactivada.');
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : 'No se pudo inactivar.');
    }
  };

  const goNext = () => {
    if (!activeTrampa) return;
    const idx = filtered.findIndex((t) => t.id === activeTrampa.id);
    if (idx < 0) return;
    const next = filtered[idx + 1];
    if (next) {
      void openTrampa(next);
    } else {
      closeDrawer();
    }
  };

  const totalCapturado = (i: Identificacion) => i.hembras_silvestre + i.machos_silvestre + i.hembras_esteril + i.machos_esteril;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Captura semanal</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Captura ágil de revisiones e identificaciones por trampa en {activeStateName ?? 'tu estado activo'}.</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div className="md:col-span-1">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Semana ISO</label>
          <input type="number" min={1} max={53} value={semana} onChange={(e) => setSemana(Number(e.target.value || 1))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Buscar trampa</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="No. trampa, ruta, NI" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 mt-6">
          <input type="checkbox" checked={filtroPendientes} onChange={(e) => setFiltroPendientes(e.target.checked)} className="size-4 rounded border-slate-300 text-primary focus:ring-primary" />
          Solo pendientes
        </label>
        <div className="text-right">
          <p className="text-xs uppercase font-semibold tracking-wider text-slate-500">Progreso semana {semana}</p>
          <p className="text-2xl font-bold text-primary">{completadas}/{trampas.length}</p>
          <p className="text-xs text-slate-500">{pendientes} pendientes</p>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-3 w-8"></th>
              <th className="text-left px-4 py-3">No. trampa</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Ruta</th>
              <th className="text-left px-4 py-3">Unidad</th>
              <th className="text-left px-4 py-3">Estado semana {semana}</th>
              <th className="text-right px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="px-4 py-4 text-slate-500" colSpan={7}>Cargando…</td></tr> :
             filtered.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={7}>Sin trampas para los filtros.</td></tr> :
             filtered.map((t) => {
              const rev = revisiones.get(t.id);
              const idCount = rev ? (identCounts.get(rev.id) ?? 0) : 0;
              const completa = !!rev;
              return (
                <tr key={t.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer" onClick={() => void openTrampa(t)}>
                  <td className="px-4 py-3">
                    {completa ? (
                      <span className="size-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><Icon name="check" className="text-base" /></span>
                    ) : (
                      <span className="size-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center"><Icon name="schedule" className="text-base" /></span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">{t.numero_trampa}</td>
                  <td className="px-4 py-3">{t.tipo_trampa_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">{t.ruta_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 font-mono text-xs">{t.unidad_produccion_ni ?? <span className="italic text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">
                    {completa ? (
                      <span className="text-xs">
                        <span className="text-emerald-700 font-semibold">Revisada</span>
                        {idCount > 0 && <span className="text-slate-500"> · {idCount} identificación{idCount > 1 ? 'es' : ''}</span>}
                        {rev?.validado === 1 && <span className="ml-2 px-1.5 py-0.5 bg-primary/10 text-primary rounded">validada</span>}
                      </span>
                    ) : (
                      <span className="text-amber-700 text-xs font-semibold">Pendiente</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="rounded-md border border-primary px-3 py-1 text-primary text-xs">{completa ? 'Editar' : 'Capturar'} →</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {activeTrampa && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={closeDrawer} aria-hidden="true" />
          <aside className="w-full max-w-2xl bg-white dark:bg-slate-900 shadow-xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Trampa {activeTrampa.numero_trampa}</h2>
                <p className="text-xs text-slate-500">
                  Semana {semana} · {activeTrampa.tipo_trampa_nombre ?? '—'} · {activeTrampa.ruta_nombre ?? 'sin ruta'}
                  {activeTrampa.unidad_produccion_ni && ` · ${activeTrampa.unidad_produccion_ni}`}
                </p>
              </div>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}><Icon name="close" className="text-xl" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {drawerError && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{drawerError}</div>}
              {drawerSuccess && <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{drawerSuccess}</div>}

              <form onSubmit={submitRevision}>
                <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                  <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">1. Revisión semana {semana}</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Fecha de revisión</label>
                      <input type="date" value={revForm.fecha_revision} onChange={(e) => setRevForm((p) => ({ ...p, fecha_revision: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Status</label>
                      <select value={revForm.status_revision_id} onChange={(e) => setRevForm((p) => ({ ...p, status_revision_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                        <option value="">— Seleccionar —</option>
                        {statusRevisiones.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Días de exposición</label>
                      <input type="number" min={0} value={revForm.dias_exposicion} onChange={(e) => setRevForm((p) => ({ ...p, dias_exposicion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 mt-6">
                      <input type="checkbox" checked={revForm.validado === 1} onChange={(e) => setRevForm((p) => ({ ...p, validado: e.target.checked ? 1 : 0 }))} className="size-4 rounded border-slate-300 text-primary focus:ring-primary" />
                      Validada por supervisor
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Observaciones</label>
                    <textarea rows={2} maxLength={200} value={revForm.observaciones} onChange={(e) => setRevForm((p) => ({ ...p, observaciones: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" disabled={savingRev} className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-50">
                      {savingRev ? 'Guardando…' : (revisiones.has(activeTrampa.id) ? 'Actualizar revisión' : 'Crear revisión')}
                    </button>
                  </div>
                </fieldset>
              </form>

              <fieldset className={`space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3 ${revisiones.has(activeTrampa.id) ? '' : 'opacity-50 pointer-events-none'}`}>
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">
                  2. Identificaciones {!revisiones.has(activeTrampa.id) && '(crea la revisión primero)'}
                </legend>

                {identsList.length > 0 && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="text-left px-2 py-2">Especie</th>
                          <th className="text-right px-2 py-2">♀ silv</th>
                          <th className="text-right px-2 py-2">♂ silv</th>
                          <th className="text-right px-2 py-2">♀ esté</th>
                          <th className="text-right px-2 py-2">♂ esté</th>
                          <th className="text-right px-2 py-2">Total</th>
                          <th className="text-right px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {identsList.map((i) => (
                          <tr key={i.id} className="border-t border-slate-100 dark:border-slate-700">
                            <td className="px-2 py-1.5">{i.especie_mosca_nombre ?? '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{i.hembras_silvestre}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{i.machos_silvestre}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{i.hembras_esteril}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{i.machos_esteril}</td>
                            <td className="px-2 py-1.5 text-right font-mono font-bold">{totalCapturado(i)}</td>
                            <td className="px-2 py-1.5 text-right">
                              <button type="button" className="text-primary hover:underline mr-2" onClick={() => editIdent(i)}>Editar</button>
                              <button type="button" className="text-red-600 hover:underline" onClick={() => void deleteIdent(i.id)}>Borrar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <form onSubmit={submitIdent} className="space-y-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{editingIdentId == null ? 'Agregar nueva identificación' : 'Editando identificación'}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Especie</label>
                      <select required value={identForm.especie_mosca_id} onChange={(e) => setIdentForm((p) => ({ ...p, especie_mosca_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                        <option value="">— Seleccionar —</option>
                        {especiesMosca.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Técnico</label>
                      <select value={identForm.tecnico_id} onChange={(e) => setIdentForm((p) => ({ ...p, tecnico_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                        <option value="">— Sin asignar —</option>
                        {tramperos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">♀ silv</label>
                      <input type="number" min={0} value={identForm.hembras_silvestre} onChange={(e) => setIdentForm((p) => ({ ...p, hembras_silvestre: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">♂ silv</label>
                      <input type="number" min={0} value={identForm.machos_silvestre} onChange={(e) => setIdentForm((p) => ({ ...p, machos_silvestre: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">♀ esté</label>
                      <input type="number" min={0} value={identForm.hembras_esteril} onChange={(e) => setIdentForm((p) => ({ ...p, hembras_esteril: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">♂ esté</label>
                      <input type="number" min={0} value={identForm.machos_esteril} onChange={(e) => setIdentForm((p) => ({ ...p, machos_esteril: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    {editingIdentId != null && (
                      <button type="button" onClick={cancelEditIdent} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">Cancelar edición</button>
                    )}
                    <button type="submit" disabled={savingIdent || !revisiones.has(activeTrampa.id)} className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-50">
                      {savingIdent ? 'Guardando…' : (editingIdentId == null ? 'Agregar' : 'Actualizar')}
                    </button>
                  </div>
                </form>
              </fieldset>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-between gap-2">
              <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700" onClick={closeDrawer}>Cerrar</button>
              <button type="button" className="rounded-lg bg-primary text-white px-4 py-2 text-sm" onClick={goNext}>
                {filtered.findIndex((t) => t.id === activeTrampa.id) >= filtered.length - 1 ? 'Cerrar (última)' : 'Siguiente trampa →'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
