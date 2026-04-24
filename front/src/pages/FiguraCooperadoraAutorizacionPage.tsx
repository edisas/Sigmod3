import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface CatalogItem {
  id: number;
  nombre: string;
}

interface EstadoItem {
  id: number;
  clave: string;
  nombre: string;
}

interface CatalogosResponse {
  figuras: CatalogItem[];
  temporadas: CatalogItem[];
  funcionarios: CatalogItem[];
  estados: EstadoItem[];
}

interface AutorizacionResponse {
  id: number;
  clave_autorizacion: string;
  oficio_path: string;
}

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

export default function FiguraCooperadoraAutorizacionPage() {
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);

  const [catalogos, setCatalogos] = useState<CatalogosResponse | null>(null);
  const [autorizaciones, setAutorizaciones] = useState<AutorizacionListItem[]>([]);

  const [figuraId, setFiguraId] = useState('');
  const [temporadaId, setTemporadaId] = useState('');
  const [funcionarioId, setFuncionarioId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [estadoIds, setEstadoIds] = useState<number[]>([]);
  const [oficio, setOficio] = useState<File | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<AutorizacionListItem | null>(null);
  const [revokeMotivo, setRevokeMotivo] = useState('');
  const [revokeSolicitanteNombre, setRevokeSolicitanteNombre] = useState('');
  const [revokeSolicitanteCargo, setRevokeSolicitanteCargo] = useState('');
  const [revokeOficio, setRevokeOficio] = useState<File | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadCatalogos = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`${API_BASE}/autorizaciones/figura-cooperadora/catalogos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Catalogos HTTP ${response.status}`);
    const data = (await response.json()) as CatalogosResponse;
    setCatalogos(data);
  }, [token]);

  const loadListado = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`${API_BASE}/autorizaciones/figura-cooperadora/listado`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Listado HTTP ${response.status}`);
    const data = (await response.json()) as AutorizacionListItem[];
    setAutorizaciones(data);
  }, [token]);

  useEffect(() => {
    const bootstrap = async () => {
      if (!token) return;
      setIsLoading(true);
      setError('');
      try {
        await Promise.all([loadCatalogos(), loadListado()]);
      } catch (errorValue) {
        const message = errorValue instanceof Error ? errorValue.message : 'Error desconocido';
        setError(`No se pudieron cargar los datos de autorizaciones. (${message})`);
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrap();
  }, [token, loadCatalogos, loadListado]);

  const toggleEstado = (estadoId: number) => {
    setEstadoIds((prev) => (prev.includes(estadoId) ? prev.filter((id) => id !== estadoId) : [...prev, estadoId]));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setError('');
    setSuccess('');

    if (!figuraId || !temporadaId || !funcionarioId || !fechaInicio || !fechaFin || !oficio) {
      setError('Completa todos los campos obligatorios y adjunta el oficio.');
      return;
    }
    if (!estadoIds.length) {
      setError('Selecciona al menos un estado de autorización.');
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append('figura_cooperadora_id', figuraId);
      formData.append('temporada_id', temporadaId);
      formData.append('fecha_inicio', fechaInicio);
      formData.append('fecha_fin', fechaFin);
      formData.append('funcionario_autorizo_id', funcionarioId);
      formData.append('estado_ids', JSON.stringify(estadoIds));
      formData.append('observaciones', observaciones.trim());
      formData.append('oficio', oficio);

      const response = await fetch(`${API_BASE}/autorizaciones/figura-cooperadora`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `HTTP ${response.status}`);
      }
      const data = (await response.json()) as AutorizacionResponse;
      setSuccess(`Autorización generada correctamente. Clave: ${data.clave_autorizacion}`);

      setFiguraId('');
      setTemporadaId('');
      setFuncionarioId('');
      setFechaInicio('');
      setFechaFin('');
      setObservaciones('');
      setEstadoIds([]);
      setOficio(null);
      await loadListado();
    } catch (errorValue) {
      const message = errorValue instanceof Error ? errorValue.message : 'Error desconocido';
      setError(`No se pudo generar la autorización. (${message})`);
    } finally {
      setIsSaving(false);
    }
  };

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
      await loadListado();
    } catch (errorValue) {
      const message = errorValue instanceof Error ? errorValue.message : 'Error desconocido';
      setError(`No se pudo revocar la autorización. (${message})`);
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Autorización de Figura Cooperadora</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Una figura no puede tener dos autorizaciones vigentes en la misma temporada. Para reemplazar una autorización vigente,
          primero debe revocarse.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
        <h2 className="text-lg font-semibold text-slate-900">Nueva autorización</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-700 mb-1">Figura Cooperadora *</label>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={figuraId} onChange={(e) => setFiguraId(e.target.value)} disabled={isLoading}>
              <option value="">Selecciona figura</option>
              {catalogos?.figuras.map((item) => (
                <option key={item.id} value={item.id}>{item.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">Temporada *</label>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={temporadaId} onChange={(e) => setTemporadaId(e.target.value)} disabled={isLoading}>
              <option value="">Selecciona temporada</option>
              {catalogos?.temporadas.map((item) => (
                <option key={item.id} value={item.id}>{item.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">Funcionario autorizador *</label>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={funcionarioId} onChange={(e) => setFuncionarioId(e.target.value)} disabled={isLoading}>
              <option value="">Selecciona funcionario</option>
              {catalogos?.funcionarios.map((item) => (
                <option key={item.id} value={item.id}>{item.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-700 mb-1">Fecha inicio *</label>
            <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">Fecha fin *</label>
            <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Observaciones</label>
          <textarea rows={3} maxLength={1000} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Observaciones de la autorización (opcional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-sm text-slate-700">Estados autorizados (mostrar_en_registro=1) *</label>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-md border border-slate-300 px-2 py-1 text-xs" onClick={() => setEstadoIds((catalogos?.estados ?? []).map((item) => item.id))}>Seleccionar todos</button>
              <button type="button" className="rounded-md border border-slate-300 px-2 py-1 text-xs" onClick={() => setEstadoIds([])}>Limpiar</button>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 max-h-56 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2">
            {(catalogos?.estados ?? []).map((estado) => (
              <label key={estado.id} className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={estadoIds.includes(estado.id)} onChange={() => toggleEstado(estado.id)} className="size-4 rounded border-slate-300" />
                <span>{estado.nombre} ({estado.clave})</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-700 mb-1">Oficio escaneado *</label>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.tiff,.txt" onChange={(e) => setOficio(e.target.files?.[0] ?? null)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm" />
        </div>

        <div className="pt-2">
          <button type="submit" disabled={isSaving || isLoading} className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-60">
            {isSaving ? 'Generando autorización...' : 'Generar autorización'}
          </button>
        </div>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Listado de autorizaciones</h2>
          <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => void loadListado()}>Actualizar</button>
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
              {autorizaciones.map((item) => (
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
              {!autorizaciones.length && (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={7}>Sin autorizaciones registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {revokeTarget && (
        <form onSubmit={onRevokeSubmit} className="rounded-xl border border-red-200 bg-red-50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-red-800">Revocar autorización: {revokeTarget.clave_autorizacion ?? revokeTarget.id}</h3>
            <button type="button" className="rounded-md border border-red-300 px-2 py-1 text-xs" onClick={() => setRevokeTarget(null)}>Cerrar</button>
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
