import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface IdentificacionLab {
  id: number;
  numero_muestra: string | null;
  fecha_diseccion: string | null;
  especie_mosca_id: number | null;
  numero_larvas: number;
  larvas_1e: number;
  larvas_2e: number;
  larvas_3e: number;
  observaciones: string | null;
  numero_semana: number | null;
  fecha: string | null;
  hora: string | null;
  area_id: number | null;
  estado_id: number | null;
  estatus_id: number;
  especie_mosca_nombre: string | null;
  area_nombre: string | null;
  estado_nombre: string | null;
}

interface SimpleOption { id: number; nombre: string; }

const EMPTY = {
  id: null as number | null,
  numero_muestra: '',
  fecha_diseccion: '',
  especie_mosca_id: '' as number | '',
  numero_larvas: '0',
  larvas_1e: '0',
  larvas_2e: '0',
  larvas_3e: '0',
  observaciones: '',
  numero_semana: '' as number | '',
  fecha: '',
  hora: '',
  area_id: '' as number | '',
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

export default function IdentificacionesLabPage() {
  const { activeStateName } = useAuth();
  const [items, setItems] = useState<IdentificacionLab[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [especieFilter, setEspecieFilter] = useState<number | ''>('');
  const [semanaFilter, setSemanaFilter] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [especies, setEspecies] = useState<SimpleOption[]>([]);
  const [areas, setAreas] = useState<SimpleOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadCatalogos = useCallback(async () => {
    try {
      const [esps, ars] = await Promise.all([
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/especies-mosca?estatus_id=1`).catch(() => []),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/areas?estatus_id=1`).catch(() => []),
      ]);
      setEspecies(Array.isArray(esps) ? esps : []);
      setAreas(Array.isArray(ars) ? ars : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadCatalogos(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [loadCatalogos]);

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (statusFilter !== '') params.set('estatus_id', String(statusFilter));
      if (especieFilter !== '') params.set('especie_mosca_id', String(especieFilter));
      if (semanaFilter !== '') params.set('numero_semana', String(semanaFilter));
      const data = await fetchJson<{ items: IdentificacionLab[]; total: number }>(`${API_BASE}/identificaciones-lab/listado?${params.toString()}`);
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      setItems([]); setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las identificaciones de laboratorio.');
    } finally { setIsLoading(false); }
  }, [page, pageSize, statusFilter, especieFilter, semanaFilter]);

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [load]);

  const openCreate = () => { setForm(EMPTY); setDrawerOpen(true); };
  const openEdit = (item: IdentificacionLab) => {
    setForm({
      id: item.id,
      numero_muestra: item.numero_muestra ?? '',
      fecha_diseccion: item.fecha_diseccion ?? '',
      especie_mosca_id: item.especie_mosca_id ?? '',
      numero_larvas: String(item.numero_larvas),
      larvas_1e: String(item.larvas_1e),
      larvas_2e: String(item.larvas_2e),
      larvas_3e: String(item.larvas_3e),
      observaciones: item.observaciones ?? '',
      numero_semana: item.numero_semana ?? '',
      fecha: item.fecha ?? '',
      hora: item.hora ?? '',
      area_id: item.area_id ?? '',
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
        fecha_diseccion: form.fecha_diseccion || null,
        especie_mosca_id: form.especie_mosca_id === '' ? null : Number(form.especie_mosca_id),
        numero_larvas: Number(form.numero_larvas || 0),
        larvas_1e: Number(form.larvas_1e || 0),
        larvas_2e: Number(form.larvas_2e || 0),
        larvas_3e: Number(form.larvas_3e || 0),
        observaciones: form.observaciones || null,
        numero_semana: form.numero_semana === '' ? null : Number(form.numero_semana),
        fecha: form.fecha || null,
        hora: form.hora || null,
        area_id: form.area_id === '' ? null : Number(form.area_id),
        estatus_id: Number(form.estatus_id),
      };
      if (form.id == null) {
        await fetchJson(`${API_BASE}/identificaciones-lab`, { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Identificación de laboratorio creada.');
      } else {
        await fetchJson(`${API_BASE}/identificaciones-lab/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Identificación de laboratorio actualizada.');
      }
      closeDrawer(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  };

  const inactivate = async (item: IdentificacionLab) => {
    if (!window.confirm('¿Inactivar identificación de laboratorio?')) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/identificaciones-lab/${item.id}`, { method: 'DELETE' });
      setSuccess('Identificación de laboratorio inactivada.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo inactivar.'); }
  };

  const totalLarvas = (i: IdentificacionLab) => i.larvas_1e + i.larvas_2e + i.larvas_3e;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Identificaciones de laboratorio</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Disecciones de muestras de fruta — conteo de larvas por estadio (1°, 2°, 3°) en {activeStateName ?? 'tu estado activo'}.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={openCreate}>
          <Icon name="add" className="text-base" /> Nueva diseccion
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2 dark:bg-slate-800 dark:border-slate-700" value={especieFilter} onChange={(e) => { setEspecieFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value="">Cualquier especie</option>
          {especies.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <input type="number" min={1} max={53} placeholder="Semana" className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={semanaFilter} onChange={(e) => { setSemanaFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }} />
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value={1}>Activas</option><option value={2}>Inactivas</option><option value="">Todas</option>
        </select>
        <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setEspecieFilter(''); setSemanaFilter(''); setStatusFilter(1); setPage(1); }}>Limpiar</button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{success}</div>}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-3">Muestra</th>
              <th className="text-left px-4 py-3">Diseccion</th>
              <th className="text-left px-4 py-3">Sem</th>
              <th className="text-left px-4 py-3">Especie</th>
              <th className="text-left px-4 py-3">Area</th>
              <th className="text-right px-4 py-3">1° instar</th>
              <th className="text-right px-4 py-3">2° instar</th>
              <th className="text-right px-4 py-3">3° instar</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-left px-4 py-3">Estatus</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="px-4 py-4 text-slate-500" colSpan={11}>Cargando...</td></tr> :
             items.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={11}>Sin disecciones registradas.</td></tr> :
             items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3 font-mono text-xs">{item.numero_muestra ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.fecha_diseccion ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.numero_semana ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.especie_mosca_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.area_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3 text-right font-mono">{item.larvas_1e}</td>
                <td className="px-4 py-3 text-right font-mono">{item.larvas_2e}</td>
                <td className="px-4 py-3 text-right font-mono">{item.larvas_3e}</td>
                <td className="px-4 py-3 text-right font-mono font-bold">{totalLarvas(item)}</td>
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
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total} disecciones</p>
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
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{form.id == null ? 'Nueva diseccion' : 'Editar diseccion'}</h2>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}><Icon name="close" className="text-xl" /></button>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">N° de muestra</label>
                  <input type="text" maxLength={60} value={form.numero_muestra} onChange={(e) => setForm((p) => ({ ...p, numero_muestra: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Fecha de diseccion</label>
                  <input type="date" value={form.fecha_diseccion} onChange={(e) => setForm((p) => ({ ...p, fecha_diseccion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Especie de mosca</label>
                <select value={form.especie_mosca_id} onChange={(e) => setForm((p) => ({ ...p, especie_mosca_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value="">— Seleccionar —</option>
                  {especies.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Conteo de larvas</legend>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">1° instar</label>
                    <input type="number" min={0} value={form.larvas_1e} onChange={(e) => setForm((p) => ({ ...p, larvas_1e: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">2° instar</label>
                    <input type="number" min={0} value={form.larvas_2e} onChange={(e) => setForm((p) => ({ ...p, larvas_2e: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">3° instar</label>
                    <input type="number" min={0} value={form.larvas_3e} onChange={(e) => setForm((p) => ({ ...p, larvas_3e: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Total de larvas (informativo)</label>
                  <input type="number" min={0} value={form.numero_larvas} onChange={(e) => setForm((p) => ({ ...p, numero_larvas: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                </div>
              </fieldset>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Area</label>
                <select value={form.area_id} onChange={(e) => setForm((p) => ({ ...p, area_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value="">— Seleccionar —</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Semana</label>
                  <input type="number" min={1} max={53} value={form.numero_semana} onChange={(e) => setForm((p) => ({ ...p, numero_semana: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Fecha</label>
                  <input type="date" value={form.fecha} onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Hora</label>
                  <input type="time" value={form.hora} onChange={(e) => setForm((p) => ({ ...p, hora: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Observaciones</label>
                <textarea rows={2} maxLength={200} value={form.observaciones} onChange={(e) => setForm((p) => ({ ...p, observaciones: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
              </div>
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
