import { TikTokLive } from "tiktok-live-events";

export class LiveService {
  constructor(io) {
    this.io = io;
    this.client = null;
    this.username = "";
    this.mode = process.env.LIVE_MODE || "demo";
    this.startedAt = null;
    this.viewerCount = 0;
  }

  status() {
    return {
      ok: true,
      mode: this.mode,
      username: this.username || null,
      connected: Boolean(this.client?.connected),
      viewerCount: this.viewerCount,
      startedAt: this.startedAt,
    };
  }

  async join(username, requestedMode) {
    const mode = requestedMode || this.mode;
    if (mode === "demo") {
      this.mode = "demo";
      this.username = username || "demo";
      this.startedAt = new Date().toISOString();
      this.emit("live:connected", { username: this.username, demo: true });
      return this.status();
    }

    if (!username) throw new Error("TikTok kullanıcı adı gerekli.");
    await this.stop();

    this.mode = "live";
    this.username = username.replace(/^@/, "").trim();
    this.client = new TikTokLive(this.username, {
      autoReconnect: true,
      maxReconnectAttempts: 8,
      debug: false
    });

    this.bindLiveEvents(this.client);
    await this.client.connect();
    this.startedAt = new Date().toISOString();
    this.emit("live:connected", { username: this.username, demo: false });
    return this.status();
  }

  bindLiveEvents(client) {
    client.on("chat", e => this.ingest({
      type: "chat",
      user: normalizeUser(e.user),
      comment: e.comment
    }));

    client.on("gift", e => this.ingest({
      type: "gift",
      user: normalizeUser(e.user),
      giftId: e.giftId,
      giftName: e.giftName,
      diamondCount: Number(e.diamondCount || 0),
      repeatCount: Number(e.repeatCount || 1),
      repeatEnd: e.repeatEnd !== false
    }));

    client.on("like", e => this.ingest({
      type: "like",
      user: normalizeUser(e.user),
      likeCount: Number(e.likeCount || 0),
      totalLikes: Number(e.totalLikes || 0)
    }));

    client.on("member", e => this.ingest({
      type: "member",
      user: normalizeUser(e.user),
      action: e.action
    }));

    client.on("social", e => this.ingest({
      type: "social",
      user: normalizeUser(e.user),
      action: e.action
    }));

    client.on("roomUserSeq", e => {
      this.viewerCount = Number(e.viewerCount || e.totalViewers || 0);
      this.emit("room:viewers", { viewerCount: this.viewerCount });
    });

    client.on("disconnected", (code, reason) => {
      this.emit("live:disconnected", { code, reason: String(reason || "") });
    });

    client.on("error", error => {
      this.emit("live:error", { message: error?.message || String(error) });
    });
  }

  ingest(event) {
    const normalized = { ...event, ts: Date.now() };
    this.emit("live:event", normalized);
    this.emit(`live:${normalized.type}`, normalized);
    return normalized;
  }

  demoGift(input = {}) {
    return this.ingest({
      type: "gift",
      user: {
        uniqueId: input.uniqueId || "demo_user",
        nickname: input.nickname || "Demo User",
        profilePictureUrl: input.profilePictureUrl || ""
      },
      giftId: Number(input.giftId || 5655),
      giftName: input.giftName || "Rose",
      diamondCount: Number(input.diamondCount || 1),
      repeatCount: Number(input.repeatCount || 1),
      repeatEnd: true
    });
  }

  emit(event, payload) {
    this.io.emit(event, payload);
  }

  async stop() {
    if (this.client) {
      try { await this.client.disconnect?.(); } catch {}
    }
    this.client = null;
    this.startedAt = null;
  }
}

function normalizeUser(user = {}) {
  return {
    uniqueId: user.uniqueId || user.unique_id || user.userId || "unknown",
    nickname: user.nickname || user.uniqueId || user.unique_id || "Unknown",
    profilePictureUrl: user.profilePictureUrl || user.profilePicture || ""
  };
}
