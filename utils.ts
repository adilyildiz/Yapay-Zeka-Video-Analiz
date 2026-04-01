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

/**
 * FFmpeg.wasm ile video dosyasını belirli zaman aralığında keser.
 * -c copy ile re-encode yapmadan keser — neredeyse anında.
 */
export async function sliceVideo(
  file: globalThis.File,
  startSecs: number,
  endSecs: number,
): Promise<globalThis.File> {
  const ffmpeg = await getFFmpeg();

  const inputName = 'input' + (file.name.substring(file.name.lastIndexOf('.')) || '.mp4');
  const outputName = `chunk_${startSecs}_${endSecs}.mp4`;

  // Dosyayı FFmpeg sanal dosya sistemine yaz
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const duration = endSecs - startSecs;

  // -c copy: re-encode yapmadan keser (çok hızlı)
  await ffmpeg.exec([
    '-ss', startSecs.toString(),
    '-i', inputName,
    '-t', duration.toString(),
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
    outputName,
  ]);

  // Çıktıyı oku
  const data = await ffmpeg.readFile(outputName);

  // Temizlik
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  const blob = new Blob([data], { type: 'video/mp4' });
  return new File([blob], outputName, { type: 'video/mp4' });
}
