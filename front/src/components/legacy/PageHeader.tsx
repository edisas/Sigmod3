import { type ReactNode } from 'react';
import Icon from '@/components/ui/Icon';

interface Props {
  icon?: string;
  title: string;
  subtitle?: string;
  /** Estado mostrado como pill ámbar. */
  estado?: string | null;
  /** Acciones a la derecha (ej. botón generar). */
  actions?: ReactNode;
}

/**
 * Encabezado consistente para páginas de reportes/correcciones legacy.
 * Reemplaza el patrón duplicado `<div><h1>...</h1><p>...</p></div>`.
 */
export default function PageHeader({ icon, title, subtitle, estado, actions }: Props) {
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <span className="flex-shrink-0 size-11 rounded-xl bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 inline-flex items-center justify-center">
            <Icon name={icon} className="text-2xl" />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
              {title}
            </h1>
            {estado && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                <Icon name="location_on" className="text-sm" />
                {estado}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </header>
  );
}
