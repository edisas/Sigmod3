import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface Revision {
  id: number;
  trampa_id: number;
  numero_semana: number | null;
  fecha_revision: string | null;
  status_revision_id: number | null;
  tipo_producto: number | null;
  dias_exposicion: number | null;
  observaciones: string | null;
  validado: number;
  estatus_id: number;
  trampa_numero: string | null;
  status_revision_nombre: string | null;
}

interface TrampaOption { id: number; numero_trampa: string; }
interface SimpleOption { id: number; nombre: string; }

const EMPTY = {
  id: null as number | null,
  trampa_id: '' as number | '',
  numero_semana: '',
  fecha_revision: '',
  status_revision_id: '' as number | '',
  tipo_producto: '',
  dias_exposicion: '',
  observaciones: '',
  validado: 0 as 0 | 1,
  estatus_id: 1,
};
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

export default function RevisionesPage() {
  const { activeStateName } = useAuth();
  const [items, setItems] = useState<Revision[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [trampaFilter, setTrampaFilter] = useState<number | ''>('');
  const [semanaFilter, setSemanaFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [validadoFilter, setValidadoFilter] = useState<number | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [trampas, setTrampas] = useState<TrampaOption[]>([]);
  const [statusRevisiones, setStatusRevisiones] = useState<SimpleOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadCatalogos = useCallback(async () => {
    try {
      const [trs, srs] = await Promise.all([
        fetchJson<{ items: TrampaOption[] }>(`${API_BASE}/trampas/listado?estatus_id=1&page_size=500`).catch(() => ({ items: [] })),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/status-revision?estatus_id=1`).catch(() => []),
      ]);
      setTrampas(trs.items ?? []);
      setStatusRevisiones(Array.isArray(srs) ? srs : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadCatalogos(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [loadCatalogos]);

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (statusFilter !== '') params.set('estatus_id', String(statusFilter));
      if (trampaFilter !== '') params.set('trampa_id', String(trampaFilter));
      if (semanaFilter.trim()) params.set('numero_semana', semanaFilter.trim());
      if (validadoFilter !== '') params.set('validado', String(validadoFilter));
      const data = await fetchJson<{ items: Revision[]; total: number }>(`${API_BASE}/revisiones/listado?${params.toString()}`);
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      setItems([]); setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las revisiones.');
    } finally { setIsLoading(false); }
  }, [page, pageSize, statusFilter, trampaFilter, semanaFilter, validadoFilter]);

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [load]);

  const openCreate = () => { setForm(EMPTY); setDrawerOpen(true); };
  const openEdit = (item: Revision) => {
    setForm({
      id: item.id,
      trampa_id: item.trampa_id,
      numero_semana: item.numero_semana == null ? '' : String(item.numero_semana),
      fecha_revision: item.fecha_revision ?? '',
      status_revision_id: item.status_revision_id ?? '',
      tipo_producto: item.tipo_producto == null ? '' : String(item.tipo_producto),
      dias_exposicion: item.dias_exposicion == null ? '' : String(item.dias_exposicion),
      observaciones: item.observaciones ?? '',
      validado: (item.validado ? 1 : 0),
      estatus_id: item.estatus_id,
    });
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setForm(EMPTY); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('');
    try {
      const body = {
        trampa_id: Number(form.trampa_id),
        numero_semana: form.numero_semana === '' ? null : Number(form.numero_semana),
        fecha_revision: form.fecha_revision || null,
        status_revision_id: form.status_revision_id === '' ? null : Number(form.status_revision_id),
        tipo_producto: form.tipo_producto === '' ? null : Number(form.tipo_producto),
        dias_exposicion: form.dias_exposicion === '' ? null : Number(form.dias_exposicion),
        observaciones: form.observaciones.trim() || null,
        validado: Number(form.validado),
        estatus_id: Number(form.estatus_id),
      };
      if (form.id == null) {
        await fetchJson(`${API_BASE}/revisiones`, { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Revisión creada.');
      } else {
        await fetchJson(`${API_BASE}/revisiones/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Revisión actualizada.');
      }
      closeDrawer(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  };

  const inactivate = async (item: Revision) => {
    if (!window.confirm(`¿Inactivar revisión semana ${item.numero_semana ?? '?'} de la trampa ${item.trampa_numero ?? item.trampa_id}?`)) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/revisiones/${item.id}`, { method: 'DELETE' });
      setSuccess('Revisión inactivada.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo inactivar.'); }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Revisiones de trampas</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Captura semanal en {activeStateName ?? 'tu estado activo'}.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={openCreate}>
          <Icon name="add" className="text-base" /> Nueva revisión
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2 dark:bg-slate-800 dark:border-slate-700" value={trampaFilter} onChange={(e) => { setTrampaFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value="">Cualquier trampa</option>
          {trampas.map((t) => <option key={t.id} value={t.id}>{t.numero_trampa}</option>)}
        </select>
        <input type="number" min={1} max={53} value={semanaFilter} onChange={(e) => { setSemanaFilter(e.target.value); setPage(1); }} placeholder="Semana" className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value={1}>Activas</option><option value={2}>Inactivas</option><option value="">Todas</option>
        </select>
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={validadoFilter} onChange={(e) => { setValidadoFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value="">Validación: todas</option><option value={1}>Validadas</option><option value={0}>Pendientes</option>
        </select>
        <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setTrampaFilter(''); setSemanaFilter(''); setStatusFilter(1); setValidadoFilter(''); setPage(1); }}>Limpiar</button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{success}</div>}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-3">Trampa</th>
              <th className="text-left px-4 py-3">Semana</th>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-4 py-3">Status revisión</th>
              <th className="text-left px-4 py-3">Días exp.</th>
              <th className="text-left px-4 py-3">Validada</th>
              <th className="text-left px-4 py-3">Estatus</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="px-4 py-4 text-slate-500" colSpan={8}>Cargando...</td></tr> :
             items.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={8}>Sin revisiones registradas.</td></tr> :
             items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3 font-mono text-xs">{item.trampa_numero ?? `#${item.trampa_id}`}</td>
                <td className="px-4 py-3">{item.numero_semana ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.fecha_revision ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.status_revision_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.dias_exposicion ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.validado === 1 ? <span className="text-emerald-700 font-semibold">Sí</span> : <span className="text-slate-500">No</span>}</td>
                <td className="px-4 py-3">{item.estatus_id === 1 ? 'Activa' : 'Inactiva'}</td>
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
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total} revisiones</p>
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
          <aside className="w-full max-w-lg bg-white dark:bg-slate-900 shadow-xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{form.id == null ? 'Nueva revisión' : 'Editar revisión'}</h2>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}><Icon name="close" className="text-xl" /></button>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Trampa</label>
                <select required value={form.trampa_id} onChange={(e) => setForm((p) => ({ ...p, trampa_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value="">— Seleccionar —</option>
                  {trampas.map((t) => <option key={t.id} value={t.id}>{t.numero_trampa}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Número de semana</label>
                  <input type="number" min={1} max={53} value={form.numero_semana} onChange={(e) => setForm((p) => ({ ...p, numero_semana: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Fecha de revisión</label>
                  <input type="date" value={form.fecha_revision} onChange={(e) => setForm((p) => ({ ...p, fecha_revision: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Status de revisión</label>
                <select value={form.status_revision_id} onChange={(e) => setForm((p) => ({ ...p, status_revision_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value="">— Sin status —</option>
                  {statusRevisiones.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <p className="text-xs text-slate-500 mt-1">Captura status en /catalogos/auxiliares/status-revision.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Tipo de producto</label>
                  <input type="number" value={form.tipo_producto} onChange={(e) => setForm((p) => ({ ...p, tipo_producto: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Días de exposición</label>
                  <input type="number" min={0} value={form.dias_exposicion} onChange={(e) => setForm((p) => ({ ...p, dias_exposicion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Observaciones</label>
                <textarea rows={2} maxLength={200} value={form.observaciones} onChange={(e) => setForm((p) => ({ ...p, observaciones: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={form.validado === 1} onChange={(e) => setForm((p) => ({ ...p, validado: e.target.checked ? 1 : 0 }))} className="size-4 rounded border-slate-300 text-primary focus:ring-primary" />
                Validada (revisada por supervisor)
              </label>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Estatus</label>
                <select value={form.estatus_id} onChange={(e) => setForm((p) => ({ ...p, estatus_id: Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value={1}>Activa</option><option value={2}>Inactiva</option>
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
