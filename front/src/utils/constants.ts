import type { NavItem, MetricCard, Alert, WeatherData, FieldData } from '@/types';

export const NAVIGATION_ITEMS: NavItem[] = [
  { icon: 'dashboard', label: 'Panel Principal', path: '/' },
  { icon: 'map', label: 'Vista de Mapa', path: '/map' },
  { icon: 'monitoring', label: 'Análisis de Cultivos', path: '/analytics' },
  { icon: 'sensors', label: 'Red de Sensores', path: '/sensors' },
  { icon: 'eco', label: 'Sostenibilidad', path: '/sustainability' },
];

export const PROCESS_NAVIGATION: NavItem[] = [
  { icon: 'insights', label: 'Dashboard estatal', path: '/dashboard-v3' },
  { icon: 'public', label: 'Dashboard nacional', path: '/dashboard-nacional' },
  {
    icon: 'assignment',
    label: 'Solicitudes de Acceso',
    children: [{ icon: 'list_alt', label: 'Solicitudes', path: '/solicitudes' }],
  },
  { icon: 'verified_user', label: 'Autorizaciones FCOOP', path: '/autorizaciones/figura-cooperadora/listado' },
  { icon: 'agriculture', label: 'Productores', path: '/productores' },
  { icon: 'forest', label: 'Unidades de producción', path: '/unidades-produccion' },
  { icon: 'crop', label: 'Superficies registradas', path: '/superficies' },
  { icon: 'eco', label: 'Estimados de cosecha', path: '/estimados-cosecha' },
  { icon: 'route', label: 'Rutas de trampeo', path: '/rutas' },
  { icon: 'engineering', label: 'Tramperos', path: '/tramperos' },
  { icon: 'bolt', label: 'Captura semanal', path: '/captura-semanal' },
  { icon: 'pest_control', label: 'Trampas', path: '/trampas' },
  { icon: 'fact_check', label: 'Revisiones', path: '/revisiones' },
  { icon: 'science', label: 'Identificaciones', path: '/identificaciones' },
  { icon: 'biotech', label: 'Identificaciones de laboratorio', path: '/identificaciones-lab' },
  { icon: 'sanitizer', label: 'Control quimico', path: '/control-quimico' },
  { icon: 'agriculture', label: 'Control mecanico/cultural', path: '/control-mecanico' },
  { icon: 'spa', label: 'Muestreos de frutos', path: '/muestreos-frutos' },
  { icon: 'description', label: 'Anexos 01 (TMIMF)', path: '/anexos-01' },
  { icon: 'local_shipping', label: 'TMIMFs (Movilización)', path: '/tmimfs' },
  {
    icon: 'inventory_2',
    label: 'Catalogos',
    children: [
      { icon: 'badge', label: 'Tipos de FCOOP', path: '/catalogos/tipos-fcoop' },
      { icon: 'group', label: 'Figura Cooperadora', path: '/catalogos/figuras-cooperadoras' },
    ],
  },
];

export const ADMIN_NAVIGATION: NavItem[] = [
  {
    icon: 'settings',
    label: 'Configuración General',
    children: [
      {
        icon: 'inventory_2',
        label: 'Catalogos',
        children: [
          { icon: 'public', label: 'Estados', path: '/catalogos/estados' },
          { icon: 'location_city', label: 'Municipios', path: '/catalogos/municipios' },
          { icon: 'place', label: 'Localidades', path: '/catalogos/localidades' },
          { icon: 'category', label: 'Auxiliares', path: '/catalogos/auxiliares' },
          { icon: 'bug_report', label: 'Tipos de trampa', path: '/tipos-trampa' },
        ],
      },
      { icon: 'menu_open', label: 'Configuración de Menus', path: '/configuracion/menus' },
      { icon: 'tune', label: 'Configuracion del Sistema', path: '/configuracion/sistema' },
    ],
  },
];

export const DASHBOARD_METRICS: MetricCard[] = [
  {
    label: 'Humedad Suelo',
    value: '42.8%',
    icon: 'water_drop',
    trend: 'up',
    trendLabel: '+2.1% vs ayer',
    colorClass: 'bg-secondary/10 text-secondary',
  },
  {
    label: 'Índice NDVI',
    value: '0.78',
    icon: 'potted_plant',
    trend: 'flat',
    trendLabel: 'Salud Óptima',
    colorClass: 'bg-accent/10 text-primary',
  },
  {
    label: 'Uso de Agua',
    value: '1.2k L/ha',
    icon: 'opacity',
    trend: 'down',
    trendLabel: '-12% Eficiencia',
    colorClass: 'bg-secondary/10 text-secondary',
  },
  {
    label: 'CO2 Mitigado',
    value: '12.4 t',
    icon: 'eco',
    trend: 'up',
    trendLabel: '+5.4% este mes',
    colorClass: 'bg-primary/10 text-primary dark:text-accent',
  },
];

export const SYSTEM_ALERTS: Alert[] = [
  {
    id: 'a1',
    type: 'critical',
    title: 'Sensor Suelo #45',
    message: 'Nivel de humedad crítico detectado.',
    icon: 'emergency',
  },
  {
    id: 'a2',
    type: 'warning',
    title: 'Stock Fertilizante',
    message: 'Menos del 15% restante en bodega.',
    icon: 'inventory',
  },
  {
    id: 'a3',
    type: 'info',
    title: 'Riego Programado',
    message: 'Lote Norte A en 2 horas.',
    icon: 'schedule',
  },
];

export const WEATHER_DATA: WeatherData = {
  temperature: 24,
  condition: 'Despejado',
  humidity: 65,
  wind: '12 km/h NE',
  precipitation: '5% (Prob.)',
  uvIndex: 'Alta (8)',
};

export const SAMPLE_FIELDS: FieldData[] = [
  {
    id: 'f1',
    name: 'North Valley #04',
    crop: 'Wheat',
    hectares: 14.5,
    moisture: 85,
    status: 'healthy',
  },
  {
    id: 'f2',
    name: 'East Ridge #12',
    crop: 'Barley',
    hectares: 8.2,
    moisture: 42,
    status: 'attention',
  },
];

export const CHART_DATA = [
  { month: 'ENE', fertilizer: 40, water: 60 },
  { month: 'FEB', fertilizer: 50, water: 80 },
  { month: 'MAR', fertilizer: 30, water: 40 },
  { month: 'ABR', fertilizer: 70, water: 90 },
  { month: 'MAY', fertilizer: 60, water: 75 },
  { month: 'JUN', fertilizer: 45, water: 55 },
  { month: 'JUL', fertilizer: 50, water: 65 },
];

export const DEFAULT_USER = {
  id: '1',
  fullName: 'Juan Delgado',
  email: 'm.thorne@agrotech.precision.com',
  role: 'admin' as const,
  initials: 'JD',
  phone: '+34 600 123 456',
  bio: 'Specializing in soil health and precision irrigation systems for cereal crops. 12+ years experience in large-scale Mediterranean agriculture management.',
  facility: 'Hacienda El Rosal',
  sector: 'Sector Norte',
};
