import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface MuestreoFruto {
  id: number;
  numero_muestra: string | null;
  fecha_muestreo: string | null;
  fecha_diseccion: string | null;
  unidad_produccion_id: number | null;
  numero_frutos: number;
  kgs_muestreados: number;
  kgs_disectados: number;
  frutos_infestados: number;
  tipo_colecta_id: number | null;
  tecnico_id: number | null;
  area_id: number | null;
  numero_semana: number | null;
  hora: string | null;
  muestreador_id: number | null;
  variedad_id: number | null;
  camara_maduracion: number;
  estado_id: number | null;
  estatus_id: number;
  unidad_nombre: string | null;
  tipo_colecta_nombre: string | null;
  area_nombre: string | null;
  variedad_nombre: string | null;
  muestreador_nombre: string | null;
  estado_nombre: string | null;
}

interface SimpleOption { id: number; nombre: string; }
interface UnidadOption { id: number; nombre: string | null; clave?: string | null; }

const EMPTY = {
  id: null as number | null,
  numero_muestra: '',
  fecha_muestreo: '',
  fecha_diseccion: '',
  unidad_produccion_id: '' as number | '',
  numero_frutos: '0',
  kgs_muestreados: '0',
  kgs_disectados: '0',
  frutos_infestados: '0',
  tipo_colecta_id: '' as number | '',
  area_id: '' as number | '',
  numero_semana: '' as number | '',
  hora: '',
  muestreador_id: '' as number | '',
  variedad_id: '' as number | '',
  camara_maduracion: 0,
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

export default function MuestreosFrutosPage() {
  const { activeStateName } = useAuth();
  const [items, setItems] = useState<MuestreoFruto[]>([]);
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
  const [variedades, setVariedades] = useState<SimpleOption[]>([]);
  const [tiposColecta, setTiposColecta] = useState<SimpleOption[]>([]);
  const [tramperos, setTramperos] = useState<SimpleOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadCatalogos = useCallback(async () => {
    try {
      const [ars, ups, vs, tc, trs] = await Promise.all([
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/areas?estatus_id=1`).catch(() => []),
        fetchJson<{ items: UnidadOption[] }>(`${API_BASE}/unidades-produccion/listado?estatus_id=1&page_size=500`).catch(() => ({ items: [] })),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/variedades?estatus_id=1`).catch(() => []),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/tipos-colecta?estatus_id=1`).catch(() => []),
        fetchJson<{ items: SimpleOption[] }>(`${API_BASE}/tramperos/listado?estatus_id=1&page_size=500`).catch(() => ({ items: [] })),
      ]);
      setAreas(Array.isArray(ars) ? ars : []);
      setUnidades(ups.items ?? []);
      setVariedades(Array.isArray(vs) ? vs : []);
      setTiposColecta(Array.isArray(tc) ? tc : []);
      setTramperos(trs.items ?? []);
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
      const data = await fetchJson<{ items: MuestreoFruto[]; total: number }>(`${API_BASE}/muestreos-frutos/listado?${params.toString()}`);
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      setItems([]); setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los muestreos.');
    } finally { setIsLoading(false); }
  }, [page, pageSize, statusFilter, unidadFilter, semanaFilter]);

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [load]);

  const openCreate = () => { setForm(EMPTY); setDrawerOpen(true); };
  const openEdit = (item: MuestreoFruto) => {
    setForm({
      id: item.id,
      numero_muestra: item.numero_muestra ?? '',
      fecha_muestreo: item.fecha_muestreo ?? '',
      fecha_diseccion: item.fecha_diseccion ?? '',
      unidad_produccion_id: item.unidad_produccion_id ?? '',
      numero_frutos: String(item.numero_frutos),
      kgs_muestreados: String(item.kgs_muestreados),
      kgs_disectados: String(item.kgs_disectados),
      frutos_infestados: String(item.frutos_infestados),
      tipo_colecta_id: item.tipo_colecta_id ?? '',
      area_id: item.area_id ?? '',
      numero_semana: item.numero_semana ?? '',
      hora: item.hora ?? '',
      muestreador_id: item.muestreador_id ?? '',
      variedad_id: item.variedad_id ?? '',
      camara_maduracion: item.camara_maduracion,
      estatus_id: item.estatus_id,
    });
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setForm(EMPTY); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('');
    try {
      const body = {
        numero_muestra: form.numero_muestra || null,
        fecha_muestreo: form.fecha_muestreo || null,
        fecha_diseccion: form.fecha_diseccion || null,
        unidad_produccion_id: form.unidad_produccion_id === '' ? null : Number(form.unidad_produccion_id),
        numero_frutos: Number(form.numero_frutos || 0),
        kgs_muestreados: Number(form.kgs_muestreados || 0),
        kgs_disectados: Number(form.kgs_disectados || 0),
        frutos_infestados: Number(form.frutos_infestados || 0),
        tipo_colecta_id: form.tipo_colecta_id === '' ? null : Number(form.tipo_colecta_id),
        area_id: form.area_id === '' ? null : Number(form.area_id),
        numero_semana: form.numero_semana === '' ? null : Number(form.numero_semana),
        hora: form.hora || null,
        muestreador_id: form.muestreador_id === '' ? null : Number(form.muestreador_id),
        variedad_id: form.variedad_id === '' ? null : Number(form.variedad_id),
        camara_maduracion: Number(form.camara_maduracion),
        estatus_id: Number(form.estatus_id),
      };
      if (form.id == null) {
        await fetchJson(`${API_BASE}/muestreos-frutos`, { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Muestreo creado.');
      } else {
        await fetchJson(`${API_BASE}/muestreos-frutos/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Muestreo actualizado.');
      }
      closeDrawer(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  };

  const inactivate = async (item: MuestreoFruto) => {
    if (!window.confirm('¿Inactivar muestreo?')) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/muestreos-frutos/${item.id}`, { method: 'DELETE' });
      setSuccess('Muestreo inactivado.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo inactivar.'); }
  };

  const tasaInfestacion = (i: MuestreoFruto) => {
    if (!i.numero_frutos) return '—';
    const pct = (i.frutos_infestados / i.numero_frutos) * 100;
    return `${pct.toFixed(2)}%`;
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Muestreos de frutos</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Corte directo de frutos + diseccion para detectar infestacion en {activeStateName ?? 'tu estado activo'}.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={openCreate}>
          <Icon name="add" className="text-base" /> Nuevo muestreo
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
              <th className="text-left px-4 py-3">Muestra</th>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-4 py-3">Sem</th>
              <th className="text-left px-4 py-3">Unidad</th>
              <th className="text-left px-4 py-3">Variedad</th>
              <th className="text-right px-4 py-3">Frutos</th>
              <th className="text-right px-4 py-3">Kgs muestr.</th>
              <th className="text-right px-4 py-3">Infestados</th>
              <th className="text-right px-4 py-3">% inf.</th>
              <th className="text-left px-4 py-3">Estatus</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="px-4 py-4 text-slate-500" colSpan={11}>Cargando...</td></tr> :
             items.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={11}>Sin muestreos registrados.</td></tr> :
             items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3 font-mono text-xs">{item.numero_muestra ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.fecha_muestreo ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.numero_semana ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.unidad_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.variedad_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3 text-right font-mono">{item.numero_frutos}</td>
                <td className="px-4 py-3 text-right font-mono">{item.kgs_muestreados}</td>
                <td className="px-4 py-3 text-right font-mono">{item.frutos_infestados}</td>
                <td className="px-4 py-3 text-right font-mono font-bold">{tasaInfestacion(item)}</td>
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
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total} muestreos</p>
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
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{form.id == null ? 'Nuevo muestreo' : 'Editar muestreo'}</h2>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}><Icon name="close" className="text-xl" /></button>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">N° de muestra</label>
                  <input type="text" maxLength={60} value={form.numero_muestra} onChange={(e) => setForm((p) => ({ ...p, numero_muestra: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Semana</label>
                  <input type="number" min={1} max={53} value={form.numero_semana} onChange={(e) => setForm((p) => ({ ...p, numero_semana: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Fecha muestreo</label>
                  <input type="date" value={form.fecha_muestreo} onChange={(e) => setForm((p) => ({ ...p, fecha_muestreo: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Fecha diseccion</label>
                  <input type="date" value={form.fecha_diseccion} onChange={(e) => setForm((p) => ({ ...p, fecha_diseccion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
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
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Variedad</label>
                  <select value={form.variedad_id} onChange={(e) => setForm((p) => ({ ...p, variedad_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                    <option value="">— Seleccionar —</option>
                    {variedades.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Tipo de colecta</label>
                  <select value={form.tipo_colecta_id} onChange={(e) => setForm((p) => ({ ...p, tipo_colecta_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                    <option value="">— Seleccionar —</option>
                    {tiposColecta.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Muestreador</label>
                  <select value={form.muestreador_id} onChange={(e) => setForm((p) => ({ ...p, muestreador_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                    <option value="">— Sin asignar —</option>
                    {tramperos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Area</label>
                  <select value={form.area_id} onChange={(e) => setForm((p) => ({ ...p, area_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                    <option value="">— Seleccionar —</option>
                    {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
              </div>
              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Conteo</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">N° de frutos</label>
                    <input type="number" min={0} value={form.numero_frutos} onChange={(e) => setForm((p) => ({ ...p, numero_frutos: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Frutos infestados</label>
                    <input type="number" min={0} value={form.frutos_infestados} onChange={(e) => setForm((p) => ({ ...p, frutos_infestados: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Kgs muestreados</label>
                    <input type="number" step="0.01" min={0} value={form.kgs_muestreados} onChange={(e) => setForm((p) => ({ ...p, kgs_muestreados: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Kgs disectados</label>
                    <input type="number" step="0.01" min={0} value={form.kgs_disectados} onChange={(e) => setForm((p) => ({ ...p, kgs_disectados: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Hora</label>
                  <input type="time" value={form.hora} onChange={(e) => setForm((p) => ({ ...p, hora: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.camara_maduracion === 1} onChange={(e) => setForm((p) => ({ ...p, camara_maduracion: e.target.checked ? 1 : 0 }))} className="rounded border-slate-300" />
                    Cámara de maduración
                  </label>
                </div>
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
