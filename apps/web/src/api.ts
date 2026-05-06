import type {
  DropResponse,
  ReservationResponse,
  UserResponse,
} from "@inventory/types";

const jsonHeaders = { "Content-Type": "application/json" };

function resolveApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim();
  if (fromEnv) {
    return `${fromEnv.replace(/\/$/, "")}/api/v1`;
  }
  if (import.meta.env.DEV) {
    return "/api/v1";
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin.replace(/\/$/, "")}/api/v1`;
  }
  return "/api/v1";
}

const apiBase = resolveApiBase();
const usersApiRoute = `${apiBase}/users`;
const dropsApiRoute = `${apiBase}/drops`;
const activeReservationApiRoute = `${apiBase}/reservations/active`;
const reservationsApiRoute = `${apiBase}/reservations`;
const purchasesApiRoute = `${apiBase}/purchases`;

const noStore: Pick<RequestInit, "cache"> = { cache: "no-store" };

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
  return fetch(usersApiRoute, noStore).then((r) => handle<UserResponse[]>(r));
}

export function getDrops(): Promise<DropResponse[]> {
  return fetch(dropsApiRoute, noStore).then((r) => handle<DropResponse[]>(r));
}

export function getActiveReservation(
  userId: string,
  dropId: string,
): Promise<ReservationResponse | null> {
  return fetch(
    `${activeReservationApiRoute}?dropId=${encodeURIComponent(dropId)}`,
    { ...noStore, headers: { "X-User-Id": userId } },
  ).then((r) => handle<ReservationResponse | null>(r));
}

export function reserve(
  userId: string,
  dropId: string,
): Promise<ReservationResponse> {
  return fetch(reservationsApiRoute, {
    method: "POST",
    ...noStore,
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
    ...noStore,
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
    ...noStore,
    headers: jsonHeaders,
    body: JSON.stringify(body),
  }).then((r) => handle<DropResponse>(r));
}
