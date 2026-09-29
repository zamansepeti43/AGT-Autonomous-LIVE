export const RACE_CONFIG = {
  finishLine: 100,
  countdownMs: 8000,
  raceMs: 90000,
  resultMs: 5000,
  cooldownMs: 3000,
  lanes: [
    { id: 0, name: "PATRON", emoji: "🚗", giftKeys: ["rose", "gg", "heart"] },
    { id: 1, name: "RIVAL 1", emoji: "🚙", giftKeys: ["ice cream", "finger heart"] },
    { id: 2, name: "RIVAL 2", emoji: "🏎️", giftKeys: ["crown", "love you"] },
    { id: 3, name: "RIVAL 3", emoji: "🚓", giftKeys: ["perfume", "doughnut"] },
    { id: 4, name: "RIVAL 4", emoji: "🚕", giftKeys: ["star", "garland", "galaxy"] }
  ]
};

export class RaceEngine {
  constructor(config = RACE_CONFIG) {
    this.config = config;
    this.listeners = new Map();
    this.round = 0;
    this.reset();
  }

  on(event, fn) {
    const list = this.listeners.get(event) || [];
    list.push(fn);
    this.listeners.set(event, list);
  }

  emit(event, payload) {
    for (const fn of this.listeners.get(event) || []) fn(payload);
  }

  reset() {
    this.phase = "waiting";
    this.phaseStarted = Date.now();
    this.winner = null;
    this.lanes = this.config.lanes.map(lane => ({
      ...lane,
      distance: 0,
      supporters: new Map()
    }));
    this.events = [];
    this.emit("state", this.snapshot());
  }

  startCountdown() {
    if (this.phase !== "waiting") return;
    this.phase = "countdown";
    this.phaseStarted = Date.now();
    this.emit("phase", this.phase);
  }

  gift(event) {
    if (this.phase === "waiting") this.startCountdown();
    if (!["countdown", "racing"].includes(this.phase)) return;

    const lane = this.pickLane(event);
    const diamonds = Math.max(1, Number(event.diamondCount || 1) * Number(event.repeatCount || 1));
    const distance = Math.min(22, 3 + Math.sqrt(diamonds) * 2.8);
    lane.distance = Math.min(this.config.finishLine, lane.distance + distance);

    const id = event.user?.uniqueId || "unknown";
    const current = lane.supporters.get(id) || { nickname: event.user?.nickname || id, diamonds: 0 };
    current.diamonds += diamonds;
    lane.supporters.set(id, current);

    this.events.unshift({
      type: "gift",
      user: event.user?.nickname || id,
      giftName: event.giftName || "Gift",
      diamonds,
      lane: lane.name,
      ts: Date.now()
    });
    this.events.length = Math.min(this.events.length, 12);

    if (this.phase === "countdown" && Date.now() - this.phaseStarted >= this.config.countdownMs) {
      this.phase = "racing";
      this.phaseStarted = Date.now();
      this.emit("phase", this.phase);
    }

    this.emit("state", this.snapshot());

    if (this.phase === "racing" && lane.distance >= this.config.finishLine) {
      this.finish(lane);
    }
  }

  chat(event) {
    const text = String(event.comment || "").trim().toLowerCase();
    const match = text.match(/^[1-5]$/);
    if (!match) return;
    if (this.phase === "waiting") this.startCountdown();
    const idx = Number(match[0]) - 1;
    const lane = this.lanes[idx];
    if (!lane) return;
    lane.distance = Math.min(this.config.finishLine, lane.distance + 2);
    this.events.unshift({ type: "chat", user: event.user?.nickname || "Viewer", comment: text, lane: lane.name, ts: Date.now() });
    this.events.length = Math.min(this.events.length, 12);
    this.emit("state", this.snapshot());
  }

  tick(now = Date.now()) {
    const elapsed = now - this.phaseStarted;

    if (this.phase === "countdown" && elapsed >= this.config.countdownMs) {
      this.phase = "racing";
      this.phaseStarted = now;
      this.emit("phase", this.phase);
    } else if (this.phase === "racing" && elapsed >= this.config.raceMs) {
      this.finish([...this.lanes].sort((a,b) => b.distance - a.distance)[0]);
    } else if (this.phase === "finished" && elapsed >= this.config.resultMs) {
      this.phase = "cooldown";
      this.phaseStarted = now;
      this.emit("phase", this.phase);
    } else if (this.phase === "cooldown" && elapsed >= this.config.cooldownMs) {
      this.round += 1;
      this.reset();
    }
    this.emit("state", this.snapshot());
  }

  finish(lane) {
    if (this.phase === "finished") return;
    this.winner = lane.id;
    this.phase = "finished";
    this.phaseStarted = Date.now();
    this.emit("winner", { lane: lane.id, name: lane.name });
    this.emit("phase", this.phase);
  }

  pickLane(event) {
    const name = String(event.giftName || "").toLowerCase();
    const byName = this.lanes.find(l => l.giftKeys.some(k => name.includes(k)));
    if (byName) return byName;
    const idx = Math.abs(Number(event.giftId || 0)) % this.lanes.length;
    return this.lanes[idx];
  }

  snapshot() {
    return {
      round: this.round,
      phase: this.phase,
      phaseStarted: this.phaseStarted,
      winner: this.winner,
      lanes: this.lanes.map(l => ({
        id: l.id,
        name: l.name,
        emoji: l.emoji,
        distance: Number(l.distance.toFixed(2)),
        supporters: [...l.supporters.values()]
          .sort((a,b) => b.diamonds - a.diamonds)
          .slice(0, 3)
      })),
      events: this.events
    };
  }
}
