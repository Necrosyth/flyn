import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

interface BarData {
  label: string;
  value: number;
  color?: string;
}

interface ChartConfig {
  id: string;
  title: string;
  type: "bar" | "line" | "progress" | "donut";
  data: BarData[];
}

interface AnalyticsPanelProps {
  charts: ChartConfig[];
  timeRanges?: { label: string; value: string }[];
  selectedRange?: string;
  onRangeChange?: (range: string) => void;
  maxCharts?: number;
  className?: string;
}

// Palette used across all chart types
const PALETTE = [
  "#6366f1", // indigo
  "#22d3ee", // cyan
  "#a855f7", // purple
  "#34d399", // emerald
  "#f59e0b", // amber
  "#f472b6", // pink
  "#60a5fa", // blue
  "#fb7185", // rose
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover/95 backdrop-blur px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-muted-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-semibold text-foreground">
          {p.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
};

function RechartBar({ data }: { data: BarData[] }) {
  const formatted = data.map((d) => ({ name: d.label, value: d.value }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={formatted} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "currentColor", fillOpacity: 0.05 }} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {formatted.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function RechartLine({ data }: { data: BarData[] }) {
  const formatted = data.map((d) => ({ name: d.label, value: d.value }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={formatted} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Line type="monotone" dataKey="value" stroke={PALETTE[0]} strokeWidth={2} dot={{ fill: PALETTE[0], r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function RechartDonut({ data }: { data: BarData[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={96} height={96}>
        <PieChart>
          <Pie
            data={data.map((d) => ({ name: d.label, value: d.value }))}
            cx="50%"
            cy="50%"
            innerRadius={28}
            outerRadius={44}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5 min-w-0">
        {data.slice(0, 5).map((item, i) => (
          <div key={item.label} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
              <span className="text-muted-foreground truncate">{item.label}</span>
            </div>
            <span className="font-medium text-foreground flex-shrink-0">
              {total > 0 ? `${Math.round((item.value / total) * 100)}%` : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBars({ data }: { data: BarData[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.slice(0, 5).map((item, i) => (
        <div key={item.label} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground truncate max-w-[70%]">{item.label}</span>
            <span className="font-medium text-foreground">{item.value.toLocaleString()}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(item.value / max) * 100}%` }}
              transition={{ delay: i * 0.08, duration: 0.5, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * AnalyticsPanel — Layer 4 of Dashboard
 * Uses Recharts for bar, line, and donut charts.
 * Falls back to animated progress bars for "progress" type.
 */
export function AnalyticsPanel({
  charts,
  timeRanges = [
    { label: "7 days", value: "7d" },
    { label: "30 days", value: "30d" },
    { label: "90 days", value: "90d" },
    { label: "1 year", value: "1y" },
  ],
  selectedRange = "30d",
  onRangeChange,
  maxCharts = 5,
  className,
}: AnalyticsPanelProps) {
  const [range, setRange] = useState(selectedRange);

  const displayCharts = charts.slice(0, Math.min(maxCharts, 5));

  const handleRangeChange = (value: string) => {
    setRange(value);
    onRangeChange?.(value);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Analytics</p>
        <Select value={range} onValueChange={handleRangeChange}>
          <SelectTrigger className="h-7 w-24 text-xs bg-muted border-border text-foreground/80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border text-foreground text-xs">
            {timeRanges.map((tr) => (
              <SelectItem key={tr.value} value={tr.value} className="text-xs">
                {tr.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {displayCharts.map((chart, index) => (
        <motion.div
          key={chart.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.08, duration: 0.2 }}
        >
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground">{chart.title}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-1">
              {chart.type === "bar" && <RechartBar data={chart.data} />}
              {chart.type === "line" && <RechartLine data={chart.data} />}
              {chart.type === "donut" && <RechartDonut data={chart.data} />}
              {chart.type === "progress" && <ProgressBars data={chart.data} />}
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
