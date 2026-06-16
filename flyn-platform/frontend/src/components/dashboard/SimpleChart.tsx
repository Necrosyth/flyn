import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BarData {
  label: string;
  value: number;
}

interface SimpleBarChartProps {
  data: BarData[];
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  maxValue?: number;
  className?: string;
}

export function SimpleBarChart({
  data,
  title,
  actionLabel,
  onAction,
  maxValue,
  className,
}: SimpleBarChartProps) {
  const max = maxValue || Math.max(...data.map((d) => d.value));

  return (
    <Card className={cn("border-0 flyn-card", className)}>
      <CardContent className="p-5">
        {title && <h3 className="font-semibold text-lg mb-4">{title}</h3>}
        
        <div className="flex items-end gap-2 h-40">
          {data.map((item, i) => {
            const height = (item.value / max) * 100;
            return (
              <div key={item.label} className="flex-1 flex flex-col items-center gap-2">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ delay: i * 0.1, duration: 0.4 }}
                  className="w-full rounded-t-lg bg-gradient-to-t from-primary to-flyn-cyan"
                />
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
            );
          })}
        </div>

        {/* Y-axis labels */}
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>0</span>
          <span>{Math.round(max / 2)}</span>
          <span>{max}</span>
        </div>

        {actionLabel && (
          <Button
            onClick={onAction}
            className="w-full mt-4 flyn-button-gradient"
          >
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface ProgressRingProps {
  value: number;
  max?: number;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ProgressRing({
  value,
  max = 100,
  label,
  size = "md",
  className,
}: ProgressRingProps) {
  const percentage = (value / max) * 100;
  const sizes = {
    sm: { container: "w-16 h-16", text: "text-lg" },
    md: { container: "w-24 h-24", text: "text-2xl" },
    lg: { container: "w-32 h-32", text: "text-3xl" },
  };

  return (
    <div className={cn("text-center", className)}>
      <div
        className={cn(
          "relative mx-auto rounded-full bg-muted flex items-center justify-center",
          sizes[size].container
        )}
        style={{
          background: `conic-gradient(hsl(var(--primary)) ${percentage}%, hsl(var(--muted)) ${percentage}%)`,
        }}
      >
        <div className="absolute inset-2 rounded-full bg-card flex items-center justify-center">
          <span className={cn("font-bold", sizes[size].text)}>{value}%</span>
        </div>
      </div>
      {label && <p className="text-sm text-muted-foreground mt-2">{label}</p>}
    </div>
  );
}
