import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ExportButton from '@/components/legacy/ExportButton';
import KpiBar, { type KpiItem } from '@/components/legacy/KpiBar';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import type { ExportColumn } from '@/lib/excelExport';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

// ───────────────────────── Types ─────────────────────────

interface ConteoDocumento { emitidos: number; cancelados: number; activos: number; disponible: boolean }

interface ResumenResponse {
  fecha: string;
  modulo_folio: number | null; modulo_nombre: string | null;
  usuario_clave: number | null; usuario_nombre: string | null;
  tarjetas: ConteoDocumento;
  copref: ConteoDocumento;
  recibos: ConteoDocumento;
}

interface DetalleRow {
  folio: string;
  extra1: string | null;
  numeroinscripcion: string | null;
  fecha: string | null;
  hora: string | null;
  status: string | null;
  funcionario: string | null;
  usuario_nombre: string | null;
}
interface DetalleResponse { documento: string; estado: string; fecha: string; rows: DetalleRow[] }
interface ModuloOption { folio: number; nombre: string }

type TipoDoc = 'tarjetas' | 'copref' | 'recibos';
type EstadoDoc = 'emitidos' | 'cancelados' | 'activos';

const hoyISO = () => new Date().toISOString().slice(0, 10);

// ───────────────────────── Page ─────────────────────────

