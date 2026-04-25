import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ExportButton from '@/components/legacy/ExportButton';
import KpiBar, { type KpiItem } from '@/components/legacy/KpiBar';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import type { ExportColumn } from '@/lib/excelExport';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

// ───────────────────────── Types ─────────────────────────

type Modo = 'emitidas' | 'validadas_normex' | 'mis_validadas';

interface DetalladoRow {
  folio: number;
  sub_folio: string | null;
  cantidad_movilizada: number;
  variedad_folio: number | null;
  variedad_nombre: string | null;
  tipo_vehiculo: string | null;
  placas: string | null;
  saldo: number;
  cajas_total: number;
  granel: number;
  status: string | null;
}

interface TmimfRow {
  folio_tmimf: string;
  status: string | null;
  tipo_tarjeta: string | null;
  mercado_destino: number | null;
  numeroinscripcion: string;
  nombre_propietario: string | null;
  nombre_unidad: string | null;
  fecha_emision: string | null;
  hora_emision: string | null;
  fecha_verifico_normex: string | null;
  pfa_folio: number | null;
  pfa_nombre: string | null;
  pfa_cedula: string | null;
  usuario_generador_nombre: string | null;
  modulo_emisor_folio: number | null;
  modulo_emisor_nombre: string | null;
  semana: number | null;
  detallado: DetalladoRow[] | null;
}

interface Page {
  total: number; offset: number; limit: number; modo: Modo;
  rows: TmimfRow[];
}

interface Modulo { folio: number; nombre_modulo: string }

const PAGE_SIZE = 100;

const hoyISO = () => new Date().toISOString().slice(0, 10);
const haceDias = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// ───────────────────────── Page ─────────────────────────

