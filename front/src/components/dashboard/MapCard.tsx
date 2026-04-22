import Icon from '@/components/ui/Icon';

export default function MapCard() {
  return (
    <div className="card overflow-hidden">
      <div className="p-6 border-b border-neutral-gray/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Icon name="distance" className="text-primary" />
          Mapa de Vigor Vegetativo
        </h3>
        <select
          className="text-xs bg-slate-50 dark:bg-white/5 border border-neutral-gray/30 rounded-lg py-1 pr-8 pl-2"
          defaultValue="ndvi"
        >
          <option value="ndvi">Capa: NDVI</option>
          <option value="humidity">Capa: Humedad</option>
          <option value="thermal">Capa: Térmica</option>
        </select>
      </div>

      <div className="relative aspect-video bg-neutral-gray/10">
        {/* Placeholder map visualization */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/30 via-green-500/20 to-yellow-400/10" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <Icon name="satellite_alt" className="text-6xl text-primary/30 dark:text-accent/30" />
            <p className="text-sm text-slate-500 mt-2">Vista Satelital - NDVI</p>
          </div>
        </div>

        {/* Map overlay */}
        <div className="absolute inset-0 bg-primary/5 pointer-events-none" />

        {/* Legend */}
        <div className="absolute top-4 left-4 bg-white/90 dark:bg-background-dark/90 p-3 rounded-xl backdrop-blur text-xs font-bold border border-white/20">
          <div className="flex items-center gap-2 mb-1">
            <span className="size-3 rounded-full bg-emerald-500" /> Alto Vigor (0.8 - 1.0)
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="size-3 rounded-full bg-yellow-400" /> Estrés Medio (0.5 - 0.7)
          </div>
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-red-500" /> Estrés Hídrico (&lt; 0.4)
          </div>
        </div>
      </div>
    </div>
  );
}
