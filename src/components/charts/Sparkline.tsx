"use client";
import React from "react";

type Props = {
  values: number[];
  width?: number | string;
  height?: number | string;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  smooth?: boolean;
};

export default function Sparkline({
  values,
  width = 160,
  height = 48,
  stroke = "#22d3ee", // teal-400
  fill = "rgba(56,189,248,0.15)", // sky-400/15
  strokeWidth = 2,
  smooth = true,
}: Props) {
  if (!values || values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padX = 4;
  const padY = 4;
  const vbW = typeof width === "number" ? width : 160;
  const vbH = typeof height === "number" ? height : 48;
  const innerW = vbW - padX * 2;
  const innerH = vbH - padY * 2;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * innerW + padX;
    const y = vbH - padY - ((v - min) / range) * innerH;
    return [x, y] as const;
  });

  const path = smooth
    ? points
        .map((p, i, a) => {
          if (i === 0) return `M ${p[0]},${p[1]}`;
          const prev = a[i - 1];
          const cx = (prev[0] + p[0]) / 2;
          return `Q ${prev[0]},${prev[1]} ${cx},${(prev[1] + p[1]) / 2} T ${p[0]},${p[1]}`;
        })
        .join(" ")
    : `M ${points.map((p) => p.join(",")).join(" L ")}`;

  const areaPath = `${path} L ${points[points.length - 1][0]},${vbH - padY} L ${points[0][0]},${vbH - padY} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${vbW} ${vbH}`} className="block">
      <path d={areaPath} fill={fill} stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
    </svg>
  );
}
