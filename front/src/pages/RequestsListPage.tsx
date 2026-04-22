import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/Icon';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface SolicitudItem {
  solicitud_id: number;
  temporada_id: number;
  temporada_nombre: string;
  temporada_nombre_corto: string;
  estado_id: number;
  estado_nombre: string;
  rol_id?: number | null;
  rol_nombre?: string | null;
  estatus_proceso: string;
  estatus_id: number;
  vigente: boolean;
  editable: boolean;
  download_url: string;
  fecha_solicitud: string;
  fecha_actualizacion: string;
}

export default function RequestsListPage() {
  const navigate = useNavigate();
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const [items, setItems] = useState<SolicitudItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/solicitudes/listado`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as SolicitudItem[];
      setItems(data);
    } catch {
      setError('No fue posible cargar el listado de solicitudes.');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const cancelSolicitud = async (solicitudId: number) => {
    if (!token) return;
    if (!window.confirm('¿Seguro que deseas cancelar esta solicitud?')) return;

    const response = await fetch(`${API_BASE}/solicitudes/detalle/${solicitudId}/cancelar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      setError('No se pudo cancelar la solicitud.');
      return;
    }

    await load();
  };

  const downloadPdf = async (item: SolicitudItem) => {
    if (!token) return;
    const response = await fetch(`${API_BASE}${item.download_url.replace('/api/v1', '')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setError('No se pudo descargar el PDF de la solicitud.');
      return;
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solicitud_sigmod_${item.solicitud_id}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Listado de Solicitudes de Acceso</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Ordenadas de temporadas mas recientes a mas antiguas.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2"
          onClick={() => navigate('/solicitud-acceso?new=1')}
        >
          <Icon name="add" className="text-base" /> Nueva solicitud
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      {isLoading ? (
        <div className="p-6 text-sm text-slate-600">Cargando solicitudes...</div>
      ) : (
        <div className="space-y-3">
          {items.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              No tienes solicitudes registradas.
            </div>
          )}

          {items.map((item) => (
            <div key={item.solicitud_id} className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {item.temporada_nombre_corto} - {item.estado_nombre}
                  </p>
                  <p className="text-xs text-slate-600">
                    Rol: {item.rol_nombre ?? 'No definido'} | Estatus: {item.estatus_proceso}
                  </p>
                </div>
                <p className="text-xs text-slate-500">Actualizada: {new Date(item.fecha_actualizacion).toLocaleString()}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-primary text-primary px-3 py-2 text-sm"
                  onClick={() => navigate(`/solicitud-acceso?solicitud_id=${item.solicitud_id}`)}
                  disabled={!item.editable}
                  title={!item.editable ? 'Solicitud validada, no editable' : 'Editar solicitud'}
                >
                  <Icon name="edit" className="text-base" /> Editar
                </button>

                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 text-red-700 px-3 py-2 text-sm"
                  onClick={() => void cancelSolicitud(item.solicitud_id)}
                  disabled={!item.editable}
                  title={!item.editable ? 'Solicitud validada, no cancelable' : 'Cancelar solicitud'}
                >
                  <Icon name="cancel" className="text-base" /> Cancelar
                </button>

                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 text-slate-700 px-3 py-2 text-sm"
                  onClick={() => void downloadPdf(item)}
                >
                  <Icon name="download" className="text-base" /> PDF
                </button>

                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 text-slate-500 px-3 py-2 text-sm"
                  disabled
                  title="Backlog: proceso de solicitar baja"
                >
                  <Icon name="rule" className="text-base" /> Solicitar baja (Backlog)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
