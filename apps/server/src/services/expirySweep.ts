import { expireStaleReservations } from "./inventory.js";

const INTERVAL_MS = 5_000;

type ExpirySweepStats = {
  intervalMs: number;
  runs: number;
  totalRecovered: number;
  lastRecovered: number;
  lastRunAt: string | null;
  lastError: string | null;
};

const stats: ExpirySweepStats = {
  intervalMs: INTERVAL_MS,
  runs: 0,
  totalRecovered: 0,
  lastRecovered: 0,
  lastRunAt: null,
  lastError: null,
};

export function getExpirySweepStats(): ExpirySweepStats {
  return { ...stats };
}

export function startExpirySweep() {
  const tick = async () => {
    try {
      const recovered = await expireStaleReservations();
      stats.runs += 1;
      stats.totalRecovered += recovered;
      stats.lastRecovered = recovered;
      stats.lastRunAt = new Date().toISOString();
      stats.lastError = null;
    } catch (err) {
      stats.runs += 1;
      stats.lastRecovered = 0;
      stats.lastRunAt = new Date().toISOString();
      stats.lastError = err instanceof Error ? err.message : String(err);
      console.error("[expirySweep]", err);
    }
  };
  void tick();
  setInterval(tick, INTERVAL_MS);
}
