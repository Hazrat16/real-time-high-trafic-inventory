import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { SOCKET_SERVER_EVENTS } from "@inventory/types";

export function useDashboardSocket(queryClient: QueryClient) {
  useEffect(() => {
    const backendOrigin =
      (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim() ||
      window.location.origin;

    const directSocket: Socket = io(backendOrigin, {
      path: "/socket.io",
      // Connect directly to backend to avoid Vite ws proxy churn.
      // API calls still use /api proxy in dev.
      transports: ["websocket"],
      withCredentials: false,
      upgrade: false,
    });

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["drops"] });
      void queryClient.invalidateQueries({ queryKey: ["activeRes"] });
    };

    directSocket.on(SOCKET_SERVER_EVENTS.DROPS_CHANGED, invalidate);

    return () => {
      directSocket.off(SOCKET_SERVER_EVENTS.DROPS_CHANGED, invalidate);
      directSocket.disconnect();
    };
  }, [queryClient]);
}
