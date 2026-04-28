import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface TipoTrampa {
  id: number;
  nombre: string;
  descripcion: string | null;
  estatus_id: number;
}

const EMPTY = { id: null as number | null, nombre: '', descripcion: '', estatus_id: 1 };
type FormState = typeof EMPTY;

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

export default function TiposTrampaPage() {
  const [items, setItems] = useState<TipoTrampa[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter !== '') params.set('estatus_id', String(statusFilter));
      const data = await fetchJson<{ items: TipoTrampa[]; total: number }>(`${API_BASE}/tipos-trampa/listado?${params.toString()}`);
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      setItems([]); setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los tipos de trampa.');
    } finally { setIsLoading(false); }
  }, [page, pageSize, search, statusFilter]);

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [load]);

  const openCreate = () => { setForm(EMPTY); setDrawerOpen(true); };
  const openEdit = (item: TipoTrampa) => {
    setForm({ id: item.id, nombre: item.nombre, descripcion: item.descripcion ?? '', estatus_id: item.estatus_id });
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setForm(EMPTY); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('');
    try {
      const body = { nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, estatus_id: Number(form.estatus_id) };
      if (form.id == null) {
        await fetchJson(`${API_BASE}/tipos-trampa`, { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Tipo creado.');
      } else {
        await fetchJson(`${API_BASE}/tipos-trampa/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Tipo actualizado.');
      }
      closeDrawer(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  };

  const inactivate = async (item: TipoTrampa) => {
    if (!window.confirm(`¿Inactivar tipo "${item.nombre}"?`)) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/tipos-trampa/${item.id}`, { method: 'DELETE' });
      setSuccess('Tipo inactivado.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo inactivar.'); }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tipos de trampa</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Catálogo nacional (Jackson, McPhail, Multilure, etc.). Solo administrador general edita.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={openCreate}>
          <Icon name="add" className="text-base" /> Nuevo tipo
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o descripción" className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2 dark:bg-slate-800 dark:border-slate-700" />
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value={1}>Activos</option><option value={2}>Inactivos</option><option value="">Todos</option>
        </select>
        <div className="flex gap-2">
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setSearch(q); setPage(1); }}>Buscar</button>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setQ(''); setSearch(''); setStatusFilter(1); setPage(1); }}>Limpiar</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{success}</div>}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr><th className="text-left px-4 py-3">Nombre</th><th className="text-left px-4 py-3">Descripción</th><th className="text-left px-4 py-3">Estatus</th><th className="text-right px-4 py-3">Acciones</th></tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="px-4 py-4 text-slate-500" colSpan={4}>Cargando...</td></tr> :
             items.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={4}>Sin tipos registrados.</td></tr> :
             items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3 font-medium">{item.nombre}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.descripcion ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.estatus_id === 1 ? 'Activo' : 'Inactivo'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <button className="rounded-md border border-primary px-2 py-1 text-primary" onClick={() => openEdit(item)}>Editar</button>
                    {item.estatus_id === 1 && <button className="rounded-md border border-red-300 px-2 py-1 text-red-700" onClick={() => void inactivate(item)}>Inactivar</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total}</p>
        <div className="flex items-center gap-2">
          <select className="rounded-lg border border-slate-300 px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-700" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-700" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
          <span className="text-sm text-slate-600 dark:text-slate-300">{page} / {totalPages}</span>
          <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-700" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente</button>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={closeDrawer} aria-hidden="true" />
          <aside className="w-full max-w-md bg-white dark:bg-slate-900 shadow-xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{form.id == null ? 'Nuevo tipo' : 'Editar tipo'}</h2>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}><Icon name="close" className="text-xl" /></button>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Nombre</label>
                <input required maxLength={25} value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" placeholder="Jackson, McPhail, …" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Descripción</label>
                <textarea rows={3} maxLength={200} value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Estatus</label>
                <select value={form.estatus_id} onChange={(e) => setForm((p) => ({ ...p, estatus_id: Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value={1}>Activo</option><option value={2}>Inactivo</option>
                </select>
              </div>
            </form>
            <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700" onClick={closeDrawer} disabled={saving}>Cancelar</button>
              <button type="submit" className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-50" onClick={submit} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
