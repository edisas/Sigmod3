import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ExportButton from '@/components/legacy/ExportButton';
import KpiBar, { type KpiItem } from '@/components/legacy/KpiBar';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import type { ExportColumn } from '@/lib/excelExport';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

interface CoprefRow {
  folio: string; num_tmimf: string | null; numeroinscripcion: string | null;
  cve_solicitante: number | null; cve_destinatario: number | null;
  fecha_expedicion: string | null; hora_creacion: string | null;
  status: string | null; cantidad_movilizada: string | null;
  funcionario_nombre: string | null; usuario_nombre: string | null; modulo_nombre: string | null;
}
interface CoprefResponse { fecha_inicio: string; fecha_fin: string; disponible: boolean; rows: CoprefRow[] }

interface ReciboRow {
  folio: string; consecutivo: number | null;
  folio_tmimf: string | null; folio_copref: string | null; numeroinscripcion: string | null;
  fecha: string | null; hora: string | null; status: string | null;
  cantidad: number | null; precio: number; total: number; saldo_al_mov: number;
  tipo_pago: string | null; usuario_nombre: string | null; modulo_nombre: string | null;
}
interface RecibosResponse { fecha_inicio: string; fecha_fin: string; disponible: boolean; rows: ReciboRow[] }

interface ModuloOption { folio: number; nombre: string }

type Tab = 'copref' | 'recibos';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const haceDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

