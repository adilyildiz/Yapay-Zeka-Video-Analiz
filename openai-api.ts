/**
 * OpenAI-compatible API integration for video analysis
 * Works with LocalAI, LM Studio, OpenAI, and any OpenAI-compatible endpoint.
 */

export interface OpenAIConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface OpenAIUploadedFile {
  name: string;
  data: string; // base64 encoded image data
  mimeType: string;
  extraImages?: string[]; // additional base64 frames for multi-frame mode
}

export interface OpenAIResponse {
  response: string;
  functionCalls?: any[];
  candidates?: any[];
}

class OpenAIAPI {
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
  }

  async generateContent(
    text: string,
    functionDeclarations: any[],
    file: OpenAIUploadedFile,
  ): Promise<OpenAIResponse> {
    try {
      const imageUrls: { type: 'image_url'; image_url: { url: string } }[] = [
        {
          type: 'image_url',
          image_url: { url: `data:${file.mimeType};base64,${file.data}` },
        },
      ];

      if (file.extraImages) {
        for (const img of file.extraImages) {
          imageUrls.push({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${img}` },
          });
        }
      }

      const isMultiFrame = file.extraImages && file.extraImages.length > 0;
      const frameCount = 1 + (file.extraImages?.length || 0);

      const systemPrompt = isMultiFrame
        ? `Bir video parçasından eşit aralıklarla çıkarılmış ${frameCount} kareyi analiz ediyorsun. Kareler kronolojik sırayla verilmiştir. Kareler arası değişimleri ve hareketleri tespit et.`
        : `Videodan çıkarılmış bir frame'i analiz ediyorsun. Bu görüntü videodaki bir anı temsil ediyor.`;

      const userPrompt = `${text}

ANALİZ TALİMATLARI:
1. ${isMultiFrame ? `Tüm ${frameCount} kareyi sırayla dikkatle analiz et` : 'Bu video frame\'ini dikkatle analiz et'}
2. Gördüklerini detaylı şekilde Türkçe olarak açıkla
3. Analizini JSON formatında \`\`\`json ... \`\`\` blokları içinde ver
4. TÜM AÇIKLAMALAR VE METİNLER TÜRKÇE OLMALIDIR

Zaman kodlu analiz için bu formatı kullan:
\`\`\`json
{
  "timecodes": [
    {
      "time": "00:01:30",
      "text": "Detaylı Türkçe açıklama"
    }
  ]
}
\`\`\`

ÖNEMLİ NOTLAR:
- Tanımlayabildiğin nesneler, kişiler, eylemler ve sahneler hakkında spesifik bilgi ver
- Zaman damgası formatı olarak SS:DD:SS kullan
- Eğer kesin zamanlamayı belirleyemiyorsan, tahmini zaman damgaları ver
- TÜM AÇIKLAMALAR TÜRKÇE OLMALIDIR

Şimdi analiz et:`;

      console.log('Sending request to OpenAI-compatible API with:', {
        baseURL: this.config.baseURL,
        model: this.config.model,
        promptLength: userPrompt.length,
        frameCount,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(`${this.config.baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: userPrompt },
                ...imageUrls,
              ],
            },
          ],
          temperature: 0.3,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error details:', errorText);
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      console.log('OpenAI response:', data);

      const content = data.choices?.[0]?.message?.content || '';

      let functionCalls: any[] = [];
      try {
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          const parsedData = JSON.parse(jsonMatch[1]);
          if (parsedData.timecodes) {
            functionCalls = [{ name: 'set_timecodes', args: parsedData }];
          }
        }
      } catch (e) {
        console.log('No structured data found in OpenAI response, using plain text');
      }

      return {
        response: content,
        functionCalls,
        candidates: [{
          finishReason: data.choices?.[0]?.finish_reason === 'length' ? 'MAX_TOKENS' : 'STOP',
          finishMessage: content,
        }],
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw error;
    }
  }

  async uploadFile(file: globalThis.File): Promise<OpenAIUploadedFile> {
    // Frame extraction — same as Ollama approach
    if (file.type.startsWith('video/')) {
      return this.extractVideoFrame(file);
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result as string;
        const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        resolve({ name: file.name, data: base64, mimeType: 'image/jpeg' });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private async extractVideoFrame(file: globalThis.File, timePoint?: number): Promise<OpenAIUploadedFile> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context not available')); return; }

      video.onloadedmetadata = () => {
        canvas.width = Math.min(video.videoWidth, 1280);
        canvas.height = Math.min(video.videoHeight, 720);
        const targetTime = timePoint !== undefined ? timePoint : video.duration / 2;
        video.currentTime = Math.min(targetTime, video.duration - 1);
      };

      video.onseeked = () => {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const base64Data = canvas.toDataURL('image/jpeg', 0.8);
          resolve({
            name: file.name + `_frame_${Math.round(video.currentTime)}s.jpg`,
            data: base64Data.split(',')[1],
            mimeType: 'image/jpeg',
          });
        } catch (error) { reject(error); }
      };

      video.onerror = () => reject(new Error('Video loading failed'));
      video.src = URL.createObjectURL(file);
      video.load();
    });
  }

  async extractFrameAtTime(file: globalThis.File, timeInSeconds: number): Promise<OpenAIUploadedFile> {
    return this.extractVideoFrame(file, timeInSeconds);
  }

  async prepareVideoSegment(file: globalThis.File, frameCount?: number): Promise<OpenAIUploadedFile> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context not available')); return; }

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
                res(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
              } catch (err) { rej(err); }
            };
          });
        };

        try {
          for (let i = 1; i <= count; i++) {
            frames.push(await extractFrame(interval * i));
          }
          URL.revokeObjectURL(video.src);
          resolve({
            name: file.name + `_multiframe_${count}.jpg`,
            data: frames[0],
            mimeType: 'image/jpeg',
            extraImages: frames.slice(1),
          });
        } catch (err) { reject(err); }
      };

      video.onerror = () => reject(new Error('Video loading failed'));
      video.src = URL.createObjectURL(file);
      video.load();
    });
  }

  async checkConnection(): Promise<boolean> {
    try {
      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }
      const response = await fetch(`${this.config.baseURL}/v1/models`, { headers });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }
      const response = await fetch(`${this.config.baseURL}/v1/models`, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.data?.map((m: any) => m.id) || [];
    } catch {
      return [];
    }
  }
}

export default OpenAIAPI;
