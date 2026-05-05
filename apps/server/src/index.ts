import "dotenv/config";
import http from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { attachSocketServer } from "./socketHub.js";
import { startExpirySweep } from "./services/expirySweep.js";
import { prisma } from "./prisma.js";

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

const stopExpirySweep = startExpirySweep();

server.listen(port, () => {
  console.log(`API + Socket.io listening on http://localhost:${port}`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down...`);
  stopExpirySweep();

  await new Promise<void>((resolve) => {
    io.close(() => resolve());
  });
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await prisma.$disconnect();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error("Shutdown error", error);
        process.exit(1);
      });
  });
}
