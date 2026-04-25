import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/Icon';
import {
  exportToCsv, exportToXlsx,
  exportToCsvMultiSheet, exportToXlsxMultiSheet,
  type ExportColumn, type SheetSpec,
} from '@/lib/excelExport';

interface BaseProps {
  filename: string;
  title?: string;
  subtitle?: string;
  label?: string;
  hideEmpty?: boolean;
  disabled?: boolean;
}

interface SingleProps<T> extends BaseProps {
  columns: ExportColumn<T>[];
  rows: T[];
  sheets?: never;
}

interface MultiProps extends BaseProps {
   
  sheets: SheetSpec<any>[];
  columns?: never;
  rows?: never;
}

type Props<T> = SingleProps<T> | MultiProps;

/**
 * Dropdown de exportación con XLSX (recomendado) y CSV.
 *
 * Modo single (`columns` + `rows`) o multi-sheet (`sheets`). El XLSX se
 * genera client-side via exceljs (lazy import — no pesa en bundle inicial).
 * El CSV usa BOM UTF-8 para Excel Windows.
 */
export default function ExportButton<T>(props: Props<T>) {
  const { filename, title, subtitle, label = 'Exportar', hideEmpty = true, disabled } = props;
  const [open, setOpen] = useState(false);
  const [exportando, setExportando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isMulti = 'sheets' in props && Array.isArray(props.sheets);
  if (hideEmpty) {
    if (isMulti) {
      const total = (props as MultiProps).sheets.reduce((acc, s) => acc + s.rows.length, 0);
      if (total === 0) return null;
    } else if ((props as SingleProps<T>).rows.length === 0) {
      return null;
    }
  }

  const handleXlsx = async () => {
    setExportando(true);
    try {
      if (isMulti) {
        await exportToXlsxMultiSheet({ filename, title, subtitle, sheets: (props as MultiProps).sheets });
      } else {
        const p = props as SingleProps<T>;
        await exportToXlsx({ filename, columns: p.columns, rows: p.rows, title, subtitle });
      }
    } finally {
      setExportando(false);
      setOpen(false);
    }
  };
  const handleCsv = () => {
    if (isMulti) {
      exportToCsvMultiSheet({ filename, title, subtitle, sheets: (props as MultiProps).sheets });
    } else {
      const p = props as SingleProps<T>;
      exportToCsv({ filename, columns: p.columns, rows: p.rows, title, subtitle });
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || exportando}
        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60"
      >
        <Icon name={exportando ? 'progress_activity' : 'download'} className={`text-base ${exportando ? 'animate-spin' : ''}`} />
        {exportando ? 'Generando…' : label}
        <Icon name="arrow_drop_down" className="text-base -ml-1" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-20 overflow-hidden">
          <button
            type="button"
            onClick={() => void handleXlsx()}
            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-2 border-b border-slate-100 dark:border-slate-800"
          >
            <Icon name="grid_view" className="text-base text-emerald-600 dark:text-emerald-400" />
            <div>
              <div className="font-medium">Excel (.xlsx)</div>
              <div className="text-[10px] text-slate-500">Recomendado · con formato</div>
            </div>
          </button>
          <button
            type="button"
            onClick={handleCsv}
            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-2"
          >
            <Icon name="description" className="text-base text-slate-500" />
            <div>
              <div className="font-medium">CSV</div>
              <div className="text-[10px] text-slate-500">Texto plano</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
