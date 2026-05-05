import type { Drop } from "@prisma/client";
import type { DropResponse, RecentPurchaser } from "@inventory/types";
import { prisma } from "./prisma.js";

export function toDropResponse(
  drop: Drop,
  recentPurchasers: RecentPurchaser[],
): DropResponse {
  return {
    id: drop.id,
    name: drop.name,
    price: drop.price.toString(),
    totalUnits: drop.totalUnits,
    availableQuantity: drop.availableQuantity,
    reservedQuantity: drop.reservedQuantity,
    startsAt: drop.startsAt.toISOString(),
    endsAt: drop.endsAt?.toISOString() ?? null,
    recentPurchasers,
  };
}

export async function loadRecentPurchasers(
  dropId: string,
): Promise<RecentPurchaser[]> {
  const rows = await prisma.purchase.findMany({
    where: { dropId },
    orderBy: { createdAt: "desc" },
    take: 3,
    include: { user: { select: { username: true } } },
  });
  return rows.map((p) => ({
    username: p.user.username,
    purchasedAt: p.createdAt.toISOString(),
  }));
}

export async function formatDropWithPurchasers(
  drop: Drop,
): Promise<DropResponse> {
  const recentPurchasers = await loadRecentPurchasers(drop.id);
  return toDropResponse(drop, recentPurchasers);
}
