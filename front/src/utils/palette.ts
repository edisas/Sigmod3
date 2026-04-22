export interface SystemPalette {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    neutral_gray: string;
    background_light: string;
    background_dark: string;
    soft_gray: string;
    mint: string;
    sky_blue: string;
  };
}

function hexToRgbTriplet(hex: string): string {
  const normalized = hex.trim().replace('#', '');
  const safe = normalized.length === 3
    ? normalized.split('').map((c) => `${c}${c}`).join('')
    : normalized;
  const value = Number.parseInt(safe, 16);
  if (Number.isNaN(value) || safe.length !== 6) return '0 0 0';
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `${r} ${g} ${b}`;
}

export function applyPalette(palette: SystemPalette): void {
  const root = document.documentElement;
  const body = document.body;

  const values: Record<string, string> = {
    '--color-primary': hexToRgbTriplet(palette.colors.primary),
    '--color-secondary': hexToRgbTriplet(palette.colors.secondary),
    '--color-accent': hexToRgbTriplet(palette.colors.accent),
    '--color-neutral-gray': hexToRgbTriplet(palette.colors.neutral_gray),
    '--color-background-light': hexToRgbTriplet(palette.colors.background_light),
    '--color-background-dark': hexToRgbTriplet(palette.colors.background_dark),
    '--color-soft-gray': hexToRgbTriplet(palette.colors.soft_gray),
    '--color-mint': hexToRgbTriplet(palette.colors.mint),
    '--color-sky-blue': hexToRgbTriplet(palette.colors.sky_blue),
  };

  Object.entries(values).forEach(([key, value]) => {
    root.style.setProperty(key, value, 'important');
    body?.style?.setProperty(key, value, 'important');
  });
}
