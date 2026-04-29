import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface Tmimf {
  id: number;
  folio_tmimf: string;
  subfolio: number | null;
  folio_original: string | null;
  unidad_produccion_id: number | null;
  tipo_tarjeta: string;
  pais: string;
  ruta_id: number | null;
  modulo_emisor_id: number | null;
  mercado_id: number | null;
  tipo_transporte_id: number | null;
  placas_transporte: string | null;
  funcionario_aprobo_id: number | null;
  semana: string | null;
  fecha_emision: string | null;
  hora_emision: string | null;
  vigencia_tarjeta: number | null;
  fecha_vencimiento: string | null;
  clave_movilizacion: string;
  nombre_pfa: string | null;
  cfmn: string | null;
  estado_id: number | null;
  estatus_bloqueo: string;
  resuelto: number;
  facturado: number;
  estatus_id: number;
  fecha_cancelacion: string | null;
  motivo_cancelacion: string | null;
  estado_nombre: string | null;
  unidad_produccion_ni: string | null;
  unidad_produccion_nombre: string | null;
  ruta_nombre: string | null;
  modulo_emisor_nombre: string | null;
  mercado_nombre: string | null;
  tipo_transporte_nombre: string | null;
  funcionario_aprobo_nombre: string | null;
}

interface TmimfDetalle {
  id: number;
  tmimf_id: number;
  sub_folio: number;
  unidad_produccion_id: number | null;
  variedad_id: number | null;
  cantidad_movilizada: number | null;
  saldo: number;
  cajas_14: number | null; cajas_15: number | null; cajas_16: number | null;
  cajas_18: number | null; cajas_20: number | null; cajas_25: number | null;
  cajas_30: number | null; granel: number | null;
  tipo_vehiculo_id: number | null;
  placas: string | null;
  semana: number | null;
  estatus_id: number;
  variedad_nombre: string | null;
  unidad_produccion_ni: string | null;
  tipo_vehiculo_nombre: string | null;
}

interface SimpleOption { id: number; nombre: string; }
interface UnidadOption { id: number; numero_inscripcion: string; nombre_unidad: string | null; }
interface RutaOption { id: number; nombre: string; }
interface ModuloOption { id: number; nombre: string; }

const EMPTY_TMIMF = {
  id: null as number | null,
  folio_tmimf: '',
  subfolio: '',
  folio_original: '',
  unidad_produccion_id: '' as number | '',
  tipo_tarjeta: 'M' as 'M' | 'O',
  pais: 'MEX',
  ruta_id: '' as number | '',
  modulo_emisor_id: '' as number | '',
  mercado_id: '' as number | '',
  tipo_transporte_id: '' as number | '',
  placas_transporte: '',
  funcionario_aprobo_id: '' as number | '',
  semana: '',
  fecha_emision: new Date().toISOString().slice(0, 10),
  hora_emision: '',
  vigencia_tarjeta: '7',
  fecha_vencimiento: '',
  clave_movilizacion: '',
  nombre_pfa: '',
  cfmn: '',
  estatus_bloqueo: 'N',
  resuelto: 0 as 0 | 1,
  facturado: 0 as 0 | 1,
  estatus_id: 1,
};
type TmimfForm = typeof EMPTY_TMIMF;

const EMPTY_DET = {
  id: null as number | null,
  sub_folio: '0',
  unidad_produccion_id: '' as number | '',
  variedad_id: '' as number | '',
  cantidad_movilizada: '',
  saldo: '0',
  cajas_14: '', cajas_15: '', cajas_16: '', cajas_18: '', cajas_20: '', cajas_25: '', cajas_30: '',
  granel: '',
  tipo_vehiculo_id: '' as number | '',
  placas: '',
  semana: '',
  estatus_id: 1,
};
type DetForm = typeof EMPTY_DET;

