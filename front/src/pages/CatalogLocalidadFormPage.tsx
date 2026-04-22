import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface EstadoItem { id: number; nombre: string; }
interface MunicipioItem { id: number; nombre: string; }

const initialForm = {
  estado_id: '',
  municipio_id: '',
  nombre: '',
  clave_geo: '',
  latitud: '',
  longitud: '',
  altitud: '',
  estatus_id: 1,
};

export default function CatalogLocalidadFormPage() {
  const navigate = useNavigate();
  const { localidadId } = useParams<{ localidadId: string }>();
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const isEdit = Boolean(localidadId);

  const [estados, setEstados] = useState<EstadoItem[]>([]);
  const [municipios, setMunicipios] = useState<MunicipioItem[]>([]);
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
      if (!token || !form.estado_id) {
        setMunicipios([]);
        return;
      }
      const response = await fetch(`${API_BASE}/catalogos/municipios?estado_id=${form.estado_id}&estatus_id=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      setMunicipios((await response.json()) as MunicipioItem[]);
    };
    void loadMunicipios();
  }, [token, form.estado_id]);

  useEffect(() => {
    const load = async () => {
      if (!token || !isEdit) return;
      setIsLoading(true);
      const response = await fetch(`${API_BASE}/catalogos/localidades/${localidadId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setError('No se pudo cargar la localidad.');
        setIsLoading(false);
        return;
      }
      const data = (await response.json()) as {
        estado_id: number;
        municipio_id: number | null;
        nombre: string;
        clave_geo: number;
        latitud: number | null;
        longitud: number | null;
        altitud: number | null;
        estatus_id: number;
      };
      setForm({
        estado_id: String(data.estado_id),
        municipio_id: data.municipio_id ? String(data.municipio_id) : '',
        nombre: data.nombre,
        clave_geo: String(data.clave_geo),
        latitud: data.latitud != null ? String(data.latitud) : '',
        longitud: data.longitud != null ? String(data.longitud) : '',
        altitud: data.altitud != null ? String(data.altitud) : '',
        estatus_id: data.estatus_id,
      });
      setIsLoading(false);
    };
    void load();
  }, [token, isEdit, localidadId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setError('');
    const payload = {
      estado_id: Number(form.estado_id),
      municipio_id: form.municipio_id ? Number(form.municipio_id) : null,
      nombre: form.nombre.trim(),
      clave_geo: Number(form.clave_geo),
      latitud: form.latitud ? Number(form.latitud) : null,
      longitud: form.longitud ? Number(form.longitud) : null,
      altitud: form.altitud ? Number(form.altitud) : null,
      estatus_id: Number(form.estatus_id),
    };

    if (!payload.estado_id || !payload.nombre || !payload.clave_geo) {
      setError('Completa estado, nombre y clave GEO.');
      return;
    }

    const url = isEdit ? `${API_BASE}/catalogos/localidades/${localidadId}` : `${API_BASE}/catalogos/localidades`;
    const method = isEdit ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError('No se pudo guardar la localidad.');
      return;
    }

    navigate('/catalogos/localidades');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{isEdit ? 'Editar Localidad' : 'Nueva Localidad'}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Formulario de captura del catálogo de localidades.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-slate-700 mb-1">Estado</label>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.estado_id} onChange={(e) => setForm((p) => ({ ...p, estado_id: e.target.value, municipio_id: '' }))}>
            <option value="">Selecciona estado</option>
            {estados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">Municipio</label>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.municipio_id} onChange={(e) => setForm((p) => ({ ...p, municipio_id: e.target.value }))}>
            <option value="">Sin municipio</option>
            {municipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">Clave GEO</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.clave_geo} onChange={(e) => setForm((p) => ({ ...p, clave_geo: e.target.value }))} />
        </div>

        <div className="md:col-span-3">
          <label className="block text-sm text-slate-700 mb-1">Nombre</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={50} value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} />
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Latitud</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.latitud} onChange={(e) => setForm((p) => ({ ...p, latitud: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">Longitud</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.longitud} onChange={(e) => setForm((p) => ({ ...p, longitud: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">Altitud</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.altitud} onChange={(e) => setForm((p) => ({ ...p, altitud: e.target.value }))} />
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Estatus</label>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.estatus_id} onChange={(e) => setForm((p) => ({ ...p, estatus_id: Number(e.target.value) }))}>
            <option value={1}>Activo</option>
            <option value={2}>Inactivo</option>
          </select>
        </div>

        <div className="md:col-span-3 flex items-center gap-2 pt-2">
          <button type="submit" disabled={isLoading} className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-60">{isEdit ? 'Guardar cambios' : 'Crear localidad'}</button>
          <Link to="/catalogos/localidades" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
