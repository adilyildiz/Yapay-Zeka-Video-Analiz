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
  - **Örnek:** \`EKRAN DEĞİŞİKLİĞİ: Ekranın üstündeki zaman sayacı 00:30'dan 00:29'a düştü.\``,
    isList: true,
  },
  
  'Kategorik Süreç Transkripti': {
    emoji: '📜',
    prompt: (input) => `Videoyu analiz et ve SADECE kullanıcının belirttiği kategorilere göre bir süreç transkripti oluştur. 

**KESİNLİKLE SADECE BU KATEGORİLERİ KULLAN:** ${input || 'Lütfen analiz edilmesi gereken kategorileri belirtin (örn: "Tıklama, Nesne Belirme, Puan Değişimi" şeklinde virgülle ayırarak yazın)'}

### UYARI: 
- **SADECE YUKARIDA BELİRTİLEN KATEGORİLERİ KULLAN!**
- Kendi kategori oluşturma, sadece kullanıcının verdiği kategorilerde olay ara
- Eğer kullanıcının verdiği kategorilerden hiçbiri videoda yoksa, boş sonuç döndür
- Her kategoriyi aynen kullanıcının yazdığı şekilde kullan (büyük-küçük harf duyarlı)

### Analiz Kuralları:
- Sadece kullanıcının belirttiği kategorilerdeki olayları tespit et
- **SÜRE HESAPLAMA ZORUNLULUĞU:** Her olayın gerçek başlangıç ve bitiş zamanını ayrı ayrı hesapla
- **ASLA AYNI ZAMAN KULLANMA:** Başlangıç ve bitiş zamanları farklı olmak ZORUNDA
- **EKRANDA KALMA SÜRESİ:** Nesne/ekran ne kadar süre görünür durumda kalıyorsa o süreyi ölç
- **KONUM BELİRLEME:** Her olayın ekrandaki konumunu mutlaka belirt

### OLAY TİPLERİNE GÖRE SÜRE HESAPLAMA:
- **Anlık Olaylar (Tıklama):** En az 0.1-0.3 saniye süre ver
- **Menü/Ekran Görünümü:** Ekranın ilk belirdiği an = startTime, kaybolduğu an = endTime
- **Animasyonlar:** Animasyonun başladığı an = startTime, bittiği an = endTime
- **Nesne Belirme/Kaybolma:** Nesnenin ilk göründüğü an = startTime, tam kaybolduğu an = endTime
- **Metin/Puan Gösterimi:** Metnin belirdiği an = startTime, kaybolduğu an = endTime
- **Seviye Seçimi/Menüler:** Ekranın tam yüklendiği an = startTime, değiştiği/kapandığı an = endTime

### KRİTİK SÜRE KURALLARI:
- **YASAKLI:** startTime ve endTime aynı olamaz!
- **ZORUNLU:** Her olay en az 0.1 saniye, genelde 0.3+ saniye sürmeli
- **GÖZLEM:** Videoyu izleyerek gerçek süreleri hesapla
- **ÖRNEK:** Seviye seçim ekranı 3 saniye ekranda kalıyorsa 3 saniye süre ver

### GERÇEK SÜRE ANALİZİ ÖRNEKLERİ:
- **Tıklama Olayı:** startTime: tıklamanın başladığı an, endTime: tıklama efektinin bittiği an (0.1-0.3s)
- **Seviye Seçimi Ekranı:** startTime: ekranın belirdiği an, endTime: ekranın kapandığı/değiştiği an (2-5s)
- **Nesne Belirme:** startTime: nesnenin ilk göründüğü piksel, endTime: tam görünür olduğu an (0.5-2s)
- **Menü Açılması:** startTime: menünün açılmaya başladığı an, endTime: tam açık duruma geldiği an (0.8-1.5s)
- **Animasyon:** startTime: hareketin başladığı an, endTime: hareketin tamamen durduğu an (1-3s)  
- **Puan Gösterimi:** startTime: rakamın belirdiği an, endTime: rakamın kaybolduğu an (0.8-2s)
- **Loading/Yükleme:** startTime: yükleme başladığı an, endTime: yükleme tamamlandığı an (1-4s)

### Konum Belirleme Örnekleri:
- **Sol üst köşe, sol alt köşe, sağ üst köşe, sağ alt köşe**
- **Ekran ortası, sol kenar, sağ kenar, üst kenar, alt kenar**
- **Sol ortası, sağ ortası, üst ortası, alt ortası**
- **Örnek:** "sol üst köşe", "ekran ortası", "sağ alt bölge", "üst kenar"

### ZAMAN HASSASİYETİ KURALLARI:
- **ZORUNLU:** 0.1 saniye (100ms) hassasiyetinde zaman kullan
- **YASAKLI:** 0.5 saniye veya daha büyük aralıklar kullanma
- **Format:** SS:DD:SS.X formatı (tek haneli ondalık: .1, .2, .3, vb.)
- **Örnekler:** 00:00:15.1, 00:00:15.2, 00:00:25.7 (DOĞRU)
- **Yanlış:** 00:00:15.500, 00:00:25.800 (YANLIŞ - çok hassas)

### Kayıt Formatı:
\`set_categorical_timecodes\` fonksiyonunu kullanarak her olay için şu bilgileri gönder:
- **startTime:** Olayın başlangıç zamanı (SS:DD:SS.X formatında, 0.1s hassasiyeti ile)
- **endTime:** Olayın bitiş zamanı (SS:DD:SS.X formatında, 0.1s hassasiyeti ile)
- **category:** Kullanıcının verdiği kategori adını AYNEN yaz (büyük-küçük harf önemli)
- **description:** Olayın detaylı açıklaması (sadece açıklama, kategori adı tekrarlama)
- **location:** Ekrandaki konum (ZORUNLU - olayın gerçekleştiği ekran bölgesi)

**DOĞRU Süre Hesaplama Örnekleri (Farklı başlangıç/bitiş zamanları):**

\`// Kısa süreli olay örneği
{
  "startTime": "00:00:15.2",
  "endTime": "00:00:15.4",     // 0.2 saniye fark
  "category": "Tıklama", 
  "description": "Ekranın ortasındaki yeşil canavarın üzerine tıklandı",
  "location": "ekran ortası"
}\`

\`// Orta süreli olay örneği  
{
  "startTime": "00:00:23.1",
  "endTime": "00:00:25.8",     // 2.7 saniye fark
  "category": "Nesne Belirme",
  "description": "Mavi canavar ekranın sol tarafından yavaşça görünmeye başladı ve tam yerleşti", 
  "location": "sol kenar"
}\`

\`// Uzun süreli olay örneği
{
  "startTime": "00:01:05.3", 
  "endTime": "00:01:09.1",     // 3.8 saniye fark - seviye seçimi ekranı
  "category": "Seviye Seçimi",
  "description": "Seviye seçim menüsü ekranda görüntülendi ve kullanıcı seçim yaptı",
  "location": "ekran ortası"
}\`

\`// Puan gösterimi örneği
{
  "startTime": "00:02:12.5",
  "endTime": "00:02:14.2",     // 1.7 saniye fark
  "category": "Puan",
  "description": "+100 puan metni belirdi ve yavaşça kayboldu", 
  "location": "üst ortası"
}\`

**KRİTİK ÖNEM:**
- Kullanıcı "Tıklama" yazdıysa category: "Tıklama" yaz, "TIKLAMA" değil
- Kullanıcı "Nesne Belirme" yazdıysa category: "Nesne Belirme" yaz, "NESNE_BELIRDI" değil
- Kullanıcının yazdığı kategori isimlerini birebir koru
- Başka kategori ekleme, sadece kullanıcının verdiği kategorileri kullan
- **LOCATION ZORUNLU:** Her olay için mutlaka ekrandaki konumunu belirt

**ZAMAN KRİTİK KURALLARI:**
- **MUTLAK YASAK:** startTime = endTime durumu! (Aynı zaman ASLA kullanılmayacak)
- **ZORUNLU FARK:** En az 0.1 saniye fark olmalı (startTime ≠ endTime)
- **VİDEO İZLEME:** Her olayın videodaki gerçek süresini izleyerek hesapla
- **EKRANDA KALMA SÜRESİ:** Nesne/menü ekranda ne kadar kalıyorsa o kadar süre ver
- **Format:** SS:DD:SS.X (0.1 saniye hassasiyeti, örn: 00:01:23.4)
- **Kısa olaylar:** En az 0.1-0.4 saniye (tıklama, küçük animasyon)
- **Orta olaylar:** 0.5-2 saniye (nesne belirme, puan gösterimi) 
- **Uzun olaylar:** 2+ saniye (menü görünümü, seviye seçimi, loading)
- **GERÇEK GÖZLEM:** Videoyu dikkatlice izle, tahmini süre verme
- **ÖRNEK:** Menü 3 saniye ekrandaysa startTime ile endTime arası 3 saniye olmalı

Tüm analiz sonuçları Türkçe olmalıdır.`,
    isList: true,
    subModes: {
      'Özel Kategoriler': '',
    },
  },
  'Görsel-İşitsel Altyazılar': {
    emoji: '👀',
    prompt: `Bu videodaki her sahne için, sahneyi açıklayan altyazılar oluştur ve konuşulan \
    metinleri tırnak işareti içinde belirt. Her altyazıyı, videodaki zaman koduyla birlikte \
    set_timecodes fonksiyonuna gönderilen bir nesneye yerleştir. Tüm açıklamalar ve \
    altyazılar Türkçe olmalıdır.`,
    isList: true,
  },
  'Paragraf': {
    emoji: '📝',
    prompt: `Bu videoyu özetleyen bir paragraf oluştur. 3 ila 5 cümle arasında tut. \
    Özetin her cümlesini, videodaki zaman koduyla birlikte set_timecodes \
    fonksiyonuna gönderilen bir nesneye yerleştir. Özet tamamen Türkçe olmalıdır.`,
  },
  'Önemli Anlar': {
    emoji: '🔑',
    prompt: `Video için madde madde önemli noktalar oluştur. Her maddeyi, videodaki \
    zaman koduyla birlikte set_timecodes fonksiyonuna gönderilen bir nesneye \
    yerleştir. Tüm maddeler Türkçe olmalıdır.`,
    isList: true,
  },
  'Tablo': {
    emoji: '🤓',
    prompt: `Bu videodan 5 önemli sahne seç ve set_timecodes_with_objects fonksiyonunu \
    zaman kodu, 10 kelime veya daha az metin açıklaması ve sahnede görünen \
    nesnelerin listesi (temsili emojilerle) ile çağır. Tüm açıklamalar Türkçe olmalıdır.`,
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
