import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface ProductorItem {
  id: number;
  tipo_persona: string;
  rfc: string;
  razon_social: string | null;
  calle: string | null;
  numero_interior: string | null;
  numero_exterior: string | null;
  colonia_id: number | null;
  municipio_id: number | null;
  estado_id: number | null;
  codigo_postal: string | null;
  telefono: string | null;
  correo_electronico: string | null;
  estatus_id: number;
  figura_cooperadora_id: number | null;
  estado_nombre: string | null;
  municipio_nombre: string | null;
  figura_cooperadora_nombre: string | null;
}

interface ProductoresList {
  items: ProductorItem[];
  total: number;
  page: number;
  page_size: number;
}

interface MunicipioOption {
  id: number;
  nombre: string;
}

interface FiguraOption {
  id: number;
  nombre: string;
  nombre_corto?: string;
}

const EMPTY_FORM = {
  id: null as number | null,
  tipo_persona: 'fisica',
  rfc: '',
  razon_social: '',
  calle: '',
  numero_interior: '',
  numero_exterior: '',
  colonia_id: '' as number | '',
  municipio_id: '' as number | '',
  codigo_postal: '',
  telefono: '',
  correo_electronico: '',
  estatus_id: 1,
  figura_cooperadora_id: '' as number | '',
};

