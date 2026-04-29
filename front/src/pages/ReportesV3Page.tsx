import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';
import { exportToXlsxMultiSheet, type ExportColumn, type SheetSpec } from '@/lib/excelExport';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface InformeSemanal {
  estado_id: number;
  estado_nombre: string | null;
  semana: number;
  revisiones: Array<Record<string, unknown>>;
  identificaciones: Array<Record<string, unknown>>;
  tmimfs: Array<Record<string, unknown>>;
  muestreos: Array<Record<string, unknown>>;
  control_quimico: Array<Record<string, unknown>>;
  control_mecanico: Array<Record<string, unknown>>;
  totales: Record<string, number>;
}

function authHeaders(): HeadersInit {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json', ...authHeaders() } });
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try { const b = await r.json(); if (b?.detail) detail = String(b.detail); } catch { /* ignore */ }
    throw new Error(detail);
  }
  return (await r.json()) as T;
}

const REVISIONES_COLS: ExportColumn<Record<string, unknown>>[] = [
  { header: 'Folio', key: 'id', format: 'integer' },
  { header: 'Trampa', key: 'trampa_numero' },
  { header: 'Sem', key: 'numero_semana', format: 'integer' },
  { header: 'Fecha revision', key: 'fecha_revision', format: 'date' },
  { header: 'Lecturas', key: 'numero_lecturas', format: 'integer' },
  { header: 'Recibo servicio', key: 'recibo_servicio' },
  { header: 'Cancelada', key: 'cancelada', format: 'integer' },
];

const IDENTIFICACIONES_COLS: ExportColumn<Record<string, unknown>>[] = [
  { header: 'Folio', key: 'id', format: 'integer' },
  { header: 'Trampa', key: 'trampa_numero' },
  { header: 'Sem', key: 'numero_semana', format: 'integer' },
  { header: 'Fecha', key: 'fecha', format: 'date' },
  { header: 'Especie', key: 'especie_nombre' },
  { header: '♀ silv', key: 'hembras_silvestre', format: 'integer', totals: 'sum' },
  { header: '♂ silv', key: 'machos_silvestre', format: 'integer', totals: 'sum' },
  { header: '♀ esté', key: 'hembras_esteril', format: 'integer', totals: 'sum' },
  { header: '♂ esté', key: 'machos_esteril', format: 'integer', totals: 'sum' },
  { header: 'Total', key: 'total_capturado', format: 'integer', totals: 'sum' },
];

const TMIMF_COLS: ExportColumn<Record<string, unknown>>[] = [
  { header: 'Folio', key: 'id', format: 'integer' },
  { header: 'N° folio', key: 'numero_folio' },
  { header: 'Productor', key: 'productor_nombre' },
  { header: 'Modulo emisor', key: 'modulo_emisor_nombre' },
  { header: 'Sem', key: 'semana_anio', format: 'integer' },
  { header: 'Fecha emision', key: 'fecha_emision', format: 'date' },
  { header: 'Fecha movilizacion', key: 'fecha_movilizacion', format: 'date' },
  { header: 'Cantidad (kg)', key: 'cantidad_total_kg', format: 'decimal', totals: 'sum' },
  { header: 'Cancelado', key: 'cancelado', format: 'integer' },
];

const MUESTREOS_COLS: ExportColumn<Record<string, unknown>>[] = [
  { header: 'Folio', key: 'id', format: 'integer' },
  { header: 'Muestra', key: 'numero_muestra' },
  { header: 'Fecha', key: 'fecha_muestreo', format: 'date' },
  { header: 'Sem', key: 'numero_semana', format: 'integer' },
  { header: 'Unidad', key: 'unidad_nombre' },
  { header: 'Variedad', key: 'variedad_nombre' },
  { header: 'Frutos', key: 'numero_frutos', format: 'integer', totals: 'sum' },
  { header: 'Kgs muestreados', key: 'kgs_muestreados', format: 'decimal', totals: 'sum' },
  { header: 'Frutos infestados', key: 'frutos_infestados', format: 'integer', totals: 'sum' },
  { header: '% infestacion', key: 'pct_infestacion', format: 'decimal' },
];

const CQ_COLS: ExportColumn<Record<string, unknown>>[] = [
  { header: 'Folio', key: 'id', format: 'integer' },
  { header: 'Fecha', key: 'fecha_aplicacion', format: 'date' },
  { header: 'Sem', key: 'numero_semana', format: 'integer' },
  { header: 'Unidad', key: 'unidad_nombre' },
  { header: 'Tipo aplicacion', key: 'tipo_aplicacion_nombre' },
  { header: 'Sup. (ha)', key: 'superficie', format: 'decimal', totals: 'sum' },
  { header: 'Proteina (L)', key: 'proteina_litros', format: 'decimal', totals: 'sum' },
  { header: 'Malation (L)', key: 'malathion_litros', format: 'decimal', totals: 'sum' },
  { header: 'Agua (L)', key: 'agua_litros', format: 'decimal', totals: 'sum' },
];

