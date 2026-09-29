# AGT Autonomous LIVE 🎮

**TikTok LIVE → Hediye → Oyun → OBS/TikTok LIVE Studio**

AGT Autonomous LIVE, yayıncı bilgisayara sürekli dokunmadan izleyicilerin LIVE etkileşimlerini oyuna dönüştürmek için hazırlanmış event-driven bir oyun motorudur.

## İlk oyun

### 🏎️ AGT Race

İlk gerçek yayın testi için seçildi.

- Hediye → yarış ilerlemesi
- Chat 1–5 → küçük ilerleme
- Otomatik round
- Kazanan ekranı
- Demo modu
- Browser overlay

## Kurulum

Node.js 18+ gerekir.

```bash
npm install
npm start
```

Tarayıcı:

```
http://localhost:3000
```

## İlk test

Önce **Demo Başlat**.

Sonra Rose / GG / Crown / Galaxy butonlarıyla gerçek LIVE event'i taklit et.

## Gerçek LIVE

1. TikTok hesabını LIVE başlat.
2. Dashboard'da kullanıcı adını gir.
3. **LIVE Bağlan**.
4. Browser Source olarak oyun URL'sini kullan.

Race overlay:

```
http://localhost:3000/games/race.html?mode=live&username=KULLANICI_ADI
```

## Mimari

```
TikTok LIVE
  ↓
tiktok-live-events
  ↓
LiveService
  ↓
Normalized events
  ↓
Game Engine
  ↓
Socket.IO
  ↓
Browser Source
```

Ayrıntı: `docs/ARCHITECTURE.md`

Oyun kataloğu: `docs/GAMES.md`

Araştırma kaynakları: `docs/SOURCES.md`

## Sonraki oyunlar

- ⚔️ Tower Battle
- 🌍 Territory War
- 🏆 TikTok Live Arena

Bunların mekanikleri araştırıldı ve ortak event motoru üzerine taşınacak.
