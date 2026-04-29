import Icon from '@/components/ui/Icon';
import { useSistemaVersion } from '@/hooks/useSistemaVersion';

export default function VersionUpdateBanner() {
  const { needsReload, staging, initial } = useSistemaVersion();
  if (!needsReload || !staging || !initial) return null;

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
