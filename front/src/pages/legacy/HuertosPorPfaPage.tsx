import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth } from '@/context/LegacyAuthContext';

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

  const handleExportCsv = () => {
    if (!data || !pfaGenerado) return;
    const sep = ',';
    const esc = (v: string | number): string => {
      const s = String(v ?? '');
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const fmt = (n: number | undefined): string =>
      n === undefined || n === null || Number.isNaN(n) ? '' : n.toFixed(4);

    const lines: string[] = [];
    lines.push(`Resumen de huertos por PFA — ${user?.nombre_estado ?? ''}`);
    lines.push(`PFA: ${pfaGenerado.nombre}${pfaGenerado.cedula ? ` (${pfaGenerado.cedula})` : ''}`);
    lines.push(`Generado: ${new Date().toLocaleString('es-MX')}`);
    lines.push('');

    const header = [
      'Cons', 'Inscripción', 'Huerto', 'Ubicación', 'Propietario', 'Dirección',
      'Teléfono', 'Especie', 'Destino', 'Folio ruta', 'Nombre ruta',
      ...data.variedades.map((v) => v.nombre),
      'Total superficie',
    ];
    lines.push(header.map(esc).join(sep));

    data.huertos.forEach((h, i) => {
      const cells: (string | number)[] = [
        i + 1,
        h.numero_inscripcion,
        h.nombre_unidad ?? '',
        h.ubicacion ?? '',
        h.nombre_propietario ?? '',
        h.direccion ?? '',
        h.telefono ?? '',
        h.especie ?? '',
        h.destino ?? '',
        h.folio_ruta ?? '',
        h.nombre_ruta ?? '',
        ...data.variedades.map((v) => fmt(h.superficies[String(v.folio)])),
        fmt(h.total_superficie),
      ];
      lines.push(cells.map((c) => esc(c)).join(sep));
    });

    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `huertos-por-pfa_${user?.legacy_db ?? 'legacy'}_pfa${pfaGenerado.folio}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const pfaSel = pfas.find((p) => p.folio === pfaFolio);

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          Resumen de huertos por PFA
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Huertos asignados a un Profesional Fitosanitario Autorizado, con superficie registrada por variedad —{' '}
          <span className="font-semibold text-amber-700 dark:text-amber-400">{user?.nombre_estado}</span>
        </p>
      </div>

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
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {data.total_huertos}
              </span>{' '}
              huerto{data.total_huertos !== 1 ? 's' : ''} ·{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatNumber(data.total_superficie_global)}
              </span>{' '}
              ha totales
            </div>
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              <Icon name="file_download" className="text-base" />
              Exportar a Excel
            </button>
          </div>

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
