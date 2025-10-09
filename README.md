<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Video Analiz Aracı - Google Gemini & Ollama Desteği

Bu uygulama, video dosyalarınızı analiz etmek için Google Gemini AI ve Ollama (yerel AI) API'lerini kullanabilen gelişmiş bir video analiz aracıdır.

View your app in AI Studio: https://ai.studio/apps/drive/11SLYZ0NDtYxsWUyCSMcw9y54VEpfMp8k

## Özellikler

- **Dual API Support**: Google Gemini ve Ollama arasında seçim yapabilirsiniz
- **Video Analizi**: Detaylı transkript, nesnelerle analiz, grafiksel veri çıkarımı
- **Zaman Damgalı Çıktı**: SRT formatında çıktı desteği
- **Yerel AI Desteği**: Ollama ile gizlilik odaklı yerel analiz
- **Özelleştirilebilir Promptlar**: Kendi analiz komutlarınızı yazabilirsiniz

## Kurulum ve Çalıştırma

**Gereksinimler:** Node.js v20+

1. **Bağımlılıkları yükleyin:**
   ```bash
   npm install
   ```

2. **Çevre değişkenlerini ayarlayın** (Google Gemini kullanacaksanız):
   - `.env.local` dosyası oluşturun
   - `GEMINI_API_KEY` değişkenini Gemini API anahtarınızla ayarlayın

3. **Uygulamayı çalıştırın:**
   ```bash
   npm run dev
   ```

4. **Tarayıcıda açın:**
   - http://localhost:3000 adresine gidin

## API Konfigürasyonu

### Google Gemini (Bulut API)
- Google AI Studio'da API anahtarı alın: https://aistudio.google.com/
- Uygulamada "API Ayarları" butonuna tıklayın
- "Google Gemini" seçeneğini seçin ve API anahtarınızı girin

### Ollama (Yerel AI)
1. **Ollama'yı yükleyin:** https://ollama.ai/
2. **Video analizi için uygun modeli yükleyin:**
   ```bash
   ollama pull llava:latest
   # veya
   ollama pull moondream:latest
   ```
3. **Ollama sunucusunu başlatın:**
   ```bash
   ollama serve
   ```
4. **Uygulamada konfigürasyonu yapın:**
   - "API Ayarları" butonuna tıklayın
   - "Ollama (Yerel)" seçeneğini seçin
   - Sunucu URL: `http://localhost:11434`
   - Model: `llava:latest` (veya yüklediğiniz model)
   - "Test" butonuyla bağlantıyı doğrulayın

## Kullanım

1. **Video Yükleme**: Bir video dosyasını sürükleyip bırakın veya seçin
2. **API Seçimi**: Sağ üst köşedeki "API Ayarları" ile Google Gemini veya Ollama'yı seçin
3. **Analiz Modu**: İstediğiniz analiz türünü seçin:
   - Detaylı Transkript
   - Nesnelerle Transkript  
   - Grafik (çeşitli metrikler)
   - Özel (kendi promptınızı yazın)
4. **Sonuçları İncele**: Zaman damgalı analiz sonuçlarını görüntüleyin ve indirin

## Desteklenen Video Formatları

- MP4, WebM, AVI, MOV ve diğer yaygın video formatları
- Maksimum dosya boyutu: API sağlayıcısına bağlı olarak değişir

## Geliştirme

```bash
# Geliştirme sunucusu
npm run dev

# Production build
npm run build

# Build önizleme
npm run preview
```

## Katkıda Bulunma

1. Fork'layın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit'leyin (`git commit -m 'Add amazing feature'`)
4. Push'layın (`git push origin feature/amazing-feature`)
5. Pull Request açın

## Lisans

Bu proje Apache 2.0 lisansı altında lisanslanmıştır.
