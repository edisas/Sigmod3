import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'sigmod_token';

type MenuNodeType = 'group' | 'link' | 'separator';

interface MenuNode {
  id: string;
  type: MenuNodeType;
  label: string;
  icon?: string;
  path?: string;
  children: MenuNode[];
}

interface SystemConfigPayload {
  navigation?: {
    main_menus?: MenuNode[];
  };
}

function menuNodeId(): string {
  return `menu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createNode(type: MenuNodeType = 'group'): MenuNode {
  return {
    id: menuNodeId(),
    type,
    label: type === 'separator' ? 'Separador' : 'Nuevo menu',
    icon: type === 'separator' ? '' : 'menu',
    path: type === 'link' ? '/' : '',
    children: [],
  };
}

function deepCloneMenus(items: MenuNode[]): MenuNode[] {
  return JSON.parse(JSON.stringify(items)) as MenuNode[];
}

function normalizeMenuNodes(input: unknown): MenuNode[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw, index) => {
    const node = (raw ?? {}) as Partial<MenuNode>;
    const type: MenuNodeType = node.type === 'link' || node.type === 'separator' ? node.type : 'group';
    const label =
      typeof node.label === 'string' && node.label.trim()
        ? node.label
        : type === 'separator'
          ? `Separador ${index + 1}`
          : `Menu ${index + 1}`;

    return {
      id: typeof node.id === 'string' && node.id.trim() ? node.id : menuNodeId(),
      type,
      label,
      icon: typeof node.icon === 'string' ? node.icon : '',
      path: typeof node.path === 'string' ? node.path : '',
      children: normalizeMenuNodes(node.children),
    };
  });
}

function buildDefaultMenus(): MenuNode[] {
  return [
    { id: 'main-operaciones', type: 'group', label: 'Operaciones de Campo', icon: 'dashboard', path: '', children: [] },
    {
      id: 'main-procesos',
      type: 'group',
      label: 'Procesos',
      icon: 'assignment',
      path: '',
      children: [
        {
          id: 'proc-solicitudes',
          type: 'group',
          label: 'Solicitudes de Acceso',
          icon: 'assignment',
          path: '',
          children: [{ id: 'proc-solicitudes-list', type: 'link', label: 'Solicitudes', icon: 'list_alt', path: '/solicitudes', children: [] }],
        },
        { id: 'proc-autorizaciones', type: 'link', label: 'Autorizaciones FCOOP', icon: 'verified_user', path: '/autorizaciones/figura-cooperadora/listado', children: [] },
        {
          id: 'proc-catalogos',
          type: 'group',
          label: 'Catalogos',
          icon: 'inventory_2',
          path: '',
          children: [
            { id: 'proc-catalogos-tipos', type: 'link', label: 'Tipos de FCOOP', icon: 'badge', path: '/catalogos/tipos-fcoop', children: [] },
            { id: 'proc-catalogos-figuras', type: 'link', label: 'Figura Cooperadora', icon: 'group', path: '/catalogos/figuras-cooperadoras', children: [] },
          ],
        },
      ],
    },
    {
      id: 'main-admin',
      type: 'group',
      label: 'Administración',
      icon: 'settings',
      path: '',
      children: [
        {
          id: 'admin-config-general',
          type: 'group',
          label: 'Configuración General',
          icon: 'settings',
          path: '',
          children: [
            {
              id: 'admin-catalogos',
              type: 'group',
              label: 'Catalogos',
              icon: 'inventory_2',
              path: '',
              children: [
                { id: 'admin-estados', type: 'link', label: 'Estados', icon: 'public', path: '/catalogos/estados', children: [] },
                { id: 'admin-municipios', type: 'link', label: 'Municipios', icon: 'location_city', path: '/catalogos/municipios', children: [] },
                { id: 'admin-localidades', type: 'link', label: 'Localidades', icon: 'place', path: '/catalogos/localidades', children: [] },
              ],
            },
            { id: 'admin-config-menus', type: 'link', label: 'Configuración de Menus', icon: 'menu_open', path: '/configuracion/menus', children: [] },
            { id: 'admin-config-sistema', type: 'link', label: 'Configuracion del Sistema', icon: 'tune', path: '/configuracion/sistema', children: [] },
          ],
        },
      ],
    },
  ];
}

function hasPath(nodes: MenuNode[], path: string): boolean {
  return nodes.some((node) => node.path === path || hasPath(node.children, path));
}

function ensureCriticalMenuEntries(nodes: MenuNode[]): MenuNode[] {
  const tree = deepCloneMenus(nodes);
  if (hasPath(tree, '/configuracion/menus')) return tree;

  const admin = tree.find((node) => node.type === 'group' && node.label.toLowerCase().includes('administr'));
  if (!admin) {
    tree.push({
      id: menuNodeId(),
      type: 'group',
      label: 'Administración',
      icon: 'settings',
      path: '',
      children: [
        {
          id: menuNodeId(),
          type: 'link',
          label: 'Configuración de Menus',
          icon: 'menu_open',
          path: '/configuracion/menus',
          children: [],
        },
      ],
    });
    return tree;
  }

  const configGroup = admin.children.find((node) => node.type === 'group' && node.label.toLowerCase().includes('config'));
  if (configGroup) {
    configGroup.children.push({
      id: menuNodeId(),
      type: 'link',
      label: 'Configuración de Menus',
      icon: 'menu_open',
      path: '/configuracion/menus',
      children: [],
    });
  } else {
    admin.children.push({
      id: menuNodeId(),
      type: 'link',
      label: 'Configuración de Menus',
      icon: 'menu_open',
      path: '/configuracion/menus',
      children: [],
    });
  }
  return tree;
}

function withUpdatedNode(items: MenuNode[], nodeId: string, updater: (node: MenuNode) => MenuNode): MenuNode[] {
  return items.map((node) => {
    if (node.id === nodeId) return updater(node);
    if (!node.children.length) return node;
    return { ...node, children: withUpdatedNode(node.children, nodeId, updater) };
  });
}

interface FoundNode {
  parent: MenuNode | null;
  index: number;
  siblings: MenuNode[];
}

function findNodeContext(items: MenuNode[], nodeId: string, parent: MenuNode | null = null): FoundNode | null {
  for (let i = 0; i < items.length; i += 1) {
    const node = items[i];
    if (node.id === nodeId) {
      return { parent, index: i, siblings: items };
    }
    const nested = findNodeContext(node.children, nodeId, node);
    if (nested) return nested;
  }
  return null;
}

function removeNode(items: MenuNode[], nodeId: string): { tree: MenuNode[]; removed: MenuNode | null } {
  const cloned = deepCloneMenus(items);
  const context = findNodeContext(cloned, nodeId);
  if (!context) return { tree: cloned, removed: null };
  const [removed] = context.siblings.splice(context.index, 1);
  return { tree: cloned, removed: removed ?? null };
}

function moveNodeBefore(items: MenuNode[], movingId: string, targetId: string): MenuNode[] {
  if (movingId === targetId) return items;
  const { tree: treeWithoutNode, removed } = removeNode(items, movingId);
  if (!removed) return items;
  const context = findNodeContext(treeWithoutNode, targetId);
  if (!context) return items;
  context.siblings.splice(context.index, 0, removed);
  return treeWithoutNode;
}

function moveNodeUpDown(items: MenuNode[], nodeId: string, direction: -1 | 1): MenuNode[] {
  const cloned = deepCloneMenus(items);
  const context = findNodeContext(cloned, nodeId);
  if (!context) return items;
  const nextIndex = context.index + direction;
  if (nextIndex < 0 || nextIndex >= context.siblings.length) return items;
  const [node] = context.siblings.splice(context.index, 1);
  context.siblings.splice(nextIndex, 0, node);
  return cloned;
}

function indentNode(items: MenuNode[], nodeId: string): MenuNode[] {
  const cloned = deepCloneMenus(items);
  const context = findNodeContext(cloned, nodeId);
  if (!context || context.index === 0) return items;
  const previousSibling = context.siblings[context.index - 1];
  if (!previousSibling || previousSibling.type === 'separator') return items;
  const [node] = context.siblings.splice(context.index, 1);
  previousSibling.children = [...previousSibling.children, node];
  return cloned;
}

function outdentNode(items: MenuNode[], nodeId: string): MenuNode[] {
  const cloned = deepCloneMenus(items);
  const context = findNodeContext(cloned, nodeId);
  if (!context || !context.parent) return items;
  const parentContext = findNodeContext(cloned, context.parent.id);
  if (!parentContext) return items;
  const [node] = context.siblings.splice(context.index, 1);
  parentContext.siblings.splice(parentContext.index + 1, 0, node);
  return cloned;
}

function addChildNode(items: MenuNode[], parentId: string, type: MenuNodeType): MenuNode[] {
  return withUpdatedNode(items, parentId, (node) => ({
    ...node,
    type: node.type === 'separator' ? 'group' : node.type,
    children: [...node.children, createNode(type)],
  }));
}

export default function MenuSettingsPage() {
  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);
  const [menus, setMenus] = useState<MenuNode[]>(buildDefaultMenus());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const collapseAll = (nodes: MenuNode[]): Record<string, boolean> => {
    const all: Record<string, boolean> = {};
    const walk = (items: MenuNode[]) => {
      items.forEach((node) => {
        all[node.id] = false;
        if (node.children.length) walk(node.children);
      });
    };
    walk(nodes);
    return all;
  };

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    const load = async () => {
      setError('');
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE}/configuracion-sistema`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as SystemConfigPayload;
        const loaded = normalizeMenuNodes(data.navigation?.main_menus);
        const nextMenus = ensureCriticalMenuEntries(loaded.length ? loaded : buildDefaultMenus());
        setMenus(nextMenus);
        setExpandedNodes(collapseAll(nextMenus));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        setError(`No fue posible cargar los menús. (${message})`);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [token]);

  const saveMenus = async () => {
    if (!token) return;
    setError('');
    setSuccess('');
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE}/configuracion-sistema`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          navigation: {
            main_menus: ensureCriticalMenuEntries(menus),
          },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      window.dispatchEvent(new Event('sigmod-public-config-updated'));
      setSuccess('Configuración de menús guardada correctamente.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(`No fue posible guardar los menús. (${message})`);
    } finally {
      setIsSaving(false);
    }
  };

  const renderNodes = (nodes: MenuNode[], depth = 0) => (
    <div className="space-y-2">
      {nodes.map((node) => (
        <div
          key={node.id}
          draggable
          onDragStart={() => setDraggingId(node.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (!draggingId) return;
            setMenus((prev) => moveNodeBefore(prev, draggingId, node.id));
            setDraggingId(null);
          }}
          className="rounded-xl border border-slate-200 bg-white p-3"
          style={{ marginLeft: `${depth * 16}px` }}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
            <div className="md:col-span-1 flex items-center gap-2 text-slate-400">
              {node.children.length > 0 ? (
                <button
                  type="button"
                  className="rounded border border-slate-300 p-0.5"
                  onClick={() =>
                    setExpandedNodes((prev) => ({
                      ...prev,
                      [node.id]: !(prev[node.id] ?? true),
                    }))
                  }
                  title={(expandedNodes[node.id] ?? false) ? 'Colapsar' : 'Expandir'}
                >
                  <Icon name={(expandedNodes[node.id] ?? false) ? 'expand_less' : 'expand_more'} className="text-base" />
                </button>
              ) : null}
              <Icon name="drag_indicator" className="text-lg" />
            </div>

            <select
              value={node.type}
              onChange={(e) =>
                setMenus((prev) =>
                  withUpdatedNode(prev, node.id, (currentNode) => ({
                    ...currentNode,
                    type: e.target.value as MenuNodeType,
                  })),
                )
              }
              className="md:col-span-2 rounded-lg border border-slate-300 px-2 py-2 text-xs"
            >
              <option value="group">Grupo</option>
              <option value="link">Enlace</option>
              <option value="separator">Separador</option>
            </select>

            <input
              value={node.label}
              onChange={(e) =>
                setMenus((prev) =>
                  withUpdatedNode(prev, node.id, (currentNode) => ({
                    ...currentNode,
                    label: e.target.value,
                  })),
                )
              }
              placeholder="Nombre"
              className="md:col-span-3 rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />

            <input
              value={node.icon ?? ''}
              onChange={(e) =>
                setMenus((prev) =>
                  withUpdatedNode(prev, node.id, (currentNode) => ({
                    ...currentNode,
                    icon: e.target.value,
                  })),
                )
              }
              placeholder="Icono"
              disabled={node.type === 'separator'}
              className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />

            <input
              value={node.path ?? ''}
              onChange={(e) =>
                setMenus((prev) =>
                  withUpdatedNode(prev, node.id, (currentNode) => ({
                    ...currentNode,
                    path: e.target.value,
                  })),
                )
              }
              placeholder="/ruta"
              disabled={node.type !== 'link'}
              className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />

            <div className="md:col-span-2 flex flex-wrap gap-1 justify-end">
              <button type="button" className="rounded-md border border-slate-300 px-2 py-1 text-xs" onClick={() => setMenus((prev) => moveNodeUpDown(prev, node.id, -1))}>Subir</button>
              <button type="button" className="rounded-md border border-slate-300 px-2 py-1 text-xs" onClick={() => setMenus((prev) => moveNodeUpDown(prev, node.id, 1))}>Bajar</button>
              <button type="button" className="rounded-md border border-slate-300 px-2 py-1 text-xs" onClick={() => setMenus((prev) => indentNode(prev, node.id))}>Subnivel</button>
              <button type="button" className="rounded-md border border-slate-300 px-2 py-1 text-xs" onClick={() => setMenus((prev) => outdentNode(prev, node.id))}>Subir nivel</button>
              <button type="button" className="rounded-md border border-slate-300 px-2 py-1 text-xs" onClick={() => setMenus((prev) => addChildNode(prev, node.id, 'group'))}>+Grupo</button>
              <button type="button" className="rounded-md border border-slate-300 px-2 py-1 text-xs" onClick={() => setMenus((prev) => addChildNode(prev, node.id, 'link'))}>+Link</button>
              <button type="button" className="rounded-md border border-slate-300 px-2 py-1 text-xs" onClick={() => setMenus((prev) => addChildNode(prev, node.id, 'separator'))}>+Sep</button>
              <button
                type="button"
                className="rounded-md border border-red-300 text-red-700 px-2 py-1 text-xs"
                onClick={() => setMenus((prev) => removeNode(prev, node.id).tree)}
              >
                Eliminar
              </button>
            </div>
          </div>

          {node.children.length > 0 && (expandedNodes[node.id] ?? false) && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              {renderNodes(node.children, depth + 1)}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configuración de Menus</h1>
          <p className="text-sm text-slate-600 mt-1">
            Organiza los menús con arrastrar y soltar, crea menús principales, subniveles y separadores.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            onClick={() => {
              const all: Record<string, boolean> = {};
              const walk = (nodes: MenuNode[]) => {
                nodes.forEach((node) => {
                  all[node.id] = true;
                  if (node.children.length) walk(node.children);
                });
              };
              walk(menus);
              setExpandedNodes(all);
            }}
          >
            Expandir todo
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            onClick={() => {
              setExpandedNodes(collapseAll(menus));
            }}
          >
            Colapsar todo
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            onClick={() => setMenus((prev) => [...prev, createNode('group')])}
          >
            + Menú principal
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            onClick={() => setMenus((prev) => [...prev, createNode('separator')])}
          >
            + Separador
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            onClick={() => setMenus(buildDefaultMenus())}
          >
            Restablecer base
          </button>
          <button
            type="button"
            disabled={isSaving || isLoading}
            className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-60"
            onClick={() => void saveMenus()}
          >
            {isSaving ? 'Guardando...' : 'Guardar menús'}
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Cargando configuración de menús...</div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">{renderNodes(menus)}</div>
      )}
    </div>
  );
}
