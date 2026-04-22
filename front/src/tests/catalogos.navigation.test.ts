import { describe, expect, it } from 'vitest';

import { ADMIN_NAVIGATION } from '@/utils/constants';

function getCatalogChildrenPaths(): string[] {
  const configGeneral = ADMIN_NAVIGATION.find((item) => item.label === 'Configuración General');
  const catalogos = configGeneral?.children?.find((item) => item.label === 'Catalogos');
  return (catalogos?.children ?? []).map((item) => item.path ?? '').filter(Boolean);
}

describe('Catalogos navigation', () => {
  it('contains all catalog routes currently implemented', () => {
    const paths = getCatalogChildrenPaths();

    expect(paths).toContain('/catalogos/estados');
    expect(paths).toContain('/catalogos/municipios');
    expect(paths).toContain('/catalogos/localidades');
    expect(paths).toContain('/catalogos/tipos-fcoop');
    expect(paths).toContain('/catalogos/figuras-cooperadoras');
  });

  it('does not duplicate catalog routes', () => {
    const paths = getCatalogChildrenPaths();
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });
});
