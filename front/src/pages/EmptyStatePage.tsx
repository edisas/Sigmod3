import Icon from '@/components/ui/Icon';

export default function EmptyStatePage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 flex items-center justify-center min-h-[60vh] animate-fade-in">
      <div className="max-w-md w-full flex flex-col items-center text-center">
        {/* Visual */}
        <div className="relative mb-8">
          <div className="w-48 h-48 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 dark:opacity-20">
              <div className="h-full w-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/40 via-transparent to-transparent" />
            </div>
            <Icon name="agriculture" className="text-7xl text-slate-300 dark:text-slate-600" />
            <div className="absolute bottom-10 right-10 bg-background-light dark:bg-background-dark p-1 rounded-full border-2 border-slate-200 dark:border-slate-800">
              <Icon name="block" className="text-primary text-xl" />
            </div>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-3 tracking-tight">Sin Registros</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
          Comienza agregando tu primer campo o cultivo para empezar a rastrear tu producción y métricas de sostenibilidad.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <button className="btn-primary flex items-center justify-center gap-2 px-6 py-3 shadow-lg shadow-primary/20">
            <Icon name="add_circle" />
            Agregar Nuevo Campo
          </button>
          <button className="btn-secondary flex items-center justify-center gap-2 px-6 py-3">
            <Icon name="upload_file" />
            Importar Datos
          </button>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800 w-full flex flex-col items-center">
          <p className="text-sm text-slate-500 mb-4">¿Necesitas ayuda para empezar?</p>
          <div className="flex gap-6">
            <a href="#" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
              <Icon name="menu_book" className="text-sm" /> Ver Guía
            </a>
            <a href="#" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
              <Icon name="support_agent" className="text-sm" /> Contactar Soporte
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
