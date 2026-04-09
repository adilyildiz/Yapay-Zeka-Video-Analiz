/**
 * Ollama API integration for video analysis
 */

export interface OllamaConfig {
  baseURL: string;
  model: string;
}

export interface OllamaUploadedFile {
  name: string;
  data: string; // base64 encoded image data
  mimeType: string;
  extraImages?: string[]; // additional base64 frames for multi-frame mode
}

export interface OllamaResponse {
  response: string;
  functionCalls?: any[];
  candidates?: any[];
}

class OllamaAPI {
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
  }

  private optimizePromptForOllama(text: string): string {
    // Ollama için prompt optimizasyonu - video frame analizi
    const structuredPrompt = `Videodan çıkarılmış bir frame'i analiz ediyorsun. Bu görüntü videodaki bir anı temsil ediyor.

Kullanıcı İsteği: ${text}

ANALİZ TALİMATLARI:
1. Bu video frame'ini dikkatle analiz et
2. Gördüklerini detaylı şekilde Türkçe olarak açıkla
3. Eğer istek belirli zaman segmentlerinden bahsediyorsa, bunun temsili bir frame olduğunu kabul et
4. Analizini JSON formatında \`\`\`json ... \`\`\` blokları içinde ver
5. TÜM AÇIKLAMALAR VE METİNLER TÜRKÇE OLMALIDIR

Zaman kodlu analiz için bu formatı kullan:
\`\`\`json
{
  "timecodes": [
    {
      "time": "00:01:30",
      "text": "Bu frame'de görülebilenlerin detaylı Türkçe açıklaması"
    }
  ]
}
\`\`\`

ÖNEMLİ NOTLAR:
- Bu videonun tamamı değil, videodan alınmış tek bir frame'dir
- Görülebilen öğelerin detaylı açıklamasını Türkçe olarak yap
- Tanımlayabildiğin nesneler, kişiler, eylemler ve sahneler hakkında spesifik bilgi ver
- Zaman damgası formatı olarak SS:DD:SS kullan
- Eğer kesin zamanlamayı belirleyemiyorsan, tahmini zaman damgaları ver
- TÜM AÇIKLAMALAR TÜRKÇE OLMALIDIR

Şimdi bu video frame'ini analiz et:`;

    return structuredPrompt;
  }

  async generateContent(
    text: string,
    functionDeclarations: any[],
    file: OllamaUploadedFile,
  ): Promise<OllamaResponse> {
    try {
      // Ollama için optimize edilmiş prompt
      const optimizedPrompt = this.optimizePromptForOllama(text);
      
      console.log('Sending request to Ollama with:', {
        model: this.config.model,
        promptLength: optimizedPrompt.length,
        hasImage: !!file.data,
        mimeType: file.mimeType
      });
      
      const response = await fetch(`${this.config.baseURL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: optimizedPrompt,
          images: [file.data], // Base64 encoded image frame
          stream: false,
          options: {
            temperature: 0.3,
            top_k: 20,
            top_p: 0.9,
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Ollama API error details:', errorText);
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      console.log('Ollama response:', data);
      
      // Parse function calls from the response if any
      let functionCalls: any[] = [];
      try {
        // Try to extract JSON from the response
        const jsonMatch = data.response.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          const parsedData = JSON.parse(jsonMatch[1]);
          if (parsedData.timecodes) {
            functionCalls = [{
              name: 'set_timecodes',
              args: parsedData
            }];
          }
        }
      } catch (e) {
        console.log('No structured data found in response, using plain text');
      }

      return {
        response: data.response,
        functionCalls,
        candidates: [{
          finishReason: 'STOP',
          finishMessage: data.response
        }]
      };
    } catch (error) {
      console.error('Ollama API error:', error);
      throw error;
    }
  }

  async uploadFile(file: globalThis.File): Promise<OllamaUploadedFile> {
    if (file.type.startsWith('video/')) {
      // Video dosyası için frame extraction
      return this.extractVideoFrames(file);
    } else {
      // Normal image dosyası için
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = () => {
          const base64Data = reader.result as string;
          // Remove data URL prefix if present
          const base64 = base64Data.includes(',') 
            ? base64Data.split(',')[1] 
            : base64Data;
          
          resolve({
            name: file.name,
            data: base64,
            mimeType: 'image/jpeg', // Ollama için image format'a çevir
          });
        };
        
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }
  }

  private async extractVideoFrames(file: globalThis.File, timePoint?: number): Promise<OllamaUploadedFile> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      video.onloadedmetadata = () => {
        canvas.width = Math.min(video.videoWidth, 1280); // Max width 1280px
        canvas.height = Math.min(video.videoHeight, 720); // Max height 720px
        
        // Belirtilen zaman noktasından frame al, yoksa ortasından
        const targetTime = timePoint !== undefined ? timePoint : video.duration / 2;
        video.currentTime = Math.min(targetTime, video.duration - 1);
      };

      video.onseeked = () => {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const base64Data = canvas.toDataURL('image/jpeg', 0.8);
          const base64 = base64Data.split(',')[1];
          
          resolve({
            name: file.name + `_frame_${Math.round(video.currentTime)}s.jpg`,
            data: base64,
            mimeType: 'image/jpeg',
          });
        } catch (error) {
          reject(error);
        }
      };

      video.onerror = () => reject(new Error('Video loading failed'));
      
      const url = URL.createObjectURL(file);
      video.src = url;
      video.load();
    });
  }

  // Belirtilen zaman dilimi için frame extraction
  async extractFrameAtTime(file: globalThis.File, timeInSeconds: number): Promise<OllamaUploadedFile> {
    return this.extractVideoFrames(file, timeInSeconds);
  }

  // Video segmentinden çoklu kare çıkararak hazırla
  async prepareVideoSegment(file: globalThis.File, frameCount?: number): Promise<OllamaUploadedFile> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      video.onloadedmetadata = async () => {
        canvas.width = Math.min(video.videoWidth, 1280);
        canvas.height = Math.min(video.videoHeight, 720);

        const duration = video.duration;
        // Belirtilmezse saniyede 1 kare, en az 2 en fazla 30
        const count = Math.max(2, Math.min(frameCount ?? Math.ceil(duration), 30));
        const interval = duration / (count + 1);
        const frames: string[] = [];

        const extractFrame = (time: number): Promise<string> => {
          return new Promise((res, rej) => {
            video.currentTime = Math.min(time, duration - 0.1);
            video.onseeked = () => {
              try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const base64Data = canvas.toDataURL('image/jpeg', 0.8);
                res(base64Data.split(',')[1]);
              } catch (err) {
                rej(err);
              }
            };
          });
        };

        try {
          for (let i = 1; i <= count; i++) {
            const frame = await extractFrame(interval * i);
            frames.push(frame);
          }

          const url = URL.createObjectURL(file);
          URL.revokeObjectURL(url);

          resolve({
            name: file.name + `_multiframe_${count}.jpg`,
            data: frames[0],
            mimeType: 'image/jpeg',
            extraImages: frames.slice(1),
          });
        } catch (err) {
          reject(err);
        }
      };

      video.onerror = () => reject(new Error('Video loading failed for multi-frame extraction'));

      const url = URL.createObjectURL(file);
      video.src = url;
      video.load();
    });
  }

  // Çoklu kare ile analiz yapma (video segmentinden çıkarılmış frame'ler)
  async generateContentWithVideo(
    text: string,
    functionDeclarations: any[],
    file: OllamaUploadedFile,
  ): Promise<OllamaResponse> {
    try {
      const allImages = [file.data, ...(file.extraImages || [])];
      const frameCount = allImages.length;

      const optimizedPrompt = `Bir video parçasından eşit aralıklarla çıkarılmış ${frameCount} kareyi analiz ediyorsun. Bu kareler videoyu kronolojik sırayla temsil eder.

Kullanıcı İsteği: ${text}

ANALİZ TALİMATLARI:
1. Tüm ${frameCount} kareyi sırayla dikkatle analiz et
2. Kareler arasındaki değişimleri ve hareketleri tespit et
3. Gördüklerini detaylı şekilde Türkçe olarak açıkla
4. Analizini JSON formatında \`\`\`json ... \`\`\` blokları içinde ver
5. TÜM AÇIKLAMALAR VE METİNLER TÜRKÇE OLMALIDIR

Zaman kodlu analiz için bu formatı kullan:
\`\`\`json
{
  "timecodes": [
    {
      "time": "00:01:30",
      "text": "Bu karelerde görülebilenlerin detaylı Türkçe açıklaması"
    }
  ]
}
\`\`\`

ÖNEMLİ NOTLAR:
- Sırayla ${frameCount} adet kare gönderiliyor, ilk kare videonun başı, son kare sonu
- Kareler arası geçişleri ve değişimleri not et
- Tanımlayabildiğin nesneler, kişiler, eylemler ve sahneler hakkında spesifik bilgi ver
- Zaman damgası formatı olarak SS:DD:SS kullan
- TÜM AÇIKLAMALAR TÜRKÇE OLMALIDIR

Şimdi bu ${frameCount} kareyi analiz et:`;

      console.log('Sending multi-frame to Ollama with:', {
        model: this.config.model,
        promptLength: optimizedPrompt.length,
        frameCount,
      });

      const response = await fetch(`${this.config.baseURL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: optimizedPrompt,
          images: allImages, // Multiple base64 JPEG frames
          stream: false,
          options: {
            temperature: 0.3,
            top_k: 20,
            top_p: 0.9,
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Ollama API error details:', errorText);
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      console.log('Ollama multi-frame response:', data);

      let functionCalls: any[] = [];
      try {
        const jsonMatch = data.response.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          const parsedData = JSON.parse(jsonMatch[1]);
          if (parsedData.timecodes) {
            functionCalls = [{
              name: 'set_timecodes',
              args: parsedData
            }];
          }
        }
      } catch (e) {
        console.log('No structured data found in multi-frame response, using plain text');
      }

      return {
        response: data.response,
        functionCalls,
        candidates: [{
          finishReason: 'STOP',
          finishMessage: data.response
        }]
      };
    } catch (error) {
      console.error('Ollama multi-frame API error:', error);
      throw error;
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseURL}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseURL}/api/tags`);
      if (!response.ok) return [];
      
      const data = await response.json();
      return data.models?.map((model: any) => model.name) || [];
    } catch {
      return [];
    }
  }
}

export default OllamaAPI;