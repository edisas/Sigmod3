import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface Identificacion {
  id: number;
  revision_id: number;
  trampa_id: number | null;
  numero_semana: number | null;
  especie_mosca_id: number | null;
  hembras_silvestre: number;
  machos_silvestre: number;
  hembras_esteril: number;
  machos_esteril: number;
  tecnico_id: number | null;
  fecha: string | null;
  hora: string | null;
  estatus_id: number;
  trampa_numero: string | null;
  especie_mosca_nombre: string | null;
  tecnico_nombre: string | null;
}

interface RevisionOption { id: number; trampa_id: number; trampa_numero: string | null; numero_semana: number | null; fecha_revision: string | null; }
interface SimpleOption { id: number; nombre: string; }

const EMPTY = {
  id: null as number | null,
  revision_id: '' as number | '',
  especie_mosca_id: '' as number | '',
  hembras_silvestre: '0',
  machos_silvestre: '0',
  hembras_esteril: '0',
  machos_esteril: '0',
  tecnico_id: '' as number | '',
  fecha: '',
  hora: '',
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

export default function IdentificacionesPage() {
  const { activeStateName } = useAuth();
  const [items, setItems] = useState<Identificacion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [revisionFilter, setRevisionFilter] = useState<number | ''>('');
  const [especieFilter, setEspecieFilter] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [revisiones, setRevisiones] = useState<RevisionOption[]>([]);
  const [especies, setEspecies] = useState<SimpleOption[]>([]);
  const [tramperos, setTramperos] = useState<SimpleOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadCatalogos = useCallback(async () => {
    try {
      const [revs, esps, trs] = await Promise.all([
        fetchJson<{ items: RevisionOption[] }>(`${API_BASE}/revisiones/listado?estatus_id=1&page_size=500`).catch(() => ({ items: [] })),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/especies-mosca?estatus_id=1`).catch(() => []),
        fetchJson<{ items: SimpleOption[] }>(`${API_BASE}/tramperos/listado?estatus_id=1&page_size=500`).catch(() => ({ items: [] })),
      ]);
      setRevisiones(revs.items ?? []);
      setEspecies(Array.isArray(esps) ? esps : []);
      setTramperos(trs.items ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadCatalogos(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [loadCatalogos]);

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (statusFilter !== '') params.set('estatus_id', String(statusFilter));
      if (revisionFilter !== '') params.set('revision_id', String(revisionFilter));
      if (especieFilter !== '') params.set('especie_mosca_id', String(especieFilter));
      const data = await fetchJson<{ items: Identificacion[]; total: number }>(`${API_BASE}/identificaciones/listado?${params.toString()}`);
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      setItems([]); setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las identificaciones.');
    } finally { setIsLoading(false); }
  }, [page, pageSize, statusFilter, revisionFilter, especieFilter]);

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [load]);

  const openCreate = () => { setForm(EMPTY); setDrawerOpen(true); };
  const openEdit = (item: Identificacion) => {
    setForm({
      id: item.id,
      revision_id: item.revision_id,
      especie_mosca_id: item.especie_mosca_id ?? '',
      hembras_silvestre: String(item.hembras_silvestre),
      machos_silvestre: String(item.machos_silvestre),
      hembras_esteril: String(item.hembras_esteril),
      machos_esteril: String(item.machos_esteril),
      tecnico_id: item.tecnico_id ?? '',
      fecha: item.fecha ?? '',
      hora: item.hora ?? '',
      estatus_id: item.estatus_id,
    });
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setForm(EMPTY); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('');
    try {
      const body = {
        revision_id: Number(form.revision_id),
        especie_mosca_id: form.especie_mosca_id === '' ? null : Number(form.especie_mosca_id),
        hembras_silvestre: Number(form.hembras_silvestre || 0),
        machos_silvestre: Number(form.machos_silvestre || 0),
        hembras_esteril: Number(form.hembras_esteril || 0),
        machos_esteril: Number(form.machos_esteril || 0),
        tecnico_id: form.tecnico_id === '' ? null : Number(form.tecnico_id),
        fecha: form.fecha || null,
        hora: form.hora || null,
        estatus_id: Number(form.estatus_id),
      };
      if (form.id == null) {
        await fetchJson(`${API_BASE}/identificaciones`, { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Identificación creada.');
      } else {
        await fetchJson(`${API_BASE}/identificaciones/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Identificación actualizada.');
      }
      closeDrawer(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  };

  const inactivate = async (item: Identificacion) => {
    if (!window.confirm('¿Inactivar identificación?')) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/identificaciones/${item.id}`, { method: 'DELETE' });
      setSuccess('Identificación inactivada.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo inactivar.'); }
  };

  const revisionLabel = (r: RevisionOption) => `Trampa ${r.trampa_numero ?? r.trampa_id} · sem ${r.numero_semana ?? '?'}${r.fecha_revision ? ` · ${r.fecha_revision}` : ''}`;
  const total_capturado = (i: Identificacion) => i.hembras_silvestre + i.machos_silvestre + i.hembras_esteril + i.machos_esteril;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Identificaciones</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Conteos por especie en revisiones de {activeStateName ?? 'tu estado activo'}.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={openCreate}>
          <Icon name="add" className="text-base" /> Nueva identificación
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2 dark:bg-slate-800 dark:border-slate-700" value={revisionFilter} onChange={(e) => { setRevisionFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value="">Cualquier revisión</option>
          {revisiones.map((r) => <option key={r.id} value={r.id}>{revisionLabel(r)}</option>)}
        </select>
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={especieFilter} onChange={(e) => { setEspecieFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value="">Cualquier especie</option>
          {especies.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value={1}>Activas</option><option value={2}>Inactivas</option><option value="">Todas</option>
        </select>
        <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setRevisionFilter(''); setEspecieFilter(''); setStatusFilter(1); setPage(1); }}>Limpiar</button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{success}</div>}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-3">Trampa</th>
              <th className="text-left px-4 py-3">Sem</th>
              <th className="text-left px-4 py-3">Especie</th>
              <th className="text-right px-4 py-3">♀ silv</th>
              <th className="text-right px-4 py-3">♂ silv</th>
              <th className="text-right px-4 py-3">♀ esté</th>
              <th className="text-right px-4 py-3">♂ esté</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-left px-4 py-3">Estatus</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="px-4 py-4 text-slate-500" colSpan={10}>Cargando...</td></tr> :
             items.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={10}>Sin identificaciones registradas.</td></tr> :
             items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3 font-mono text-xs">{item.trampa_numero ?? `#${item.trampa_id ?? ''}`}</td>
                <td className="px-4 py-3">{item.numero_semana ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.especie_mosca_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3 text-right font-mono">{item.hembras_silvestre}</td>
                <td className="px-4 py-3 text-right font-mono">{item.machos_silvestre}</td>
                <td className="px-4 py-3 text-right font-mono">{item.hembras_esteril}</td>
                <td className="px-4 py-3 text-right font-mono">{item.machos_esteril}</td>
                <td className="px-4 py-3 text-right font-mono font-bold">{total_capturado(item)}</td>
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
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total} identificaciones</p>
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
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{form.id == null ? 'Nueva identificación' : 'Editar identificación'}</h2>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}><Icon name="close" className="text-xl" /></button>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Revisión</label>
                <select required value={form.revision_id} onChange={(e) => setForm((p) => ({ ...p, revision_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value="">— Seleccionar —</option>
                  {revisiones.map((r) => <option key={r.id} value={r.id}>{revisionLabel(r)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Especie de mosca</label>
                <select value={form.especie_mosca_id} onChange={(e) => setForm((p) => ({ ...p, especie_mosca_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value="">— Seleccionar —</option>
                  {especies.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Conteo</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">♀ silvestre</label>
                    <input type="number" min={0} value={form.hembras_silvestre} onChange={(e) => setForm((p) => ({ ...p, hembras_silvestre: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">♂ silvestre</label>
                    <input type="number" min={0} value={form.machos_silvestre} onChange={(e) => setForm((p) => ({ ...p, machos_silvestre: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">♀ estéril</label>
                    <input type="number" min={0} value={form.hembras_esteril} onChange={(e) => setForm((p) => ({ ...p, hembras_esteril: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">♂ estéril</label>
                    <input type="number" min={0} value={form.machos_esteril} onChange={(e) => setForm((p) => ({ ...p, machos_esteril: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
              </fieldset>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Técnico (trampero)</label>
                <select value={form.tecnico_id} onChange={(e) => setForm((p) => ({ ...p, tecnico_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value="">— Sin asignar —</option>
                  {tramperos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
