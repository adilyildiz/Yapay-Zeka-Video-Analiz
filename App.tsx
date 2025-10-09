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

import c from 'classnames';
import React, {useEffect, useRef, useState} from 'react';
import {generateContent, uploadFile, type UploadedFile, APIConfig, APIProvider, getCurrentConfig} from './api';
import APISettings from './APISettings';
import Chart from './Chart.jsx';
import functions from './functions';
import * as XLSX from 'xlsx';
import modes from './modes';
import {generateSrt, timeToSecs} from './utils';
import VideoPlayer from './VideoPlayer.jsx';
import ThemeSwitcher from './ThemeSwitcher';

// Cookie yardımcı fonksiyonları
function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/';
}

function getCookie(name: string) {
  return document.cookie.split('; ').reduce((r, v) => {
    const parts = v.split('=');
    return parts[0] === name ? decodeURIComponent(parts[1]) : r;
  }, '');
}

// Mode ayarlarını kaydet
function saveModePreferences(mode: string, customPrompt: string, chartMode: string, chartPrompt: string) {
  const preferences = {
    selectedMode: mode,
    customPrompt,
    chartMode,
    chartPrompt
  };
  setCookie('mode_preferences', JSON.stringify(preferences));
}

// Mode ayarlarını yükle
function loadModePreferences() {
  const cookieValue = getCookie('mode_preferences');
  if (cookieValue) {
    try {
      return JSON.parse(cookieValue);
    } catch {
      return null;
    }
  }
  return null;
}

const chartModes = Object.keys(modes['Grafik'].subModes!);
type ModeKey = keyof typeof modes;

