import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { applyPalette, type SystemPalette } from './utils/palette';
import {
  PUBLIC_ASSETS_STORAGE_KEY,
  PUBLIC_CONFIG_STORAGE_KEY,
  applySystemIdentity,
  getStoredPublicConfig,
  normalizePublicConfig,
} from './utils/systemBranding';

const PALETTE_STORAGE_KEY = 'sigmod_palette';
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

const cachedPalette = localStorage.getItem(PALETTE_STORAGE_KEY);
if (cachedPalette) {
  try {
    const parsed = JSON.parse(cachedPalette) as SystemPalette;
    applyPalette(parsed);
  } catch {
    // no-op: fallback to default palette
  }
}
applySystemIdentity(getStoredPublicConfig().system);

void fetch(`${API_BASE}/configuracion-sistema/publico`)
  .then((response) => (response.ok ? response.json() : null))
  .then((data) => {
    if (!data) return;
    const publicConfig = normalizePublicConfig(data);
    localStorage.setItem(PUBLIC_ASSETS_STORAGE_KEY, JSON.stringify(publicConfig.assets));
    localStorage.setItem(PUBLIC_CONFIG_STORAGE_KEY, JSON.stringify(publicConfig));
    applySystemIdentity(publicConfig.system);
    const palette = data?.palette;
    const activeKey = palette?.active_key;
    const selected = activeKey === 'custom' ? palette?.custom : palette?.presets?.[activeKey];
    if (selected?.colors) {
      applyPalette(selected as SystemPalette);
      localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(selected));
    }
    const faviconUrl = publicConfig.assets.favicon_url;
    if (typeof faviconUrl === 'string' && faviconUrl.trim()) {
      const favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (favicon) favicon.href = faviconUrl;
    }
  })
  .catch(() => {
    // no-op: fallback to defaults
  });

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Ensure index.html has <div id="root"></div>.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
