import type { DropResponse, ReservationResponse } from "@inventory/types";
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import {
  completePurchase,
  createDrop,
  getActiveReservation,
  getDrops,
  getUsers,
  reserve,
  type CreateDropInput,
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

type DropsSnapshot = { previousDrops: DropResponse[] | undefined };

export function invalidateInventoryQueries(client: QueryClient) {
  void client.invalidateQueries({ queryKey: inventoryKeys.drops });
  void client.invalidateQueries({
    queryKey: inventoryKeys.activeReservationsRoot,
  });
}

export async function refetchInventoryQueries(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({
      queryKey: inventoryKeys.drops,
      refetchType: "active",
    }),
    client.invalidateQueries({
      queryKey: inventoryKeys.activeReservationsRoot,
      refetchType: "active",
    }),
  ]);
}

function applyReserveOptimistic(qc: QueryClient, dropId: string) {
  qc.setQueryData<DropResponse[]>(inventoryKeys.drops, (prev) => {
    if (!prev) return prev;
    return prev.map((d) =>
      d.id !== dropId
        ? d
        : {
            ...d,
            availableQuantity: Math.max(0, d.availableQuantity - 1),
            reservedQuantity: d.reservedQuantity + 1,
          },
    );
  });
}

function applyPurchaseOptimistic(qc: QueryClient, dropId: string) {
  qc.setQueryData<DropResponse[]>(inventoryKeys.drops, (prev) => {
    if (!prev) return prev;
    return prev.map((d) =>
      d.id !== dropId
        ? d
        : {
            ...d,
            reservedQuantity: Math.max(0, d.reservedQuantity - 1),
          },
    );
  });
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
    staleTime: 0,
  });
}

export function useActiveReservationQuery(
  userId: string | null,
  dropId: string,
) {
  return useQuery({
    queryKey: inventoryKeys.activeReservation(dropId, userId),
    queryFn: () => getActiveReservation(userId!, dropId),
    enabled: Boolean(userId),
    refetchInterval: 8_000,
    refetchIntervalInBackground: true,
  });
}

type ReserveMutOptions = Omit<
  UseMutationOptions<ReservationResponse, Error, void, DropsSnapshot>,
  "mutationFn"
>;

export function useReserveMutation(
  userId: string | null,
  dropId: string,
  options?: ReserveMutOptions,
) {
  const qc = useQueryClient();
  const {
    onMutate: userOnMutate,
    onSuccess: userOnSuccess,
    onError: userOnError,
    onSettled: userOnSettled,
    ...rest
  } = options ?? {};

  return useMutation({
    ...rest,
    mutationFn: () => reserve(userId!, dropId),
    onMutate: async (variables, mutation) => {
      await userOnMutate?.(variables, mutation);
      await qc.cancelQueries({ queryKey: inventoryKeys.drops });
      const previousDrops = qc.getQueryData<DropResponse[]>(
        inventoryKeys.drops,
      );
      applyReserveOptimistic(qc, dropId);
      return { previousDrops };
    },
    onError: async (err, variables, ctx, mutation) => {
      if (ctx?.previousDrops !== undefined) {
        qc.setQueryData(inventoryKeys.drops, ctx.previousDrops);
      }
      await userOnError?.(err, variables, ctx, mutation);
    },
    onSuccess: async (data, variables, ctx, mutation) => {
      await userOnSuccess?.(data, variables, ctx, mutation);
    },
    onSettled: async (data, err, variables, ctx, mutation) => {
      void refetchInventoryQueries(qc);
      await userOnSettled?.(data, err, variables, ctx, mutation);
    },
  });
}

type PurchaseMutOptions = Omit<
  UseMutationOptions<void, Error, string, DropsSnapshot>,
  "mutationFn"
>;

export function usePurchaseMutation(
  userId: string | null,
  dropId: string,
  options?: PurchaseMutOptions,
) {
  const qc = useQueryClient();
  const {
    onMutate: userOnMutate,
    onSuccess: userOnSuccess,
    onError: userOnError,
    onSettled: userOnSettled,
    ...rest
  } = options ?? {};

  return useMutation({
    ...rest,
    mutationFn: (reservationId: string) =>
      completePurchase(userId!, reservationId),
    onMutate: async (variables, mutation) => {
      await userOnMutate?.(variables, mutation);
      await qc.cancelQueries({ queryKey: inventoryKeys.drops });
      const previousDrops = qc.getQueryData<DropResponse[]>(
        inventoryKeys.drops,
      );
      applyPurchaseOptimistic(qc, dropId);
      return { previousDrops };
    },
    onError: async (err, variables, ctx, mutation) => {
      if (ctx?.previousDrops !== undefined) {
        qc.setQueryData(inventoryKeys.drops, ctx.previousDrops);
      }
      await userOnError?.(err, variables, ctx, mutation);
    },
    onSuccess: async (data, variables, ctx, mutation) => {
      await userOnSuccess?.(data, variables, ctx, mutation);
    },
    onSettled: async (data, err, variables, ctx, mutation) => {
      void refetchInventoryQueries(qc);
      await userOnSettled?.(data, err, variables, ctx, mutation);
    },
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
