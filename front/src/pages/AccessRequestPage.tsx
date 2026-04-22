import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '@/components/ui/Icon';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface EstadoItem {
  id: number;
  clave: string;
  nombre: string;
}

interface RegionItem {
  id: number;
  nombre: string;
}

interface TemporadaItem {
  id: number;
  nombre: string;
  nombre_corto: string;
}

interface MunicipioItem {
  id: number;
  nombre: string;
}

interface LocalidadItem {
  id: number;
  nombre: string;
  municipio_id: number;
  municipio_nombre: string;
}

interface ModuloItem {
  id: number;
  nombre: string;
}

interface RolRegistroItem {
  id: number;
  nombre: string;
  descripcion?: string | null;
}

interface SolicitudCatalogos {
  roles_registro: RolRegistroItem[];
  estados_usuario: EstadoItem[];
  regiones_tecnicas: RegionItem[];
  temporadas: TemporadaItem[];
}

interface DocumentoSolicitud {
  solicitud_id: number;
  estado_id: number;
  estado_nombre: string;
  codigo_unico: string;
  estatus_proceso: string;
  download_url: string;
  firmado_subido: boolean;
  editable_regenerable: boolean;
  motivo_no_editable?: string | null;
  fecha_carga_firmado?: string | null;
}

interface SolicitudResponse {
  folio_grupo: string;
  documentos: DocumentoSolicitud[];
}

const initialForm = {
  rol_id: '',
  estado_id: '',
  localidad_id: '',
  modulo_ids: [] as number[],
  region_tecnica_id: '',
  temporada_id: '',
  fecha_solicitud: new Date().toISOString().slice(0, 10),
  fecha_inicio_servicios: '',
  fecha_inicio_operacion: '',
  municipios_ids: [] as number[],
  correo_notificacion: '',
};

