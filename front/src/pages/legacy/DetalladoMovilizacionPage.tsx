import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import ExportButton from '@/components/legacy/ExportButton';
import KpiBar, { type KpiItem } from '@/components/legacy/KpiBar';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import type { ExportColumn, SheetSpec } from '@/lib/excelExport';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

interface DetalladoRow {
  folio: number; sub_folio: string | null;
  cantidad_movilizada: number;
  variedad_folio: number | null; variedad_nombre: string | null;
  tipo_vehiculo: string | null; placas: string | null;
  saldo: number; cajas_total: number; granel: number;
  status: string | null;
}

interface Cabecera {
  folio_tmimf: string;
  status: string | null; tipo_tarjeta: string | null; mercado_destino: number | null;
  numeroinscripcion: string;
  nombre_propietario: string | null; nombre_unidad: string | null;
  fecha_emision: string | null; hora_emision: string | null;
  fecha_verifico_normex: string | null;
  pfa_folio: number | null; pfa_nombre: string | null; pfa_cedula: string | null;
  usuario_generador_nombre: string | null;
  modulo_emisor_folio: number | null; modulo_emisor_nombre: string | null;
  semana: number | null;
}

interface Response { encontrado: boolean; cabecera: Cabecera | null; detallado: DetalladoRow[] }

