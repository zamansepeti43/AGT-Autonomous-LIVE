import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LiveService } from "./services/live-service.js";
import { GAME_CATALOG } from "./games/catalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
const port = Number(process.env.PORT || 3000);
app.use(express.json());
app.use(express.static(join(__dirname, "../public")));
const liveService = new LiveService(io);

app.get("/api/health", (_req, res) => res.json({ ok: true, mode: liveService.mode, timestamp: new Date().toISOString() }));
app.get("/api/status", (_req, res) => res.json(liveService.status()));
app.get("/api/games", (_req, res) => res.json({ games: GAME_CATALOG }));
app.get("/api/overlay", (req, res) => {
  const game = GAME_CATALOG.find((item) => item.id === req.query.game);
  if (!game?.route) return res.status(404).json({ error: "Oyun henüz hazır değil." });
  const url = new URL(game.route, `${req.protocol}://${req.get("host")}`);
  url.searchParams.set("mode", req.query.mode === "live" ? "live" : "demo");
  if (req.query.username) url.searchParams.set("username", String(req.query.username).replace(/^@/, ""));
  res.json({ url: url.toString(), game });
});
app.post("/api/demo/gift", (req, res) => res.json({ ok: true, event: liveService.demoGift(req.body || {}) }));

io.on("connection", (socket) => {
  socket.on("join-stream", async ({ username, mode } = {}) => {
    try { socket.emit("stream-status", await liveService.join(username, mode)); }
    catch (error) { socket.emit("stream-error", { message: error.message }); }
  });
  socket.on("leave-stream", () => liveService.stop());
  socket.on("demo-event", (event) => { if (liveService.mode === "demo") liveService.ingest(event); });
});

httpServer.listen(port, () => {
  console.log(`AGT Autonomous LIVE → http://localhost:${port}`);
  console.log(`Mode: ${liveService.mode}`);
});
process.on("SIGINT", async () => { await liveService.stop(); httpServer.close(() => process.exit(0)); });