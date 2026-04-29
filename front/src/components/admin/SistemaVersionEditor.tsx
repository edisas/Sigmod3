import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

interface VersionTriple {
  major: number;
  minor: number;
  patch: number;
  formatted: string;
}

interface SistemaVersion {
  staging: VersionTriple | null;
  produccion: VersionTriple | null;
}

function authHeaders(): HeadersInit {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function SistemaVersionEditor() {
  const [data, setData] = useState<SistemaVersion>({ staging: null, produccion: null });
  const [stagingPatch, setStagingPatch] = useState('');
  const [produccionPatch, setProduccionPatch] = useState('');
  const [produccionMinor, setProduccionMinor] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const r = await fetch(`${API_BASE}/sistema-version`);
      if (r.ok) {
        const d = await r.json() as SistemaVersion;
        setData({ staging: d.staging ?? null, produccion: d.produccion ?? null });
        if (d.staging) setStagingPatch(String(d.staging.patch));
        if (d.produccion) {
          setProduccionPatch(String(d.produccion.patch));
          setProduccionMinor(String(d.produccion.minor));
        }
      }
    } catch { /* ignore */ }
  };

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, []);

  const update = async (env: 'staging' | 'produccion') => {
    setError(''); setSuccess(''); setSaving(true);
    try {
      const body: Record<string, number | string> = { env };
      if (env === 'staging') {
        body.patch = Number(stagingPatch);
      } else {
        body.patch = Number(produccionPatch);
        if (produccionMinor !== '') body.minor = Number(produccionMinor);
      }
      const r = await fetch(`${API_BASE}/sistema-version`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b?.detail ? String(b.detail) : `HTTP ${r.status}`);
      }
      setSuccess(`Versión de ${env} actualizada.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:bg-slate-900 dark:border-slate-700">
      <div>
        <h2 className="font-semibold text-slate-900 dark:text-white">Versión del sistema</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Actualiza el patch tras cada deploy exitoso. Formato: <code className="font-mono">v3.00.090</code> (staging) y <code className="font-mono">v3.01.000+</code> (producción).</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold tracking-wider text-slate-500">Staging</span>
            <span className="font-mono text-sm">{data.staging?.formatted ?? '—'}</span>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Patch (n° de deploy)</label>
            <input type="number" min={0} value={stagingPatch} onChange={(e) => setStagingPatch(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
          </div>
          <button type="button" disabled={saving || stagingPatch === ''} onClick={() => void update('staging')} className="w-full rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-50">
            Actualizar staging
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-semibold tracking-wider text-slate-500">Producción</span>
            <span className="font-mono text-sm">{data.produccion?.formatted ?? '—'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-600 mb-1">Minor</label>
              <input type="number" min={1} value={produccionMinor} onChange={(e) => setProduccionMinor(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" placeholder="01" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Patch</label>
              <input type="number" min={0} value={produccionPatch} onChange={(e) => setProduccionPatch(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-700" />
            </div>
          </div>
          <button type="button" disabled={saving || produccionPatch === ''} onClick={() => void update('produccion')} className="w-full rounded-lg border border-primary text-primary px-4 py-2 text-sm disabled:opacity-50">
            Actualizar producción
          </button>
        </div>
      </div>
    </section>
  );
}
