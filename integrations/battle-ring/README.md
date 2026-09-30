# Battle Ring — AGT Integration Pin

Upstream game selected for AGT Autonomous LIVE testing.

- Upstream repository: https://github.com/kiozhu/battle-ring
- License: MIT
- Pinned upstream default-branch state reviewed: 2026-09-30
- Game: 3D TikTok LIVE viewer-vs-viewer arena
- Viewer interactions: join, like, chat, follow, gifts
- Automatic round system and bot fill are included
- Portrait 9:16 rendering is included
- This branch is only a preservation/integration reference. Main AGT game code is unchanged.

## Local test

PowerShell:

    cd C:\Users\Quantum
    git clone https://github.com/kiozhu/battle-ring.git Battle-Ring
    cd Battle-Ring
    npm install
    npm start

Then open:

    http://localhost:5051/sumo

For live TikTok connection, configure the repository's .env according to its README. Demo/bot functionality can be tested before live credentials are configured.
