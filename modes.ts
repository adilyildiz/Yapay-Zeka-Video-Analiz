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
  - **Örnek:** \`EKRAN DEĞİŞİKLİĞİ: Ekranın üstündeki zaman sayacı 00:30'dan 00:29'a düştü.\``,
    isList: true,
  },
  
  'Kategorik Süreç Transkripti': {
    emoji: '📜',
    prompt: (input) => `Videoyu analiz et ve SADECE kullanıcının belirttiği kategorilere göre bir süreç transkripti oluştur.

### 1. Kategori Kullanımı
- **Kesinlikle Sadece Bu Kategorileri Kullan:** ${input || 'Lütfen analiz edilmesi gereken kategorileri belirtin (örn: "Tıklama, Nesne Belirme, Puan Değişimi" şeklinde virgülle ayırarak yazın)'}
- **Kategori Adlarını Koru:** Kullanıcının yazdığı kategori isimlerini (büyük/küçük harf duyarlı olarak) birebir koru. Örn: Kullanıcı "Tıklama" yazdıysa, category içinde "Tıklama" kullan.
- **Yeni Kategori Oluşturma:** Asla kendi kendine yeni bir kategori ekleme. Eğer videoda belirtilen kategorilerden hiçbiri yoksa, boş sonuç döndür.
- **ÇOKLU KATEGORİ KURALI:** Bir olay birden fazla kategoriye ait olabilir. Bu durumda, kategorileri bir dizi (array) içinde belirt. Kategoriler birbirine benzer olsa bile, ilişkili olduğunu düşündüğün tüm kategorileri döndür.

### 2. Temel Analiz Kuralları
- **Olayları Gruplama:** Olayları gruplama. Her bir olayı ayrı ayrı raporla.
- **Konum Belirleme:** Her olayın ekrandaki konumunu mutlaka belirt (örn: "sol üst köşe", "ekran ortası", "sağ alt bölge").

### 3. Zamanlama ve Format Kuralları
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

### 4. Çıktı Formatı
\`set_categorical_timecodes\` fonksiyonunu kullanarak her olay için şu bilgileri içeren bir nesne gönder:
- **startTime:** Olayın başlangıç zamanı (SS:DD:SS.X).
- **endTime:** Olayın bitiş zamanı (SS:DD:SS.X).
- **category:** Bir veya daha fazla kategori adı (string veya string dizisi).
- **description:** Olayın detaylı açıklaması (kategori adını tekrarlama).
- **location:** Ekrandaki konum.

### 5. Örnekler:
\`// Doğru - Tek kategori
{
  "startTime": "00:00:15.2",
  "endTime": "00:00:15.4",
  "category": "action points",
  "description": "Ekranın ortasındaki yeşil canavarın üzerine tıklandı",
  "location": "ekran ortası"
}\`

\`// Doğru - Birden fazla kategori
{
  "startTime": "00:01:05.3",
  "endTime": "00:01:09.1",
  "category": ["menu interaction", "level selection"],
  "description": "Kullanıcı seviye seçim menüsünden 3. seviyeyi seçti",
  "location": "ekran ortası"
}\`

### 6. Önemli Hatırlatmalar:
- Bir olay birden fazla kategoriye aitse, kategorileri bir dizi içinde ver.
- Olayları birleştirme, her birini ayrı raporla.

Tüm analiz sonuçları Türkçe olmalıdır.`,
    isList: true,
    subModes: {
      'Oyun Mekanikleri Kategorileri': 'fun, challenge, behavioural momentum, rewards, penalties, pavlovian interaction, urgent optimism, communal discovery, strategy/planning, story, cooperation, pareto optimal, feedback, protege effect, mini games, design/editing, realism, ownership, role play, virality, cascading information, collaboration, competition, cut scenes, action points, levels, tokens, question&answer, game turns, selecting/collecting, resource management, capture/eliminate, feedback, goods/information, time pressure, tutorial, tiles/grids, infinite gameplay, appointment, movement, assessment, status, simulate, response',
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
