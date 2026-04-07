/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

type Mode = {
  emoji: string;
  prompt: string | ((input: any) => string);
  isList?: boolean;
  subModes?: Record<string, string>;
};

const modes: Record<string, Mode> = {
  'Detaylı Transkript': {
    emoji: '📜',
    prompt: `Videoyu analiz et ve aşağıdaki olay türlerini ve kuralları kullanarak bir transkript oluştur. Her bir olayı tespit ettiğinde, videodaki zaman koduyla birlikte \`set_timecodes\` fonksiyonuna gönderilen bir nesneye yerleştir.

### ⏱️ ZAMAN DAMGASI DOĞRULUĞU KURALLARI (EN ÖNCELİKLİ)
- Her olayın zaman damgasını belirlerken, videonun GERÇEK oynatma zamanını kullan.
- Videonun başı 00:00:00'dır. Tüm zaman damgaları bu başlangıca göre MUTLAK olarak hesaplanmalıdır.
- Zaman damgalarını tahmin etme. Bir olayı kaydetmeden önce, o anın videodaki tam zamanını doğrula.
- Ardışık olaylar arasında mantıklı zaman artışı olmalıdır — birden saniyeler atlama veya aynı zaman damgasını tekrarlama.
- Video içeriğindeki sayaçları veya süre göstergelerini video zamanı olarak KULLANMA.

### 1. Tıklama Olayları
- **Tetikleyici:** Ekranda anlık olarak beliren küçük, yarı şeffaf beyaz daireyi tespit et.
- **Kaydedilecek Bilgiler:**
  - Olay türünü "**TIKLAMA**" olarak etiketle.
  - Tıklamanın yapıldığı nesneyi (örneğin, "mavi canavar", "puan tablosu", "ayarlar düğmesi") tam olarak belirt.
  - Tıklama anında ekranda genel olarak hangi nesnelerin bulunduğunu kısaca özetle.
  - **Örnek:** \`TIKLAMA: Ekranın ortasındaki yeşil, üç gözlü canavarın üzerine tıklandı.\`

### 2. Puan ve Metin Belirmesi
- **Tetikleyici:** Genellikle bir tıklamayı takiben ekranda beliren sayısal puanlar veya metinler.
- **Kaydedilecek Bilgiler:**
  - Olay türünü "**PUAN**" veya "**METİN**" olarak etiketle.
  - Metnin içeriğini tam olarak yaz (örneğin, "+50", "Bonus!", "Oyun Bitti").
  - Metnin rengini mutlaka belirt (örneğin, "yeşil renkte", "kırmızı", "sarı").
  - **Örnek:** \`PUAN: Canavarın üzerinde kırmızı renkte "+100 Puan" belirdi.\`

### 3. Nesne Belirmesi / Kaybolması
- **Tetikleyici:** Ekrana yeni bir nesnenin girmesi veya ekrandan bir nesnenin çıkması.
- **Kaydedilecek Bilgiler:**
  - Olay türünü "**NESNE BELİRDİ**" veya "**NESNE KAYBOLDU**" olarak etiketle.
  - Nesneyi detaylıca tarif et. Eğer "canavar" gibi birden fazla türü olan bir nesne ise, ayırt edici özelliklerini (renk, göz sayısı, şekli vb.) mutlaka belirt.
  - Nesnenin ekrandaki konumunu belirt (örneğin, "sol üst köşe", "ekranın ortası").
  - **Örnek:** \`NESNE BELİRDİ: Kırmızı, tek gözlü, yuvarlak bir canavar ekranın sağ altından giriş yaptı.\`

### 4. Genel Ekran Değişiklikleri
- **Tetikleyici:** Yukarıdaki kategorilere girmeyen diğer tüm görsel değişiklikler.
- **Kaydedilecek Bilgiler:**
  - Olay türünü "**EKRAN DEĞİŞİKLİĞİ**" olarak etiketle.
  - Değişikliği net bir şekilde açıkla. (Örn: "Arka plan rengi maviden siyaha döndü.", "Tüm canavarlar aynı anda parladı.", "Sayaç 10'dan 9'a düştü.").
  - **Örnek:** \`EKRAN DEĞİŞİKLİĞİ: Ekranın üstündeki zaman sayacı 00:30'dan 00:29'a düştü.\`

### 5. Oyun-Spesifik Bağlam
Bu videolarda şu oyunlardan biri oynuyor olabilir. Eğer tanırsan, o oyuna özel detaylara dikkat et:
- **Gwakkamole (Go/No-Go):** Avokado şekilli canavarlar. KASKLI/MİĞFERLİ avokado = No-Go hedefi (VURMA!), KASKSIZ avokado = Go hedefi (VUR!). ÖNEMLİ: Kasklı avokado ekranda belirdiğinde bu bir inhibisyon anıdır. Oyuncunun tıklamaması (başarılı inhibisyon) veya tıklaması (başarısız inhibisyon) en kritik verilerdir — MUTLAKA kaydet.
- **Crush Stations (Working Memory):** Renkli baloncuklar içinde deniz ürünleri. Oyuncu, baloncukların rengini ve şeklini hafızada tutup, kaybolan baloncuğun özelliklerini seçer. Her baloncuk belirme, kaybolma ve seçim anını ayrı ayrı raporla.
- **All You Can E.T. (Task Switching):** Yiyecek/içecekleri kurallara göre canavarlara atma. Seviye içinde kurallar değişebilir. Kural değişim anları, eski kurala göre hatalı hareketler ve yeni kurala adaptasyon EN ÖNEMLİ anlardır — ATLAMA.`,
    isList: true,
  },
  
  'Kategorik Süreç Transkripti': {
    emoji: '📜',
    prompt: (input) => `Videoyu analiz et ve aşağıdaki olay türlerini ve kuralları kullanarak detaylı bir transkript oluştur. Ardından her olayı, kullanıcının belirttiği kategorilerle eşleştir. Her bir olayı tespit ettiğinde, videodaki zaman koduyla birlikte \`set_categorical_timecodes\` fonksiyonuna gönderilen bir nesneye yerleştir.

### ⏱️ ZAMAN DAMGASI DOĞRULUĞU KURALLARI (EN ÖNCELİKLİ)
- Her olayın zaman damgasını belirlerken, videonun GERÇEK oynatma zamanını kullan.
- Videonun başı 00:00:00'dır. Tüm zaman damgaları bu başlangıca göre MUTLAK olarak hesaplanmalıdır.
- Zaman damgalarını tahmin etme. Bir olayı kaydetmeden önce, o anın videodaki tam zamanını doğrula.
- Ardışık olaylar arasında mantıklı zaman artışı olmalıdır — birden saniyeler atlama veya aynı zaman damgasını tekrarlama.
- Video içeriğindeki sayaçları veya süre göstergelerini video zamanı olarak KULLANMA.

### 1. Tıklama Olayları
- **Tetikleyici:** Ekranda anlık olarak beliren küçük, yarı şeffaf beyaz daireyi tespit et.
- **Kaydedilecek Bilgiler:**
  - Tıklamanın yapıldığı nesneyi (örneğin, "mavi canavar", "puan tablosu", "ayarlar düğmesi") tam olarak belirt.
  - Tıklama anında ekranda genel olarak hangi nesnelerin bulunduğunu kısaca özetle.
  - **Örnek:** \`TIKLAMA: Ekranın ortasındaki yeşil, üç gözlü canavarın üzerine tıklandı.\`

### 2. Puan ve Metin Belirmesi
- **Tetikleyici:** Genellikle bir tıklamayı takiben ekranda beliren sayısal puanlar veya metinler.
- **Kaydedilecek Bilgiler:**
  - Metnin içeriğini tam olarak yaz (örneğin, "+50", "Bonus!", "Oyun Bitti").
  - Metnin rengini mutlaka belirt (örneğin, "yeşil renkte", "kırmızı", "sarı").
  - **Örnek:** \`PUAN: Canavarın üzerinde kırmızı renkte "+100 Puan" belirdi.\`

### 3. Nesne Belirmesi / Kaybolması
- **Tetikleyici:** Ekrana yeni bir nesnenin girmesi veya ekrandan bir nesnenin çıkması.
- **Kaydedilecek Bilgiler:**
  - Nesneyi detaylıca tarif et. Eğer "canavar" gibi birden fazla türü olan bir nesne ise, ayırt edici özelliklerini (renk, göz sayısı, şekli vb.) mutlaka belirt.
  - Nesnenin ekrandaki konumunu belirt (örneğin, "sol üst köşe", "ekranın ortası").
  - **Örnek:** \`NESNE BELİRDİ: Kırmızı, tek gözlü, yuvarlak bir canavar ekranın sağ altından giriş yaptı.\`

### 4. Genel Ekran Değişiklikleri
- **Tetikleyici:** Yukarıdaki kategorilere girmeyen diğer tüm görsel değişiklikler.
- **Kaydedilecek Bilgiler:**
  - Değişikliği net bir şekilde açıkla. (Örn: "Arka plan rengi maviden siyaha döndü.", "Tüm canavarlar aynı anda parladı.", "Sayaç 10'dan 9'a düştü.").
  - **Örnek:** \`EKRAN DEĞİŞİKLİĞİ: Ekranın üstündeki zaman sayacı 00:30'dan 00:29'a düştü.\`

### 5. Kategori Eşleştirme Kuralları
Yukarıdaki transkript kurallarıyla tespit ettiğin HER olayı, aşağıdaki kullanıcı kategorileriyle eşleştir:
- **Kullanılacak Kategoriler:** ${input || 'Lütfen analiz edilmesi gereken kategorileri belirtin (örn: "Tıklama, Nesne Belirme, Puan Değişimi" şeklinde virgülle ayırarak yazın)'}
- **Kategori Adlarını Koru:** Kullanıcının yazdığı kategori isimlerini (büyük/küçük harf duyarlı olarak) birebir koru. Örn: Kullanıcı "Tıklama" yazdıysa, category içinde "Tıklama" kullan.
- **Yeni Kategori Oluşturma:** Asla kendi kendine yeni bir kategori ekleme. Eğer videoda belirtilen kategorilerden hiçbiri yoksa, boş sonuç döndür.
- **ÇOKLU KATEGORİ KURALI:** Bir olay birden fazla kategoriye ait olabilir. Bu durumda, kategorileri bir dizi (array) içinde belirt. Kategoriler birbirine benzer olsa bile, ilişkili olduğunu düşündüğün tüm kategorileri döndür.
- **BİLİŞSEL KATEGORİ GEREKÇELENDİRME:** Soyut/bilişsel kategoriler (working memory, inhibitory control, cognitive flexibility, attention, pattern recognition, spatial reasoning, problem solving, decision making vb.) atadığında, description alanında bu çıkarımın GEREKÇESİNİ açıkla. Hangi görsel ipucundan bu bilişsel sürece ulaştığını belirt. Gerekçesiz bilişsel kategori atama.

### 5.0 ⚠️ ZORUNLU ÖNCELİKLİ KATEGORİ KURALI
Aşağıdaki görsel olayları tespit ettiğinde, belirtilen kategorileri MUTLAKA ata. Bu kurallar diğer tüm kurallardan ÖNCELİKLİDİR:

**Gwakkamole (avokado/guacamole canavarları görüyorsan):**
| Görsel Olay | ZORUNLU Kategoriler |
|---|---|
| Kasklı/korumalı avokado belirdi (No-Go hedefi) | \`inhibitory control\`, \`no-go response\`, \`object appearance\` |
| Kasklı avokado belirdi ve oyuncu TIKLAMADI | \`inhibitory control\`, \`inhibition success\`, \`no-go response\` |
| Kasklı avokado belirdi ve oyuncu TIKLADI (hata) | \`inhibitory control\`, \`inhibition failure\`, \`no-go response\` |
| Kasksız/normal avokado belirdi (Go hedefi) | \`go response\`, \`object appearance\` |
| Normal avokadoya tıklandı | \`go response\`, \`click/tap\`, \`action points\` |
| Ekranda hem kasklı hem kasksız avokado var | \`inhibitory control\`, \`selective attention\`, \`decision making\` |

**Crush Stations (renkli baloncuklar + deniz ürünleri görüyorsan):**
| Görsel Olay | ZORUNLU Kategoriler |
|---|---|
| Yeni baloncuklar ekranda belirdi | \`working memory\`, \`encoding\`, \`attention\` |
| Baloncuk ekrandan kayboldu | \`working memory\`, \`memory recall\` |
| Oyuncu seçim yapıyor | \`working memory\`, \`decision making\`, \`memory recall\` |

**All You Can E.T. (yiyecek/içecek + canavarlar + kurallar görüyorsan):**
| Görsel Olay | ZORUNLU Kategoriler |
|---|---|
| Kural değişti | \`cognitive flexibility\`, \`task switching\`, \`rule change\` |
| Eski kurala göre hareket edildi (hata) | \`cognitive flexibility\`, \`perseveration\`, \`inhibitory control\` |
| Yeni kurala doğru uyum | \`cognitive flexibility\`, \`adaptation\`, \`task switching\` |

### 5.1 Bilişsel Kategori Tespit Rehberi
Bilişsel kategoriler doğrudan gözlenemez; ekrandaki görsel olaylardan çıkarılır. Aşağıdaki rehberi kullan:
- **working memory:** Oyuncu birden fazla bilgiyi aynı anda hatırlaması gereken durumlar (eşleştirme oyunu, sıra takibi, birden fazla nesneyi akılda tutma).
- **inhibitory control:** Oyuncunun bir dürtüyü bastırması gereken anlar (doğru zamanda bekleyip tıklama, yanlış nesneye tıklamaktan kaçınma, "tuzak" nesnelerden uzak durma).
- **cognitive flexibility:** Kuralların veya stratejinin değiştiği anlar (yeni oyun modu başlaması, farklı görev türüne geçiş, beklenmedik kural değişikliği).
- **attention:** Oyuncunun belirli bir nesneye veya alana odaklanması gereken durumlar (hızlı hareket eden nesneyi takip etme, kalabalık ekranda hedefi bulma).
- **selective attention:** Dikkat dağıtıcıların arasından belirli bir hedefi seçme (yanlış nesneler arasından doğrusunu bulma).
- **sustained attention:** Uzun süre aralıksız dikkat gerektiren durumlar (bekleme anları, monoton görevler).
- **divided attention:** Aynı anda birden fazla şeye dikkat etme gerekliliği (birden fazla noktayı izleme, eşzamanlı görevler).
- **pattern recognition:** Tekrar eden desenlerin fark edilmesi gereken durumlar (renk/şekil dizileri, ritim kalıpları, tekrarlayan düşman hareketleri).
- **spatial reasoning:** Nesnelerin konumsal ilişkilerini anlamayı gerektiren anlar (yol bulma, puzzle parçası yerleştirme, nesne döndürme).
- **mental rotation:** Nesnelerin zihinsel olarak döndürülmesi gereken durumlar (parça yerleştirme, perspektif değişimi).
- **problem solving:** Bir engeli aşmak için çözüm üretilmesi gereken anlar (bulmaca çözme, strateji geliştirme).
- **decision making:** Birden fazla seçenek arasında tercih yapma anları (hangi yolu seçme, hangi nesneyi toplama, risk değerlendirmesi).
- **logical thinking:** Neden-sonuç ilişkisi kurma gerektiren durumlar (bu butona basarsam ne olur, sıralama mantığı).
- **sequencing:** Olayların veya eylemlerin belirli bir sıraya konması gereken durumlar (adım adım görevler, sıralı tıklama).
- **processing speed:** Hızlı tepki gerektiren anlar (zamanlı görevler, hızla kaybolan hedefler).
- **executive function:** Planlama, organize etme ve strateji yürütme gerektiren durumlar (kaynak yönetimi, uzun vadeli plan yapma).
- **metacognition:** Oyuncunun kendi performansını değerlendirmesi gereken anlar (hata sonrası strateji değiştirme, zorluk ayarlama).
- **task switching:** Bir görevden farklı bir göreve geçiş anları (farklı mini oyunlar arası geçiş, kural değişimi).
- **memory recall:** Daha önce öğrenilen bilginin hatırlanması gereken durumlar (önceki seviyedeki bilgiyi kullanma, gizli nesne konumunu hatırlama).
- **error detection / self-correction:** Hata yapıldığını fark etme ve düzeltme anları (yanlış tıklama sonrası geri alma, strateji değişikliği).

### 5.2 Oyun-Spesifik Tespit Rehberi
Bu videolarda aşağıdaki oyunlardan biri oynuyor olabilir. Oyunu tanıdığında, o oyuna özel tespit kurallarını uygula:

#### 🟢 Gwakkamole (Go/No-Go — Inhibition)
- **Kaynak:** Plass & Pawar, 2020
- **Oyun Tanımı:** Ekranda avokado şekilli canavarlar (guacamole/mole benzeri) çıkar. Bazıları vurulabilir (Go hedefleri), bazıları VURULMAMASI gereken (No-Go hedefleri) canavarlardır. Oyuncunun doğru canavarları vurması, yanlış olanlara DOKUNMAMASI gerekir.
- **Birincil Yürütücü İşlev:** Inhibition (Dürtü Kontrolü)
- **Go vs No-Go GÖRSEL AYRIMLARI:**
  - **No-Go hedefi (VURMA!):** Kasklı / miğferli / korumalı yeşil avokado canavar. Başında kask, miğfer veya koruyucu aksesuar olan avokado = VURULMAMASI GEREKEN hedeftir.
  - **Go hedefi (VUR!):** Kasksız / normal / korumasız avokado canavar. Başında aksesuar olmayan sade avokado = vurulacak hedeftir.
  - ⚠️ **KURAL:** Ekranda kasklı/miğferli/korumalı bir avokado gördüğünde, BU BİR İNHİBİSYON ANIDIR. \`inhibitory control\` ve \`no-go response\` kategorilerini MUTLAKA ata.
- **Kritik Tespit Anları:**
  - **İNHİBİSYON BAŞARISI:** Kasklı avokado (No-Go hedefi) ekranda belirip oyuncu TIKLAMADAN beklediğinde → \`inhibitory control\`, \`inhibition success\`, \`no-go response\` kategorisi ata. Description'da "Kasklı avokado (No-Go hedefi) belirdi, oyuncu tıklamaktan başarıyla kaçındı — inhibisyon başarılı" yaz.
  - **İNHİBİSYON BAŞARISIZLIĞI:** Kasklı avokadoya (No-Go hedefine) tıklanırsa → \`inhibitory control\`, \`inhibition failure\`, \`no-go response\` kategorisi ata. Description'da "Kasklı avokadoya (No-Go hedefi) tıklandı — dürtü kontrolü başarısız, inhibisyon hatası" yaz.
  - **GO TEPKİSİ:** Kasksız avokadoya (Go hedefine) doğru şekilde tıklama → \`go response\`, \`click/tap\`, \`action points\` + varsa \`selective attention\` kategorisi.
  - **KAÇIRILAN GO HEDEFİ:** Kasksız avokado (Go hedefi) ekranda belirip tıklanmadan kaybolursa → \`attention\` + \`processing speed\` kategorisi.
  - **AYRIŞTIRMA ANI:** Ekranda aynı anda kasklı ve kasksız avokadolar varken oyuncunun hangisine tıklayacağına karar vermesi → \`selective attention\` + \`decision making\` + \`inhibitory control\` kategorisi.
- **Görsel İpuçları:** Yeşil avokado şekilli canavarlar; No-Go = kasklı/miğferli, Go = kasksız/sade. Tokmak/çekiç animasyonu tıklamayı gösterir. Kırmızı X veya negatif puan = hatalı tıklama.
- **ÖNEMLİ:** Bu oyunda her canavar belirme ve kaybolma anını kaydet. Kasklı avokado ekranda belirdiği AN bir inhibisyon tetikleyicisidir — bu olayı \`inhibitory control\` kategorisi OLMADAN raporlama. No-Go canavarının ekranda kalıp tıklanmadan kaybolması EN ÖNEMLİ inhibisyon verisidir — ASLA ATLAMA.

#### 🔵 Crush Stations (Working Memory + Inhibition)
- **Kaynak:** NYU CREATE
- **Oyun Tanımı:** Ekranda renkli baloncuklar içinde deniz ürünleri (balık, yengeç, ahtapot vb.) gelir. Oyuncu bunların rengini ve şeklini hafızada tutmalıdır. Baloncuklar ekranın soluna doğru hareket eder ve bir tanesi kaybolur. Oyuncunun, kaybolan baloncuğun özelliklerini (renk + şekil) doğru seçmesi istenir.
- **Birincil Yürütücü İşlevler:** Working Memory, Inhibition, Görsel Dikkat
- **Kritik Tespit Anları:**
  - **KODLAMA (ENCODING):** Yeni baloncuklar ekranda belirdiğinde → \`working memory\` + \`attention\` kategorisi. Description'da kaç baloncuk olduğunu, renklerini ve içindeki deniz ürünlerini listele.
  - **HAFIZADA TUTMA (MAINTENANCE):** Baloncuklar hareket ederken ve oyuncu bunları izlerken → \`working memory\` + \`sustained attention\` kategorisi.
  - **KAYBOLMA ANI:** Bir baloncuk ekranın solundan kaybolduğunda → \`working memory\` + \`memory recall\` kategorisi. Description'da "X renkli Y şekilli baloncuk kayboldu, oyuncunun bunu hatırlaması gerekiyor" yaz.
  - **SEÇME/KARAR ANI:** Oyuncu kaybolan baloncuğun özelliklerini seçerken → \`working memory\` + \`decision making\` + \`memory recall\` kategorisi.
  - **DOĞRU CEVAP:** Doğru renk ve şekil seçildiğinde → \`working memory\` + olumlu geri bildirim.
  - **YANLIŞ CEVAP:** Yanlış seçim yapıldığında → \`working memory\` + \`error detection\`. Description'da neyi yanlış hatırladığını belirt (renk mi, şekil mi?).
  - **İNHİBİSYON:** Birden fazla seçenek arasından yanlış olanları bastırıp doğruyu seçme anı → \`inhibitory control\`.
  - **ARTAN ZORLUK:** Baloncuk sayısının artması, hızın artması → \`working memory\` yükünün arttığını description'da belirt.
- **Görsel İpuçları:** Renkli baloncuklar (kırmızı, mavi, yeşil, sarı vb.), içlerinde deniz ürünleri, sola hareket, kaybolma animasyonu, seçim arayüzü.
- **ÖNEMLİ:** Her baloncuk belirmesini, her kaybolmayı ve her seçim anını ayrı ayrı kaydet. Baloncuk sayısı ve detayları hafıza yükünü gösterir — DETAYLARINI ATLAMA.

#### 🟠 All You Can E.T. (Cognitive Flexibility — Task Switching)
- **Kaynak:** Blume et al., 2024
- **Oyun Tanımı:** Ekranda değişen kurallara göre yiyecek ve içecekleri tıklayarak canavarlara atma oyunu. Oyuncudan belirli bir kurala göre (örn: "sadece meyveleri at", "kırmızı yiyecekleri sola, mavi içecekleri sağa at" gibi) nesneleri doğru canavara sürüklemesi/tıklaması istenir. Seviye içinde kurallar DEĞİŞEBİLİR ve oyuncunun yeni kurala hızla adapte olması beklenir.
- **Birincil Yürütücü İşlev:** Cognitive Flexibility (Bilişsel Esneklik), Task Switching
- **Kritik Tespit Anları:**
  - **KURAL SUNUMU:** Yeni kural ekranda gösterildiğinde → \`cognitive flexibility\` + \`attention\` kategorisi. Description'da kuralın ne olduğunu tam olarak yaz.
  - **KURAL UYGULAMASI:** Oyuncu aktif kurala göre doğru nesneyi doğru canavara attığında → \`cognitive flexibility\` + \`decision making\` kategorisi.
  - **KURAL DEĞİŞİMİ (EN KRİTİK AN):** Seviye içinde kural değiştiğinde → \`cognitive flexibility\` + \`task switching\` kategorisi. Description'da eski kuralı ve yeni kuralı karşılaştır. Bu AN çok önemlidir — ASLA ATLAMA.
  - **ESKİ KURALA GÖRE HAREKET (PERSEVERASYON):** Kural değiştikten sonra oyuncu hâlâ eski kurala göre davranırsa → \`cognitive flexibility\` + \`error detection\` + \`inhibitory control\` kategorisi. Description'da "Kural değişmesine rağmen eski kurala göre hareket etti — perseveratif hata" yaz.
  - **YENİ KURALA ADAPTASYON:** Kural değişiminden sonra oyuncunun ilk doğru hareketi → \`cognitive flexibility\` + \`task switching\` kategorisi. Description'da "Yeni kurala başarıyla adapte oldu" yaz.
  - **YANLIŞ NESNE/CANAVAR SEÇİMİ:** Yanlış nesneyi veya yanlış canavara atma → \`decision making\` + \`error detection\`. Kuralın ne olduğunu ve neyin yanlış yapıldığını açıkla.
  - **ZORLUK ARTIŞI:** Kuralların karmaşıklaşması, daha fazla nesne/canavar eklenmesi → \`cognitive flexibility\` yükünün arttığını belirt.
- **Görsel İpuçları:** Yiyecek ve içecek görselleri, canavarlar (hedef), kural göstergesi/tabelası, sürükleme/atma animasyonu, kural değişim efekti.
- **ÖNEMLİ:** Kural değişim anları bu oyunun EN DEĞERLİ verisidir. Her kural değişimini, değişim öncesi son hareketi ve değişim sonrası ilk hareketi MUTLAKA kaydet.

### 5.3 Genel Oyun Tespit Kuralları
- Eğer video yukarıdaki oyunlardan birine benziyorsa, o oyunun özel tespit kurallarını MUTLAKA uygula.
- Her oyunun birincil yürütücü işlevini (inhibition, working memory, cognitive flexibility) tespit ettiğin EVERY olaya eklemeyi düşün — sadece açık anlar değil, arka planda süregelen bilişsel süreçler de önemlidir.
- Ekrandaki HER görsel değişikliği kaydet. Veri kaçırmak, eksik veri vermekten daha kötüdür.
- Bir engelleme anı (inhibisyon), hafıza yükleme/hatırlama anı (working memory) veya kural değişimi (cognitive flexibility) tespit ettiğinde, bunu MUTLAKA description alanında açıkça belirt ve uygun bilişsel kategorileri ata.
- Oyuncunun YAPMADIĞI eylemler de önemlidir (örn: tıklamaması gereken yere tıklamaması = başarılı inhibisyon). Sadece yapılan eylemleri değil, yapılmayan ama beklenen/kaçınılan eylemleri de raporla.

### 6. Zamanlama ve Format Kuralları
- **Olayları Gruplama:** Eğer 2 saniyeden kısa bir zaman aralığında birden fazla olay oluşuyorsa (örn: tıklama + puan belirmesi + nesne kaybolması hep aynı anda), bu olayları TEK BİR kayıt altında gruplayabilirsin. Gruplanmış olayda tüm olayları description alanında ayrı ayrı açıkla ve tüm ilgili kategorileri ekle. startTime grubun ilk olayının başlangıcı, endTime grubun son olayının GERÇEK bitiş zamanı olmalıdır. 2 saniyeden uzun aralıklı olayları GRUPLAMA — ayrı raporla.
- **GERÇEK BİTİŞ ZAMANI ZORUNLULUĞU:** \`endTime\` değerini asla uydurma veya kısaltma. Her olayın ekranda gerçekte ne kadar sürdüğünü gözlemle ve endTime'ı buna göre yaz. Bir nesne ekranda 1.5 saniye kalıyorsa endTime = startTime + 1.5s olmalıdır. Olayın bitiş zamanını startTime'a çok yakın bir değer yaparak "geçiştirme" — gerçek süreyi yansıt.
- **Konum Belirleme:** Her olayın ekrandaki konumunu mutlaka belirt (örn: "sol üst köşe", "ekran ortası", "sağ alt bölge").
- **Mutlak Zaman:** Tüm zaman kodları (startTime ve endTime) videonun başlangıcından (00:00:00.0) itibaren hesaplanmalıdır. Asla bir önceki olayın bitiş zamanına göre göreceli hesaplama yapma.
- **Videonun Oynatma Zamanını Kullan:** Zaman damgalarını belirlerken videonun gerçek oynatma zamanını gözlemle. Video içeriğinde görünen sayaçları, süre göstergelerini veya zamanlayıcıları video zamanı olarak KULLANMA — bunlar içerik zamanıdır, video zamanı değil.
- **Zaman Damgalarını Tahmin Etme:** Her olayı kaydetmeden önce o anın videodaki tam zamanını doğrula. Ardışık olaylar arasında mantıklı bir zaman artışı olmalıdır.
- **Farklı Zamanlar Zorunluluğu:** \`startTime\` ve \`endTime\` **asla aynı olamaz**. Her olay için başlangıç ve bitiş zamanı arasında en az 0.1 saniyelik bir fark olmalıdır.
- **Maksimum Süre ve Bölme:** Bir olay en fazla 5 saniye sürebilir. Eğer bir olay 5 saniyeden uzun sürerse, onu 5 saniyelik veya daha kısa parçalara bölerek birden fazla olay olarak raporla. Her parçanın \`description\` alanına, olayın devam ettiğini belirten bir ifade ekle (örn: "Seviye seçimi devam ediyor (Bölüm 1/3)").
- **Gerçek Süre Gözlemi:** Her olayın videodaki gerçek süresini izleyerek hesapla. Bir nesne veya menü ekranda ne kadar süre kalıyorsa, o kadar süre ver. Tahmini süre kullanma.
  - **Anlık Olaylar (örn: Tıklama):** Genellikle 0.1 - 0.4 saniye.
  - **Orta Süreli Olaylar (örn: Nesne belirme, Puan gösterimi):** Genellikle 0.5 - 2 saniye.
  - **Uzun Süreli Olaylar (örn: Menü görünümü, Seviye seçimi):** Genellikle 2 saniyeden fazla.
- **Zaman Formatı:** Zamanı \`SS:DD:SS.X\` formatında, 0.1 saniye (100ms) hassasiyetinde belirt. (Örnek: 00:01:23.4)

### 7. Çıktı Formatı
\`set_categorical_timecodes\` fonksiyonunu kullanarak her olay için şu bilgileri içeren bir nesne gönder:
- **startTime:** Olayın başlangıç zamanı (SS:DD:SS.X).
- **endTime:** Olayın bitiş zamanı (SS:DD:SS.X).
- **category:** Bir veya daha fazla kategori adı (string veya string dizisi).
- **description:** Olayın detaylı açıklaması (kategori adını tekrarlama).
- **location:** Ekrandaki konum.

### 8. Örnekler:
\`// Doğru - Tek kategori
{
  "startTime": "00:00:15.2",
  "endTime": "00:00:15.4",
  "category": "action points",
  "description": "TIKLAMA: Ekranın ortasındaki yeşil canavarın üzerine tıklandı. Ekranda 3 canavar ve puan tablosu görünüyor.",
  "location": "ekran ortası"
}\`

\`// Doğru - Birden fazla kategori
{
  "startTime": "00:01:05.3",
  "endTime": "00:01:09.1",
  "category": ["menu interaction", "level selection"],
  "description": "EKRAN DEĞİŞİKLİĞİ: Seviye seçim menüsü açıldı ve kullanıcı 3. seviyeyi seçti. Menüde 5 seviye seçeneği görünüyor.",
  "location": "ekran ortası"
}\`

### 9. Önemli Hatırlatmalar:
- Önce olayı Detaylı Transkript formatında tespit et, sonra uygun kategorilere eşleştir.
- Bir olay birden fazla kategoriye aitse, kategorileri bir dizi içinde ver.
- Olayları birleştirme, her birini ayrı raporla.
- description alanında olay türünü (TIKLAMA, PUAN, NESNE BELİRDİ, EKRAN DEĞİŞİKLİĞİ vb.) belirt.

Tüm analiz sonuçları Türkçe olmalıdır.`,
    isList: true,
    subModes: {
      'Oyun Mekanikleri Kategorileri': 'fun, challenge, behavioural momentum, rewards, penalties, pavlovian interaction, urgent optimism, communal discovery, strategy/planning, story, cooperation, pareto optimal, feedback, protege effect, mini games, design/editing, realism, ownership, role play, virality, cascading information, collaboration, competition, cut scenes, action points, levels, tokens, question&answer, game turns, selecting/collecting, resource management, capture/eliminate, feedback, goods/information, time pressure, tutorial, tiles/grids, infinite gameplay, appointment, movement, assessment, status, simulate, response, click/tap, object appearance, object disappearance, score change, level completion, failure, progression, social interaction, exploration, customization, screen change, working memory, inhibitory control, cognitive flexibility, attention, pattern recognition, spatial reasoning, problem solving, decision making, logical thinking, sequencing, mental rotation, visual processing, auditory processing, memory recall, divided attention, selective attention, sustained attention, processing speed, executive function, metacognition, task switching, planning ahead, error detection, self-correction, go response, no-go response, inhibition success, inhibition failure, encoding, maintenance, rule change, perseveration, adaptation, difficulty increase',
      'Özel': '',
    },
  },
  'Görsel-İşitsel Altyazılar': {
    emoji: '👀',
    prompt: `Bu videodaki her sahne için, sahneyi açıklayan altyazılar oluştur ve konuşulan \
    metinleri tırnak işareti içinde belirt. Her altyazıyı, videodaki zaman koduyla birlikte \
    set_timecodes fonksiyonuna gönderilen bir nesneye yerleştir. Tüm açıklamalar ve \
    altyazılar Türkçe olmalıdır.
    
    ZAMAN DAMGASI KURALI: Videonun gerçek oynatma zamanını kullan (00:00:00'dan itibaren). \
    Tahmin etme, her sahnenin videodaki tam zamanını gözlemle. Video içeriğindeki sayaçları \
    veya süre göstergelerini video zamanı olarak KULLANMA.`,
    isList: true,
  },
  'Paragraf': {
    emoji: '📝',
    prompt: `Bu videoyu özetleyen bir paragraf oluştur. 3 ila 5 cümle arasında tut. \
    Özetin her cümlesini, videodaki zaman koduyla birlikte set_timecodes \
    fonksiyonuna gönderilen bir nesneye yerleştir. Özet tamamen Türkçe olmalıdır.
    
    ZAMAN DAMGASI KURALI: Videonun gerçek oynatma zamanını kullan (00:00:00'dan itibaren). \
    Tahmin etme, her sahnenin videodaki tam zamanını gözlemle.`,
  },
  'Önemli Anlar': {
    emoji: '🔑',
    prompt: `Video için madde madde önemli noktalar oluştur. Her maddeyi, videodaki \
    zaman koduyla birlikte set_timecodes fonksiyonuna gönderilen bir nesneye \
    yerleştir. Tüm maddeler Türkçe olmalıdır.
    
    ZAMAN DAMGASI KURALI: Videonun gerçek oynatma zamanını kullan (00:00:00'dan itibaren). \
    Tahmin etme, her anın videodaki tam zamanını gözlemle.`,
    isList: true,
  },
  'Tablo': {
    emoji: '🤓',
    prompt: `Bu videodan 5 önemli sahne seç ve set_timecodes_with_objects fonksiyonunu \
    zaman kodu, 10 kelime veya daha az metin açıklaması ve sahnede görünen \
    nesnelerin listesi (temsili emojilerle) ile çağır. Tüm açıklamalar Türkçe olmalıdır.
    
    ZAMAN DAMGASI KURALI: Videonun gerçek oynatma zamanını kullan (00:00:00'dan itibaren). \
    Tahmin etme, her sahnenin videodaki tam zamanını gözlemle.`,
  },
  'Haiku': {
    emoji: '🌸',
    prompt: `Video için bir haiku oluştur. Haiku'nun her satırını, videodaki zaman \
    koduyla birlikte set_timecodes fonksiyonuna gönderilen bir nesneye yerleştir. \
    Hece sayısı kurallarını (5-7-5) takip etmeyi unutma. Haiku Türkçe olmalıdır.`,
  },
  'Grafik': {
    emoji: '📈',
    prompt: (input) =>
      `Bu video için aşağıdaki talimatlara göre grafik verisi oluştur: \
${input}. Veri değerleri ve zaman kodları listesiyle birlikte set_timecodes_with_numeric_values \
fonksiyonunu bir kez çağır. Tüm analizler Türkçe açıklamalarla birlikte olmalıdır.`,
    subModes: {
      'Heyecan Seviyesi':
        'her sahne için 1 ila 10 arasında bir ölçekte heyecan seviyesini tahmin et',
      'Önem Seviyesi':
        'her sahne için video açısından genel önem seviyesini 1 ila 10 arasında bir ölçekte tahmin et',
      'Kişi Sayısı': 'her sahnede görünen kişi sayısını say',
      'Özel': '',
    },
  },
  'Özel': {
    emoji: '🔧',
    prompt: (input) =>
      `Şu talimatları kullanarak set_timecodes fonksiyonunu bir kez çağır: ${input}. \
      Tüm sonuçlar ve açıklamalar Türkçe olmalıdır.`,
    isList: true,
  },
};

export default modes;
