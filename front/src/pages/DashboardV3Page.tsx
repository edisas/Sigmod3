import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface Kpi { label: string; value: number; change_pct: number | null; }
interface CapturaEspecie {
  especie_mosca_id: number | null;
  especie_mosca_nombre: string | null;
  hembras_silvestre: number;
  machos_silvestre: number;
  hembras_esteril: number;
  machos_esteril: number;
  total: number;
}
interface CapturaRuta {
  ruta_id: number | null;
  ruta_nombre: string | null;
  trampas: number;
  revisiones: number;
  capturas_total: number;
}
interface DashboardEstado {
  estado_id: number;
  estado_nombre: string;
  semana: number;
  kpis: Kpi[];
  capturas_por_especie: CapturaEspecie[];
  capturas_por_ruta: CapturaRuta[];
}

function authHeaders(): HeadersInit {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { ...authHeaders() } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const positive = pct > 0;
  const negative = pct < 0;
  return (
    <span className={`text-xs font-semibold inline-flex items-center gap-0.5 ${
      positive ? 'text-emerald-700' : negative ? 'text-red-700' : 'text-slate-500'
    }`}>
      <Icon name={positive ? 'arrow_upward' : negative ? 'arrow_downward' : 'remove'} className="text-xs" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function BarRow({ label, value, max, accentClass }: { label: string; value: number; max: number; accentClass: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="grid grid-cols-12 gap-2 items-center text-sm">
      <div className="col-span-4 truncate font-medium">{label}</div>
      <div className="col-span-7">
        <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${accentClass}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="col-span-1 text-right font-mono font-semibold">{value}</div>
    </div>
  );
}

export default function DashboardV3Page() {
  const { activeStateName } = useAuth();
  const [semana, setSemana] = useState<string>('');
  const [data, setData] = useState<DashboardEstado | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const url = semana ? `${API_BASE}/dashboard-v3/resumen-estado?semana=${semana}` : `${API_BASE}/dashboard-v3/resumen-estado`;
      const d = await fetchJson<DashboardEstado>(url);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, [semana]);

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [load]);

  const maxCapturasEspecie = useMemo(() => Math.max(1, ...((data?.capturas_por_especie ?? []).map((c) => c.total))), [data]);
  const maxCapturasRuta = useMemo(() => Math.max(1, ...((data?.capturas_por_ruta ?? []).map((c) => c.capturas_total))), [data]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard estatal</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Resumen operativo de {activeStateName ?? 'tu estado activo'}{data ? ` · semana ${data.semana}` : ''}.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs uppercase font-semibold tracking-wider text-slate-500 mb-1">Semana ISO</label>
            <input type="number" min={1} max={53} value={semana} placeholder="auto" onChange={(e) => setSemana(e.target.value)} className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
          </div>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => void load()}>Refrescar</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {isLoading && <div className="text-slate-500">Cargando…</div>}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.kpis.map((k, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs uppercase font-semibold tracking-wider text-slate-500">{k.label}</p>
                  <ChangeBadge pct={k.change_pct} />
                </div>
                <p className="text-3xl font-bold text-primary">{k.value.toLocaleString('es-MX')}</p>
              </div>
            ))}
          </div>

          {/* Capturas por especie */}
          <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-5 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Capturas por especie</h2>
              <p className="text-xs text-slate-500">Suma de hembras + machos (silvestre y estéril) en la semana {data.semana}.</p>
            </div>
            {data.capturas_por_especie.length === 0 ? (
              <p className="text-sm text-slate-500">Sin capturas registradas en la semana.</p>
            ) : (
              <div className="space-y-2">
                {data.capturas_por_especie.map((c, idx) => (
                  <div key={idx} className="space-y-1">
                    <BarRow label={c.especie_mosca_nombre ?? `#${c.especie_mosca_id}`} value={c.total} max={maxCapturasEspecie} accentClass="bg-primary" />
                    <div className="grid grid-cols-4 gap-2 ml-4 text-xs text-slate-600 dark:text-slate-400 font-mono">
                      <span>♀ silv: {c.hembras_silvestre}</span>
                      <span>♂ silv: {c.machos_silvestre}</span>
                      <span>♀ esté: {c.hembras_esteril}</span>
                      <span>♂ esté: {c.machos_esteril}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Capturas por ruta */}
          <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-5 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Capturas por ruta</h2>
              <p className="text-xs text-slate-500">Total de capturas y trampas/revisiones por ruta en la semana {data.semana}.</p>
            </div>
            {data.capturas_por_ruta.length === 0 ? (
              <p className="text-sm text-slate-500">Sin rutas con datos en la semana.</p>
            ) : (
              <div className="space-y-2">
                {data.capturas_por_ruta.map((r, idx) => (
                  <div key={idx} className="space-y-1">
                    <BarRow label={r.ruta_nombre ?? '(sin ruta)'} value={r.capturas_total} max={maxCapturasRuta} accentClass="bg-emerald-500" />
                    <div className="grid grid-cols-3 gap-2 ml-4 text-xs text-slate-600 dark:text-slate-400">
                      <span>{r.trampas} trampa{r.trampas === 1 ? '' : 's'}</span>
                      <span>{r.revisiones} revisión{r.revisiones === 1 ? '' : 'es'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
