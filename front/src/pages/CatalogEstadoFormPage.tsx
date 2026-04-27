import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

const initialForm = { clave: '', nombre: '', abreviatura: '', estatus_id: 1, participa_sigmod: 1 };

export default function CatalogEstadoFormPage() {
  const navigate = useNavigate();
  const { estadoId } = useParams<{ estadoId: string }>();
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const isEdit = Boolean(estadoId);

  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!token || !isEdit) return;
      setIsLoading(true);
      const response = await fetch(`${API_BASE}/catalogos/estados/${estadoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setError('No se pudo cargar el estado.');
        setIsLoading(false);
        return;
      }
      const data = (await response.json()) as { clave: string; nombre: string; abreviatura: string; estatus_id: number; participa_sigmod?: number };
      setForm({
        clave: data.clave,
        nombre: data.nombre,
        abreviatura: data.abreviatura,
        estatus_id: data.estatus_id,
        participa_sigmod: data.participa_sigmod ?? 1,
      });
      setIsLoading(false);
    };
    void load();
  }, [token, isEdit, estadoId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setError('');
    const payload = {
      clave: form.clave.trim().toUpperCase(),
      nombre: form.nombre.trim(),
      abreviatura: form.abreviatura.trim().toUpperCase(),
      estatus_id: Number(form.estatus_id),
      participa_sigmod: Number(form.participa_sigmod) === 1 ? 1 : 0,
    };
    if (!payload.clave || !payload.nombre || !payload.abreviatura) {
      setError('Completa clave, nombre y abreviatura.');
      return;
    }

    const url = isEdit ? `${API_BASE}/catalogos/estados/${estadoId}` : `${API_BASE}/catalogos/estados`;
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
    navigate('/catalogos/estados');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{isEdit ? 'Editar Estado' : 'Nuevo Estado'}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Formulario de captura del catálogo de estados.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-slate-700 mb-1">Clave</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase" maxLength={2} value={form.clave} onChange={(e) => setForm((p) => ({ ...p, clave: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">Abreviatura</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase" maxLength={10} value={form.abreviatura} onChange={(e) => setForm((p) => ({ ...p, abreviatura: e.target.value }))} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm text-slate-700 mb-1">Nombre</label>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={45} value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">Estatus</label>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.estatus_id} onChange={(e) => setForm((p) => ({ ...p, estatus_id: Number(e.target.value) }))}>
            <option value={1}>Activo</option>
            <option value={2}>Inactivo</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-700 mb-1">Participa en SIGMOD</label>
          <label className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={form.participa_sigmod === 1}
              onChange={(e) => setForm((p) => ({ ...p, participa_sigmod: e.target.checked ? 1 : 0 }))}
              className="size-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-slate-700">El estado participa en el proyecto SIGMOD</span>
          </label>
          <p className="text-xs text-slate-500 mt-1">Si no participa, no aparecerá en login ni en multi-select de catálogos.</p>
        </div>

        <div className="md:col-span-2 flex items-center gap-2 pt-2">
          <button type="submit" disabled={isLoading} className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-60">{isEdit ? 'Guardar cambios' : 'Crear estado'}</button>
          <Link to="/catalogos/estados" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
