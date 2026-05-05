import "dotenv/config";
import http from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { attachSocketServer } from "./socketHub.js";
import { startExpirySweep } from "./services/expirySweep.js";

const port = Number(process.env.PORT) || 3000;
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const app = createApp();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: clientOrigin,
    methods: ["GET", "POST"],
  },
});

attachSocketServer(io);

io.on("connection", (socket) => {
  socket.join("dashboard");
});

startExpirySweep();

server.listen(port, () => {
  console.log(`API + Socket.io listening on http://localhost:${port}`);
});
