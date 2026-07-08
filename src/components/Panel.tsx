import type { PropsWithChildren, ReactNode } from "react";

interface PanelProps extends PropsWithChildren {
  title: string;
  eyebrow?: string;
  accent?: "cyan" | "amber" | "green" | "red" | "violet";
  action?: ReactNode;
  className?: string;
}

const accentClasses = {
  cyan: "border-t-plant-cyan",
  amber: "border-t-plant-amber",
  green: "border-t-plant-green",
  red: "border-t-plant-red",
  violet: "border-t-plant-violet",
};

export function Panel({ title, eyebrow, accent = "cyan", action, className = "", children }: PanelProps) {
  return (
    <section className={`rounded border border-plant-line/80 border-t-2 ${accentClasses[accent]} bg-plant-panel/88 shadow-glow backdrop-blur ${className}`}>
      <header className="flex min-h-11 items-center justify-between gap-3 border-b border-plant-line/70 px-4 py-2">
        <div className="min-w-0">
          {eyebrow ? <div className="text-[10px] uppercase tracking-[0.24em] text-plant-muted">{eyebrow}</div> : null}
          <h2 className="truncate text-sm font-semibold uppercase text-plant-text">{title}</h2>
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
