# AGT Slime Live — Karakteri doğru üretme ve entegrasyon planı

## Değişmez referans
Kaynak: kullanıcının onayladığı turuncu böcek karakter sayfası (ön, yan, arka, yüz ifadeleri ve pozlar).
Hedef: büyük parlak gözlü, yuvarlak turuncu kafa, iki kıvrık koyu anten ve turuncu uç, küçük armut gövde, kısa eklemli kol/bacak, belirgin gülümseme. Karakter ahşap sandalyede oturmalı ve iki eli slime'ı kavramalı.

## Neden mevcut sonuç kabul edilmiyor?
Mevcut Three.js karakteri kodla oluşturulmuş prototip geometrisidir. Referanstaki pürüzsüz, tek parça heykel kalitesini vermez; parmaklar, yüz, eklemler ve oturma pozu yeterince organik değildir. Bu yüzden nihai karakter olarak kullanılmayacak.

## Ücretsiz üretim hattı
1. **Referansı sabitle:** Onaylanan karakter sayfasını modelleme referansı yap; sistem ekranı görselinden model çıkarma. Ön/yan/arka siluet ve yüz ifadeleri ayrı referans olarak korunur.
2. **Blender'da heykel (sculpt):** Ücretsiz Blender ile tek parça, yumuşak organik kafa-gövde; ayrı göz küreleri, iris/pupil, ağız, anten, el ve parmaklar oluşturulur. Kafa-gövde oranları referans sayfasındaki önden/yan görünüşle karşılaştırılır.
3. **Retopoloji ve materyal:** Hafif, temiz topoloji; turuncu parlak kaplama, gözlerde beyaz/kehribar/siyah katmanlar, koyu anten sapı ve turuncu anten uçları. Mobil için tek karakter yaklaşık 25–45 bin üçgen hedefi.
4. **Rig (iskelet):** Omurga, boyun, kafa, iki omuz-dirsek-bilek, parmaklar, kalça-diz-ayak ve iki anten kemiği. Eller slime kütlesini kavrayabilecek şekilde konumlanır.
5. **Animasyon klipleri:** idle, knead, dance, halay, water, add, celebrate, wave. Önce basit poz bloklama, sonra eğri/yumuşatma. Eller slime'a temas edecek şekilde animasyonlanır.
6. **GLB dışa aktarım:** Tek `public/assets/agt-bug.glb` dosyası, gömülü materyal/dokular ve adlandırılmış animasyonlar. Dosya boyutu mobil için optimize edilir.
7. **Ayrı karakter laboratuvarı:** GLB önce tek başına bir test sayfasında yüklenir. Ön/yan/arka açı, ışık, ölçek, ayakların zeminle teması, oturma pozu, animasyon klipleri doğrulanır. Burada hata varsa canlı yayın sayfasına dokunulmaz.
8. **Entegrasyon:** Laboratuvar testi geçince mevcut Three.js sahnesine aktarılır. Kamera/koltuk/kase konumu karakterin gerçek ölçülerine göre ayarlanır; el-kase-slime temasları kontrol edilir.
9. **Mobil regresyon testi:** Android Chrome'da 9:16, 60/30 FPS, sahne yüklenmesi, hediye tetikleri, yeniden boyutlandırma ve WebGL hata kontrolü yapılır. Boş sahneye yol açan JS hataları entegrasyon öncesi yakalanır.

## Kabul kriterleri
- Referansla önden, yandan ve arkadan benzer siluet.
- Kafanın gövdeye göre oranı ve antenlerin şekli doğru.
- Karakter sandalyede oturuyor; masa/kase önünde elleri slime'a temas ediyor.
- Parmaklar ayrı seçiliyor; kol hareketlerinde kopma/penetrasyon yok.
- Her animasyon klibi bağımsız oynatılabiliyor.
- Mobil tarayıcıda sahne boş kalmıyor; hata konsola yazılıyor.
- Ücretli model, servis veya abonelik kullanılmıyor.

## Şu anki durum
- Canlı sayfada boş sahneye neden olan eksik `ball()` yardımcı fonksiyonu düzeltildi.
- Mevcut karakter hâlâ geçici kod geometrisidir; referans kalitesinde nihai 3B heykel değildir.
- GLB modeli henüz üretilmedi. Nihai model bu adımların laboratuvar testinden sonra canlı sisteme alınacaktır.
