import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2.0) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

export function americanToDecimal(american: number): number {
  if (american > 0) return +(american / 100 + 1).toFixed(4);
  return +(100 / Math.abs(american) + 1).toFixed(4);
}

export function impliedProbability(decimalOdds: number): number {
  return +(1 / decimalOdds).toFixed(4);
}

export function calculateProfit(stake: number, decimalOdds: number): number {
  return +((stake * (decimalOdds - 1)).toFixed(2));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isCacheFresh(updatedAt: Date | null | undefined, maxAgeHours: number): boolean {
  if (!updatedAt) return false;
  return Date.now() - new Date(updatedAt).getTime() < maxAgeHours * 3600000;
}

export function formatMatchDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

export function formatROI(roi: number): string {
  return `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`;
}
