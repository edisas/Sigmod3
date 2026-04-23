import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth } from '@/context/LegacyAuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

// ───────────────────────── Types ─────────────────────────

interface PfaConRutasRow { folio: number; nombre: string; inicial: string | null; rutas_count: number }
interface RutaPfaRow     { folio: number; nombre_ruta: string | null; inicial_ruta: string | null; modulo_nombre: string | null }
interface SemanaTmimfRow { no_semana: number; periodo: number | null; semana_label: string; tmimfs: number; muestreos_registrados: number }

interface TmimfOperativa {
  folio_tmimf: string; clave_movilizacion: string;
  numeroinscripcion: string; nombre_huerto: string | null;
  mercado_destino: number | null;
  kg_fruta_muestreada: number; larvas_por_kg_fruta: number;
  muestreos_count: number; frutos_infestados_total: number;
  has_larvas: boolean;
}

interface Identificacion {
  folio?: number;
  especie: number;
  no_larvas: number; larvas1e: number; larvas2e: number; larvas3e: number;
  observaciones: string | null;
}

interface MuestreoRow {
  folio: number; no_muestra: string;
  fecha_muestreo: string | null; fecha_diseccion: string | null;
  no_frutos: number; kgs_muestreados: number; kgs_disectados: number;
  frutos_infestados: number; tipo_colecta: number | null; variedad: number | null;
  identificaciones: Identificacion[];
}

interface TmimfDetalle {
  folio_tmimf: string; clave_movilizacion: string;
  numeroinscripcion: string; nombre_huerto: string | null;
  no_semana: number;
  semana_fecha_inicio: string | null;
  semana_fecha_final: string | null;
  mercado_destino: number | null;
  kg_fruta_muestreada: number; larvas_por_kg_fruta: number;
  variedades_disponibles: { folio: number; descripcion: string }[];
  muestreos: MuestreoRow[];
}

interface CatalogoEspecie  { folio: number; nombre: string }
interface CatalogoVariedad { folio: number; descripcion: string }
interface CatalogoTipo     { folio: number; nombre: string }
interface Catalogos        { especies_mosca: CatalogoEspecie[]; variedades_mango: CatalogoVariedad[]; tipos_colecta: CatalogoTipo[] }

interface PreviewMercado   { cambiara_mercado: boolean; folio_tmimf: string; tmimfs_afectadas: number; mensaje: string }

interface DraftMuestreo {
  fecha_muestreo: string;
  fecha_diseccion: string;
  no_frutos: number;
  kgs_muestreados: number;
  kgs_disectados: number;
  frutos_infestados: number;
  tipo_colecta: number;
  variedad: number | null;
  identificacion: Identificacion;
}

const EMPTY_IDENT: Identificacion = { especie: 0, no_larvas: 0, larvas1e: 0, larvas2e: 0, larvas3e: 0, observaciones: '' };
const emptyDraft = (): DraftMuestreo => ({
  fecha_muestreo: '', fecha_diseccion: '',
  no_frutos: 0, kgs_muestreados: 0, kgs_disectados: 0, frutos_infestados: 0,
  tipo_colecta: 1, variedad: null,
  identificacion: { ...EMPTY_IDENT },
});

interface Toast { kind: 'ok' | 'err' | 'warn'; text: string }

// ───────────────────────── Page ─────────────────────────

