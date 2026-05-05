import {
  QueryClient,
  useMutation,
  useQuery,
  type UseMutationOptions,
} from "@tanstack/react-query";
import type { DropResponse, ReservationResponse, UserResponse } from "@inventory/types";
import {
  completePurchase,
  createDrop,
  type CreateDropInput,
  getActiveReservation,
  getDrops,
  getUsers,
  reserve,
} from "./api.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000 },
  },
});

export const inventoryKeys = {
  users: ["users"] as const,
  drops: ["drops"] as const,
  activeReservationsRoot: ["activeRes"] as const,
  activeReservation: (dropId: string, userId: string | null) =>
    ["activeRes", dropId, userId] as const,
};

export function invalidateInventoryQueries(client: QueryClient) {
  void client.invalidateQueries({ queryKey: inventoryKeys.drops });
  void client.invalidateQueries({ queryKey: inventoryKeys.activeReservationsRoot });
}

export function useUsersQuery() {
  return useQuery({
    queryKey: inventoryKeys.users,
    queryFn: getUsers,
  });
}

export function useDropsQuery() {
  return useQuery({
    queryKey: inventoryKeys.drops,
    queryFn: getDrops,
  });
}

export function useActiveReservationQuery(userId: string | null, dropId: string) {
  return useQuery({
    queryKey: inventoryKeys.activeReservation(dropId, userId),
    queryFn: () => getActiveReservation(userId!, dropId),
    enabled: Boolean(userId),
    refetchInterval: 2000,
  });
}

type ReserveMutOptions = Omit<
  UseMutationOptions<ReservationResponse, Error, void>,
  "mutationFn"
>;

export function useReserveMutation(
  userId: string | null,
  dropId: string,
  options?: ReserveMutOptions,
) {
  return useMutation({
    mutationFn: () => reserve(userId!, dropId),
    ...options,
  });
}

type PurchaseMutOptions = Omit<UseMutationOptions<void, Error, string>, "mutationFn">;

export function usePurchaseMutation(
  userId: string | null,
  options?: PurchaseMutOptions,
) {
  return useMutation({
    mutationFn: (reservationId: string) => completePurchase(userId!, reservationId),
    ...options,
  });
}

type CreateDropMutOptions = Omit<
  UseMutationOptions<DropResponse, Error, CreateDropInput>,
  "mutationFn"
>;

export function useCreateDropMutation(options?: CreateDropMutOptions) {
  return useMutation({
    mutationFn: (body: CreateDropInput) => createDrop(body),
    ...options,
  });
}
