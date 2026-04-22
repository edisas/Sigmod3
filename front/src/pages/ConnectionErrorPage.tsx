import Icon from '@/components/ui/Icon';
import ErrorLayout from '@/components/errors/ErrorLayout';

export default function ConnectionErrorPage() {
  return (
    <ErrorLayout>
      <div className="max-w-md w-full text-center space-y-8 animate-slide-up">
        {/* Illustration */}
        <div className="relative flex justify-center">
          <div className="w-64 h-64 rounded-full bg-primary/5 dark:bg-primary/20 flex items-center justify-center relative">
            <div className="absolute inset-0 animate-pulse-slow rounded-full border-2 border-primary/10" />
            <div className="bg-white dark:bg-slate-800 p-8 rounded-full shadow-xl border border-soft-gray/20">
              <Icon name="signal_wifi_off" className="text-7xl text-primary dark:text-sky-blue" />
            </div>
            <div className="absolute bottom-4 right-4 bg-red-500 text-white p-2 rounded-full shadow-lg border-4 border-background-light dark:border-background-dark">
              <Icon name="warning" className="text-2xl leading-none" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-primary dark:text-mint">Error de Conexión</h2>
          <p className="text-slate-600 dark:text-slate-400 text-lg leading-relaxed">
            No podemos alcanzar el servidor. Por favor verifica tu conexión a internet o intenta de nuevo.
          </p>
        </div>

        <div className="flex flex-col gap-4 pt-4">
          <button
            onClick={() => window.location.reload()}
            className="btn-primary w-full py-4 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
          >
            <Icon name="refresh" />
            Reintentar
          </button>
          <button className="btn-secondary w-full py-4 border-2">
            Verificar Estado del Sistema
          </button>
        </div>

        <div className="pt-8 border-t border-soft-gray/20">
          <p className="text-sm text-slate-500 dark:text-slate-500">
            ¿Necesitas ayuda?{' '}
            <a href="#" className="text-primary dark:text-sky-blue hover:underline font-medium">
              Contactar soporte técnico
            </a>
          </p>
        </div>
      </div>
    </ErrorLayout>
  );
}
