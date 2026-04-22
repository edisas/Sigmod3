import { Link } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import ErrorLayout from '@/components/errors/ErrorLayout';

export default function ForbiddenPage() {
  return (
    <ErrorLayout>
      <div className="max-w-2xl w-full text-center animate-slide-up">
        {/* Illustration */}
        <div className="relative mb-8 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full" />
            <div className="relative flex items-center justify-center size-48 sm:size-64 bg-background-light dark:bg-slate-800 rounded-full border border-primary/20 shadow-xl overflow-hidden">
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: 'radial-gradient(circle at 2px 2px, #014421 1px, transparent 0)',
                  backgroundSize: '24px 24px',
                }}
              />
              <div className="flex flex-col items-center">
                <Icon name="lock_person" className="text-primary text-8xl sm:text-9xl" />
                <div className="-mt-5 bg-primary text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-1">
                  <Icon name="security" className="text-sm" /> Restringido
                </div>
              </div>
            </div>
          </div>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight">
          Acceso Restringido
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 mb-10 max-w-lg mx-auto leading-relaxed">
          Tu cuenta no tiene los permisos necesarios para ver este sector o datos. Contacta a tu supervisor si crees que esto es un error.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4">
          <Link
            to="/"
            className="btn-primary w-full sm:w-auto min-w-[200px] flex items-center justify-center gap-2 px-8 py-4 shadow-lg shadow-primary/20"
          >
            <Icon name="dashboard" />
            Volver al Dashboard
          </Link>
          <button className="btn-secondary w-full sm:w-auto min-w-[200px] flex items-center justify-center gap-2 px-8 py-4 border-2">
            <Icon name="support_agent" />
            Contactar Soporte
          </button>
        </div>

        <div className="mt-12 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 text-sm">
          <Icon name="info" className="text-sm" />
          <span>Código de Error: 403_FORBIDDEN_TECH_SECTOR_7</span>
        </div>
      </div>
    </ErrorLayout>
  );
}
