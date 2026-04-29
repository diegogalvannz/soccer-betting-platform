"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { MonthlyBreakdown } from "@/types";

type Props = { data: MonthlyBreakdown[] };

export function ROIChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--foreground))",
          }}
          formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "P&L"]}
        />
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={2} />
        <Bar
          dataKey="profit"
          radius={[4, 4, 0, 0]}
          fill="#22c55e"
          // Color bars red if negative
          label={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
