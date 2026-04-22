import Icon from '@/components/ui/Icon';
import type { WeatherData } from '@/types';

interface Props {
  weather: WeatherData;
}

export default function WeatherCard({ weather }: Props) {
  return (
    <div className="bg-primary text-white p-6 rounded-2xl shadow-lg">
      <div className="flex items-center gap-3 mb-4">
        <Icon name="wb_sunny" className="text-secondary" />
        <h3 className="font-bold text-lg">Predicción Local</h3>
      </div>
      <div className="text-4xl font-black mb-1">{weather.temperature}°C</div>
      <p className="text-secondary text-sm font-medium mb-6">
        {weather.condition} • Humedad {weather.humidity}%
      </p>
      <div className="space-y-4">
        {[
          { label: 'Viento', value: weather.wind },
          { label: 'Precipitación', value: weather.precipitation },
          { label: 'Radiación UV', value: weather.uvIndex },
        ].map((item) => (
          <div
            key={item.label}
            className="flex justify-between items-center text-xs py-2 border-t border-white/10"
          >
            <span>{item.label}</span>
            <span className="font-bold">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
