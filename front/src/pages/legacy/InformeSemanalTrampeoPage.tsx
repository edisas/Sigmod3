import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ExportButton from '@/components/legacy/ExportButton';
import KpiBar, { type KpiItem } from '@/components/legacy/KpiBar';
import PageHeader from '@/components/legacy/PageHeader';
import { useLegacyAuth } from '@/context/LegacyAuthContext';
import type { ExportColumn } from '@/lib/excelExport';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

// ───────────────────────── Types ─────────────────────────

interface PfaInfo { folio: number; nombre: string | null; cedula: string | null; inicial: string | null }
interface RutaPfa { folio: number; nombre_ruta: string | null; inicial_ruta: string | null; modulo_nombre: string | null }
interface SemanaRow { no_semana: number; periodo: number | null; semana_label: string; revisiones: number }

interface Operativos {
  trampas_instaladas: number; trampas_revisadas: number;
  dias_exposicion: number; porcentaje_revision: number;
}
interface Capturas {
  a_ludens_fertil: number; a_obliqua_fertil: number;
  a_striata_fertil: number; a_serpentina_fertil: number; a_spp_fertil: number;
  total_fertil: number;
  a_ludens_esteril: number; a_obliqua_esteril: number; total_esteril: number;
}
interface Tecnicos {
  positivas_fertil: number; porcentaje_positivas_fertil: number;
  mtd_total_fertil: number;
  mtd_ludens_fertil: number; mtd_obliqua_fertil: number;
  mtd_striata_fertil: number; mtd_serpentina_fertil: number; mtd_spp_fertil: number;
  positivas_esteril: number; porcentaje_positivas_esteril: number;
  mtd_total_esteril: number;
  mtd_ludens_esteril: number; mtd_obliqua_esteril: number;
}
interface Meta {
  pfa_folio: number; pfa_nombre: string | null;
  ruta_folio: number; ruta_nombre: string | null; inicial_ruta: string | null;
  modulo_nombre: string | null;
  semana_folio: number; semana_label: string;
  fecha_inicio: string | null; fecha_final: string | null;
}
interface Informe { meta: Meta; operativos: Operativos; capturas: Capturas; tecnicos: Tecnicos }

interface ExportRow { indicador: string; valor: number | string; unidad: string }

// ───────────────────────── Page ─────────────────────────

