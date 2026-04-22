import { useMemo } from 'react';
import Icon from '@/components/ui/Icon';

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

export default function ConcentradoTables({ data, filename, title, subtitle }: Props) {
  const concentradoRows = useMemo(
    () =>
      [
        { key: 'exportacion', label: 'Exportación', m: data.concentrado.exportacion },
        { key: 'nacional',    label: 'Nacional',    m: data.concentrado.nacional },
        { key: 'totales',     label: 'Totales',     m: data.concentrado.totales },
      ] as const,
    [data],
  );

  const handleExportCsv = () => {
    const sep = ',';
    const esc = (v: string | number): string => {
      const s = String(v ?? '');
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const fmt = (n: number | undefined): string =>
      n === undefined || n === null || Number.isNaN(n) ? '' : n.toFixed(3);

    const lines: string[] = [];
    lines.push(`${title} — ${subtitle}`);
    lines.push(`Generado: ${new Date().toLocaleString('es-MX')}`);
    lines.push('');

    lines.push('Concentrado por módulo (toneladas)');
    lines.push([''].concat(data.modulos.map((m) => m.nombre)).concat(['Totales']).map(esc).join(sep));
    for (const row of concentradoRows) {
      const cells: string[] = [row.label];
      for (const m of data.modulos) cells.push(fmt(row.m.por_modulo[String(m.folio)]));
      cells.push(fmt(row.m.total));
      lines.push(cells.map(esc).join(sep));
    }
    lines.push('');

    lines.push('Detallado por variedad (toneladas)');
    lines.push(
      ['Módulo / Mercado']
        .concat(data.variedades.map((v) => v.nombre))
        .concat(['Total'])
        .map(esc)
        .join(sep),
    );
    for (const fila of data.detallado) {
      const cells: string[] = [`${fila.nombre_modulo} ${fila.mercado}`];
      for (const v of data.variedades) cells.push(fmt(fila.por_variedad[String(v.folio)]));
      cells.push(fmt(fila.total));
      lines.push(cells.map(esc).join(sep));
    }
    const totalesRow: string[] = ['Totales'];
    for (const v of data.variedades) totalesRow.push(fmt(data.totales_por_variedad[String(v.folio)]));
    totalesRow.push(fmt(data.total_global));
    lines.push(totalesRow.map(esc).join(sep));

    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
        >
          <Icon name="file_download" className="text-base" />
          Exportar a Excel
        </button>
      </div>

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
                  key={row.key}
                  className={`border-t border-slate-100 dark:border-slate-800 ${
                    row.key === 'totales' ? 'bg-slate-50 dark:bg-slate-800/40 font-semibold' : ''
                  } ${i % 2 === 1 && row.key !== 'totales' ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}
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
