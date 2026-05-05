import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { DropResponse } from "@inventory/types";
import {
  completePurchase,
  getActiveReservation,
  reserve,
} from "../api.ts";

function formatMoney(price: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(Number(price));
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );

  useEffect(() => {
    const t = setInterval(() => {
      setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 250);
    return () => clearInterval(t);
  }, [expiresAt]);

  const secs = Math.ceil(left / 1000);
  return (
    <span className="tabular-nums text-amber-400">
      {secs}s left to checkout
    </span>
  );
}

export function DropCard({
  drop,
  userId,
}: {
  drop: DropResponse;
  userId: string | null;
}) {
  const qc = useQueryClient();

  const { data: active } = useQuery({
    queryKey: ["activeRes", drop.id, userId],
    queryFn: () => getActiveReservation(userId!, drop.id),
    enabled: Boolean(userId),
    refetchInterval: 2000,
  });

  const reserveMut = useMutation({
    mutationFn: () => reserve(userId!, drop.id),
    onSuccess: () => {
      toast.success("Reserved — complete checkout within 60s");
      void qc.invalidateQueries({ queryKey: ["drops"] });
      void qc.invalidateQueries({ queryKey: ["activeRes", drop.id] });
    },
    onError: (e: Error & { code?: string; status?: number }) => {
      toast.error(e.message ?? "Could not reserve");
    },
  });

  const purchaseMut = useMutation({
    mutationFn: () => completePurchase(userId!, active!.id),
    onSuccess: () => {
      toast.success("Purchase complete");
      void qc.invalidateQueries({ queryKey: ["drops"] });
      void qc.invalidateQueries({ queryKey: ["activeRes", drop.id] });
    },
    onError: (e: Error & { code?: string; status?: number }) => {
      toast.error(e.message ?? "Purchase failed");
    },
  });

  const soldApprox = useMemo(
    () =>
      drop.totalUnits - drop.availableQuantity - drop.reservedQuantity,
    [drop],
  );

  const canInteract = Boolean(userId);
  const holding = active?.status === "ACTIVE";

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-black/20">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">{drop.name}</h2>
          <p className="text-emerald-400">{formatMoney(drop.price)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Available now
          </p>
          <p
            className="text-4xl font-bold tabular-nums text-white"
            title="Updates live via WebSockets"
          >
            {drop.availableQuantity}
          </p>
          <p className="text-xs text-slate-500">
            reserved: {drop.reservedQuantity} · sold ~{soldApprox}
          </p>
        </div>
      </header>

      <section className="rounded-lg bg-slate-950/80 px-3 py-2">
        <p className="text-xs font-medium uppercase text-slate-500">
          Recent buyers
        </p>
        {drop.recentPurchasers.length === 0 ? (
          <p className="text-sm text-slate-600">No purchases yet.</p>
        ) : (
          <ol className="mt-1 space-y-1">
            {drop.recentPurchasers.map((p, i) => (
              <li key={`${p.username}-${p.purchasedAt}-${i}`} className="text-sm">
                <span className="font-medium text-slate-200">{p.username}</span>
                <span className="text-slate-500">
                  {" "}
                  · {new Date(p.purchasedAt).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="flex flex-col gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
        {!canInteract ? (
          <p className="text-sm text-amber-500/90">
            Pick a demo user to reserve or buy.
          </p>
        ) : holding ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Countdown expiresAt={active!.expiresAt} />
            <button
              type="button"
              disabled={purchaseMut.isPending}
              onClick={() => purchaseMut.mutate()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {purchaseMut.isPending ? "Processing…" : "Complete purchase"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={reserveMut.isPending || drop.availableQuantity < 1}
            onClick={() => reserveMut.mutate()}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reserveMut.isPending
              ? "Reserving…"
              : drop.availableQuantity < 1
                ? "Sold out"
                : "Reserve"}
          </button>
        )}
      </footer>
    </article>
  );
}
