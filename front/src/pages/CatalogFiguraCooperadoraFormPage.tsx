import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface EstadoItem {
  id: number;
  nombre: string;
}

interface MunicipioItem {
  id: number;
  nombre: string;
}

interface LocalidadItem {
  id: number;
  nombre: string;
}

interface TipoItem {
  id: number;
  nombre: string;
}

interface FuncionarioItem {
  id: number;
  nombre: string;
}

const initialForm = {
  nombre: '',
  nombre_corto: '',
  tipo_figura_id: '',
  domicilio: '',
  estado_id: '',
  municipio_id: '',
  localidad_id: '',
  correo_electronico: '',
  telefono: '',
  celular_contacto: '',
  contacto_id: '',
  estatus_id: 1,
};

export default function CatalogFiguraCooperadoraFormPage() {
  const navigate = useNavigate();
  const { figuraId } = useParams<{ figuraId: string }>();
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const isEdit = Boolean(figuraId);

  const [form, setForm] = useState(initialForm);
  const [estados, setEstados] = useState<EstadoItem[]>([]);
  const [municipios, setMunicipios] = useState<MunicipioItem[]>([]);
  const [localidades, setLocalidades] = useState<LocalidadItem[]>([]);
  const [tipos, setTipos] = useState<TipoItem[]>([]);
  const [funcionarios, setFuncionarios] = useState<FuncionarioItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadCatalogs = async () => {
      if (!token) return;
      const [estadosResp, tiposResp, funcionariosResp] = await Promise.all([
        fetch(`${API_BASE}/catalogos/estados?estatus_id=1`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/catalogos/tipos-fcoop?estatus_id=1`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/catalogos/funcionarios-options?limit=500`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (estadosResp.ok) setEstados((await estadosResp.json()) as EstadoItem[]);
      if (tiposResp.ok) setTipos((await tiposResp.json()) as TipoItem[]);
      if (funcionariosResp.ok) setFuncionarios((await funcionariosResp.json()) as FuncionarioItem[]);
    };
    void loadCatalogs();
  }, [token]);

  useEffect(() => {
    const load = async () => {
      if (!token || !isEdit) return;
      setIsLoading(true);
      const response = await fetch(`${API_BASE}/catalogos/figuras-cooperadoras/${figuraId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setError('No se pudo cargar la Figura Cooperadora.');
        setIsLoading(false);
        return;
      }
      const data = (await response.json()) as {
        nombre: string;
        nombre_corto: string;
        tipo_figura_id: number;
        domicilio: string;
        estado_id: number;
        municipio_id: number;
        localidad_id: number;
        correo_electronico: string;
        telefono: string;
        celular_contacto: string;
        contacto_id: number;
        estatus_id: number;
      };

      setForm({
        nombre: data.nombre,
        nombre_corto: data.nombre_corto,
        tipo_figura_id: String(data.tipo_figura_id),
        domicilio: data.domicilio,
        estado_id: String(data.estado_id),
        municipio_id: String(data.municipio_id),
        localidad_id: String(data.localidad_id),
        correo_electronico: data.correo_electronico,
        telefono: data.telefono,
        celular_contacto: data.celular_contacto,
        contacto_id: String(data.contacto_id),
        estatus_id: data.estatus_id,
      });
      setIsLoading(false);
    };
    void load();
  }, [token, isEdit, figuraId]);

  useEffect(() => {
    const loadMunicipios = async () => {
      if (!token || !form.estado_id) {
        setMunicipios([]);
        return;
      }
      const response = await fetch(`${API_BASE}/catalogos/municipios?estado_id=${form.estado_id}&estatus_id=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setMunicipios([]);
        return;
      }
      setMunicipios((await response.json()) as MunicipioItem[]);
    };
    void loadMunicipios();
  }, [token, form.estado_id]);

  useEffect(() => {
    const loadLocalidades = async () => {
      if (!token || !form.estado_id || !form.municipio_id) {
        setLocalidades([]);
        return;
      }
      const response = await fetch(
        `${API_BASE}/catalogos/localidades?estado_id=${form.estado_id}&municipio_id=${form.municipio_id}&estatus_id=1&limit=1000`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        setLocalidades([]);
        return;
      }
      setLocalidades((await response.json()) as LocalidadItem[]);
    };
    void loadLocalidades();
  }, [token, form.estado_id, form.municipio_id]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setError('');

    const payload = {
      nombre: form.nombre.trim(),
      nombre_corto: form.nombre_corto.trim(),
      tipo_figura_id: Number(form.tipo_figura_id),
      domicilio: form.domicilio.trim(),
      estado_id: Number(form.estado_id),
      municipio_id: Number(form.municipio_id),
      localidad_id: Number(form.localidad_id),
      correo_electronico: form.correo_electronico.trim(),
      telefono: form.telefono.trim(),
      celular_contacto: form.celular_contacto.trim(),
      contacto_id: Number(form.contacto_id),
      estatus_id: Number(form.estatus_id),
    };

    if (
      !payload.nombre ||
      !payload.nombre_corto ||
      !payload.tipo_figura_id ||
      !payload.domicilio ||
      !payload.estado_id ||
      !payload.municipio_id ||
      !payload.localidad_id ||
      !payload.correo_electronico ||
      !payload.telefono ||
      !payload.celular_contacto ||
      !payload.contacto_id
    ) {
      setError('Completa todos los campos obligatorios.');
      return;
    }

    const url = isEdit ? `${API_BASE}/catalogos/figuras-cooperadoras/${figuraId}` : `${API_BASE}/catalogos/figuras-cooperadoras`;
    const method = isEdit ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setError('No se pudo guardar el registro.');
      return;
    }

    navigate('/catalogos/figuras-cooperadoras');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{isEdit ? 'Editar Figura Cooperadora' : 'Nueva Figura Cooperadora'}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Formulario de captura del catálogo de Figura Cooperadora.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm text-slate-700 mb-1">Nombre</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={200} value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} />
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Nombre corto</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={30} value={form.nombre_corto} onChange={(e) => setForm((p) => ({ ...p, nombre_corto: e.target.value }))} />
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Tipo de FCOOP</label>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.tipo_figura_id} onChange={(e) => setForm((p) => ({ ...p, tipo_figura_id: e.target.value }))}>
            <option value="">Selecciona tipo</option>
            {tipos.map((item) => (
              <option key={item.id} value={item.id}>{item.nombre}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm text-slate-700 mb-1">Domicilio</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={300} value={form.domicilio} onChange={(e) => setForm((p) => ({ ...p, domicilio: e.target.value }))} />
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Estado</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.estado_id}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                estado_id: e.target.value,
                municipio_id: '',
                localidad_id: '',
              }))
            }
          >
            <option value="">Selecciona estado</option>
            {estados.map((item) => (
              <option key={item.id} value={item.id}>{item.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Municipio</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.municipio_id}
            onChange={(e) => setForm((p) => ({ ...p, municipio_id: e.target.value, localidad_id: '' }))}
            disabled={!form.estado_id}
          >
            <option value="">Selecciona municipio</option>
            {municipios.map((item) => (
              <option key={item.id} value={item.id}>{item.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Localidad</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.localidad_id}
            onChange={(e) => setForm((p) => ({ ...p, localidad_id: e.target.value }))}
            disabled={!form.municipio_id}
          >
            <option value="">Selecciona localidad</option>
            {localidades.map((item) => (
              <option key={item.id} value={item.id}>{item.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Correo electrónico</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={100} value={form.correo_electronico} onChange={(e) => setForm((p) => ({ ...p, correo_electronico: e.target.value }))} />
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Teléfono</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={50} value={form.telefono} onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))} />
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Celular de contacto</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={30} value={form.celular_contacto} onChange={(e) => setForm((p) => ({ ...p, celular_contacto: e.target.value }))} />
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Contacto (Funcionario)</label>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.contacto_id} onChange={(e) => setForm((p) => ({ ...p, contacto_id: e.target.value }))}>
            <option value="">Selecciona contacto</option>
            {funcionarios.map((item) => (
              <option key={item.id} value={item.id}>{item.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Estatus</label>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.estatus_id} onChange={(e) => setForm((p) => ({ ...p, estatus_id: Number(e.target.value) }))}>
            <option value={1}>Activo</option>
            <option value={2}>Inactivo</option>
          </select>
        </div>

        <div className="md:col-span-2 flex items-center gap-2 pt-2">
          <button type="submit" disabled={isLoading} className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-60">{isEdit ? 'Guardar cambios' : 'Crear figura cooperadora'}</button>
          <Link to="/catalogos/figuras-cooperadoras" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
