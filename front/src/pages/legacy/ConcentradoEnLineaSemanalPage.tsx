import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import ConcentradoTables, { type ConcentradoData } from '@/components/legacy/ConcentradoTables';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

interface SemanaOption {
  folio: number;
  no_semana: number;
  periodo: number;
  fecha_inicio: string;
  fecha_final: string;
  label: string;
}

export default function ConcentradoEnLineaSemanalPage() {
  const { token, user } = useLegacyAuth();
  const [semanas, setSemanas] = useState<SemanaOption[]>([]);
  const [semanaId, setSemanaId] = useState<number | null>(null);
  const [semanaGenerada, setSemanaGenerada] = useState<SemanaOption | null>(null);
  const [data, setData] = useState<ConcentradoData | null>(null);
  const [loadingSemanas, setLoadingSemanas] = useState(true);
  const [loadingReporte, setLoadingReporte] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    const loadSemanas = async () => {
      setLoadingSemanas(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/legacy/reportes/semanas-disponibles`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = (await res.json()) as SemanaOption[];
        setSemanas(list);
        if (list.length > 0) setSemanaId(list[0].folio);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar semanas');
      } finally {
        setLoadingSemanas(false);
      }
    };
    void loadSemanas();
  }, [token]);

  const handleGenerar = async () => {
    if (!token || semanaId === null) return;
    const seleccionada = semanas.find((s) => s.folio === semanaId);
    if (!seleccionada) return;

    setLoadingReporte(true);
    setError('');
    try {
      const res = await fetch(
        `${API_BASE}/legacy/reportes/concentrado-en-linea-semanal?semana_id=${semanaId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as ConcentradoData);
      setSemanaGenerada(seleccionada);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el reporte');
    } finally {
      setLoadingReporte(false);
    }
  };

  const semanaSeleccionada = semanas.find((s) => s.folio === semanaId);
  const stamp = new Date().toISOString().slice(0, 10);

  const handleSelectChange = (value: string) => {
    setSemanaId(value ? Number(value) : null);
    setData(null);
    setSemanaGenerada(null);
    setError('');
  };

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="date_range"
        title="Movilización en línea semanal"
        subtitle="Concentrado por módulo, mercado y variedad filtrado por semana."
        estado={user?.nombre_estado}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <label htmlFor="semana" className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Seleccionar semana
        </label>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="relative flex-1 max-w-md">
            <Icon
              name="date_range"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none"
            />
            <select
              id="semana"
              value={semanaId ?? ''}
              onChange={(e) => handleSelectChange(e.target.value)}
              disabled={loadingSemanas || semanas.length === 0}
              className="input-field pl-12 appearance-none w-full"
            >
              {loadingSemanas && <option value="">Cargando semanas...</option>}
              {!loadingSemanas && semanas.length === 0 && (
                <option value="">No hay semanas con TMIMFs registrados</option>
              )}
              {semanas.map((s) => (
                <option key={s.folio} value={s.folio}>
                  {s.label}
                </option>
              ))}
            </select>
            <Icon
              name="expand_more"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none"
            />
          </div>
          <button
            type="button"
            onClick={handleGenerar}
            disabled={loadingReporte || loadingSemanas || semanaId === null}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold whitespace-nowrap"
          >
            {loadingReporte ? (
              <>
                <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Icon name="play_arrow" className="text-base" />
                Generar reporte
              </>
            )}
          </button>
        </div>

        {semanaSeleccionada && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Rango: {semanaSeleccionada.fecha_inicio} a {semanaSeleccionada.fecha_final} (folio {semanaSeleccionada.folio})
          </p>
        )}
      </section>

      {error && !loadingReporte && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icon name="error" className="text-red-500 text-lg shrink-0" />
          {error}
        </div>
      )}

      {!data && !loadingReporte && !error && semanas.length > 0 && (
        <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center">
          <Icon name="analytics" className="text-slate-400 text-4xl mb-2 inline-block" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Selecciona una semana y haz click en <strong>Generar reporte</strong> para ver los datos.
          </p>
        </div>
      )}

      {data && !loadingReporte && semanaGenerada && (
        <ConcentradoTables
          data={data}
          filename={`movilizacion-semanal_${user?.legacy_db ?? 'legacy'}_sem${semanaGenerada.no_semana}-${semanaGenerada.periodo}_${stamp}.csv`}
          title={`Movilización semanal — Semana ${semanaGenerada.no_semana}/${semanaGenerada.periodo}`}
          subtitle={`${user?.nombre_estado ?? ''} · ${semanaGenerada.fecha_inicio} a ${semanaGenerada.fecha_final}`}
        />
      )}
    </div>
  );
}
