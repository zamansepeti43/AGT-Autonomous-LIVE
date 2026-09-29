import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LiveService } from "./services/live-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static(join(__dirname, "../public")));

const liveService = new LiveService(io);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: liveService.mode, timestamp: new Date().toISOString() });
});

app.get("/api/status", (_req, res) => {
  res.json(liveService.status());
});

app.post("/api/demo/gift", (req, res) => {
  const event = liveService.demoGift(req.body || {});
  res.json({ ok: true, event });
});

io.on("connection", (socket) => {
  socket.on("join-stream", async ({ username, mode } = {}) => {
    try {
      const result = await liveService.join(username, mode);
      socket.emit("stream-status", result);
    } catch (error) {
      socket.emit("stream-error", { message: error.message });
    }
  });

  socket.on("leave-stream", () => liveService.leave());

  socket.on("demo-event", (event) => {
    if (liveService.mode === "demo") liveService.ingest(event);
  });
});

httpServer.listen(port, () => {
  console.log(`AGT Autonomous LIVE → http://localhost:${port}`);
  console.log(`Mode: ${liveService.mode}`);
});

process.on("SIGINT", async () => {
  await liveService.stop();
  httpServer.close(() => process.exit(0));
});
