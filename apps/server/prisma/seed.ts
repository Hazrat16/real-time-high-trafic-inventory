/// <reference types="node" />
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USER_IDS = {
  alice: "11111111-1111-1111-1111-111111111111",
  bob: "22222222-2222-2222-2222-222222222222",
  carol: "33333333-3333-3333-3333-333333333333",
};

async function main() {
  await prisma.user.createMany({
    data: [
      { id: USER_IDS.alice, username: "alice" },
      { id: USER_IDS.bob, username: "bob" },
      { id: USER_IDS.carol, username: "carol" },
    ],
    skipDuplicates: true,
  });

  const existing = await prisma.drop.count();
  if (existing === 0) {
    await prisma.drop.create({
      data: {
        name: "Air Zoom Demo — Limited Run",
        price: "189.99",
        totalUnits: 50,
        availableQuantity: 50,
        reservedQuantity: 0,
        startsAt: new Date(Date.now() - 60_000),
      },
    });
  }

  console.log("Seed finished.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
