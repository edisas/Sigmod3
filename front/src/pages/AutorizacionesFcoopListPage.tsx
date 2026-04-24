import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface AutorizacionListItem {
  id: number;
  figura_cooperadora_id: number;
  figura_cooperadora_nombre: string;
  temporada_id: number;
  temporada_nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  funcionario_autorizo_id: number;
  funcionario_autorizo_nombre: string;
  clave_autorizacion?: string | null;
  estatus_id: number;
  observaciones?: string | null;
  oficio_nombre_original?: string | null;
  created_at?: string | null;
  puede_revocar: boolean;
}

export default function AutorizacionesFcoopListPage() {
  const navigate = useNavigate();
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const [items, setItems] = useState<AutorizacionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [revokeTarget, setRevokeTarget] = useState<AutorizacionListItem | null>(null);
  const [revokeMotivo, setRevokeMotivo] = useState('');
  const [revokeSolicitanteNombre, setRevokeSolicitanteNombre] = useState('');
  const [revokeSolicitanteCargo, setRevokeSolicitanteCargo] = useState('');
  const [revokeOficio, setRevokeOficio] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/autorizaciones/figura-cooperadora/listado`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as AutorizacionListItem[];
      setItems(data);
    } catch (errorValue) {
      const message = errorValue instanceof Error ? errorValue.message : 'Error desconocido';
      setError(`No se pudo cargar el listado de autorizaciones. (${message})`);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // setIsLoading(true) al inicio de load dispara set-state-in-effect — patrón
  // legítimo de "cargar en mount/cambio de token" que la regla v6 sobre-marca.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const onRevokeSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !revokeTarget) return;
    setError('');
    setSuccess('');

    if (!revokeMotivo.trim() || !revokeSolicitanteNombre.trim() || !revokeSolicitanteCargo.trim() || !revokeOficio) {
      setError('Para revocar debes capturar motivo, nombre/cargo del solicitante y adjuntar oficio de revocación.');
      return;
    }

    setIsRevoking(true);
    try {
      const formData = new FormData();
      formData.append('motivo_revocacion', revokeMotivo.trim());
      formData.append('solicitante_nombre', revokeSolicitanteNombre.trim());
      formData.append('solicitante_cargo', revokeSolicitanteCargo.trim());
      formData.append('oficio_revocacion', revokeOficio);

      const response = await fetch(`${API_BASE}/autorizaciones/figura-cooperadora/${revokeTarget.id}/revocar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `HTTP ${response.status}`);
      }

      setSuccess(`Autorización ${revokeTarget.clave_autorizacion ?? revokeTarget.id} revocada correctamente.`);
      setRevokeTarget(null);
      setRevokeMotivo('');
      setRevokeSolicitanteNombre('');
      setRevokeSolicitanteCargo('');
      setRevokeOficio(null);
      await load();
    } catch (errorValue) {
      const message = errorValue instanceof Error ? errorValue.message : 'Error desconocido';
      setError(`No se pudo revocar la autorización. (${message})`);
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Listado de Autorizaciones FCOOP</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Solo se pueden revocar autorizaciones vigentes en temporadas activas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/autorizaciones/figura-cooperadora')}
          className="rounded-lg bg-primary text-white px-4 py-2 text-sm"
        >
          Nueva autorización
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Autorizaciones registradas</h2>
          <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => void load()}>
            Actualizar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b">
                <th className="py-2 pr-3">Clave</th>
                <th className="py-2 pr-3">Figura</th>
                <th className="py-2 pr-3">Temporada</th>
                <th className="py-2 pr-3">Estatus</th>
                <th className="py-2 pr-3">Fecha inicio</th>
                <th className="py-2 pr-3">Fecha fin</th>
                <th className="py-2 pr-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading &&
                items.map((item) => (
                  <tr key={item.id} className="border-b last:border-b-0 text-slate-800">
                    <td className="py-2 pr-3">{item.clave_autorizacion ?? `#${item.id}`}</td>
                    <td className="py-2 pr-3">{item.figura_cooperadora_nombre}</td>
                    <td className="py-2 pr-3">{item.temporada_nombre}</td>
                    <td className="py-2 pr-3">{item.estatus_id === 1 ? 'Vigente' : 'Revocada/Inactiva'}</td>
                    <td className="py-2 pr-3">{item.fecha_inicio}</td>
                    <td className="py-2 pr-3">{item.fecha_fin}</td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        disabled={!item.puede_revocar}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
                        onClick={() => setRevokeTarget(item)}
                      >
                        Revocar
                      </button>
                    </td>
                  </tr>
                ))}
              {!isLoading && !items.length && (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={7}>
                    Sin autorizaciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {revokeTarget && (
        <form onSubmit={onRevokeSubmit} className="rounded-xl border border-red-200 bg-red-50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-red-800">
              Revocar autorización: {revokeTarget.clave_autorizacion ?? revokeTarget.id}
            </h3>
            <button type="button" className="rounded-md border border-red-300 px-2 py-1 text-xs" onClick={() => setRevokeTarget(null)}>
              Cerrar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-700 mb-1">Motivo de revocación *</label>
              <textarea rows={3} value={revokeMotivo} onChange={(e) => setRevokeMotivo(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-700 mb-1">Nombre solicitante *</label>
                <input value={revokeSolicitanteNombre} onChange={(e) => setRevokeSolicitanteNombre(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1">Cargo solicitante *</label>
                <input value={revokeSolicitanteCargo} onChange={(e) => setRevokeSolicitanteCargo(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">Oficio de revocación *</label>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.tiff,.txt" onChange={(e) => setRevokeOficio(e.target.files?.[0] ?? null)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm" />
          </div>

          <button type="submit" disabled={isRevoking} className="rounded-lg bg-red-700 text-white px-4 py-2 text-sm disabled:opacity-60">
            {isRevoking ? 'Revocando...' : 'Confirmar revocación'}
          </button>
        </form>
      )}
    </div>
  );
}

