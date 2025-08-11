export type CustomerStatus = "aktiv" | "onboarding" | "inaktiv";

export interface ExtraService {
  name: string;
  price: number; // €/Monat
}

export interface Customer {
  id: string;
  name: string;
  branches: number; // Filialen
  status: CustomerStatus;
  baseFee?: number; // Grundgebühr (€/Monat), optional; Standard: 50€ bei aktiv
  marketingActive: boolean;
  monthlyRevenue: number; // €
  extraServices?: ExtraService[]; // optionale Zusatzservices
  baseFeeDisabled?: boolean; // wenn true, fällt die Grundgebühr weg
  notes?: string; // Notizen zum Kunden
  createdAt: number; // ts
  updatedAt: number; // ts
}

export interface OnboardingTaskSet {
  webshop: boolean;
  app: boolean;
  marketing: boolean;
}

export interface OnboardingEntry {
  id: string;
  customerId: string;
  tasks: OnboardingTaskSet;
  status: "in_bearbeitung" | "abgeschlossen";
  createdAt: number;
  updatedAt: number;
}
