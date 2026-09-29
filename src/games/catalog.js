export const GAME_CATALOG = [
  { id: "race", name: "Street Race", tr: "Yarış", icon: "🏎️", description: "Hediyeler yarışçıların hızını artırır. Turlar otomatik başlar ve biter.", status: "ready", route: "/games/race.html", events: ["gift", "chat"] },
  { id: "tower", name: "Tower Battle", tr: "Tırmanış / Kule Savaşı", icon: "🏗️", description: "İki tarafın kulesi hediyelerle yükselir, saldırılarla hasar alır.", status: "ready", route: "/games/tower.html", events: ["gift", "like", "chat"] },
  { id: "territory", name: "Territory War", tr: "Bölge Savaşı", icon: "🌍", description: "İzleyici etkileşimleri takımların haritadaki alanını büyütür.", status: "ready", route: "/games/territory.html", events: ["gift", "like", "chat"] },
  { id: "arena", name: "LIVE Arena", tr: "Arena", icon: "🏆", description: "Öne çıkan destekçiler yarışçı/oyuncu olarak arenaya alınır.", status: "ready", route: "/games/arena.html", events: ["gift", "chat"] },
  { id: "climb", name: "Sky Climb", tr: "Tırmanış", icon: "🧗", description: "Oyuncu platformlardan zirveye tırmanır; hediyeler sıçramayı güçlendirir.", status: "ready", route: "/games/climb.html", events: ["gift"] },
  { id: "boss", name: "Boss Raid", tr: "Boss Savaşı", icon: "👹", description: "Hediyeler boss’a hasar verir; otomatik tur ve yeniden doğma.", status: "ready", route: "/games/boss.html", events: ["gift", "like"] },
  { id: "zombie", name: "Zombie Survival", tr: "Zombi Hayatta Kalma", icon: "🧟", description: "Hediyeler savunma, silah ve düşman dalgalarını tetikler.", status: "planned", route: null, events: ["gift", "like", "chat"] },
];