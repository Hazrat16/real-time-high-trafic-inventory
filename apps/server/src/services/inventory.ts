import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { notifyDropsChanged } from "../socketHub.js";

export const RESERVATION_TTL_MS = 60_000;

export class InventoryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "InventoryError";
  }
}

async function lockDrop(tx: Prisma.TransactionClient, dropId: string) {
  await tx.$executeRaw(
    Prisma.sql`SELECT id FROM "Drop" WHERE id = ${dropId} FOR UPDATE`,
  );
}

export async function reserveItem(dropId: string, userId: string) {
  const reservation = await prisma.$transaction(async (tx) => {
    await lockDrop(tx, dropId);

    const drop = await tx.drop.findUnique({ where: { id: dropId } });
    if (!drop) {
      throw new InventoryError("Drop not found", 404, "DROP_NOT_FOUND");
    }

    const now = new Date();
    if (drop.startsAt > now) {
      throw new InventoryError("Drop has not started yet", 403, "DROP_NOT_STARTED");
    }
    if (drop.endsAt && drop.endsAt < now) {
      throw new InventoryError("Drop has ended", 403, "DROP_ENDED");
    }

    const existing = await tx.reservation.findFirst({
      where: {
        dropId,
        userId,
        status: "ACTIVE",
        expiresAt: { gt: now },
      },
    });
    if (existing) {
      throw new InventoryError(
        "You already have an active reservation for this drop",
        409,
        "ALREADY_RESERVED",
      );
    }

    if (drop.availableQuantity < 1) {
      throw new InventoryError(
        "No units available to reserve",
        409,
        "OUT_OF_STOCK",
      );
    }

    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

    const created = await tx.reservation.create({
      data: {
        dropId,
        userId,
        expiresAt,
        status: "ACTIVE",
      },
    });

    await tx.drop.update({
      where: { id: dropId },
      data: {
        availableQuantity: { decrement: 1 },
        reservedQuantity: { increment: 1 },
      },
    });

    return created;
  });

  notifyDropsChanged();
  return reservation;
}

export async function completePurchase(reservationId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const preview = await tx.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!preview) {
      throw new InventoryError("Reservation not found", 404, "NOT_FOUND");
    }

    if (preview.userId !== userId) {
      throw new InventoryError("Not your reservation", 403, "FORBIDDEN");
    }

    await lockDrop(tx, preview.dropId);

    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation || reservation.status !== "ACTIVE") {
      throw new InventoryError(
        "Reservation is no longer active",
        409,
        "INVALID_STATE",
      );
    }

    const now = new Date();
    if (reservation.expiresAt <= now) {
      throw new InventoryError(
        "Reservation expired — stock was released",
        409,
        "EXPIRED",
      );
    }

    await tx.purchase.create({
      data: {
        dropId: reservation.dropId,
        userId,
        reservationId: reservation.id,
      },
    });

    await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: "COMPLETED" },
    });

    await tx.drop.update({
      where: { id: reservation.dropId },
      data: { reservedQuantity: { decrement: 1 } },
    });
  });

  notifyDropsChanged();
}

/** Recover stock from expired reservations (called by periodic sweep). */
export async function expireStaleReservations(): Promise<number> {
  const now = new Date();
  const stale = await prisma.reservation.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lte: now },
    },
    select: { id: true, dropId: true },
  });

  let freed = 0;
  for (const row of stale) {
    try {
      await prisma.$transaction(async (tx) => {
        await lockDrop(tx, row.dropId);

        const current = await tx.reservation.findUnique({
          where: { id: row.id },
        });
        if (!current || current.status !== "ACTIVE") return;

        await tx.reservation.update({
          where: { id: row.id },
          data: { status: "EXPIRED" },
        });

        await tx.drop.update({
          where: { id: row.dropId },
          data: {
            availableQuantity: { increment: 1 },
            reservedQuantity: { decrement: 1 },
          },
        });

        freed += 1;
      });
    } catch {
      // concurrent completion or double sweep — skip
    }
  }

  if (freed > 0) notifyDropsChanged();
  return freed;
}
