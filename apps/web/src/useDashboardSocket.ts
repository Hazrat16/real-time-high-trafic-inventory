import { SOCKET_SERVER_EVENTS } from "@inventory/types";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { invalidateInventoryQueries } from "./inventory.queries.ts";

export function useDashboardSocket(queryClient: QueryClient) {
  useEffect(() => {
    const defaultOrigin = import.meta.env.DEV
      ? "http://localhost:5000"
      : window.location.origin;
    const backendOrigin =
      (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim() ||
      defaultOrigin;

    const directSocket: Socket = io(backendOrigin, {
      path: "/socket.io",
      transports: ["websocket"],
      withCredentials: false,
      upgrade: false,
    });

    const invalidate = () => {
      invalidateInventoryQueries(queryClient);
    };

    directSocket.on(SOCKET_SERVER_EVENTS.DROPS_CHANGED, invalidate);

    return () => {
      directSocket.off(SOCKET_SERVER_EVENTS.DROPS_CHANGED, invalidate);
      directSocket.disconnect();
    };
  }, [queryClient]);
}
