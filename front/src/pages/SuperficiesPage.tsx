import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface Superficie {
  id: number;
  unidad_produccion_id: number;
  variedad_id: number;
  superficie: number | null;
  fenologia_id: number | null;
  facturado: number;
  folio_factura: string | null;
  ejercicio_fiscal: string | null;
  estatus_id: number;
  unidad_produccion_ni: string | null;
  unidad_produccion_nombre: string | null;
  variedad_nombre: string | null;
  fenologia_descripcion: string | null;
}

interface UnidadOption { id: number; numero_inscripcion: string; nombre_unidad: string | null; }
interface SimpleOption { id: number; nombre: string; }
interface FenologiaOption { id: number; descripcion: string; }

const EMPTY = {
  id: null as number | null,
  unidad_produccion_id: '' as number | '',
  variedad_id: '' as number | '',
  superficie: '',
  fenologia_id: '' as number | '',
  facturado: 0 as 0 | 1,
  folio_factura: '',
  ejercicio_fiscal: String(new Date().getFullYear()),
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

export default function SuperficiesPage() {
  const { activeStateName } = useAuth();
  const [items, setItems] = useState<Superficie[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [unidadFilter, setUnidadFilter] = useState<number | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [unidades, setUnidades] = useState<UnidadOption[]>([]);
  const [variedades, setVariedades] = useState<SimpleOption[]>([]);
  const [fenologias, setFenologias] = useState<FenologiaOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadCatalogos = useCallback(async () => {
    try {
      const [us, vs, fs] = await Promise.all([
        fetchJson<{ items: UnidadOption[] }>(`${API_BASE}/unidades-produccion/listado?estatus_id=1&page_size=500`).catch(() => ({ items: [] })),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/variedades?estatus_id=1`).catch(() => []),
        fetchJson<{ items: FenologiaOption[] }>(`${API_BASE}/estados-fenologicos/listado?estatus_id=1`).catch(() => ({ items: [] })),
      ]);
      setUnidades(us.items ?? []);
      setVariedades(Array.isArray(vs) ? vs : []);
      setFenologias(fs.items ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadCatalogos(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [loadCatalogos]);

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (statusFilter !== '') params.set('estatus_id', String(statusFilter));
      if (unidadFilter !== '') params.set('unidad_produccion_id', String(unidadFilter));
      const data = await fetchJson<{ items: Superficie[]; total: number }>(`${API_BASE}/superficies/listado?${params.toString()}`);
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      setItems([]); setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las superficies.');
    } finally { setIsLoading(false); }
  }, [page, pageSize, statusFilter, unidadFilter]);

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [load]);

  const openCreate = () => { setForm(EMPTY); setDrawerOpen(true); };
  const openEdit = (item: Superficie) => {
    setForm({
      id: item.id,
      unidad_produccion_id: item.unidad_produccion_id,
      variedad_id: item.variedad_id,
      superficie: item.superficie == null ? '' : String(item.superficie),
      fenologia_id: item.fenologia_id ?? '',
      facturado: (item.facturado ? 1 : 0),
      folio_factura: item.folio_factura ?? '',
      ejercicio_fiscal: item.ejercicio_fiscal ?? '',
      estatus_id: item.estatus_id,
    });
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setForm(EMPTY); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('');
    try {
      const body = {
        unidad_produccion_id: Number(form.unidad_produccion_id),
        variedad_id: Number(form.variedad_id),
        superficie: form.superficie === '' ? null : Number(form.superficie),
        fenologia_id: form.fenologia_id === '' ? null : Number(form.fenologia_id),
        facturado: Number(form.facturado),
        folio_factura: form.folio_factura.trim() || null,
        ejercicio_fiscal: form.ejercicio_fiscal.trim() || null,
        estatus_id: Number(form.estatus_id),
      };
      if (form.id == null) {
        await fetchJson(`${API_BASE}/superficies`, { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Superficie registrada.');
      } else {
        await fetchJson(`${API_BASE}/superficies/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Superficie actualizada.');
      }
      closeDrawer(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  };

  const inactivate = async (item: Superficie) => {
    if (!window.confirm(`¿Inactivar superficie de ${item.unidad_produccion_ni} - ${item.variedad_nombre}?`)) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/superficies/${item.id}`, { method: 'DELETE' });
      setSuccess('Superficie inactivada.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo inactivar.'); }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Superficies registradas</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Hectáreas sembradas por (unidad × variedad) en {activeStateName ?? 'tu estado activo'}.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={openCreate}>
          <Icon name="add" className="text-base" /> Nueva superficie
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2 dark:bg-slate-800 dark:border-slate-700" value={unidadFilter} onChange={(e) => { setUnidadFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value="">Cualquier unidad de producción</option>
          {unidades.map((u) => <option key={u.id} value={u.id}>{u.numero_inscripcion}{u.nombre_unidad ? ` - ${u.nombre_unidad}` : ''}</option>)}
        </select>
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value={1}>Activas</option><option value={2}>Inactivas</option><option value="">Todas</option>
        </select>
        <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setUnidadFilter(''); setStatusFilter(1); setPage(1); }}>Limpiar</button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{success}</div>}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-3">Unidad</th>
              <th className="text-left px-4 py-3">Variedad</th>
              <th className="text-right px-4 py-3">Superficie (ha)</th>
              <th className="text-left px-4 py-3">Fenología</th>
              <th className="text-left px-4 py-3">Facturación</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="px-4 py-4 text-slate-500" colSpan={6}>Cargando...</td></tr> :
             items.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={6}>Sin superficies registradas.</td></tr> :
             items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3">
                  <div className="font-mono text-xs">{item.unidad_produccion_ni}</div>
                  {item.unidad_produccion_nombre && <div className="text-xs text-slate-500">{item.unidad_produccion_nombre}</div>}
                </td>
                <td className="px-4 py-3">{item.variedad_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3 text-right font-mono">{item.superficie ?? '—'}</td>
                <td className="px-4 py-3">{item.fenologia_descripcion ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">
                  {item.facturado === 1 ? (
                    <div className="text-xs">
                      <span className="text-emerald-700 font-semibold">Facturada</span>
                      {item.folio_factura && <span className="text-slate-500"> · {item.folio_factura}</span>}
                      {item.ejercicio_fiscal && <span className="text-slate-500"> ({item.ejercicio_fiscal})</span>}
                    </div>
                  ) : <span className="text-slate-500 text-xs">Pendiente</span>}
                </td>
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
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total} superficies</p>
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
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{form.id == null ? 'Nueva superficie' : 'Editar superficie'}</h2>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}><Icon name="close" className="text-xl" /></button>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Unidad de producción</label>
                <select required disabled={form.id != null} value={form.unidad_produccion_id} onChange={(e) => setForm((p) => ({ ...p, unidad_produccion_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 disabled:opacity-60">
                  <option value="">— Seleccionar —</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.numero_inscripcion}{u.nombre_unidad ? ` - ${u.nombre_unidad}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Variedad</label>
                <select required disabled={form.id != null} value={form.variedad_id} onChange={(e) => setForm((p) => ({ ...p, variedad_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 disabled:opacity-60">
                  <option value="">— Seleccionar —</option>
                  {variedades.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Superficie (ha)</label>
                <input type="number" step="any" required value={form.superficie} onChange={(e) => setForm((p) => ({ ...p, superficie: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Estado fenológico</label>
                <select value={form.fenologia_id} onChange={(e) => setForm((p) => ({ ...p, fenologia_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value="">— Sin asignar —</option>
                  {fenologias.map((f) => <option key={f.id} value={f.id}>{f.descripcion}</option>)}
                </select>
                <p className="text-xs text-slate-500 mt-1">Captura los estados fenológicos directamente en BD por ahora.</p>
              </div>
              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Facturación</legend>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={form.facturado === 1} onChange={(e) => setForm((p) => ({ ...p, facturado: e.target.checked ? 1 : 0 }))} className="size-4 rounded border-slate-300 text-primary focus:ring-primary" />
                  Facturada
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Folio factura</label>
                    <input maxLength={45} value={form.folio_factura} onChange={(e) => setForm((p) => ({ ...p, folio_factura: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Ejercicio fiscal</label>
                    <input maxLength={4} value={form.ejercicio_fiscal} onChange={(e) => setForm((p) => ({ ...p, ejercicio_fiscal: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
              </fieldset>
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