export default function App() {
  // Cookie'den mode preferences'ları yükle
  const savedPreferences = loadModePreferences();
  
  const [vidUrl, setVidUrl] = useState<string | null>(null);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [timecodeList, setTimecodeList] = useState<any[] | null>(null);
  const [requestedTimecode, setRequestedTimecode] = useState<number | null>(
    null,
  );
  const [selectedMode, setSelectedMode] =
    useState<ModeKey>(savedPreferences?.selectedMode || 'Detaylı Transkript');
  const [activeMode, setActiveMode] = useState<ModeKey>();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(savedPreferences?.customPrompt || '');
  const [chartMode, setChartMode] = useState(savedPreferences?.chartMode || chartModes[0]);
  const [chartPrompt, setChartPrompt] = useState(savedPreferences?.chartPrompt || '');
  const [chartLabel, setChartLabel] = useState('');
  const [theme, setTheme] = useState(
    localStorage.getItem('theme') || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light')
  );
  const [videoDuration, setVideoDuration] = useState(0);
  const [srtTranscript, setSrtTranscript] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [step, setStep] = useState<'upload' | 'mode' | 'results'>('upload');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [analysisProgress, setAnalysisProgress] = useState<string | null>(null);
  const [isAPISettingsOpen, setIsAPISettingsOpen] = useState(false);
  const [currentAPIConfig, setCurrentAPIConfig] = useState<APIConfig>(getCurrentConfig());
  const [currentProvider, setCurrentProvider] = useState<string>('Google Gemini');
  const [chunkDuration, setChunkDuration] = useState<number | 'all'>(30);
  const [reanalysisStartTime, setReanalysisStartTime] = useState<string>('');
  const [reanalysisEndTime, setReanalysisEndTime] = useState<string>('');
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [showModeSelection, setShowModeSelection] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<globalThis.File | null>(null);
  // FIX: Changed HTMLElement to HTMLDivElement to match the element type it's referencing.
  const scrollRef = useRef<HTMLDivElement>(null);
  const isCustomMode = selectedMode === 'Özel';
  const isChartMode = selectedMode === 'Grafik';
  const isCategoricalMode = selectedMode === 'Kategorik Süreç Transkripti';
  const isCustomChartMode = isChartMode && chartMode === 'Özel';
  const hasSubMode = isCustomMode || isChartMode || isCategoricalMode;
  
  const handleAPIConfigChange = (config: APIConfig) => {
    setCurrentAPIConfig(config);
    setCurrentProvider(config.provider === APIProvider.GEMINI ? 'Google Gemini' : 'Ollama');
  };

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  // İlk yüklemede API config'i cookie'den yükle
  useEffect(() => {
    console.log('App yüklendi, API config yükleniyor...');
    const loadedConfig = getCurrentConfig();
    console.log('Yüklenen config:', loadedConfig);
    setCurrentAPIConfig(loadedConfig);
    setCurrentProvider(loadedConfig.provider === APIProvider.GEMINI ? 'Google Gemini' : 'Ollama');
  }, []);

  // Mode preferences'ları cookie'ye kaydet
  useEffect(() => {
    saveModePreferences(selectedMode, customPrompt, chartMode, chartPrompt);
  }, [selectedMode, customPrompt, chartMode, chartPrompt]);

  // İlk yüklemede submode gerektiren mod varsa, direkt submode ekranına geç
  useEffect(() => {
    if (selectedMode === 'Özel' || selectedMode === 'Grafik' || selectedMode === 'Kategorik Süreç Transkripti') {
      setShowModeSelection(false);
    }
  }, []); // Sadece component mount'da çalışsın

  useEffect(() => {
    if (timecodeList?.length && videoDuration > 0) {
      const listForSrt = timecodeList.map((tc) => ({
        time: tc.time,
        text: tc.text || tc.value?.toString() || '',
      }));
      const srt = generateSrt(listForSrt, videoDuration);
      setSrtTranscript(srt);
    } else {
      setSrtTranscript('');
    }
  }, [timecodeList, videoDuration]);

  useEffect(() => {
    if (!vidUrl) return;

    const video = document.createElement('video');
    video.src = vidUrl;
    video.preload = 'metadata';

    const handleMetadataLoaded = () => {
      setVideoDuration(video.duration);
    };

    video.addEventListener('loadedmetadata', handleMetadataLoaded);

    // Cleanup function to remove event listener
    return () => {
      video.removeEventListener('loadedmetadata', handleMetadataLoaded);
    };
  }, [vidUrl]);

  const setTimecodes = ({timecodes}: {timecodes: any[]}) =>
    setTimecodeList(
      timecodes.map((t) => ({...t, text: t.text?.replaceAll("\\'", "'")})),
    );

  const setCategoricalTimecodes = ({timecodes}: {timecodes: any[]}) => {
    // Kategorik fonksiyondan gelen verileri standart formata dönüştür
    const convertedTimecodes = timecodes.map((t) => ({
      time: t.startTime, // Ana zaman olarak startTime kullan
      text: `[${t.category}]: ${t.description}`,
      startTime: t.startTime,
      endTime: t.endTime,
      category: t.category,
      description: t.description,
      location: t.location
    }));
    setTimecodeList(convertedTimecodes);
  };

  const setNumericTimecodes = ({timecodes}: {timecodes: any[]}) =>
    setTimecodeList(timecodes);

  const handleCopy = () => {
    if (!srtTranscript) return;
    navigator.clipboard.writeText(srtTranscript).then(() => {
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    });
  };

  const handleDownloadSrt = () => {
    if (!srtTranscript) return;

    const blob = new Blob([srtTranscript], {type: 'text/srt'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const originalFilename = fileName || 'transcript';
    const baseFilename =
      originalFilename.substring(0, originalFilename.lastIndexOf('.')) ||
      originalFilename;
    a.download = `${baseFilename}.srt`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadExcel = () => {
    if (!timecodeList) return;

    // Excel için veri hazırlama
    const data: any[][] = [];
    const headers = ['Başlangıç', 'Bitiş', 'Kategori', 'Metin'];
    data.push(headers);

    timecodeList.forEach((item) => {
      let startTime = item.time;
      let endTime = item.time; // Varsayılan olarak başlangıç ile aynı
      let category = '';
      let text = item.text || '';

      // Eğer metin içinde kategori varsa ayıkla
      const categoryMatch = text.match(/^\[(.*?)\]:\s*(.*)/);
      if (categoryMatch) {
        category = categoryMatch[1];
        text = categoryMatch[2];
      }

      // SRT formatındaki zaman aralığını kontrol et (başlangıç --> bitiş)
      if (text.includes(' --> ')) {
        const timeMatch = text.match(/^(.+?)\s-->\s(.+?):\s*(.*)/);
        if (timeMatch) {
          startTime = timeMatch[1];
          endTime = timeMatch[2];
          text = timeMatch[3];
        }
      }

      data.push([startTime, endTime, category, text]);
    });

    // XLSX workbook oluştur
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transkript");

    // Kolon genişliklerini ayarla
    const wscols = [
      { wch: 15 }, // Başlangıç
      { wch: 15 }, // Bitiş
      { wch: 20 }, // Kategori
      { wch: 50 }  // Metin
    ];
    ws['!cols'] = wscols;

    // Dosya adını hazırla
    const originalFilename = fileName || 'transcript';
    const baseFilename =
      originalFilename.substring(0, originalFilename.lastIndexOf('.')) ||
      originalFilename;

    // Excel dosyasını indir
    XLSX.writeFile(wb, `${baseFilename}.xlsx`);
  };

  const uploadVideo = async (fileToUpload: File) => {
    if (!fileToUpload) return;
    setFileName(fileToUpload.name);
    setIsLoadingVideo(true);
    setVidUrl(URL.createObjectURL(fileToUpload));
    
    // Orijinal dosyayı sakla (Ollama için chunk processing)
    fileRef.current = fileToUpload;
    
    try {
      const res = await uploadFile(fileToUpload);
      setFile(res);
      setIsLoadingVideo(false);
      setStep('mode');
    } catch (e) {
      setVideoError(true);
      setIsLoadingVideo(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    uploadVideo(droppedFile);
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      uploadVideo(selectedFile);
    }
  };
  
  const formatSecondsToHHMMSS = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const parseTimeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 1) {
      return parts[0];
    }
    return 0;
  };

  const handleGenerate = async () => {
    if (!file || !videoDuration) return;

    setAnalysisError(null);
    setAnalysisWarning(null);
    setDebugInfo(null);
    setStep('results');
    setActiveMode(selectedMode);
    setIsLoading(true);
    setTimecodeList(null);

    if (isChartMode) {
      setChartLabel(isCustomChartMode ? chartPrompt : modes['Grafik'].subModes![chartMode]);
    }

    // Kullanıcının seçtiği chunk duration'ı kullan
    let CHUNK_DURATION_SECONDS: number;
    let numChunks: number;
    
    if (chunkDuration === 'all') {
      CHUNK_DURATION_SECONDS = videoDuration; // Tüm videoyu tek seferde işle
      numChunks = 1;
    } else {
      CHUNK_DURATION_SECONDS = chunkDuration;
      numChunks = Math.ceil(videoDuration / CHUNK_DURATION_SECONDS);
    }
    let allTimecodes: any[] = [];
    let overallError: string | null = null;
    let overallWarning: string | null = null;
    let lastDebugInfo: any = null;
    let maxTokensCount = 0; // MAX_TOKENS hatası sayacı
    
    const modeConfig = modes[selectedMode];
    let basePrompt: string;
    if (selectedMode === 'Özel') {
      const promptFn = modeConfig.prompt;
      basePrompt = typeof promptFn === 'function' ? promptFn(customPrompt) : '';
    } else if (selectedMode === 'Kategorik Süreç Transkripti') {
      const promptFn = modeConfig.prompt;
      basePrompt = typeof promptFn === 'function' ? promptFn(customPrompt) : '';
    } else if (selectedMode === 'Grafik') {
      const promptFn = modeConfig.prompt;
      if (typeof promptFn === 'function' && 'subModes' in modeConfig && modeConfig.subModes) {
        basePrompt = promptFn(isCustomChartMode ? chartPrompt : modeConfig.subModes[chartMode]);
      } else {
        basePrompt = '';
      }
    } else {
      basePrompt = typeof modeConfig.prompt === 'string' ? modeConfig.prompt : '';
    }

    if (!basePrompt) {
      console.error('Could not create prompt for mode:', selectedMode);
      setAnalysisError('Seçilen mod için bir istem oluşturulamadı.');
      setIsLoading(false);
      return;
    }

    for (let i = 0; i < numChunks; i++) {
        const startTime = i * CHUNK_DURATION_SECONDS;
        const endTime = Math.min((i + 1) * CHUNK_DURATION_SECONDS, videoDuration);
        
        setAnalysisProgress(
            `Parça ${i + 1}/${numChunks} analiz ediliyor... (${formatSecondsToHHMMSS(startTime)} - ${formatSecondsToHHMMSS(endTime)})`
        );

        // Mode-specific optimizations
        let chunkPrompt: string;
        if (selectedMode === 'Detaylı Transkript') {
          chunkPrompt = `Video bölümünü ${formatSecondsToHHMMSS(startTime)}-${formatSecondsToHHMMSS(endTime)} arasında analiz et.

${basePrompt}

ÖNEMLİ: 
- Mutlak zaman damgalarını kullan (video başlangıcından itibaren, bölüm başlangıcından değil)
- Zaman damgalarını SS:DD:SS formatında yaz
- set_timecodes fonksiyonunu sonuçlarla çağır
- Sadece belirtilen zaman aralığını analiz et
- TÜM SONUÇLAR TÜRKÇE OLMALIDIR

Şimdi analizinle fonksiyonu çağır.`;
        } else {
          chunkPrompt = `Video bölümünü ${formatSecondsToHHMMSS(startTime)} ile ${formatSecondsToHHMMSS(endTime)} arasında analiz et.

${basePrompt}

ÖNEMLİ: 
- Mutlak zaman damgalarını kullan (video başlangıcından itibaren, bölüm başlangıcından değil)
- Zaman damgalarını SS:DD:SS formatında yaz
- set_timecodes fonksiyonunu sonuçlarla çağır
- Sadece belirtilen zaman aralığını analiz et
- TÜM SONUÇLAR TÜRKÇE OLMALIDIR

Şimdi analizinle fonksiyonu çağır.`;
        }

        try {
            // Ollama için chunk'a özgü frame extraction
            let chunkFile = file;
            if (currentAPIConfig.provider === APIProvider.OLLAMA && file && 'name' in file) {
              const originalFile = fileRef.current; // Video dosyasını sakla
              if (originalFile && originalFile.type.startsWith('video/')) {
                const midTime = (startTime + endTime) / 2; // Chunk'ın ortasındaki zaman
                try {
                  const { extractOllamaFrameAtTime } = await import('./api');
                  chunkFile = await extractOllamaFrameAtTime(originalFile, midTime);
                  console.log(`Extracted frame at ${midTime}s for chunk ${i + 1}`);
                } catch (frameError) {
                  console.warn('Frame extraction failed, using original file:', frameError);
                  // Frame extraction başarısızsa orijinal file'ı kullan
                }
              }
            }
            
            const resp = await generateContent(chunkPrompt, functions, chunkFile);
            lastDebugInfo = resp;
            let call = resp.functionCalls?.[0];

            // Basitleştirilmiş malformed function call handling
            if (!call && resp.candidates?.[0]?.finishReason === 'MALFORMED_FUNCTION_CALL') {
              console.warn(`Chunk ${i + 1}: Malformed function call detected, skipping this chunk`);
              console.log('Malformed response:', resp.candidates[0].finishMessage);
              
              // Bu chunk'ı atla, sonraki chunk'a geç
              continue;
            }
            
            if (call) {
                if (call.args && Array.isArray(call.args.timecodes)) {
                    let chunkTimecodes;
                    
                    // Kategorik süreç transkripti modunda farklı filtering
                    if (selectedMode === 'Kategorik Süreç Transkripti' && call.name === 'set_categorical_timecodes') {
                        chunkTimecodes = call.args.timecodes.filter((tc: any) => {
                            const startSecs = timeToSecs(tc.startTime);
                            const endSecs = timeToSecs(tc.endTime);
                            return startSecs >= startTime && endSecs <= endTime;
                        }).map((tc: any) => ({
                            time: tc.startTime,
                            text: `[${tc.category}]: ${tc.description}`,
                            startTime: tc.startTime,
                            endTime: tc.endTime,
                            category: tc.category,
                            description: tc.description,
                            location: tc.location
                        }));
                    } else {
                        // Normal fonksiyonlar için mevcut filtering
                        chunkTimecodes = call.args.timecodes.filter((tc: any) => {
                            const tcSecs = timeToSecs(tc.time);
                            return tcSecs >= startTime && tcSecs < endTime;
                        });
                    }
                    
                    allTimecodes = allTimecodes.concat(chunkTimecodes);
                } else {
                    console.error(`Invalid arguments for function call in chunk ${i+1}:`, call.args);
                    overallError = (overallError || '') + `Parça ${i + 1} için geçersiz argümanlar alındı. `;
                }
            } else {
                console.warn(`No function call in response for chunk ${i+1}`);
            }
            
            if (resp.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
                maxTokensCount++;
                console.warn(`Chunk ${i + 1}: MAX_TOKENS reached (${maxTokensCount} total)`);
                
                // 3'ten fazla MAX_TOKENS hatası varsa chunk size'ı küçült
                if (maxTokensCount >= 3 && CHUNK_DURATION_SECONDS > 10) {
                  console.log('Too many MAX_TOKENS errors, reducing chunk size');
                  CHUNK_DURATION_SECONDS = Math.max(10, CHUNK_DURATION_SECONDS - 5);
                  overallWarning = `UYARI: Çok fazla MAX_TOKENS hatası alındı. Parça boyutu ${CHUNK_DURATION_SECONDS} saniyeye düşürüldü.`;
                } else {
                  overallWarning = `UYARI: Video parçası ${i + 1}/${numChunks} için maksimum yanıt uzunluğuna ulaşıldı. Sonuçlar eksik olabilir.`;
                }
                
                // MAX_TOKENS durumunda bile mevcut sonuçları kullanmaya çalış
                if (resp.functionCalls?.[0]) {
                  call = resp.functionCalls[0];
                }
            }

        } catch (e) {
            console.error(`Error processing chunk ${i + 1}:`, e);
            overallError = (overallError || '') + `Parça ${i + 1} işlenirken bir hata oluştu: ${e.message}. `;
            break;
        }
    }

    if (allTimecodes.length > 0) {
        allTimecodes.sort((a, b) => timeToSecs(a.time) - timeToSecs(b.time));
        const uniqueTimecodes = allTimecodes.filter((tc, index, self) => 
            index === self.findIndex((t) => (t.time === tc.time && t.text === tc.text && t.value === tc.value))
        );
        setTimecodeList(uniqueTimecodes);
    } else if (!overallError) {
        setAnalysisError('Analiz tamamlandı ancak bu mod için gösterilecek bir sonuç üretilemedi. Modelin parçalara ayrılmış videodan veri çıkaramamış olması olabilir.');
    }

    if (overallError) setAnalysisError(overallError);
    if (overallWarning) setAnalysisWarning(overallWarning);

    setDebugInfo(lastDebugInfo);
    setIsLoading(false);
    setAnalysisProgress(null);
    scrollRef.current?.scrollTo({top: 0});
  };

  const handleReanalysis = async () => {
    if (!file || !reanalysisStartTime || !reanalysisEndTime) return;

    const startSeconds = parseTimeToSeconds(reanalysisStartTime);
    const endSeconds = parseTimeToSeconds(reanalysisEndTime);

    if (startSeconds >= endSeconds) {
      setAnalysisError('Başlangıç zamanı bitiş zamanından küçük olmalıdır.');
      return;
    }

    if (endSeconds > videoDuration) {
      setAnalysisError(`Bitiş zamanı video süresinden (${formatSecondsToHHMMSS(videoDuration)}) büyük olamaz.`);
      return;
    }

    setAnalysisError(null);
    setAnalysisWarning(null);
    setIsReanalyzing(true);

    const duration = endSeconds - startSeconds;
    let chunkSize = chunkDuration === 'all' ? duration : Math.min(chunkDuration as number, duration);
    const numChunks = Math.ceil(duration / chunkSize);
    
    let reanalysisTimecodes: any[] = [];
    let reanalysisError: string | null = null;

    const modeConfig = modes[activeMode!];
    let basePrompt: string;
    if (activeMode === 'Özel') {
      const promptFn = modeConfig.prompt;
      basePrompt = typeof promptFn === 'function' ? promptFn(customPrompt) : '';
    } else if (activeMode === 'Kategorik Süreç Transkripti') {
      const promptFn = modeConfig.prompt;
      basePrompt = typeof promptFn === 'function' ? promptFn(customPrompt) : '';
    } else if (activeMode === 'Grafik') {
      const promptFn = modeConfig.prompt;
      if (typeof promptFn === 'function' && 'subModes' in modeConfig && modeConfig.subModes) {
        basePrompt = promptFn(isCustomChartMode ? chartPrompt : modeConfig.subModes[chartMode]);
      } else {
        basePrompt = '';
      }
    } else {
      basePrompt = typeof modeConfig.prompt === 'string' ? modeConfig.prompt : '';
    }

    setAnalysisProgress(`Seçilen aralık yeniden analiz ediliyor: ${reanalysisStartTime} - ${reanalysisEndTime}`);

    for (let i = 0; i < numChunks; i++) {
      const chunkStart = startSeconds + (i * chunkSize);
      const chunkEnd = Math.min(startSeconds + ((i + 1) * chunkSize), endSeconds);

      setAnalysisProgress(
        `Parça ${i + 1}/${numChunks} yeniden analiz ediliyor... (${formatSecondsToHHMMSS(chunkStart)} - ${formatSecondsToHHMMSS(chunkEnd)})`
      );

      let chunkPrompt: string;
      if (activeMode === 'Detaylı Transkript') {
        chunkPrompt = `Video bölümünü ${formatSecondsToHHMMSS(chunkStart)}-${formatSecondsToHHMMSS(chunkEnd)} arasında DETAYLI olarak yeniden analiz et.

${basePrompt}

ÖNEMLİ: 
- Bu yeniden analiz olduğu için daha detaylı sonuçlar ver
- Mutlak zaman damgalarını kullan (video başlangıcından itibaren)
- Zaman damgalarını SS:DD:SS formatında yaz
- set_timecodes fonksiyonunu sonuçlarla çağır
- Sadece belirtilen zaman aralığını analiz et
- TÜM SONUÇLAR TÜRKÇE OLMALIDIR
- Mümkün olduğunca çok detay yakala

Şimdi detaylı analizinle fonksiyonu çağır.`;
      } else {
        chunkPrompt = `Video bölümünü ${formatSecondsToHHMMSS(chunkStart)} ile ${formatSecondsToHHMMSS(chunkEnd)} arasında DETAYLI olarak yeniden analiz et.

${basePrompt}

ÖNEMLİ: 
- Bu yeniden analiz olduğu için daha detaylı sonuçlar ver
- Mutlak zaman damgalarını kullan (video başlangıcından itibaren)
- Zaman damgalarını SS:DD:SS formatında yaz
- set_timecodes fonksiyonunu sonuçlarla çağır
- Sadece belirtilen zaman aralığını analiz et
- TÜM SONUÇLAR TÜRKÇE OLMALIDIR

Şimdi detaylı analizinle fonksiyonu çağır.`;
      }

      try {
        // Ollama için chunk'a özgü frame extraction
        let chunkFile = file;
        if (currentAPIConfig.provider === APIProvider.OLLAMA && file && 'name' in file) {
          const originalFile = fileRef.current;
          if (originalFile && originalFile.type.startsWith('video/')) {
            const midTime = (chunkStart + chunkEnd) / 2;
            try {
              const { extractOllamaFrameAtTime } = await import('./api');
              chunkFile = await extractOllamaFrameAtTime(originalFile, midTime);
              console.log(`Extracted frame at ${midTime}s for reanalysis chunk ${i + 1}`);
            } catch (frameError) {
              console.warn('Frame extraction failed for reanalysis, using original file:', frameError);
            }
          }
        }

        const resp = await generateContent(chunkPrompt, functions, chunkFile);
        let call = resp.functionCalls?.[0];

        if (!call && resp.candidates?.[0]?.finishReason === 'MALFORMED_FUNCTION_CALL') {
          console.warn(`Reanalysis chunk ${i + 1}: Malformed function call detected, skipping`);
          continue;
        }

        if (call && call.args) {
          if (call.name === "set_categorical_timecodes" && Array.isArray(call.args.categoricalTimecodes)) {
            const chunkCategoricalTimecodes = call.args.categoricalTimecodes.filter((ctc: any) => {
              const startSecs = timeToSecs(ctc.startTime);
              const endSecs = timeToSecs(ctc.endTime);
              return (startSecs >= chunkStart && startSecs <= chunkEnd) || 
                     (endSecs >= chunkStart && endSecs <= chunkEnd) ||
                     (startSecs <= chunkStart && endSecs >= chunkEnd);
            });
            reanalysisTimecodes = reanalysisTimecodes.concat(chunkCategoricalTimecodes.map((ctc: any) => ({
              time: ctc.startTime,
              description: `${ctc.category}: ${ctc.description} (${ctc.location || 'Bilinmeyen konum'})`
            })));
          } else if (Array.isArray(call.args.timecodes)) {
            const chunkTimecodes = call.args.timecodes.filter((tc: any) => {
              const tcSecs = timeToSecs(tc.time);
              return tcSecs >= chunkStart && tcSecs <= chunkEnd;
            });
            reanalysisTimecodes = reanalysisTimecodes.concat(chunkTimecodes);
          }
        }

      } catch (e) {
        console.error(`Error processing reanalysis chunk ${i + 1}:`, e);
        reanalysisError = `Yeniden analiz parçası ${i + 1} işlenirken hata: ${e.message}`;
        break;
      }
    }

    if (reanalysisTimecodes.length > 0) {
      // Mevcut timecode listesini güncelle - sadece yeniden analiz edilen aralığı değiştir
      const filteredExistingTimecodes = timecodeList?.filter((tc: any) => {
        const tcSecs = timeToSecs(tc.time);
        return tcSecs < startSeconds || tcSecs > endSeconds;
      }) || [];

      const combinedTimecodes = [...filteredExistingTimecodes, ...reanalysisTimecodes];
      combinedTimecodes.sort((a, b) => timeToSecs(a.time) - timeToSecs(b.time));
      
      setTimecodeList(combinedTimecodes);
      setAnalysisWarning(`✅ ${reanalysisStartTime} - ${reanalysisEndTime} aralığı başarıyla yeniden analiz edildi. ${reanalysisTimecodes.length} yeni zaman kodu eklendi.`);
    } else {
      setAnalysisError(reanalysisError || 'Yeniden analiz sonucu üretilemedi.');
    }

    setIsReanalyzing(false);
    setAnalysisProgress(null);
    setReanalysisStartTime('');
    setReanalysisEndTime('');
    scrollRef.current?.scrollTo({top: 0});
  };


  const handleReset = () => {
    setVidUrl(null);
    setFile(null);
    setFileName('');
    setTimecodeList(null);
    setRequestedTimecode(null);
    setSelectedMode('Detaylı Transkript');
    setActiveMode(undefined);
    setIsLoading(false);
    setVideoError(false);
    setCustomPrompt('');
    setChartPrompt('');
    setChartMode(chartModes[0]);
    setSrtTranscript('');
    setAnalysisError(null);
    setAnalysisWarning(null);
    setDebugInfo(null);
    setChunkDuration(30);
    setReanalysisStartTime('');
    setReanalysisEndTime('');
    setIsReanalyzing(false);
    setShowModeSelection(true);
    setStep('upload');
  };

  const renderUploadScreen = () => (
    <div className="step-container upload-step">
      <div className="upload-panel">
        <div className="upload-header">
          <h1>Video Analiz Aracına Hoş Geldiniz</h1>
          <p>Başlamak için bir video dosyası seçin ve API ayarlarınızı yapılandırın.</p>
        </div>

        <div className="panel-sections">
          {/* Video Upload Bölümü */}
          <div className="panel-section">
            <h2>Video Dosyası</h2>
            <div
              className="upload-area"
              onDrop={handleFileDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}>
              <div className="upload-content">
                <span className="icon-large">upload_file</span>
                <h3>Video Seçin</h3>
                <p>Bir video dosyasını sürükleyip bırakın veya buraya tıklayarak seçin.</p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="video/*"
                  style={{display: 'none'}}
                />
              </div>
            </div>
            {videoError && <p className="error-message">Video işlenirken bir hata oluştu. Lütfen tekrar deneyin.</p>}
          </div>

          {/* API Ayarları Bölümü */}
          <div className="panel-section">
            <h2>API Ayarları</h2>
            <div className="api-settings-panel">
              <div className="current-provider">
                <div className="provider-info">
                  <span className="icon">smart_toy</span>
                  <div>
                    <strong>Mevcut Sağlayıcı:</strong>
                    <span className="provider-name">{currentProvider}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAPISettingsOpen(true);
                  }}
                  className="settings-button"
                >
                  <span className="icon">settings</span>
                  Ayarları Değiştir
                </button>
              </div>
              <div className="provider-description">
                {currentAPIConfig.provider === APIProvider.GEMINI ? (
                  <p>Google Gemini API kullanılıyor. Güçlü video analizi yetenekleri sunar.</p>
                ) : (
                  <p>Ollama yerel AI kullanılıyor. Video frame'leri analiz ederek sonuç üretir.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderModeScreen = () => (
    <div className="step-container mode-step">
      <div className="mode-panel">
        <div className="mode-header">
          <h1>Analiz Modunu Seçin</h1>
          <p>Videonuz için istediğiniz analiz türünü seçin.</p>
          {fileName && (
            <div className="filename">
              <span className="icon">movie</span>
              <span>{fileName}</span>
            </div>
          )}
        </div>
        <div className="mode-content">
          {hasSubMode && !showModeSelection ? (
            <>
              <div className="submode-header">
                <button 
                  className="button secondary back-to-modes"
                  onClick={() => setShowModeSelection(true)}
                >
                  <span className="icon">arrow_back</span>
                  Modlara Geri Dön
                </button>
              </div>
              {isCustomMode ? (
                <>
                  <h2>Özel komutunuz:</h2>
                  <textarea
                    placeholder="Bir komut yazın..."
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    rows={5}
                  />
                </>
              ) : isCategoricalMode ? (
                <>
                  <h2>Analiz edilecek kategorileri girin:</h2>
                  <textarea
                    placeholder="Kategorileri virgülle ayırarak yazın (örn: Tıklama, Nesne Belirme, Puan Değişimi)"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    rows={3}
                  />
                </>
              ) : (
                <>
                  <h2>Videoyu şuna göre grafiğe dök:</h2>
                  <div className="modeList">
                    {chartModes.map((mode) => (
                      <button
                        key={mode}
                        className={c('button', {active: mode === chartMode})}
                        onClick={() => setChartMode(mode)}>
                        {mode}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className={c({active: isCustomChartMode})}
                    placeholder="Veya özel bir komut yazın..."
                    value={chartPrompt}
                    onChange={(e) => setChartPrompt(e.target.value)}
                    onFocus={() => setChartMode('Özel')}
                    rows={2}
                  />
                </>
              )}
            </>
          ) : (
            <div className="modeList">
              {Object.entries(modes).map(([mode, {emoji}]) => (
                <button
                  key={mode}
                  className={c('button', {active: mode === selectedMode})}
                  onClick={() => {
                    setSelectedMode(mode as ModeKey);
                    // Eğer submode gerektiren bir mod seçildiyse, submode ekranına geç
                    if (mode === 'Özel' || mode === 'Grafik' || mode === 'Kategorik Süreç Transkripti') {
                      setShowModeSelection(false);
                    }
                  }}>
                  <span className="emoji">{emoji}</span> {mode}
                </button>
              ))}
            </div>
          )}
          
          {/* Chunk Duration Seçici */}
          <div className="chunk-duration-section">
            <h2>Video İşleme Ayarları</h2>
            <div className="setting-group">
              <label className="setting-label">
                <span className="icon">schedule</span>
                Parça Süresi (saniye)
              </label>
              <p className="setting-description">
                Video kaç saniyelik parçalara bölünerek analiz edilsin?
              </p>
              <div className="chunk-duration-options">
                {[
                  { value: 20, label: '20s', desc: 'Çok Detaylı' },
                  { value: 40, label: '40s', desc: 'Detaylı' },
                  { value: 60, label: '60s', desc: 'Standart' },
                  { value: 120, label: '120s', desc: 'Hızlı' },
                  { value: 180, label: '180s', desc: 'Daha Hızlı' },
                  { value: 'all', label: 'Hepsi', desc: 'Tek Seferde' }
                ].map((option) => (
                  <button
                    key={option.value}
                    className={c('chunk-option', { active: chunkDuration === option.value })}
                    onClick={() => setChunkDuration(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.desc}</span>
                  </button>
                ))}
              </div>
              <div className="chunk-info">
                {chunkDuration === 'all' ? (
                  <p>⚡ Tüm video tek seferde işlenecek (hızlı ama daha az detaylı)</p>
                ) : (
                  <p>📊 Video {chunkDuration}s parçalara bölünecek ({Math.ceil(videoDuration / (chunkDuration as number))} parça)</p>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="navigation-buttons bottom">
          <button className="button secondary" onClick={handleReset}>
            <span className="icon">video_file</span> Yeni Video
          </button>
          <button
            className="button generateButton"
            onClick={handleGenerate}
            disabled={
              (isCustomMode && !customPrompt.trim()) ||
              (isCategoricalMode && !customPrompt.trim()) ||
              (isChartMode && isCustomChartMode && !chartPrompt.trim())
            }>
            <span className="icon">play_arrow</span> Analizi Başlat
          </button>
        </div>
      </div>
    </div>
  );
  
  const renderResultsScreen = () => (
    <div className="step-container results-step">
      <div className="results-header">
        <h1>Analiz Sonuçları</h1>
        <div className="navigation-buttons">
          <button className="button secondary" onClick={() => setStep('mode')}>
            <span className="icon">arrow_back</span> Mod Değiştir
          </button>
          <button className="button secondary" onClick={handleReset}>
            <span className="icon">video_file</span> Yeni Video
          </button>
        </div>
      </div>
      <div className="results-content">
        <div className="video-column">
          <VideoPlayer
            url={vidUrl}
            requestedTimecode={requestedTimecode}
            timecodeList={timecodeList}
            jumpToTimecode={setRequestedTimecode}
            isLoadingVideo={isLoadingVideo}
            videoError={videoError}
            onDurationChange={setVideoDuration}
          />
        </div>
        <div className="output-column" ref={scrollRef}>
          {analysisWarning && (
            <div className="warning-message">
              <span className="icon">warning</span>
              {analysisWarning}
            </div>
          )}
          {isLoading ? (
            <div className="loading">Model bekleniyor<span>...</span></div>
          ) : timecodeList && timecodeList.length > 0 ? (
            <div className="output-panels">
              {/* Yeniden Analiz Paneli */}
              <details className="output-panel reanalysis-panel">
                <summary>
                  <h3>Belirli Aralığı Yeniden Analiz Et</h3>
                  <span className="icon">replay</span>
                  <span className="icon">expand_more</span>
                </summary>
                <div className="panel-content">
                  <div className="reanalysis-form">
                    <p>Videoda belirli bir zaman aralığını daha detaylı analiz etmek için zaman kodlarını girin:</p>
                    <div className="time-inputs">
                      <div className="time-input-group">
                        <label htmlFor="start-time">Başlangıç Zamanı</label>
                        <input
                          id="start-time"
                          type="text"
                          placeholder="00:02:00"
                          value={reanalysisStartTime}
                          onChange={(e) => setReanalysisStartTime(e.target.value)}
                          disabled={isReanalyzing}
                        />
                        <small>Format: SS:DD:SS veya DD:SS veya SS</small>
                      </div>
                      <div className="time-input-group">
                        <label htmlFor="end-time">Bitiş Zamanı</label>
                        <input
                          id="end-time"
                          type="text"
                          placeholder="00:04:00"
                          value={reanalysisEndTime}
                          onChange={(e) => setReanalysisEndTime(e.target.value)}
                          disabled={isReanalyzing}
                        />
                        <small>Format: SS:DD:SS veya DD:SS veya SS</small>
                      </div>
                    </div>
                    <div className="reanalysis-actions">
                      <button
                        className="button"
                        onClick={handleReanalysis}
                        disabled={isReanalyzing || !reanalysisStartTime || !reanalysisEndTime}
                      >
                        <span className="icon">{isReanalyzing ? 'hourglass_empty' : 'analytics'}</span>
                        {isReanalyzing ? 'Analiz Ediliyor...' : 'Yeniden Analiz Et'}
                      </button>
                      <button
                        className="button secondary small"
                        onClick={() => {
                          setReanalysisStartTime('');
                          setReanalysisEndTime('');
                        }}
                        disabled={isReanalyzing}
                      >
                        <span className="icon">clear</span>
                        Temizle
                      </button>
                    </div>
                    {videoDuration > 0 && (
                      <div className="video-info">
                        <small>
                          <span className="icon">info</span>
                          Video süresi: {formatSecondsToHHMMSS(videoDuration)}
                        </small>
                      </div>
                    )}
                  </div>
                </div>
              </details>
              
              {srtTranscript && (
                <details className="output-panel">
                  <summary>
                    <h3>SRT Dökümü</h3>
                    <div className="srt-actions">
                      <button onClick={handleCopy} className="button small">
                        <span className="icon">{isCopied ? 'check' : 'content_copy'}</span>
                        {isCopied ? 'Kopyalandı' : 'Kopyala'}
                      </button>
                      <button onClick={handleDownloadSrt} className="button small">
                        <span className="icon">download</span>
                        İndir
                      </button>
                      <button onClick={handleDownloadExcel} className="button small">
                        <span className="icon">table_view</span>
                        Excel İndir
                      </button>
                    </div>
                    <span className="icon">expand_more</span>
                  </summary>
                  <div className="panel-content">
                    <textarea value={srtTranscript} readOnly rows={10} aria-label="SRT Transcript" />
                  </div>
                </details>
              )}
              
              <details className="output-panel" open>
                <summary>
                  <h3>Transkript</h3>
                  <span className="icon">expand_more</span>
                </summary>
                <div className="panel-content">
                  {activeMode === 'Tablo' ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Zaman</th>
                          <th>Açıklama</th>
                          <th>Nesneler</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timecodeList.map(({time, text, objects}, i) => (
                          <tr key={i} role="button" onClick={() => setRequestedTimecode(timeToSecs(time))}>
                            <td><time>{time}</time></td>
                            <td>{text}</td>
                            <td>{objects?.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : activeMode === 'Grafik' ? (
                    <Chart data={timecodeList} yLabel={chartLabel} jumpToTimecode={setRequestedTimecode} />
                  ) : activeMode && 'isList' in modes[activeMode] && modes[activeMode].isList ? (
                    <ul>
                      {timecodeList.map(({time, text}, i) => (
                        <li key={i} className="outputItem">
                          <button onClick={() => setRequestedTimecode(timeToSecs(time))}>
                            <time>{time}</time>
                            <p className="text">{text}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className='paragraph-output'>
                      {timecodeList.map(({time, text}, i) => (
                        <span key={i} className="sentence" role="button" onClick={() => setRequestedTimecode(timeToSecs(time))}>
                          <time>{time}</time>
                          <span>{text}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </details>
              
            </div>
          ) : (
            <div className="output-panel-placeholder">
              <h3>{analysisError ? 'Bir Hata Oluştu' : 'Sonuç Yok'}</h3>
              <p>{analysisError || 'Analiz tamamlandı ancak bu mod için gösterilecek bir sonuç üretilemedi.'}</p>
              {debugInfo && (
                <details className="debug-info">
                  <summary>Hata Ayıklama Bilgileri</summary>
                  <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <main className={theme}>
      {(isLoadingVideo || isLoading || isReanalyzing) && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="spinner"></div>
            <p>{isLoadingVideo ? 'Video işleniyor...' : analysisProgress || (isReanalyzing ? 'Yeniden analiz yapılıyor...' : 'Analiz yapılıyor...')}</p>
          </div>
        </div>
      )}
      {!isLoadingVideo && (
        <>
          {step === 'upload' && renderUploadScreen()}
          {step === 'mode' && renderModeScreen()}
          {step === 'results' && !isLoading && renderResultsScreen()}
        </>
      )}
      <APISettings
        isOpen={isAPISettingsOpen}
        onClose={() => setIsAPISettingsOpen(false)}
        onConfigChange={handleAPIConfigChange}
      />
      <ThemeSwitcher theme={theme} onThemeChange={handleThemeChange} />
    </main>
  );
}