import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface EstadoItem { id: number; nombre: string; }

const initialForm = { estado_id: '', clave: '', nombre: '', clave_geo: '', estatus_id: 1 };

export default function CatalogMunicipioFormPage() {
  const navigate = useNavigate();
  const { municipioId } = useParams<{ municipioId: string }>();
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const isEdit = Boolean(municipioId);

  const [estados, setEstados] = useState<EstadoItem[]>([]);
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadEstados = async () => {
      if (!token) return;
      const response = await fetch(`${API_BASE}/catalogos/estados?estatus_id=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        setEstados((await response.json()) as EstadoItem[]);
      }
    };
    void loadEstados();
  }, [token]);

  useEffect(() => {
    const load = async () => {
      if (!token || !isEdit) return;
      setIsLoading(true);
      const response = await fetch(`${API_BASE}/catalogos/municipios/${municipioId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setError('No se pudo cargar el municipio.');
        setIsLoading(false);
        return;
      }
      const data = (await response.json()) as { estado_id: number; clave: string; nombre: string; clave_geo: string; estatus_id: number };
      setForm({
        estado_id: String(data.estado_id),
        clave: data.clave,
        nombre: data.nombre,
        clave_geo: data.clave_geo,
        estatus_id: data.estatus_id,
      });
      setIsLoading(false);
    };
    void load();
  }, [token, isEdit, municipioId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setError('');
    const payload = {
      estado_id: Number(form.estado_id),
      clave: form.clave.trim().toUpperCase(),
      nombre: form.nombre.trim(),
      clave_geo: form.clave_geo.trim(),
      estatus_id: Number(form.estatus_id),
    };

    if (!payload.estado_id || !payload.clave || !payload.nombre || !payload.clave_geo) {
      setError('Completa estado, clave, nombre y clave geo.');
      return;
    }

    const url = isEdit ? `${API_BASE}/catalogos/municipios/${municipioId}` : `${API_BASE}/catalogos/municipios`;
    const method = isEdit ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError('No se pudo guardar el municipio.');
      return;
    }

    navigate('/catalogos/municipios');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{isEdit ? 'Editar Municipio' : 'Nuevo Municipio'}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Formulario de captura del catálogo de municipios.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-slate-700 mb-1">Estado</label>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.estado_id} onChange={(e) => setForm((p) => ({ ...p, estado_id: e.target.value }))}>
            <option value="">Selecciona estado</option>
            {estados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">Clave</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase" maxLength={3} value={form.clave} onChange={(e) => setForm((p) => ({ ...p, clave: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm text-slate-700 mb-1">Nombre</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={100} value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">Clave GEO</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={6} value={form.clave_geo} onChange={(e) => setForm((p) => ({ ...p, clave_geo: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">Estatus</label>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.estatus_id} onChange={(e) => setForm((p) => ({ ...p, estatus_id: Number(e.target.value) }))}>
            <option value={1}>Activo</option>
            <option value={2}>Inactivo</option>
          </select>
        </div>

        <div className="md:col-span-2 flex items-center gap-2 pt-2">
          <button type="submit" disabled={isLoading} className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-60">{isEdit ? 'Guardar cambios' : 'Crear municipio'}</button>
          <Link to="/catalogos/municipios" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
