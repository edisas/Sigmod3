import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/Icon';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface EstadoItem {
  id: number;
  nombre: string;
}

interface TipoItem {
  id: number;
  nombre: string;
}

interface FiguraItem {
  id: number;
  nombre: string;
  nombre_corto: string;
  tipo_figura_id: number;
  tipo_figura_nombre?: string | null;
  estado_id: number;
  estado_nombre?: string | null;
  contacto_nombre?: string | null;
  correo_electronico: string;
  telefono: string;
  celular_contacto: string;
  estatus_id: number;
}

interface FiguraListResponse {
  items: FiguraItem[];
  total: number;
  page: number;
  page_size: number;
}

function getErrorMessage(errorValue: unknown): string {
  if (errorValue instanceof Error) return errorValue.message;
  return 'Error desconocido';
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

export default function CatalogFigurasCooperadorasPage() {
  const navigate = useNavigate();
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);

  const [items, setItems] = useState<FiguraItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [estadoFilter, setEstadoFilter] = useState<number | ''>('');
  const [tipoFilter, setTipoFilter] = useState<number | ''>('');
  const [estados, setEstados] = useState<EstadoItem[]>([]);
  const [tipos, setTipos] = useState<TipoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    const loadCatalogs = async () => {
      if (!token) return;
      const [estadosResp, tiposResp] = await Promise.all([
        fetch(`${API_BASE}/catalogos/estados?estatus_id=1`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/catalogos/tipos-fcoop?estatus_id=1`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (estadosResp.ok) {
        const data = (await estadosResp.json()) as EstadoItem[];
        setEstados(data);
      }
      if (tiposResp.ok) {
        const data = (await tiposResp.json()) as TipoItem[];
        setTipos(data);
      }
    };

    void loadCatalogs();
  }, [token]);

  const load = async () => {
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
      if (estadoFilter !== '') params.set('estado_id', String(estadoFilter));
      if (tipoFilter !== '') params.set('tipo_figura_id', String(tipoFilter));

      const response = await fetch(`${API_BASE}/catalogos/figuras-cooperadoras/listado?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as FiguraListResponse;
      setItems(data.items);
      setTotal(data.total);
    } catch (errorValue) {
      try {
        const fallbackParams = new URLSearchParams({
          limit: String(pageSize),
          offset: String((page - 1) * pageSize),
        });
        if (statusFilter !== '') fallbackParams.set('estatus_id', String(statusFilter));
        if (estadoFilter !== '') fallbackParams.set('estado_id', String(estadoFilter));
        if (tipoFilter !== '') fallbackParams.set('tipo_figura_id', String(tipoFilter));

        const fallbackResponse = await fetch(`${API_BASE}/catalogos/figuras-cooperadoras?${fallbackParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!fallbackResponse.ok) throw new Error(`HTTP ${fallbackResponse.status}`);
        const fallbackItems = (await fallbackResponse.json()) as FiguraItem[];
        const filteredItems = search.trim()
          ? fallbackItems.filter((item) => {
              const term = search.trim().toLowerCase();
              return (
                item.nombre.toLowerCase().includes(term) ||
                item.nombre_corto.toLowerCase().includes(term) ||
                (item.tipo_figura_nombre ?? '').toLowerCase().includes(term) ||
                (item.estado_nombre ?? '').toLowerCase().includes(term) ||
                (item.contacto_nombre ?? '').toLowerCase().includes(term) ||
                item.correo_electronico.toLowerCase().includes(term) ||
                item.telefono.toLowerCase().includes(term) ||
                item.celular_contacto.toLowerCase().includes(term)
              );
            })
          : fallbackItems;
        setItems(filteredItems);
        setTotal((page - 1) * pageSize + filteredItems.length + (filteredItems.length === pageSize ? 1 : 0));
        setError('Se cargó el catálogo en modo compatibilidad (fallback).');
      } catch (fallbackError) {
        const message = `${getErrorMessage(errorValue)} | fallback: ${getErrorMessage(fallbackError)}`;
        setItems([]);
        setTotal(0);
        setError(`No fue posible cargar el catálogo de Figuras Cooperadoras. (${message})`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token, page, pageSize, search, statusFilter, estadoFilter, tipoFilter]);

  const inactivate = async (id: number) => {
    if (!token) return;
    if (!window.confirm('¿Deseas inactivar esta Figura Cooperadora?')) return;
    const response = await fetch(`${API_BASE}/catalogos/figuras-cooperadoras/${id}`, {
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
    const rows = items.map((i) => [
      i.id,
      i.nombre,
      i.nombre_corto,
      i.tipo_figura_nombre ?? '',
      i.estado_nombre ?? '',
      i.correo_electronico,
      i.telefono,
      i.celular_contacto,
      i.estatus_id === 1 ? 'Activo' : 'Inactivo',
    ]);
    downloadCsv('catalogo_figuras_cooperadoras_vista.csv', ['ID', 'Nombre', 'Nombre corto', 'Tipo', 'Estado', 'Correo', 'Telefono', 'Celular contacto', 'Estatus'], rows);
    setExportOpen(false);
  };

  const exportAll = async () => {
    if (!token) return;
    const params = new URLSearchParams({ page: '1', page_size: '5000' });
    if (search.trim()) params.set('q', search.trim());
    if (statusFilter !== '') params.set('estatus_id', String(statusFilter));
    if (estadoFilter !== '') params.set('estado_id', String(estadoFilter));
    if (tipoFilter !== '') params.set('tipo_figura_id', String(tipoFilter));

    const response = await fetch(`${API_BASE}/catalogos/figuras-cooperadoras/listado?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setError('No se pudo exportar el catálogo completo.');
      return;
    }
    const data = (await response.json()) as FiguraListResponse;
    const rows = data.items.map((i) => [
      i.id,
      i.nombre,
      i.nombre_corto,
      i.tipo_figura_nombre ?? '',
      i.estado_nombre ?? '',
      i.correo_electronico,
      i.telefono,
      i.celular_contacto,
      i.estatus_id === 1 ? 'Activo' : 'Inactivo',
    ]);
    downloadCsv('catalogo_figuras_cooperadoras_todo.csv', ['ID', 'Nombre', 'Nombre corto', 'Tipo', 'Estado', 'Correo', 'Telefono', 'Celular contacto', 'Estatus'], rows);
    setExportOpen(false);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Catálogo Figura Cooperadora</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Listado con búsqueda, filtros, exportación y paginado.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={() => navigate('/catalogos/figuras-cooperadoras/nuevo')}>
          <Icon name="add" className="text-base" /> Nueva Figura Cooperadora
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, tipo, estado o contacto"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
        />

        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={estadoFilter}
          onChange={(e) => {
            setEstadoFilter(e.target.value ? Number(e.target.value) : '');
            setPage(1);
          }}
        >
          <option value="">Todos los estados</option>
          {estados.map((item) => (
            <option key={item.id} value={item.id}>{item.nombre}</option>
          ))}
        </select>

        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={tipoFilter}
          onChange={(e) => {
            setTipoFilter(e.target.value ? Number(e.target.value) : '');
            setPage(1);
          }}
        >
          <option value="">Todos los tipos</option>
          {tipos.map((item) => (
            <option key={item.id} value={item.id}>{item.nombre}</option>
          ))}
        </select>

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
              setEstadoFilter('');
              setTipoFilter('');
              setPage(1);
            }}
          >
            Limpiar
          </button>
        </div>

        <div className="relative md:col-span-2">
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
              <th className="text-left px-4 py-3">Nombre corto</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="text-left px-4 py-3">Contacto</th>
              <th className="text-left px-4 py-3">Celular contacto</th>
              <th className="text-left px-4 py-3">Estatus</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-4 py-4 text-slate-500" colSpan={8}>Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td className="px-4 py-4 text-slate-500" colSpan={8}>Sin registros</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{item.nombre}</td>
                  <td className="px-4 py-3">{item.nombre_corto}</td>
                  <td className="px-4 py-3">{item.tipo_figura_nombre ?? '-'}</td>
                  <td className="px-4 py-3">{item.estado_nombre ?? '-'}</td>
                  <td className="px-4 py-3">{item.contacto_nombre ?? '-'}</td>
                  <td className="px-4 py-3">{item.celular_contacto}</td>
                  <td className="px-4 py-3">{item.estatus_id === 1 ? 'Activo' : 'Inactivo'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button className="rounded-md border border-primary px-2 py-1 text-primary" onClick={() => navigate(`/catalogos/figuras-cooperadoras/${item.id}/editar`)}>Editar</button>
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
