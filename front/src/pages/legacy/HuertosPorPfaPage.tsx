import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ExportButton from '@/components/legacy/ExportButton';
import KpiBar, { type KpiItem } from '@/components/legacy/KpiBar';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import type { ExportColumn } from '@/lib/excelExport';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

interface CatalogoItem { folio: number; nombre: string }

interface PfaOption {
  folio: number;
  nombre: string;
  cedula: string | null;
  label: string;
}

interface HuertoPorPfaItem {
  numero_inscripcion: string;
  nombre_unidad: string | null;
  ubicacion: string | null;
  nombre_propietario: string | null;
  direccion: string | null;
  telefono: string | null;
  especie: string | null;
  destino: string | null;
  folio_ruta: number | null;
  nombre_ruta: string | null;
  clave_pfa: number;
  nombre_pfa: string;
  superficies: Record<string, number>;
  total_superficie: number;
}

interface HuertosPorPfaResponse {
  pfa: PfaOption;
  variedades: CatalogoItem[];
  huertos: HuertoPorPfaItem[];
  total_huertos: number;
  total_superficie_global: number;
}

const formatNumber = (n: number | undefined): string => {
  if (n === undefined || n === null || Number.isNaN(n) || n === 0) return '—';
  return n.toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
};

export default function HuertosPorPfaPage() {
  const { token, user } = useLegacyAuth();
  const [pfas, setPfas] = useState<PfaOption[]>([]);
  const [pfaFolio, setPfaFolio] = useState<number | null>(null);
  const [pfaGenerado, setPfaGenerado] = useState<PfaOption | null>(null);
  const [data, setData] = useState<HuertosPorPfaResponse | null>(null);
  const [loadingPfas, setLoadingPfas] = useState(true);
  const [loadingReporte, setLoadingReporte] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      setLoadingPfas(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/legacy/reportes/huertos-por-pfa/pfas`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = (await res.json()) as PfaOption[];
        setPfas(list);
        if (list.length > 0) setPfaFolio(list[0].folio);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar PFAs');
      } finally {
        setLoadingPfas(false);
      }
    };
    void load();
  }, [token]);

  const handleSelectChange = (value: string) => {
    setPfaFolio(value ? Number(value) : null);
    setData(null);
    setPfaGenerado(null);
    setError('');
  };

  const handleGenerar = async () => {
    if (!token || pfaFolio === null) return;
    const seleccionado = pfas.find((p) => p.folio === pfaFolio);
    if (!seleccionado) return;
    setLoadingReporte(true);
    setError('');
    try {
      const res = await fetch(
        `${API_BASE}/legacy/reportes/huertos-por-pfa?pfa_folio=${pfaFolio}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { detail?: string }));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as HuertosPorPfaResponse);
      setPfaGenerado(seleccionado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el reporte');
    } finally {
      setLoadingReporte(false);
    }
  };

  // Columnas declarativas para el ExportButton — variedades dinámicas con totales.
  const exportColumns: ExportColumn<HuertoPorPfaItem>[] = useMemo(() => {
    if (!data) return [];
    const variedadCols: ExportColumn<HuertoPorPfaItem>[] = data.variedades.map((v) => ({
      header: v.nombre,
      accessor: (h) => h.superficies[String(v.folio)] ?? 0,
      format: 'decimal',
      totals: 'sum',
      width: Math.max(v.nombre.length + 2, 10),
    }));
    return [
      { header: '#',           accessor: (_h, ) => '', width: 5 },
      { header: 'Inscripción', key: 'numero_inscripcion', width: 18 },
      { header: 'Huerto',      key: 'nombre_unidad', width: 28 },
      { header: 'Propietario', key: 'nombre_propietario', width: 28 },
      { header: 'Ubicación',   key: 'ubicacion', width: 22 },
      { header: 'Especie',     key: 'especie', width: 12 },
      { header: 'Destino',     key: 'destino', width: 14 },
      { header: 'Ruta',        accessor: (h) => h.nombre_ruta ?? (h.folio_ruta ? `#${h.folio_ruta}` : ''), width: 16 },
      ...variedadCols,
      { header: 'Total superficie', key: 'total_superficie', format: 'decimal', totals: 'sum', width: 14 },
    ];
  }, [data]);

  const kpis: KpiItem[] = useMemo(() => {
    if (!data) return [];
    const variedadesActivas = data.variedades.filter((v) =>
      data.huertos.some((h) => (h.superficies[String(v.folio)] ?? 0) > 0)
    ).length;
    const conRuta = data.huertos.filter((h) => h.folio_ruta).length;
    return [
      { label: 'Huertos',     value: data.total_huertos, icon: 'agriculture', tone: 'amber' },
      { label: 'Superficie',  value: `${data.total_superficie_global.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`, icon: 'forest', tone: 'emerald' },
      { label: 'Variedades',  value: variedadesActivas, hint: `de ${data.variedades.length} catálogo`, icon: 'spa', tone: 'amber' },
      { label: 'Con ruta',    value: conRuta, hint: data.total_huertos ? `${Math.round(conRuta/data.total_huertos*100)}%` : undefined, icon: 'alt_route', tone: 'slate' },
    ];
  }, [data]);

  const pfaSel = pfas.find((p) => p.folio === pfaFolio);

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="badge"
        title="Resumen de huertos por PFA"
        subtitle="Huertos asignados a un Profesional Fitosanitario Autorizado, con superficie registrada por variedad."
        estado={user?.nombre_estado}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <label htmlFor="pfa" className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Seleccione al PFA
        </label>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="relative flex-1 max-w-xl">
            <Icon name="badge" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
            <select
              id="pfa"
              value={pfaFolio ?? ''}
              onChange={(e) => handleSelectChange(e.target.value)}
              disabled={loadingPfas || pfas.length === 0}
              className="input-field pl-12 appearance-none w-full"
            >
              {loadingPfas && <option value="">Cargando PFAs...</option>}
              {!loadingPfas && pfas.length === 0 && (
                <option value="">No hay PFAs con TMIMF emitida</option>
              )}
              {pfas.map((p) => (
                <option key={p.folio} value={p.folio}>
                  {p.label}
                </option>
              ))}
            </select>
            <Icon name="expand_more" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={handleGenerar}
            disabled={loadingReporte || loadingPfas || pfaFolio === null}
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
        {pfaSel && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {pfaSel.cedula && <>Cédula: <span className="font-mono">{pfaSel.cedula}</span> · </>}
            folio PFA: {pfaSel.folio}
          </p>
        )}
      </section>

      {error && !loadingReporte && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icon name="error" className="text-red-500 text-lg shrink-0" />
          {error}
        </div>
      )}

      {loadingReporte && (
        <div className="flex items-center gap-3 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="size-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-sm text-slate-600 dark:text-slate-400">Calculando huertos del PFA...</span>
        </div>
      )}

      {!data && !loadingReporte && !error && pfas.length > 0 && (
        <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center">
          <Icon name="badge" className="text-slate-400 text-4xl mb-2 inline-block" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Selecciona un PFA y haz click en <strong>Generar reporte</strong>.
          </p>
        </div>
      )}

      {data && !loadingReporte && (
        <>
          <KpiBar
            items={kpis}
            trailing={
              pfaGenerado && (
                <ExportButton<HuertoPorPfaItem>
                  filename={`huertos-por-pfa_${user?.legacy_db ?? 'legacy'}_pfa${pfaGenerado.folio}_${new Date().toISOString().slice(0,10)}`}
                  columns={exportColumns}
                  rows={data.huertos}
                  title={`Resumen de huertos por PFA — ${user?.nombre_estado ?? ''}`}
                  subtitle={`PFA: ${pfaGenerado.nombre}${pfaGenerado.cedula ? ` (${pfaGenerado.cedula})` : ''} · Generado ${new Date().toLocaleString('es-MX')}`}
                />
              )
            }
          />

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200">
                    <th className="px-3 py-2 text-center font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Inscripción</th>
                    <th className="px-3 py-2 text-left font-semibold">Huerto</th>
                    <th className="px-3 py-2 text-left font-semibold">Propietario</th>
                    <th className="px-3 py-2 text-left font-semibold">Ubicación</th>
                    <th className="px-3 py-2 text-left font-semibold">Destino</th>
                    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Ruta</th>
                    {data.variedades.map((v) => (
                      <th key={v.folio} className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                        {v.nombre}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-bold border-l border-amber-200 dark:border-amber-800 whitespace-nowrap">
                      Total ha
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.huertos.length === 0 && (
                    <tr>
                      <td colSpan={7 + data.variedades.length + 1} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                        El PFA no tiene huertos activos asignados.
                      </td>
                    </tr>
                  )}
                  {data.huertos.map((h, i) => (
                    <tr
                      key={`${h.numero_inscripcion}-${i}`}
                      className={`border-t border-slate-100 dark:border-slate-800 ${
                        i % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-center text-slate-500 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {h.numero_inscripcion}
                      </td>
                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{h.nombre_unidad ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{h.nombre_propietario ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300 text-xs">{h.ubicacion ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">{h.destino ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">
                        {h.nombre_ruta ?? (h.folio_ruta ? `#${h.folio_ruta}` : '—')}
                      </td>
                      {data.variedades.map((v) => (
                        <td key={v.folio} className="px-3 py-2 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                          {formatNumber(h.superficies[String(v.folio)])}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100 tabular-nums border-l border-slate-200 dark:border-slate-700">
                        {formatNumber(h.total_superficie)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
