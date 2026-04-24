import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useLegacyAuth } from '@/context/LegacyAuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

// ───────────────────────── Types ─────────────────────────

interface PfaRow { folio: number; nombre: string; inicial: string | null; rutas_count: number }

interface GapRow {
  numeroinscripcion: string;
  no_semana: number;
  semana_label: string;
  fecha_revision_max: string | null;
  trampas_instaladas: number;
  trampas_revisadas: number;
  revisiones_pendientes_validar: number;
  revisiones_con_captura: number;
  capturas_sin_identificacion: number;
  trampas_incompletas: number;
  pfa_nombre: string | null;
  ruta_nombre: string | null;
  modulo_nombre: string | null;
}

interface GapsPage {
  total: number;
  offset: number;
  limit: number;
  rows: GapRow[];
}

interface GateStatus {
  fecha_revision_ok: boolean;
  trampas_todas_validadas: boolean;
  capturas_todas_identificadas: boolean;
  sin_trampas_incompletas: boolean;
  tiene_control_quimico: boolean;
  tiene_control_mecanico: boolean;
  tiene_muestreo_frutos: boolean;
}

interface CalculosTmimf {
  fecha_revision: string | null;
  mtd_ludens: number; mtd_obliqua: number; mtd_striata: number; mtd_serpentina: number;
  mtd_promedio_semanal: number;
  trampas_instaladas: number; trampas_revisadas: number; porcentaje_trampas_rev: number;
  dias_exposicion_prom: number;
  superficie_asperjada: number; litros_mezcla_asperjada: number;
  kg_fruta_destruida: number; otros_controles: string | null;
  kg_fruta_muestreada: number; larvas_por_kg_fruta: number;
}

interface MetaTmimf {
  folio_ruta: number | null;
  clave_pfa: number | null;
  pfa_nombre: string | null;
  modulo_folio: number | null;
  modulo_nombre: string | null;
}

interface PreviewResult {
  numeroinscripcion: string;
  no_semana: number;
  semana_label: string;
  puede_cerrar: boolean;
  gates: GateStatus;
  calculos: CalculosTmimf;
  meta: MetaTmimf;
}

const PAGE_SIZE = 50;

// ───────────────────────── Page ─────────────────────────

