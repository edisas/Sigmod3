import { Link } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import ErrorLayout from '@/components/errors/ErrorLayout';

export default function ServerErrorPage() {
  return (
    <ErrorLayout>
      <div className="max-w-[640px] w-full flex flex-col items-center text-center space-y-8 animate-slide-up">
        {/* Illustration */}
        <div className="relative group">
          <div className="absolute -inset-4 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />
          <div className="relative bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-primary/30">
            <Icon name="engineering" className="text-[120px] text-primary/40 dark:text-primary/60" />
            <div className="absolute bottom-6 right-6 bg-red-500 text-white p-2 rounded-lg shadow-lg">
              <Icon name="warning" className="text-2xl" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Fallo Técnico en Cosecha
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Algo salió mal en nuestro servidor y nuestros técnicos ya están investigando el problema. Por favor intenta de nuevo más tarde.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center pt-4">
          <Link
            to="/"
            className="btn-primary flex min-w-[200px] items-center justify-center h-12 px-6 text-base shadow-lg shadow-primary/20"
          >
            <Icon name="dashboard" className="mr-2" />
            Volver al Dashboard
          </Link>
          <button className="btn-secondary flex min-w-[200px] items-center justify-center h-12 px-6 text-base border-2 border-primary/20">
            <Icon name="analytics" className="mr-2" />
            Estado del Sistema
          </button>
        </div>

        <div className="pt-8 border-t border-slate-200 dark:border-primary/20 w-full">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-neutral-gray/30 dark:bg-primary/10 text-slate-500 dark:text-primary/80 font-mono text-sm">
            <Icon name="code" className="text-base mr-2" />
            Error Code: 500_HARVEST_DATA_FAILURE
          </div>
        </div>
      </div>
    </ErrorLayout>
  );
}
