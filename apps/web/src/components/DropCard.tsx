import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DropResponse, ReservationResponse } from "@inventory/types";
import {
  inventoryKeys,
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

function StockPanelSkeleton() {
  return (
    <div
      className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-right"
      aria-hidden
    >
      <div className="ml-auto h-3 w-24 animate-pulse rounded bg-slate-700/60" />
      <div className="ml-auto mt-2 h-10 w-16 animate-pulse rounded-md bg-slate-700/50" />
      <div className="ml-auto mt-2 h-3 w-36 animate-pulse rounded bg-slate-700/60" />
    </div>
  );
}

function StatusBadgesSkeleton() {
  return (
    <div className="flex flex-wrap gap-2" aria-hidden>
      <span className="inline-block h-6 w-20 animate-pulse rounded-full bg-slate-700/50" />
      <span className="inline-block h-6 w-28 animate-pulse rounded-full bg-slate-700/40" />
    </div>
  );
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
  const queryClient = useQueryClient();
  const [effectiveReservation, setEffectiveReservation] =
    useState<ReservationResponse | null>(null);
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null);
  const [reserveSubmittingUserId, setReserveSubmittingUserId] = useState<string | null>(null);
  const [userSwitchPending, setUserSwitchPending] = useState(false);
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  const latestUserIdRef = useRef(userId);
  latestUserIdRef.current = userId;
  const reserveStartedForUserIdRef = useRef<string | null>(null);
  const purchaseStartedForUserIdRef = useRef<string | null>(null);

  const activeReservationQ = useActiveReservationQuery(userId, drop.id);
  const active = activeReservationQ.data;

  useEffect(() => {
    if (prevUserIdRef.current === undefined) {
      prevUserIdRef.current = userId;
      return;
    }
    if (prevUserIdRef.current !== userId) {
      prevUserIdRef.current = userId;
      setEffectiveReservation(null);
      setEffectiveUserId(null);
      setReserveSubmittingUserId(null);
      reserveStartedForUserIdRef.current = null;
      purchaseStartedForUserIdRef.current = null;
      setUserSwitchPending(Boolean(userId));
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || !userSwitchPending) return;
    if (activeReservationQ.fetchStatus === "idle" && !activeReservationQ.isPending) {
      setUserSwitchPending(false);
    }
  }, [userId, userSwitchPending, activeReservationQ.fetchStatus, activeReservationQ.isPending]);

  useEffect(() => {
    if (userId == null) return;
    if (activeReservationQ.data !== undefined) {
      setEffectiveReservation(activeReservationQ.data);
      setEffectiveUserId(userId);
    }
  }, [userId, activeReservationQ.data]);

  const reserveMut = useReserveMutation(userId, drop.id, {
    onSuccess: (reservation) => {
      const started = reserveStartedForUserIdRef.current;
      const current = latestUserIdRef.current;
      if (!started || !current || started !== current) return;
      setEffectiveReservation(reservation);
      setEffectiveUserId(current);
      toast.success("Reserved — complete checkout within 60s");
    },
    onError: (e: Error & { code?: string; status?: number }) => {
      setReserveSubmittingUserId(null);
      toast.error(e.message ?? "Could not reserve");
    },
  });

  const purchaseMut = usePurchaseMutation(userId, drop.id, {
    onSuccess: () => {
      const started = purchaseStartedForUserIdRef.current;
      const current = latestUserIdRef.current;
      if (!started || !current || started !== current) return;
      setEffectiveReservation(null);
      setEffectiveUserId(null);
      toast.success("Purchase complete");
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
  const activeForUi = useMemo(() => {
    if (userSwitchPending) return null;
    if (active !== undefined) return active;
    if (
      userId &&
      effectiveUserId === userId &&
      effectiveReservation &&
      effectiveReservation.status === "ACTIVE"
    ) {
      return effectiveReservation;
    }
    return null;
  }, [
    userSwitchPending,
    active,
    userId,
    effectiveUserId,
    effectiveReservation,
  ]);
  const holding = activeForUi?.status === "ACTIVE";
  const showStockSkeleton = Boolean(userId) && userSwitchPending;
  const reserveSubmitting =
    Boolean(userId) &&
    (reserveSubmittingUserId === userId ||
      (reserveMut.isPending && reserveStartedForUserIdRef.current === userId));
  const purchaseSubmitting =
    Boolean(userId) &&
    purchaseMut.isPending &&
    purchaseStartedForUserIdRef.current === userId;
  const resolvingReservationState =
    canInteract &&
    !reserveSubmitting &&
    !purchaseSubmitting &&
    (userSwitchPending ||
      activeReservationQ.isLoading ||
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

  useEffect(() => {
    if (holding) setReserveSubmittingUserId(null);
  }, [holding]);

  useEffect(() => {
    if (!userId || !activeForUi || activeForUi.status !== "ACTIVE") return;
    const msLeft = new Date(activeForUi.expiresAt).getTime() - Date.now();
    const timeoutMs = Math.max(0, msLeft + 250);
    const timer = setTimeout(() => {
      void queryClient.invalidateQueries({
        queryKey: inventoryKeys.drops,
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: inventoryKeys.activeReservation(drop.id, userId),
        refetchType: "active",
      });
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [queryClient, userId, drop.id, activeForUi]);

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/70 p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold leading-tight text-white">
            {drop.name}
          </h2>
          <p className="mt-1 text-emerald-400">{formatMoney(drop.price)}</p>
        </div>
        {showStockSkeleton ? (
          <StockPanelSkeleton />
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Available now
            </p>
            <p
              className={`text-4xl font-bold tabular-nums transition-[color,transform] duration-200 ease-out ${stockToneClass}`}
              title="Updates live via WebSockets"
            >
              {drop.availableQuantity}
            </p>
            <p className="text-xs text-slate-500">
              reserved: {drop.reservedQuantity} · sold ~{soldApprox}
            </p>
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {showStockSkeleton ? (
          <StatusBadgesSkeleton />
        ) : isSoldOut ? (
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
        {!showStockSkeleton && holding && (
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
              disabled={purchaseSubmitting}
              onClick={() => {
                if (!userId) return;
                purchaseStartedForUserIdRef.current = userId;
                purchaseMut.mutate(activeForUi!.id);
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {purchaseSubmitting ? "Processing…" : "Complete purchase"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={reserveSubmitting || drop.availableQuantity < 1}
            aria-busy={reserveSubmitting}
            onClick={() => {
              if (!userId) return;
              setReserveSubmittingUserId(userId);
              reserveStartedForUserIdRef.current = userId;
              reserveMut.mutate();
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              reserveSubmitting
                ? "cursor-wait bg-slate-200 text-slate-700"
                : "bg-slate-100 text-slate-900 hover:bg-white"
            }`}
          >
            {reserveSubmitting
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