export default function CorreccionTmimfOFaltantesPage() {
  const { token, user } = useLegacyAuth();

  const [pfas, setPfas] = useState<PfaRow[]>([]);
  const [pfaId, setPfaId] = useState<number | null>(null);
  const [noSemana, setNoSemana] = useState<string>('');

  const [page, setPage] = useState<GapsPage>({ total: 0, offset: 0, limit: PAGE_SIZE, rows: [] });
  const [cargando, setCargando] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);

  // Filtros por ref para que cambiarlos no dispare refetch automático;
  // recarga explícita por botón "Buscar".
  const filtrosRef = useRef({ pfaId, noSemana });
  useEffect(() => { filtrosRef.current = { pfaId, noSemana }; }, [pfaId, noSemana]);

  const cargarPfas = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/legacy/correcciones/pfas-con-rutas`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setPfas(await res.json());
  }, [token]);

  const cargarFaltantes = useCallback(async (offset: number) => {
    if (!token) return;
    const isAppend = offset > 0;
    if (isAppend) setCargandoMas(true); else setCargando(true);
    try {
      const { pfaId: pf, noSemana: ns } = filtrosRef.current;
      const qs = new URLSearchParams();
      qs.set('offset', String(offset));
      qs.set('limit', String(PAGE_SIZE));
      if (pf !== null) qs.set('pfa', String(pf));
      if (ns.trim()) qs.set('no_semana', ns.trim());
      const res = await fetch(`${API_BASE}/legacy/correcciones/tmimf-o/faltantes?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: GapsPage = await res.json();
      setPage((prev) => isAppend ? { ...data, rows: [...prev.rows, ...data.rows] } : data);
    } finally {
      if (isAppend) setCargandoMas(false); else setCargando(false);
    }
  }, [token]);

  // Carga PFAs una vez al montar.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarPfas(); }, [cargarPfas]);

  const verPreview = useCallback(async (nins: string, nsem: number) => {
    if (!token) return;
    setCargandoPreview(true);
    try {
      const qs = new URLSearchParams({ numeroinscripcion: nins, no_semana: String(nsem) });
      const res = await fetch(`${API_BASE}/legacy/correcciones/tmimf-o/faltantes/preview?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPreview(await res.json());
    } finally {
      setCargandoPreview(false);
    }
  }, [token]);

  const tienenMas = page.rows.length < page.total;
  const huerfanasTodas = page.rows.reduce((acc, r) => acc + (
    (r.revisiones_pendientes_validar > 0 ? 1 : 0) +
    (r.capturas_sin_identificacion > 0 ? 1 : 0) +
    (r.trampas_incompletas > 0 ? 1 : 0)
  ), 0);

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          TMIMFs operativas faltantes
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Huerto + semana con revisiones pero <strong>sin TMIMF 'O' activa</strong>. Diagnóstico
          y preview de cierre —{' '}
          <span className="font-semibold text-amber-700 dark:text-amber-400">{user?.nombre_estado}</span>
        </p>
      </div>

      {/* Filtros */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <div>
            <label htmlFor="pfa" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              PFA (opcional)
            </label>
            <select
              id="pfa"
              value={pfaId ?? ''}
              onChange={(e) => setPfaId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">— Todos —</option>
              {pfas.map((p) => (
                <option key={p.folio} value={p.folio}>
                  {p.inicial ? `${p.inicial} · ` : ''}{p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sem" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              Folio semana (opcional)
            </label>
            <input
              id="sem"
              type="number"
              value={noSemana}
              onChange={(e) => setNoSemana(e.target.value)}
              placeholder="ej. 956"
              className="w-40 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void cargarFaltantes(0)}
            disabled={cargando}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium inline-flex items-center gap-2"
          >
            <Icon name="search" className="text-base" />
            {cargando ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </section>

      {/* Tabla */}
      {page.total > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3 flex-wrap">
            <Icon name="report_problem" className="text-amber-700 dark:text-amber-400 text-lg" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
              {page.total.toLocaleString('es-MX')} huerto+semana sin TMIMF 'O'
            </h2>
            <span className="text-xs text-slate-500">
              · mostrando {page.rows.length} · {huerfanasTodas} con bloqueos
            </span>
          </header>
          <div className="overflow-x-auto max-h-[65vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 z-10">
                <tr>
                  <th className="px-3 py-2 text-left">Inscripción · Ruta · PFA</th>
                  <th className="px-3 py-2 text-left">Semana</th>
                  <th className="px-3 py-2 text-right">Trampas inst/rev</th>
                  <th className="px-3 py-2 text-center">Bloqueos</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((r) => (
                  <tr
                    key={`${r.numeroinscripcion}-${r.no_semana}`}
                    className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="font-mono text-xs">{r.numeroinscripcion}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {r.ruta_nombre || '—'}
                        {r.modulo_nombre ? ` · ${r.modulo_nombre}` : ''}
                      </div>
                      <div className="text-xs text-slate-500">{r.pfa_nombre || '—'}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium">{r.semana_label}</div>
                      {r.fecha_revision_max && (
                        <div className="text-xs text-slate-500">Última rev: {r.fecha_revision_max}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-right tabular-nums">
                      <div>{r.trampas_revisadas} / {r.trampas_instaladas}</div>
                      <div className="text-xs text-slate-500">
                        {r.trampas_instaladas > 0
                          ? `${((r.trampas_revisadas / r.trampas_instaladas) * 100).toFixed(0)}%`
                          : '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {r.revisiones_pendientes_validar > 0 && (
                          <Chip tone="red" icon="gpp_bad" text={`${r.revisiones_pendientes_validar} sin validar`} />
                        )}
                        {r.capturas_sin_identificacion > 0 && (
                          <Chip tone="red" icon="bug_report" text={`${r.capturas_sin_identificacion} sin id.`} />
                        )}
                        {r.trampas_incompletas > 0 && (
                          <Chip tone="amber" icon="warning" text={`${r.trampas_incompletas} incompletas`} />
                        )}
                        {r.revisiones_pendientes_validar === 0
                          && r.capturas_sin_identificacion === 0
                          && r.trampas_incompletas === 0 && (
                          <Chip tone="green" icon="check" text="OK p/cerrar" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <button
                        type="button"
                        onClick={() => void verPreview(r.numeroinscripcion, r.no_semana)}
                        disabled={cargandoPreview}
                        className="px-3 py-1 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1"
                      >
                        <Icon name="preview" className="text-sm" />
                        Preview
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tienenMas && (
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-center">
              <button
                type="button"
                onClick={() => void cargarFaltantes(page.rows.length)}
                disabled={cargandoMas}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
              >
                {cargandoMas ? 'Cargando…' : `Cargar más (${page.total - page.rows.length} restantes)`}
              </button>
            </div>
          )}
        </section>
      )}

      {page.total === 0 && !cargando && (
        <section className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-500">
          {page.rows.length === 0 && page.limit === PAGE_SIZE
            ? 'Pulsa "Buscar" para cargar el listado.'
            : 'Sin resultados con los filtros actuales.'}
        </section>
      )}

      {/* Modal Preview */}
      {preview && (
        <PreviewModal preview={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

// ───────────────────────── Sub-components ─────────────────────────

function Chip({ tone, icon, text }: { tone: 'red' | 'amber' | 'green'; icon: string; text: string }) {
  const toneCls = tone === 'red'
    ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900'
    : tone === 'amber'
    ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
    : 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${toneCls}`}>
      <Icon name={icon} className="text-[13px]" />
      {text}
    </span>
  );
}

function GateRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon
        name={ok ? 'check_circle' : 'cancel'}
        className={`text-base ${ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
      />
      <span className={ok ? 'text-slate-700 dark:text-slate-200' : 'text-red-700 dark:text-red-300 font-medium'}>
        {label}
      </span>
    </div>
  );
}

function PreviewModal({ preview, onClose }: { preview: PreviewResult; onClose: () => void }) {
  const c = preview.calculos;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" role="dialog">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <Icon name="preview" className="text-amber-700 dark:text-amber-400 text-xl" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Preview de cierre TMIMF 'O'</h2>
            <p className="text-xs text-slate-500 font-mono">
              {preview.numeroinscripcion} · {preview.semana_label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <Icon name="close" className="text-lg" />
          </button>
        </header>

        <div className="p-5 space-y-5">
          <div className={`rounded-lg p-3 border ${
            preview.puede_cerrar
              ? 'bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800 text-green-800 dark:text-green-200'
              : 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Icon name={preview.puede_cerrar ? 'check_circle' : 'block'} className="text-lg" />
              {preview.puede_cerrar
                ? 'Cumple todos los gates — la TMIMF se puede cerrar en SIGMOD 2.'
                : 'No cumple gates bloqueantes — arregla el detalle antes de cerrar en SIGMOD 2.'}
            </div>
            <p className="text-xs mt-1 opacity-80">
              Este preview <strong>no ejecuta</strong> el cierre; solo muestra el estado y los
              valores que irían en la TMIMF. El cierre se hace desde SIGMOD 2 legacy.
            </p>
          </div>

          <section>
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
              Meta
            </h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-xs text-slate-500">PFA</dt><dd>{preview.meta.pfa_nombre || '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">Módulo</dt><dd>{preview.meta.modulo_nombre || '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">Folio ruta</dt><dd>{preview.meta.folio_ruta ?? '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">Clave PFA</dt><dd>{preview.meta.clave_pfa ?? '—'}</dd></div>
            </dl>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
              Gates (bloqueantes arriba, opcionales abajo)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <GateRow ok={preview.gates.fecha_revision_ok} label="Fecha de revisión presente" />
              <GateRow ok={preview.gates.trampas_todas_validadas} label="Todas las trampas validadas" />
              <GateRow ok={preview.gates.capturas_todas_identificadas} label="Capturas identificadas" />
              <GateRow ok={preview.gates.sin_trampas_incompletas} label="Sin trampas incompletas" />
              <GateRow ok={preview.gates.tiene_control_quimico} label="Control químico (opcional)" />
              <GateRow ok={preview.gates.tiene_control_mecanico} label="Control mecánico (opcional)" />
              <GateRow ok={preview.gates.tiene_muestreo_frutos} label="Muestreo de frutos (opcional)" />
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
              Cálculos que irían en la TMIMF
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <Field label="Fecha revisión" value={c.fecha_revision ?? '—'} />
              <Field label="Trampas instaladas" value={c.trampas_instaladas} />
              <Field label="Trampas revisadas" value={c.trampas_revisadas} />
              <Field label="% trampas rev" value={`${c.porcentaje_trampas_rev}%`} />
              <Field label="Días exposición (prom)" value={c.dias_exposicion_prom} />
              <Field label="MTD promedio" value={c.mtd_promedio_semanal} />
              <Field label="MTD A. ludens" value={c.mtd_ludens} />
              <Field label="MTD A. obliqua" value={c.mtd_obliqua} />
              <Field label="MTD A. striata" value={c.mtd_striata} />
              <Field label="MTD A. serpentina" value={c.mtd_serpentina} />
              <Field label="Superficie asperjada" value={c.superficie_asperjada} />
              <Field label="Litros mezcla" value={c.litros_mezcla_asperjada} />
              <Field label="Kg fruta destruida" value={c.kg_fruta_destruida} />
              <Field label="Kg fruta muestreada" value={c.kg_fruta_muestreada} />
              <Field label="Larvas / kg" value={c.larvas_por_kg_fruta} />
              <Field label="Otros controles" value={c.otros_controles ?? '—'} />
            </div>
          </section>
        </div>

        <footer className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
