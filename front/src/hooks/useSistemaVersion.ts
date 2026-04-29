import { useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const POLL_INTERVAL_MS = 60_000;

interface VersionTriple {
  major: number;
  minor: number;
  patch: number;
  formatted: string;
}

export interface SistemaVersion {
  staging: VersionTriple | null;
  produccion: VersionTriple | null;
}

export interface SistemaVersionState extends SistemaVersion {
  /** Version observada en el primer fetch exitoso (se mantiene viva durante toda la pestaña). */
  initial: VersionTriple | null;
  /** True cuando la version actual difiere de la inicial — el usuario debe recargar. */
  needsReload: boolean;
}

export function useSistemaVersion(): SistemaVersionState {
  const [state, setState] = useState<SistemaVersionState>({
    staging: null,
    produccion: null,
    initial: null,
    needsReload: false,
  });
  const initialRef = useRef<VersionTriple | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const r = await fetch(`${API_BASE}/sistema-version`);
        if (!r.ok) return;
        const d = (await r.json()) as SistemaVersion;
        if (cancelled) return;
        const current = d.staging ?? d.produccion ?? null;
        if (current && !initialRef.current) initialRef.current = current;
        const needsReload =
          !!initialRef.current && !!current && current.formatted !== initialRef.current.formatted;
        setState({
          staging: d.staging ?? null,
          produccion: d.produccion ?? null,
          initial: initialRef.current,
          needsReload,
        });
      } catch { /* ignore */ }
    };

    void fetchOnce();
    const id = setInterval(() => { void fetchOnce(); }, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return state;
}
