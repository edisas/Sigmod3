import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import TurnstileWidget from '@/components/auth/TurnstileWidget';
import { useAuth } from '@/context/AuthContext';
import { sanitizeInput, loginRateLimiter } from '@/utils/security';
import {
  DEFAULT_INSTITUTIONAL_LOGO,
  fetchPublicAssets,
  getStoredPublicAssets,
} from '@/utils/systemBranding';

export default function LoginPage() {
  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  const [assets, setAssets] = useState(getStoredPublicAssets());
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaEnabled = import.meta.env.VITE_TURNSTILE_ENABLED === 'true';
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

  useEffect(() => {
    void fetchPublicAssets(API_BASE)
      .then((value) => setAssets(value))
      .catch(() => undefined);
  }, [API_BASE]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUser = sanitizeInput(nombreUsuario);

    if (!cleanUser || cleanUser.length < 3) {
      setError('Ingresa un nombre de usuario válido.');
      return;
    }

    if (loginRateLimiter.isRateLimited(cleanUser)) {
      const remaining = Math.ceil(loginRateLimiter.getRemainingTime(cleanUser) / 60000);
      setError(`Demasiados intentos. Intenta de nuevo en ${remaining} minutos.`);
      return;
    }

    loginRateLimiter.recordAttempt(cleanUser);

    if (captchaEnabled && !captchaToken) {
      setError('Completa el captcha para continuar.');
      return;
    }

    const result = await login(cleanUser, password, captchaEnabled ? captchaToken : undefined);
    if (result.success) {
      navigate(result.redirectTo || '/');
    } else {
      setError('Credenciales incorrectas.');
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      {/* Left Side: Login Form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-24 xl:px-32 bg-background-light dark:bg-background-dark">
        <div className="mx-auto w-full max-w-sm lg:ml-0 animate-slide-up">
          {/* Logo */}
          <div className="-mt-6 mb-1">
            <img
              src={assets.login_logo_url}
              alt="SIGMOD 3"
              className="h-80 w-auto object-contain"
            />
          </div>

          <div className="space-y-2 mb-8">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Bienvenido</h2>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
              <Icon name="error" className="text-red-500 text-lg shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div>
              <label htmlFor="nombreUsuario" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
                Nombre de usuario
              </label>
              <div className="mt-2 relative">
                <Icon name="person" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
                <input
                  id="nombreUsuario"
                  type="text"
                  autoComplete="username"
                  required
                  maxLength={50}
                  value={nombreUsuario}
                  onChange={(e) => setNombreUsuario(e.target.value)}
                  className="input-field pl-12"
                  placeholder="Usuario"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
                  Contraseña
                </label>
                <Link
                  to="/forgot-password"
                  tabIndex={-1}
                  className="text-sm font-semibold text-primary hover:text-primary/80 dark:text-sky-blue"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="mt-2 relative">
                <Icon name="lock" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-12 pr-12"
                  placeholder="••••••••"
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
            </div>

            <div className="flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary dark:bg-slate-800 dark:border-slate-700"
              />
              <label htmlFor="remember-me" className="ml-3 block text-sm leading-6 text-slate-700 dark:text-slate-300">
                Recordar este dispositivo
              </label>
            </div>

            {captchaEnabled && (
              <div>
                {turnstileSiteKey ? (
                <TurnstileWidget
                  siteKey={turnstileSiteKey}
                  onToken={(token) => setCaptchaToken(token)}
                  onError={() => setError('No fue posible cargar el captcha.')}
                />
              ) : (
                <p className="text-sm text-red-600">Falta configurar VITE_TURNSTILE_SITE_KEY en el frontend.</p>
              )}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary flex w-full justify-center px-3 py-3 text-sm leading-6 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Iniciando Sesion...
                </span>
              ) : (
                'Iniciar Sesion'
              )}
            </button>
          </form>

          <p className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Registrate para iniciar sesión{' '}
            <Link to="/register" className="font-semibold leading-6 text-primary hover:text-primary/80 dark:text-sky-blue">
              aquí
            </Link>
          </p>

          <div className="mt-6 flex items-center justify-center">
            <Link
              to="/legacy/login"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
            >
              <Icon name="history" className="text-base" />
              Ingresar a SIGMOD 2 (Legacy)
            </Link>
          </div>

          <p className="mt-8 text-center text-xs leading-5 text-slate-600 dark:text-slate-300">
            © 2026 SENASICA, Todos los derechos reservados. Prohibida su reproduccion
          </p>
        </div>
      </div>

      {/* Right Side: Institutional Panel */}
      <div className="hidden lg:relative lg:flex lg:flex-1 items-center justify-center overflow-hidden bg-primary">
        <div className="absolute inset-0 z-0">
          <div className="w-full h-full bg-primary" />
        </div>
        <div className="relative z-20 w-full px-12">
          <div className="mx-auto max-w-3xl bg-white rounded-2xl shadow-xl p-6 xl:p-8 flex items-center justify-center">
            <img
              src={DEFAULT_INSTITUTIONAL_LOGO}
              alt="Agricultura y SENASICA"
              className="w-full max-w-2xl h-auto object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
