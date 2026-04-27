import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface UnidadItem {
  id: number;
  numero_inscripcion: string;
  nombre_unidad: string | null;
  productor_id: number | null;
  figura_cooperadora_id: number | null;
  nombre_propietario: string | null;
  direccion: string | null;
  telefono: string | null;
  ubicacion: string | null;
  municipio: string | null;
  zona: string | null;
  estado_id: number | null;
  municipio_id: number | null;
  especie_id: number | null;
  tipo_unidad_id: number | null;
  ruta_id: number | null;
  mercado_id: number | null;
  aprobado_exportacion: number;
  htl: number;
  activo: number;
  observaciones_sv02: string | null;
  estatus_id: number;
  productor_nombre: string | null;
  figura_cooperadora_nombre: string | null;
  estado_nombre: string | null;
  municipio_nombre: string | null;
}

interface UnidadesList {
  items: UnidadItem[];
  total: number;
  page: number;
  page_size: number;
}

interface ProductorOption {
  id: number;
  rfc: string;
  razon_social: string | null;
}

interface SimpleOption {
  id: number;
  nombre: string;
}

const EMPTY_FORM = {
  id: null as number | null,
  numero_inscripcion: '',
  nombre_unidad: '',
  productor_id: '' as number | '',
  figura_cooperadora_id: '' as number | '',
  nombre_propietario: '',
  direccion: '',
  telefono: '',
  ubicacion: '',
  municipio: '',
  zona: '',
  municipio_id: '' as number | '',
  especie_id: '' as number | '',
  tipo_unidad_id: '' as number | '',
  ruta_id: '' as number | '',
  mercado_id: '' as number | '',
  aprobado_exportacion: 0 as 0 | 1,
  htl: 0 as 0 | 1,
  activo: 1 as 0 | 1,
  observaciones_sv02: '',
  estatus_id: 1,
};

