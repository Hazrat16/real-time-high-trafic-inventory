/// <reference types="node" />
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/prisma.js";
import {
  InventoryError,
  completePurchase,
  reserveItem,
} from "../src/services/inventory.js";

async function expectInventoryError(
  fn: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof InventoryError && error.code === code) return;
    throw new Error(`Expected InventoryError(${code}), got ${String(error)}`);
  }
  throw new Error(`Expected InventoryError(${code}) but call succeeded`);
}

async function main() {
  const now = Date.now();
  const buyerA = { id: randomUUID(), username: `purchase_a_${now}` };
  const buyerB = { id: randomUUID(), username: `purchase_b_${now}` };

  await prisma.user.createMany({
    data: [buyerA, buyerB],
  });

  const drop = await prisma.drop.create({
    data: {
      name: `Purchase Flow Probe ${now}`,
      price: "1.00",
      totalUnits: 2,
      availableQuantity: 2,
      reservedQuantity: 0,
      startsAt: new Date(Date.now() - 1_000),
    },
  });

  // Success path: reserve then purchase as same user.
  const reservationA = await reserveItem(drop.id, buyerA.id);
  await completePurchase(reservationA.id, buyerA.id);

  const purchased = await prisma.purchase.findUnique({
    where: { reservationId: reservationA.id },
  });
  const afterPurchase = await prisma.drop.findUniqueOrThrow({
    where: { id: drop.id },
  });
  const reservationAState = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationA.id },
  });

  if (!purchased) {
    throw new Error("Expected purchase row to be created");
  }
  if (reservationAState.status !== "COMPLETED") {
    throw new Error(`Expected COMPLETED reservation, got ${reservationAState.status}`);
  }
  if (afterPurchase.availableQuantity !== 1 || afterPurchase.reservedQuantity !== 0) {
    throw new Error("Drop counters invalid after successful purchase");
  }

  // Failure path 1: cannot purchase the same reservation twice.
  await expectInventoryError(
    () => completePurchase(reservationA.id, buyerA.id),
    "INVALID_STATE",
  );

  // Failure path 2: cannot purchase another user's reservation.
  const reservationB = await reserveItem(drop.id, buyerB.id);
  await expectInventoryError(
    () => completePurchase(reservationB.id, buyerA.id),
    "FORBIDDEN",
  );

  // Failure path 3: cannot purchase an expired reservation.
  await prisma.reservation.update({
    where: { id: reservationB.id },
    data: { expiresAt: new Date(Date.now() - 1_000) },
  });
  await expectInventoryError(
    () => completePurchase(reservationB.id, buyerB.id),
    "EXPIRED",
  );

  console.log("Reservation purchase flow check");
  console.log("-------------------------------");
  console.log("success: purchase created and reservation completed");
  console.log("guardrails: INVALID_STATE, FORBIDDEN, EXPIRED validated");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