function authHeaders(): HeadersInit {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) } });
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try { const b = await r.json(); if (b?.detail) detail = String(b.detail); } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export default function TmimfsPage() {
  const { activeStateName } = useAuth();
  const [items, setItems] = useState<Tmimf[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | ''>(1);
  const [tipoFilter, setTipoFilter] = useState<string>('');
  const [bloqueoFilter, setBloqueoFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [unidades, setUnidades] = useState<UnidadOption[]>([]);
  const [rutas, setRutas] = useState<RutaOption[]>([]);
  const [modulos, setModulos] = useState<ModuloOption[]>([]);
  const [vehiculos, setVehiculos] = useState<SimpleOption[]>([]);
  const [variedades, setVariedades] = useState<SimpleOption[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tmimfForm, setTmimfForm] = useState<TmimfForm>(EMPTY_TMIMF);
  const [savingTmimf, setSavingTmimf] = useState(false);
  const [activeTmimfId, setActiveTmimfId] = useState<number | null>(null);
  const [detallados, setDetallados] = useState<TmimfDetalle[]>([]);
  const [detForm, setDetForm] = useState<DetForm>(EMPTY_DET);
  const [editingDetId, setEditingDetId] = useState<number | null>(null);
  const [savingDet, setSavingDet] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadCatalogos = useCallback(async () => {
    try {
      const [us, rs, ms, vs, vrs] = await Promise.all([
        fetchJson<{ items: UnidadOption[] }>(`${API_BASE}/unidades-produccion/listado?estatus_id=1&page_size=500`).catch(() => ({ items: [] })),
        fetchJson<{ items: RutaOption[] }>(`${API_BASE}/rutas/listado?estatus_id=1&page_size=200`).catch(() => ({ items: [] })),
        fetchJson<{ items: ModuloOption[] }>(`${API_BASE}/modulos/listado?estatus_id=1&page_size=200`).catch(() => ({ items: [] })),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/vehiculos?estatus_id=1`).catch(() => []),
        fetchJson<SimpleOption[]>(`${API_BASE}/catalogos/auxiliares/variedades?estatus_id=1`).catch(() => []),
      ]);
      setUnidades(us.items ?? []);
      setRutas(rs.items ?? []);
      setModulos(ms.items ?? []);
      setVehiculos(Array.isArray(vs) ? vs : []);
      setVariedades(Array.isArray(vrs) ? vrs : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadCatalogos(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [loadCatalogos]);

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter !== '') params.set('estatus_id', String(statusFilter));
      if (tipoFilter) params.set('tipo_tarjeta', tipoFilter);
      if (bloqueoFilter) params.set('estatus_bloqueo', bloqueoFilter);
      const data = await fetchJson<{ items: Tmimf[]; total: number }>(`${API_BASE}/tmimf/listado?${params.toString()}`);
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      setItems([]); setTotal(0);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las TMIMFs.');
    } finally { setIsLoading(false); }
  }, [page, pageSize, search, statusFilter, tipoFilter, bloqueoFilter]);

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [load]);

  const loadDetallados = useCallback(async (tmimfId: number) => {
    try {
      const r = await fetchJson<{ items: TmimfDetalle[] }>(`${API_BASE}/tmimf/${tmimfId}/detallado`);
      setDetallados(r.items ?? []);
    } catch { setDetallados([]); }
  }, []);

  const openCreate = () => { setTmimfForm(EMPTY_TMIMF); setActiveTmimfId(null); setDetallados([]); setDetForm(EMPTY_DET); setEditingDetId(null); setDrawerOpen(true); };
  const openEdit = (item: Tmimf) => {
    setTmimfForm({
      id: item.id,
      folio_tmimf: item.folio_tmimf,
      subfolio: item.subfolio == null ? '' : String(item.subfolio),
      folio_original: item.folio_original ?? '',
      unidad_produccion_id: item.unidad_produccion_id ?? '',
      tipo_tarjeta: (item.tipo_tarjeta === 'M' || item.tipo_tarjeta === 'O') ? item.tipo_tarjeta : 'M',
      pais: item.pais ?? 'MEX',
      ruta_id: item.ruta_id ?? '',
      modulo_emisor_id: item.modulo_emisor_id ?? '',
      mercado_id: item.mercado_id ?? '',
      tipo_transporte_id: item.tipo_transporte_id ?? '',
      placas_transporte: item.placas_transporte ?? '',
      funcionario_aprobo_id: item.funcionario_aprobo_id ?? '',
      semana: item.semana ?? '',
      fecha_emision: item.fecha_emision ?? '',
      hora_emision: item.hora_emision ?? '',
      vigencia_tarjeta: item.vigencia_tarjeta == null ? '' : String(item.vigencia_tarjeta),
      fecha_vencimiento: item.fecha_vencimiento ?? '',
      clave_movilizacion: item.clave_movilizacion ?? '',
      nombre_pfa: item.nombre_pfa ?? '',
      cfmn: item.cfmn ?? '',
      estatus_bloqueo: item.estatus_bloqueo ?? 'N',
      resuelto: (item.resuelto ? 1 : 0),
      facturado: (item.facturado ? 1 : 0),
      estatus_id: item.estatus_id,
    });
    setActiveTmimfId(item.id);
    setDetForm(EMPTY_DET); setEditingDetId(null);
    void loadDetallados(item.id);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setTmimfForm(EMPTY_TMIMF); setActiveTmimfId(null);
    setDetallados([]); setDetForm(EMPTY_DET); setEditingDetId(null);
  };

  const submitTmimf = async (e: React.FormEvent) => {
    e.preventDefault(); setSavingTmimf(true); setError(''); setSuccess('');
    try {
      const body = {
        folio_tmimf: tmimfForm.folio_tmimf.trim(),
        subfolio: tmimfForm.subfolio === '' ? null : Number(tmimfForm.subfolio),
        folio_original: tmimfForm.folio_original.trim() || null,
        unidad_produccion_id: tmimfForm.unidad_produccion_id === '' ? null : Number(tmimfForm.unidad_produccion_id),
        tipo_tarjeta: tmimfForm.tipo_tarjeta,
        pais: tmimfForm.pais.toUpperCase(),
        ruta_id: tmimfForm.ruta_id === '' ? null : Number(tmimfForm.ruta_id),
        modulo_emisor_id: tmimfForm.modulo_emisor_id === '' ? null : Number(tmimfForm.modulo_emisor_id),
        mercado_id: tmimfForm.mercado_id === '' ? null : Number(tmimfForm.mercado_id),
        tipo_transporte_id: tmimfForm.tipo_transporte_id === '' ? null : Number(tmimfForm.tipo_transporte_id),
        placas_transporte: tmimfForm.placas_transporte.trim() || null,
        funcionario_aprobo_id: tmimfForm.funcionario_aprobo_id === '' ? null : Number(tmimfForm.funcionario_aprobo_id),
        semana: tmimfForm.semana.trim() || null,
        fecha_emision: tmimfForm.fecha_emision || null,
        hora_emision: tmimfForm.hora_emision || null,
        vigencia_tarjeta: tmimfForm.vigencia_tarjeta === '' ? null : Number(tmimfForm.vigencia_tarjeta),
        fecha_vencimiento: tmimfForm.fecha_vencimiento || null,
        clave_movilizacion: tmimfForm.clave_movilizacion.trim(),
        nombre_pfa: tmimfForm.nombre_pfa.trim() || null,
        cfmn: tmimfForm.cfmn.trim() || null,
        estatus_bloqueo: tmimfForm.estatus_bloqueo,
        resuelto: Number(tmimfForm.resuelto),
        facturado: Number(tmimfForm.facturado),
        estatus_id: Number(tmimfForm.estatus_id),
      };
      if (tmimfForm.id == null) {
        const created = await fetchJson<Tmimf>(`${API_BASE}/tmimf`, { method: 'POST', body: JSON.stringify(body) });
        setActiveTmimfId(created.id);
        setTmimfForm((p) => ({ ...p, id: created.id }));
        setSuccess('TMIMF creada — ahora puedes agregar sub-folios (detallados).');
      } else {
        await fetchJson(`${API_BASE}/tmimf/${tmimfForm.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('TMIMF actualizada.');
      }
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar TMIMF.'); }
    finally { setSavingTmimf(false); }
  };

  const cancelTmimf = async (item: Tmimf) => {
    const motivo = window.prompt(`Motivo de cancelación de la TMIMF ${item.folio_tmimf}:`);
    if (!motivo || motivo.trim().length < 5) {
      if (motivo !== null) setError('El motivo debe tener al menos 5 caracteres.');
      return;
    }
    setError(''); setSuccess('');
    try {
      await fetchJson(`${API_BASE}/tmimf/${item.id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo: motivo.trim() }) });
      setSuccess('TMIMF cancelada.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cancelar.'); }
  };

  const submitDet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTmimfId) { setError('Primero guarda la TMIMF.'); return; }
    setSavingDet(true); setError(''); setSuccess('');
    try {
      const body = {
        sub_folio: Number(detForm.sub_folio || 0),
        unidad_produccion_id: detForm.unidad_produccion_id === '' ? null : Number(detForm.unidad_produccion_id),
        variedad_id: detForm.variedad_id === '' ? null : Number(detForm.variedad_id),
        cantidad_movilizada: detForm.cantidad_movilizada === '' ? null : Number(detForm.cantidad_movilizada),
        saldo: Number(detForm.saldo || 0),
        cajas_14: detForm.cajas_14 === '' ? null : Number(detForm.cajas_14),
        cajas_15: detForm.cajas_15 === '' ? null : Number(detForm.cajas_15),
        cajas_16: detForm.cajas_16 === '' ? null : Number(detForm.cajas_16),
        cajas_18: detForm.cajas_18 === '' ? null : Number(detForm.cajas_18),
        cajas_20: detForm.cajas_20 === '' ? null : Number(detForm.cajas_20),
        cajas_25: detForm.cajas_25 === '' ? null : Number(detForm.cajas_25),
        cajas_30: detForm.cajas_30 === '' ? null : Number(detForm.cajas_30),
        granel: detForm.granel === '' ? null : Number(detForm.granel),
        tipo_vehiculo_id: detForm.tipo_vehiculo_id === '' ? null : Number(detForm.tipo_vehiculo_id),
        placas: detForm.placas.trim() || null,
        semana: detForm.semana === '' ? null : Number(detForm.semana),
        estatus_id: 1,
      };
      if (editingDetId == null) {
        await fetchJson(`${API_BASE}/tmimf/${activeTmimfId}/detallado`, { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Sub-folio agregado.');
      } else {
        await fetchJson(`${API_BASE}/tmimf/detallado/${editingDetId}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Sub-folio actualizado.');
      }
      await loadDetallados(activeTmimfId);
      setDetForm(EMPTY_DET); setEditingDetId(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar sub-folio.'); }
    finally { setSavingDet(false); }
  };

  const editDet = (d: TmimfDetalle) => {
    setEditingDetId(d.id);
    setDetForm({
      id: d.id,
      sub_folio: String(d.sub_folio),
      unidad_produccion_id: d.unidad_produccion_id ?? '',
      variedad_id: d.variedad_id ?? '',
      cantidad_movilizada: d.cantidad_movilizada == null ? '' : String(d.cantidad_movilizada),
      saldo: String(d.saldo ?? 0),
      cajas_14: d.cajas_14 == null ? '' : String(d.cajas_14),
      cajas_15: d.cajas_15 == null ? '' : String(d.cajas_15),
      cajas_16: d.cajas_16 == null ? '' : String(d.cajas_16),
      cajas_18: d.cajas_18 == null ? '' : String(d.cajas_18),
      cajas_20: d.cajas_20 == null ? '' : String(d.cajas_20),
      cajas_25: d.cajas_25 == null ? '' : String(d.cajas_25),
      cajas_30: d.cajas_30 == null ? '' : String(d.cajas_30),
      granel: d.granel == null ? '' : String(d.granel),
      tipo_vehiculo_id: d.tipo_vehiculo_id ?? '',
      placas: d.placas ?? '',
      semana: d.semana == null ? '' : String(d.semana),
      estatus_id: d.estatus_id,
    });
  };

  const deleteDet = async (id: number) => {
    if (!window.confirm('¿Inactivar este sub-folio?')) return;
    setError('');
    try {
      await fetchJson(`${API_BASE}/tmimf/detallado/${id}`, { method: 'DELETE' });
      setSuccess('Sub-folio inactivado.');
      if (activeTmimfId) await loadDetallados(activeTmimfId);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo inactivar.'); }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">TMIMFs (Movilización)</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Tarjetas emitidas en {activeStateName ?? 'tu estado activo'}. Tipo I (Inválidas) se ocultan automáticamente.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2" onClick={openCreate}>
          <Icon name="add" className="text-base" /> Nueva TMIMF
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Folio, original, clave, placas" className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2 dark:bg-slate-800 dark:border-slate-700" />
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value={1}>Activas</option><option value={2}>Inactivas</option><option value="">Todas</option>
        </select>
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={tipoFilter} onChange={(e) => { setTipoFilter(e.target.value); setPage(1); }}>
          <option value="">Tipo: M y O</option><option value="M">M (Movilización)</option><option value="O">O (Operaciones)</option>
        </select>
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" value={bloqueoFilter} onChange={(e) => { setBloqueoFilter(e.target.value); setPage(1); }}>
          <option value="">Bloqueo: todos</option><option value="N">N (Normal)</option><option value="C">C (Cancelada)</option><option value="B">B (Bloqueada)</option>
        </select>
        <div className="flex gap-2">
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setSearch(q); setPage(1); }}>Buscar</button>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => { setQ(''); setSearch(''); setStatusFilter(1); setTipoFilter(''); setBloqueoFilter(''); setPage(1); }}>Limpiar</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{success}</div>}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-3">Folio</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Unidad / Productor</th>
              <th className="text-left px-4 py-3">Mercado</th>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-4 py-3">Bloqueo</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="px-4 py-4 text-slate-500" colSpan={7}>Cargando...</td></tr> :
             items.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={7}>Sin TMIMFs registradas.</td></tr> :
             items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3">
                  <div className="font-mono font-medium">{item.folio_tmimf}</div>
                  {item.folio_original && <div className="text-xs text-slate-500">orig: {item.folio_original}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${item.tipo_tarjeta === 'M' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>{item.tipo_tarjeta}</span>
                </td>
                <td className="px-4 py-3">
                  {item.unidad_produccion_ni ? (
                    <div>
                      <div className="font-mono text-xs">{item.unidad_produccion_ni}</div>
                      {item.unidad_produccion_nombre && <div className="text-xs text-slate-500">{item.unidad_produccion_nombre}</div>}
                    </div>
                  ) : <span className="italic text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3">{item.mercado_nombre ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">{item.fecha_emision ?? <span className="italic text-slate-400">—</span>}</td>
                <td className="px-4 py-3">
                  {item.estatus_bloqueo === 'C' ? (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800" title={item.motivo_cancelacion ?? ''}>Cancelada</span>
                  ) : item.estatus_bloqueo === 'B' ? (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">Bloqueada</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">Normal</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <button className="rounded-md border border-primary px-2 py-1 text-primary" onClick={() => openEdit(item)}>Ver / Editar</button>
                    {item.estatus_bloqueo === 'N' && (
                      <button className="rounded-md border border-red-300 px-2 py-1 text-red-700" onClick={() => void cancelTmimf(item)}>Cancelar</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">Total: {total} TMIMFs</p>
        <div className="flex items-center gap-2">
          <select className="rounded-lg border border-slate-300 px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-700" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-700" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
          <span className="text-sm text-slate-600 dark:text-slate-300">{page} / {totalPages}</span>
          <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-slate-700" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente</button>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={closeDrawer} aria-hidden="true" />
          <aside className="w-full max-w-3xl bg-white dark:bg-slate-900 shadow-xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{tmimfForm.id == null ? 'Nueva TMIMF' : `TMIMF ${tmimfForm.folio_tmimf}`}</h2>
              <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={closeDrawer}><Icon name="close" className="text-xl" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <form onSubmit={submitTmimf} className="space-y-4">
                <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                  <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">1. Datos de la TMIMF</legend>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Folio TMIMF</label>
                      <input required maxLength={15} value={tmimfForm.folio_tmimf} onChange={(e) => setTmimfForm((p) => ({ ...p, folio_tmimf: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Subfolio</label>
                      <input type="number" value={tmimfForm.subfolio} onChange={(e) => setTmimfForm((p) => ({ ...p, subfolio: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Tipo</label>
                      <select value={tmimfForm.tipo_tarjeta} onChange={(e) => setTmimfForm((p) => ({ ...p, tipo_tarjeta: e.target.value as 'M' | 'O' }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                        <option value="M">M — Movilización</option>
                        <option value="O">O — Operaciones</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Folio original (legacy)</label>
                      <input maxLength={30} value={tmimfForm.folio_original} onChange={(e) => setTmimfForm((p) => ({ ...p, folio_original: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Clave movilización</label>
                      <input maxLength={9} value={tmimfForm.clave_movilizacion} onChange={(e) => setTmimfForm((p) => ({ ...p, clave_movilizacion: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">País</label>
                      <input maxLength={3} value={tmimfForm.pais} onChange={(e) => setTmimfForm((p) => ({ ...p, pais: e.target.value.toUpperCase() }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                  <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">2. Asignación</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Unidad de producción</label>
                      <select value={tmimfForm.unidad_produccion_id} onChange={(e) => setTmimfForm((p) => ({ ...p, unidad_produccion_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                        <option value="">— Sin asignar —</option>
                        {unidades.map((u) => <option key={u.id} value={u.id}>{u.numero_inscripcion}{u.nombre_unidad ? ` - ${u.nombre_unidad}` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Ruta</label>
                      <select value={tmimfForm.ruta_id} onChange={(e) => setTmimfForm((p) => ({ ...p, ruta_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                        <option value="">— Sin asignar —</option>
                        {rutas.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Módulo emisor</label>
                      <select value={tmimfForm.modulo_emisor_id} onChange={(e) => setTmimfForm((p) => ({ ...p, modulo_emisor_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                        <option value="">— Sin asignar —</option>
                        {modulos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Tipo transporte (vehículo)</label>
                      <select value={tmimfForm.tipo_transporte_id} onChange={(e) => setTmimfForm((p) => ({ ...p, tipo_transporte_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700">
                        <option value="">— Sin asignar —</option>
                        {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Placas transporte</label>
                      <input maxLength={25} value={tmimfForm.placas_transporte} onChange={(e) => setTmimfForm((p) => ({ ...p, placas_transporte: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Funcionario aprobó (ID)</label>
                      <input type="number" value={tmimfForm.funcionario_aprobo_id} onChange={(e) => setTmimfForm((p) => ({ ...p, funcionario_aprobo_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Mercado (ID)</label>
                      <input type="number" value={tmimfForm.mercado_id} onChange={(e) => setTmimfForm((p) => ({ ...p, mercado_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                  <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">3. Fechas y vigencia</legend>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Fecha emisión</label>
                      <input type="date" value={tmimfForm.fecha_emision} onChange={(e) => setTmimfForm((p) => ({ ...p, fecha_emision: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Hora emisión</label>
                      <input type="time" value={tmimfForm.hora_emision} onChange={(e) => setTmimfForm((p) => ({ ...p, hora_emision: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Vigencia (días)</label>
                      <input type="number" value={tmimfForm.vigencia_tarjeta} onChange={(e) => setTmimfForm((p) => ({ ...p, vigencia_tarjeta: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Fecha vencimiento</label>
                      <input type="date" value={tmimfForm.fecha_vencimiento} onChange={(e) => setTmimfForm((p) => ({ ...p, fecha_vencimiento: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 dark:text-slate-200 mb-1">Semana</label>
                      <input maxLength={10} value={tmimfForm.semana} onChange={(e) => setTmimfForm((p) => ({ ...p, semana: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                  </div>
                </fieldset>

                <div className="flex justify-end">
                  <button type="submit" disabled={savingTmimf} className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-50">
                    {savingTmimf ? 'Guardando…' : (tmimfForm.id == null ? 'Crear TMIMF' : 'Actualizar TMIMF')}
                  </button>
                </div>
              </form>

              <fieldset className={`space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3 ${activeTmimfId == null ? 'opacity-50 pointer-events-none' : ''}`}>
                <legend className="px-1 text-xs uppercase font-semibold tracking-wider text-slate-500">
                  4. Sub-folios (detallado) {activeTmimfId == null && '(crea la TMIMF primero)'}
                </legend>

                {detallados.length > 0 && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="text-left px-2 py-2">Sub</th>
                          <th className="text-left px-2 py-2">Variedad</th>
                          <th className="text-right px-2 py-2">Cantidad</th>
                          <th className="text-right px-2 py-2">Saldo</th>
                          <th className="text-right px-2 py-2">Granel</th>
                          <th className="text-left px-2 py-2">Vehículo / Placas</th>
                          <th className="text-right px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detallados.map((d) => (
                          <tr key={d.id} className="border-t border-slate-100 dark:border-slate-700">
                            <td className="px-2 py-1.5 font-mono">{d.sub_folio}</td>
                            <td className="px-2 py-1.5">{d.variedad_nombre ?? '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{d.cantidad_movilizada ?? '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{d.saldo}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{d.granel ?? '—'}</td>
                            <td className="px-2 py-1.5">{d.tipo_vehiculo_nombre ?? '—'}{d.placas ? ` · ${d.placas}` : ''}</td>
                            <td className="px-2 py-1.5 text-right">
                              <button type="button" className="text-primary hover:underline mr-2" onClick={() => editDet(d)}>Editar</button>
                              <button type="button" className="text-red-600 hover:underline" onClick={() => void deleteDet(d.id)}>Borrar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <form onSubmit={submitDet} className="space-y-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{editingDetId == null ? 'Agregar sub-folio' : 'Editando sub-folio'}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Sub-folio</label>
                      <input type="number" required min={0} value={detForm.sub_folio} onChange={(e) => setDetForm((p) => ({ ...p, sub_folio: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Cantidad (kg)</label>
                      <input type="number" step="any" value={detForm.cantidad_movilizada} onChange={(e) => setDetForm((p) => ({ ...p, cantidad_movilizada: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Saldo</label>
                      <input type="number" step="any" required value={detForm.saldo} onChange={(e) => setDetForm((p) => ({ ...p, saldo: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Variedad</label>
                      <select value={detForm.variedad_id} onChange={(e) => setDetForm((p) => ({ ...p, variedad_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:bg-slate-800 dark:border-slate-700">
                        <option value="">—</option>
                        {variedades.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Unidad de producción origen</label>
                      <select value={detForm.unidad_produccion_id} onChange={(e) => setDetForm((p) => ({ ...p, unidad_produccion_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:bg-slate-800 dark:border-slate-700">
                        <option value="">—</option>
                        {unidades.map((u) => <option key={u.id} value={u.id}>{u.numero_inscripcion}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {(['cajas_14','cajas_15','cajas_16','cajas_18','cajas_20','cajas_25','cajas_30'] as const).map((k) => (
                      <div key={k}>
                        <label className="block text-[10px] text-slate-600 mb-1">{k.replace('cajas_', 'Cj ')}</label>
                        <input type="number" min={0} value={detForm[k]} onChange={(e) => setDetForm((p) => ({ ...p, [k]: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-1 py-1 text-xs font-mono dark:bg-slate-800 dark:border-slate-700" />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Granel</label>
                      <input type="number" min={0} value={detForm.granel} onChange={(e) => setDetForm((p) => ({ ...p, granel: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Vehículo</label>
                      <select value={detForm.tipo_vehiculo_id} onChange={(e) => setDetForm((p) => ({ ...p, tipo_vehiculo_id: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:bg-slate-800 dark:border-slate-700">
                        <option value="">—</option>
                        {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Placas</label>
                      <input maxLength={10} value={detForm.placas} onChange={(e) => setDetForm((p) => ({ ...p, placas: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    {editingDetId != null && (
                      <button type="button" onClick={() => { setEditingDetId(null); setDetForm(EMPTY_DET); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">Cancelar</button>
                    )}
                    <button type="submit" disabled={savingDet || activeTmimfId == null} className="rounded-lg bg-primary text-white px-4 py-1.5 text-sm disabled:opacity-50">
                      {savingDet ? 'Guardando…' : (editingDetId == null ? 'Agregar' : 'Actualizar')}
                    </button>
                  </div>
                </form>
              </fieldset>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700" onClick={closeDrawer}>Cerrar</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
