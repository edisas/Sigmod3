import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

interface DetalleRow {
  folio: number; sub_folio: string | null; cantidad_movilizada: number;
  variedad_folio: number | null; variedad_nombre: string | null;
  placas: string | null; saldo_estimado_actual: number | null; status: string | null;
}

interface TmimfPreview {
  folio_tmimf: string;
  status: string | null; tipo_tarjeta: string | null;
  numeroinscripcion: string;
  nombre_unidad: string | null; nombre_propietario: string | null; nombre_ruta: string | null;
  fecha_emision: string | null; hora_emision: string | null;
  clave_movilizacion: string | null;
  usuario_generador_nombre: string | null;
  fecha_verifico_normex: string | null;
  cancelable: boolean; motivo_no_cancelable: string | null;
  detalles: DetalleRow[];
  total_kg_a_devolver: number;
}

interface CambioEstimado {
  numeroinscripcion: string; variedad_folio: number; variedad_nombre: string | null;
  saldo_anterior: number; cantidad_devuelta: number; saldo_nuevo: number;
}

interface CancelarResult {
  folio_tmimf: string; cancelado_en: string;
  renglones_cancelados: number; saldos_devueltos: CambioEstimado[];
}

interface Toast { kind: 'ok' | 'err'; text: string }

const fmt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 });