type FormState = typeof EMPTY_FORM;

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = String(body.detail);
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export default function UnidadesProduccionPage() {
  const { activeStateName } = useAuth();
  const [items, setItems] = useState<UnidadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [productorFilter, setProductorFilter] = useState<number | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [productores, setProductores] = useState<ProductorOption[]>([]);
  const [municipios, setMunicipios] = useState<SimpleOption[]>([]);
  const [figuras, setFiguras] = useState<SimpleOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadCatalogos = useCallback(async () => {
    try {
      const [prods, muns, figs] = await Promise.all([
        fetchJson<{ items: ProductorOption[] }>(`${API_BASE}/productores/listado?page=1&page_size=500&estatus_id=1`).catch(() => ({ items: [] })),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/municipios`).catch(() => []),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/figuras-cooperadoras`).catch(() => []),
      ]);
      setProductores(prods.items ?? []);
      setMunicipios(Array.isArray(muns) ? muns : []);
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
      if (productorFilter !== '') params.set('productor_id', String(productorFilter));
      const data = await fetchJson<UnidadesList>(`${API_BASE}/unidades-produccion/listado?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las unidades.');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, statusFilter, productorFilter]);

  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  const openCreate = () => { setForm(EMPTY_FORM); setDrawerOpen(true); };
  const openEdit = (item: UnidadItem) => {
    setForm({
      id: item.id,
      numero_inscripcion: item.numero_inscripcion,
      nombre_unidad: item.nombre_unidad ?? '',
      productor_id: item.productor_id ?? '',
      figura_cooperadora_id: item.figura_cooperadora_id ?? '',
      nombre_propietario: item.nombre_propietario ?? '',
      direccion: item.direccion ?? '',
      telefono: item.telefono ?? '',
      ubicacion: item.ubicacion ?? '',
      municipio: item.municipio ?? '',
      zona: item.zona ?? '',
      municipio_id: item.municipio_id ?? '',
      especie_id: item.especie_id ?? '',
      tipo_unidad_id: item.tipo_unidad_id ?? '',
      ruta_id: item.ruta_id ?? '',
      mercado_id: item.mercado_id ?? '',
      aprobado_exportacion: (item.aprobado_exportacion ? 1 : 0),
      htl: (item.htl ? 1 : 0),
      activo: (item.activo ? 1 : 0),
      observaciones_sv02: item.observaciones_sv02 ?? '',
      estatus_id: item.estatus_id,
    });
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setForm(EMPTY_FORM); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const body = {
        numero_inscripcion: form.numero_inscripcion.trim(),
        nombre_unidad: form.nombre_unidad.trim() || null,
        productor_id: form.productor_id === '' ? null : Number(form.productor_id),
        figura_cooperadora_id: form.figura_cooperadora_id === '' ? null : Number(form.figura_cooperadora_id),
        nombre_propietario: form.nombre_propietario.trim() || null,
        direccion: form.direccion.trim() || null,
        telefono: form.telefono.trim() || null,
        ubicacion: form.ubicacion.trim() || null,
        municipio: form.municipio.trim() || null,
        zona: form.zona.trim() || null,
        municipio_id: form.municipio_id === '' ? null : Number(form.municipio_id),
        especie_id: form.especie_id === '' ? null : Number(form.especie_id),
        tipo_unidad_id: form.tipo_unidad_id === '' ? null : Number(form.tipo_unidad_id),
        ruta_id: form.ruta_id === '' ? null : Number(form.ruta_id),
        mercado_id: form.mercado_id === '' ? null : Number(form.mercado_id),
        aprobado_exportacion: Number(form.aprobado_exportacion),
        htl: Number(form.htl),
        activo: Number(form.activo),
        observaciones_sv02: form.observaciones_sv02.trim() || null,
        estatus_id: Number(form.estatus_id),
      };
      if (form.id == null) {
        await fetchJson(`${API_BASE}/unidades-produccion`, { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Unidad creada.');
      } else {
        await fetchJson(`${API_BASE}/unidades-produccion/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Unidad actualizada.');
      }
      closeDrawer();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const inactivate = async (item: UnidadItem) => {
    if (!window.confirm(`¿Inactivar la unidad ${item.numero_inscripcion}?`)) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/unidades-produccion/${item.id}`, { method: 'DELETE' });
      setSuccess('Unidad inactivada.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo inactivar.');
    }
  };

  const productorLabel = (p: ProductorOption) => `${p.rfc} — ${p.razon_social ?? '(sin razón social)'}`;
  const productorIndex = useMemo(() => new Map(productores.map((p) => [p.id, productorLabel(p)])), [productores]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Unidades de producción</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Huertos / sv01_sv02 de {activeStateName ?? 'tu estado activo'}.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={openCreate}>
          <Icon name="add" className="text-base" /> Nueva unidad
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por NI, nombre o propietario"
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
          value={productorFilter}
          onChange={(e) => { setProductorFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}
        >
          <option value="">Cualquier productor</option>
          {productores.map((p) => <option key={p.id} value={p.id}>{productorLabel(p)}</option>)}
        </select>
        <div className="flex gap-2">
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setSearch(q); setPage(1); }}>Buscar</button>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setQ(''); setSearch(''); setStatusFilter(1); setProductorFilter(''); setPage(1); }}>Limpiar</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{success}</div>}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-3">No. inscripción</th>
              <th className="text-left px-4 py-3">Nombre / Propietario</th>
              <th className="text-left px-4 py-3">Productor</th>
              <th className="text-left px-4 py-3">Municipio</th>
              <th className="text-left px-4 py-3">Estatus</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-4 py-4 text-slate-500" colSpan={6}>Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td className="px-4 py-4 text-slate-500" colSpan={6}>Sin unidades registradas.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-3 font-mono text-xs">{item.numero_inscripcion}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{item.nombre_unidad ?? <span className="italic text-slate-400">—</span>}</div>
                    {item.nombre_propietario && <div className="text-xs text-slate-500">{item.nombre_propietario}</div>}
                  </td>
                  <td className="px-4 py-3">{item.productor_nombre ?? (item.productor_id ? productorIndex.get(item.productor_id) ?? `#${item.productor_id}` : <span className="italic text-slate-400">—</span>)}</td>
                  <td className="px-4 py-3">{item.municipio_nombre ?? item.municipio ?? <span className="italic text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">{item.estatus_id === 1 ? 'Activo' : 'Inactivo'}</td>
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
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total} unidades</p>
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
          <aside className="w-full max-w-2xl bg-white dark:bg-slate-900 shadow-xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{form.id == null ? 'Nueva unidad' : 'Editar unidad'}</h2>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}>
                <Icon name="close" className="text-xl" />
              </button>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Identificación</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">No. inscripción</label>
                    <input required maxLength={20} value={form.numero_inscripcion} onChange={(e) => setForm((p) => ({ ...p, numero_inscripcion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Nombre de la unidad</label>
                    <input maxLength={100} value={form.nombre_unidad} onChange={(e) => setForm((p) => ({ ...p, nombre_unidad: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Productor</label>
                    <select value={form.productor_id} onChange={(e) => setForm((p) => ({ ...p, productor_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                      <option value="">— Sin asignar —</option>
                      {productores.map((p) => <option key={p.id} value={p.id}>{productorLabel(p)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Figura cooperadora</label>
                    <select value={form.figura_cooperadora_id} onChange={(e) => setForm((p) => ({ ...p, figura_cooperadora_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                      <option value="">— Sin asignar —</option>
                      {figuras.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Nombre del propietario (texto libre)</label>
                  <input maxLength={100} value={form.nombre_propietario} onChange={(e) => setForm((p) => ({ ...p, nombre_propietario: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" placeholder="Solo si no hay productor formal asignado" />
                </div>
              </fieldset>

              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Ubicación</legend>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Dirección</label>
                  <input maxLength={150} value={form.direccion} onChange={(e) => setForm((p) => ({ ...p, direccion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Ubicación / Coordenadas</label>
                    <input maxLength={150} value={form.ubicacion} onChange={(e) => setForm((p) => ({ ...p, ubicacion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" placeholder="lat,lng o referencia" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Zona</label>
                    <input maxLength={100} value={form.zona} onChange={(e) => setForm((p) => ({ ...p, zona: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Municipio (catálogo)</label>
                    <select value={form.municipio_id} onChange={(e) => setForm((p) => ({ ...p, municipio_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                      <option value="">— Seleccionar —</option>
                      {municipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Teléfono</label>
                    <input maxLength={30} value={form.telefono} onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Operación</legend>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input type="checkbox" checked={form.activo === 1} onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked ? 1 : 0 }))} className="size-4 rounded border-slate-300 text-primary focus:ring-primary" />
                    Operativa (en producción)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input type="checkbox" checked={form.aprobado_exportacion === 1} onChange={(e) => setForm((p) => ({ ...p, aprobado_exportacion: e.target.checked ? 1 : 0 }))} className="size-4 rounded border-slate-300 text-primary focus:ring-primary" />
                    Aprobada para exportación
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input type="checkbox" checked={form.htl === 1} onChange={(e) => setForm((p) => ({ ...p, htl: e.target.checked ? 1 : 0 }))} className="size-4 rounded border-slate-300 text-primary focus:ring-primary" />
                    HTL (tratamiento térmico)
                  </label>
                </div>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Observaciones</label>
                  <textarea rows={2} maxLength={100} value={form.observaciones_sv02} onChange={(e) => setForm((p) => ({ ...p, observaciones_sv02: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
              </fieldset>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Estatus</label>
                <select value={form.estatus_id} onChange={(e) => setForm((p) => ({ ...p, estatus_id: Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value={1}>Activo</option>
                  <option value={2}>Inactivo</option>
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
