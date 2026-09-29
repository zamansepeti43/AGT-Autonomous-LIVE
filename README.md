# AGT Autonomous LIVE 🎮

**TikTok LIVE → Etkileşim → 3D Oyun → Yayın**

AGT Autonomous LIVE is a launcher and runtime for autonomous TikTok LIVE interactive games.

## Game library

### 🏎️ Street Race 3D — READY
A browser-based **WebGL / Three.js 3D racing game** running on a procedural circuit.
- 3D road, barriers, trees, lights and environment.
- Five 3D cars with different colors and race positions.
- Third-person chase camera.
- Countdown → race → winner → automatic new round.
- Gifts add speed/boost to a racer.
- Chat 1–5 gives the selected racer a boost.
- Particle effects and dynamic race HUD.
- Browser-source friendly.

The current 3D scene is built from procedural geometry, so it does not depend on copyrighted external vehicle/track assets.

### 🏗️ Tower Battle — READY
A real-time two-side siege game with animated towers, projectiles, hit particles, health, match timer and automatic rematch.

### 🌍 Territory War — READY
A territory-control game where viewer-controlled units move across the map and claim cells.

### 🏆 LIVE Arena — READY
A vertical race where top gift supporters become racers and chat supplies vote pressure.

### 🧗 Sky Climb — READY
A platform climbing game where gifts strengthen jumps and the player climbs toward the summit.

### 👹 Boss Raid — READY
A timed boss battle where LIVE gifts deal damage and the raid automatically resets.

## Architecture

```
TikTok LIVE
    ↓
LiveService
    ↓
Normalized event bus
    ↓
Selected Game
    ↓
WebGL / Three.js 3D scene
    ↓
Browser Source
    ↓
TikTok LIVE Studio / OBS
```

The LIVE connection is separated from the game layer so game modules can be replaced independently.

## Local run

```powershell
npm install
$env:PORT=3010
npm start
```

Open http://localhost:3010 and choose **Street Race**.

## LIVE integration note

The current TikTok connection uses a third-party/reverse-engineered LIVE event library. It is not an official TikTok Live API, so upstream/TikTok changes can affect the connection independently of the game engine.