type FormState = typeof EMPTY_FORM;

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export default function ProductoresPage() {
  const { activeStateName } = useAuth();
  const [items, setItems] = useState<ProductorItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [municipios, setMunicipios] = useState<MunicipioOption[]>([]);
  const [figuras, setFiguras] = useState<FiguraOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadCatalogos = useCallback(async () => {
    try {
      const [muns, figs] = await Promise.all([
        fetchJson<MunicipioOption[]>(`${API_BASE}/catalogos/municipios`).catch(() => []),
        fetchJson<FiguraOption[]>(`${API_BASE}/catalogos/figuras-cooperadoras`).catch(() => []),
      ]);
      setMunicipios(Array.isArray(muns) ? muns : []);
      setFiguras(Array.isArray(figs) ? figs : []);
    } catch {
      /* ignore catalog load errors */
    }
  }, []);

  useEffect(() => {
    void loadCatalogos(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [loadCatalogos]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter !== '') params.set('estatus_id', String(statusFilter));
      const data = await fetchJson<ProductoresList>(`${API_BASE}/productores/listado?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los productores.');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, statusFilter]);

  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDrawerOpen(true);
  };

  const openEdit = (item: ProductorItem) => {
    setForm({
      id: item.id,
      tipo_persona: item.tipo_persona,
      rfc: item.rfc,
      razon_social: item.razon_social ?? '',
      calle: item.calle ?? '',
      numero_interior: item.numero_interior ?? '',
      numero_exterior: item.numero_exterior ?? '',
      colonia_id: item.colonia_id ?? '',
      municipio_id: item.municipio_id ?? '',
      codigo_postal: item.codigo_postal ?? '',
      telefono: item.telefono ?? '',
      correo_electronico: item.correo_electronico ?? '',
      estatus_id: item.estatus_id,
      figura_cooperadora_id: item.figura_cooperadora_id ?? '',
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setForm(EMPTY_FORM);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const body = {
        tipo_persona: form.tipo_persona,
        rfc: form.rfc.trim().toUpperCase(),
        razon_social: form.razon_social.trim() || null,
        calle: form.calle.trim() || null,
        numero_interior: form.numero_interior.trim() || null,
        numero_exterior: form.numero_exterior.trim() || null,
        colonia_id: form.colonia_id === '' ? null : Number(form.colonia_id),
        municipio_id: form.municipio_id === '' ? null : Number(form.municipio_id),
        codigo_postal: form.codigo_postal.trim() || null,
        telefono: form.telefono.trim() || null,
        correo_electronico: form.correo_electronico.trim() || null,
        estatus_id: Number(form.estatus_id),
        figura_cooperadora_id: form.figura_cooperadora_id === '' ? null : Number(form.figura_cooperadora_id),
      };
      if (form.id == null) {
        await fetchJson(`${API_BASE}/productores`, { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Productor creado.');
      } else {
        await fetchJson(`${API_BASE}/productores/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Productor actualizado.');
      }
      closeDrawer();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const inactivate = async (item: ProductorItem) => {
    if (!window.confirm(`¿Inactivar al productor ${item.rfc} - ${item.razon_social ?? 'S/N'}?`)) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/productores/${item.id}`, { method: 'DELETE' });
      setSuccess('Productor inactivado.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo inactivar.');
    }
  };

  const figurasIndex = useMemo(() => new Map(figuras.map((f) => [f.id, f.nombre_corto ?? f.nombre])), [figuras]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Productores</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Catálogo de productores de {activeStateName ?? 'tu estado activo'}.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={openCreate}>
          <Icon name="add" className="text-base" /> Nuevo productor
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por RFC, razón social o correo"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2 dark:bg-slate-800 dark:border-slate-700"
        />
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value ? Number(e.target.value) : '');
            setPage(1);
          }}
        >
          <option value={1}>Activos</option>
          <option value={2}>Inactivos</option>
          <option value="">Todos</option>
        </select>
        <div className="flex gap-2">
          <button
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
            onClick={() => {
              setSearch(q);
              setPage(1);
            }}
          >
            Buscar
          </button>
          <button
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
            onClick={() => {
              setQ('');
              setSearch('');
              setStatusFilter(1);
              setPage(1);
            }}
          >
            Limpiar
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{success}</div>}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-3">RFC</th>
              <th className="text-left px-4 py-3">Razón social / Nombre</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Municipio</th>
              <th className="text-left px-4 py-3">Figura cooperadora</th>
              <th className="text-left px-4 py-3">Estatus</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-4 py-4 text-slate-500" colSpan={7}>Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td className="px-4 py-4 text-slate-500" colSpan={7}>Sin productores registrados.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-3 font-mono text-xs">{item.rfc}</td>
                  <td className="px-4 py-3">{item.razon_social ?? <span className="italic text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 capitalize">{item.tipo_persona}</td>
                  <td className="px-4 py-3">{item.municipio_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">{item.figura_cooperadora_nombre ?? (item.figura_cooperadora_id ? figurasIndex.get(item.figura_cooperadora_id) ?? `#${item.figura_cooperadora_id}` : <span className="italic text-slate-400">—</span>)}</td>
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
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total} productores</p>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 dark:text-slate-300">Por página</label>
          <select
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-700"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
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
          <aside className="w-full max-w-lg bg-white dark:bg-slate-900 shadow-xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{form.id == null ? 'Nuevo productor' : 'Editar productor'}</h2>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}>
                <Icon name="close" className="text-xl" />
              </button>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Tipo de persona</label>
                  <select required value={form.tipo_persona} onChange={(e) => setForm((p) => ({ ...p, tipo_persona: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                    <option value="fisica">Física</option>
                    <option value="moral">Moral</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">RFC</label>
                  <input required maxLength={13} value={form.rfc} onChange={(e) => setForm((p) => ({ ...p, rfc: e.target.value.toUpperCase() }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase dark:bg-slate-800 dark:border-slate-700" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Razón social / Nombre completo</label>
                <input maxLength={200} value={form.razon_social} onChange={(e) => setForm((p) => ({ ...p, razon_social: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
              </div>

              <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">Domicilio</legend>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 md:col-span-7">
                    <label className="block text-xs text-slate-600 mb-1">Calle</label>
                    <input maxLength={150} value={form.calle} onChange={(e) => setForm((p) => ({ ...p, calle: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <label className="block text-xs text-slate-600 mb-1">No. ext</label>
                    <input maxLength={45} value={form.numero_exterior} onChange={(e) => setForm((p) => ({ ...p, numero_exterior: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className="block text-xs text-slate-600 mb-1">No. int</label>
                    <input maxLength={45} value={form.numero_interior} onChange={(e) => setForm((p) => ({ ...p, numero_interior: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-8">
                    <label className="block text-xs text-slate-600 mb-1">Municipio</label>
                    <select value={form.municipio_id} onChange={(e) => setForm((p) => ({ ...p, municipio_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                      <option value="">— Seleccionar —</option>
                      {municipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <label className="block text-xs text-slate-600 mb-1">Código postal</label>
                    <input maxLength={5} value={form.codigo_postal} onChange={(e) => setForm((p) => ({ ...p, codigo_postal: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                  </div>
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Teléfono</label>
                  <input maxLength={45} value={form.telefono} onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Correo electrónico</label>
                  <input type="email" maxLength={200} value={form.correo_electronico} onChange={(e) => setForm((p) => ({ ...p, correo_electronico: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Figura cooperadora</label>
                <select value={form.figura_cooperadora_id} onChange={(e) => setForm((p) => ({ ...p, figura_cooperadora_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                  <option value="">— Sin asignar —</option>
                  {figuras.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </select>
              </div>

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
