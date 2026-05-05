import type {
  DropResponse,
  ReservationResponse,
  UserResponse,
} from "@inventory/types";

const jsonHeaders = { "Content-Type": "application/json" };
const usersApiRoute = "/api/v1/users";
const dropsApiRoute = "/api/v1/drops";
const activeReservationApiRoute = "/api/v1/reservations/active";
const reservationsApiRoute = "/api/v1/reservations";
const purchasesApiRoute = "/api/v1/purchases";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      msg = body.error ?? msg;
      const err = new Error(msg) as Error & { code?: string; status?: number };
      err.code = body.code;
      err.status = res.status;
      throw err;
    } catch (e) {
      if (e instanceof Error && e.message) throw e;
      throw new Error(msg);
    }
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function getUsers(): Promise<UserResponse[]> {
  return fetch(usersApiRoute).then((r) => handle<UserResponse[]>(r));
}

export function getDrops(): Promise<DropResponse[]> {
  return fetch(dropsApiRoute).then((r) => handle<DropResponse[]>(r));
}

export function getActiveReservation(
  userId: string,
  dropId: string,
): Promise<ReservationResponse | null> {
  return fetch(`${activeReservationApiRoute}?dropId=${encodeURIComponent(dropId)}`, {
    headers: { "X-User-Id": userId },
  }).then((r) => handle<ReservationResponse | null>(r));
}

export function reserve(
  userId: string,
  dropId: string,
): Promise<ReservationResponse> {
  return fetch(reservationsApiRoute, {
    method: "POST",
    headers: { ...jsonHeaders, "X-User-Id": userId },
    body: JSON.stringify({ dropId }),
  }).then((r) => handle<ReservationResponse>(r));
}

export function completePurchase(
  userId: string,
  reservationId: string,
): Promise<void> {
  return fetch(purchasesApiRoute, {
    method: "POST",
    headers: { ...jsonHeaders, "X-User-Id": userId },
    body: JSON.stringify({ reservationId }),
  }).then((r) => handle<void>(r));
}

export type CreateDropInput = {
  name: string;
  price: string;
  totalUnits: number;
  startsAt: string;
  endsAt?: string | null;
};

export function createDrop(body: CreateDropInput): Promise<DropResponse> {
  return fetch(dropsApiRoute, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  }).then((r) => handle<DropResponse>(r));
}
