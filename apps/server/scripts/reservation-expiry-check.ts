/// <reference types="node" />
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/prisma.js";
import {
  expireStaleReservations,
  reserveItem,
} from "../src/services/inventory.js";

async function main() {
  const userId = randomUUID();
  const stamp = Date.now();

  await prisma.user.create({
    data: {
      id: userId,
      username: `expiry_user_${stamp}`,
    },
  });

  const drop = await prisma.drop.create({
    data: {
      name: `Expiry Recovery Probe ${stamp}`,
      price: "1.00",
      totalUnits: 1,
      availableQuantity: 1,
      reservedQuantity: 0,
      startsAt: new Date(Date.now() - 1_000),
    },
  });

  const reservation = await reserveItem(drop.id, userId);

  // Force this hold to be stale so recovery can be verified immediately.
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      expiresAt: new Date(Date.now() - 1_000),
    },
  });

  const recovered = await expireStaleReservations();
  const freshDrop = await prisma.drop.findUniqueOrThrow({
    where: { id: drop.id },
  });
  const freshReservation = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservation.id },
  });

  console.log("Reservation expiry recovery check");
  console.log("-------------------------------");
  console.log(`recovered_count: ${recovered}`);
  console.log(`reservation_status: ${freshReservation.status}`);
  console.log(
    `drop_state: available=${freshDrop.availableQuantity}, reserved=${freshDrop.reservedQuantity}`,
  );

  if (recovered !== 1) {
    throw new Error(`Expected 1 recovered reservation, got ${recovered}`);
  }
  if (freshReservation.status !== "EXPIRED") {
    throw new Error(`Expected reservation to be EXPIRED, got ${freshReservation.status}`);
  }
  if (freshDrop.availableQuantity !== 1 || freshDrop.reservedQuantity !== 0) {
    throw new Error("Stock was not returned correctly after expiration");
  }
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