export default function TmimfsEmitidasPage() {
  const { token, user } = useLegacyAuth();

  const [modo, setModo] = useState<Modo>('emitidas');
  const [fechaInicio, setFechaInicio] = useState<string>(haceDias(30));
  const [fechaFin, setFechaFin] = useState<string>(hoyISO());
  const [tipoTarjeta, setTipoTarjeta] = useState<string>('');
  const [mercado, setMercado] = useState<string>('');
  const [moduloFolio, setModuloFolio] = useState<number | null>(null);
  const [incluirDetallado, setIncluirDetallado] = useState<boolean>(false);

  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [page, setPage] = useState<Page>({ total: 0, offset: 0, limit: PAGE_SIZE, modo: 'emitidas', rows: [] });
  const [cargando, setCargando] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [detalleAbierto, setDetalleAbierto] = useState<Set<string>>(new Set());

  const filtrosRef = useRef({ modo, fechaInicio, fechaFin, tipoTarjeta, mercado, moduloFolio, incluirDetallado });
  useEffect(() => {
    filtrosRef.current = { modo, fechaInicio, fechaFin, tipoTarjeta, mercado, moduloFolio, incluirDetallado };
  }, [modo, fechaInicio, fechaFin, tipoTarjeta, mercado, moduloFolio, incluirDetallado]);

  const cargarModulos = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/legacy/reportes/tmimf/modulos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setModulos(await res.json());
  }, [token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarModulos(); }, [cargarModulos]);

  const cargar = useCallback(async (offset: number) => {
    if (!token) return;
    const append = offset > 0;
    if (append) setCargandoMas(true); else setCargando(true);
    try {
      const f = filtrosRef.current;
      const qs = new URLSearchParams({
        fecha_inicio: f.fechaInicio,
        fecha_fin: f.fechaFin,
        modo: f.modo,
        offset: String(offset),
        limit: String(PAGE_SIZE),
        incluir_detallado: String(f.incluirDetallado),
      });
      if (f.tipoTarjeta) qs.set('tipo_tarjeta', f.tipoTarjeta);
      if (f.mercado) qs.set('mercado_destino', f.mercado);
      if (f.moduloFolio !== null) qs.set('modulo_folio', String(f.moduloFolio));

      const res = await fetch(`${API_BASE}/legacy/reportes/tmimf/emitidas?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Page = await res.json();
      setPage((prev) => append ? { ...data, rows: [...prev.rows, ...data.rows] } : data);
      if (!append) setDetalleAbierto(new Set());
    } finally {
      if (append) setCargandoMas(false); else setCargando(false);
    }
  }, [token]);

  const tienenMas = page.rows.length < page.total;

  const toggleDetalle = (folio: string) => {
    setDetalleAbierto((prev) => {
      const next = new Set(prev);
      if (next.has(folio)) next.delete(folio); else next.add(folio);
      return next;
    });
  };

  // KPIs derivados del listado actual (visible)
  const kpis: KpiItem[] = useMemo(() => {
    const total = page.total;
    const exp = page.rows.filter((r) => r.mercado_destino === 1).length;
    const nac = page.rows.filter((r) => r.mercado_destino === 2).length;
    const huertos = new Set(page.rows.map((r) => r.numeroinscripcion)).size;
    const pfas = new Set(page.rows.map((r) => r.pfa_folio).filter(Boolean)).size;
    return [
      { label: 'TMIMFs',     value: total.toLocaleString('es-MX'), icon: 'receipt_long', tone: 'amber' },
      { label: 'Exportación', value: exp, hint: page.rows.length ? `${Math.round(exp/page.rows.length*100)}% del visible` : undefined, icon: 'flight_takeoff', tone: 'emerald' },
      { label: 'Nacional',   value: nac, hint: page.rows.length ? `${Math.round(nac/page.rows.length*100)}% del visible` : undefined, icon: 'local_shipping', tone: 'slate' },
      { label: 'Huertos únicos', value: huertos, icon: 'agriculture', tone: 'amber' },
      { label: 'PFAs',       value: pfas,    icon: 'badge', tone: 'amber' },
    ];
  }, [page]);

  // Columnas del export — declarativo, reusado por XLSX y CSV.
  const exportColumns: ExportColumn<TmimfRow>[] = [
    { header: 'Folio TMIMF',   key: 'folio_tmimf', width: 16 },
    { header: 'Tipo',          key: 'tipo_tarjeta', width: 6 },
    { header: 'Status',        key: 'status', width: 8 },
    { header: 'Inscripción',   key: 'numeroinscripcion', width: 18 },
    { header: 'Propietario',   key: 'nombre_propietario', width: 30 },
    { header: 'Huerto',        key: 'nombre_unidad', width: 26 },
    { header: 'Fecha emisión', key: 'fecha_emision', format: 'date' },
    { header: 'Hora',          key: 'hora_emision', width: 9 },
    { header: 'PFA',           key: 'pfa_nombre', width: 30 },
    { header: 'Usuario',       key: 'usuario_generador_nombre', width: 24 },
    { header: 'Módulo',        key: 'modulo_emisor_nombre', width: 16 },
    {
      header: 'Mercado',
      accessor: (r) => r.mercado_destino === 1 ? 'Exportación' : r.mercado_destino === 2 ? 'Nacional' : '',
      width: 12,
    },
    { header: 'Semana',        key: 'semana', format: 'integer', totals: 'count' },
  ];

  const fechaStr = `${fechaInicio} a ${fechaFin}`;
  const modoLabel = modo === 'emitidas' ? 'Por fecha de emisión'
    : modo === 'validadas_normex' ? 'Validadas en empaque'
    : 'Mis validaciones';

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="receipt_long"
        title="TMIMFs emitidas por fecha"
        subtitle="Listado de tarjetas emitidas o validadas en empaque, filtrable por modo y rango."
        estado={user?.nombre_estado}
      />

      {/* Filtros */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
        {/* Modo radio */}
        <div>
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">Modo</div>
          <div className="flex flex-wrap gap-2">
            <ModoBtn value="emitidas"         current={modo} onChange={setModo} label="Por fecha de emisión" desc="Por modulo, excluye E/R" />
            <ModoBtn value="validadas_normex" current={modo} onChange={setModo} label="Validadas en empaque" desc="Todas, larva='S'" />
            <ModoBtn value="mis_validadas"    current={modo} onChange={setModo} label="Mis validaciones"      desc="Solo las que yo verifiqué" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <label htmlFor="fi" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Desde</label>
            <input id="fi" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </div>
          <div>
            <label htmlFor="ff" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Hasta</label>
            <input id="ff" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </div>
          <div>
            <label htmlFor="tt" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Tipo tarjeta</label>
            <select id="tt" value={tipoTarjeta} onChange={(e) => setTipoTarjeta(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              <option value="">Todas</option>
              <option value="M">M · Movilización</option>
              <option value="O">O · Operativa</option>
              <option value="I">I · Internacional</option>
            </select>
          </div>
          <div>
            <label htmlFor="md" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Mercado</label>
            <select id="md" value={mercado} onChange={(e) => setMercado(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              <option value="">Todos</option>
              <option value="1">Exportación</option>
              <option value="2">Nacional</option>
            </select>
          </div>
          <div>
            <label htmlFor="mod" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Módulo</label>
            <select id="mod" value={moduloFolio ?? ''} onChange={(e) => setModuloFolio(e.target.value ? Number(e.target.value) : null)} disabled={modo !== 'emitidas'} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm disabled:opacity-50">
              <option value="">Todos</option>
              {modulos.map((m) => (<option key={m.folio} value={m.folio}>{m.nombre_modulo}</option>))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={incluirDetallado} onChange={(e) => setIncluirDetallado(e.target.checked)} className="size-4 rounded border-slate-300 dark:border-slate-700" />
              Incluir detallado
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={() => void cargar(0)} disabled={cargando} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium inline-flex items-center gap-2">
            <Icon name="search" className="text-base" />
            {cargando ? 'Generando…' : 'Generar'}
          </button>
        </div>
      </section>

      {page.total > 0 && (
        <KpiBar
          items={kpis}
          trailing={
            <ExportButton<TmimfRow>
              filename={`tmimfs_${modo}_${fechaInicio}_${fechaFin}`}
              columns={exportColumns}
              rows={page.rows}
              title={`TMIMFs emitidas — ${user?.nombre_estado ?? ''}`}
              subtitle={`${modoLabel} · ${fechaStr} · ${page.rows.length} de ${page.total} TMIMF(s)`}
            />
          }
        />
      )}

      {/* Tabla */}
      {page.total > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
            <Icon name="receipt_long" className="text-amber-700 dark:text-amber-400 text-lg" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
              {page.total.toLocaleString('es-MX')} TMIMF{page.total !== 1 ? 's' : ''}
            </h2>
            <span className="text-xs text-slate-500">· mostrando {page.rows.length}</span>
          </header>
          <div className="overflow-x-auto max-h-[65vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
                <tr>
                  {incluirDetallado && <th className="px-2 py-2 w-8"></th>}
                  <th className="px-3 py-2 text-left">Folio</th>
                  <th className="px-3 py-2 text-center">Tipo</th>
                  <th className="px-3 py-2 text-left">Huerto</th>
                  <th className="px-3 py-2 text-left">Fecha / hora</th>
                  <th className="px-3 py-2 text-left">PFA</th>
                  <th className="px-3 py-2 text-left">Usuario</th>
                  <th className="px-3 py-2 text-left">Módulo</th>
                  <th className="px-3 py-2 text-center">Mercado</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((r) => {
                  const abierto = detalleAbierto.has(r.folio_tmimf);
                  return (
                    <FragmentoFila key={r.folio_tmimf} r={r} abierto={abierto} incluirDetallado={incluirDetallado} toggleDetalle={toggleDetalle} />
                  );
                })}
              </tbody>
            </table>
          </div>
          {tienenMas && (
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-center">
              <button type="button" onClick={() => void cargar(page.rows.length)} disabled={cargandoMas} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">
                {cargandoMas ? 'Cargando…' : `Cargar más (${page.total - page.rows.length} restantes)`}
              </button>
            </div>
          )}
        </section>
      )}

      {page.total === 0 && !cargando && (
        <section className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-500">
          Pulsa "Generar" para ejecutar el reporte con los filtros actuales.
        </section>
      )}
    </div>
  );
}

// ───────────────────────── Sub-components ─────────────────────────

function ModoBtn({ value, current, onChange, label, desc }: {
  value: Modo; current: Modo; onChange: (v: Modo) => void; label: string; desc: string;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`px-3 py-2 rounded-lg border text-left text-sm ${
        active
          ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      <div className="font-medium">{label}</div>
      <div className="text-xs opacity-75">{desc}</div>
    </button>
  );
}

function FragmentoFila({
  r, abierto, incluirDetallado, toggleDetalle,
}: {
  r: TmimfRow; abierto: boolean; incluirDetallado: boolean; toggleDetalle: (folio: string) => void;
}) {
  return (
    <>
      <tr className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
        {incluirDetallado && (
          <td className="px-2 py-2 text-center">
            {r.detallado && r.detallado.length > 0 && (
              <button
                type="button"
                onClick={() => toggleDetalle(r.folio_tmimf)}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                aria-label={abierto ? 'Contraer' : 'Expandir'}
              >
                <Icon name={abierto ? 'expand_less' : 'expand_more'} className="text-sm" />
              </button>
            )}
          </td>
        )}
        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.folio_tmimf}</td>
        <td className="px-3 py-2 text-center">
          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
            r.tipo_tarjeta === 'O' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
            r.tipo_tarjeta === 'M' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}>{r.tipo_tarjeta ?? '—'}</span>
        </td>
        <td className="px-3 py-2">
          <div className="font-mono text-xs">{r.numeroinscripcion}</div>
          <div className="text-xs text-slate-500">{r.nombre_unidad ?? '—'} · {r.nombre_propietario ?? '—'}</div>
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-xs">
          <div>{r.fecha_emision ?? '—'}</div>
          <div className="text-slate-500">{r.hora_emision ?? ''}</div>
        </td>
        <td className="px-3 py-2 text-xs">{r.pfa_nombre ?? '—'}</td>
        <td className="px-3 py-2 text-xs">{r.usuario_generador_nombre ?? '—'}</td>
        <td className="px-3 py-2 text-xs">{r.modulo_emisor_nombre ?? '—'}</td>
        <td className="px-3 py-2 text-center text-xs">
          {r.mercado_destino === 1 ? 'Exp.' : r.mercado_destino === 2 ? 'Nac.' : '—'}
        </td>
      </tr>
      {incluirDetallado && abierto && r.detallado && r.detallado.length > 0 && (
        <tr className="bg-slate-50 dark:bg-slate-800/40">
          <td colSpan={9} className="px-5 py-3">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-2 py-1 text-left">Sub</th>
                  <th className="px-2 py-1 text-left">Variedad</th>
                  <th className="px-2 py-1 text-right">kg</th>
                  <th className="px-2 py-1 text-right">Cajas</th>
                  <th className="px-2 py-1 text-right">Granel</th>
                  <th className="px-2 py-1 text-left">Vehículo</th>
                  <th className="px-2 py-1 text-left">Placas</th>
                  <th className="px-2 py-1 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {r.detallado.map((d) => (
                  <tr key={d.folio} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-2 py-1">{d.sub_folio ?? '—'}</td>
                    <td className="px-2 py-1">{d.variedad_nombre ?? '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{d.cantidad_movilizada.toLocaleString('es-MX')}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{d.cajas_total}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{d.granel}</td>
                    <td className="px-2 py-1">{d.tipo_vehiculo ?? '—'}</td>
                    <td className="px-2 py-1 font-mono">{d.placas ?? '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{d.saldo.toLocaleString('es-MX')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

