import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

interface PfaInfo { folio: number; nombre: string | null; cedula: string | null; inicial: string | null }

interface HuertoLite {
  numeroinscripcion: string;
  nombre_unidad: string | null;
  nombre_propietario: string | null;
  nombre_ruta: string | null;
}

interface EstimadoVariedad {
  variedad_folio: number; variedad_nombre: string;
  existe: boolean;
  estimado_actual: number; saldo_actual: number; superficie: number;
  progresivo_estimacion: number | null; fecha_estimacion: string | null;
  total_movilizado: number;
}

interface HuertoEdicionResponse {
  huerto: { numeroinscripcion: string; nombre_unidad: string | null; nombre_propietario: string | null;
            folio_ruta: number | null; nombre_ruta: string | null;
            clave_pfa: number | null; pfa_nombre: string | null };
  variedades: EstimadoVariedad[];
}

interface CambioResultado {
  variedad_folio: number; variedad_nombre: string | null;
  operacion: string;
  estimado_anterior: number | null; saldo_anterior: number | null;
  cantidad: number;
  estimado_nuevo: number; saldo_nuevo: number; progresivo_nuevo: number;
}
interface ReestimarResult { numeroinscripcion: string; cambios: CambioResultado[] }

interface Toast { kind: 'ok' | 'err'; text: string }

const fmt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 });

