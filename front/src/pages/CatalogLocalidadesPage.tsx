import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface EstadoItem { id: number; nombre: string; }
interface MunicipioItem { id: number; nombre: string; }
interface LocalidadItem {
  id: number;
  municipio_id: number | null;
  municipio_nombre?: string | null;
  estado_id: number;
  estado_nombre?: string | null;
  nombre: string;
  clave_geo: number;
  latitud: number | null;
  longitud: number | null;
  altitud: number | null;
  estatus_id: number;
}
interface LocalidadListResponse {
  items: LocalidadItem[];
  total: number;
  page: number;
  page_size: number;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const esc = (value: string | number) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CatalogLocalidadesPage() {
  const navigate = useNavigate();
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const [estados, setEstados] = useState<EstadoItem[]>([]);
  const [municipios, setMunicipios] = useState<MunicipioItem[]>([]);
  const [items, setItems] = useState<LocalidadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<number | ''>('');
  const [municipioFilter, setMunicipioFilter] = useState<number | ''>('');
  const [estatusFilter, setEstatusFilter] = useState<number | ''>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    const loadEstados = async () => {
      if (!token) return;
      const response = await fetch(`${API_BASE}/catalogos/estados?estatus_id=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) setEstados((await response.json()) as EstadoItem[]);
    };
    void loadEstados();
  }, [token]);

  useEffect(() => {
    const loadMunicipios = async () => {
      if (!token || estadoFilter === '') {
        setMunicipios([]);
        return;
      }
      const response = await fetch(`${API_BASE}/catalogos/municipios?estado_id=${estadoFilter}&estatus_id=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = (await response.json()) as Array<{ id: number; nombre: string }>;
      setMunicipios(data);
    };
    void loadMunicipios();
  }, [token, estadoFilter]);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (search.trim()) params.set('q', search.trim());
      if (estadoFilter !== '') params.set('estado_id', String(estadoFilter));
      if (municipioFilter !== '') params.set('municipio_id', String(municipioFilter));
      if (estatusFilter !== '') params.set('estatus_id', String(estatusFilter));

      const response = await fetch(`${API_BASE}/catalogos/localidades/listado?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as LocalidadListResponse;
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setItems([]);
      setTotal(0);
      setError('No fue posible cargar el catálogo de localidades.');
    } finally {
      setIsLoading(false);
    }
  }, [token, page, pageSize, search, estadoFilter, municipioFilter, estatusFilter]);

  // setIsLoading(true) al inicio de load dispara set-state-in-effect — patrón
  // legítimo de "cargar en mount/cambio de filtros" que la regla v6 sobre-marca.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const inactivate = async (id: number) => {
    if (!token) return;
    if (!window.confirm('¿Deseas inactivar esta localidad?')) return;
    const response = await fetch(`${API_BASE}/catalogos/localidades/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setError('No se pudo inactivar la localidad.');
      return;
    }
    await load();
  };

  const exportCurrent = () => {
    const rows = items.map((i) => [
      i.id,
      i.estado_nombre ?? i.estado_id,
      i.municipio_nombre ?? '-',
      i.nombre,
      i.clave_geo,
      i.estatus_id === 1 ? 'Activo' : 'Inactivo',
    ]);
    downloadCsv('catalogo_localidades_vista.csv', ['ID', 'Estado', 'Municipio', 'Nombre', 'Clave GEO', 'Estatus'], rows);
    setExportOpen(false);
  };

  const exportAll = async () => {
    if (!token) return;
    const params = new URLSearchParams({ page: '1', page_size: '10000' });
    if (search.trim()) params.set('q', search.trim());
    if (estadoFilter !== '') params.set('estado_id', String(estadoFilter));
    if (municipioFilter !== '') params.set('municipio_id', String(municipioFilter));
    if (estatusFilter !== '') params.set('estatus_id', String(estatusFilter));

    const response = await fetch(`${API_BASE}/catalogos/localidades/listado?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setError('No se pudo exportar el catálogo completo.');
      return;
    }
    const data = (await response.json()) as LocalidadListResponse;
    const rows = data.items.map((i) => [
      i.id,
      i.estado_nombre ?? i.estado_id,
      i.municipio_nombre ?? '-',
      i.nombre,
      i.clave_geo,
      i.estatus_id === 1 ? 'Activo' : 'Inactivo',
    ]);
    downloadCsv('catalogo_localidades_todo.csv', ['ID', 'Estado', 'Municipio', 'Nombre', 'Clave GEO', 'Estatus'], rows);
    setExportOpen(false);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Catálogo de Localidades</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Listado con filtros, exportación y paginado.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={() => navigate('/catalogos/localidades/nuevo')}>
          Nueva Localidad
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-7 gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, estado, municipio o clave GEO" className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" />
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={estadoFilter} onChange={(e) => { setEstadoFilter(e.target.value ? Number(e.target.value) : ''); setMunicipioFilter(''); setPage(1); }}>
          <option value="">Todos los estados</option>
          {estados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={municipioFilter} onChange={(e) => { setMunicipioFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value="">Todos los municipios</option>
          {municipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={estatusFilter} onChange={(e) => { setEstatusFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value={1}>Activos</option>
          <option value={2}>Inactivos</option>
          <option value="">Todos</option>
        </select>
        <div className="flex gap-2">
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => { setSearch(q); setPage(1); }}>Buscar</button>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => { setQ(''); setSearch(''); setEstadoFilter(''); setMunicipioFilter(''); setEstatusFilter(1); setPage(1); }}>Limpiar</button>
        </div>
        <div className="relative">
          <button className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setExportOpen((p) => !p)}>Exportar a Excel</button>
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
              <th className="text-left px-4 py-3">Estado</th>
              <th className="text-left px-4 py-3">Municipio</th>
              <th className="text-left px-4 py-3">Nombre</th>
              <th className="text-left px-4 py-3">Clave GEO</th>
              <th className="text-left px-4 py-3">Estatus</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-4 py-4 text-slate-500" colSpan={6}>Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td className="px-4 py-4 text-slate-500" colSpan={6}>Sin registros</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{item.estado_nombre ?? item.estado_id}</td>
                  <td className="px-4 py-3">{item.municipio_nombre ?? '-'}</td>
                  <td className="px-4 py-3">{item.nombre}</td>
                  <td className="px-4 py-3">{item.clave_geo}</td>
                  <td className="px-4 py-3">{item.estatus_id === 1 ? 'Activo' : 'Inactivo'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button className="rounded-md border border-primary px-2 py-1 text-primary" onClick={() => navigate(`/catalogos/localidades/${item.id}/editar`)}>Editar</button>
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
          <select className="rounded-lg border border-slate-300 px-2 py-1 text-sm" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
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
