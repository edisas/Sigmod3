import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface Anexo01 {
  id: number;
  productor_id: number;
  municipio_id: number;
  estado_id: number;
  colonia_id: number | null;
  calle: string | null;
  numero: string | null;
  codigo_postal: string;
  destino: string | null;
  latitud: string | null;
  longitud: string | null;
  medidas_fitosanitarias: string | null;
  numero_inscripcion: string | null;
  nombre_unidad: string | null;
  origen_producto: string | null;
  superficies: string | null;
  variedades: string | null;
  volumen_produccion: string | null;
  temporada: string | null;
  fecha_emision: string | null;
  lugar_emision: string | null;
  plagas_objetivo: string | null;
  ubicacion: string | null;
  ruta: string | null;
  estatus_id: number;
  productor_nombre: string | null;
  municipio_nombre: string | null;
  estado_nombre: string | null;
}

interface ProductorOption { id: number; razon_social: string | null; municipio_id: number | null; estado_id: number | null; }
interface SimpleOption { id: number; nombre: string; }

const EMPTY = {
  id: null as number | null,
  productor_id: '' as number | '',
  municipio_id: '' as number | '',
  estado_id: '' as number | '',
  colonia_id: '' as number | '',
  calle: '',
  numero: '',
  codigo_postal: '',
  destino: '',
  latitud: '',
  longitud: '',
  medidas_fitosanitarias: '',
  numero_inscripcion: '',
  nombre_unidad: '',
  origen_producto: '',
  superficies: '',
  variedades: '',
  volumen_produccion: '',
  temporada: '',
  fecha_emision: '',
  lugar_emision: '',
  plagas_objetivo: '',
  ubicacion: '',
  ruta: '',
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

export default function Anexos01Page() {
  const { activeStateName, activeStateId } = useAuth();
  const [items, setItems] = useState<Anexo01[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [productorFilter, setProductorFilter] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [productores, setProductores] = useState<ProductorOption[]>([]);
  const [municipios, setMunicipios] = useState<SimpleOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadCatalogos = useCallback(async () => {
    try {
      const [ps, ms] = await Promise.all([
        fetchJson<{ items: ProductorOption[] }>(`${API_BASE}/productores/listado?estatus_id=1&page_size=500`).catch(() => ({ items: [] })),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/municipios?estatus_id=1`).catch(() => []),
      ]);
      setProductores(ps.items ?? []);
      setMunicipios(Array.isArray(ms) ? ms : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadCatalogos(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [loadCatalogos]);

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (statusFilter !== '') params.set('estatus_id', String(statusFilter));
      if (productorFilter !== '') params.set('productor_id', String(productorFilter));
      const data = await fetchJson<{ items: Anexo01[]; total: number }>(`${API_BASE}/anexos-01/listado?${params.toString()}`);
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      setItems([]); setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los anexos.');
    } finally { setIsLoading(false); }
  }, [page, pageSize, statusFilter, productorFilter]);

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [load]);

  const openCreate = () => {
    setForm({ ...EMPTY, estado_id: activeStateId ?? '' });
    setDrawerOpen(true);
  };
  const openEdit = (item: Anexo01) => {
    setForm({
      id: item.id,
      productor_id: item.productor_id,
      municipio_id: item.municipio_id,
      estado_id: item.estado_id,
      colonia_id: item.colonia_id ?? '',
      calle: item.calle ?? '',
      numero: item.numero ?? '',
      codigo_postal: item.codigo_postal,
      destino: item.destino ?? '',
      latitud: item.latitud ?? '',
      longitud: item.longitud ?? '',
      medidas_fitosanitarias: item.medidas_fitosanitarias ?? '',
      numero_inscripcion: item.numero_inscripcion ?? '',
      nombre_unidad: item.nombre_unidad ?? '',
      origen_producto: item.origen_producto ?? '',
      superficies: item.superficies ?? '',
      variedades: item.variedades ?? '',
      volumen_produccion: item.volumen_produccion ?? '',
      temporada: item.temporada ?? '',
      fecha_emision: item.fecha_emision ? item.fecha_emision.slice(0, 16) : '',
      lugar_emision: item.lugar_emision ?? '',
      plagas_objetivo: item.plagas_objetivo ?? '',
      ubicacion: item.ubicacion ?? '',
      ruta: item.ruta ?? '',
      estatus_id: item.estatus_id,
    });
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setForm(EMPTY); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('');
    try {
      const body = {
        productor_id: Number(form.productor_id),
        municipio_id: Number(form.municipio_id),
        estado_id: Number(form.estado_id),
        colonia_id: form.colonia_id === '' ? null : Number(form.colonia_id),
        calle: form.calle || null,
        numero: form.numero || null,
        codigo_postal: form.codigo_postal,
        destino: form.destino || null,
        latitud: form.latitud || null,
        longitud: form.longitud || null,
        medidas_fitosanitarias: form.medidas_fitosanitarias || null,
        numero_inscripcion: form.numero_inscripcion || null,
        nombre_unidad: form.nombre_unidad || null,
        origen_producto: form.origen_producto || null,
        superficies: form.superficies || null,
        variedades: form.variedades || null,
        volumen_produccion: form.volumen_produccion || null,
        temporada: form.temporada || null,
        fecha_emision: form.fecha_emision || null,
        lugar_emision: form.lugar_emision || null,
        plagas_objetivo: form.plagas_objetivo || null,
        ubicacion: form.ubicacion || null,
        ruta: form.ruta || null,
        estatus_id: Number(form.estatus_id),
      };
      if (form.id == null) {
        await fetchJson(`${API_BASE}/anexos-01`, { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Anexo creado.');
      } else {
        await fetchJson(`${API_BASE}/anexos-01/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Anexo actualizado.');
      }
      closeDrawer(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  };

  const inactivate = async (item: Anexo01) => {
    if (!window.confirm('¿Inactivar anexo?')) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/anexos-01/${item.id}`, { method: 'DELETE' });
      setSuccess('Anexo inactivado.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo inactivar.'); }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Anexos 01 (TMIMF)</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Documento con datos de origen del productor para movilizacion en {activeStateName ?? 'tu estado activo'}.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={openCreate}>
          <Icon name="add" className="text-base" /> Nuevo anexo
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2 dark:bg-slate-800 dark:border-slate-700" value={productorFilter} onChange={(e) => { setProductorFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value="">Cualquier productor</option>
          {productores.map((p) => <option key={p.id} value={p.id}>{p.razon_social ?? `#${p.id}`}</option>)}
        </select>
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value={1}>Activos</option><option value={2}>Inactivos</option><option value="">Todos</option>
        </select>
        <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setProductorFilter(''); setStatusFilter(1); setPage(1); }}>Limpiar</button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{success}</div>}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-3">Productor</th>
              <th className="text-left px-4 py-3">Unidad</th>
              <th className="text-left px-4 py-3">Municipio</th>
              <th className="text-left px-4 py-3">Destino</th>
              <th className="text-left px-4 py-3">Variedades</th>
              <th className="text-left px-4 py-3">Emision</th>
              <th className="text-left px-4 py-3">Estatus</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="px-4 py-4 text-slate-500" colSpan={8}>Cargando...</td></tr> :
             items.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={8}>Sin anexos registrados.</td></tr> :
             items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3">{item.productor_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.nombre_unidad ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.municipio_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.destino ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.variedades ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.fecha_emision ? item.fecha_emision.slice(0, 10) : <span className="italic text-slate-400">—</span>}</td>
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
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total} anexos</p>
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
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{form.id == null ? 'Nuevo anexo 01' : 'Editar anexo 01'}</h2>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}><Icon name="close" className="text-xl" /></button>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Productor + ubicacion</legend>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Productor</label>
                  <select required value={form.productor_id} onChange={(e) => setForm((p) => ({ ...p, productor_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                    <option value="">— Seleccionar —</option>
                    {productores.map((s) => <option key={s.id} value={s.id}>{s.razon_social ?? `#${s.id}`}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Municipio</label>
                    <select required value={form.municipio_id} onChange={(e) => setForm((p) => ({ ...p, municipio_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                      <option value="">— Seleccionar —</option>
                      {municipios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Codigo postal</label>
                    <input required type="text" maxLength={10} value={form.codigo_postal} onChange={(e) => setForm((p) => ({ ...p, codigo_postal: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Calle</label>
                    <input type="text" maxLength={150} value={form.calle} onChange={(e) => setForm((p) => ({ ...p, calle: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">N°</label>
                    <input type="text" maxLength={45} value={form.numero} onChange={(e) => setForm((p) => ({ ...p, numero: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Latitud</label>
                    <input type="text" maxLength={15} value={form.latitud} onChange={(e) => setForm((p) => ({ ...p, latitud: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Longitud</label>
                    <input type="text" maxLength={15} value={form.longitud} onChange={(e) => setForm((p) => ({ ...p, longitud: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Unidad de produccion</legend>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Nombre de unidad</label>
                  <input type="text" maxLength={150} value={form.nombre_unidad} onChange={(e) => setForm((p) => ({ ...p, nombre_unidad: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">N° inscripcion</label>
                    <input type="text" maxLength={45} value={form.numero_inscripcion} onChange={(e) => setForm((p) => ({ ...p, numero_inscripcion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Temporada</label>
                    <input type="text" maxLength={45} value={form.temporada} onChange={(e) => setForm((p) => ({ ...p, temporada: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Variedades</label>
                  <input type="text" maxLength={150} value={form.variedades} onChange={(e) => setForm((p) => ({ ...p, variedades: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Superficies</label>
                  <input type="text" maxLength={150} value={form.superficies} onChange={(e) => setForm((p) => ({ ...p, superficies: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Volumen produccion</label>
                    <input type="text" maxLength={45} value={form.volumen_produccion} onChange={(e) => setForm((p) => ({ ...p, volumen_produccion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Origen producto</label>
                    <input type="text" maxLength={150} value={form.origen_producto} onChange={(e) => setForm((p) => ({ ...p, origen_producto: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Movilizacion</legend>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Destino</label>
                  <input type="text" maxLength={100} value={form.destino} onChange={(e) => setForm((p) => ({ ...p, destino: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Ruta</label>
                    <input type="text" maxLength={150} value={form.ruta} onChange={(e) => setForm((p) => ({ ...p, ruta: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Lugar emision</label>
                    <input type="text" maxLength={150} value={form.lugar_emision} onChange={(e) => setForm((p) => ({ ...p, lugar_emision: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Fecha emision</label>
                  <input type="datetime-local" value={form.fecha_emision} onChange={(e) => setForm((p) => ({ ...p, fecha_emision: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
              </fieldset>

              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Plagas + medidas</legend>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Plagas objetivo</label>
                  <textarea rows={2} value={form.plagas_objetivo} onChange={(e) => setForm((p) => ({ ...p, plagas_objetivo: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Medidas fitosanitarias</label>
                  <textarea rows={2} value={form.medidas_fitosanitarias} onChange={(e) => setForm((p) => ({ ...p, medidas_fitosanitarias: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Ubicacion (descripcion libre)</label>
                  <textarea rows={2} value={form.ubicacion} onChange={(e) => setForm((p) => ({ ...p, ubicacion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
              </fieldset>

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