export default function EditarEstimadoCosechaPage() {
  const { token, user } = useLegacyAuth();

  const [pfas, setPfas] = useState<PfaInfo[]>([]);
  const [pfaFolio, setPfaFolio] = useState<number | null>(null);
  const [huertos, setHuertos] = useState<HuertoLite[]>([]);
  const [huertoSel, setHuertoSel] = useState<string>('');
  const [data, setData] = useState<HuertoEdicionResponse | null>(null);
  const [ajustes, setAjustes] = useState<Record<number, { cantidad: string; superficie: string }>>({});
  const [confirmAplicar, setConfirmAplicar] = useState(false);

  const [loadingPfas, setLoadingPfas] = useState(true);
  const [loadingHuertos, setLoadingHuertos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [resultado, setResultado] = useState<ReestimarResult | null>(null);

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

  const cargarHuertos = useCallback(async () => {
    if (!token || pfaFolio === null) { setHuertos([]); setHuertoSel(''); return; }
    setLoadingHuertos(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/reportes/inventario-pfa?pfa=${pfaFolio}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const inv = await res.json();
        const seen = new Set<string>();
        const list: HuertoLite[] = [];
        for (const h of inv.huertos as HuertoLite[]) {
          if (seen.has(h.numeroinscripcion)) continue;
          seen.add(h.numeroinscripcion);
          list.push(h);
        }
        list.sort((a, b) => a.numeroinscripcion.localeCompare(b.numeroinscripcion));
        setHuertos(list);
        setHuertoSel('');
        setData(null);
      }
    } finally { setLoadingHuertos(false); }
  }, [token, pfaFolio]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarHuertos(); }, [cargarHuertos]);

  const cargarEstado = async (numeroinscripcion: string) => {
    if (!token || !numeroinscripcion) return;
    setLoading(true); setResultado(null); setAjustes({}); setConfirmAplicar(false);
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/estimado-cosecha/huerto/${encodeURIComponent(numeroinscripcion)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally { setLoading(false); }
  };

  const setAjuste = (variedad: number, key: 'cantidad' | 'superficie', valor: string) => {
    setAjustes((prev) => ({ ...prev, [variedad]: { ...prev[variedad] ?? { cantidad: '', superficie: '' }, [key]: valor } }));
  };

  const ajustesValidos = Object.entries(ajustes)
    .map(([v, a]) => ({ variedad_folio: Number(v), cantidad: parseFloat(a.cantidad), superficie: a.superficie ? parseFloat(a.superficie) : undefined }))
    .filter((a) => Number.isFinite(a.cantidad) && a.cantidad > 0);

  const aplicar = async () => {
    if (!token || !data || ajustesValidos.length === 0) return;
    if (!confirmAplicar) {
      setToast({ kind: 'err', text: 'Confirma antes de aplicar.' });
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/estimado-cosecha/reestimar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroinscripcion: data.huerto.numeroinscripcion, ajustes: ajustesValidos }),
      });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(typeof detail === 'string' ? detail : 'Error al guardar');
      }
      const r = await res.json() as ReestimarResult;
      setResultado(r);
      setAjustes({});
      setConfirmAplicar(false);
      setToast({ kind: 'ok', text: `${r.cambios.length} variedad(es) actualizadas en ${r.numeroinscripcion}.` });
      // Recargar el estado para mostrar los nuevos saldos
      await cargarEstado(data.huerto.numeroinscripcion);
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally { setGuardando(false); }
  };

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="eco"
        title="Edición de estimados de cosecha"
        subtitle="Captura re-estimaciones por huerto y variedad. Cada cambio se versiona en bitácora."
        estado={user?.nombre_estado}
      />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pfa" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              1. PFA
            </label>
            <select id="pfa" value={pfaFolio ?? ''} onChange={(e) => setPfaFolio(e.target.value ? Number(e.target.value) : null)}
              disabled={loadingPfas || pfas.length === 0}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              {loadingPfas && <option>Cargando…</option>}
              {!loadingPfas && pfas.length === 0 && <option>Sin PFAs</option>}
              {pfas.map((p) => <option key={p.folio} value={p.folio}>{p.inicial ? `${p.inicial} · ` : ''}{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="huerto" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              2. Huerto
            </label>
            <select id="huerto" value={huertoSel} onChange={(e) => { setHuertoSel(e.target.value); if (e.target.value) void cargarEstado(e.target.value); }}
              disabled={loadingHuertos || huertos.length === 0}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono">
              <option value="">— Selecciona huerto —</option>
              {huertos.map((h) => <option key={h.numeroinscripcion} value={h.numeroinscripcion}>{h.numeroinscripcion} · {h.nombre_unidad ?? '—'}</option>)}
            </select>
          </div>
        </div>
      </section>

      {loading && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-500 inline-flex items-center gap-2">
          <Icon name="progress_activity" className="animate-spin" /> Cargando huerto…
        </div>
      )}

      {data && (
        <>
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-sm">
              <Item label="Inscripción" value={data.huerto.numeroinscripcion} mono />
              <Item label="Huerto" value={data.huerto.nombre_unidad ?? '—'} />
              <Item label="Propietario" value={data.huerto.nombre_propietario ?? '—'} />
              <Item label="Ruta" value={data.huerto.nombre_ruta ?? '—'} />
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
              <Icon name="eco" className="text-amber-700 dark:text-amber-400 text-lg" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                Variedades — {data.variedades.filter((v) => v.existe).length} con estimado · {data.variedades.length} en catálogo
              </h2>
              {ajustesValidos.length > 0 && (
                <span className="ml-auto text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold">
                  {ajustesValidos.length} ajuste(s) pendiente(s)
                </span>
              )}
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2 text-left">Variedad</th>
                    <th className="px-3 py-2 text-right">Estimado actual</th>
                    <th className="px-3 py-2 text-right">Saldo actual</th>
                    <th className="px-3 py-2 text-right">Movilizado</th>
                    <th className="px-3 py-2 text-center">Última est.</th>
                    <th className="px-3 py-2 text-right">+ Cantidad (kg)</th>
                    <th className="px-3 py-2 text-right">+ Superficie (ha)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.variedades.map((v) => {
                    const ajuste = ajustes[v.variedad_folio];
                    const tieneAjuste = ajuste && parseFloat(ajuste.cantidad) > 0;
                    return (
                      <tr key={v.variedad_folio} className={`border-t border-slate-100 dark:border-slate-800 ${
                        v.existe ? '' : 'bg-slate-50/50 dark:bg-slate-800/20'
                      } ${tieneAjuste ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{v.variedad_nombre}</div>
                          {!v.existe && <div className="text-[10px] text-slate-500">sin estimado</div>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{v.existe ? fmt(v.estimado_actual) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{v.existe ? fmt(v.saldo_actual) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmt(v.total_movilizado)}</td>
                        <td className="px-3 py-2 text-center text-xs">{v.fecha_estimacion ?? '—'}{v.progresivo_estimacion ? ` · #${v.progresivo_estimacion}` : ''}</td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" min="0" step="0.01" value={ajuste?.cantidad ?? ''}
                            onChange={(e) => setAjuste(v.variedad_folio, 'cantidad', e.target.value)}
                            className="w-28 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-right tabular-nums" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" min="0" step="0.01" value={ajuste?.superficie ?? ''}
                            disabled={v.existe}
                            placeholder={v.existe ? '—' : '0.00'}
                            onChange={(e) => setAjuste(v.variedad_folio, 'superficie', e.target.value)}
                            title={v.existe ? 'La superficie solo se captura al crear el estimado por primera vez' : undefined}
                            className="w-24 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-right tabular-nums disabled:opacity-50" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {ajustesValidos.length > 0 && (
            <section className="rounded-xl border-2 border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-5 space-y-3">
              <div className="flex items-start gap-2">
                <Icon name="info" className="text-amber-600 dark:text-amber-400 text-xl mt-0.5" />
                <div className="flex-1 text-sm">
                  <strong>{ajustesValidos.length} variedad(es)</strong> recibirán nueva estimación. Por cada una:
                  <ul className="list-disc list-inside mt-1 text-xs space-y-0.5 text-slate-700 dark:text-slate-300">
                    <li>Si ya tenía estimado → snapshot a bitácora + suma cantidad al estimado y saldo (progresivo +1)</li>
                    <li>Si no → INSERT con cantidad como estimado y saldo iniciales, progresivo=1</li>
                  </ul>
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={confirmAplicar} onChange={(e) => setConfirmAplicar(e.target.checked)}
                  className="size-4 rounded border-slate-300 dark:border-slate-700 mt-0.5" />
                <span>Confirmo aplicar los {ajustesValidos.length} ajuste(s) al huerto <span className="font-mono">{data.huerto.numeroinscripcion}</span>.</span>
              </label>
              <button type="button" onClick={aplicar}
                disabled={guardando || !confirmAplicar || ajustesValidos.length === 0}
                className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 dark:disabled:bg-amber-900 text-white text-sm font-semibold inline-flex items-center gap-2">
                <Icon name={guardando ? 'progress_activity' : 'save'} className={`text-base ${guardando ? 'animate-spin' : ''}`} />
                {guardando ? 'Aplicando…' : `Aplicar ${ajustesValidos.length} ajuste(s)`}
              </button>
            </section>
          )}
        </>
      )}

      {resultado && (
        <section className="rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
            <Icon name="check_circle" className="text-2xl" />
            <h2 className="text-lg font-semibold">{resultado.cambios.length} variedad(es) actualizadas</h2>
          </div>
          <div className="overflow-x-auto rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="bg-emerald-100 dark:bg-emerald-950/50 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Variedad</th>
                  <th className="px-3 py-2 text-center">Op</th>
                  <th className="px-3 py-2 text-right">Estimado anterior</th>
                  <th className="px-3 py-2 text-right">+ Agregado</th>
                  <th className="px-3 py-2 text-right">Estimado nuevo</th>
                  <th className="px-3 py-2 text-right">Saldo nuevo</th>
                  <th className="px-3 py-2 text-center">#</th>
                </tr>
              </thead>
              <tbody>
                {resultado.cambios.map((c) => (
                  <tr key={c.variedad_folio} className="border-t border-emerald-100 dark:border-emerald-900">
                    <td className="px-3 py-2">{c.variedad_nombre ?? `#${c.variedad_folio}`}</td>
                    <td className="px-3 py-2 text-center"><span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${c.operacion === 'insert' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{c.operacion}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.estimado_anterior !== null ? fmt(c.estimado_anterior) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">+{fmt(c.cantidad)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{fmt(c.estimado_nuevo)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(c.saldo_nuevo)}</td>
                    <td className="px-3 py-2 text-center">{c.progresivo_nuevo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 max-w-lg p-3 pr-4 rounded-lg shadow-lg border text-sm flex items-start gap-2 ${
          toast.kind === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-200'
                              : 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-900/30 dark:border-rose-700 dark:text-rose-200'
        }`} onClick={() => setToast(null)}>
          <Icon name={toast.kind === 'ok' ? 'check_circle' : 'error'} className="text-xl shrink-0 mt-0.5" />
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
