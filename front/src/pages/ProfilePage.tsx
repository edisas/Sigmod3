import Icon from '@/components/ui/Icon';
import { useAuth } from '@/context/AuthContext';
import { SAMPLE_FIELDS } from '@/utils/constants';

export default function ProfilePage() {
  const { user } = useAuth();

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      healthy: 'bg-accent/20 text-primary border-accent/30',
      attention: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      critical: 'bg-red-100 text-red-700 border-red-200',
    };
    const labels: Record<string, string> = { healthy: 'Healthy', attention: 'Attention', critical: 'Critical' };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight border ${map[status]}`}>
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Hero Card */}
        <div className="relative card overflow-hidden">
          <div className="h-32 bg-primary relative">
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, #fff 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            />
          </div>
          <div className="px-4 sm:px-8 pb-8 flex flex-col sm:flex-row items-start sm:items-end gap-4 sm:gap-6 -mt-12 relative z-10">
            <div className="size-24 sm:size-32 rounded-2xl border-4 border-white dark:border-slate-900 bg-secondary flex items-center justify-center text-primary font-black text-3xl sm:text-4xl shadow-lg">
              {user?.initials ?? 'U'}
            </div>
            <div className="flex-1 pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                    {user?.fullName ?? 'Usuario'}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1 text-sm font-medium">
                      <Icon name="agriculture" className="text-sm" /> Senior Agronomist
                    </span>
                    <span className="size-1 bg-slate-300 rounded-full hidden sm:block" />
                    <span className="flex items-center gap-1 text-sm">
                      <Icon name="location_on" className="text-sm" /> {user?.sector ?? 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2">
                    <Icon name="edit" className="text-lg" /> Editar Perfil
                  </button>
                  <button className="btn-secondary px-5 py-2.5 text-sm">
                    Ver Perfil Público
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="space-y-8">
            {/* Personal Info */}
            <div className="card p-6">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Icon name="contact_mail" className="text-primary" />
                Información Personal
              </h3>
              <div className="space-y-4">
                {[
                  { label: 'Email', value: user?.email ?? '' },
                  { label: 'Teléfono', value: user?.phone ?? '' },
                ].map((item) => (
                  <div key={item.label} className="first:pt-0 pt-4 first:border-0 border-t border-soft-gray/10">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      {item.label}
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{item.value}</p>
                  </div>
                ))}
                <div className="pt-4 border-t border-soft-gray/10">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Bio</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {user?.bio}
                  </p>
                </div>
              </div>
            </div>

            {/* Security */}
            <div className="card p-6">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Icon name="security" className="text-primary" />
                Seguridad
              </h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Autenticación de Dos Factores</p>
                    <p className="text-xs text-slate-500">Asegura tu cuenta con 2FA</p>
                  </div>
                  <div className="relative inline-flex items-center">
                    <div className="w-11 h-6 bg-accent rounded-full relative cursor-pointer">
                      <div className="absolute top-[2px] right-[2px] bg-white border border-gray-300 rounded-full h-5 w-5 transition-all" />
                    </div>
                  </div>
                </div>
                <button className="w-full text-left flex items-center justify-between py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-primary transition-colors">
                  Cambiar Contraseña
                  <Icon name="chevron_right" className="text-slate-400" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Assigned Fields */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Icon name="grid_view" className="text-primary" />
                  Campos Asignados
                </h3>
                <button className="text-sm font-semibold text-primary dark:text-secondary hover:underline">
                  Ver Todos
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SAMPLE_FIELDS.map((field) => (
                  <div key={field.id} className="card p-4 flex gap-4 hover:shadow-md transition-all group cursor-pointer">
                    <div className="size-16 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 flex items-center justify-center">
                      <Icon name="landscape" className="text-3xl text-primary/30" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="font-bold text-sm">{field.name}</p>
                        {statusBadge(field.status)}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {field.crop} • {field.hectares} Hectáreas
                      </p>
                      <div className="flex items-center gap-3 mt-3">
                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              field.moisture > 60 ? 'bg-secondary' : 'bg-yellow-400'
                            }`}
                            style={{ width: `${field.moisture}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600">
                          {field.moisture}% Humedad
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Account Settings */}
            <div className="card overflow-hidden">
              <div className="p-6 border-b border-soft-gray/10">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Icon name="settings_applications" className="text-primary" />
                  Configuración de Cuenta
                </h3>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Preferencias de Notificación
                  </span>
                  <div className="mt-3 space-y-3">
                    {[
                      { label: 'Alertas críticas de cultivo (SMS & Push)', checked: true },
                      { label: 'Resúmenes semanales (Email)', checked: true },
                      { label: 'Noticias de actualización del sistema', checked: false },
                    ].map((n) => (
                      <label key={n.label} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          defaultChecked={n.checked}
                          className="rounded border-soft-gray text-primary focus:ring-primary h-5 w-5"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-400">{n.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-soft-gray/10">
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Idioma</label>
                    <select className="w-full mt-1 rounded-xl border-soft-gray/30 bg-slate-50 dark:bg-slate-800 text-sm focus:border-primary focus:ring-primary py-2 px-3">
                      <option>Español (ES)</option>
                      <option>English (US)</option>
                      <option>Français (FR)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Unidades de Medida
                    </label>
                    <select className="w-full mt-1 rounded-xl border-soft-gray/30 bg-slate-50 dark:bg-slate-800 text-sm focus:border-primary focus:ring-primary py-2 px-3">
                      <option>Métrico (C°, kg, ha)</option>
                      <option>Imperial (F°, lb, ac)</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
                <button className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900">
                  Cancelar
                </button>
                <button className="btn-primary px-6 py-2 text-sm">
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
