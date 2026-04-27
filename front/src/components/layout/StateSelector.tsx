import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

export default function StateSelector() {
  const { activeStateName, activeStateId, availableStates, isSenasica, switchState } = useAuth();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  // Cerrar al hacer click fuera.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase('es');
    if (!q) return availableStates;
    return availableStates.filter(
      (s) => s.nombre.toLocaleLowerCase('es').includes(q) || s.clave.includes(q),
    );
  }, [availableStates, filter]);

  if (!activeStateName) return null;

  // Roles no-senasica con solo un estado: chip read-only.
  if (!isSenasica && availableStates.length <= 1) {
    return (
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 text-sm">
        <Icon name="public" className="text-primary text-base" />
        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[12rem]">
          {activeStateName}
        </span>
      </div>
    );
  }

  // Senasica o roles multi-estado: dropdown clickeable.
  const onPick = async (estadoId: number) => {
    if (estadoId === activeStateId) {
      setOpen(false);
      return;
    }
    setError('');
    setSubmittingId(estadoId);
    const result = await switchState(estadoId);
    setSubmittingId(null);
    if (result.success) {
      setOpen(false);
      setFilter('');
    } else {
      setError(result.error ?? 'No se pudo cambiar de estado.');
    }
  };

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Cambiar estado activo"
      >
        <Icon name="public" className="text-base" />
        <span className="truncate max-w-[12rem]">{activeStateName}</span>
        {isSenasica && (
          <span className="hidden xl:inline px-1.5 py-0.5 rounded bg-primary/20 text-[10px] uppercase tracking-wider">
            SENASICA
          </span>
        )}
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-base" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-700">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Cambiar estado activo
            </p>
            <div className="relative">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Buscar estado"
                autoFocus
                className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 text-xs text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-300 border-b border-red-200">
              {error}
            </div>
          )}

          <div className="max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Sin resultados.</p>
            ) : (
              filtered.map((s) => {
                const isActive = s.id === activeStateId;
                const submitting = submittingId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void onPick(s.id)}
                    disabled={submittingId !== null}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 ${
                      isActive ? 'bg-primary/5 dark:bg-primary/10' : ''
                    }`}
                  >
                    <div className={`size-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      isActive ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}>
                      {s.clave}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${isActive ? 'font-bold text-primary' : 'text-slate-900 dark:text-slate-100'}`}>
                        {s.nombre}
                      </p>
                    </div>
                    {submitting && (
                      <span className="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
                    )}
                    {isActive && !submitting && (
                      <Icon name="check" className="text-primary text-base" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
