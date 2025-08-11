"use client";
import React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export type DonutDatum = { name: string; value: number; color?: string };

export default function Donut({
  data,
  height = 200,
  innerRadius = 60,
  outerRadius = 80,
  className = "",
  showLegend = false,
  centerValueFormatter,
}: {
  data: DonutDatum[];
  height?: number | string;
  innerRadius?: number;
  outerRadius?: number;
  className?: string;
  showLegend?: boolean;
  centerValueFormatter?: (value: number, total: number) => string;
}) {
  const colors = data.map((d) => d.color || defaultColorFor(d.name));
  const total = Math.max(0, data.reduce((acc, d) => acc + (Number(d.value) || 0), 0));
  const primary = data[0]?.value || 0;
  const percent = total > 0 ? Math.round((primary / total) * 100) : 0;
  const centerTop = `${percent}%`;
  const centerBottom = centerValueFormatter ? centerValueFormatter(primary, total) : `${primary}/${total}`;
  return (
    <div className={"relative w-full " + className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            stroke="rgba(255,255,255,0.08)"
          >
            {data.map((entry, index) => (
              <Cell key={`c-${index}`} fill={colors[index]} />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip />} />
          {showLegend ? (
            <Legend wrapperStyle={{ color: "#a3a3a3" }} iconType="circle" />
          ) : null}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center leading-tight">
          <div className="text-lg font-semibold text-white">{centerTop}</div>
          <div className="text-[10px] text-gray-400">{centerBottom}</div>
        </div>
      </div>
    </div>
  );
}

function DonutTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const p = payload[0];
    const name = p?.name ?? "";
    const value = typeof p?.value === "number" ? p.value : 0;
    return (
      <div className="rounded-md border border-white/10 bg-white/5 text-white/90 backdrop-blur px-2 py-1 text-xs">
        <div className="font-medium">{name}</div>
        <div>{new Intl.NumberFormat("de-DE").format(value)}</div>
      </div>
    );
  }
  return null;
}

function defaultColorFor(name: string) {
  // simple mapping with teal/sky accents
  const map: Record<string, string> = {
    Abgeschlossen: "#22d3ee",
    Offen: "#38bdf8",
    Aktiv: "#22d3ee",
    Pausiert: "#64748b",
  };
  return map[name] || "#22d3ee";
}
