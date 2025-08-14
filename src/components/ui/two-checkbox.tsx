"use client";
import React from "react";
import { Check } from "lucide-react";

interface TwoCheckboxProps {
  prepared: boolean;
  completed: boolean;
  onPreparedChange: (prepared: boolean) => void;
  onCompletedChange: (completed: boolean) => void;
  disabled?: boolean;
}

export const TwoCheckbox = React.memo(function TwoCheckbox({
  prepared,
  completed,
  onPreparedChange,
  onCompletedChange,
  disabled = false,
}: TwoCheckboxProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Prepared Checkbox */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          console.log('🟡 TwoCheckbox prepared click', { prev: prepared, next: !prepared, disabled });
          onPreparedChange(!prepared);
        }}
        disabled={disabled}
        className={`
          w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
          ${prepared
            ? "bg-amber-500 border-amber-500 text-white"
            : "border-gray-300 hover:border-amber-400"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
        title="Vorbereitet"
      >
        {prepared && <Check className="w-3 h-3" />}
      </button>

      {/* Completed Checkbox */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          console.log('🟢 TwoCheckbox completed click', { prev: completed, next: !completed, disabled });
          onCompletedChange(!completed);
        }}
        disabled={disabled}
        className={`
          w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
          ${completed
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-gray-300 hover:border-emerald-400"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
        title="Abgeschlossen"
      >
        {completed && <Check className="w-3 h-3" />}
      </button>
    </div>
  );
});
