import { useMemo } from 'react';
import ExportButton from '@/components/legacy/ExportButton';
import KpiBar, { type KpiItem } from '@/components/legacy/KpiBar';
import type { ExportColumn } from '@/lib/excelExport';

export interface CatalogoItem { folio: number; nombre: string }
export interface MercadoConcentrado { por_modulo: Record<string, number>; total: number }
export interface DetalladoFila {
  folio_modulo: number;
  nombre_modulo: string;
  mercado: string;
  por_variedad: Record<string, number>;
  total: number;
}
export interface ConcentradoData {
  modulos: CatalogoItem[];
  variedades: CatalogoItem[];
  concentrado: {
    exportacion: MercadoConcentrado;
    nacional: MercadoConcentrado;
    totales: MercadoConcentrado;
  };
  detallado: DetalladoFila[];
  totales_por_variedad: Record<string, number>;
  total_global: number;
}

interface Props {
  data: ConcentradoData;
  filename: string;
  title: string;
  subtitle: string;
}

const formatNumber = (n: number | undefined): string => {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  if (n === 0) return '0';
  return n.toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

interface ConcentradoMercadoRow {
  label: string;
  m: MercadoConcentrado;
}

export default function ConcentradoTables({ data, filename, title, subtitle }: Props) {
  const concentradoRows = useMemo<ConcentradoMercadoRow[]>(() => [
    { label: 'Exportación', m: data.concentrado.exportacion },
    { label: 'Nacional',    m: data.concentrado.nacional },
    { label: 'Totales',     m: data.concentrado.totales },
  ], [data]);

  const kpis: KpiItem[] = useMemo(() => {
    const totalExp = data.concentrado.exportacion.total;
    const totalNac = data.concentrado.nacional.total;
    const totalAll = data.concentrado.totales.total;
    const pctExp = totalAll > 0 ? Math.round((totalExp / totalAll) * 100) : 0;
    return [
      { label: 'Total movilizado', value: `${formatNumber(totalAll)} t`, icon: 'local_shipping', tone: 'amber' },
      { label: 'Exportación', value: `${formatNumber(totalExp)} t`, hint: `${pctExp}%`, icon: 'flight_takeoff', tone: 'emerald' },
      { label: 'Nacional',    value: `${formatNumber(totalNac)} t`, hint: `${100 - pctExp}%`, icon: 'pin_drop', tone: 'slate' },
      { label: 'Módulos',     value: data.modulos.length,    icon: 'apartment', tone: 'amber' },
      { label: 'Variedades',  value: data.variedades.length, icon: 'spa', tone: 'amber' },
    ];
  }, [data]);

  // Sheet 1: Concentrado por módulo (mercado × módulo)
  const sheetConcentrado = useMemo(() => {
    const cols: ExportColumn<ConcentradoMercadoRow>[] = [
      { header: 'Mercado', key: 'label', width: 14 },
      ...data.modulos.map<ExportColumn<ConcentradoMercadoRow>>((m) => ({
        header: m.nombre,
        accessor: (r) => r.m.por_modulo[String(m.folio)] ?? 0,
        format: 'decimal',
        width: Math.max(m.nombre.length + 2, 10),
      })),
      { header: 'Total', accessor: (r) => r.m.total, format: 'decimal', width: 12 },
    ];
    return {
      sheetName: 'Por módulo',
      title: 'Concentrado por módulo (toneladas)',
      columns: cols,
      // Excluimos la fila "Totales" del XLSX (la fila totals se autogenera con totals='sum')
      // pero acá ya viene precomputada del backend; mostramos las 3 filas tal cual.
      rows: concentradoRows,
    };
  }, [data, concentradoRows]);

  // Sheet 2: Detallado por variedad
  const sheetDetallado = useMemo(() => {
    const cols: ExportColumn<DetalladoFila>[] = [
      { header: 'Módulo / Mercado', accessor: (r) => `${r.nombre_modulo} ${r.mercado}`, width: 28 },
      ...data.variedades.map<ExportColumn<DetalladoFila>>((v) => ({
        header: v.nombre,
        accessor: (r) => r.por_variedad[String(v.folio)] ?? 0,
        format: 'decimal',
        totals: 'sum',
        width: Math.max(v.nombre.length + 2, 10),
      })),
      { header: 'Total', key: 'total', format: 'decimal', totals: 'sum', width: 12 },
    ];
    return {
      sheetName: 'Por variedad',
      title: 'Detallado por variedad (toneladas)',
      columns: cols,
      rows: data.detallado,
    };
  }, [data]);

  // Strip extension del filename para multi-sheet
  const filenameStem = filename.replace(/\.csv$/i, '');

  return (
    <div className="space-y-6">
      <KpiBar
        items={kpis}
        trailing={
          <ExportButton
            filename={filenameStem}
            title={title}
            subtitle={`${subtitle} · Generado ${new Date().toLocaleString('es-MX')}`}
            sheets={[sheetConcentrado, sheetDetallado]}
          />
        }
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
            Concentrado por módulo
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Toneladas (cantidad movilizada ÷ 1000)</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200">
                <th className="px-4 py-2 text-left font-semibold">&nbsp;</th>
                {data.modulos.map((m) => (
                  <th key={m.folio} className="px-4 py-2 text-right font-semibold whitespace-nowrap">
                    {m.nombre}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-bold border-l border-amber-200 dark:border-amber-800">
                  Totales
                </th>
              </tr>
            </thead>
            <tbody>
              {concentradoRows.map((row, i) => (
                <tr
                  key={row.label}
                  className={`border-t border-slate-100 dark:border-slate-800 ${
                    row.label === 'Totales' ? 'bg-slate-50 dark:bg-slate-800/40 font-semibold' : ''
                  } ${i % 2 === 1 && row.label !== 'Totales' ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}
                >
                  <td className="px-4 py-2 text-slate-900 dark:text-slate-100 font-medium">{row.label}</td>
                  {data.modulos.map((m) => (
                    <td key={m.folio} className="px-4 py-2 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                      {formatNumber(row.m.por_modulo[String(m.folio)])}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right text-slate-900 dark:text-slate-100 font-bold tabular-nums border-l border-slate-200 dark:border-slate-700">
                    {formatNumber(row.m.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
            Detallado por variedad
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Toneladas por módulo × mercado × variedad
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200">
                <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Módulo / Mercado</th>
                {data.variedades.map((v) => (
                  <th key={v.folio} className="px-4 py-2 text-right font-semibold whitespace-nowrap">
                    {v.nombre}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-bold border-l border-amber-200 dark:border-amber-800">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {data.detallado.map((fila, idx) => (
                <tr
                  key={`${fila.folio_modulo}-${fila.mercado}`}
                  className={`border-t border-slate-100 dark:border-slate-800 ${
                    idx % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''
                  }`}
                >
                  <td className="px-4 py-2 text-slate-900 dark:text-slate-100 font-medium whitespace-nowrap">
                    {fila.nombre_modulo} {fila.mercado}
                  </td>
                  {data.variedades.map((v) => (
                    <td key={v.folio} className="px-4 py-2 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                      {formatNumber(fila.por_variedad[String(v.folio)])}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right text-slate-900 dark:text-slate-100 font-semibold tabular-nums border-l border-slate-200 dark:border-slate-700">
                    {formatNumber(fila.total)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800/60 font-bold">
                <td className="px-4 py-2 text-slate-900 dark:text-slate-100">Totales</td>
                {data.variedades.map((v) => (
                  <td key={v.folio} className="px-4 py-2 text-right text-slate-900 dark:text-slate-100 tabular-nums">
                    {formatNumber(data.totales_por_variedad[String(v.folio)])}
                  </td>
                ))}
                <td className="px-4 py-2 text-right text-slate-900 dark:text-slate-100 tabular-nums border-l border-slate-300 dark:border-slate-600">
                  {formatNumber(data.total_global)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
