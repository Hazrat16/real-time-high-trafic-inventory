import type { Server } from "socket.io";
import { SOCKET_SERVER_EVENTS } from "@inventory/types";

let io: Server | null = null;

export function attachSocketServer(server: Server) {
  io = server;
}

export function notifyDropsChanged() {
  io?.to("dashboard").emit(SOCKET_SERVER_EVENTS.DROPS_CHANGED);
}
