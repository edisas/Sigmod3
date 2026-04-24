import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/Icon';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface TipoFcoopItem {
  id: number;
  nombre: string;
  descripcion: string;
  estatus_id: number;
}

interface TipoFcoopListResponse {
  items: TipoFcoopItem[];
  total: number;
  page: number;
  page_size: number;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function CatalogTiposFcoopPage() {
  const navigate = useNavigate();
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const [items, setItems] = useState<TipoFcoopItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter !== '') params.set('estatus_id', String(statusFilter));

      const response = await fetch(`${API_BASE}/catalogos/tipos-fcoop/listado?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as TipoFcoopListResponse;
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setItems([]);
      setTotal(0);
      setError('No fue posible cargar el catálogo de Tipos de FCOOP.');
    } finally {
      setIsLoading(false);
    }
  }, [token, page, pageSize, search, statusFilter]);

  // setIsLoading(true) al inicio de load dispara set-state-in-effect — patrón
  // legítimo de "cargar en mount/cambio de filtros" que la regla v6 sobre-marca.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const inactivate = async (id: number) => {
    if (!token) return;
    if (!window.confirm('¿Deseas inactivar este tipo de FCOOP?')) return;
    const response = await fetch(`${API_BASE}/catalogos/tipos-fcoop/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setError('No se pudo inactivar el registro.');
      return;
    }
    await load();
  };

  const exportCurrent = () => {
    const rows = items.map((i) => [i.id, i.nombre, i.descripcion, i.estatus_id === 1 ? 'Activo' : 'Inactivo']);
    downloadCsv('catalogo_tipos_fcoop_vista.csv', ['ID', 'Nombre', 'Descripcion', 'Estatus'], rows);
    setExportOpen(false);
  };

  const exportAll = async () => {
    if (!token) return;
    const params = new URLSearchParams({ page: '1', page_size: '5000' });
    if (search.trim()) params.set('q', search.trim());
    if (statusFilter !== '') params.set('estatus_id', String(statusFilter));

    const response = await fetch(`${API_BASE}/catalogos/tipos-fcoop/listado?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setError('No se pudo exportar el catálogo completo.');
      return;
    }
    const data = (await response.json()) as TipoFcoopListResponse;
    const rows = data.items.map((i) => [i.id, i.nombre, i.descripcion, i.estatus_id === 1 ? 'Activo' : 'Inactivo']);
    downloadCsv('catalogo_tipos_fcoop_todo.csv', ['ID', 'Nombre', 'Descripcion', 'Estatus'], rows);
    setExportOpen(false);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Catálogo de Tipos de FCOOP</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Listado con búsqueda, filtros, exportación y paginado.</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2"
          onClick={() => navigate('/catalogos/tipos-fcoop/nuevo')}
        >
          <Icon name="add" className="text-base" /> Nuevo Tipo de FCOOP
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o descripción"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
        />
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            onClick={() => {
              setSearch(q);
              setPage(1);
            }}
          >
            Buscar
          </button>
          <button
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
        <div className="relative">
          <button className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setExportOpen((p) => !p)}>
            Exportar a Excel
          </button>
          {exportOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-md z-10">
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={exportCurrent}>Exportar vista actual</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={() => void exportAll()}>Exportar todo el catálogo</button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3">Nombre</th>
              <th className="text-left px-4 py-3">Descripción</th>
              <th className="text-left px-4 py-3">Estatus</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-4 py-4 text-slate-500" colSpan={4}>Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td className="px-4 py-4 text-slate-500" colSpan={4}>Sin registros</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{item.nombre}</td>
                  <td className="px-4 py-3">{item.descripcion}</td>
                  <td className="px-4 py-3">{item.estatus_id === 1 ? 'Activo' : 'Inactivo'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button className="rounded-md border border-primary px-2 py-1 text-primary" onClick={() => navigate(`/catalogos/tipos-fcoop/${item.id}/editar`)}>Editar</button>
                      <button className="rounded-md border border-red-300 px-2 py-1 text-red-700" onClick={() => void inactivate(item.id)}>Inactivar</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <p className="text-sm text-slate-600">Total: {total} registros</p>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Registros por página</label>
          <select
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
          <span className="text-sm text-slate-600">Página {page} de {totalPages}</span>
          <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente</button>
        </div>
      </div>
    </div>
  );
}