export default function ResumenDiarioModulosPage() {
  const { token, user } = useLegacyAuth();

  const [fecha, setFecha]         = useState<string>(hoyISO());
  const [moduloFolio, setModulo]  = useState<number | null>(null);
  const [soloMios, setSoloMios]   = useState<boolean>(false);

  const [modulos, setModulos] = useState<ModuloOption[]>([]);
  const [resumen, setResumen] = useState<ResumenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [detalle, setDetalle] = useState<{ doc: TipoDoc; estado: EstadoDoc; data: DetalleResponse } | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const cargarModulos = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/legacy/reportes/resumen-diario/modulos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setModulos(await res.json());
  }, [token]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarModulos(); }, [cargarModulos]);

  const generar = async () => {
    if (!token || !fecha) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ fecha });
      if (moduloFolio !== null) qs.set('modulo_folio', String(moduloFolio));
      if (soloMios && user?.id) qs.set('usuario_clave', String(user.id));
      const res = await fetch(`${API_BASE}/legacy/reportes/resumen-diario?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResumen(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const abrirDetalle = async (doc: TipoDoc, estado: EstadoDoc) => {
    if (!token) return;
    setLoadingDetalle(true);
    try {
      const qs = new URLSearchParams({ documento: doc, estado, fecha });
      if (moduloFolio !== null) qs.set('modulo_folio', String(moduloFolio));
      if (soloMios && user?.id) qs.set('usuario_clave', String(user.id));
      const res = await fetch(`${API_BASE}/legacy/reportes/resumen-diario/detalle?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DetalleResponse = await res.json();
      setDetalle({ doc, estado, data });
    } finally {
      setLoadingDetalle(false);
    }
  };

  const kpis: KpiItem[] = useMemo(() => {
    if (!resumen) return [];
    return [
      { label: 'Tarjetas activas', value: resumen.tarjetas.activos, hint: `${resumen.tarjetas.emitidos} emit. · ${resumen.tarjetas.cancelados} canc.`, icon: 'receipt_long', tone: 'amber' },
      ...(resumen.copref.disponible
        ? [{ label: 'COPREF activos', value: resumen.copref.activos, hint: `${resumen.copref.emitidos} emit. · ${resumen.copref.cancelados} canc.`, icon: 'description', tone: 'slate' as const }]
        : []),
      ...(resumen.recibos.disponible
        ? [{ label: 'Recibos activos', value: resumen.recibos.activos, hint: `${resumen.recibos.emitidos} emit. · ${resumen.recibos.cancelados} canc.`, icon: 'payments', tone: 'emerald' as const }]
        : []),
    ];
  }, [resumen]);

  const cellLabel = (doc: TipoDoc) =>
    doc === 'tarjetas' ? 'Tarjetas' : doc === 'copref' ? 'COPREF' : 'Recibos';

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="today"
        title="Resumen diario por módulo"
        subtitle="Conteo de tarjetas de manejo, COPREF y recibos emitidos / cancelados / activos por día."
        estado={user?.nombre_estado}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label htmlFor="fecha" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Fecha</label>
            <input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} max={hoyISO()}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </div>
          <div>
            <label htmlFor="modulo" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Módulo (opcional)</label>
            <select id="modulo" value={moduloFolio ?? ''} onChange={(e) => setModulo(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              <option value="">— Todos los módulos —</option>
              {modulos.map((m) => <option key={m.folio} value={m.folio}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer mt-5">
              <input type="checkbox" checked={soloMios} onChange={(e) => setSoloMios(e.target.checked)}
                className="size-4 rounded border-slate-300 dark:border-slate-700" />
              Solo mis documentos
            </label>
          </div>
          <div>
            <button type="button" onClick={generar} disabled={loading || !fecha}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium inline-flex items-center gap-2 w-full justify-center">
              <Icon name={loading ? 'progress_activity' : 'play_arrow'} className={`text-base ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Generando…' : 'Generar'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icon name="error" /> {error}
        </div>
      )}

      {resumen && (
        <>
          <KpiBar items={kpis} />

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
              <Icon name="grid_on" className="text-amber-700 dark:text-amber-400 text-lg" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                {fecha}
                {resumen.modulo_nombre && ` · ${resumen.modulo_nombre}`}
                {resumen.usuario_nombre && ` · ${resumen.usuario_nombre}`}
              </h2>
              <span className="ml-auto text-xs text-slate-500">Click en una celda para ver el detalle</span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200">
                    <th className="px-4 py-3 text-left font-semibold w-32"></th>
                    <th className="px-4 py-3 text-center font-semibold">Tarjetas de manejo</th>
                    <th className="px-4 py-3 text-center font-semibold">COPREF{!resumen.copref.disponible && ' (no disp.)'}</th>
                    <th className="px-4 py-3 text-center font-semibold">Recibos{!resumen.recibos.disponible && ' (no disp.)'}</th>
                  </tr>
                </thead>
                <tbody>
                  <FilaConteo label="Emitidos" estado="emitidos" resumen={resumen} onClick={abrirDetalle} loading={loadingDetalle} />
                  <FilaConteo label="Cancelados" estado="cancelados" resumen={resumen} onClick={abrirDetalle} loading={loadingDetalle} />
                  <FilaConteo label="Activos" estado="activos" resumen={resumen} onClick={abrirDetalle} loading={loadingDetalle} highlight />
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {detalle && (
        <DetalleModal
          detalle={detalle}
          fecha={fecha}
          moduloNombre={resumen?.modulo_nombre ?? null}
          legacyDb={user?.legacy_db ?? 'legacy'}
          estadoNombre={user?.nombre_estado ?? ''}
          stamp={stamp}
          onClose={() => setDetalle(null)}
          docLabel={cellLabel(detalle.doc)}
        />
      )}
    </div>
  );
}

// ───────────────────────── Sub-components ─────────────────────────

function FilaConteo({
  label, estado, resumen, onClick, loading, highlight,
}: {
  label: string;
  estado: EstadoDoc;
  resumen: ResumenResponse;
  onClick: (doc: TipoDoc, estado: EstadoDoc) => void;
  loading: boolean;
  highlight?: boolean;
}) {
  const baseCellCls = `px-4 py-4 text-center border-t border-slate-100 dark:border-slate-800 ${
    highlight ? 'bg-slate-50 dark:bg-slate-800/40 font-semibold' : ''
  }`;
  return (
    <tr>
      <td className={`${baseCellCls} text-left text-slate-700 dark:text-slate-200 uppercase text-xs tracking-wider font-semibold`}>
        {label}
      </td>
      <ConteoCell n={resumen.tarjetas[estado]} disponible={resumen.tarjetas.disponible} onClick={() => onClick('tarjetas', estado)} loading={loading} highlight={highlight} />
      <ConteoCell n={resumen.copref[estado]}   disponible={resumen.copref.disponible}   onClick={() => onClick('copref', estado)}   loading={loading} highlight={highlight} />
      <ConteoCell n={resumen.recibos[estado]}  disponible={resumen.recibos.disponible}  onClick={() => onClick('recibos', estado)}  loading={loading} highlight={highlight} />
    </tr>
  );
}

function ConteoCell({ n, disponible, onClick, loading, highlight }: {
  n: number; disponible: boolean; onClick: () => void; loading: boolean; highlight?: boolean;
}) {
  const baseCellCls = `px-4 py-4 text-center border-t border-slate-100 dark:border-slate-800 ${
    highlight ? 'bg-slate-50 dark:bg-slate-800/40' : ''
  }`;
  if (!disponible) {
    return <td className={`${baseCellCls} text-slate-400`}>—</td>;
  }
  if (n === 0) {
    return <td className={`${baseCellCls} text-slate-500 tabular-nums`}>0</td>;
  }
  return (
    <td className={baseCellCls}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors tabular-nums ${
          highlight ? 'text-lg font-bold text-amber-700 dark:text-amber-400' : 'text-base font-semibold'
        }`}
      >
        {n.toLocaleString('es-MX')}
        <Icon name="open_in_new" className="text-sm opacity-60" />
      </button>
    </td>
  );
}

function DetalleModal({
  detalle, fecha, moduloNombre, legacyDb, estadoNombre, stamp, onClose, docLabel,
}: {
  detalle: { doc: TipoDoc; estado: EstadoDoc; data: DetalleResponse };
  fecha: string;
  moduloNombre: string | null;
  legacyDb: string;
  estadoNombre: string;
  stamp: string;
  onClose: () => void;
  docLabel: string;
}) {
  const cols: ExportColumn<DetalleRow>[] = [
    { header: 'Folio',           key: 'folio',             width: 16 },
    { header: detalle.doc === 'tarjetas' ? 'Clave mov.' : detalle.doc === 'copref' ? 'TMIMF ref.' : 'TMIMF ref.',
      key: 'extra1',            width: 16 },
    { header: 'Inscripción',     key: 'numeroinscripcion', width: 18 },
    { header: 'Fecha',           key: 'fecha',             format: 'date' },
    { header: 'Hora',            key: 'hora',              width: 9 },
    { header: 'Status',          key: 'status',            width: 8 },
    { header: 'Funcionario',     key: 'funcionario',       width: 24 },
    { header: 'Usuario',         key: 'usuario_nombre',    width: 22 },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" role="dialog">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <Icon name="list_alt" className="text-amber-700 dark:text-amber-400 text-xl" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">
              {docLabel} · {detalle.estado}
            </h2>
            <p className="text-xs text-slate-500">
              {fecha}
              {moduloNombre && ` · ${moduloNombre}`}
              {' · '}{detalle.data.rows.length.toLocaleString('es-MX')} registros
            </p>
          </div>
          <ExportButton<DetalleRow>
            filename={`resumen-diario_${legacyDb}_${detalle.doc}_${detalle.estado}_${fecha}_${stamp}`}
            title={`${docLabel} ${detalle.estado} — ${estadoNombre}`}
            subtitle={`Fecha ${fecha}${moduloNombre ? ` · ${moduloNombre}` : ''}`}
            columns={cols}
            rows={detalle.data.rows}
          />
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cerrar">
            <Icon name="close" className="text-lg" />
          </button>
        </header>
        <div className="flex-1 overflow-auto">
          {detalle.data.rows.length === 0 ? (
            <p className="px-4 py-12 text-center text-slate-500">Sin registros para esta combinación.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
                <tr>
                  <th className="px-3 py-2 text-left">Folio</th>
                  <th className="px-3 py-2 text-left">{detalle.doc === 'tarjetas' ? 'Clave mov.' : 'TMIMF ref.'}</th>
                  <th className="px-3 py-2 text-left">Inscripción</th>
                  <th className="px-3 py-2 text-left">Hora</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-left">Funcionario</th>
                  <th className="px-3 py-2 text-left">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {detalle.data.rows.map((r, i) => (
                  <tr key={`${r.folio}-${i}`} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2 font-mono text-xs">{r.folio}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.extra1 ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.numeroinscripcion ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{r.hora ?? '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                        r.status === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
                        r.status === 'C' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                                           'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>{r.status ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.funcionario ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{r.usuario_nombre ?? '—'}</td>
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
