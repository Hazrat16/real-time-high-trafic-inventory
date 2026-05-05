import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { SOCKET_SERVER_EVENTS } from "@inventory/types";

export function useDashboardSocket(queryClient: QueryClient) {
  useEffect(() => {
    const socket: Socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["drops"] });
      void queryClient.invalidateQueries({ queryKey: ["activeRes"] });
    };

    socket.on(SOCKET_SERVER_EVENTS.DROPS_CHANGED, invalidate);

    return () => {
      socket.off(SOCKET_SERVER_EVENTS.DROPS_CHANGED, invalidate);
      socket.disconnect();
    };
  }, [queryClient]);
}
