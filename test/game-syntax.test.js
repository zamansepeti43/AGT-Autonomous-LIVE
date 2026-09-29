import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const files = [
  "src/server.js",
  "src/services/live-service.js",
  "src/games/catalog.js",
  "public/games/race.js",
  "public/games/tower.js",
  "public/games/territory.js",
  "public/games/arena.js",
  "public/games/climb.js",
  "public/games/boss.js"
];

test("all game/server JavaScript files parse", () => {
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotThrow(() => new vm.Script(source, { filename: file }), file);
  }
});

test("game catalog contains six ready games", async () => {
  const { GAME_CATALOG } = await import("../src/games/catalog.js");
  assert.equal(GAME_CATALOG.filter((g) => g.status === "ready").length, 6);
  for (const game of GAME_CATALOG.filter((g) => g.status === "ready")) {
    assert.ok(game.route, game.id);
  }
});
