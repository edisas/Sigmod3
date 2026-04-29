import Icon from '@/components/ui/Icon';
import { useSistemaVersion } from '@/hooks/useSistemaVersion';

const SEVERE_THRESHOLD = 2;

export default function VersionUpdateBanner() {
  const { needsReload, staging, initial } = useSistemaVersion();
  if (!needsReload || !staging || !initial) return null;

  const majorOrMinorChanged = staging.major !== initial.major || staging.minor !== initial.minor;
  const patchDiff = staging.patch - initial.patch;
  const severe = majorOrMinorChanged || patchDiff > SEVERE_THRESHOLD;

  if (severe) {
    return (
      <div role="alert" className="bg-red-600 text-white px-4 py-4 flex items-center gap-4 border-b-4 border-red-800 shadow-lg">
        <Icon name="warning" className="text-4xl shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base md:text-lg">Tu sesión está desactualizada — recarga ANTES de guardar datos.</p>
          <p className="text-sm mt-0.5 opacity-90">
            Diferencia de {patchDiff} {patchDiff === 1 ? 'deploy' : 'deploys'}. Tu sesión: <code className="font-mono">{initial.formatted}</code> · disponible: <code className="font-mono">{staging.formatted}</code>. Guardar con la versión vieja puede causar errores o pérdida de datos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-white text-red-700 px-5 py-2 text-sm font-bold hover:bg-red-50 inline-flex items-center gap-2 shrink-0 shadow"
        >
          <Icon name="refresh" className="text-lg" /> Recargar ahora
        </button>
      </div>
    );
  }

  return (
    <div role="alert" className="bg-amber-100 border-b border-amber-300 text-amber-900 px-4 py-2 flex items-center gap-3 text-sm">
      <Icon name="campaign" className="text-xl shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold">Hay una nueva versión disponible.</span>{' '}
        <span className="opacity-80">
          Tu sesión: <code className="font-mono">{initial.formatted}</code> · disponible: <code className="font-mono">{staging.formatted}</code>. Recarga para aplicarla.
        </span>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-amber-700 text-white px-3 py-1 text-xs font-semibold hover:bg-amber-800 inline-flex items-center gap-1 shrink-0"
      >
        <Icon name="refresh" className="text-base" /> Recargar
      </button>
    </div>
  );
}
