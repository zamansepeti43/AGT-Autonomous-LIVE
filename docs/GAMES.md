# AGT Autonomous LIVE — Oyun kataloğu

Bu katalog, GitHub araştırmasında bulduğumuz kullanılabilir formatları ve hangi kaynaktan esinlendiğimizi ayırır. Üçüncü taraf depolardaki lisanssız kodu kopyalamıyoruz; mekanikleri kendi AGT motorumuzda yeniden uyguluyoruz.

## 1. 🏎️ Horse Race — İLK LIVE TEST

Kaynak: `vamnguyen/tiktok-live-games` ve `livecade/horse-race-tiktok-live-game`.

- Hediye → yarışçı/ülke ilerlemesi
- Otomatik round
- Kazanan ekranı
- OBS/TikTok LIVE Studio browser source mantığı
- Gift değeri arttıkça ilerleme
- AGT sürümünde 5 lane ve demo modu var.

## 2. ⚔️ Tower Battle

Kaynak: `k0d1r/tiktok-live-interactive-game`.

- 2 takım
- Hediye → hasar/destek
- Like → güç barı
- Chat 1/2 → takım seçimi
- Combo / sudden-death / leaderboard fikirleri

Not: Kaynak repo açıkça lisans dosyası içermiyor. Bu nedenle kaynak kodunu kopyalamak yerine mekanikleri yeniden tasarlayacağız.

## 3. 🌍 Territory War

Kaynak: `livecade/territory-war-tiktok-live-game`.

- Chat'te sayı ile takım seçimi
- İzleyici topu
- Toplar haritayı boyar
- Hediye → yeni top/hız/boss/shield
- Süre sonunda en fazla alan kazanan takım

Kaynak repo hosted ürünün dokümantasyonunu içeriyor; kurulumluk kaynak kodu sunmuyor. AGT için mekanik yeniden yazılacak.

## 4. 🏆 TikTok Live Arena

Kaynak: `absravdev/tiktok-live-arena`.

- Bekleme odası
- Top 3 bağışçı → yarışçı
- Chat oylaması
- 10 saniyelik oy penceresi
- State machine
- Victory persistence
- Simülasyon/debug modu

Bu format AGT'nin ilerideki ikinci aşama oyunlarından biri olacak.

## 5. 🧰 Overlay / Gift Manager

Kaynak: `livelatch/tiktok-gift-manager` ve benzeri OBS overlay projeleri.

Bunları oyun değil, ortak **event/overlay katmanı** olarak değerlendireceğiz.

## Araştırma sonucu

İlk test için **Horse Race** seçildi çünkü:
1. Browser overlay'e en kolay taşınan format.
2. Otomatik round mantığı net.
3. Hediye → görsel tepki bağlantısı doğrudan.
4. Demo ile gerçek LIVE aynı event modelini kullanabiliyor.
5. Sonraki Tower/Territory/Arena oyunları aynı event bus üzerine bağlanabilir.
