"use client";
import React from "react";

export type ThreeStateValue = 'empty' | 'prepared' | 'completed';

interface ThreeStateCheckboxProps {
  value: ThreeStateValue;
  onChange: (newValue: ThreeStateValue) => void;
  disabled?: boolean;
  className?: string;
}

export default function ThreeStateCheckbox({ 
  value, 
  onChange, 
  disabled = false, 
  className = "" 
}: ThreeStateCheckboxProps) {
  const handleClick = () => {
    if (disabled) return;
    
    // Zyklus: empty -> prepared -> completed -> empty
    switch (value) {
      case 'empty':
        onChange('prepared');
        break;
      case 'prepared':
        onChange('completed');
        break;
      case 'completed':
        onChange('empty');
        break;
    }
  };

  const getCheckboxStyle = () => {
    switch (value) {
      case 'empty':
        return 'border-white/30 bg-transparent';
      case 'prepared':
        return 'border-amber-500 bg-amber-500/20';
      case 'completed':
        return 'border-emerald-500 bg-emerald-500/20';
    }
  };

  const getCheckmarkColor = () => {
    switch (value) {
      case 'empty':
        return 'text-transparent';
      case 'prepared':
        return 'text-amber-400';
      case 'completed':
        return 'text-emerald-400';
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`
        h-4 w-4 rounded border-2 flex items-center justify-center
        transition-all duration-200 ease-out
        ${getCheckboxStyle()}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-110'}
        ${className}
      `}
      title={
        value === 'empty' ? 'Nicht begonnen (klicken für "Vorbereitet")' :
        value === 'prepared' ? 'Vorbereitet (klicken für "Abgeschlossen")' :
        'Abgeschlossen (klicken für "Zurücksetzen")'
      }
    >
      {value !== 'empty' && (
        <svg 
          className={`h-3 w-3 ${getCheckmarkColor()}`} 
          fill="currentColor" 
          viewBox="0 0 20 20"
        >
          <path 
            fillRule="evenodd" 
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
            clipRule="evenodd" 
          />
        </svg>
      )}
    </button>
  );
}

// Hilfsfunktion um den aktuellen Zustand aus ServiceState zu bestimmen
export function getThreeStateValue(service: any): ThreeStateValue {
  // Null/undefined = leer
  if (!service) return 'empty';
  
  // Legacy-Unterstützung: Wenn service nur ein boolean ist
  if (typeof service === 'boolean') {
    return service ? 'completed' : 'empty';
  }
  
  // Objekt-Format: Prüfe done und prepared Eigenschaften
  if (typeof service === 'object') {
    if (service.done === true) return 'completed';
    if (service.prepared === true) return 'prepared';
    return 'empty';
  }
  
  // Fallback für unbekannte Formate
  return 'empty';
}