export default function DetalladoMovilizacionPage() {
  const { token, user } = useLegacyAuth();
  const [folio, setFolio] = useState<string>('');
  const [resultado, setResultado] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buscar = async () => {
    if (!token || !folio.trim()) return;
    setLoading(true);
    setError('');
    setResultado(null);
    try {
      const res = await fetch(`${API_BASE}/legacy/reportes/tmimf/detallado-movilizacion?folio_tmimf=${encodeURIComponent(folio.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResultado(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setLoading(false); }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void buscar();
  };

  const c = resultado?.cabecera;
  const det = resultado?.detallado ?? [];

  const totalKg = det.reduce((acc, d) => acc + d.cantidad_movilizada, 0);
  const totalCajas = det.reduce((acc, d) => acc + d.cajas_total, 0);

  const kpis: KpiItem[] = c ? [
    { label: 'Tipo', value: c.tipo_tarjeta ?? '—', icon: 'receipt_long', tone: 'amber' },
    { label: 'Status', value: c.status ?? '—', icon: c.status === 'A' ? 'check_circle' : 'cancel', tone: c.status === 'A' ? 'emerald' : c.status === 'C' ? 'rose' : 'slate' },
    { label: 'Renglones', value: det.length, icon: 'list_alt', tone: 'amber' },
    { label: 'Total kg', value: totalKg.toLocaleString('es-MX', { maximumFractionDigits: 2 }), icon: 'monitor_weight', tone: 'emerald' },
    { label: 'Total cajas', value: totalCajas, icon: 'inventory_2', tone: 'slate' },
  ] : [];

  // Export con 2 hojas: cabecera (1 fila) + detallado.
  const colsCabecera: ExportColumn<Cabecera>[] = [
    { header: 'Folio TMIMF',     key: 'folio_tmimf',                 width: 16 },
    { header: 'Tipo',            key: 'tipo_tarjeta',                width: 8 },
    { header: 'Status',          key: 'status',                      width: 8 },
    { header: 'Inscripción',     key: 'numeroinscripcion',           width: 18 },
    { header: 'Propietario',     key: 'nombre_propietario',          width: 30 },
    { header: 'Huerto',          key: 'nombre_unidad',               width: 26 },
    { header: 'Fecha emisión',   key: 'fecha_emision',               format: 'date' },
    { header: 'Hora emisión',    key: 'hora_emision',                width: 9 },
    { header: 'Verificó normex', key: 'fecha_verifico_normex',       format: 'date' },
    { header: 'PFA',             key: 'pfa_nombre',                  width: 30 },
    { header: 'PFA cédula',      key: 'pfa_cedula',                  width: 18 },
    { header: 'Usuario',         key: 'usuario_generador_nombre',    width: 22 },
    { header: 'Módulo',          key: 'modulo_emisor_nombre',        width: 16 },
    { header: 'Mercado',         accessor: (r: Cabecera) => r.mercado_destino === 1 ? 'Exportación' : r.mercado_destino === 2 ? 'Nacional' : '', width: 12 },
    { header: 'Semana',          key: 'semana',                      format: 'integer' },
  ];
  const colsDetallado: ExportColumn<DetalladoRow>[] = [
    { header: 'Folio',          key: 'folio',                width: 8 },
    { header: 'Sub-folio',      key: 'sub_folio',            width: 10 },
    { header: 'Variedad',       key: 'variedad_nombre',      width: 16 },
    { header: 'Cantidad kg',    key: 'cantidad_movilizada',  format: 'decimal', totals: 'sum' },
    { header: 'Cajas',          key: 'cajas_total',          format: 'integer', totals: 'sum' },
    { header: 'Granel',         key: 'granel',               format: 'decimal', totals: 'sum' },
    { header: 'Vehículo',       key: 'tipo_vehiculo',        width: 14 },
    { header: 'Placas',         key: 'placas',               width: 12 },
    { header: 'Saldo',          key: 'saldo',                format: 'decimal' },
    { header: 'Status',         key: 'status',               width: 8 },
  ];
  const sheets: SheetSpec<Cabecera | DetalladoRow>[] = c ? [
    { sheetName: 'Cabecera',  title: 'Cabecera de la TMIMF', columns: colsCabecera as ExportColumn<Cabecera | DetalladoRow>[],  rows: [c] as (Cabecera | DetalladoRow)[] },
    { sheetName: 'Detallado', title: `Renglones (${det.length})`, columns: colsDetallado as ExportColumn<Cabecera | DetalladoRow>[], rows: det as (Cabecera | DetalladoRow)[] },
  ] : [];

  const stamp = new Date().toISOString().slice(0, 10);
  const fmtKg = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 });

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="search"
        title="Detallado de movilización"
        subtitle="Consulta puntual por folio TMIMF: cabecera + todos los renglones movilizados."
        estado={user?.nombre_estado}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <label htmlFor="folio" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
          Folio TMIMF
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Icon name="receipt" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
            <input
              id="folio"
              type="text"
              value={folio}
              onChange={(e) => setFolio(e.target.value)}
              onKeyDown={onKey}
              placeholder="ej. APT012907-1"
              className="w-full pl-10 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
            />
          </div>
          <button
            type="button"
            onClick={buscar}
            disabled={loading || !folio.trim()}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium inline-flex items-center gap-2"
          >
            <Icon name={loading ? 'progress_activity' : 'search'} className={`text-base ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Las TMIMFs tipo 'I' (Inválidas) están excluidas siempre.
        </p>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icon name="error" /> {error}
        </div>
      )}

      {resultado && !resultado.encontrado && (
        <section className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-500">
          <Icon name="search_off" className="text-4xl mb-2" />
          <p>No se encontró TMIMF con folio <span className="font-mono">{folio}</span> en {user?.nombre_estado}.</p>
        </section>
      )}

      {c && (
        <>
          <KpiBar
            items={kpis}
            trailing={
              <ExportButton
                filename={`tmimf-detallado_${user?.legacy_db ?? 'legacy'}_${c.folio_tmimf.replace(/[^A-Za-z0-9-]/g, '')}_${stamp}`}
                title={`Detallado de movilización TMIMF ${c.folio_tmimf}`}
                subtitle={`${user?.nombre_estado ?? ''} · ${c.fecha_emision ?? '—'} · ${c.modulo_emisor_nombre ?? '—'}`}
                sheets={sheets}
              />
            }
          />

          {/* Cabecera */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
              <Icon name="receipt_long" className="text-amber-700 dark:text-amber-400 text-lg" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Cabecera</h2>
              <span className="ml-auto font-mono text-sm text-slate-700 dark:text-slate-200">{c.folio_tmimf}</span>
            </header>
            <div className="p-5">
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-sm">
                <Item label="Inscripción" value={c.numeroinscripcion} mono />
                <Item label="Huerto" value={c.nombre_unidad ?? '—'} />
                <Item label="Propietario" value={c.nombre_propietario ?? '—'} />
                <Item label="Mercado" value={c.mercado_destino === 1 ? 'Exportación' : c.mercado_destino === 2 ? 'Nacional' : '—'} />
                <Item label="Fecha emisión" value={c.fecha_emision ?? '—'} hint={c.hora_emision ?? undefined} />
                <Item label="Verificó normex" value={c.fecha_verifico_normex ?? '—'} />
                <Item label="Semana" value={c.semana?.toString() ?? '—'} />
                <Item label="Módulo emisor" value={c.modulo_emisor_nombre ?? '—'} />
                <Item label="PFA" value={c.pfa_nombre ?? '—'} hint={c.pfa_cedula ?? undefined} />
                <Item label="Usuario" value={c.usuario_generador_nombre ?? '—'} />
              </dl>
            </div>
          </section>

          {/* Detallado */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
              <Icon name="list_alt" className="text-amber-700 dark:text-amber-400 text-lg" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                Renglones movilizados ({det.length})
              </h2>
            </header>
            <div className="overflow-x-auto">
              {det.length === 0 ? (
                <p className="px-4 py-12 text-center text-slate-500">Sin renglones registrados.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Folio</th>
                      <th className="px-3 py-2 text-left">Variedad</th>
                      <th className="px-3 py-2 text-right">Cantidad kg</th>
                      <th className="px-3 py-2 text-right">Cajas</th>
                      <th className="px-3 py-2 text-right">Granel</th>
                      <th className="px-3 py-2 text-left">Vehículo</th>
                      <th className="px-3 py-2 text-left">Placas</th>
                      <th className="px-3 py-2 text-right">Saldo</th>
                      <th className="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {det.map((d) => (
                      <tr key={d.folio} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-mono text-xs">{d.folio}{d.sub_folio ? `-${d.sub_folio}` : ''}</td>
                        <td className="px-3 py-2 text-xs">{d.variedad_nombre ?? (d.variedad_folio ? `#${d.variedad_folio}` : '—')}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtKg(d.cantidad_movilizada)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{d.cajas_total}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{d.granel}</td>
                        <td className="px-3 py-2 text-xs">{d.tipo_vehiculo ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{d.placas ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtKg(d.saldo)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            d.status === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
                            d.status === 'C' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                                               'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}>{d.status ?? '—'}</span>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800/60 font-bold">
                      <td className="px-3 py-2 text-xs uppercase">Totales</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtKg(totalKg)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{totalCajas}</td>
                      <td colSpan={5}></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Item({ label, value, hint, mono }: { label: string; value: string; hint?: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`text-sm font-medium text-slate-900 dark:text-slate-100 ${mono ? 'font-mono' : ''}`}>{value}</dd>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}