export default function CancelacionTmimfPage() {
  const { token, user } = useLegacyAuth();
  const [folio, setFolio] = useState<string>('');
  const [preview, setPreview] = useState<TmimfPreview | null>(null);
  const [motivo, setMotivo] = useState<string>('');
  const [confirmar, setConfirmar] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [result, setResult] = useState<CancelarResult | null>(null);

  const reset = () => {
    setPreview(null); setMotivo(''); setConfirmar(false);
    setError(''); setResult(null);
  };

  const buscar = async () => {
    if (!token || !folio.trim()) return;
    setLoading(true); setError(''); setPreview(null); setResult(null);
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/cancelacion-tmimf/buscar?folio_tmimf=${encodeURIComponent(folio.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        setError(`No existe TMIMF con folio ${folio.trim()} en ${user?.nombre_estado}.`);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPreview(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setLoading(false); }
  };

  const cancelar = async () => {
    if (!token || !preview || !preview.cancelable) return;
    if (motivo.trim().length < 10) {
      setToast({ kind: 'err', text: 'Motivo requerido (mínimo 10 caracteres).' });
      return;
    }
    setCancelando(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/cancelacion-tmimf/cancelar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ folio_tmimf: preview.folio_tmimf, motivo: motivo.trim() }),
      });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(typeof detail === 'string' ? detail : 'Error al cancelar');
      }
      const data = await res.json() as CancelarResult;
      setResult(data);
      setPreview(null);
      setConfirmar(false);
      setToast({ kind: 'ok', text: `TMIMF ${data.folio_tmimf} cancelada · ${data.renglones_cancelados} renglones · ${data.saldos_devueltos.length} saldos devueltos.` });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally { setCancelando(false); }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void buscar();
  };

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="cancel"
        title="Cancelación de TMIMF"
        subtitle="Cancela una tarjeta de movilización (tipo M). Devuelve la cantidad movilizada al saldo del estimado de cosecha."
        estado={user?.nombre_estado}
      />

      {/* Búsqueda */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <label htmlFor="folio" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
          Folio TMIMF a cancelar
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Icon name="receipt" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none" />
            <input id="folio" type="text" value={folio} onChange={(e) => { setFolio(e.target.value); reset(); }} onKeyDown={onKey}
              placeholder="ej. APT012907-1"
              className="w-full pl-10 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono" />
          </div>
          <button type="button" onClick={buscar} disabled={loading || !folio.trim()}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium inline-flex items-center gap-2">
            <Icon name={loading ? 'progress_activity' : 'search'} className={`text-base ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Solo se cancelan TMIMF tipo M (Movilización), status='A' y sin verificación en empaque.
        </p>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icon name="error" /> {error}
        </div>
      )}

      {/* Resultado de cancelación reciente */}
      {result && (
        <section className="rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
            <Icon name="check_circle" className="text-2xl" />
            <h2 className="text-lg font-semibold">TMIMF {result.folio_tmimf} cancelada</h2>
          </div>
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Renglones cancelados: <strong>{result.renglones_cancelados}</strong> · Saldos devueltos:{' '}
            <strong>{result.saldos_devueltos.length}</strong> · {result.cancelado_en}
          </p>
          {result.saldos_devueltos.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900">
              <table className="w-full text-sm">
                <thead className="bg-emerald-100 dark:bg-emerald-950/50 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left">Inscripción · Variedad</th>
                    <th className="px-3 py-2 text-right">Saldo anterior</th>
                    <th className="px-3 py-2 text-right">Devuelto</th>
                    <th className="px-3 py-2 text-right">Saldo nuevo</th>
                  </tr>
                </thead>
                <tbody>
                  {result.saldos_devueltos.map((s, i) => (
                    <tr key={i} className="border-t border-emerald-100 dark:border-emerald-900">
                      <td className="px-3 py-2"><div className="font-mono text-xs">{s.numeroinscripcion}</div><div className="text-xs text-slate-500">{s.variedad_nombre ?? `#${s.variedad_folio}`}</div></td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(s.saldo_anterior)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">+{fmt(s.cantidad_devuelta)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{fmt(s.saldo_nuevo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Preview de la TMIMF a cancelar */}
      {preview && (
        <>
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
              <Icon name="receipt_long" className="text-amber-700 dark:text-amber-400 text-lg" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">Datos de la TMIMF</h2>
              <span className="ml-auto font-mono text-sm">{preview.folio_tmimf}</span>
              <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                preview.status === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
                preview.status === 'C' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                                         'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}>{preview.status ?? '—'}</span>
            </header>
            <div className="p-5">
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-sm">
                <Item label="Inscripción" value={preview.numeroinscripcion} mono />
                <Item label="Huerto" value={preview.nombre_unidad ?? '—'} />
                <Item label="Propietario" value={preview.nombre_propietario ?? '—'} />
                <Item label="Ruta" value={preview.nombre_ruta ?? '—'} />
                <Item label="Tipo" value={preview.tipo_tarjeta ?? '—'} />
                <Item label="Fecha emisión" value={preview.fecha_emision ?? '—'} hint={preview.hora_emision ?? undefined} />
                <Item label="Clave movilización" value={preview.clave_movilizacion ?? '—'} />
                <Item label="Usuario generador" value={preview.usuario_generador_nombre ?? '—'} />
              </dl>
            </div>
          </section>

          {/* Renglones */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
              <Icon name="list_alt" className="text-amber-700 dark:text-amber-400 text-lg" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                Renglones a cancelar ({preview.detalles.length})
              </h2>
              <span className="ml-auto text-sm">
                Total a devolver: <strong className="text-amber-700 dark:text-amber-400">{fmt(preview.total_kg_a_devolver)} kg</strong>
              </span>
            </header>
            <div className="overflow-x-auto">
              {preview.detalles.length === 0 ? (
                <p className="px-4 py-8 text-center text-slate-500">Sin renglones registrados.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Renglón</th>
                      <th className="px-3 py-2 text-left">Variedad</th>
                      <th className="px-3 py-2 text-right">Cantidad kg</th>
                      <th className="px-3 py-2 text-right">Saldo actual estimado</th>
                      <th className="px-3 py-2 text-left">Placas</th>
                      <th className="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.detalles.map((d) => (
                      <tr key={d.folio} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2 font-mono text-xs">{d.folio}{d.sub_folio ? `-${d.sub_folio}` : ''}</td>
                        <td className="px-3 py-2 text-xs">{d.variedad_nombre ?? `#${d.variedad_folio ?? '—'}`}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(d.cantidad_movilizada)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{d.saldo_estimado_actual !== null ? fmt(d.saldo_estimado_actual) : '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{d.placas ?? '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            d.status === 'C' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                                               'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          }`}>{d.status ?? 'A'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Acción */}
          {!preview.cancelable ? (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <Icon name="block" /> {preview.motivo_no_cancelable ?? 'No se puede cancelar.'}
            </div>
          ) : (
            <section className="rounded-xl border-2 border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-5 space-y-3">
              <div className="flex items-start gap-2">
                <Icon name="warning" className="text-rose-600 dark:text-rose-400 text-2xl mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-rose-800 dark:text-rose-200">Esta acción cancela la TMIMF y devuelve los kg al estimado de cosecha.</h3>
                  <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">
                    Operación irreversible — el registro queda con status='C' y se audita en V3.
                  </p>
                </div>
              </div>
              <div>
                <label htmlFor="motivo" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
                  Motivo de la cancelación (mín. 10 caracteres)
                </label>
                <textarea id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={200}
                  placeholder="Ej. Solicitud del propietario por cambio de mercado destino…"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
                <p className="text-[11px] text-slate-500 mt-1">{motivo.length} / 200</p>
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)}
                  className="size-4 rounded border-slate-300 dark:border-slate-700 mt-0.5" />
                <span>Confirmo que entiendo el impacto y deseo cancelar la TMIMF <span className="font-mono">{preview.folio_tmimf}</span>.</span>
              </label>
              <button type="button" onClick={cancelar}
                disabled={cancelando || !confirmar || motivo.trim().length < 10}
                className="px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 dark:disabled:bg-rose-900 text-white text-sm font-semibold inline-flex items-center gap-2">
                <Icon name={cancelando ? 'progress_activity' : 'cancel'} className={`text-base ${cancelando ? 'animate-spin' : ''}`} />
                {cancelando ? 'Cancelando…' : 'Cancelar TMIMF'}
              </button>
            </section>
          )}
        </>
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

function Item({ label, value, hint, mono }: { label: string; value: string; hint?: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`text-sm font-medium text-slate-900 dark:text-slate-100 ${mono ? 'font-mono' : ''}`}>{value}</dd>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}
