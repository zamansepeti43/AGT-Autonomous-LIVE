# AGT Autonomous LIVE 🎮

**TikTok LIVE → Etkileşim → Oyun → Yayın**

AGT Autonomous LIVE is a launcher and runtime for autonomous TikTok LIVE game overlays. The streamer selects a game once; the selected game receives normalized LIVE events and continues its own match/round loop.

## Game library

### 🏎️ Street Race — READY
A canvas-rendered vertical racing game with five cars, countdown, acceleration, finish line, particles, winner screen and automatic next-round reset.
- Gifts accelerate a racer.
- Chat 1–5 gives a small boost.
- Countdown → race → winner → automatic reset.
- Browser-source friendly.

### 🏗️ Tower Battle — READY
A real-time two-side siege game with animated towers, projectiles, hit particles, health, match timer and automatic rematch.
- Chat 1 / 2 selects a side.
- Gifts launch attacks.
- Tower health changes visually.
- Winner screen and automatic reset.

### 🌍 Territory War — READY
A grid-based territory game where viewer-controlled units physically move across the map and claim cells.
- Chat 1 / 2 joins a side.
- Gifts spawn additional units and speed them up.
- Territory is calculated from occupied cells.
- Timed rounds and automatic restart.

### 🏆 LIVE Arena — READY
A vertical race where the current top gift supporters become the three racers.
- Gifts accumulate player score.
- Top three enter the race.
- Chat 1 / 2 / 3 supplies vote pressure.
- Race → winner → automatic new lobby.

## Architecture

```
TikTok LIVE
    ↓
LiveService
    ↓
Normalized event bus
    ↓
Selected Game Adapter
    ↓
Canvas / HTML5 Game
    ↓
Browser Source
    ↓
TikTok LIVE Studio / OBS
```

The game layer is separated from the LIVE connection layer so new games can be added without rebuilding the TikTok integration.

## Local run

```powershell
npm install
$env:PORT=3010
npm start
```

Open http://localhost:3010 and choose a game from the library.

## Research / provenance

The game formats were selected after reviewing existing TikTok LIVE game projects and hosted examples. We are not copying source code from repositories without a clear license. The AGT game implementations are independent browser-game implementations inspired by documented interaction formats.

Examples reviewed include:
- vamnguyen/tiktok-live-games — horse-racing/event architecture.
- absravdev/tiktok-live-arena — Unity vertical race with top gift supporters and chat voting.
- k0d1r/tiktok-live-interactive-game — Red vs Blue tower battle mechanics.
- Livecade documented Horse Race and Territory War formats.

## Important LIVE integration note

The current TikTok connection uses a third-party/reverse-engineered LIVE event library. It is not an official TikTok Live API, so upstream/TikTok changes can break the connection independently of the games.

## Next game slots

Boss Raid, Zombie Survival, Runner/Climbing and additional race formats can be added as independent game modules under public/games/.