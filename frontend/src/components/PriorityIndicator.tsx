import { cn } from "@/lib/utils";

export function PriorityIndicator({ priority }: { priority: number }) {
  const getColor = () => {
    if (priority <= 2) return "bg-priority-high";
    if (priority <= 4) return "bg-priority-medium";
    if (priority <= 6) return "bg-priority-normal";
    return "bg-priority-low";
  };
  return (
    <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-primary-foreground", getColor())}>
      {priority}
    </span>
  );
}

export function SlaBar({ percent }: { percent: number }) {
  const getColor = () => {
    if (percent < 70) return "bg-sla-ok";
    if (percent < 90) return "bg-sla-warning";
    return "bg-sla-breach";
  };
  return (
    <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", getColor())} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}
