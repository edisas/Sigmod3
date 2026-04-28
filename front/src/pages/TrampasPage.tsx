import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface Trampa {
  id: number;
  numero_trampa: string;
  numero_trampa_ref: string | null;
  ruta_id: number | null;
  unidad_produccion_id: number | null;
  figura_cooperadora_id: number | null;
  tecnico_id: number | null;
  hospedero_id: number | null;
  area_id: number | null;
  tipo_trampa_id: number | null;
  latitud: number | null;
  longitud: number | null;
  altitud: number | null;
  fecha_colocacion: string | null;
  fecha_ultima_revision: string | null;
  estado_id: number | null;
  estatus_id: number;
  estado_nombre: string | null;
  ruta_nombre: string | null;
  unidad_produccion_nombre: string | null;
  unidad_produccion_ni: string | null;
  tipo_trampa_nombre: string | null;
  tecnico_nombre: string | null;
  hospedero_nombre: string | null;
  figura_cooperadora_nombre: string | null;
}

interface SimpleOption { id: number; nombre: string; }
interface RutaOption { id: number; nombre: string; }
interface UnidadOption { id: number; numero_inscripcion: string; nombre_unidad: string | null; }
interface TramperoOption { id: number; nombre: string; }

const EMPTY = {
  id: null as number | null,
  numero_trampa: '',
  numero_trampa_ref: '',
  ruta_id: '' as number | '',
  unidad_produccion_id: '' as number | '',
  figura_cooperadora_id: '' as number | '',
  tecnico_id: '' as number | '',
  hospedero_id: '' as number | '',
  area_id: '' as number | '',
  tipo_trampa_id: '' as number | '',
  latitud: '',
  longitud: '',
  altitud: '',
  fecha_colocacion: '',
  fecha_ultima_revision: '',
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

export default function TrampasPage() {
  const { activeStateName } = useAuth();
  const [items, setItems] = useState<Trampa[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [rutaFilter, setRutaFilter] = useState<number | ''>('');
  const [tipoFilter, setTipoFilter] = useState<number | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [rutas, setRutas] = useState<RutaOption[]>([]);
  const [unidades, setUnidades] = useState<UnidadOption[]>([]);
  const [tipos, setTipos] = useState<SimpleOption[]>([]);
  const [tramperos, setTramperos] = useState<TramperoOption[]>([]);
  const [hospederos, setHospederos] = useState<SimpleOption[]>([]);
  const [figuras, setFiguras] = useState<SimpleOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadCatalogos = useCallback(async () => {
    try {
      const [rs, us, tps, trs, hs, figs] = await Promise.all([
        fetchJson<{ items: RutaOption[] }>(`${API_BASE}/rutas/listado?estatus_id=1&page_size=200`).catch(() => ({ items: [] })),
        fetchJson<{ items: UnidadOption[] }>(`${API_BASE}/unidades-produccion/listado?estatus_id=1&page_size=500`).catch(() => ({ items: [] })),
        fetchJson<{ items: SimpleOption[] }>(`${API_BASE}/tipos-trampa/listado?estatus_id=1&page_size=200`).catch(() => ({ items: [] })),
        fetchJson<{ items: TramperoOption[] }>(`${API_BASE}/tramperos/listado?estatus_id=1&page_size=500`).catch(() => ({ items: [] })),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/hospederos?estatus_id=1`).catch(() => []),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/figuras-cooperadoras`).catch(() => []),
      ]);
      setRutas(rs.items ?? []);
      setUnidades(us.items ?? []);
      setTipos(tps.items ?? []);
      setTramperos(trs.items ?? []);
      setHospederos(Array.isArray(hs) ? hs : []);
      setFiguras(Array.isArray(figs) ? figs : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadCatalogos(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [loadCatalogos]);

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter !== '') params.set('estatus_id', String(statusFilter));
      if (rutaFilter !== '') params.set('ruta_id', String(rutaFilter));
      if (tipoFilter !== '') params.set('tipo_trampa_id', String(tipoFilter));
      const data = await fetchJson<{ items: Trampa[]; total: number }>(`${API_BASE}/trampas/listado?${params.toString()}`);
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      setItems([]); setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las trampas.');
    } finally { setIsLoading(false); }
  }, [page, pageSize, search, statusFilter, rutaFilter, tipoFilter]);

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [load]);

  const openCreate = () => { setForm(EMPTY); setDrawerOpen(true); };
  const openEdit = (item: Trampa) => {
    setForm({
      id: item.id,
      numero_trampa: item.numero_trampa,
      numero_trampa_ref: item.numero_trampa_ref ?? '',
      ruta_id: item.ruta_id ?? '',
      unidad_produccion_id: item.unidad_produccion_id ?? '',
      figura_cooperadora_id: item.figura_cooperadora_id ?? '',
      tecnico_id: item.tecnico_id ?? '',
      hospedero_id: item.hospedero_id ?? '',
      area_id: item.area_id ?? '',
      tipo_trampa_id: item.tipo_trampa_id ?? '',
      latitud: item.latitud == null ? '' : String(item.latitud),
      longitud: item.longitud == null ? '' : String(item.longitud),
      altitud: item.altitud == null ? '' : String(item.altitud),
      fecha_colocacion: item.fecha_colocacion ?? '',
      fecha_ultima_revision: item.fecha_ultima_revision ?? '',
      estatus_id: item.estatus_id,
    });
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setForm(EMPTY); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('');
    try {
      const body = {
        numero_trampa: form.numero_trampa.trim(),
        numero_trampa_ref: form.numero_trampa_ref.trim() || null,
        ruta_id: form.ruta_id === '' ? null : Number(form.ruta_id),
        unidad_produccion_id: form.unidad_produccion_id === '' ? null : Number(form.unidad_produccion_id),
        figura_cooperadora_id: form.figura_cooperadora_id === '' ? null : Number(form.figura_cooperadora_id),
        tecnico_id: form.tecnico_id === '' ? null : Number(form.tecnico_id),
        hospedero_id: form.hospedero_id === '' ? null : Number(form.hospedero_id),
        area_id: form.area_id === '' ? null : Number(form.area_id),
        tipo_trampa_id: form.tipo_trampa_id === '' ? null : Number(form.tipo_trampa_id),
        latitud: form.latitud === '' ? null : Number(form.latitud),
        longitud: form.longitud === '' ? null : Number(form.longitud),
        altitud: form.altitud === '' ? null : Number(form.altitud),
        fecha_colocacion: form.fecha_colocacion || null,
        fecha_ultima_revision: form.fecha_ultima_revision || null,
        estatus_id: Number(form.estatus_id),
      };
      if (form.id == null) {
        await fetchJson(`${API_BASE}/trampas`, { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Trampa creada.');
      } else {
        await fetchJson(`${API_BASE}/trampas/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Trampa actualizada.');
      }
      closeDrawer(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  };

  const inactivate = async (item: Trampa) => {
    if (!window.confirm(`¿Inactivar la trampa "${item.numero_trampa}"?`)) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/trampas/${item.id}`, { method: 'DELETE' });
      setSuccess('Trampa inactivada.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo inactivar.'); }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Trampas</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Dispositivos físicos asignados a rutas y unidades de producción en {activeStateName ?? 'tu estado activo'}.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={openCreate}>
          <Icon name="add" className="text-base" /> Nueva trampa
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por número de trampa o ref" className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2 dark:bg-slate-800 dark:border-slate-700" />
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value={1}>Activas</option><option value={2}>Inactivas</option><option value="">Todas</option>
        </select>
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={rutaFilter} onChange={(e) => { setRutaFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value="">Cualquier ruta</option>
          {rutas.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={tipoFilter} onChange={(e) => { setTipoFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value="">Cualquier tipo</option>
          {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <div className="flex gap-2">
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setSearch(q); setPage(1); }}>Buscar</button>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setQ(''); setSearch(''); setStatusFilter(1); setRutaFilter(''); setTipoFilter(''); setPage(1); }}>Limpiar</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{success}</div>}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-3">No. trampa</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Ruta</th>
              <th className="text-left px-4 py-3">Unidad de producción</th>
              <th className="text-left px-4 py-3">Trampero</th>
              <th className="text-left px-4 py-3">Estatus</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="px-4 py-4 text-slate-500" colSpan={7}>Cargando...</td></tr> :
             items.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={7}>Sin trampas registradas.</td></tr> :
             items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3 font-mono text-xs">
                  <div className="font-medium">{item.numero_trampa}</div>
                  {item.numero_trampa_ref && <div className="text-xs text-slate-500">ref: {item.numero_trampa_ref}</div>}
                </td>
                <td className="px-4 py-3">{item.tipo_trampa_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.ruta_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">
                  {item.unidad_produccion_ni ? (
                    <div>
                      <div className="font-mono text-xs">{item.unidad_produccion_ni}</div>
                      {item.unidad_produccion_nombre && <div className="text-xs text-slate-500">{item.unidad_produccion_nombre}</div>}
                    </div>
                  ) : <span className="italic text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3">{item.tecnico_nombre ?? <span className="italic text-slate-400">—</span>}</td>
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
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total} trampas</p>
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
          <aside className="w-full max-w-2xl bg-white dark:bg-slate-900 shadow-xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{form.id == null ? 'Nueva trampa' : 'Editar trampa'}</h2>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}><Icon name="close" className="text-xl" /></button>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Identificación</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Número de trampa</label>
                    <input required maxLength={50} value={form.numero_trampa} onChange={(e) => setForm((p) => ({ ...p, numero_trampa: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Número ref. (legacy)</label>
                    <input maxLength={15} value={form.numero_trampa_ref} onChange={(e) => setForm((p) => ({ ...p, numero_trampa_ref: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Tipo de trampa</label>
                  <select value={form.tipo_trampa_id} onChange={(e) => setForm((p) => ({ ...p, tipo_trampa_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                    <option value="">— Seleccionar —</option>
                    {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
              </fieldset>

              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Asignación</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Ruta</label>
                    <select value={form.ruta_id} onChange={(e) => setForm((p) => ({ ...p, ruta_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                      <option value="">— Sin ruta —</option>
                      {rutas.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Unidad de producción</label>
                    <select value={form.unidad_produccion_id} onChange={(e) => setForm((p) => ({ ...p, unidad_produccion_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                      <option value="">— Sin unidad —</option>
                      {unidades.map((u) => <option key={u.id} value={u.id}>{u.numero_inscripcion}{u.nombre_unidad ? ` - ${u.nombre_unidad}` : ''}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Trampero</label>
                    <select value={form.tecnico_id} onChange={(e) => setForm((p) => ({ ...p, tecnico_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                      <option value="">— Sin asignar —</option>
                      {tramperos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Hospedero</label>
                    <select value={form.hospedero_id} onChange={(e) => setForm((p) => ({ ...p, hospedero_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                      <option value="">— Sin asignar —</option>
                      {hospederos.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Figura cooperadora</label>
                  <select value={form.figura_cooperadora_id} onChange={(e) => setForm((p) => ({ ...p, figura_cooperadora_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                    <option value="">— Sin asignar —</option>
                    {figuras.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                  </select>
                </div>
              </fieldset>

              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Ubicación</legend>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Latitud</label>
                    <input type="number" step="any" value={form.latitud} onChange={(e) => setForm((p) => ({ ...p, latitud: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Longitud</label>
                    <input type="number" step="any" value={form.longitud} onChange={(e) => setForm((p) => ({ ...p, longitud: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Altitud (m)</label>
                    <input type="number" value={form.altitud} onChange={(e) => setForm((p) => ({ ...p, altitud: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Fechas</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Fecha colocación</label>
                    <input type="date" value={form.fecha_colocacion} onChange={(e) => setForm((p) => ({ ...p, fecha_colocacion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Fecha última revisión</label>
                    <input type="date" value={form.fecha_ultima_revision} onChange={(e) => setForm((p) => ({ ...p, fecha_ultima_revision: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
              </fieldset>

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
