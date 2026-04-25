import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ExportButton from '@/components/legacy/ExportButton';
import KpiBar, { type KpiItem } from '@/components/legacy/KpiBar';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import type { ExportColumn } from '@/lib/excelExport';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

interface PfaInfo { folio: number; nombre: string | null; cedula: string | null; inicial: string | null }
interface EstimadoRow {
  numeroinscripcion: string;
  nombre_unidad: string | null;
  propietario: string | null;
  folio_ruta: number | null; nombre_ruta: string | null;
  variedad_folio: number | null; variedad_nombre: string | null;
  superficie: number; estimado: number; saldo: number; total_movilizado: number;
  progresivo_estimacion: number | null; fecha_estimacion: string | null;
}
interface EstimadoResponse { pfa: PfaInfo; rows: EstimadoRow[]; totales: { huertos: number; variedades: number; estimado_kg: number; saldo_kg: number; movilizado_kg: number } }

interface BitacoraRow { folio: number; progresivo_estimacion: number | null; estimado: number; saldo: number; superficie: number; fecha_estimacion: string | null }
interface BitacoraResponse { numeroinscripcion: string; variedad_folio: number; variedad_nombre: string | null; rows: BitacoraRow[] }

const fmt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 });

export default function EstimadoCosechaPfaPage() {
  const { token, user } = useLegacyAuth();
  const [pfas, setPfas] = useState<PfaInfo[]>([]);
  const [pfaFolio, setPfaFolio] = useState<number | null>(null);
  const [data, setData] = useState<EstimadoResponse | null>(null);
  const [loadingPfas, setLoadingPfas] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [bitacora, setBitacora] = useState<BitacoraResponse | null>(null);
  const [loadingBit, setLoadingBit] = useState(false);

  const cargarPfas = useCallback(async () => {
    if (!token) return;
    setLoadingPfas(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/reportes/inventario-pfa/pfas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const list = await res.json() as PfaInfo[];
        setPfas(list);
        if (list.length > 0 && pfaFolio === null) setPfaFolio(list[0].folio);
      }
    } finally { setLoadingPfas(false); }
  }, [token, pfaFolio]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarPfas(); }, [cargarPfas]);

  const generar = async () => {
    if (!token || !pfaFolio) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/legacy/reportes/estimado-cosecha?pfa=${pfaFolio}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setLoading(false); }
  };

  const verBitacora = async (numeroinscripcion: string, variedad: number) => {
    if (!token) return;
    setLoadingBit(true);
    try {
      const qs = new URLSearchParams({ numeroinscripcion, variedad: String(variedad) });
      const res = await fetch(`${API_BASE}/legacy/reportes/estimado-cosecha/bitacora?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setBitacora(await res.json());
    } finally { setLoadingBit(false); }
  };

  const kpis: KpiItem[] = useMemo(() => {
    if (!data) return [];
    const t = data.totales;
    const pctMovilizado = t.estimado_kg > 0 ? Math.round((t.movilizado_kg / t.estimado_kg) * 100) : 0;
    return [
      { label: 'Huertos',     value: t.huertos,     icon: 'agriculture', tone: 'amber' },
      { label: 'Variedades',  value: t.variedades,  icon: 'spa', tone: 'amber' },
      { label: 'Estimado kg', value: fmt(t.estimado_kg), icon: 'eco', tone: 'emerald' },
      { label: 'Movilizado',  value: fmt(t.movilizado_kg), hint: `${pctMovilizado}% del estimado`, icon: 'local_shipping', tone: 'slate' },
      { label: 'Saldo kg',    value: fmt(t.saldo_kg), icon: 'inventory', tone: t.saldo_kg > 0 ? 'amber' : 'slate' },
    ];
  }, [data]);

  const cols: ExportColumn<EstimadoRow>[] = [
    { header: 'Inscripción',     key: 'numeroinscripcion',     width: 18 },
    { header: 'Huerto',          key: 'nombre_unidad',         width: 26 },
    { header: 'Propietario',     key: 'propietario',           width: 28 },
    { header: 'Ruta',            key: 'nombre_ruta',           width: 18 },
    { header: 'Variedad',        key: 'variedad_nombre',       width: 14 },
    { header: 'Superficie ha',   key: 'superficie',            format: 'decimal', totals: 'sum' },
    { header: 'Estimado kg',     key: 'estimado',              format: 'decimal', totals: 'sum' },
    { header: 'Saldo kg',        key: 'saldo',                 format: 'decimal', totals: 'sum' },
    { header: 'Movilizado kg',   key: 'total_movilizado',      format: 'decimal', totals: 'sum' },
    { header: '# Estimación',    key: 'progresivo_estimacion', format: 'integer' },
    { header: 'Fecha estim.',    key: 'fecha_estimacion',      format: 'date' },
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  const pfaSel = pfas.find((p) => p.folio === pfaFolio);

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="eco"
        title="Estimado de cosecha por PFA"
        subtitle="Estimación vigente por huerto y variedad, saldo y movilización acumulada."
        estado={user?.nombre_estado}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 max-w-xl">
            <label htmlFor="pfa" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              PFA
            </label>
            <select id="pfa" value={pfaFolio ?? ''} onChange={(e) => { setPfaFolio(e.target.value ? Number(e.target.value) : null); setData(null); }}
              disabled={loadingPfas || pfas.length === 0}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              {loadingPfas && <option>Cargando…</option>}
              {!loadingPfas && pfas.length === 0 && <option>Sin PFAs con rutas</option>}
              {pfas.map((p) => <option key={p.folio} value={p.folio}>{p.inicial ? `${p.inicial} · ` : ''}{p.nombre}</option>)}
            </select>
          </div>
          <button type="button" onClick={generar} disabled={loading || !pfaFolio}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium inline-flex items-center gap-2">
            <Icon name={loading ? 'progress_activity' : 'play_arrow'} className={`text-base ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Generando…' : 'Generar reporte'}
          </button>
        </div>
        {pfaSel && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {pfaSel.cedula && <>Cédula: <span className="font-mono">{pfaSel.cedula}</span> · </>}folio {pfaSel.folio}
          </p>
        )}
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icon name="error" /> {error}
        </div>
      )}

      {data && (
        <>
          <KpiBar
            items={kpis}
            trailing={
              <ExportButton<EstimadoRow>
                filename={`estimado-cosecha_${user?.legacy_db ?? 'legacy'}_pfa${data.pfa.folio}_${stamp}`}
                title={`Estimado de cosecha — ${user?.nombre_estado ?? ''}`}
                subtitle={`PFA: ${data.pfa.nombre ?? `Folio ${data.pfa.folio}`}${data.pfa.cedula ? ` (${data.pfa.cedula})` : ''} · ${data.totales.huertos} huertos · Generado ${new Date().toLocaleString('es-MX')}`}
                columns={cols}
                rows={data.rows}
              />
            }
          />

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
              <Icon name="grid_on" className="text-amber-700 dark:text-amber-400 text-lg" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                {data.rows.length} estimaciones
              </h2>
              <span className="ml-auto text-xs text-slate-500">Click "Bitácora" para historial</span>
            </header>
            <div className="overflow-x-auto max-h-[65vh]">
              {data.rows.length === 0 ? (
                <p className="px-4 py-12 text-center text-slate-500">Este PFA no tiene huertos con estimaciones.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left">Inscripción · Huerto</th>
                      <th className="px-3 py-2 text-left">Ruta</th>
                      <th className="px-3 py-2 text-left">Variedad</th>
                      <th className="px-3 py-2 text-right">Sup. ha</th>
                      <th className="px-3 py-2 text-right">Estimado kg</th>
                      <th className="px-3 py-2 text-right">Saldo kg</th>
                      <th className="px-3 py-2 text-right">Movilizado kg</th>
                      <th className="px-3 py-2 text-center">Estim.</th>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => {
                      const pctMov = r.estimado > 0 ? (r.total_movilizado / r.estimado * 100) : 0;
                      const cerca = pctMov >= 90;
                      return (
                        <tr key={`${r.numeroinscripcion}-${r.variedad_folio}-${i}`} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-3 py-2"><div className="font-mono text-xs">{r.numeroinscripcion}</div><div className="text-xs text-slate-500">{r.nombre_unidad ?? '—'}</div></td>
                          <td className="px-3 py-2 text-xs">{r.nombre_ruta ?? '—'}</td>
                          <td className="px-3 py-2 text-xs">{r.variedad_nombre ?? '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.superficie.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(r.estimado)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(r.saldo)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${cerca ? 'font-semibold text-rose-700 dark:text-rose-400' : ''}`}>
                            {fmt(r.total_movilizado)}
                            {r.estimado > 0 && <div className="text-[10px] text-slate-500">{pctMov.toFixed(1)}%</div>}
                          </td>
                          <td className="px-3 py-2 text-center text-xs">{r.progresivo_estimacion ?? '—'}</td>
                          <td className="px-3 py-2 text-xs">{r.fecha_estimacion ?? '—'}</td>
                          <td className="px-3 py-2 text-right">
                            {r.variedad_folio !== null && (
                              <button type="button" onClick={() => verBitacora(r.numeroinscripcion, r.variedad_folio!)}
                                disabled={loadingBit}
                                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs inline-flex items-center gap-1">
                                <Icon name="history" className="text-sm" /> Bitácora
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}

      {bitacora && (
        <BitacoraModal data={bitacora} onClose={() => setBitacora(null)} />
      )}
    </div>
  );
}

function BitacoraModal({ data, onClose }: { data: BitacoraResponse; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" role="dialog">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <Icon name="history" className="text-amber-700 dark:text-amber-400 text-xl" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Bitácora de estimaciones</h2>
            <p className="text-xs text-slate-500 font-mono">{data.numeroinscripcion} · {data.variedad_nombre ?? `Variedad ${data.variedad_folio}`}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
            <Icon name="close" className="text-lg" />
          </button>
        </header>
        <div className="flex-1 overflow-auto">
          {data.rows.length === 0 ? (
            <p className="px-4 py-12 text-center text-slate-500">Sin estimaciones históricas.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-center">#</th>
                  <th className="px-3 py-2 text-right">Superficie ha</th>
                  <th className="px-3 py-2 text-right">Estimado kg</th>
                  <th className="px-3 py-2 text-right">Saldo kg</th>
                  <th className="px-3 py-2 text-left">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.folio} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 text-center font-semibold">{r.progresivo_estimacion ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.superficie.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.estimado)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.saldo)}</td>
                    <td className="px-3 py-2 text-xs">{r.fecha_estimacion ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
