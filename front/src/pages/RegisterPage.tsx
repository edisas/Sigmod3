import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';
import { sanitizeInput, isValidEmail, validatePassword } from '@/utils/security';
import {
  DEFAULT_INSTITUTIONAL_LOGO,
  fetchPublicAssets,
  getStoredPublicAssets,
} from '@/utils/systemBranding';

interface RolItem {
  id: number;
  nombre: string;
  descripcion?: string | null;
}

interface FiguraItem {
  id: number;
  nombre: string;
  nombre_corto?: string | null;
}

const ROLES_WITH_FIGURA = new Set(['capturista', 'profesional fitosanitario autorizado']);

export default function RegisterPage() {
  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
  const navigate = useNavigate();
  const { register, isLoading } = useAuth();
  const [assets, setAssets] = useState(getStoredPublicAssets());
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    rolId: '',
    figuraCooperadoraId: '',
    password: '',
    confirmPassword: '',
    estadosIds: [] as number[],
    acceptTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [estadosDisponibles, setEstadosDisponibles] = useState<Array<{ id: number; clave: string; nombre: string }>>([]);
  const [rolesDisponibles, setRolesDisponibles] = useState<RolItem[]>([]);
  const [figurasDisponibles, setFigurasDisponibles] = useState<FiguraItem[]>([]);
  const [estadosError, setEstadosError] = useState('');

  useEffect(() => {
    const loadCatalogos = async () => {
      try {
        const [estadosResp, registerCatalogosResp] = await Promise.all([
          fetch(`${API_BASE}/auth/estados-disponibles`),
          fetch(`${API_BASE}/auth/register-catalogos`),
        ]);

        if (!estadosResp.ok) {
          setEstadosError(`No se pudieron cargar estados (HTTP ${estadosResp.status}).`);
          return;
        }
        const estadosData = (await estadosResp.json()) as Array<{ id: number; clave: string; nombre: string }>;
        setEstadosDisponibles(estadosData);

        if (!registerCatalogosResp.ok) {
          setEstadosError(`No se pudieron cargar roles/figuras (HTTP ${registerCatalogosResp.status}).`);
          return;
        }
        const registerCatalogos = (await registerCatalogosResp.json()) as {
          roles: RolItem[];
          figuras_cooperadoras: FiguraItem[];
          figuras_vigentes_count?: number;
        };
        setRolesDisponibles(registerCatalogos.roles);
        setFigurasDisponibles(registerCatalogos.figuras_cooperadoras);
        setEstadosError('');
      } catch {
        setEstadosDisponibles([]);
        setRolesDisponibles([]);
        setFigurasDisponibles([]);
        setEstadosError('Error de conexión con el API al cargar estados.');
      }
    };
    void loadCatalogos();
  }, [API_BASE]);

  useEffect(() => {
    void fetchPublicAssets(API_BASE)
      .then((value) => setAssets(value))
      .catch(() => undefined);
  }, [API_BASE]);

  const updateField = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!sanitizeInput(formData.fullName)) newErrors.fullName = 'Nombre requerido';
    if (!isValidEmail(sanitizeInput(formData.email))) newErrors.email = 'Correo inválido';
    if (!formData.rolId) newErrors.rolId = 'Selecciona el rol';
    if (formData.estadosIds.length === 0) newErrors.estadosIds = 'Selecciona al menos un estado';
    const rolSeleccionado = rolesDisponibles.find((item) => item.id === Number(formData.rolId));
    const requiereFigura = Boolean(rolSeleccionado && ROLES_WITH_FIGURA.has(rolSeleccionado.nombre.toLowerCase()));
    if (requiereFigura && !formData.figuraCooperadoraId) {
      newErrors.figuraCooperadoraId = 'Selecciona la figura cooperadora para este rol';
    }

    const pwResult = validatePassword(formData.password);
    if (!pwResult.isValid) newErrors.password = pwResult.errors[0];
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Las contraseñas no coinciden';
    if (!formData.acceptTerms) newErrors.acceptTerms = 'Debes aceptar los términos';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const result = await register({
      fullName: sanitizeInput(formData.fullName),
      email: sanitizeInput(formData.email),
      password: formData.password,
      estadosIds: formData.estadosIds,
      rolId: Number(formData.rolId),
      figuraCooperadoraId: formData.figuraCooperadoraId ? Number(formData.figuraCooperadoraId) : null,
    });
    if (result.success) {
      navigate(result.redirectTo || '/solicitud-acceso?new=1');
    } else {
      setErrors((prev) => ({ ...prev, submit: result.error ?? 'No se pudo completar el registro.' }));
    }
  };

  const fieldClass = (field: string) =>
    `w-full px-4 py-3.5 rounded-xl border ${
      errors[field] ? 'border-red-400 ring-1 ring-red-400' : 'border-neutral-gray'
    } focus:ring-2 focus:ring-secondary focus:border-secondary bg-white dark:bg-slate-800 dark:border-slate-700 outline-none transition-all text-sm`;

  const rolSeleccionado = rolesDisponibles.find((item) => item.id === Number(formData.rolId));
  const mostrarFiguraCooperadora = Boolean(rolSeleccionado && ROLES_WITH_FIGURA.has(rolSeleccionado.nombre.toLowerCase()));
  const bloqueoPorRolFigura = mostrarFiguraCooperadora && figurasDisponibles.length === 0;

  return (
    <div className="flex w-full min-h-screen items-center justify-center p-0 md:p-4">
      <div className="flex w-full max-w-[1200px] min-h-[850px] bg-white dark:bg-slate-900 rounded-none md:rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
        {/* Left panel */}
        <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-12 overflow-hidden bg-primary">
          <div className="absolute inset-0 z-0">
            <div className="w-full h-full bg-primary" />
          </div>
          <div className="relative z-20 w-full">
            <div className="mx-auto max-w-3xl bg-white rounded-2xl shadow-xl p-6 xl:p-8 flex items-center justify-center">
              <img
                src={DEFAULT_INSTITUTIONAL_LOGO}
                alt="Agricultura y SENASICA"
                className="w-full max-w-2xl h-auto object-contain"
              />
            </div>
          </div>
        </div>

        {/* Right panel: Form */}
        <div className="w-full lg:w-1/2 flex flex-col px-6 py-10 md:px-16 md:py-12 overflow-y-auto">
          <div className="flex justify-between items-center mb-10 lg:hidden">
            <div className="flex items-center gap-2 text-primary font-bold">
              <img
                src={assets.login_logo_url}
                alt="SIGMOD 3"
                className="h-10 w-auto object-contain"
              />
            </div>
          </div>

          <div className="max-w-md mx-auto w-full animate-slide-up">
            <div className="mb-10">
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                Crear una Cuenta
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {bloqueoPorRolFigura && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  No hay Figuras Cooperadoras con autorización vigente en temporada activa para registrar este rol.
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Icon name="person" className="text-base" /> Nombre Completo
                </label>
                <div className="relative">
                  <Icon name="person" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => updateField('fullName', e.target.value)}
                    className={`${fieldClass('fullName')} pl-12`}
                    placeholder="Juan Pérez"
                    maxLength={100}
                  />
                </div>
                {errors.fullName && <p className="text-xs text-red-500">{errors.fullName}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Icon name="mail" className="text-base" /> Correo Electrónico
                </label>
                <div className="relative">
                  <Icon name="mail" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    className={`${fieldClass('email')} pl-12`}
                    placeholder="juan@ejemplo.com"
                    maxLength={254}
                  />
                </div>
                {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Icon name="badge" className="text-base" /> Rol solicitado
                </label>
                <select
                  value={formData.rolId}
                  onChange={(e) => {
                    updateField('rolId', e.target.value);
                    updateField('figuraCooperadoraId', '');
                  }}
                  className={fieldClass('rolId')}
                >
                  <option value="">Selecciona rol</option>
                  {rolesDisponibles.map((rol) => (
                    <option key={rol.id} value={rol.id}>
                      {rol.nombre}
                    </option>
                  ))}
                </select>
                {errors.rolId && <p className="text-xs text-red-500">{errors.rolId}</p>}
              </div>

              {mostrarFiguraCooperadora && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Icon name="group" className="text-base" /> Figura Cooperadora
                  </label>
                  <select
                    value={formData.figuraCooperadoraId}
                    onChange={(e) => updateField('figuraCooperadoraId', e.target.value)}
                    className={fieldClass('figuraCooperadoraId')}
                  >
                    <option value="">Selecciona figura cooperadora</option>
                    {figurasDisponibles.map((figura) => (
                      <option key={figura.id} value={figura.id}>
                        {figura.nombre}
                      </option>
                    ))}
                  </select>
                  {errors.figuraCooperadoraId && <p className="text-xs text-red-500">{errors.figuraCooperadoraId}</p>}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Icon name="lock" className="text-base" /> Contraseña
                  </label>
                  <div className="relative">
                    <Icon name="lock" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => updateField('password', e.target.value)}
                      className={`${fieldClass('password')} pl-12 pr-12`}
                      placeholder="••••••••"
                      maxLength={128}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center justify-center w-11 text-slate-400 hover:text-slate-600"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      <Icon name={showPassword ? 'visibility_off' : 'visibility'} className="text-xl" />
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Icon name="verified_user" className="text-base" /> Confirmar
                  </label>
                  <div className="relative">
                    <Icon name="verified_user" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={(e) => updateField('confirmPassword', e.target.value)}
                      className={`${fieldClass('confirmPassword')} pl-12 pr-12`}
                      placeholder="••••••••"
                      maxLength={128}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 flex items-center justify-center w-11 text-slate-400 hover:text-slate-600"
                      aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      <Icon name={showConfirmPassword ? 'visibility_off' : 'visibility'} className="text-xl" />
                    </button>
                  </div>
                  {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Icon name="location_on" className="text-base" /> Estados con acceso
                </label>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-neutral-gray p-3 bg-white dark:bg-slate-800 dark:border-slate-700">
                  {estadosDisponibles.length === 0 && (
                    <p className="text-xs text-slate-500">No hay estados disponibles para mostrar.</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {estadosDisponibles.map((estado) => {
                      const checked = formData.estadosIds.includes(estado.id);
                      return (
                        <label key={estado.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...formData.estadosIds, estado.id]
                                : formData.estadosIds.filter((id) => id !== estado.id);
                              updateField('estadosIds', next);
                            }}
                            className="h-4 w-4 rounded border-neutral-gray text-primary focus:ring-primary/50"
                          />
                          <span>{estado.nombre}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {errors.estadosIds && <p className="text-xs text-red-500">{errors.estadosIds}</p>}
                {estadosError && <p className="text-xs text-red-500">{estadosError}</p>}
              </div>

              <div className="flex items-center gap-3 py-2">
                <input
                  id="terms"
                  type="checkbox"
                  checked={formData.acceptTerms}
                  onChange={(e) => updateField('acceptTerms', e.target.checked)}
                  className="w-5 h-5 rounded border-neutral-gray text-primary focus:ring-primary/50 cursor-pointer"
                />
                <label htmlFor="terms" className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                  Acepto los{' '}
                  <a href="/terminos_y_condiciones.pdf" download className="text-primary font-semibold hover:underline">
                    Términos y Condiciones
                  </a>{' '}
                  y Política de Privacidad.
                </label>
              </div>
              {errors.acceptTerms && <p className="text-xs text-red-500">{errors.acceptTerms}</p>}

              {errors.submit && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                  <Icon name="error" className="text-red-500 text-lg shrink-0" />
                  {errors.submit}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || bloqueoPorRolFigura}
                className="btn-primary w-full py-4 flex items-center justify-center gap-2 mt-4 disabled:opacity-60"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Registrando...
                  </span>
                ) : (
                  <>
                    Comenzar <Icon name="arrow_forward" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-10 pt-8 border-t border-slate-100 dark:border-slate-800 text-center">
              <p className="text-slate-600 dark:text-slate-400">
                ¿Ya tienes cuenta?{' '}
                <Link to="/login" className="text-primary font-bold hover:underline ml-1">
                  Iniciar sesión
                </Link>
              </p>
            </div>

            <div className="mt-8 flex justify-center gap-6">
              <div className="flex items-center gap-1 text-slate-400 text-xs uppercase tracking-widest font-bold">
                <Icon name="shield" className="text-xs" /> SSL Seguro
              </div>
              <div className="flex items-center gap-1 text-slate-400 text-xs uppercase tracking-widest font-bold">
                <Icon name="cloud" className="text-xs" /> Cloud Sync
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
