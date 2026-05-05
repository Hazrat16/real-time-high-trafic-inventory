/// <reference types="node" />
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/prisma.js";
import { buildRecentPurchasersByDrop } from "../src/format.js";

async function main() {
  const stamp = Date.now();
  const drop = await prisma.drop.create({
    data: {
      name: `Feed Probe ${stamp}`,
      price: "100.00",
      totalUnits: 10,
      availableQuantity: 10,
      reservedQuantity: 0,
      startsAt: new Date(Date.now() - 1_000),
    },
  });

  const users = Array.from({ length: 5 }, (_, i) => ({
    id: randomUUID(),
    username: `feed_user_${stamp}_${i}`,
  }));
  await prisma.user.createMany({ data: users });

  for (let i = 0; i < users.length; i += 1) {
    const reservationId = randomUUID();
    await prisma.reservation.create({
      data: {
        id: reservationId,
        dropId: drop.id,
        userId: users[i].id,
        status: "COMPLETED",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await prisma.purchase.create({
      data: {
        reservationId,
        dropId: drop.id,
        userId: users[i].id,
        createdAt: new Date(Date.now() + i * 1000),
      },
    });
  }

  const byDrop = await buildRecentPurchasersByDrop([drop.id]);
  const recent = byDrop.get(drop.id) ?? [];

  console.log("Drop activity feed check");
  console.log("------------------------");
  console.log(`returned_count: ${recent.length}`);
  console.log(`usernames: ${recent.map((r) => r.username).join(", ")}`);

  if (recent.length !== 3) {
    throw new Error(`Expected top 3 purchasers, got ${recent.length}`);
  }

  const expected = [users[4].username, users[3].username, users[2].username];
  const actual = recent.map((r) => r.username);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(
      `Unexpected ordering. expected=${expected.join(",")} actual=${actual.join(",")}`,
    );
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
