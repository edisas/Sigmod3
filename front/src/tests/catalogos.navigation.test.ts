import { describe, expect, it } from 'vitest';

import { ADMIN_NAVIGATION } from '@/utils/constants';

function getCatalogChildrenPaths(): string[] {
  const configGeneral = ADMIN_NAVIGATION.find((item) => item.label === 'Configuración General');
  const catalogos = configGeneral?.children?.find((item) => item.label === 'Catalogos');
  return (catalogos?.children ?? []).map((item) => item.path ?? '').filter(Boolean);
}

describe('Catalogos navigation', () => {
  it('contains catalog routes currently implemented under "Catalogos"', () => {
    const paths = getCatalogChildrenPaths();

    // Subrama "Catalogos" dentro de Configuración General (estados, municipios, localidades).
    expect(paths).toContain('/catalogos/estados');
    expect(paths).toContain('/catalogos/municipios');
    expect(paths).toContain('/catalogos/localidades');
    // Nota: tipos-fcoop y figuras-cooperadoras existen como rutas pero están en
    // otra rama de navegación (USER_NAVIGATION). Si alguien los mueve aquí, el
    // test de duplicados detectará colisiones.
  });

  it('does not duplicate catalog routes', () => {
    const paths = getCatalogChildrenPaths();
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });
});