export default function AccessRequestPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [catalogos, setCatalogos] = useState<SolicitudCatalogos | null>(null);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [documentos, setDocumentos] = useState<DocumentoSolicitud[]>([]);
  const [folio, setFolio] = useState<string>('');
  const [uploadCode, setUploadCode] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [municipiosDisponibles, setMunicipiosDisponibles] = useState<MunicipioItem[]>([]);
  const [filtroMunicipios, setFiltroMunicipios] = useState('');
  const [localidadesDisponibles, setLocalidadesDisponibles] = useState<LocalidadItem[]>([]);
  const [filtroLocalidades, setFiltroLocalidades] = useState('');
  const [modulosDisponibles, setModulosDisponibles] = useState<ModuloItem[]>([]);
  const [editingBlocked, setEditingBlocked] = useState('');

  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const localidadLabel = (item: LocalidadItem): string => `${item.nombre} (${item.municipio_nombre})`;
  const editingSolicitudId = useMemo(() => {
    const value = Number(searchParams.get('solicitud_id') ?? '');
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [searchParams]);
  const isNewFlow = useMemo(() => searchParams.get('new') === '1', [searchParams]);
  const selectedRoleName = (catalogos?.roles_registro.find((r) => String(r.id) === form.rol_id)?.nombre ?? '').toLowerCase();
  const roleIsTef = selectedRoleName === 'tercero especialista fitosanitario';
  const roleIsPfaOrIdentificador =
    selectedRoleName === 'profesional fitosanitario autorizado' || selectedRoleName === 'identificador';

  useEffect(() => {
    if (!editingSolicitudId && !isNewFlow) {
      navigate('/solicitudes', { replace: true });
    }
  }, [editingSolicitudId, isNewFlow, navigate]);

  useEffect(() => {
    const loadCatalogs = async () => {
      if (!token) return;
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE}/solicitudes/catalogos`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('No fue posible cargar catalogos');
        const data = (await response.json()) as SolicitudCatalogos;
        setCatalogos(data);
        setForm((prev) => ({
          ...prev,
          rol_id: data.roles_registro[0] ? String(data.roles_registro[0].id) : '',
          estado_id: data.estados_usuario[0] ? String(data.estados_usuario[0].id) : '',
          region_tecnica_id: data.regiones_tecnicas[0] ? String(data.regiones_tecnicas[0].id) : '',
          temporada_id: data.temporadas[0] ? String(data.temporadas[0].id) : '',
        }));
        const meResponse = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meResponse.ok) {
          const meData = (await meResponse.json()) as { user?: { email?: string } };
          if (meData.user?.email) {
            setForm((prev) => ({ ...prev, correo_notificacion: meData.user?.email ?? '' }));
          }
        }
      } catch {
        setCatalogos(null);
      } finally {
        setIsLoading(false);
      }
    };

    const loadExisting = async () => {
      if (!token) return;
      try {
        const response = await fetch(`${API_BASE}/solicitudes/mis-solicitudes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = (await response.json()) as DocumentoSolicitud[];
        setDocumentos(data);
      } catch {
        setDocumentos([]);
      }
    };

    void loadCatalogs();
    void loadExisting();
  }, [token]);

  useEffect(() => {
    const loadDetalle = async () => {
      if (!token || !editingSolicitudId) return;
      try {
        const response = await fetch(`${API_BASE}/solicitudes/detalle/${editingSolicitudId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          rol_id: number;
          estado_id: number;
          localidad_id: number;
          modulo_ids: number[];
          region_tecnica_id: number;
          temporada_id: number;
          fecha_solicitud: string;
          fecha_inicio_servicios: string;
          fecha_inicio_operacion: string;
          municipios_ids: number[];
          correo_notificacion: string;
          editable: boolean;
        };
        setForm((prev) => ({
          ...prev,
          rol_id: String(data.rol_id),
          estado_id: String(data.estado_id),
          localidad_id: String(data.localidad_id),
          modulo_ids: data.modulo_ids,
          region_tecnica_id: String(data.region_tecnica_id),
          temporada_id: String(data.temporada_id),
          fecha_solicitud: data.fecha_solicitud,
          fecha_inicio_servicios: data.fecha_inicio_servicios,
          fecha_inicio_operacion: data.fecha_inicio_operacion,
          municipios_ids: data.municipios_ids,
          correo_notificacion: data.correo_notificacion,
        }));
        if (!data.editable) {
          setEditingBlocked('Esta solicitud ya está validada y no se puede editar.');
        } else {
          setEditingBlocked('');
        }
      } catch {
        // no-op
      }
    };
    void loadDetalle();
  }, [token, editingSolicitudId]);

  useEffect(() => {
    const estadoId = Number(form.estado_id);
    if (!token || !estadoId) {
      setMunicipiosDisponibles([]);
      return;
    }
    const loadMunicipios = async () => {
      try {
        const response = await fetch(`${API_BASE}/solicitudes/municipios?estado_id=${estadoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          setMunicipiosDisponibles([]);
          return;
        }
        const data = (await response.json()) as MunicipioItem[];
        setMunicipiosDisponibles(data);
      } catch {
        setMunicipiosDisponibles([]);
      }
    };
    void loadMunicipios();
  }, [token, form.estado_id]);

  useEffect(() => {
    const estadoId = Number(form.estado_id);
    if (!token || !estadoId) {
      setLocalidadesDisponibles([]);
      setModulosDisponibles([]);
      return;
    }

    const loadLocalidades = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/solicitudes/localidades?estado_id=${estadoId}&q=${encodeURIComponent(filtroLocalidades)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok) {
          setLocalidadesDisponibles([]);
          return;
        }
        const data = (await response.json()) as LocalidadItem[];
        setLocalidadesDisponibles(data);
      } catch {
        setLocalidadesDisponibles([]);
      }
    };

    const loadModulos = async () => {
      try {
        const response = await fetch(`${API_BASE}/solicitudes/modulos?estado_id=${estadoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          setModulosDisponibles([]);
          return;
        }
        const data = (await response.json()) as ModuloItem[];
        setModulosDisponibles(data);
      } catch {
        setModulosDisponibles([]);
      }
    };

    void loadLocalidades();
    void loadModulos();
  }, [token, form.estado_id, filtroLocalidades]);

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!form.rol_id) nextErrors.rol_id = 'Selecciona el rol solicitado';
    if (!form.estado_id) nextErrors.estado_id = 'Selecciona el estado';
    if (!form.region_tecnica_id) nextErrors.region_tecnica_id = 'Selecciona la region tecnica';
    if (!form.temporada_id) nextErrors.temporada_id = 'Selecciona la temporada';
    if (!form.localidad_id) nextErrors.localidad_id = 'Selecciona la localidad';
    if (!form.fecha_solicitud) nextErrors.fecha_solicitud = 'Selecciona la fecha de solicitud';
    if (!form.fecha_inicio_servicios) nextErrors.fecha_inicio_servicios = 'Selecciona la fecha de inicio de servicios';
    if (!form.fecha_inicio_operacion) nextErrors.fecha_inicio_operacion = 'Selecciona la fecha de inicio de operacion';
    if (form.municipios_ids.length === 0) nextErrors.municipios_ids = 'Selecciona al menos un municipio';
    if (roleIsPfaOrIdentificador && form.modulo_ids.length === 0) {
      nextErrors.modulo_ids = 'Selecciona uno o mas modulos';
    }
    if (!roleIsTef && !roleIsPfaOrIdentificador && form.modulo_ids.length !== 1) {
      nextErrors.modulo_ids = 'Selecciona exactamente un modulo';
    }
    if (!form.correo_notificacion.includes('@')) nextErrors.correo_notificacion = 'Correo invalido';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submitSolicitud = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !validate() || editingBlocked) return;

    setIsSubmitting(true);
    setUploadStatus('');

    try {
      const response = await fetch(`${API_BASE}/solicitudes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          rol_id: Number(form.rol_id),
          estado_id: Number(form.estado_id),
          localidad_id: Number(form.localidad_id),
          modulo_ids: form.modulo_ids,
          region_tecnica_id: Number(form.region_tecnica_id),
          temporada_id: Number(form.temporada_id),
        }),
      });

      if (!response.ok) {
        let detail = 'No fue posible generar solicitudes';
        try {
          const errorData = (await response.json()) as { detail?: string };
          if (errorData.detail) detail = errorData.detail;
        } catch {
          // no-op
        }
        throw new Error(detail);
      }

      const data = (await response.json()) as SolicitudResponse;
      setDocumentos(data.documentos);
      setFolio(data.folio_grupo);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible generar los PDF de solicitud.';
      setUploadStatus(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const descargar = async (doc: DocumentoSolicitud) => {
    if (!token) return;
    const response = await fetch(`${API_BASE}${doc.download_url.replace('/api/v1', '')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `solicitud_sigmod_${doc.codigo_unico}.pdf`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const subirFirmado = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !uploadCode.trim() || !uploadFile) {
      setUploadStatus('Captura el codigo unico y selecciona archivo firmado.');
      return;
    }

    const formData = new FormData();
    formData.append('codigo_unico', uploadCode.trim().toUpperCase());
    formData.append('archivo', uploadFile);

    try {
      const response = await fetch(`${API_BASE}/solicitudes/cargar-firmado`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) throw new Error('Error al subir firmado');

      setUploadStatus('Documento firmado cargado correctamente.');
      const refresh = await fetch(`${API_BASE}/solicitudes/mis-solicitudes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (refresh.ok) {
        const data = (await refresh.json()) as DocumentoSolicitud[];
        setDocumentos(data);
      }
      setUploadFile(null);
    } catch {
      setUploadStatus('No fue posible cargar el documento firmado.');
    }
  };

  if (isLoading) {
    return <div className="p-8 text-slate-700">Cargando formulario de solicitud...</div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Solicitud de Clave de Acceso SIGMOD</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          {editingSolicitudId ? 'Edita tu solicitud de acceso.' : 'Completa el formulario para generar un PDF del estado seleccionado.'}
        </p>
      </div>

      {editingBlocked && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
          {editingBlocked}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={submitSolicitud}>
          <div>
            <label className="text-sm font-semibold">Rol solicitado</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={form.rol_id}
              onChange={(e) => setForm((prev) => ({ ...prev, rol_id: e.target.value, modulo_ids: [] }))}
            >
              <option value="">Seleccionar</option>
              {catalogos?.roles_registro.map((item) => (
                <option value={item.id} key={item.id}>{item.nombre}</option>
              ))}
            </select>
            {errors.rol_id && <p className="text-xs text-red-500 mt-1">{errors.rol_id}</p>}
          </div>

          <div>
            <label className="text-sm font-semibold">Estado</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={form.estado_id}
              onChange={(e) => {
                setFiltroLocalidades('');
                setForm((prev) => ({
                  ...prev,
                  estado_id: e.target.value,
                  municipios_ids: [],
                  localidad_id: '',
                  modulo_ids: [],
                }));
              }}
            >
              <option value="">Seleccionar</option>
              {catalogos?.estados_usuario.map((item) => (
                <option value={item.id} key={item.id}>{item.nombre}</option>
              ))}
            </select>
            {errors.estado_id && <p className="text-xs text-red-500 mt-1">{errors.estado_id}</p>}
          </div>

          <div>
            <label className="text-sm font-semibold">Region tecnica</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={form.region_tecnica_id}
              onChange={(e) => setForm((prev) => ({ ...prev, region_tecnica_id: e.target.value }))}
            >
              <option value="">Seleccionar</option>
              {catalogos?.regiones_tecnicas.map((item) => (
                <option value={item.id} key={item.id}>{item.nombre}</option>
              ))}
            </select>
            {errors.region_tecnica_id && <p className="text-xs text-red-500 mt-1">{errors.region_tecnica_id}</p>}
          </div>

          <div>
            <label className="text-sm font-semibold">Temporada</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={form.temporada_id}
              onChange={(e) => setForm((prev) => ({ ...prev, temporada_id: e.target.value }))}
            >
              <option value="">Seleccionar</option>
              {catalogos?.temporadas.map((item) => (
                <option value={item.id} key={item.id}>{item.nombre} ({item.nombre_corto})</option>
              ))}
            </select>
            {errors.temporada_id && <p className="text-xs text-red-500 mt-1">{errors.temporada_id}</p>}
          </div>

          <div>
            <label className="text-sm font-semibold">Buscar localidad (Lugar de emision)</label>
            <input
              list="localidades-options"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filtroLocalidades}
              onChange={(e) => {
                const value = e.target.value;
                setFiltroLocalidades(value);
                const match = localidadesDisponibles.find(
                  (item) => localidadLabel(item).toLowerCase() === value.toLowerCase(),
                );
                setForm((prev) => ({ ...prev, localidad_id: match ? String(match.id) : '' }));
              }}
              placeholder="Buscar localidad..."
            />
            <datalist id="localidades-options">
              {localidadesDisponibles.map((item) => (
                <option value={localidadLabel(item)} key={item.id} />
              ))}
            </datalist>
            {errors.localidad_id && <p className="text-xs text-red-500 mt-1">{errors.localidad_id}</p>}
          </div>

          <div>
            <label className="text-sm font-semibold">Fecha de solicitud</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={form.fecha_solicitud}
              onChange={(e) => setForm((prev) => ({ ...prev, fecha_solicitud: e.target.value }))}
            />
            {errors.fecha_solicitud && <p className="text-xs text-red-500 mt-1">{errors.fecha_solicitud}</p>}
          </div>

          <div>
            <label className="text-sm font-semibold">Inicio de servicios</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={form.fecha_inicio_servicios}
              onChange={(e) => setForm((prev) => ({ ...prev, fecha_inicio_servicios: e.target.value }))}
            />
            {errors.fecha_inicio_servicios && <p className="text-xs text-red-500 mt-1">{errors.fecha_inicio_servicios}</p>}
          </div>

          <div>
            <label className="text-sm font-semibold">Inicio de operacion en SIGMOD</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={form.fecha_inicio_operacion}
              onChange={(e) => setForm((prev) => ({ ...prev, fecha_inicio_operacion: e.target.value }))}
            />
            {errors.fecha_inicio_operacion && <p className="text-xs text-red-500 mt-1">{errors.fecha_inicio_operacion}</p>}
          </div>

          <div>
            <label className="text-sm font-semibold">Modulo de captura</label>
            {roleIsTef ? (
              <div className="mt-1 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600 bg-slate-50">
                No aplica para Tercero Especialista Fitosanitario.
              </div>
            ) : roleIsPfaOrIdentificador ? (
              <div className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-slate-200 p-3 space-y-2">
                {modulosDisponibles.map((item) => {
                  const checked = form.modulo_ids.includes(item.id);
                  return (
                    <label key={item.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...form.modulo_ids, item.id]
                            : form.modulo_ids.filter((id) => id !== item.id);
                          setForm((prev) => ({ ...prev, modulo_ids: next }));
                        }}
                      />
                      <span>{item.nombre}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={form.modulo_ids[0] ?? ''}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setForm((prev) => ({ ...prev, modulo_ids: value ? [value] : [] }));
                }}
              >
                <option value="">Seleccionar modulo</option>
                {modulosDisponibles.map((item) => (
                  <option value={item.id} key={item.id}>{item.nombre}</option>
                ))}
              </select>
            )}
            {errors.modulo_ids && <p className="text-xs text-red-500 mt-1">{errors.modulo_ids}</p>}
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Municipios (multiseleccion por estado)</label>
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() => setForm((prev) => ({ ...prev, municipios_ids: [] }))}
              >
                Limpiar todos
              </button>
            </div>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Buscar municipio..."
              value={filtroMunicipios}
              onChange={(e) => setFiltroMunicipios(e.target.value)}
            />
            <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-200 p-3 space-y-2">
              {municipiosDisponibles
                .filter((m) => m.nombre.toLowerCase().includes(filtroMunicipios.toLowerCase()))
                .map((municipio) => {
                  const checked = form.municipios_ids.includes(municipio.id);
                  return (
                    <label key={municipio.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...form.municipios_ids, municipio.id]
                            : form.municipios_ids.filter((id) => id !== municipio.id);
                          setForm((prev) => ({ ...prev, municipios_ids: next }));
                        }}
                      />
                      <span>{municipio.nombre}</span>
                    </label>
                  );
                })}
            </div>
            {errors.municipios_ids && <p className="text-xs text-red-500 mt-1">{errors.municipios_ids}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-semibold">Correo electronico para envio de clave</label>
            <input
              type="email"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              value={form.correo_notificacion}
              onChange={(e) => setForm((prev) => ({ ...prev, correo_notificacion: e.target.value }))}
              placeholder="correo@dominio.com"
            />
            {errors.correo_notificacion && <p className="text-xs text-red-500 mt-1">{errors.correo_notificacion}</p>}
          </div>

          <div className="md:col-span-2 flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div>
              <p className="text-sm font-semibold">Estados a procesar</p>
              <p className="text-xs text-slate-600">
                {catalogos?.estados_usuario.find((e) => String(e.id) === form.estado_id)?.nombre ?? 'Sin estado seleccionado'}
              </p>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2 disabled:opacity-60"
              disabled={isSubmitting || Boolean(editingBlocked)}
            >
              <Icon name="description" className="text-base" />
              {isSubmitting ? 'Guardando...' : (editingSolicitudId ? 'Guardar cambios' : 'Generar PDF')}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Documentos generados</h2>
          {folio && <p className="text-xs text-slate-600">Folio: {folio}</p>}
        </div>

        <div className="space-y-3">
          {documentos.length === 0 && <p className="text-sm text-slate-500">Aun no hay documentos generados.</p>}
          {documentos.map((doc) => (
            <div key={doc.solicitud_id} className="rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{doc.estado_nombre}</p>
                <p className="text-xs text-slate-600">Codigo unico: {doc.codigo_unico}</p>
                <p className="text-xs text-slate-600">Estatus: {doc.estatus_proceso}</p>
                <p className={`text-xs ${doc.editable_regenerable ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {doc.editable_regenerable ? 'Editable y regenerable' : (doc.motivo_no_editable ?? 'No editable')}
                </p>
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-primary text-primary px-3 py-2 hover:bg-primary/5"
                onClick={() => void descargar(doc)}
              >
                <Icon name="download" className="text-base" /> Descargar PDF
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-2">Completar registro: subir documento firmado</h2>
        <p className="text-sm text-slate-600 mb-4">
          Ingresa el codigo unico impreso en la esquina inferior derecha del PDF y sube el archivo firmado y escaneado.
        </p>

        <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={subirFirmado}>
          <input
            className="rounded-xl border border-slate-300 px-3 py-2"
            value={uploadCode}
            onChange={(e) => setUploadCode(e.target.value.toUpperCase())}
            placeholder="SGM-XXXXXXXX"
          />
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="rounded-xl border border-slate-300 px-3 py-2"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
          />
          <button type="submit" className="rounded-xl bg-secondary text-primary px-3 py-2 font-semibold">
            Subir firmado
          </button>
        </form>

        {uploadStatus && <p className="text-sm mt-3 text-slate-700">{uploadStatus}</p>}
      </div>
    </div>
  );
}
