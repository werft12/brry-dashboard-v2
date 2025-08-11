export function priceMarketingForSubscription(branches: number, base = 180, extra = 60): number {
  const b = Math.max(1, Math.floor(branches || 1));
  if (b <= 1) return base;
  return base + (b - 1) * extra;
}

export function monthlyCustomerFee(isActive: boolean, amount = 50): number {
  return isActive ? amount : 0;
}

export function formatEUR(amount: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount || 0);
}
