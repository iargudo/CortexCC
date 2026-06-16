import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  message: string;
  variant?: "error" | "warning" | "info";
  className?: string;
};

export function SoftphoneStatusBanner({ message, variant = "error", className }: Props) {
  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-2 text-[11px] leading-snug",
        variant === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
        variant === "warning" && "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
        variant === "info" && "border-primary/20 bg-primary/5 text-muted-foreground",
        className
      )}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
        <p className="whitespace-pre-line">{message}</p>
      </div>
    </div>
  );
}
