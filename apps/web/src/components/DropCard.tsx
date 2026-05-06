import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { DropResponse, ReservationResponse } from "@inventory/types";
import {
  invalidateInventoryQueries,
  useActiveReservationQuery,
  usePurchaseMutation,
  useReserveMutation,
} from "../inventory.queries.ts";

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
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-medium tabular-nums text-amber-300">
      Hold expires in {secs}s
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
  const [effectiveReservation, setEffectiveReservation] =
    useState<ReservationResponse | null>(null);

  const activeReservationQ = useActiveReservationQuery(userId, drop.id);
  const active = activeReservationQ.data;
  useEffect(() => {
    if (activeReservationQ.data !== undefined) {
      setEffectiveReservation(activeReservationQ.data);
    }
  }, [activeReservationQ.data]);

  const reserveMut = useReserveMutation(userId, drop.id, {
    onSuccess: (reservation) => {
      setEffectiveReservation(reservation);
      toast.success("Reserved — complete checkout within 60s");
      invalidateInventoryQueries(qc);
    },
    onError: (e: Error & { code?: string; status?: number }) => {
      toast.error(e.message ?? "Could not reserve");
    },
  });

  const purchaseMut = usePurchaseMutation(userId, {
    onSuccess: () => {
      setEffectiveReservation(null);
      toast.success("Purchase complete");
      invalidateInventoryQueries(qc);
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
  const isSoldOut = soldApprox >= drop.totalUnits;
  const isOutOfStock = !isSoldOut && drop.availableQuantity < 1;

  const canInteract = Boolean(userId);
  const activeForUi = active ?? effectiveReservation;
  const holding = activeForUi?.status === "ACTIVE";
  const resolvingReservationState =
    canInteract &&
    (activeReservationQ.isLoading ||
      (activeReservationQ.isFetching && activeReservationQ.data === undefined));
  const isLowStock =
    !isSoldOut && !isOutOfStock && drop.availableQuantity > 0 && drop.availableQuantity <= 3;
  const stockToneClass =
    isSoldOut
      ? "text-rose-400"
      : isOutOfStock
        ? "text-orange-300"
        : isLowStock
        ? "text-amber-300"
        : "text-emerald-300";

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/70 p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold leading-tight text-white">
            {drop.name}
          </h2>
          <p className="mt-1 text-emerald-400">{formatMoney(drop.price)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-right">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Available now
          </p>
          <p
            className={`text-4xl font-bold tabular-nums ${stockToneClass}`}
            title="Updates live via WebSockets"
          >
            {drop.availableQuantity}
          </p>
          <p className="text-xs text-slate-500">
            reserved: {drop.reservedQuantity} · sold ~{soldApprox}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {isSoldOut ? (
          <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-medium text-rose-300">
            Sold out
          </span>
        ) : isOutOfStock ? (
          <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 font-medium text-orange-300">
            Out of stock
          </span>
        ) : isLowStock ? (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-300">
            Low stock
          </span>
        ) : (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-300">
            In stock
          </span>
        )}
        {holding && (
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 font-medium text-violet-300">
            You have an active hold
          </span>
        )}
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2.5">
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
          <p className="text-sm text-amber-400/90">
            Pick a demo user to reserve or buy.
          </p>
        ) : resolvingReservationState ? (
          <div className="flex w-full items-center justify-between">
            <p className="text-sm text-slate-400">Checking reservation status…</p>
            <button
              type="button"
              disabled
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 opacity-80"
            >
              Loading…
            </button>
          </div>
        ) : holding ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full">
            <Countdown expiresAt={activeForUi!.expiresAt} />
            <button
              type="button"
              disabled={purchaseMut.isPending}
              onClick={() => purchaseMut.mutate(activeForUi!.id)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {purchaseMut.isPending ? "Processing…" : "Complete purchase"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={reserveMut.isPending || drop.availableQuantity < 1}
            onClick={() => reserveMut.mutate()}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reserveMut.isPending
              ? "Reserving…"
              : isSoldOut
                ? "Sold out"
                : isOutOfStock
                  ? "Out of stock"
                : "Reserve"}
          </button>
        )}
      </footer>
    </article>
  );
}
