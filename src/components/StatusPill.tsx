interface StatusPillProps {
  label: string;
  tone?: "cyan" | "amber" | "green" | "red" | "violet";
}

const toneClasses = {
  cyan: "border-plant-cyan/50 bg-plant-cyan/10 text-plant-cyan",
  amber: "border-plant-amber/50 bg-plant-amber/10 text-plant-amber",
  green: "border-plant-green/50 bg-plant-green/10 text-plant-green",
  red: "border-plant-red/50 bg-plant-red/10 text-plant-red",
  violet: "border-plant-violet/50 bg-plant-violet/10 text-plant-violet",
};

export function StatusPill({ label, tone = "cyan" }: StatusPillProps) {
  return <span className={`inline-flex h-7 items-center rounded border px-2.5 text-xs font-semibold uppercase tracking-wide ${toneClasses[tone]}`}>{label}</span>;
}
