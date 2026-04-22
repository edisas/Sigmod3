# AgroTech Precision Admin Dashboard

Panel de administración para agricultura de precisión, construido con React 19, TypeScript y Tailwind CSS.

## Tecnologías

- **React 19** con TypeScript strict mode
- **Vite 6** como bundler
- **Tailwind CSS 3.4** para estilos
- **React Router DOM 7** para navegación
- **DOMPurify** para sanitización XSS

## Estructura del Proyecto

```
src/
├── components/
│   ├── auth/           # ProtectedRoute, guards
│   ├── dashboard/      # MetricCards, MapCard, Charts, Weather, Alerts
│   ├── errors/         # ErrorLayout compartido
│   ├── layout/         # AdminLayout, Sidebar, Header, AuthLayout
│   └── ui/             # Icon, componentes reutilizables
├── context/            # AuthContext, ThemeContext
├── hooks/              # useIsMobile, useSidebar, useDebounce
├── pages/              # Todas las páginas de la app
├── types/              # TypeScript interfaces
├── utils/              # Security utils, constants
└── styles/             # Tailwind globals
```

## Páginas Incluidas

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/` | Dashboard | Panel principal con métricas, mapa, clima, alertas |
| `/login` | Login | Inicio de sesión con validación |
| `/register` | Registro | Registro de nuevos usuarios |
| `/profile` | Perfil | Perfil de usuario con campos asignados |
| `/403` | Forbidden | Acceso restringido |
| `/500` | Server Error | Error del servidor |
| `/connection-error` | Sin Conexión | Error de conectividad |
| `/*` | 404 | Página no encontrada |

## Seguridad Implementada

- Sanitización de inputs con DOMPurify (prevención XSS)
- Validación de email RFC 5322
- Validación de fortaleza de contraseña
- Rate limiting en intentos de login (5 intentos / 15 min)
- Generación de nonces CSRF
- Headers de seguridad HTTP en index.html
- Rutas protegidas con guards de autenticación
- maxLength en todos los inputs

## Instalación

```bash
npm install
cp .env.example .env
npm run dev
```

## Variable de entorno API

```bash
VITE_API_URL=http://localhost:8000/api/v1
```

## Build de Producción

```bash
npm run build
npm run preview
```

## Responsive Design

- Mobile-first con breakpoints: `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`
- Sidebar colapsable en móvil con overlay
- Grid adaptativo en todas las secciones
- Touch-friendly con áreas de toque adecuadas
- Tipografía escalable

## Licencia

Privado - AgroTech Precision Systems
