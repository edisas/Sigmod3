import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface ControlMecanico {
  id: number;
  tecnico_id: number | null;
  area_id: number | null;
  numero_semana: number | null;
  fecha: string | null;
  unidad_produccion_id: number | null;
  hospedero_id: number | null;
  kgs_destruidos: number;
  numero_arboles: number;
  has_rastreadas: number;
  observaciones: string | null;
  hora: string | null;
  ejecutor_id: number | null;
  estado_id: number | null;
  estatus_id: number;
  area_nombre: string | null;
  unidad_nombre: string | null;
  hospedero_nombre: string | null;
  ejecutor_nombre: string | null;
  estado_nombre: string | null;
}

interface SimpleOption { id: number; nombre: string; }
interface UnidadOption { id: number; nombre: string | null; clave?: string | null; }

const EMPTY = {
  id: null as number | null,
  tecnico_id: '' as number | '',
  area_id: '' as number | '',
  numero_semana: '' as number | '',
  fecha: '',
  unidad_produccion_id: '' as number | '',
  hospedero_id: '' as number | '',
  kgs_destruidos: '0',
  numero_arboles: '0',
  has_rastreadas: '0',
  observaciones: '',
  hora: '',
  ejecutor_id: '' as number | '',
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

export default function ControlMecanicoPage() {
  const { activeStateName } = useAuth();
  const [items, setItems] = useState<ControlMecanico[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [unidadFilter, setUnidadFilter] = useState<number | ''>('');
  const [semanaFilter, setSemanaFilter] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [areas, setAreas] = useState<SimpleOption[]>([]);
  const [unidades, setUnidades] = useState<UnidadOption[]>([]);
  const [hospederos, setHospederos] = useState<SimpleOption[]>([]);
  const [ejecutores, setEjecutores] = useState<SimpleOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadCatalogos = useCallback(async () => {
    try {
      const [ars, ups, hs, es] = await Promise.all([
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/areas?estatus_id=1`).catch(() => []),
        fetchJson<{ items: UnidadOption[] }>(`${API_BASE}/unidades-produccion/listado?estatus_id=1&page_size=500`).catch(() => ({ items: [] })),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/hospederos?estatus_id=1`).catch(() => []),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/aplicadores?estatus_id=1`).catch(() => []),
      ]);
      setAreas(Array.isArray(ars) ? ars : []);
      setUnidades(ups.items ?? []);
      setHospederos(Array.isArray(hs) ? hs : []);
      setEjecutores(Array.isArray(es) ? es : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadCatalogos(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [loadCatalogos]);

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (statusFilter !== '') params.set('estatus_id', String(statusFilter));
      if (unidadFilter !== '') params.set('unidad_produccion_id', String(unidadFilter));
      if (semanaFilter !== '') params.set('numero_semana', String(semanaFilter));
      const data = await fetchJson<{ items: ControlMecanico[]; total: number }>(`${API_BASE}/control-mecanico/listado?${params.toString()}`);
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      setItems([]); setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los controles mecánicos.');
    } finally { setIsLoading(false); }
  }, [page, pageSize, statusFilter, unidadFilter, semanaFilter]);

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [load]);

  const openCreate = () => { setForm(EMPTY); setDrawerOpen(true); };
  const openEdit = (item: ControlMecanico) => {
    setForm({
      id: item.id,
      tecnico_id: item.tecnico_id ?? '',
      area_id: item.area_id ?? '',
      numero_semana: item.numero_semana ?? '',
      fecha: item.fecha ?? '',
      unidad_produccion_id: item.unidad_produccion_id ?? '',
      hospedero_id: item.hospedero_id ?? '',
      kgs_destruidos: String(item.kgs_destruidos),
      numero_arboles: String(item.numero_arboles),
      has_rastreadas: String(item.has_rastreadas),
      observaciones: item.observaciones ?? '',
      hora: item.hora ?? '',
      ejecutor_id: item.ejecutor_id ?? '',
      estatus_id: item.estatus_id,
    });
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setForm(EMPTY); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('');
    try {
      const body = {
        tecnico_id: form.tecnico_id === '' ? null : Number(form.tecnico_id),
        area_id: form.area_id === '' ? null : Number(form.area_id),
        numero_semana: form.numero_semana === '' ? null : Number(form.numero_semana),
        fecha: form.fecha || null,
        unidad_produccion_id: form.unidad_produccion_id === '' ? null : Number(form.unidad_produccion_id),
        hospedero_id: form.hospedero_id === '' ? null : Number(form.hospedero_id),
        kgs_destruidos: Number(form.kgs_destruidos || 0),
        numero_arboles: Number(form.numero_arboles || 0),
        has_rastreadas: Number(form.has_rastreadas || 0),
        observaciones: form.observaciones || null,
        hora: form.hora || null,
        ejecutor_id: form.ejecutor_id === '' ? null : Number(form.ejecutor_id),
        estatus_id: Number(form.estatus_id),
      };
      if (form.id == null) {
        await fetchJson(`${API_BASE}/control-mecanico`, { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Operativo creado.');
      } else {
        await fetchJson(`${API_BASE}/control-mecanico/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Operativo actualizado.');
      }
      closeDrawer(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  };

  const inactivate = async (item: ControlMecanico) => {
    if (!window.confirm('¿Inactivar operativo?')) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/control-mecanico/${item.id}`, { method: 'DELETE' });
      setSuccess('Operativo inactivado.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo inactivar.'); }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Control mecánico/cultural</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Destrucción de fruta, rastreo y poda en hospederos de {activeStateName ?? 'tu estado activo'}.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={openCreate}>
          <Icon name="add" className="text-base" /> Nuevo operativo
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2 dark:bg-slate-800 dark:border-slate-700" value={unidadFilter} onChange={(e) => { setUnidadFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value="">Cualquier unidad</option>
          {unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre ?? `#${u.id}`}</option>)}
        </select>
        <input type="number" min={1} max={53} placeholder="Semana" className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={semanaFilter} onChange={(e) => { setSemanaFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }} />
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value={1}>Activos</option><option value={2}>Inactivos</option><option value="">Todos</option>
        </select>
        <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setUnidadFilter(''); setSemanaFilter(''); setStatusFilter(1); setPage(1); }}>Limpiar</button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{success}</div>}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-4 py-3">Sem</th>
              <th className="text-left px-4 py-3">Unidad</th>
              <th className="text-left px-4 py-3">Hospedero</th>
              <th className="text-right px-4 py-3">Kgs destruidos</th>
              <th className="text-right px-4 py-3">N° árboles</th>
              <th className="text-right px-4 py-3">Has rastreadas</th>
              <th className="text-left px-4 py-3">Estatus</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="px-4 py-4 text-slate-500" colSpan={9}>Cargando...</td></tr> :
             items.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={9}>Sin operativos registrados.</td></tr> :
             items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3">{item.fecha ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.numero_semana ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.unidad_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.hospedero_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3 text-right font-mono">{item.kgs_destruidos}</td>
                <td className="px-4 py-3 text-right font-mono">{item.numero_arboles}</td>
                <td className="px-4 py-3 text-right font-mono">{item.has_rastreadas}</td>
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
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total} operativos</p>
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
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{form.id == null ? 'Nuevo operativo' : 'Editar operativo'}</h2>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}><Icon name="close" className="text-xl" /></button>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Fecha</label>
                  <input type="date" value={form.fecha} onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Semana</label>
                  <input type="number" min={1} max={53} value={form.numero_semana} onChange={(e) => setForm((p) => ({ ...p, numero_semana: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Unidad de produccion</label>
                <select value={form.unidad_produccion_id} onChange={(e) => setForm((p) => ({ ...p, unidad_produccion_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value="">— Seleccionar —</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre ?? `#${u.id}`}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Hospedero</label>
                  <select value={form.hospedero_id} onChange={(e) => setForm((p) => ({ ...p, hospedero_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                    <option value="">— Seleccionar —</option>
                    {hospederos.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Ejecutor</label>
                  <select value={form.ejecutor_id} onChange={(e) => setForm((p) => ({ ...p, ejecutor_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                    <option value="">— Sin asignar —</option>
                    {ejecutores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Area</label>
                <select value={form.area_id} onChange={(e) => setForm((p) => ({ ...p, area_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value="">— Seleccionar —</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Cantidades</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Kgs destruidos</label>
                    <input type="number" step="0.01" min={0} value={form.kgs_destruidos} onChange={(e) => setForm((p) => ({ ...p, kgs_destruidos: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">N° árboles</label>
                    <input type="number" min={0} value={form.numero_arboles} onChange={(e) => setForm((p) => ({ ...p, numero_arboles: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Has rastreadas</label>
                    <input type="number" step="0.01" min={0} value={form.has_rastreadas} onChange={(e) => setForm((p) => ({ ...p, has_rastreadas: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Hora</label>
                    <input type="time" value={form.hora} onChange={(e) => setForm((p) => ({ ...p, hora: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
              </fieldset>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Observaciones</label>
                <textarea rows={2} maxLength={200} value={form.observaciones} onChange={(e) => setForm((p) => ({ ...p, observaciones: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
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
