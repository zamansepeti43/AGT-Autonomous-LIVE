# AGT Autonomous LIVE — Mimari

## Ana akış

```
TikTok LIVE
   ↓
LIVE Adapter
   ↓
Normalized Event Bus
   ↓
Game Engine
   ↓
Socket.IO
   ↓
Browser Overlay
   ↓
OBS / TikTok LIVE Studio
```

## Event sözleşmesi

```js
{
  type: "gift" | "chat" | "like" | "member" | "social",
  user: {
    uniqueId,
    nickname,
    profilePictureUrl
  },
  giftName?,
  giftId?,
  diamondCount?,
  repeatCount?,
  comment?,
  ts
}
```

## Katmanlar

### 1. LIVE Adapter

Şu anda `tiktok-live-events` kullanılıyor. Proje MIT lisanslıdır ve Node.js tarafında chat, gift, like, follow, viewer ve diğer LIVE eventlerini tek event akışında sunuyor. Provider katmanı ayrı tutulduğu için daha sonra başka bir sağlayıcıya geçilebilir.

### 2. Game Engine

Oyun mantığı UI'dan bağımsız olmalı.

- RaceEngine
- TowerEngine
- TerritoryEngine
- ArenaEngine

### 3. Browser Overlay

Oyun yalnızca render eder.

TikTok hesabı/bağlantı mantığı browser'a taşınmaz.

### 4. Demo Mode

Gerçek LIVE olmadan aynı event sözleşmesine sahte event gönderir.

Bu sayede:
- hediye animasyonu,
- round geçişi,
- kazanan,
- reconnect,
- event mapping

gerçek yayına çıkmadan test edilir.

## Otomasyon hedefi

Yayıncı:

1. Sunucuyu açar.
2. TikTok kullanıcı adını girer.
3. Oyunu seçer.
4. Browser Source'u bir kere ekler.

Sonrasında:

`gift → event → engine → state → overlay`

döngüsü otomatik çalışır.

## Ürünleştirme

Sonraki aşamada:

```
AGT Dashboard
 ├── Streamer accounts
 ├── Game library
 ├── Gift mapper
 ├── Theme editor
 ├── Browser-source generator
 ├── Leaderboards
 └── Match history
```

olacak.

## Güvenlik / operasyon

- Secret veya API anahtarı browser'a verilmez.
- Admin kontrolü ayrı endpoint/secret ile yapılır.
- Her yayıncı için izole room/namespace kullanılacak.
- Gift combo eventleri duplicate işlemeyecek şekilde normalize edilecek.
