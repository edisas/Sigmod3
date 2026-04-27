import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';
import {
  DEFAULT_INSTITUTIONAL_LOGO,
  fetchPublicAssets,
  getStoredPublicAssets,
} from '@/utils/systemBranding';

interface StateOption {
  id: number;
  clave: string;
  nombre: string;
}

const STATE_SELECT_TOKEN_KEY = 'sigmod_state_select_token';
const STATE_SELECT_STATES_KEY = 'sigmod_state_select_states';
const STATE_SELECT_USER_KEY = 'sigmod_state_select_user';

export default function SelectStatePage() {
  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
  const navigate = useNavigate();
  const { completeStateSelection, isLoading } = useAuth();

  const [assets, setAssets] = useState(getStoredPublicAssets());
  const [states, setStates] = useState<StateOption[]>([]);
  const [userName, setUserName] = useState('');
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  // setState al mount con datos de sessionStorage es patrón legítimo de
  // hidratar UI desde almacenamiento; la regla v6 sobre-marca setState síncronos.
  useEffect(() => {
    const raw = sessionStorage.getItem(STATE_SELECT_STATES_KEY);
    const userRaw = sessionStorage.getItem(STATE_SELECT_USER_KEY);
    if (!raw) {
      navigate('/login', { replace: true });
      return;
    }
    try {
      const parsed = JSON.parse(raw) as StateOption[];
      const sorted = [...parsed].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStates(sorted);
      if (userRaw) {
        const u = JSON.parse(userRaw) as { full_name?: string; nombre?: string; nombre_usuario?: string };
        setUserName(u.full_name ?? u.nombre ?? u.nombre_usuario ?? '');
      }
    } catch {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    void fetchPublicAssets(API_BASE)
      .then((value) => setAssets(value))
      .catch(() => undefined);
  }, [API_BASE]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase('es');
    if (!q) return states;
    return states.filter(
      (s) => s.nombre.toLocaleLowerCase('es').includes(q) || s.clave.includes(q),
    );
  }, [states, filter]);

  const onSelect = async (estadoId: number) => {
    setError('');
    setSubmittingId(estadoId);
    const result = await completeStateSelection(estadoId);
    setSubmittingId(null);
    if (result.success) {
      navigate(result.redirectTo || '/');
    } else {
      setError(result.error ?? 'No se pudo completar el inicio de sesión.');
      if (result.redirectTo === '/login') {
        navigate('/login', { replace: true });
      }
    }
  };

  const cancel = () => {
    sessionStorage.removeItem(STATE_SELECT_TOKEN_KEY);
    sessionStorage.removeItem(STATE_SELECT_STATES_KEY);
    sessionStorage.removeItem(STATE_SELECT_USER_KEY);
    navigate('/login', { replace: true });
  };

  const initials = useMemo(() => {
    const parts = userName.split(' ').filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
  }, [userName]);

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      {/* Lado izquierdo: contenido */}
      <div className="flex flex-1 flex-col justify-start px-6 py-10 lg:px-16 xl:px-24 bg-background-light dark:bg-background-dark">
        <div className="mx-auto w-full max-w-3xl animate-slide-up">
          {/* Header con logo + chip usuario */}
          <div className="flex items-center justify-between mb-8">
            <img
              src={assets.login_logo_url}
              alt="SIGMOD 3"
              className="h-16 w-auto object-contain"
            />
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-right leading-tight">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {userName || 'Usuario'}
                </span>
                <button
                  type="button"
                  onClick={cancel}
                  className="text-xs text-slate-500 hover:text-primary"
                >
                  No soy yo · Salir
                </button>
              </div>
              <div className="size-10 rounded-full bg-primary text-white font-bold flex items-center justify-center">
                {initials}
              </div>
            </div>
          </div>

          {/* Título + subtítulo */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              Selecciona un estado
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-300">
              Operarás en el estado que elijas durante esta sesión. Tienes acceso a{' '}
              <span className="font-semibold text-primary">{states.length}</span> estados.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
              <Icon name="error" className="text-red-500 text-lg shrink-0" />
              {error}
            </div>
          )}

          {/* Buscador */}
          <div className="relative mb-5">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none"
            />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar por nombre o clave"
              className="input-field pl-12"
              autoFocus
            />
          </div>

          {/* Grid de estados */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[calc(100vh-26rem)] lg:max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <div className="col-span-full text-center text-slate-500 py-10 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                Sin resultados para "{filter}"
              </div>
            ) : (
              filtered.map((s) => {
                const submitting = submittingId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void onSelect(s.id)}
                    disabled={isLoading || submittingId !== null}
                    className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-primary hover:shadow-lg hover:-translate-y-0.5 transition-all p-4 text-left flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
                  >
                    <div className="size-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-base shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                      {s.clave}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {s.nombre}
                      </p>
                      <p className="text-xs text-slate-500">Clave {s.clave}</p>
                    </div>
                    {submitting ? (
                      <span className="size-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
                    ) : (
                      <Icon
                        name="arrow_forward"
                        className="text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer mobile */}
          <div className="mt-8 sm:hidden text-center">
            <button type="button" onClick={cancel} className="text-sm text-slate-500 hover:text-primary">
              Cancelar y volver al login
            </button>
          </div>

          <p className="hidden sm:block mt-10 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
            © 2026 SENASICA. Sistema para la Gestión de Moscas de la Fruta y Operaciones de Campo.
          </p>
        </div>
      </div>

      {/* Lado derecho: panel institucional */}
      <div className="hidden lg:flex lg:relative lg:w-2/5 xl:w-1/3 items-center justify-center overflow-hidden bg-primary">
        <div className="absolute inset-0 z-0 bg-primary" />
        <div className="relative z-20 w-full px-10">
          <div className="mx-auto max-w-md bg-white rounded-2xl shadow-xl p-6 flex items-center justify-center">
            <img
              src={DEFAULT_INSTITUTIONAL_LOGO}
              alt="Agricultura y SENASICA"
              className="w-full max-w-sm h-auto object-contain"
            />
          </div>
          <p className="mt-6 text-center text-white/80 text-sm leading-relaxed">
            Sistema oficial de gestión fitosanitaria.<br />
            Tu sesión opera bajo el estado seleccionado.
          </p>
        </div>
      </div>
    </div>
  );
}
