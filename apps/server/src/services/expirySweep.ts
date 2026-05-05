import { expireStaleReservations } from "./inventory.js";

const INTERVAL_MS = 5_000;

export function startExpirySweep() {
  const tick = () => {
    void expireStaleReservations().catch((err) =>
      console.error("[expirySweep]", err),
    );
  };
  tick();
  setInterval(tick, INTERVAL_MS);
}
