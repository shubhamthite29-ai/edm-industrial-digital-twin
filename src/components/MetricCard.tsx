interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  tone?: "cyan" | "amber" | "green" | "red" | "violet";
  sublabel?: string;
}

const toneClasses = {
  cyan: "text-plant-cyan",
  amber: "text-plant-amber",
  green: "text-plant-green",
  red: "text-plant-red",
  violet: "text-plant-violet",
};

export function MetricCard({ label, value, unit, tone = "cyan", sublabel }: MetricCardProps) {
  return (
    <div className="min-h-[92px] rounded border border-plant-line bg-plant-deck px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-plant-muted">{label}</div>
      <div className="mt-2 flex items-end gap-1 font-mono">
        <span className={`text-2xl font-semibold ${toneClasses[tone]}`}>{value}</span>
        {unit ? <span className="pb-1 text-[11px] text-plant-muted">{unit}</span> : null}
      </div>
      {sublabel ? <div className="mt-2 truncate text-xs text-plant-muted">{sublabel}</div> : null}
    </div>
  );
}
