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

export const timeToSecs = (timecode: string): number => {
  if (typeof timecode !== 'string' || !timecode) {
    return 0;
  }
  const split = timecode.split(':').map(parseFloat);

  if (split.some(isNaN)) {
    return 0;
  }

  return split.length === 2
    ? split[0] * 60 + split[1]
    : split[0] * 3600 + split[1] * 60 + split[2];
};

export const secsToSrtTime = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  const milliseconds = Math.round(
    (totalSeconds - Math.floor(totalSeconds)) * 1000,
  )
    .toString()
    .padStart(3, '0');
  return `${hours}:${minutes}:${seconds},${milliseconds}`;
};

export const generateSrt = (
  timecodes: {time: string; text: string; startTime?: string; endTime?: string; category?: string}[],
  duration: number,
): string => {
  if (!timecodes || timecodes.length === 0) {
    return '';
  }

  return timecodes
    .map((tc, i) => {
      // AI'dan gelen startTime ve endTime varsa onları kullan, yoksa eskisi gibi hesapla
      let startTimeSecs: number;
      let endTimeSecs: number;

      if (tc.startTime && tc.endTime) {
        // AI'dan gelen başlangıç ve bitiş zamanlarını kullan
        startTimeSecs = timeToSecs(tc.startTime);
        endTimeSecs = timeToSecs(tc.endTime);
      } else {
        // Eski yöntem: sadece time varsa bitiş zamanını hesapla
        startTimeSecs = timeToSecs(tc.time);
        endTimeSecs =
          i < timecodes.length - 1
            ? timeToSecs(timecodes[i + 1].time)
            : duration;
      }

      const startTime = secsToSrtTime(startTimeSecs);
      const finalEndTimeSecs =
        endTimeSecs > startTimeSecs ? endTimeSecs : startTimeSecs + 2;
      const endTime = secsToSrtTime(finalEndTimeSecs);

      const text = (tc.text || '').replace(/\n/g, ' ');
      const categoryPrefix = tc.category ? `[${tc.category}] ` : '';

      return `${i + 1}\n${startTime} --> ${endTime}\n${categoryPrefix}${text}`;
    })
    .join('\n\n');
};

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

// Singleton FFmpeg instance — lazy-load, tekrar kullanılabilir
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    const ffmpeg = new FFmpeg();
    // multithread için SharedArrayBuffer gerekir (COOP/COEP headers)
    // yoksa single-thread core kullanılır
    await ffmpeg.load();
    ffmpegInstance = ffmpeg;
    ffmpegLoading = null;
    return ffmpeg;
  })();

  return ffmpegLoading;
}

export type SliceVideoOptions = {
  fps?: number | null;
  height?: number | null;
};

/**
 * FFmpeg.wasm ile videoyu belirli aralıkta keser ve istenirse optimize eder.
 * - fps verilirse kare sayısı düşürülür
 * - height verilirse yükseklik azaltılır (oran korunur)
 * - ikisi de kapalıysa hızlı kesim için stream copy kullanılır
 */
export async function sliceVideo(
  file: globalThis.File,
  startSecs: number,
  endSecs: number,
  options: SliceVideoOptions = {},
): Promise<globalThis.File> {
  const ffmpeg = await getFFmpeg();

  const inputName = 'input' + (file.name.substring(file.name.lastIndexOf('.')) || '.mp4');
  const outputName = `chunk_${startSecs}_${endSecs}.mp4`;

  try {
    // Dosyayı FFmpeg sanal dosya sistemine yaz
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    const duration = endSecs - startSecs;
    const fps = options.fps && options.fps > 0 ? Math.floor(options.fps) : null;
    const height = options.height && options.height > 0 ? Math.floor(options.height) : null;

    if (!fps && !height) {
      // Hızlı kesim — stream copy.
      // -map_metadata 0: rotation dahil tüm metadata korunsun (dikey videolar için kritik)
      await ffmpeg.exec([
        '-ss', startSecs.toString(),
        '-i', inputName,
        '-t', duration.toString(),
        '-c', 'copy',
        '-map_metadata', '0',
        '-movflags', '+faststart',
        '-avoid_negative_ts', 'make_zero',
        outputName,
      ]);

      // Stream copy 0 byte ürettiyse, re-encode ile tekrar dene
      // (dikey/rotated videolarda stream copy bazen başarısız olur)
      const copyData = await ffmpeg.readFile(outputName) as Uint8Array;
      if (!copyData || copyData.length === 0) {
        console.warn('Stream copy 0 byte üretti, re-encode ile tekrar deneniyor...');
        await ffmpeg.deleteFile(outputName).catch(() => {});
        await ffmpeg.exec([
          '-ss', startSecs.toString(),
          '-i', inputName,
          '-t', duration.toString(),
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-pix_fmt', 'yuv420p',
          '-map_metadata', '0',
          '-movflags', '+faststart',
          '-avoid_negative_ts', 'make_zero',
          outputName,
        ]);
      }
    } else {
      const filters: string[] = [];

      if (fps) {
        filters.push(`fps=${fps}`);
      }

      if (height) {
        // Hem yatay hem dikey videoları destekleyen scale filtresi:
        // - Dikey video (ih > iw): genişliği height'a göre oranla, yüksekliği koru
        // - Yatay video (iw >= ih): yüksekliği height'a ayarla, genişliği oranla
        // - 2'ye bölünebilirlik: ceil ile sağla (codec uyumluluğu için gerekli)
        filters.push(
          `scale='if(gt(ih,iw),min(${height},iw),-2)':'if(gt(ih,iw),-2,min(${height},ih))'`
        );
      }

      const command = [
        '-ss', startSecs.toString(),
        '-i', inputName,
        '-t', duration.toString(),
        '-vf', filters.join(','),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-pix_fmt', 'yuv420p',
        '-map_metadata', '0',
        '-movflags', '+faststart',
      ];

      if (fps) {
        command.push('-r', fps.toString());
      }

      command.push('-avoid_negative_ts', 'make_zero', outputName);
      await ffmpeg.exec(command);
    }

    // Çıktıyı oku
    const data = await ffmpeg.readFile(outputName) as Uint8Array;

    // Temizlik
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});

    // 0 byte kontrolü — FFmpeg.wasm büyük dosyalarda bazen boş çıktı üretir
    if (!data || data.length === 0) {
      throw new Error(`FFmpeg çıktısı boş (0 byte). Video kesme başarısız oldu (${startSecs}s - ${endSecs}s).`);
    }

    const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' });
    return new File([blob], outputName, { type: 'video/mp4' });
  } catch (err) {
    // Hata durumunda temizlik dene
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});

    // Herhangi bir hata durumunda FFmpeg'i sıfırla — sonraki işlem temiz başlasın
    console.warn('FFmpeg hatası, instance sıfırlanıyor:', err instanceof Error ? err.message : err);
    resetFFmpeg();

    throw err;
  }
}

/**
 * FFmpeg instance'ını sıfırlar. Bellek hatası sonrasında yeniden yükleme için kullanılır.
 */
export function resetFFmpeg(): void {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch (_) {
      // terminate başarısız olabilir, yoksay
    }
  }
  ffmpegInstance = null;
  ffmpegLoading = null;
}
