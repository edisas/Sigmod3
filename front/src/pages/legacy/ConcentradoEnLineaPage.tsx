import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import ConcentradoTables, { type ConcentradoData } from '@/components/legacy/ConcentradoTables';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

export default function ConcentradoEnLineaPage() {
  const { token, user } = useLegacyAuth();
  const [data, setData] = useState<ConcentradoData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/legacy/reportes/concentrado-en-linea`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData((await res.json()) as ConcentradoData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar el reporte');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [token]);

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
            Movilización en línea
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Concentrado de toneladas movilizadas por módulo y mercado —{' '}
            <span className="font-semibold text-amber-700 dark:text-amber-400">
              {user?.nombre_estado}
            </span>
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
        >
          <Icon name="refresh" className="text-base" />
          Actualizar
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-3 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="size-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-sm text-slate-600 dark:text-slate-400">Calculando concentrado...</span>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icon name="error" className="text-red-500 text-lg shrink-0" />
          {error}
        </div>
      )}

      {data && !loading && (
        <ConcentradoTables
          data={data}
          filename={`concentrado-en-linea_${user?.legacy_db ?? 'legacy'}_${stamp}.csv`}
          title="Movilización en línea"
          subtitle={user?.nombre_estado ?? ''}
        />
      )}
    </div>
  );
}
