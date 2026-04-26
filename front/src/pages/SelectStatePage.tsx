import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

interface StateOption {
  id: number;
  clave: string;
  nombre: string;
}

const STATE_SELECT_STATES_KEY = 'sigmod_state_select_states';
const STATE_SELECT_USER_KEY = 'sigmod_state_select_user';

export default function SelectStatePage() {
  const navigate = useNavigate();
  const { completeStateSelection, isLoading } = useAuth();

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

  const filtered = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase('es');
    if (!q) return states;
    return states.filter((s) => s.nombre.toLocaleLowerCase('es').includes(q) || s.clave.includes(q));
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

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            Selecciona un estado
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            {userName ? `Hola, ${userName}. ` : ''}
            Elige el estado en el que vas a operar durante esta sesión.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
            <Icon name="error" className="text-red-500 text-lg shrink-0" />
            {error}
          </div>
        )}

        <div className="mb-4">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar estado por nombre o clave"
              className="input-field pl-12"
              autoFocus
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-full text-center text-slate-500 py-8">
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
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-primary hover:shadow-md transition-all p-4 text-left flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                    {s.clave}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{s.nombre}</p>
                    <p className="text-xs text-slate-500">Clave {s.clave}</p>
                  </div>
                  {submitting ? (
                    <span className="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <Icon name="arrow_forward" className="text-slate-400" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem('sigmod_state_select_token');
              sessionStorage.removeItem(STATE_SELECT_STATES_KEY);
              sessionStorage.removeItem(STATE_SELECT_USER_KEY);
              navigate('/login', { replace: true });
            }}
            className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Cancelar y volver al login
          </button>
        </div>
      </div>
    </div>
  );
}