export default function InformeSemanalTrampeoPage() {
  const { token, user } = useLegacyAuth();

  const [pfas, setPfas]       = useState<PfaInfo[]>([]);
  const [rutas, setRutas]     = useState<RutaPfa[]>([]);
  const [semanas, setSemanas] = useState<SemanaRow[]>([]);

  const [pfaFolio, setPfaFolio]   = useState<number | null>(null);
  const [rutaFolio, setRutaFolio] = useState<number | null>(null);
  const [semana, setSemana]       = useState<number | null>(null);

  const [data, setData]         = useState<Informe | null>(null);
  const [loadingPfas, setLoadingPfas]       = useState(true);
  const [loadingRutas, setLoadingRutas]     = useState(false);
  const [loadingSemanas, setLoadingSemanas] = useState(false);
  const [loadingReporte, setLoadingReporte] = useState(false);
  const [error, setError]                   = useState('');

  const cargarPfas = useCallback(async () => {
    if (!token) return;
    setLoadingPfas(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/reportes/inventario-pfa/pfas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPfas(await res.json());
    } finally { setLoadingPfas(false); }
  }, [token]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarPfas(); }, [cargarPfas]);

  const cargarRutas = useCallback(async () => {
    if (!token || pfaFolio === null) { setRutas([]); setRutaFolio(null); return; }
    setLoadingRutas(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/rutas-por-pfa?pfa=${pfaFolio}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const list: RutaPfa[] = await res.json();
        setRutas(list);
        setRutaFolio(null);
        setSemana(null);
        setData(null);
      }
    } finally { setLoadingRutas(false); }
  }, [token, pfaFolio]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarRutas(); }, [cargarRutas]);

  const cargarSemanas = useCallback(async () => {
    if (!token || rutaFolio === null) { setSemanas([]); setSemana(null); return; }
    setLoadingSemanas(true);
    try {
      const res = await fetch(`${API_BASE}/legacy/correcciones/semanas-por-ruta?ruta=${rutaFolio}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSemanas(await res.json());
        setSemana(null);
        setData(null);
      }
    } finally { setLoadingSemanas(false); }
  }, [token, rutaFolio]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarSemanas(); }, [cargarSemanas]);

  const generar = async () => {
    if (!token || pfaFolio === null || rutaFolio === null || semana === null) return;
    setLoadingReporte(true);
    setError('');
    try {
      const qs = new URLSearchParams({ pfa: String(pfaFolio), ruta: String(rutaFolio), semana: String(semana) });
      const res = await fetch(`${API_BASE}/legacy/reportes/informes-semanales/trampeo?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(typeof detail === 'string' ? detail : 'Error al generar el reporte');
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setLoadingReporte(false); }
  };

  // KPIs principales
  const kpis: KpiItem[] = useMemo(() => {
    if (!data) return [];
    const o = data.operativos;
    const c = data.capturas;
    return [
      { label: 'Instaladas',     value: o.trampas_instaladas,                 icon: 'track_changes', tone: 'amber' },
      { label: 'Revisadas',      value: `${o.trampas_revisadas} (${o.porcentaje_revision.toFixed(1)}%)`, icon: 'check_circle', tone: 'emerald' },
      { label: 'Días exposición', value: o.dias_exposicion.toFixed(2),          icon: 'schedule', tone: 'slate' },
      { label: 'Capt. fértiles', value: c.total_fertil,                       icon: 'bug_report', tone: c.total_fertil > 0 ? 'rose' : 'slate' },
      { label: 'Capt. estériles', value: c.total_esteril,                      icon: 'science', tone: 'slate' },
    ];
  }, [data]);

  // Filas para el export — formato vertical "indicador / valor / unidad"
  const exportRows: ExportRow[] = useMemo(() => {
    if (!data) return [];
    const o = data.operativos;
    const c = data.capturas;
    const t = data.tecnicos;
    return [
      { indicador: '── ÍNDICES OPERATIVOS ──',   valor: '', unidad: '' },
      { indicador: 'Trampas instaladas',          valor: o.trampas_instaladas,    unidad: 'trampas' },
      { indicador: 'Trampas revisadas',           valor: o.trampas_revisadas,     unidad: 'trampas' },
      { indicador: 'Días de exposición (prom.)',  valor: o.dias_exposicion,       unidad: 'días' },
      { indicador: 'Porcentaje de revisión',      valor: o.porcentaje_revision,   unidad: '%' },
      { indicador: '── LAB. DE IDENTIFICACIÓN (FÉRTIL) ──', valor: '', unidad: '' },
      { indicador: 'A. ludens (fértil)',          valor: c.a_ludens_fertil,       unidad: 'capturas' },
      { indicador: 'A. obliqua (fértil)',         valor: c.a_obliqua_fertil,      unidad: 'capturas' },
      { indicador: 'A. striata (fértil)',         valor: c.a_striata_fertil,      unidad: 'capturas' },
      { indicador: 'A. serpentina (fértil)',      valor: c.a_serpentina_fertil,   unidad: 'capturas' },
      { indicador: 'A. spp (fértil)',             valor: c.a_spp_fertil,          unidad: 'capturas' },
      { indicador: 'Total (fértil)',              valor: c.total_fertil,          unidad: 'capturas' },
      { indicador: '── LAB. DE IDENTIFICACIÓN (ESTÉRIL) ──', valor: '', unidad: '' },
      { indicador: 'A. ludens (estéril)',         valor: c.a_ludens_esteril,      unidad: 'capturas' },
      { indicador: 'A. obliqua (estéril)',        valor: c.a_obliqua_esteril,     unidad: 'capturas' },
      { indicador: 'Total (estéril)',             valor: c.total_esteril,         unidad: 'capturas' },
      { indicador: '── ÍNDICES TÉCNICOS ──',      valor: '', unidad: '' },
      { indicador: 'Positivas (fértil)',          valor: t.positivas_fertil,      unidad: 'capturas' },
      { indicador: '% Positivas (fértil)',        valor: t.porcentaje_positivas_fertil,  unidad: '%' },
      { indicador: 'MTD Total (fértil)',          valor: t.mtd_total_fertil,      unidad: 'MTD' },
      { indicador: 'MTD A. ludens (fértil)',      valor: t.mtd_ludens_fertil,     unidad: 'MTD' },
      { indicador: 'MTD A. obliqua (fértil)',     valor: t.mtd_obliqua_fertil,    unidad: 'MTD' },
      { indicador: 'MTD A. striata (fértil)',     valor: t.mtd_striata_fertil,    unidad: 'MTD' },
      { indicador: 'MTD A. serpentina (fértil)',  valor: t.mtd_serpentina_fertil, unidad: 'MTD' },
      { indicador: 'MTD A. spp (fértil)',         valor: t.mtd_spp_fertil,        unidad: 'MTD' },
      { indicador: 'Positivas (estéril)',         valor: t.positivas_esteril,     unidad: 'capturas' },
      { indicador: '% Positivas (estéril)',       valor: t.porcentaje_positivas_esteril, unidad: '%' },
      { indicador: 'MTD Total (estéril)',         valor: t.mtd_total_esteril,     unidad: 'MTD' },
      { indicador: 'MTD A. ludens (estéril)',     valor: t.mtd_ludens_esteril,    unidad: 'MTD' },
      { indicador: 'MTD A. obliqua (estéril)',    valor: t.mtd_obliqua_esteril,   unidad: 'MTD' },
    ];
  }, [data]);

  const exportColumns: ExportColumn<ExportRow>[] = [
    { header: 'Indicador', key: 'indicador', width: 40 },
    { header: 'Valor',     key: 'valor',     alignRight: true, width: 14 },
    { header: 'Unidad',    key: 'unidad',    width: 12 },
  ];

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <PageHeader
        icon="description"
        title="Informe semanal de trampeo"
        subtitle="Reporte oficial SAGARPA por (PFA × ruta × semana). Índices operativos, identificación y técnicos."
        estado={user?.nombre_estado}
      />

      {/* Selectores en cascada */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="pfa" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              1. PFA
            </label>
            <select
              id="pfa"
              value={pfaFolio ?? ''}
              onChange={(e) => setPfaFolio(e.target.value ? Number(e.target.value) : null)}
              disabled={loadingPfas || pfas.length === 0}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">— Selecciona un PFA —</option>
              {pfas.map((p) => (
                <option key={p.folio} value={p.folio}>
                  {p.inicial ? `${p.inicial} · ` : ''}{p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ruta" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              2. Ruta
            </label>
            <select
              id="ruta"
              value={rutaFolio ?? ''}
              onChange={(e) => setRutaFolio(e.target.value ? Number(e.target.value) : null)}
              disabled={pfaFolio === null || rutas.length === 0 || loadingRutas}
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
            <label htmlFor="semana" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              3. Semana
            </label>
            <select
              id="semana"
              value={semana ?? ''}
              onChange={(e) => setSemana(e.target.value ? Number(e.target.value) : null)}
              disabled={rutaFolio === null || semanas.length === 0 || loadingSemanas}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">— Selecciona una semana —</option>
              {semanas.map((s) => (
                <option key={s.no_semana} value={s.no_semana}>
                  {s.semana_label} · {s.revisiones} revisiones
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={generar}
            disabled={loadingReporte || semana === null}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium inline-flex items-center gap-2"
          >
            <Icon name={loadingReporte ? 'progress_activity' : 'play_arrow'} className={`text-base ${loadingReporte ? 'animate-spin' : ''}`} />
            {loadingReporte ? 'Generando…' : 'Generar reporte'}
          </button>
        </div>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <Icon name="error" className="text-red-500 text-lg shrink-0" />
          {error}
        </div>
      )}

      {data && (
        <>
          <KpiBar
            items={kpis}
            trailing={
              <ExportButton
                filename={`informe-semanal-trampeo_${user?.legacy_db ?? 'legacy'}_ruta${data.meta.ruta_folio}_sem${data.meta.semana_folio}_${new Date().toISOString().slice(0,10)}`}
                columns={exportColumns}
                rows={exportRows}
                title={`Informe semanal de trampeo — ${user?.nombre_estado ?? ''}`}
                subtitle={`PFA: ${data.meta.pfa_nombre ?? '—'} · Ruta: ${data.meta.ruta_nombre ?? '—'} (${data.meta.modulo_nombre ?? '—'}) · Semana ${data.meta.semana_label}${data.meta.fecha_inicio ? ` · ${data.meta.fecha_inicio} a ${data.meta.fecha_final}` : ''}`}
              />
            }
          />

          {/* Meta del reporte */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
              <Item label="PFA" value={data.meta.pfa_nombre ?? '—'} />
              <Item label="Ruta" value={data.meta.ruta_nombre ? `${data.meta.inicial_ruta ? `${data.meta.inicial_ruta} · ` : ''}${data.meta.ruta_nombre}` : '—'} />
              <Item label="Módulo" value={data.meta.modulo_nombre ?? '—'} />
              <Item label="Semana" value={data.meta.semana_label} hint={data.meta.fecha_inicio ? `${data.meta.fecha_inicio} a ${data.meta.fecha_final}` : undefined} />
            </dl>
          </section>

          {/* 3 secciones del reporte */}
          <Seccion titulo="Índices operativos" icon="speed">
            <Indicador label="Trampas instaladas" value={data.operativos.trampas_instaladas} unidad="trampas" />
            <Indicador label="Trampas revisadas" value={data.operativos.trampas_revisadas} unidad="trampas" />
            <Indicador label="Días de exposición" value={data.operativos.dias_exposicion.toFixed(2)} unidad="días" />
            <Indicador label="Porcentaje de revisión" value={data.operativos.porcentaje_revision.toFixed(2)} unidad="%" tone="emerald" />
          </Seccion>

          <Seccion titulo="Lab. de identificación" icon="bug_report">
            <div className="space-y-3">
              <SubBlock label="Fértiles (silvestres)" total={data.capturas.total_fertil} tone="rose">
                <Indicador label="A. ludens" value={data.capturas.a_ludens_fertil} unidad="capt." compact />
                <Indicador label="A. obliqua" value={data.capturas.a_obliqua_fertil} unidad="capt." compact />
                <Indicador label="A. striata" value={data.capturas.a_striata_fertil} unidad="capt." compact />
                <Indicador label="A. serpentina" value={data.capturas.a_serpentina_fertil} unidad="capt." compact />
                <Indicador label="A. spp" value={data.capturas.a_spp_fertil} unidad="capt." compact />
              </SubBlock>
              <SubBlock label="Estériles" total={data.capturas.total_esteril}>
                <Indicador label="A. ludens" value={data.capturas.a_ludens_esteril} unidad="capt." compact />
                <Indicador label="A. obliqua" value={data.capturas.a_obliqua_esteril} unidad="capt." compact />
              </SubBlock>
            </div>
          </Seccion>

          <Seccion titulo="Índices técnicos" icon="analytics">
            <div className="space-y-3">
              <SubBlock label="Fértiles" total={data.tecnicos.positivas_fertil}>
                <Indicador label="% positivas"   value={data.tecnicos.porcentaje_positivas_fertil.toFixed(2)} unidad="%" compact />
                <Indicador label="MTD Total"     value={data.tecnicos.mtd_total_fertil.toFixed(4)}    unidad="MTD" compact />
                <Indicador label="MTD ludens"    value={data.tecnicos.mtd_ludens_fertil.toFixed(4)}   unidad="MTD" compact />
                <Indicador label="MTD obliqua"   value={data.tecnicos.mtd_obliqua_fertil.toFixed(4)}  unidad="MTD" compact />
                <Indicador label="MTD striata"   value={data.tecnicos.mtd_striata_fertil.toFixed(4)}  unidad="MTD" compact />
                <Indicador label="MTD serpentina" value={data.tecnicos.mtd_serpentina_fertil.toFixed(4)} unidad="MTD" compact />
                <Indicador label="MTD spp"       value={data.tecnicos.mtd_spp_fertil.toFixed(4)}      unidad="MTD" compact />
              </SubBlock>
              <SubBlock label="Estériles" total={data.tecnicos.positivas_esteril}>
                <Indicador label="% positivas"  value={data.tecnicos.porcentaje_positivas_esteril.toFixed(2)} unidad="%" compact />
                <Indicador label="MTD Total"    value={data.tecnicos.mtd_total_esteril.toFixed(4)}   unidad="MTD" compact />
                <Indicador label="MTD ludens"   value={data.tecnicos.mtd_ludens_esteril.toFixed(4)}  unidad="MTD" compact />
                <Indicador label="MTD obliqua"  value={data.tecnicos.mtd_obliqua_esteril.toFixed(4)} unidad="MTD" compact />
              </SubBlock>
            </div>
          </Seccion>
        </>
      )}
    </div>
  );
}

// ───────────────────────── Sub-components ─────────────────────────

function Item({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">{value}</dd>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

function Seccion({ titulo, icon, children }: { titulo: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
        <Icon name={icon} className="text-amber-700 dark:text-amber-400 text-lg" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">{titulo}</h2>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function SubBlock({ label, total, tone, children }: { label: string; total: number; tone?: 'rose'; children: React.ReactNode }) {
  const totalCls = tone === 'rose' && total > 0
    ? 'text-rose-700 dark:text-rose-400'
    : 'text-slate-700 dark:text-slate-300';
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100 dark:border-slate-800">
        <span className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 font-semibold">{label}</span>
        <span className={`text-sm font-bold tabular-nums ${totalCls}`}>Total: {total}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}

function Indicador({ label, value, unidad, tone, compact }: { label: string; value: number | string; unidad: string; tone?: 'emerald' | 'rose'; compact?: boolean }) {
  const valStr = typeof value === 'number' ? value.toLocaleString('es-MX') : value;
  const isZero = (typeof value === 'number' && value === 0) || value === '0' || value === '0.00' || value === '0.0000';
  const valueCls = tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-400'
                 : tone === 'rose' && !isZero ? 'text-rose-700 dark:text-rose-400'
                 : 'text-slate-900 dark:text-slate-100';
  return (
    <div className={compact ? '' : 'rounded-lg bg-slate-50 dark:bg-slate-800/30 p-3'}>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${valueCls}`}>
        {valStr}
        <span className="ml-1 text-xs font-normal text-slate-500">{unidad}</span>
      </div>
    </div>
  );
}
