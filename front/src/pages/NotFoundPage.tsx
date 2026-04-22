import { Link } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import ErrorLayout from '@/components/errors/ErrorLayout';

export default function NotFoundPage() {
  return (
    <ErrorLayout>
      <div className="max-w-3xl w-full text-center space-y-8 animate-slide-up">
        {/* Illustration */}
        <div className="relative inline-block">
          <div className="absolute -inset-4 bg-secondary/10 dark:bg-secondary/5 rounded-full blur-3xl" />
          <div className="relative flex flex-col items-center">
            <div className="relative mb-8">
              <span className="text-[10rem] sm:text-[12rem] font-black leading-none text-primary/5 dark:text-primary/20 select-none">
                404
              </span>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-36 h-36 sm:w-48 sm:h-48 flex items-center justify-center">
                  <div className="absolute inset-0 border-2 border-secondary/30 rounded-full" />
                  <div className="absolute inset-4 border border-secondary/20 rounded-full" />
                  <Icon name="satellite_alt" className="text-7xl sm:text-8xl text-primary dark:text-accent" />
                  <div className="absolute bottom-4 right-4 bg-red-500 text-white p-2 rounded-lg shadow-lg flex items-center gap-1">
                    <Icon name="signal_disconnected" className="text-sm" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Sin Señal</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Message */}
        <div className="space-y-4 max-w-lg mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
            Coordenadas No Encontradas
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-base sm:text-lg">
            El área que intentas analizar no ha sido mapeada en nuestro sector actual. Nuestros drones han regresado a la base.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link to="/" className="btn-primary w-full sm:w-auto px-8 py-3.5 flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
            <Icon name="dashboard" />
            Volver al Dashboard
          </Link>
          <Link to="/" className="btn-secondary w-full sm:w-auto px-8 py-3.5 flex items-center justify-center gap-2">
            <Icon name="map" />
            Ver Mapa
          </Link>
        </div>

        {/* Quick Help */}
        <div className="pt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-left border-t border-neutral-gray/20 dark:border-primary/10 mt-16">
          {[
            { icon: 'support_agent', title: 'Contactar Soporte', desc: 'Ayuda con calibración GPS' },
            { icon: 'book', title: 'Documentación', desc: 'Lee las guías de mapeo' },
            { icon: 'refresh', title: 'Estado del Sistema', desc: 'Revisa conectividad satelital' },
          ].map((item) => (
            <div key={item.title} className="p-4 rounded-xl hover:bg-secondary/5 transition-colors cursor-pointer">
              <div className="text-secondary mb-2">
                <Icon name={item.icon} />
              </div>
              <h3 className="font-bold text-sm mb-1">{item.title}</h3>
              <p className="text-xs text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </ErrorLayout>
  );
}
