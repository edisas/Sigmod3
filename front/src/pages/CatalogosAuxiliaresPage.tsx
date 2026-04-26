import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '@/components/ui/Icon';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface CatalogoMeta {
  slug: string;
  label: string;
}

interface CatalogAuxItem {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  estatus_id: number;
  estados_aplicables: number[];
  estados_aplicables_nombres: string[];
}

interface CatalogAuxList {
  items: CatalogAuxItem[];
  total: number;
  page: number;
  page_size: number;
}

interface EstadoOption {
  id: number;
  nombre: string;
}

const EMPTY_FORM = {
  id: null as number | null,
  clave: '',
  nombre: '',
  descripcion: '',
  estatus_id: 1,
  estados_aplicables: [] as number[],
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
      /* ignore JSON parse errors */
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export default function CatalogosAuxiliaresPage() {
  const navigate = useNavigate();
  const { slug: slugParam } = useParams<{ slug?: string }>();

  const [catalogos, setCatalogos] = useState<CatalogoMeta[]>([]);
  const [estadosCatalog, setEstadosCatalog] = useState<EstadoOption[]>([]);
  const [items, setItems] = useState<CatalogAuxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const slug = slugParam ?? catalogos[0]?.slug ?? '';
  const selected = useMemo(() => catalogos.find((c) => c.slug === slug), [catalogos, slug]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Cargar lista de catálogos disponibles + lista de estados (para multi-select del drawer).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cats, estados] = await Promise.all([
          fetchJson<CatalogoMeta[]>(`${API_BASE}/catalogos/auxiliares/`),
          fetchJson<EstadoOption[]>(`${API_BASE}/catalogos/estados`),
        ]);
        if (!alive) return;
        setCatalogos(cats);
        setEstadosCatalog(estados);
        if (!slugParam && cats.length > 0) {
          navigate(`/catalogos/auxiliares/${cats[0].slug}`, { replace: true });
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'No se pudo cargar la lista de catálogos.');
      }
    })();
    return () => {
      alive = false;
    };
    // slugParam intencional fuera de deps: la redirección inicial corre una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadItems = useCallback(async () => {
    if (!slug) return;
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter !== '') params.set('estatus_id', String(statusFilter));
      const data = await fetchJson<CatalogAuxList>(
        `${API_BASE}/catalogos/auxiliares/${slug}/listado?${params.toString()}`,
      );
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo.');
    } finally {
      setIsLoading(false);
    }
  }, [slug, page, pageSize, search, statusFilter]);

  useEffect(() => {
    void loadItems(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [loadItems]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDrawerOpen(true);
  };

  const openEdit = (item: CatalogAuxItem) => {
    setForm({
      id: item.id,
      clave: item.clave,
      nombre: item.nombre,
      descripcion: item.descripcion ?? '',
      estatus_id: item.estatus_id,
      estados_aplicables: [...item.estados_aplicables],
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setForm(EMPTY_FORM);
  };

  const toggleEstado = (estadoId: number) => {
    setForm((prev) => {
      const exists = prev.estados_aplicables.includes(estadoId);
      return {
        ...prev,
        estados_aplicables: exists
          ? prev.estados_aplicables.filter((x) => x !== estadoId)
          : [...prev.estados_aplicables, estadoId],
      };
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!slug) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const body = {
        clave: form.clave.trim(),
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        estatus_id: form.estatus_id,
        estados_aplicables: form.estados_aplicables,
      };
      if (form.id == null) {
        await fetchJson(`${API_BASE}/catalogos/auxiliares/${slug}`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setSuccess('Registro creado.');
      } else {
        await fetchJson(`${API_BASE}/catalogos/auxiliares/${slug}/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        setSuccess('Registro actualizado.');
      }
      closeDrawer();
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const inactivate = async (item: CatalogAuxItem) => {
    if (!slug) return;
    if (!window.confirm(`¿Inactivar "${item.nombre}"?`)) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/catalogos/auxiliares/${slug}/${item.id}`, { method: 'DELETE' });
      setSuccess('Registro inactivado.');
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo inactivar.');
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar de catálogos */}
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-bold tracking-wider text-slate-700 dark:text-slate-200 uppercase">
            Catálogos auxiliares
          </h2>
        </div>
        <nav className="py-2">
          {catalogos.map((c) => (
            <button
              key={c.slug}
              type="button"
              className={`w-full text-left px-4 py-2 text-sm border-l-4 transition-colors ${
                c.slug === slug
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              onClick={() => {
                navigate(`/catalogos/auxiliares/${c.slug}`);
                setPage(1);
                setQ('');
                setSearch('');
              }}
            >
              {c.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Contenido principal */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {selected?.label ?? 'Selecciona un catálogo'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                Catálogo nacional. Cada entrada declara los estados en que aplica.
              </p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2 disabled:opacity-50"
              onClick={openCreate}
              disabled={!slug}
            >
              <Icon name="add" className="text-base" /> Nuevo
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por clave o nombre"
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

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">
              {success}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  <th className="text-left px-4 py-3">Clave</th>
                  <th className="text-left px-4 py-3">Nombre</th>
                  <th className="text-left px-4 py-3">Estados aplicables</th>
                  <th className="text-left px-4 py-3">Estatus</th>
                  <th className="text-right px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-500" colSpan={5}>
                      Cargando...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-500" colSpan={5}>
                      Sin registros
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-4 py-3 font-mono text-xs">{item.clave}</td>
                      <td className="px-4 py-3">{item.nombre}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {item.estados_aplicables_nombres.length === 0
                          ? <span className="italic text-slate-400">Ninguno</span>
                          : item.estados_aplicables_nombres.join(', ')}
                      </td>
                      <td className="px-4 py-3">{item.estatus_id === 1 ? 'Activo' : 'Inactivo'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            className="rounded-md border border-primary px-2 py-1 text-primary"
                            onClick={() => openEdit(item)}
                          >
                            Editar
                          </button>
                          {item.estatus_id === 1 && (
                            <button
                              className="rounded-md border border-red-300 px-2 py-1 text-red-700"
                              onClick={() => void inactivate(item)}
                            >
                              Inactivar
                            </button>
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
            <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total} registros</p>
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
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-700"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-300">
                Página {page} de {totalPages}
              </span>
              <button
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-700"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Drawer de edición */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={closeDrawer} aria-hidden="true" />
          <aside className="w-full max-w-md bg-white dark:bg-slate-900 shadow-xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {form.id == null ? 'Nuevo registro' : 'Editar registro'}
              </h2>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-800 dark:hover:text-white"
                onClick={closeDrawer}
                aria-label="Cerrar"
              >
                <Icon name="close" className="text-xl" />
              </button>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Clave (slug, sin espacios)
                </label>
                <input
                  required
                  pattern="^[a-z0-9][a-z0-9_-]{0,39}$"
                  value={form.clave}
                  onChange={(e) => setForm((prev) => ({ ...prev, clave: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700"
                  placeholder="ej: ataulfo"
                />
                <p className="text-xs text-slate-500 mt-1">Minúsculas, números, guiones (-) y guion bajo (_).</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Nombre
                </label>
                <input
                  required
                  maxLength={120}
                  value={form.nombre}
                  onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Descripción
                </label>
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={form.descripcion}
                  onChange={(e) => setForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Estatus
                </label>
                <select
                  value={form.estatus_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, estatus_id: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value={1}>Activo</option>
                  <option value={2}>Inactivo</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Estados aplicables ({form.estados_aplicables.length} seleccionados)
                </label>
                <div className="rounded-lg border border-slate-300 dark:border-slate-700 max-h-64 overflow-y-auto">
                  {estadosCatalog.map((est) => {
                    const checked = form.estados_aplicables.includes(est.id);
                    return (
                      <label
                        key={est.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEstado(est.id)}
                        />
                        <span className="text-slate-700 dark:text-slate-200">{est.nombre}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Si no marcas ninguno, el registro no será visible para usuarios estatales.
                </p>
              </div>
            </form>
            <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
                onClick={closeDrawer}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-50"
                onClick={submit}
                disabled={saving}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
