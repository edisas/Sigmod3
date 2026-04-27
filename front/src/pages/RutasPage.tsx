import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface RutaItem {
  id: number;
  nombre: string;
  modulo_id: number | null;
  pfa_id: number | null;
  fecha_primera_revision: string | null;
  dia_revision: string | null;
  tipo_folio: string | null;
  inicial_ruta: string | null;
  descripcion: string | null;
  capturista_id: number | null;
  trampero_id: number | null;
  figura_cooperadora_id: number | null;
  estado_id: number | null;
  estatus_id: number;
  estado_nombre: string | null;
  modulo_nombre: string | null;
  capturista_nombre: string | null;
  trampero_nombre: string | null;
  figura_cooperadora_nombre: string | null;
}

interface RutasList {
  items: RutaItem[];
  total: number;
  page: number;
  page_size: number;
}

interface ModuloOption {
  id: number;
  nombre: string;
  estado_id: number | null;
}

interface FiguraOption {
  id: number;
  nombre: string;
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const EMPTY_FORM = {
  id: null as number | null,
  nombre: '',
  modulo_id: '' as number | '',
  pfa_id: '' as number | '',
  fecha_primera_revision: '',
  dia_revision: '',
  tipo_folio: '',
  inicial_ruta: '',
  descripcion: '',
  capturista_id: '' as number | '',
  trampero_id: '' as number | '',
  figura_cooperadora_id: '' as number | '',
  estatus_id: 1,
};

type FormState = typeof EMPTY_FORM;

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try {
      const b = await r.json();
      if (b?.detail) detail = String(b.detail);
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export default function RutasPage() {
  const { activeStateName } = useAuth();
  const [items, setItems] = useState<RutaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [moduloFilter, setModuloFilter] = useState<number | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [modulos, setModulos] = useState<ModuloOption[]>([]);
  const [figuras, setFiguras] = useState<FiguraOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadCatalogos = useCallback(async () => {
    try {
      const [mods, figs] = await Promise.all([
        fetchJson<{ items: ModuloOption[] }>(`${API_BASE}/modulos/listado?estatus_id=1&page_size=200`).catch(() => ({ items: [] })),
        fetchJson<FiguraOption[]>(`${API_BASE}/catalogos/figuras-cooperadoras`).catch(() => []),
      ]);
      setModulos(mods.items ?? []);
      setFiguras(Array.isArray(figs) ? figs : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void loadCatalogos(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [loadCatalogos]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter !== '') params.set('estatus_id', String(statusFilter));
      if (moduloFilter !== '') params.set('modulo_id', String(moduloFilter));
      const data = await fetchJson<RutasList>(`${API_BASE}/rutas/listado?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las rutas.');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, statusFilter, moduloFilter]);

  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  const openCreate = () => { setForm(EMPTY_FORM); setDrawerOpen(true); };
  const openEdit = (item: RutaItem) => {
    setForm({
      id: item.id,
      nombre: item.nombre,
      modulo_id: item.modulo_id ?? '',
      pfa_id: item.pfa_id ?? '',
      fecha_primera_revision: item.fecha_primera_revision ?? '',
      dia_revision: item.dia_revision ?? '',
      tipo_folio: item.tipo_folio ?? '',
      inicial_ruta: item.inicial_ruta ?? '',
      descripcion: item.descripcion ?? '',
      capturista_id: item.capturista_id ?? '',
      trampero_id: item.trampero_id ?? '',
      figura_cooperadora_id: item.figura_cooperadora_id ?? '',
      estatus_id: item.estatus_id,
    });
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setForm(EMPTY_FORM); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const body = {
        nombre: form.nombre.trim(),
        modulo_id: form.modulo_id === '' ? null : Number(form.modulo_id),
        pfa_id: form.pfa_id === '' ? null : Number(form.pfa_id),
        fecha_primera_revision: form.fecha_primera_revision || null,
        dia_revision: form.dia_revision || null,
        tipo_folio: form.tipo_folio.trim() || null,
        inicial_ruta: form.inicial_ruta.trim() || null,
        descripcion: form.descripcion.trim() || null,
        capturista_id: form.capturista_id === '' ? null : Number(form.capturista_id),
        trampero_id: form.trampero_id === '' ? null : Number(form.trampero_id),
        figura_cooperadora_id: form.figura_cooperadora_id === '' ? null : Number(form.figura_cooperadora_id),
        estatus_id: Number(form.estatus_id),
      };
      if (form.id == null) {
        await fetchJson(`${API_BASE}/rutas`, { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Ruta creada.');
      } else {
        await fetchJson(`${API_BASE}/rutas/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Ruta actualizada.');
      }
      closeDrawer();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const inactivate = async (item: RutaItem) => {
    if (!window.confirm(`¿Inactivar la ruta "${item.nombre}"?`)) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/rutas/${item.id}`, { method: 'DELETE' });
      setSuccess('Ruta inactivada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo inactivar.');
    }
  };

  const modulosIndex = useMemo(() => new Map(modulos.map((m) => [m.id, m.nombre])), [modulos]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Rutas de trampeo</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Rutas de {activeStateName ?? 'tu estado activo'}.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={openCreate}>
          <Icon name="add" className="text-base" /> Nueva ruta
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, folio o descripción"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2 dark:bg-slate-800 dark:border-slate-700"
        />
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}
        >
          <option value={1}>Activos</option>
          <option value={2}>Inactivos</option>
          <option value="">Todos</option>
        </select>
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
          value={moduloFilter}
          onChange={(e) => { setModuloFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}
        >
          <option value="">Cualquier módulo</option>
          {modulos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <div className="flex gap-2">
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setSearch(q); setPage(1); }}>Buscar</button>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setQ(''); setSearch(''); setStatusFilter(1); setModuloFilter(''); setPage(1); }}>Limpiar</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{success}</div>}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-3">Nombre</th>
              <th className="text-left px-4 py-3">Módulo</th>
              <th className="text-left px-4 py-3">Día revisión</th>
              <th className="text-left px-4 py-3">Trampero</th>
              <th className="text-left px-4 py-3">Estatus</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-4 py-4 text-slate-500" colSpan={6}>Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td className="px-4 py-4 text-slate-500" colSpan={6}>Sin rutas registradas.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-3 font-medium">{item.nombre}</td>
                  <td className="px-4 py-3">{item.modulo_nombre ?? (item.modulo_id ? modulosIndex.get(item.modulo_id) ?? `#${item.modulo_id}` : <span className="italic text-slate-400">—</span>)}</td>
                  <td className="px-4 py-3">{item.dia_revision ?? <span className="italic text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">{item.trampero_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">{item.estatus_id === 1 ? 'Activa' : 'Inactiva'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button className="rounded-md border border-primary px-2 py-1 text-primary" onClick={() => openEdit(item)}>Editar</button>
                      {item.estatus_id === 1 && (
                        <button className="rounded-md border border-red-300 px-2 py-1 text-red-700" onClick={() => void inactivate(item)}>Inactivar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total} rutas</p>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 dark:text-slate-300">Por página</label>
          <select className="rounded-lg border border-slate-300 px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-700" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-700" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
          <span className="text-sm text-slate-600 dark:text-slate-300">Página {page} de {totalPages}</span>
          <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-700" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente</button>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={closeDrawer} aria-hidden="true" />
          <aside className="w-full max-w-lg bg-white dark:bg-slate-900 shadow-xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{form.id == null ? 'Nueva ruta' : 'Editar ruta'}</h2>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}>
                <Icon name="close" className="text-xl" />
              </button>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Nombre de la ruta</label>
                <input required maxLength={50} value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Módulo</label>
                  <select value={form.modulo_id} onChange={(e) => setForm((p) => ({ ...p, modulo_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                    <option value="">— Sin asignar —</option>
                    {modulos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Día de revisión</label>
                  <select value={form.dia_revision} onChange={(e) => setForm((p) => ({ ...p, dia_revision: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                    <option value="">— Seleccionar —</option>
                    {DIAS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Tipo de folio</label>
                  <input maxLength={10} value={form.tipo_folio} onChange={(e) => setForm((p) => ({ ...p, tipo_folio: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Inicial de la ruta</label>
                  <input maxLength={50} value={form.inicial_ruta} onChange={(e) => setForm((p) => ({ ...p, inicial_ruta: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Fecha primera revisión</label>
                <input type="date" value={form.fecha_primera_revision} onChange={(e) => setForm((p) => ({ ...p, fecha_primera_revision: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Descripción</label>
                <textarea rows={2} maxLength={200} value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Figura cooperadora</label>
                <select value={form.figura_cooperadora_id} onChange={(e) => setForm((p) => ({ ...p, figura_cooperadora_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value="">— Sin asignar —</option>
                  {figuras.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">PFA ID</label>
                  <input type="number" value={form.pfa_id} onChange={(e) => setForm((p) => ({ ...p, pfa_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Capturista ID</label>
                  <input type="number" value={form.capturista_id} onChange={(e) => setForm((p) => ({ ...p, capturista_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Trampero ID</label>
                <input type="number" value={form.trampero_id} onChange={(e) => setForm((p) => ({ ...p, trampero_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                <p className="text-xs text-slate-500 mt-1">Selector de tramperos vendrá en próxima iteración (Sprint 2.3).</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Estatus</label>
                <select value={form.estatus_id} onChange={(e) => setForm((p) => ({ ...p, estatus_id: Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value={1}>Activa</option>
                  <option value={2}>Inactiva</option>
                </select>
              </div>
            </form>
            <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700" onClick={closeDrawer} disabled={saving}>Cancelar</button>
              <button type="submit" className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-50" onClick={submit} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
