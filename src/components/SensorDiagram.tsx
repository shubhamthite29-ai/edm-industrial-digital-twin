import type { SensorSpec } from "../types/sensor";

interface SensorDiagramProps {
  sensors: SensorSpec[];
  activeSensor?: SensorSpec | null;
  onSelect: (sensor: SensorSpec) => void;
}

export function SensorDiagram({ sensors, activeSensor, onSelect }: SensorDiagramProps) {
  return (
    <svg viewBox="0 0 100 100" className="h-full min-h-[360px] w-full rounded border border-plant-line bg-plant-void">
      <rect width="100" height="100" fill="#070b12" />
      {[20, 40, 60, 80].map((x) => (
        <line key={`x-${x}`} x1={x} y1="0" x2={x} y2="100" stroke="#1b2534" strokeWidth="0.35" />
      ))}
      {[20, 40, 60, 80].map((y) => (
        <line key={`y-${y}`} x1="0" y1={y} x2="100" y2={y} stroke="#1b2534" strokeWidth="0.35" />
      ))}
      <rect x="10" y="75" width="70" height="15" rx="1" fill="#202b3b" stroke="#34445b" strokeWidth="0.5" />
      <rect x="72" y="15" width="18" height="62" rx="0.6" fill="#172131" stroke="#34445b" strokeWidth="0.5" />
      <rect x="73" y="16" width="16" height="35" rx="0.5" fill="#101826" stroke="#34445b" strokeWidth="0.45" />
      <rect x="73" y="55" width="16" height="20" rx="0.5" fill="#101826" stroke="#34445b" strokeWidth="0.45" />
      <rect x="22" y="60" width="48" height="14" rx="1" fill="#182538" stroke="#34445b" strokeWidth="0.45" />
      <rect x="26" y="52" width="40" height="10" rx="0.5" fill="#0d2c35" stroke="#255565" strokeWidth="0.5" />
      <rect x="11" y="52" width="13" height="22" rx="0.5" fill="#0d2517" stroke="#245a35" strokeWidth="0.45" />
      <rect x="39" y="20" width="14" height="34" rx="1" fill="#1c2e44" stroke="#3a5676" strokeWidth="0.5" />
      <rect x="42" y="43" width="8" height="8" rx="0.5" fill="#172638" stroke="#2e536e" strokeWidth="0.5" />
      <rect x="43.5" y="50" width="5" height="6" rx="0.3" fill="#80623e" stroke="#b28a54" strokeWidth="0.5" />
      <rect x="32" y="57" width="28" height="4" rx="0.3" fill="#31465d" stroke="#52708e" strokeWidth="0.5" />
      <line x1="18" y1="15" x2="65" y2="15" stroke="#25354b" strokeWidth="1" strokeDasharray="2 1" />

      {sensors.map((sensor) => {
        const isActive = activeSensor?.id === sensor.id;
        return (
          <g key={sensor.id} onClick={() => onSelect(sensor)} className="cursor-pointer">
            {isActive ? <circle cx={sensor.x} cy={sensor.y} r="5" fill="none" stroke={sensor.groupColor} strokeWidth="0.6" opacity="0.8" /> : null}
            <circle cx={sensor.x} cy={sensor.y} r={isActive ? 2.4 : 1.7} fill={sensor.groupColor} stroke="#ffffff" strokeWidth={isActive ? 0.5 : 0.15} />
            <text x={sensor.x + 2.7} y={sensor.y + 0.8} fill={sensor.groupColor} fontSize="2" fontWeight="700">
              {sensor.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
