import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

const initialForm = { nombre: '', descripcion: '', estatus_id: 1 };

export default function CatalogTipoFcoopFormPage() {
  const navigate = useNavigate();
  const { tipoId } = useParams<{ tipoId: string }>();
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const isEdit = Boolean(tipoId);

  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!token || !isEdit) return;
      setIsLoading(true);
      const response = await fetch(`${API_BASE}/catalogos/tipos-fcoop/${tipoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setError('No se pudo cargar el tipo de FCOOP.');
        setIsLoading(false);
        return;
      }
      const data = (await response.json()) as { nombre: string; descripcion: string; estatus_id: number };
      setForm(data);
      setIsLoading(false);
    };
    void load();
  }, [token, isEdit, tipoId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setError('');

    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim(),
      estatus_id: Number(form.estatus_id),
    };

    if (!payload.nombre || !payload.descripcion) {
      setError('Completa nombre y descripción.');
      return;
    }

    const url = isEdit ? `${API_BASE}/catalogos/tipos-fcoop/${tipoId}` : `${API_BASE}/catalogos/tipos-fcoop`;
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

    navigate('/catalogos/tipos-fcoop');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{isEdit ? 'Editar Tipo de FCOOP' : 'Nuevo Tipo de FCOOP'}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Formulario de captura del catálogo de Tipos de Figura Cooperadora.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-6 grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm text-slate-700 mb-1">Nombre</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            maxLength={50}
            value={form.nombre}
            onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Descripción</label>
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-28"
            maxLength={300}
            value={form.descripcion}
            onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Estatus</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.estatus_id}
            onChange={(e) => setForm((p) => ({ ...p, estatus_id: Number(e.target.value) }))}
          >
            <option value={1}>Activo</option>
            <option value={2}>Inactivo</option>
          </select>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={isLoading} className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-60">
            {isEdit ? 'Guardar cambios' : 'Crear tipo de FCOOP'}
          </button>
          <Link to="/catalogos/tipos-fcoop" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