export default function CorreccionMuestreosPage() {
  const { token, user } = useLegacyAuth();

  const [pfas, setPfas]       = useState<PfaConRutasRow[]>([]);
  const [rutas, setRutas]     = useState<RutaPfaRow[]>([]);
  const [semanas, setSemanas] = useState<SemanaTmimfRow[]>([]);
  const [tmimfs, setTmimfs]   = useState<TmimfOperativa[]>([]);
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);

  const [pfaId, setPfaId]   = useState<number | null>(null);
  const [rutaId, setRutaId] = useState<number | null>(null);
  const [semana, setSemana] = useState<number | null>(null);

  const [cargando, setCargando] = useState(false);
  const [cargandoTm, setCargandoTm] = useState(false);

  const [expandedFolio, setExpandedFolio] = useState<string | null>(null); // "folio_tmimf|clave_mov"
  const [detalle, setDetalle] = useState<TmimfDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [draft, setDraft] = useState<DraftMuestreo | null>(null); // nuevo muestreo
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const [confirmMercado, setConfirmMercado] = useState<{ preview: PreviewMercado; onConfirm: () => void } | null>(null);

  // ── Carga inicial ──────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    (async () => {
      setCargando(true);
      try {
        const h = { Authorization: `Bearer ${token}` };
        const [pfasRes, catRes] = await Promise.all([
          fetch(`${API_BASE}/legacy/correcciones/pfas-con-rutas`, { headers: h }),
          fetch(`${API_BASE}/legacy/correcciones/muestreo/catalogos`, { headers: h }),
        ]);
        if (pfasRes.ok) setPfas(await pfasRes.json());
        if (catRes.ok)  setCatalogos(await catRes.json());
      } finally { setCargando(false); }
    })();
  }, [token]);

  useEffect(() => {
    if (!token || pfaId === null) { setRutas([]); setRutaId(null); setSemanas([]); setSemana(null); setTmimfs([]); return; }
    (async () => {
      const res = await fetch(`${API_BASE}/legacy/correcciones/rutas-por-pfa?pfa=${pfaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { setRutas(await res.json()); setRutaId(null); setSemanas([]); setSemana(null); setTmimfs([]); }
    })();
  }, [token, pfaId]);

  useEffect(() => {
    if (!token || rutaId === null) { setSemanas([]); setSemana(null); setTmimfs([]); return; }
    (async () => {
      const res = await fetch(`${API_BASE}/legacy/correcciones/muestreo/semanas-con-tmimf-o?ruta=${rutaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { setSemanas(await res.json()); setSemana(null); setTmimfs([]); }
    })();
  }, [token, rutaId]);

  const cargarTmimfs = async () => {
    if (!token || rutaId === null || semana === null) return;
    setCargandoTm(true);
    setExpandedFolio(null); setDetalle(null); setDraft(null);
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/muestreo/tmimfs-sin-muestreo?ruta=${rutaId}&semana=${semana}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudieron cargar las TMIMF');
      setTmimfs(await res.json());
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally { setCargandoTm(false); }
  };
  useEffect(() => { void cargarTmimfs(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [semana]);

  // ── Expand / colapsar ──────────────────────────────────
  const tmimfKey = (t: TmimfOperativa) => `${t.folio_tmimf}|${t.clave_movilizacion}`;

  const toggleExpand = async (t: TmimfOperativa) => {
    const key = tmimfKey(t);
    if (expandedFolio === key) {
      setExpandedFolio(null); setDetalle(null); setDraft(null);
      return;
    }
    setExpandedFolio(key); setDraft(null);
    setCargandoDetalle(true);
    try {
      const res = await fetch(
        `${API_BASE}/legacy/correcciones/muestreo/tmimf-detalle?folio_tmimf=${encodeURIComponent(t.folio_tmimf)}&clave_movilizacion=${encodeURIComponent(t.clave_movilizacion)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('No se pudo cargar detalle');
      setDetalle(await res.json());
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally { setCargandoDetalle(false); }
  };

  // ── Guardar nuevo muestreo ─────────────────────────────
  const postMuestreo = async (confirmar: boolean) => {
    if (!draft || !detalle || !token) return;
    // validación de identificación
    if (draft.frutos_infestados > 0 && draft.identificacion.especie === 0) {
      setToast({ kind: 'err', text: 'Selecciona la especie de larva (frutos_infestados > 0).' });
      return;
    }
    setGuardando(true);
    try {
      const body: Record<string, unknown> = {
        folio_tmimf: detalle.folio_tmimf,
        clave_movilizacion: detalle.clave_movilizacion,
        fecha_muestreo: draft.fecha_muestreo,
        fecha_diseccion: draft.fecha_diseccion || null,
        no_frutos: draft.no_frutos,
        kgs_muestreados: draft.kgs_muestreados,
        kgs_disectados: draft.kgs_disectados,
        frutos_infestados: draft.frutos_infestados,
        tipo_colecta: draft.tipo_colecta,
        variedad: draft.variedad,
        confirmar_cambio_mercado: confirmar,
      };
      if (draft.frutos_infestados > 0) body.identificacion = draft.identificacion;
      const res = await fetch(`${API_BASE}/legacy/correcciones/muestreo/muestreos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        const { detail } = await res.json().catch(() => ({ detail: null }));
        if (detail && typeof detail === 'object') {
          setConfirmMercado({ preview: detail as PreviewMercado, onConfirm: () => void postMuestreo(true) });
          return;
        }
      }
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(typeof detail === 'string' ? detail : 'Error al guardar');
      }
      const result = await res.json();
      setToast({
        kind: 'ok',
        text: `Muestreo ${result.folio} guardado · ${result.cascada.identificacion_creada ? 'id laboratorio creada · ' : ''}${result.cascada.tmimf_mercado_cambiado ? `${result.cascada.tmimf_mercado_cambiado} TMIMF a nacional` : 'sin cambio de mercado'}`,
      });
      setDetalle(result.tmimf);
      setDraft(null);
      setConfirmMercado(null);
      await cargarTmimfs();
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally { setGuardando(false); }
  };

  const deleteMuestreo = async (m: MuestreoRow) => {
    if (!token || !detalle) return;
    if (!confirm(`¿Borrar muestreo ${m.folio}? Se recalculará la TMIMF.`)) return;
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/muestreo/muestreos/${m.folio}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(typeof detail === 'string' ? detail : 'Error al borrar');
      }
      const result = await res.json();
      setToast({ kind: 'ok', text: `Muestreo ${m.folio} eliminado` });
      setDetalle(result.tmimf);
      await cargarTmimfs();
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Error' });
    }
  };

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          Captura de muestreos sobre TMIMF 'O'
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Cuando la TMIMF operativa se emitió sin registrar muestreo en campo —{' '}
          <span className="font-semibold text-amber-700 dark:text-amber-400">{user?.nombre_estado}</span>
        </p>
      </div>

      {/* Selectores */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">1. PFA</label>
            <select
              value={pfaId ?? ''}
              onChange={(e) => setPfaId(e.target.value ? Number(e.target.value) : null)}
              disabled={cargando}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">— Selecciona un PFA —</option>
              {pfas.map((p) => (
                <option key={p.folio} value={p.folio}>
                  {p.inicial ? `${p.inicial} · ` : ''}{p.nombre} — {p.rutas_count} ruta{p.rutas_count !== 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">2. Ruta</label>
            <select
              value={rutaId ?? ''}
              onChange={(e) => setRutaId(e.target.value ? Number(e.target.value) : null)}
              disabled={pfaId === null || rutas.length === 0}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">— Selecciona una ruta —</option>
              {rutas.map((r) => (
                <option key={r.folio} value={r.folio}>
                  {r.inicial_ruta ? `${r.inicial_ruta} · ` : ''}{r.nombre_ruta}
                  {r.modulo_nombre ? ` (${r.modulo_nombre})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">3. Semana con TMIMF 'O'</label>
            <select
              value={semana ?? ''}
              onChange={(e) => setSemana(e.target.value ? Number(e.target.value) : null)}
              disabled={rutaId === null || semanas.length === 0}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">— Selecciona una semana —</option>
              {semanas.map((s) => (
                <option key={s.no_semana} value={s.no_semana}>
                  {s.semana_label} · {s.tmimfs} TMIMFs · {s.muestreos_registrados} con muestreo
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Tabla TMIMFs */}
      {rutaId !== null && semana !== null && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
            <Icon name="assignment" className="text-amber-700 dark:text-amber-400 text-lg" />
            <h2 className="text-sm font-semibold uppercase tracking-wide">{tmimfs.length} TMIMF(s) tipo 'O' en esta semana</h2>
            {cargandoTm && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
                <span className="size-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" /> Cargando...
              </span>
            )}
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 dark:bg-slate-800/30 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Folio TMIMF</th>
                  <th className="px-3 py-2 text-left">Huerto</th>
                  <th className="px-3 py-2 text-left">Nombre</th>
                  <th className="px-3 py-2 text-center">Mercado</th>
                  <th className="px-3 py-2 text-right">Kg muestreados</th>
                  <th className="px-3 py-2 text-right">Frutos inf.</th>
                  <th className="px-3 py-2 text-right">Muestreos</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {tmimfs.map((t) => {
                  const key = tmimfKey(t);
                  const expanded = expandedFolio === key;
                  return (
                    <>
                      <tr key={key} className={`border-t border-slate-100 dark:border-slate-800 ${expanded ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
                        <td className="px-3 py-2 font-mono text-xs">{t.folio_tmimf}</td>
                        <td className="px-3 py-2 font-mono text-xs">{t.numeroinscripcion}</td>
                        <td className="px-3 py-2">{t.nombre_huerto ?? '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                            t.mercado_destino === 1 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' :
                            t.mercado_destino === 2 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30' :
                                                      'bg-slate-200 text-slate-600 dark:bg-slate-700'
                          }`}>
                            {t.mercado_destino === 1 ? 'Exportación' : t.mercado_destino === 2 ? 'Nacional' : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.kg_fruta_muestreada.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {t.frutos_infestados_total > 0 && <Icon name="warning" className="text-rose-500 text-sm align-middle mr-1" />}
                          {t.frutos_infestados_total}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.muestreos_count}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => void toggleExpand(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs"
                          >
                            <Icon name={expanded ? 'expand_less' : (t.muestreos_count > 0 ? 'edit' : 'add')} className="text-sm" />
                            {expanded ? 'Cerrar' : (t.muestreos_count > 0 ? 'Ver/agregar' : 'Capturar muestreo')}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${key}-detalle`}>
                          <td colSpan={8} className="p-0">
                            <ExpandedPanel
                              cargando={cargandoDetalle}
                              detalle={detalle}
                              catalogos={catalogos}
                              draft={draft}
                              setDraft={setDraft}
                              onGuardar={() => void postMuestreo(false)}
                              onBorrar={deleteMuestreo}
                              guardando={guardando}
                              onValidationError={(msg) => setToast({ kind: 'err', text: msg })}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {!cargandoTm && tmimfs.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No hay TMIMF 'O' en esta combinación ruta+semana.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal confirmación cambio mercado */}
      {confirmMercado && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <Icon name="warning" className="text-rose-500 text-2xl" />
              <h2 className="text-base font-semibold">Confirmar cambio de mercado</h2>
            </div>
            <div className="p-5 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <p className="whitespace-pre-wrap">{confirmMercado.preview.mensaje}</p>
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs">
                <strong>{confirmMercado.preview.tmimfs_afectadas}</strong> TMIMF(s) con folio{' '}
                <code>{confirmMercado.preview.folio_tmimf}</code> pasarán a <strong>Nacional (2)</strong>.
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmMercado(null)} disabled={guardando}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">
                Cancelar
              </button>
              <button type="button" onClick={() => confirmMercado.onConfirm()} disabled={guardando}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-60">
                {guardando && <span className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Sí, guardar y cambiar mercado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 max-w-lg p-3 pr-4 rounded-lg shadow-lg border text-sm animate-fade-in flex items-start gap-2 ${
          toast.kind === 'ok'   ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/30' :
          toast.kind === 'warn' ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/30' :
                                   'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-900/30'
        }`}>
          <Icon name={toast.kind === 'ok' ? 'check_circle' : 'error'} className="text-xl shrink-0 mt-0.5" />
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Expanded panel ─────────────────────────

interface ExpandedProps {
  cargando: boolean;
  detalle: TmimfDetalle | null;
  catalogos: Catalogos | null;
  draft: DraftMuestreo | null;
  setDraft: (d: DraftMuestreo | null) => void;
  onGuardar: () => void;
  onBorrar: (m: MuestreoRow) => void;
  guardando: boolean;
  onValidationError: (msg: string) => void;
}

function ExpandedPanel({ cargando, detalle, catalogos, draft, setDraft, onGuardar, onBorrar, guardando, onValidationError }: ExpandedProps) {
  if (cargando) {
    return <div className="p-6 text-center text-sm text-slate-500">Cargando detalle...</div>;
  }
  if (!detalle || !catalogos) return null;

  const especieNombre = (f: number) => catalogos.especies_mosca.find((e) => e.folio === f)?.nombre ?? `#${f}`;
  const variedadNombre = (f: number | null) => f === null ? '—' : catalogos.variedades_mango.find((v) => v.folio === f)?.descripcion ?? `#${f}`;
  const tipoColecta = (f: number | null) => f === null ? '—' : catalogos.tipos_colecta.find((t) => t.folio === f)?.nombre ?? `#${f}`;

  const startNuevo = () => {
    const d = emptyDraft();
    d.variedad = detalle.variedades_disponibles[0]?.folio ?? null;
    setDraft(d);
  };

  return (
    <div className="bg-amber-50/30 dark:bg-amber-900/5 p-5 space-y-4 border-l-4 border-amber-400 dark:border-amber-600">
      {/* Muestreos existentes */}
      {detalle.muestreos.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-400 mb-2">
            Muestreos existentes ({detalle.muestreos.length})
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                <tr>
                  <th className="px-2 py-1.5 text-left">Fecha</th>
                  <th className="px-2 py-1.5 text-left">Dis.</th>
                  <th className="px-2 py-1.5 text-right">Frutos</th>
                  <th className="px-2 py-1.5 text-right">Kg M.</th>
                  <th className="px-2 py-1.5 text-right">Kg D.</th>
                  <th className="px-2 py-1.5 text-right">Inf.</th>
                  <th className="px-2 py-1.5 text-left">Colecta</th>
                  <th className="px-2 py-1.5 text-left">Variedad</th>
                  <th className="px-2 py-1.5 text-left">Identificación</th>
                  <th className="px-2 py-1.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {detalle.muestreos.map((m) => (
                  <tr key={m.folio} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-1.5">{m.fecha_muestreo ?? '—'}</td>
                    <td className="px-2 py-1.5">{m.fecha_diseccion ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m.no_frutos}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m.kgs_muestreados.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m.kgs_disectados.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {m.frutos_infestados > 0
                        ? <span className="font-bold text-rose-600">{m.frutos_infestados}</span>
                        : m.frutos_infestados}
                    </td>
                    <td className="px-2 py-1.5">{tipoColecta(m.tipo_colecta)}</td>
                    <td className="px-2 py-1.5">{variedadNombre(m.variedad)}</td>
                    <td className="px-2 py-1.5 text-[11px]">
                      {m.identificaciones.length > 0
                        ? m.identificaciones.map((i) => `${especieNombre(i.especie)}: ${i.no_larvas}L (${i.larvas1e}/${i.larvas2e}/${i.larvas3e})`).join(', ')
                        : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button type="button" onClick={() => onBorrar(m)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-300 dark:border-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-[11px]">
                        <Icon name="delete" className="text-xs" /> Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            TMIMF consolidada: <strong>{detalle.kg_fruta_muestreada.toFixed(2)}</strong> kg / <strong>{detalle.larvas_por_kg_fruta}</strong> larvas por kg
          </p>
        </div>
      )}

      {/* Botón agregar nuevo */}
      {!draft ? (
        <button type="button" onClick={startNuevo}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold">
          <Icon name="add_circle" className="text-base" /> Agregar nuevo muestreo
        </button>
      ) : (
        <DraftForm
          draft={draft} setDraft={setDraft}
          catalogos={catalogos}
          variedadesHuerto={detalle.variedades_disponibles}
          semanaInicio={detalle.semana_fecha_inicio}
          semanaFin={detalle.semana_fecha_final}
          onCancel={() => setDraft(null)}
          onGuardar={onGuardar}
          guardando={guardando}
          onValidationError={onValidationError}
        />
      )}
    </div>
  );
}

// ───────────────────────── Draft form ─────────────────────────

interface DraftFormProps {
  draft: DraftMuestreo;
  setDraft: (d: DraftMuestreo) => void;
  catalogos: Catalogos;
  variedadesHuerto: { folio: number; descripcion: string }[];
  semanaInicio: string | null;
  semanaFin: string | null;
  onCancel: () => void;
  onGuardar: () => void;
  guardando: boolean;
  onValidationError: (msg: string) => void;
}

function DraftForm({ draft, setDraft, catalogos, variedadesHuerto, semanaInicio, semanaFin, onCancel, onGuardar, guardando, onValidationError }: DraftFormProps) {
  const variedadesLista = variedadesHuerto.length > 0 ? variedadesHuerto : catalogos.variedades_mango;
  const fechaFueraDeSemana =
    !!draft.fecha_muestreo && !!semanaInicio && !!semanaFin &&
    (draft.fecha_muestreo < semanaInicio || draft.fecha_muestreo > semanaFin);

  const handleGuardar = () => {
    if (!draft.fecha_muestreo) {
      onValidationError('Captura la fecha de muestreo.');
      return;
    }
    if (fechaFueraDeSemana) {
      onValidationError(`La fecha ${draft.fecha_muestreo} está fuera de la semana de la TMIMF (${semanaInicio} a ${semanaFin}).`);
      return;
    }
    onGuardar();
  };

  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Nuevo muestreo</h3>
        <button type="button" onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-700">
          <Icon name="close" className="text-sm" /> Cancelar
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Field label="Fecha muestreo">
          <input
            type="date"
            value={draft.fecha_muestreo}
            min={semanaInicio ?? undefined}
            max={semanaFin ?? undefined}
            onChange={(e) => setDraft({ ...draft, fecha_muestreo: e.target.value })}
            className={`w-full px-2 py-1 rounded border bg-white dark:bg-slate-800 ${
              fechaFueraDeSemana ? 'border-rose-400 dark:border-rose-600' : 'border-slate-200 dark:border-slate-700'
            }`}
          />
          {semanaInicio && semanaFin && (
            <span className={`text-[10px] mt-0.5 ${fechaFueraDeSemana ? 'text-rose-600' : 'text-slate-500'}`}>
              {fechaFueraDeSemana ? '⚠ fuera de rango ' : 'Rango semana: '}
              {semanaInicio} → {semanaFin}
            </span>
          )}
        </Field>
        <Field label="Fecha disección">
          <input type="date" value={draft.fecha_diseccion} onChange={(e) => setDraft({ ...draft, fecha_diseccion: e.target.value })}
            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
        </Field>
        <Field label="Tipo colecta">
          <select value={draft.tipo_colecta} onChange={(e) => setDraft({ ...draft, tipo_colecta: Number(e.target.value) })}
            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            {catalogos.tipos_colecta.map((t) => <option key={t.folio} value={t.folio}>{t.nombre}</option>)}
          </select>
        </Field>
        <Field label="Variedad">
          <select value={draft.variedad ?? ''} onChange={(e) => setDraft({ ...draft, variedad: e.target.value ? Number(e.target.value) : null })}
            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <option value="">—</option>
            {variedadesLista.map((v) => <option key={v.folio} value={v.folio}>{v.descripcion}</option>)}
          </select>
        </Field>
        <Field label="No. frutos"><NumInput v={draft.no_frutos} onChange={(v) => setDraft({ ...draft, no_frutos: v })} /></Field>
        <Field label="Kg muestreados"><NumInput v={draft.kgs_muestreados} decimal onChange={(v) => setDraft({ ...draft, kgs_muestreados: v })} /></Field>
        <Field label="Kg disectados"><NumInput v={draft.kgs_disectados} decimal onChange={(v) => setDraft({ ...draft, kgs_disectados: v })} /></Field>
        <Field label="Frutos infestados"><NumInput v={draft.frutos_infestados} onChange={(v) => setDraft({ ...draft, frutos_infestados: v })} /></Field>
      </div>

      {draft.frutos_infestados > 0 && (
        <div className="p-3 rounded-lg bg-rose-50/50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 space-y-3">
          <div className="flex items-center gap-2">
            <Icon name="bug_report" className="text-rose-600 text-sm" />
            <span className="text-xs font-semibold text-rose-800 dark:text-rose-300 uppercase tracking-wider">
              Identificación de larvas (obligatorio)
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <Field label="Especie">
              <select value={draft.identificacion.especie}
                onChange={(e) => setDraft({ ...draft, identificacion: { ...draft.identificacion, especie: Number(e.target.value) } })}
                className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <option value={0}>— Selecciona —</option>
                {catalogos.especies_mosca.map((e) => <option key={e.folio} value={e.folio}>{e.nombre}</option>)}
              </select>
            </Field>
            <Field label="Total larvas"><NumInput v={draft.identificacion.no_larvas} onChange={(v) => setDraft({ ...draft, identificacion: { ...draft.identificacion, no_larvas: v } })} /></Field>
            <Field label="Estadio 1"><NumInput v={draft.identificacion.larvas1e} onChange={(v) => setDraft({ ...draft, identificacion: { ...draft.identificacion, larvas1e: v } })} /></Field>
            <Field label="Estadio 2"><NumInput v={draft.identificacion.larvas2e} onChange={(v) => setDraft({ ...draft, identificacion: { ...draft.identificacion, larvas2e: v } })} /></Field>
            <Field label="Estadio 3"><NumInput v={draft.identificacion.larvas3e} onChange={(v) => setDraft({ ...draft, identificacion: { ...draft.identificacion, larvas3e: v } })} /></Field>
          </div>
          <Field label="Observaciones">
            <input type="text" value={draft.identificacion.observaciones ?? ''} maxLength={200}
              onChange={(e) => setDraft({ ...draft, identificacion: { ...draft.identificacion, observaciones: e.target.value } })}
              className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs" />
          </Field>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleGuardar}
          disabled={guardando || !draft.fecha_muestreo || draft.kgs_muestreados <= 0 || fechaFueraDeSemana}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60"
          title={fechaFueraDeSemana ? 'Fecha fuera de la semana de la TMIMF' : undefined}
        >
          {guardando && <span className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          <Icon name="save" className="text-base" /> Guardar muestreo
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function NumInput({ v, decimal = false, onChange }: { v: number; decimal?: boolean; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      step={decimal ? 0.01 : 1}
      value={v}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-right tabular-nums"
    />
  );
}