export default function DocumentosPorFechaPage() {
  const { token, user } = useLegacyAuth();

  const [tab, setTab] = useState<Tab>('copref');
  const [fechaInicio, setFechaInicio] = useState<string>(haceDias(30));
  const [fechaFin, setFechaFin] = useState<string>(hoyISO());
  const [moduloFolio, setModulo] = useState<number | null>(null);
  const [soloMios, setSoloMios] = useState<boolean>(false);

  const [modulos, setModulos] = useState<ModuloOption[]>([]);
  const [copref, setCopref] = useState<CoprefResponse | null>(null);
  const [recibos, setRecibos] = useState<RecibosResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ fecha_inicio: fechaInicio, fecha_fin: fechaFin });
      if (moduloFolio !== null) qs.set('modulo_folio', String(moduloFolio));
      if (soloMios && user?.id) qs.set('usuario_clave', String(user.id));
      const h = { Authorization: `Bearer ${token}` };
      const [r1, r2] = await Promise.all([
        fetch(`${API_BASE}/legacy/reportes/documentos/copref?${qs.toString()}`, { headers: h }),
        fetch(`${API_BASE}/legacy/reportes/documentos/recibos?${qs.toString()}`, { headers: h }),
      ]);
      if (!r1.ok || !r2.ok) throw new Error('Error al cargar');
      setCopref(await r1.json());
      setRecibos(await r2.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setLoading(false); }
  };

  const kpis: KpiItem[] = useMemo(() => {
    const out: KpiItem[] = [];
    if (copref) out.push({ label: 'COPREF', value: copref.rows.length, hint: copref.disponible ? undefined : 'no disponible', icon: 'description', tone: 'amber' });
    if (recibos) {
      const total = recibos.rows.reduce((acc, r) => acc + r.total, 0);
      out.push({ label: 'Recibos', value: recibos.rows.length, hint: recibos.disponible ? undefined : 'no disponible', icon: 'payments', tone: 'amber' });
      if (recibos.disponible && recibos.rows.length > 0) {
        out.push({ label: 'Importe recibos', value: total.toLocaleString('es-MX', { maximumFractionDigits: 2 }), icon: 'attach_money', tone: 'emerald' });
      }
    }
    return out;
  }, [copref, recibos]);

  const colsCopref: ExportColumn<CoprefRow>[] = useMemo(() => [
    { header: 'Folio',          key: 'folio',              width: 14 },
    { header: 'TMIMF ref.',     key: 'num_tmimf',          width: 14 },
    { header: 'Inscripción',    key: 'numeroinscripcion',  width: 18 },
    { header: 'Fecha',          key: 'fecha_expedicion',   format: 'date' },
    { header: 'Hora',           key: 'hora_creacion',      width: 9 },
    { header: 'Status',         key: 'status',             width: 7 },
    { header: 'Cantidad mov.',  key: 'cantidad_movilizada', width: 14 },
    { header: 'Funcionario',    key: 'funcionario_nombre', width: 24 },
    { header: 'Usuario',        key: 'usuario_nombre',     width: 22 },
    { header: 'Módulo',         key: 'modulo_nombre',      width: 16 },
  ], []);

  const colsRecibos: ExportColumn<ReciboRow>[] = useMemo(() => [
    { header: 'Folio',         key: 'folio',             width: 14 },
    { header: 'TMIMF ref.',    key: 'folio_tmimf',       width: 14 },
    { header: 'COPREF ref.',   key: 'folio_copref',      width: 14 },
    { header: 'Inscripción',   key: 'numeroinscripcion', width: 18 },
    { header: 'Fecha',         key: 'fecha',             format: 'date' },
    { header: 'Hora',          key: 'hora',              width: 9 },
    { header: 'Status',        key: 'status',            width: 7 },
    { header: 'Cantidad',      key: 'cantidad',          format: 'integer' },
    { header: 'Precio',        key: 'precio',            format: 'currency' },
    { header: 'Total',         key: 'total',             format: 'currency', totals: 'sum' },
    { header: 'Saldo al mov.', key: 'saldo_al_mov',      format: 'decimal' },
    { header: 'Tipo pago',     key: 'tipo_pago',         width: 10 },
    { header: 'Usuario',       key: 'usuario_nombre',    width: 22 },
    { header: 'Módulo',        key: 'modulo_nombre',     width: 16 },
  ], []);

  const stamp = new Date().toISOString().slice(0, 10);
  const subtitleBase = `${fechaInicio} a ${fechaFin}${moduloFolio !== null ? ` · módulo ${modulos.find((m) => m.folio === moduloFolio)?.nombre ?? moduloFolio}` : ''}`;

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="description"
        title="Documentos por fecha"
        subtitle="COPREF y recibos (facturas) en rango de fechas, con filtros por módulo y usuario."
        estado={user?.nombre_estado}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <label htmlFor="fi" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Desde</label>
            <input id="fi" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </div>
          <div>
            <label htmlFor="ff" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Hasta</label>
            <input id="ff" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} max={hoyISO()}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
          </div>
          <div>
            <label htmlFor="mod" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Módulo</label>
            <select id="mod" value={moduloFolio ?? ''} onChange={(e) => setModulo(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              <option value="">— Todos —</option>
              {modulos.map((m) => <option key={m.folio} value={m.folio}>{m.nombre}</option>)}
            </select>
          </div>
          <div className="flex items-center">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer mt-5">
              <input type="checkbox" checked={soloMios} onChange={(e) => setSoloMios(e.target.checked)}
                className="size-4 rounded border-slate-300 dark:border-slate-700" />
              Solo mis documentos
            </label>
          </div>
          <button type="button" onClick={generar} disabled={loading}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium inline-flex items-center gap-2 justify-center">
            <Icon name={loading ? 'progress_activity' : 'play_arrow'} className={`text-base ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Generando…' : 'Generar'}
          </button>
        </div>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icon name="error" /> {error}
        </div>
      )}

      {(copref || recibos) && (
        <>
          <KpiBar
            items={kpis}
            trailing={
              tab === 'copref' && copref ? (
                <ExportButton<CoprefRow>
                  filename={`copref_${user?.legacy_db ?? 'legacy'}_${fechaInicio}_${fechaFin}_${stamp}`}
                  title={`COPREF emitidos — ${user?.nombre_estado ?? ''}`}
                  subtitle={subtitleBase}
                  columns={colsCopref}
                  rows={copref.rows}
                />
              ) : tab === 'recibos' && recibos ? (
                <ExportButton<ReciboRow>
                  filename={`recibos_${user?.legacy_db ?? 'legacy'}_${fechaInicio}_${fechaFin}_${stamp}`}
                  title={`Recibos emitidos — ${user?.nombre_estado ?? ''}`}
                  subtitle={subtitleBase}
                  columns={colsRecibos}
                  rows={recibos.rows}
                />
              ) : null
            }
          />

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <nav className="flex gap-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <TabBtn tab="copref" current={tab} setTab={setTab} icon="description"
                label={`COPREF (${copref?.disponible ? copref.rows.length : '—'})`} />
              <TabBtn tab="recibos" current={tab} setTab={setTab} icon="payments"
                label={`Recibos (${recibos?.disponible ? recibos.rows.length : '—'})`} />
            </nav>

            <div className="overflow-x-auto max-h-[60vh]">
              {tab === 'copref' && copref && <TablaCopref data={copref} />}
              {tab === 'recibos' && recibos && <TablaRecibos data={recibos} />}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function TabBtn({ tab, current, setTab, icon, label }: { tab: Tab; current: Tab; setTab: (t: Tab) => void; icon: string; label: string }) {
  const active = tab === current;
  return (
    <button type="button" onClick={() => setTab(tab)}
      className={`px-4 py-3 text-sm font-medium inline-flex items-center gap-2 border-b-2 transition-colors ${
        active ? 'border-amber-600 text-amber-700 dark:text-amber-400 bg-white dark:bg-slate-900'
               : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}>
      <Icon name={icon} className="text-base" />{label}
    </button>
  );
}

function TablaCopref({ data }: { data: CoprefResponse }) {
  if (!data.disponible) return <p className="px-4 py-12 text-center text-slate-500">La tabla `copref` no existe en esta base de datos legacy.</p>;
  if (data.rows.length === 0) return <p className="px-4 py-12 text-center text-slate-500">Sin COPREF emitidos en este rango.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
        <tr>
          <th className="px-3 py-2 text-left">Folio</th>
          <th className="px-3 py-2 text-left">TMIMF ref.</th>
          <th className="px-3 py-2 text-left">Inscripción</th>
          <th className="px-3 py-2 text-left">Fecha · Hora</th>
          <th className="px-3 py-2 text-center">Status</th>
          <th className="px-3 py-2 text-right">Cantidad mov.</th>
          <th className="px-3 py-2 text-left">Funcionario</th>
          <th className="px-3 py-2 text-left">Usuario · Módulo</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((r) => (
          <tr key={r.folio} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td className="px-3 py-2 font-mono text-xs">{r.folio}</td>
            <td className="px-3 py-2 font-mono text-xs">{r.num_tmimf ?? '—'}</td>
            <td className="px-3 py-2 font-mono text-xs">{r.numeroinscripcion ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.fecha_expedicion ?? '—'}<div className="text-slate-500">{r.hora_creacion ?? ''}</div></td>
            <td className="px-3 py-2 text-center">
              <StatusPill status={r.status} />
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-xs">{r.cantidad_movilizada ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.funcionario_nombre ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.usuario_nombre ?? '—'}<div className="text-slate-500">{r.modulo_nombre ?? ''}</div></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaRecibos({ data }: { data: RecibosResponse }) {
  if (!data.disponible) return <p className="px-4 py-12 text-center text-slate-500">La tabla `facturas` no existe en esta base de datos legacy.</p>;
  if (data.rows.length === 0) return <p className="px-4 py-12 text-center text-slate-500">Sin recibos emitidos en este rango.</p>;
  const fmt$ = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
        <tr>
          <th className="px-3 py-2 text-left">Folio</th>
          <th className="px-3 py-2 text-left">TMIMF / COPREF</th>
          <th className="px-3 py-2 text-left">Inscripción</th>
          <th className="px-3 py-2 text-left">Fecha · Hora</th>
          <th className="px-3 py-2 text-center">Status</th>
          <th className="px-3 py-2 text-right">Cant.</th>
          <th className="px-3 py-2 text-right">Total</th>
          <th className="px-3 py-2 text-center">Pago</th>
          <th className="px-3 py-2 text-left">Usuario · Módulo</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((r) => (
          <tr key={r.folio} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td className="px-3 py-2 font-mono text-xs">{r.folio}</td>
            <td className="px-3 py-2 font-mono text-xs">{r.folio_tmimf ?? '—'}<div className="text-slate-500">{r.folio_copref ?? ''}</div></td>
            <td className="px-3 py-2 font-mono text-xs">{r.numeroinscripcion ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.fecha ?? '—'}<div className="text-slate-500">{r.hora ?? ''}</div></td>
            <td className="px-3 py-2 text-center"><StatusPill status={r.status} /></td>
            <td className="px-3 py-2 text-right tabular-nums">{r.cantidad ?? '—'}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt$(r.total)}</td>
            <td className="px-3 py-2 text-center text-xs">{r.tipo_pago ?? '—'}</td>
            <td className="px-3 py-2 text-xs">{r.usuario_nombre ?? '—'}<div className="text-slate-500">{r.modulo_nombre ?? ''}</div></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const cls =
    status === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
    status === 'C' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}>{status ?? '—'}</span>;
}
