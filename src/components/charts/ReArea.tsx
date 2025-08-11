"use client";
import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export type ReAreaPoint = { name: string; value: number };

export default function ReArea({
  data,
  color = "#22d3ee",
  fillOpacity = 0.15,
  height = 160,
  showYAxis = false,
  className = "",
  valueFormatter,
  xLabelStep = 2,
  xTickFormatter,
}: {
  data: ReAreaPoint[];
  color?: string;
  fillOpacity?: number;
  height?: number | string;
  showYAxis?: boolean;
  className?: string;
  valueFormatter?: (v: number) => string;
  xLabelStep?: number; // show every nth label
  xTickFormatter?: (value: any, index: number) => string;
}) {
  const fill = hexToRgba(color, fillOpacity);
  return (
    <div className={"w-full " + className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "#9CA3AF", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: any, index: number) => {
              if (xTickFormatter) return xTickFormatter(value, index);
              return index % Math.max(1, xLabelStep) === 0 ? String(value) : "";
            }}
          />
          {showYAxis ? (
            <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={false} axisLine={false} />
          ) : null}
          <Tooltip content={<CustomTooltip valueFormatter={valueFormatter} />} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#areaFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CustomTooltip({ active, payload, valueFormatter }: any) {
  if (active && payload && payload.length) {
    const p = payload[0];
    const v = typeof p?.value === "number" ? p.value : 0;
    return (
      <div className="rounded-md border border-white/10 bg-white/5 text-white/90 backdrop-blur px-2 py-1 text-xs">
        <div className="font-medium">{valueFormatter ? valueFormatter(v) : formatNumber(v)}</div>
      </div>
    );
  }
  return null;
}

function hexToRgba(hex: string, alpha = 1) {
  const c = hex.replace("#", "");
  const bigint = parseInt(c, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatNumber(v: number) {
  try {
    return new Intl.NumberFormat("de-DE").format(v);
  } catch {
    return String(v);
  }
}
