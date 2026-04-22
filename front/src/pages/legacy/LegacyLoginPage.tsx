import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth, type LegacyBaseOption } from '@/context/LegacyAuthContext';
import { sanitizeInput } from '@/utils/security';

export default function LegacyLoginPage() {
  const navigate = useNavigate();
  const { login, fetchBases, isAuthenticated, isLoading } = useLegacyAuth();
  const [bases, setBases] = useState<LegacyBaseOption[]>([]);
  const [legacyDb, setLegacyDb] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetchBases().then((list) => {
      setBases(list);
      if (list.length > 0) setLegacyDb(list[0].clave);
    });
  }, [fetchBases]);

  useEffect(() => {
    if (isAuthenticated) navigate('/legacy', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanUser = sanitizeInput(usuario);
    if (!legacyDb) {
      setError('Selecciona un estado.');
      return;
    }
    if (!cleanUser) {
      setError('Ingresa un usuario válido.');
      return;
    }
    if (!password) {
      setError('Ingresa la contraseña.');
      return;
    }
    setSubmitting(true);
    const result = await login(legacyDb, cleanUser, password);
    setSubmitting(false);
    if (result.success) {
      navigate('/legacy', { replace: true });
    } else {
      setError(result.error ?? 'Credenciales inválidas.');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-amber-900 via-amber-800 to-orange-900 px-4 py-12">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 animate-slide-up">
        <div className="flex items-center gap-3 mb-8">
          <div className="size-14 rounded-xl bg-amber-500 flex items-center justify-center font-bold text-amber-950 text-2xl">
            2
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">SIGMOD 2</h1>
            <p className="text-xs text-amber-700 dark:text-amber-400 uppercase tracking-widest font-semibold">
              Acceso Legacy
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Selecciona el estado y accede con tus credenciales del sistema legacy.
        </p>

        {error && (
          <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
            <Icon name="error" className="text-red-500 text-lg shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label htmlFor="legacyDb" className="block text-sm font-medium text-slate-900 dark:text-slate-200 mb-2">
              Estado
            </label>
            <div className="relative">
              <Icon name="location_on" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
              <select
                id="legacyDb"
                value={legacyDb}
                onChange={(e) => setLegacyDb(e.target.value)}
                className="input-field pl-12 appearance-none"
                required
              >
                {bases.length === 0 && <option value="">Cargando...</option>}
                {bases.map((b) => (
                  <option key={b.clave} value={b.clave}>
                    {b.nombre_estado} ({b.clave})
                  </option>
                ))}
              </select>
              <Icon name="expand_more" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
            </div>
          </div>

          <div>
            <label htmlFor="usuario" className="block text-sm font-medium text-slate-900 dark:text-slate-200 mb-2">
              Usuario
            </label>
            <div className="relative">
              <Icon name="person" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
              <input
                id="usuario"
                type="text"
                autoComplete="username"
                required
                maxLength={50}
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="input-field pl-12"
                placeholder="Usuario legacy"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-900 dark:text-slate-200 mb-2">
              Contraseña
            </label>
            <div className="relative">
              <Icon name="lock" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                maxLength={50}
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

          <button
            type="submit"
            disabled={submitting || isLoading}
            className="w-full flex justify-center items-center gap-2 px-3 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Accediendo...
              </>
            ) : (
              'Acceder a SIGMOD 2'
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 font-medium"
          >
            <Icon name="arrow_back" className="text-base" />
            Volver a SIGMOD 3
          </Link>
        </div>
      </div>
    </div>
  );
}
