/**
 * Export helper compartido para reportes legacy.
 *
 * Produce dos formatos:
 *  - XLSX nativo (vía exceljs) con header con formato (negrita, fondo ámbar SIGMOD),
 *    autofit de columnas, freeze panes, y opcional fila de totales.
 *  - CSV con BOM UTF-8 (compat Excel Windows).
 *
 * `exceljs` se importa dinámicamente al ejecutar la exportación para que no
 * pese en el bundle inicial — solo se descarga cuando el usuario hace export.
 */

export type ColumnFormat = 'integer' | 'decimal' | 'currency' | 'date' | 'text';
export type TotalsKind = 'sum' | 'count' | 'avg';

export interface ExportColumn<T> {
  header: string;
  /** Path en el row (e.g. `'folio'` o `'meta.pfa_nombre'`). Ignorado si se pasa `accessor`. */
  key?: string;
  /** Función custom para extraer el valor (toma precedencia sobre `key`). */
  accessor?: (row: T) => unknown;
  /** Ancho aproximado en caracteres. Si se omite se calcula del contenido. */
  width?: number;
  format?: ColumnFormat;
  totals?: TotalsKind;
  /** Si verdadero, alinea a la derecha (auto cuando format ∈ {integer, decimal, currency}). */
  alignRight?: boolean;
}

export interface ExportOptions<T> {
  filename: string;        // sin extensión
  sheetName?: string;
  title?: string;          // fila de título sobre la tabla
  subtitle?: string;       // fila de subtítulo (estado, fechas)
  columns: ExportColumn<T>[];
  rows: T[];
}

/** Definición de una hoja individual cuando el reporte tiene varias tablas. */
export interface SheetSpec<T> {
  sheetName: string;
  title?: string;
  columns: ExportColumn<T>[];
  rows: T[];
}

export interface MultiSheetOptions {
  filename: string;
  title?: string;          // título global del libro (opcional)
  subtitle?: string;
   
  sheets: SheetSpec<any>[];
}

const SIGMOD_AMBER = 'FFB45309';      // amber-700, en formato ARGB
const SIGMOD_AMBER_LIGHT = 'FFFEF3C7'; // amber-100

function getValue<T>(row: T, col: ExportColumn<T>): unknown {
  if (col.accessor) return col.accessor(row);
  if (!col.key) return '';
  // soporte mínimo de paths "a.b" sin escapes
  const parts = col.key.split('.');
  let cur: unknown = row;
  for (const p of parts) {
    if (cur === null || cur === undefined) return '';
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur ?? '';
}

function isNumeric(format?: ColumnFormat): boolean {
  return format === 'integer' || format === 'decimal' || format === 'currency';
}

function formatNumberFormat(format?: ColumnFormat): string | undefined {
  if (format === 'integer')  return '#,##0';
  if (format === 'decimal')  return '#,##0.00';
  if (format === 'currency') return '"$"#,##0.00';
  if (format === 'date')     return 'yyyy-mm-dd';
  return undefined;
}

function calcTotals<T>(rows: T[], col: ExportColumn<T>): number | string {
  if (!col.totals) return '';
  const vals = rows
    .map((r) => Number(getValue(r, col)))
    .filter((n) => Number.isFinite(n));
  if (col.totals === 'count') return rows.length;
  if (col.totals === 'sum')   return vals.reduce((a, b) => a + b, 0);
  if (col.totals === 'avg')   return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return '';
}

 
async function buildWorkbook(): Promise<any> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIGMOD V3';
  wb.created = new Date();
  return wb;
}

 
function fillSheet<T>(ws: any, spec: { columns: ExportColumn<T>[]; rows: T[]; title?: string; subtitle?: string }) {
  // Title rows (opcional)
  if (spec.title) {
    const r = ws.addRow([spec.title]);
    r.font = { bold: true, size: 14, color: { argb: 'FF1F2937' } };
    ws.mergeCells(r.number, 1, r.number, spec.columns.length);
  }
  if (spec.subtitle) {
    const r = ws.addRow([spec.subtitle]);
    r.font = { italic: true, color: { argb: 'FF64748B' } };
    ws.mergeCells(r.number, 1, r.number, spec.columns.length);
  }
  if (spec.title || spec.subtitle) ws.addRow([]);

  // Header row
  const headerRow = ws.addRow(spec.columns.map((c) => c.header));
  headerRow.eachCell((cell: { font: object; fill: object; alignment: object; border: object }) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SIGMOD_AMBER } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF92400E' } } };
  });
  headerRow.height = 22;

  // Data rows
  for (const row of spec.rows) {
    const values = spec.columns.map((c) => {
      const v = getValue(row, c);
      if (isNumeric(c.format) && v !== '' && v !== null && v !== undefined) {
        const n = Number(v);
        return Number.isFinite(n) ? n : v;
      }
      if (c.format === 'date' && v) {
        const d = v instanceof Date ? v : new Date(String(v));
        return Number.isNaN(d.getTime()) ? String(v) : d;
      }
      return v;
    });
    ws.addRow(values);
  }

  // Per-column format + alignment
  spec.columns.forEach((c, i) => {
    const colObj = ws.getColumn(i + 1);
    const fmt = formatNumberFormat(c.format);
    if (fmt) colObj.numFmt = fmt;
    if (c.alignRight ?? isNumeric(c.format)) colObj.alignment = { horizontal: 'right' };
  });

  // Totals row
  const tieneTotales = spec.columns.some((c) => c.totals);
  if (tieneTotales) {
    const totalsValues = spec.columns.map((c) => calcTotals(spec.rows, c));
    const labelIdx = spec.columns.findIndex((c) => !!c.totals);
    if (labelIdx > 0) totalsValues[labelIdx - 1] = 'Total';
    const tr = ws.addRow(totalsValues);
    tr.eachCell((cell: { font: object; fill: object; border: object }) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SIGMOD_AMBER_LIGHT } };
      cell.border = { top: { style: 'thin', color: { argb: 'FF92400E' } } };
    });
  }

  // Auto column widths
  spec.columns.forEach((c, i) => {
    const colObj = ws.getColumn(i + 1);
    if (c.width !== undefined) { colObj.width = c.width; return; }
    let maxLen = c.header.length;
    for (const row of spec.rows) {
      const v = getValue(row, c);
      const s = (v === null || v === undefined) ? '' : String(v);
      if (s.length > maxLen) maxLen = s.length;
    }
    colObj.width = Math.min(maxLen + 2, 60);
  });
}

