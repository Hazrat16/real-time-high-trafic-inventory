export const SOCKET_SERVER_EVENTS = {
  DROPS_CHANGED: "drops:changed",
} as const;

export type RecentPurchaser = {
  username: string;
  purchasedAt: string;
};

export type DropResponse = {
  id: string;
  name: string;
  price: string;
  totalUnits: number;
  availableQuantity: number;
  reservedQuantity: number;
  startsAt: string;
  endsAt: string | null;
  recentPurchasers: RecentPurchaser[];
};

export type UserResponse = {
  id: string;
  username: string;
};

export type ReservationResponse = {
  id: string;
  dropId: string;
  expiresAt: string;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED";
};

export type ApiErrorBody = {
  error: string;
  code?: string;
};
