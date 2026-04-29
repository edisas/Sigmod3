import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

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

export function useSistemaVersion(): SistemaVersion {
  const [version, setVersion] = useState<SistemaVersion>({ staging: null, produccion: null });

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/sistema-version`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled && data) setVersion({ staging: data.staging ?? null, produccion: data.produccion ?? null }); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, []);

  return version;
}