export async function exportToXlsx<T>(opts: ExportOptions<T>): Promise<void> {
  const wb = await buildWorkbook();
  const ws = wb.addWorksheet(opts.sheetName ?? 'Datos', {
    views: [{ state: 'frozen', ySplit: opts.title ? (opts.subtitle ? 4 : 3) : 1 }],
  });
  fillSheet(ws, { columns: opts.columns, rows: opts.rows, title: opts.title, subtitle: opts.subtitle });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, `${opts.filename}.xlsx`);
}

export async function exportToXlsxMultiSheet(opts: MultiSheetOptions): Promise<void> {
  const wb = await buildWorkbook();
  for (const sheet of opts.sheets) {
    const ws = wb.addWorksheet(sheet.sheetName, {
      views: [{ state: 'frozen', ySplit: (sheet.title || opts.subtitle) ? 3 : 1 }],
    });
    // El subtítulo global se muestra debajo del título de cada hoja para
    // mantener el contexto del libro.
    fillSheet(ws, {
      columns: sheet.columns, rows: sheet.rows,
      title: sheet.title ?? opts.title,
      subtitle: opts.subtitle,
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, `${opts.filename}.xlsx`);
}

export function exportToCsvMultiSheet(opts: MultiSheetOptions): void {
  // CSV no soporta multi-hoja; concatenamos con headers por sección.
  const lines: string[] = [];
  if (opts.title) lines.push(opts.title);
  if (opts.subtitle) lines.push(opts.subtitle);
  if (opts.title || opts.subtitle) lines.push('');
  for (const sheet of opts.sheets) {
    lines.push(`# ${sheet.sheetName}${sheet.title ? ` — ${sheet.title}` : ''}`);
    lines.push(sheet.columns.map((c) => csvEsc(c.header)).join(','));
    for (const row of sheet.rows) {
      lines.push(sheet.columns.map((c) => csvEsc(getValue(row, c))).join(','));
    }
    const tieneTotales = sheet.columns.some((c) => c.totals);
    if (tieneTotales) {
      const totalsValues = sheet.columns.map((c) => calcTotals(sheet.rows, c));
      const labelIdx = sheet.columns.findIndex((c) => !!c.totals);
      if (labelIdx > 0) totalsValues[labelIdx - 1] = 'Total';
      lines.push(totalsValues.map(csvEsc).join(','));
    }
    lines.push('');
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${opts.filename}.csv`);
}

export function exportToCsv<T>(opts: ExportOptions<T>): void {
  const lines: string[] = [];
  if (opts.title) lines.push(csvEsc(opts.title));
  if (opts.subtitle) lines.push(csvEsc(opts.subtitle));
  if (opts.title || opts.subtitle) lines.push('');
  lines.push(opts.columns.map((c) => csvEsc(c.header)).join(','));
  for (const row of opts.rows) {
    const vals = opts.columns.map((c) => csvEsc(getValue(row, c)));
    lines.push(vals.join(','));
  }
  const tieneTotales = opts.columns.some((c) => c.totals);
  if (tieneTotales) {
    const totalsValues = opts.columns.map((c) => calcTotals(opts.rows, c));
    const labelIdx = opts.columns.findIndex((c) => !!c.totals);
    if (labelIdx > 0) totalsValues[labelIdx - 1] = 'Total';
    lines.push(totalsValues.map(csvEsc).join(','));
  }
  // BOM UTF-8 para Excel Windows
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${opts.filename}.csv`);
}

function csvEsc(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
