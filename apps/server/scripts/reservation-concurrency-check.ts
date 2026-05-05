/// <reference types="node" />
import "dotenv/config";
import { prisma } from "../src/prisma.js";
import { reserveItem } from "../src/services/inventory.js";

async function main() {
  const attempts = 100;
  const now = Date.now();

  const users = Array.from({ length: attempts }, (_, i) => ({
    id: `phase2-${now}-${i}@demo.local`,
    username: `phase2_user_${now}_${i}`,
  }));

  await prisma.user.createMany({
    data: users,
    skipDuplicates: true,
  });

  const drop = await prisma.drop.create({
    data: {
      name: `Phase2 Concurrency Probe ${now}`,
      price: "1.00",
      totalUnits: 1,
      availableQuantity: 1,
      reservedQuantity: 0,
      startsAt: new Date(Date.now() - 1_000),
    },
  });

  const results = await Promise.allSettled(
    users.map((u) => reserveItem(drop.id, u.id)),
  );

  const successCount = results.filter((r) => r.status === "fulfilled").length;
  const failureCount = results.length - successCount;
  const outOfStockCount = results.filter(
    (r) =>
      r.status === "rejected" &&
      r.reason &&
      typeof r.reason === "object" &&
      "code" in r.reason &&
      (r.reason as { code?: string }).code === "OUT_OF_STOCK",
  ).length;
  const errorCodeCounts = new Map<string, number>();
  for (const result of results) {
    if (result.status === "rejected") {
      const maybeCode =
        result.reason &&
        typeof result.reason === "object" &&
        "code" in result.reason &&
        typeof (result.reason as { code?: unknown }).code === "string"
          ? ((result.reason as { code?: string }).code ?? "UNKNOWN")
          : "UNKNOWN";
      errorCodeCounts.set(
        maybeCode,
        (errorCodeCounts.get(maybeCode) ?? 0) + 1,
      );
    }
  }

  const freshDrop = await prisma.drop.findUniqueOrThrow({
    where: { id: drop.id },
  });

  console.log("Reservation concurrency check");
  console.log("-----------------------------");
  console.log(`attempts: ${results.length}`);
  console.log(`success: ${successCount}`);
  console.log(`failed: ${failureCount}`);
  console.log(`out_of_stock_failures: ${outOfStockCount}`);
  console.log(`error_code_counts: ${JSON.stringify(Object.fromEntries(errorCodeCounts))}`);
  console.log(
    `drop_state: available=${freshDrop.availableQuantity}, reserved=${freshDrop.reservedQuantity}`,
  );

  if (successCount !== 1) {
    throw new Error(
      `Expected exactly 1 successful reservation, got ${successCount}`,
    );
  }
  if (freshDrop.availableQuantity !== 0 || freshDrop.reservedQuantity !== 1) {
    throw new Error("Drop counters are inconsistent after contention test");
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