const CMC_COLS: ExportColumn<Record<string, unknown>>[] = [
  { header: 'Folio', key: 'id', format: 'integer' },
  { header: 'Fecha', key: 'fecha', format: 'date' },
  { header: 'Sem', key: 'numero_semana', format: 'integer' },
  { header: 'Unidad', key: 'unidad_nombre' },
  { header: 'Hospedero', key: 'hospedero_nombre' },
  { header: 'Kgs destruidos', key: 'kgs_destruidos', format: 'decimal', totals: 'sum' },
  { header: 'N° arboles', key: 'numero_arboles', format: 'integer', totals: 'sum' },
  { header: 'Has rastreadas', key: 'has_rastreadas', format: 'decimal', totals: 'sum' },
];

export default function ReportesV3Page() {
  const { activeStateName } = useAuth();
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const currentWeek = Math.ceil(((today.getTime() - startOfYear.getTime()) / 86_400_000 + startOfYear.getDay() + 1) / 7);

  const [semana, setSemana] = useState<number>(currentWeek);
  const [data, setData] = useState<InformeSemanal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generar = async () => {
    setLoading(true); setError(''); setData(null);
    try {
      const params = new URLSearchParams({ semana: String(semana) });
      const r = await fetchJson<InformeSemanal>(`${API_BASE}/reportes-v3/informe-semanal?${params.toString()}`);
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el informe.');
    } finally { setLoading(false); }
  };

  const exportar = async () => {
    if (!data) return;
    const sheets: SheetSpec<Record<string, unknown>>[] = [
      { sheetName: 'Revisiones',       title: `Revisiones — sem ${data.semana}`,       columns: REVISIONES_COLS,      rows: data.revisiones },
      { sheetName: 'Identificaciones', title: `Identificaciones — sem ${data.semana}`, columns: IDENTIFICACIONES_COLS, rows: data.identificaciones },
      { sheetName: 'TMIMF',            title: `TMIMF — sem ${data.semana}`,            columns: TMIMF_COLS,            rows: data.tmimfs },
      { sheetName: 'Muestreos',        title: `Muestreos de fruto — sem ${data.semana}`, columns: MUESTREOS_COLS,      rows: data.muestreos },
      { sheetName: 'Control quimico',  title: `Control quimico — sem ${data.semana}`,  columns: CQ_COLS,               rows: data.control_quimico },
      { sheetName: 'Control mecanico', title: `Control mecanico — sem ${data.semana}`, columns: CMC_COLS,              rows: data.control_mecanico },
    ];
    await exportToXlsxMultiSheet({
      filename: `informe-semanal-${data.estado_nombre ?? 'estado'}-sem${data.semana}`,
      title: `Informe semanal SIGMOD V3 — ${data.estado_nombre ?? ''}`,
      subtitle: `Semana ${data.semana} · generado ${new Date().toLocaleString()}`,
      sheets,
    });
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reportes V3</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Informe semanal consolidado de {activeStateName ?? 'tu estado activo'}: trampeo, TMIMF, muestreos, controles.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Semana</label>
          <input type="number" min={1} max={53} value={semana} onChange={(e) => setSemana(Number(e.target.value || 1))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
        </div>
        <button onClick={() => void generar()} disabled={loading} className="rounded-xl bg-primary text-white px-4 py-2 disabled:opacity-50 inline-flex items-center gap-2">
          <Icon name="search" className="text-base" /> {loading ? 'Cargando…' : 'Generar informe'}
        </button>
        <button onClick={() => void exportar()} disabled={!data} className="rounded-xl border border-primary text-primary px-4 py-2 disabled:opacity-50 inline-flex items-center gap-2">
          <Icon name="download" className="text-base" /> Exportar Excel
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {Object.entries(data.totales).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4">
              <p className="text-xs uppercase font-semibold text-slate-500 tracking-wider">{k.replace('_', ' ')}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{v}</p>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Vista previa — primeras filas por hoja</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">El informe contiene {Object.values(data.totales).reduce((a, b) => a + b, 0)} registros distribuidos en 6 hojas. Pulsa <span className="font-semibold">Exportar Excel</span> para descargar el archivo.</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div><strong>Revisiones:</strong> {data.totales.revisiones}</div>
            <div><strong>Identificaciones:</strong> {data.totales.identificaciones}</div>
            <div><strong>TMIMF:</strong> {data.totales.tmimfs}</div>
            <div><strong>Muestreos:</strong> {data.totales.muestreos}</div>
            <div><strong>Control quimico:</strong> {data.totales.control_quimico}</div>
            <div><strong>Control mecanico:</strong> {data.totales.control_mecanico}</div>
          </div>
        </div>
      )}
    </div>
  );
}
