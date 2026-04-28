import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
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
interface CapturaEstado {
  estado_id: number;
  estado_nombre: string;
  estado_clave: string;
  trampas_activas: number;
  revisiones_ultima_semana: number;
  identificaciones_ultima_semana: number;
  capturas_total_ultima_semana: number;
}
interface DashboardNacional {
  semana: number;
  total_estados_activos: number;
  kpis_globales: Kpi[];
  capturas_por_especie_global: CapturaEspecie[];
  capturas_por_estado: CapturaEstado[];
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

export default function DashboardNacionalPage() {
  const { isSenasica, user, switchState } = useAuth();
  const [semana, setSemana] = useState<string>('');
  const [data, setData] = useState<DashboardNacional | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const role = (user?.role ?? '').toLowerCase();
  const allowed = isSenasica || role === 'admin' || role === 'administrador general';

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const url = semana ? `${API_BASE}/dashboard-v3/resumen-nacional?semana=${semana}` : `${API_BASE}/dashboard-v3/resumen-nacional`;
      const d = await fetchJson<DashboardNacional>(url);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el dashboard nacional.');
    } finally {
      setIsLoading(false);
    }
  }, [semana]);

  useEffect(() => {
    if (allowed) void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load, allowed]);

  const maxCapturasEstado = useMemo(() => Math.max(1, ...((data?.capturas_por_estado ?? []).map((c) => c.capturas_total_ultima_semana))), [data]);
  const maxCapturasEspecie = useMemo(() => Math.max(1, ...((data?.capturas_por_especie_global ?? []).map((c) => c.total))), [data]);

  const enterEstado = async (estadoId: number) => {
    const result = await switchState(estadoId);
    if (!result.success) {
      setError(result.error ?? 'No se pudo cambiar de estado.');
    }
  };

  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard nacional</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Vista consolidada cross-state{data ? ` · semana ${data.semana} · ${data.total_estados_activos} estados activos` : ''}.
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
          {/* KPIs globales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.kpis_globales.map((k, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4">
                <p className="text-xs uppercase font-semibold tracking-wider text-slate-500 mb-1">{k.label}</p>
                <p className="text-3xl font-bold text-primary">{k.value.toLocaleString('es-MX')}</p>
              </div>
            ))}
          </div>

          {/* Tabla de estados */}
          <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Capturas por estado</h2>
              <p className="text-xs text-slate-500">Click en una fila para entrar como Senasica al estado.</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-right px-4 py-3">Trampas</th>
                  <th className="text-right px-4 py-3">Revs sem {data.semana}</th>
                  <th className="text-right px-4 py-3">Idents sem {data.semana}</th>
                  <th className="text-right px-4 py-3">Capturas</th>
                  <th className="px-4 py-3"></th>
                  <th className="text-right px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.capturas_por_estado.map((c) => {
                  const pct = (c.capturas_total_ultima_semana / maxCapturasEstado) * 100;
                  return (
                    <tr key={c.estado_id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="size-7 rounded-md bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">{c.estado_clave}</span>
                          <span className="font-medium">{c.estado_nombre}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{c.trampas_activas.toLocaleString('es-MX')}</td>
                      <td className="px-4 py-3 text-right font-mono">{c.revisiones_ultima_semana.toLocaleString('es-MX')}</td>
                      <td className="px-4 py-3 text-right font-mono">{c.identificaciones_ultima_semana.toLocaleString('es-MX')}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{c.capturas_total_ultima_semana.toLocaleString('es-MX')}</td>
                      <td className="px-4 py-3 w-32">
                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isSenasica && (
                          <button onClick={() => void enterEstado(c.estado_id)} className="rounded-md border border-primary px-2 py-1 text-primary text-xs">
                            Entrar →
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Capturas por especie globales */}
          <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-5 space-y-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Capturas por especie (nacional)</h2>
              <p className="text-xs text-slate-500">Total de hembras + machos (silvestre y estéril) en la semana {data.semana}.</p>
            </div>
            {data.capturas_por_especie_global.length === 0 ? (
              <p className="text-sm text-slate-500">Sin capturas registradas en la semana.</p>
            ) : (
              <div className="space-y-2">
                {data.capturas_por_especie_global.map((c, idx) => {
                  const pct = (c.total / maxCapturasEspecie) * 100;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="grid grid-cols-12 gap-2 items-center text-sm">
                        <div className="col-span-4 truncate font-medium">{c.especie_mosca_nombre ?? `#${c.especie_mosca_id}`}</div>
                        <div className="col-span-7">
                          <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <div className="col-span-1 text-right font-mono font-semibold">{c.total}</div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 ml-4 text-xs text-slate-600 dark:text-slate-400 font-mono">
                        <span>♀ silv: {c.hembras_silvestre}</span>
                        <span>♂ silv: {c.machos_silvestre}</span>
                        <span>♀ esté: {c.hembras_esteril}</span>
                        <span>♂ esté: {c.machos_esteril}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {isSenasica && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4 flex items-start gap-3">
              <Icon name="info" className="text-amber-700 text-xl shrink-0" />
              <div className="text-sm text-amber-900 dark:text-amber-200">
                Como Senasica, puedes hacer click en "Entrar →" para cambiar dinámicamente al estado y operar sus catálogos como administrador general. El JWT se refresca automáticamente.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
