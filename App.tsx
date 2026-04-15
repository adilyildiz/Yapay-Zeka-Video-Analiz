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
import {sliceVideo} from './utils';
import * as XLSX from 'xlsx';
import modes from './modes';
import {generateSrt, timeToSecs} from './utils';
import VideoPlayer from './VideoPlayer.jsx';

// SRT dosyasını parse eden fonksiyon
function parseSrtFile(content: string): any[] {
  const blocks = content.trim().split(/\n\s*\n/);
  const timecodes: any[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    // Satır 0: index, Satır 1: zaman aralığı, Satır 2+: metin
    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
    if (!timeMatch) continue;

    const startTime = timeMatch[1].replace(',', ':').substring(0, 8); // SS:DD:SS
    const endTime = timeMatch[2].replace(',', ':').substring(0, 8);
    const text = lines.slice(2).join(' ').trim();

    // Kategori parse: [Kategori]: Açıklama
    const categoryMatch = text.match(/^\[(.*?)\]\s*:?\s*(.*)/);
    if (categoryMatch) {
      timecodes.push({
        time: startTime,
        startTime,
        endTime,
        text,
        category: categoryMatch[1],
        description: categoryMatch[2],
      });
    } else {
      timecodes.push({
        time: startTime,
        startTime,
        endTime,
        text,
      });
    }
  }

  return timecodes;
}

// XLSX dosyasını parse eden fonksiyon
function parseXlsxFile(data: ArrayBuffer): any[] {
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  if (rows.length < 2) return [];

  // İlk satır header: Başlangıç, Bitiş, Kategori, Açıklama, Konum
  const timecodes: any[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const startTime = String(row[0] || '').trim();
    const endTime = String(row[1] || '').trim();
    const category = String(row[2] || '').trim();
    const description = String(row[3] || '').trim();
    const location = String(row[4] || '').trim();

    const categoryDisplay = category ? `[${category}]: ` : '';
    const text = `${categoryDisplay}${description}`;

    timecodes.push({
      time: startTime,
      startTime,
      endTime: endTime || startTime,
      text,
      category: category || undefined,
      description,
      location: location || undefined,
    });
  }

  return timecodes;
}
function saveModePreferences(
  mode: string, customPrompt: string, chartMode: string, chartPrompt: string,
  categoricalMode: string, categoricalPrompt: string,
  chunkDuration: number | 'all', ollamaSendMode: 'frame' | 'video'
) {
  const preferences = {
    selectedMode: mode,
    customPrompt,
    chartMode,
    chartPrompt,
    categoricalMode,
    categoricalPrompt,
    chunkDuration,
    ollamaSendMode,
  };
  localStorage.setItem('modePreferences', JSON.stringify(preferences));
}

// Mode ayarlarını yükle (localStorage)
function loadModePreferences() {
  const value = localStorage.getItem('modePreferences');
  if (value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

const chartModes = Object.keys(modes['Grafik'].subModes!);
const categoricalModes = Object.keys(modes['Kategorik Süreç Transkripti'].subModes!);
type ModeKey = keyof typeof modes;

// Tarayıcı bildirimi gönderme fonksiyonu
function sendNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico', // İkon varsa kullanılır
      badge: '/favicon.ico',
      tag: `video-analysis-${Date.now()}`, // Her bildirim için benzersiz tag
      requireInteraction: false,
    });

    // Bildirime tıklanınca pencereyi ön plana getir
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }
}

export default function App() {
  // localStorage'dan mode preferences'ları yükle
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
  const [categoricalMode, setCategoricalMode] = useState(savedPreferences?.categoricalMode || categoricalModes[0]);
  const [categoricalPrompt, setCategoricalPrompt] = useState(savedPreferences?.categoricalPrompt || '');
  const [chartLabel, setChartLabel] = useState('');
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
  const [chunkDuration, setChunkDuration] = useState<number | 'all'>(savedPreferences?.chunkDuration ?? 60);
  const [analysisRangeStart, setAnalysisRangeStart] = useState<string>('');
  const [analysisRangeEnd, setAnalysisRangeEnd] = useState<string>('');
  const [reanalysisStartTime, setReanalysisStartTime] = useState<string>('');
  const [reanalysisEndTime, setReanalysisEndTime] = useState<string>('');
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [showModeSelection, setShowModeSelection] = useState(true);
  const [deleteRangeStart, setDeleteRangeStart] = useState<string>('');
  const [deleteRangeEnd, setDeleteRangeEnd] = useState<string>('');
  const [analyzedChunks, setAnalyzedChunks] = useState<{start: number, end: number}[]>([]);
  const [ollamaSendMode, setOllamaSendMode] = useState<'frame' | 'video'>(savedPreferences?.ollamaSendMode || 'frame');
  const [importedTranscriptName, setImportedTranscriptName] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<globalThis.File | null>(null);
  // FIX: Changed HTMLElement to HTMLDivElement to match the element type it's referencing.
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelAnalysisRef = useRef<boolean>(false);
  const isCustomMode = selectedMode === 'Özel';
  const isChartMode = selectedMode === 'Grafik';
  const isCategoricalMode = selectedMode === 'Kategorik Süreç Transkripti';
  const isCustomChartMode = isChartMode && chartMode === 'Özel';
  const isCustomCategoricalMode = isCategoricalMode && categoricalMode === 'Özel';
  const hasSubMode = isCustomMode || isChartMode || isCategoricalMode;
  
  const handleAPIConfigChange = (config: APIConfig) => {
    setCurrentAPIConfig(config);
    setCurrentProvider(
      config.provider === APIProvider.GEMINI ? 'Google Gemini' :
      config.provider === APIProvider.OPENAI ? 'OpenAI API' : 'Ollama'
    );
  };

  const getActiveModelName = () => {
    if (currentAPIConfig.provider === APIProvider.GEMINI) {
      return currentAPIConfig.gemini?.model || 'gemini-2.5-flash';
    }
    if (currentAPIConfig.provider === APIProvider.OPENAI) {
      return currentAPIConfig.openai?.model || 'gpt-4o';
    }
    return currentAPIConfig.ollama?.model || 'ollama';
  };

  const renderModelBadge = () => (
    <button
      className="model-badge-btn"
      onClick={() => setIsAPISettingsOpen(true)}
      title="Yapay zeka modelini değiştir"
    >
      <span className="icon">smart_toy</span>
      <span className="model-name">{getActiveModelName()}</span>
      <span className="icon">edit</span>
    </button>
  );

  useEffect(() => {
    document.documentElement.className = 'dark';
    
    // Tarayıcı bildirimi izni iste
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // İlk yüklemede API config'i localStorage'dan yükle
  useEffect(() => {
    console.log('App yüklendi, API config yükleniyor...');
    const loadedConfig = getCurrentConfig();
    console.log('Yüklenen config:', loadedConfig);
    setCurrentAPIConfig(loadedConfig);
    setCurrentProvider(
      loadedConfig.provider === APIProvider.GEMINI ? 'Google Gemini' :
      loadedConfig.provider === APIProvider.OPENAI ? 'OpenAI API' : 'Ollama'
    );
  }, []);

  // Mode preferences'ları localStorage'a kaydet
  useEffect(() => {
    saveModePreferences(selectedMode, customPrompt, chartMode, chartPrompt, categoricalMode, categoricalPrompt, chunkDuration, ollamaSendMode);
  }, [selectedMode, customPrompt, chartMode, chartPrompt, categoricalMode, categoricalPrompt, chunkDuration, ollamaSendMode]);

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
        startTime: tc.startTime, // AI'dan gelen başlangıç zamanı
        endTime: tc.endTime,     // AI'dan gelen bitiş zamanı
        category: Array.isArray(tc.category) ? tc.category.join(', ') : tc.category, // Çoklu kategori desteği
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

  const setCategoricalTimecodes = ({categoricalTimecodes}: {categoricalTimecodes: any[]}) => {
    // Kategorik fonksiyondan gelen verileri standart formata dönüştür
    const convertedTimecodes = categoricalTimecodes.map((t) => {
      // Çoklu kategori desteği: array ise join et, string ise olduğu gibi kullan
      const categoryDisplay = Array.isArray(t.category) ? t.category.join(', ') : t.category;
      
      return {
        time: t.startTime, // Ana zaman olarak startTime kullan
        text: `[${categoryDisplay}]: ${t.description}`,
        startTime: t.startTime,
        endTime: t.endTime,
        category: t.category, // Orijinal category'i koru (array olabilir)
        description: t.description,
        location: t.location
      };
    });
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
    const headers = ['Başlangıç', 'Bitiş', 'Kategori', 'Açıklama', 'Konum'];
    data.push(headers);

    timecodeList.forEach((item) => {
      let startTime = item.startTime || item.time; // AI'dan gelen startTime öncelikli
      let endTime = item.endTime || item.time;     // AI'dan gelen endTime öncelikli
      let category = Array.isArray(item.category) ? item.category.join(', ') : (item.category || ''); // AI'dan gelen kategori
      let description = item.description || '';     // AI'dan gelen açıklama
      let location = item.location || '';           // AI'dan gelen konum bilgisi
      let text = item.text || '';

      // Eğer AI'dan gelen veriler yoksa eski yöntemle parse et
      if (!category && !description && text) {
        const categoryMatch = text.match(/^\[(.*?)\]:\s*(.*)/);
        if (categoryMatch) {
          category = categoryMatch[1];
          description = categoryMatch[2];
        } else {
          description = text;
        }
      }

      // SRT formatındaki zaman aralığını kontrol et (eski veriler için)
      if (!item.startTime && !item.endTime && text.includes(' --> ')) {
        const timeMatch = text.match(/^(.+?)\s-->\s(.+?):\s*(.*)/);
        if (timeMatch) {
          startTime = timeMatch[1];
          endTime = timeMatch[2];
          description = timeMatch[3];
        }
      }

      // Eğer hala açıklama yoksa text'i kullan
      if (!description && text) {
        description = text;
      }

      data.push([startTime, endTime, category, description, location]);
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
      { wch: 50 }, // Açıklama
      { wch: 20 }  // Konum
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
    
    // Orijinal dosyayı sakla — Gemini'ye yükleme analiz aşamasında yapılacak
    fileRef.current = fileToUpload;

    // Ollama ve OpenAI için hemen yükle (frame extraction gerektirir)
    if (currentAPIConfig.provider === APIProvider.OLLAMA || currentAPIConfig.provider === APIProvider.OPENAI) {
      try {
        const res = await uploadFile(fileToUpload);
        setFile(res);
      } catch (e) {
        setVideoError(true);
        setIsLoadingVideo(false);
        return;
      }
    }

    setIsLoadingVideo(false);
    setStep('mode');
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

  const importTranscriptFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    setImportedTranscriptName(file.name);

    try {
      let parsed: any[] = [];

      if (ext === 'srt') {
        const text = await file.text();
        parsed = parseSrtFile(text);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        parsed = parseXlsxFile(buffer);
      } else {
        setAnalysisError('Desteklenmeyen dosya formatı. Lütfen .srt veya .xlsx dosyası seçin.');
        return;
      }

      if (parsed.length === 0) {
        setAnalysisError('Dosyadan veri okunamadı. Dosya formatını kontrol edin.');
        return;
      }

      setTimecodeList(parsed);
      setAnalysisWarning(`📄 "${file.name}" dosyasından ${parsed.length} satır veri yüklendi. Aralık seçerek yeniden analiz yapabilirsiniz.`);
      setAnalysisError(null);

      // Eğer henüz results ekranında değilsek, oraya geç
      if (step === 'mode') {
        setActiveMode(selectedMode);
        setStep('results');
      }
    } catch (err) {
      setAnalysisError(`Dosya okunurken hata oluştu: ${err}`);
    }
  };

  const handleTranscriptImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    await importTranscriptFile(selectedFile);
    // Input'u sıfırla (aynı dosyayı tekrar seçebilmek için)
    e.target.value = '';
  };

  const handleTranscriptDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      importTranscriptFile(droppedFile);
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
    if (!fileRef.current || !videoDuration) return;

    cancelAnalysisRef.current = false;
    setAnalysisError(null);
    setAnalysisWarning(null);
    setDebugInfo(null);
    setStep('results');
    setActiveMode(selectedMode);
    setIsLoading(true);

    // Gemini: 'all' modunda tam videoyu şimdi yükle, parçalı modda chunk'lar ayrı yüklenecek
    let uploadedFile: UploadedFile | null = file;
    if (currentAPIConfig.provider === APIProvider.GEMINI && chunkDuration === 'all' && !file) {
      try {
        setAnalysisProgress('Video yükleniyor...');
        const res = await uploadFile(fileRef.current);
        setFile(res);
        uploadedFile = res;
      } catch (e) {
        setAnalysisError('Video yüklenirken hata oluştu.');
        setIsLoading(false);
        return;
      }
    }
    setTimecodeList(null);

    if (isChartMode) {
      setChartLabel(isCustomChartMode ? chartPrompt : modes['Grafik'].subModes![chartMode]);
    }

    // Kullanıcının seçtiği chunk duration'ı kullan
    let CHUNK_DURATION_SECONDS: number;
    let numChunks: number;
    
    // Analiz aralığı belirleme
    const rangeStartSecs = analysisRangeStart ? parseTimeToSeconds(analysisRangeStart) : 0;
    const rangeEndSecs = analysisRangeEnd ? parseTimeToSeconds(analysisRangeEnd) : videoDuration;
    const analysisLength = rangeEndSecs - rangeStartSecs;
    
    if (analysisLength <= 0 || rangeStartSecs >= videoDuration) {
      setAnalysisError('Geçersiz analiz aralığı. Başlangıç zamanı bitiş zamanından küçük olmalıdır.');
      setIsLoading(false);
      return;
    }
    
    if (chunkDuration === 'all') {
      CHUNK_DURATION_SECONDS = analysisLength; // Seçilen aralığı tek seferde işle
      numChunks = 1;
    } else {
      CHUNK_DURATION_SECONDS = chunkDuration;
      numChunks = Math.ceil(analysisLength / CHUNK_DURATION_SECONDS);
    }
    
    const currentChunks: {start: number, end: number}[] = [];
    for (let i = 0; i < numChunks; i++) {
        currentChunks.push({
            start: rangeStartSecs + i * CHUNK_DURATION_SECONDS,
            end: Math.min(rangeStartSecs + (i + 1) * CHUNK_DURATION_SECONDS, rangeEndSecs)
        });
    }
    setAnalyzedChunks(currentChunks);

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
      if (typeof promptFn === 'function' && 'subModes' in modeConfig && modeConfig.subModes) {
        basePrompt = promptFn(isCustomCategoricalMode ? categoricalPrompt : modeConfig.subModes[categoricalMode]);
      } else {
        basePrompt = typeof promptFn === 'function' ? promptFn(customPrompt) : '';
      }
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

    let previousChunkSummary = '';

    for (let i = 0; i < numChunks; i++) {
        // İptal kontrolü
        if (cancelAnalysisRef.current) break;

        const startTime = rangeStartSecs + i * CHUNK_DURATION_SECONDS;
        const endTime = Math.min(rangeStartSecs + (i + 1) * CHUNK_DURATION_SECONDS, rangeEndSecs);
        
        setAnalysisProgress(
            `Parça ${i + 1}/${numChunks} analiz ediliyor... (${formatSecondsToHHMMSS(startTime)} - ${formatSecondsToHHMMSS(endTime)})`
        );

        // Önceki parçanın bağlam bilgisi
        const continuityContext = previousChunkSummary ? `
### ÖNCEKİ PARÇANIN BAĞLAMI (TUTARLILIK İÇİN ÖNEMLİ)
Aşağıda bir önceki video parçasının son olayları verilmiştir. Bu bağlamı kullanarak:
- Aynı nesneleri, karakterleri ve öğeleri AYNI İSİMLERLE tanımla (örn: önceki parçada "mavi canavar" dediysen, bu parçada da "mavi canavar" de).
- Devam eden olayları doğru şekilde bağla (örn: önceki parça bir menü açılmasıyla bittiyse, bu parça o menünün devamıyla başlamalı).
- Tutarsız veya çelişkili açıklamalar yapma.
- Önceki parçadaki olayları TEKRAR raporlama, sadece bağlam olarak kullan.

${previousChunkSummary}
` : '';

        // Mode-specific optimizations
        let chunkPrompt: string;
        const timingInstructions = `
### ZAMAN DOĞRULUK TALİMATLARI (KRİTİK)
- Bu videonun TOPLAM SÜRESİ: ${formatSecondsToHHMMSS(videoDuration)} (${Math.round(videoDuration)} saniye).
- Senden YALNIZCA ${formatSecondsToHHMMSS(startTime)} ile ${formatSecondsToHHMMSS(endTime)} arasındaki bölümü analiz etmeni istiyorum.
- MUTLAK ZAMAN DAMGALARI KULLAN: Tüm zaman kodları videonun 00:00:00 başlangıcından itibaren hesaplanmalıdır.
- İlk timecode en erken ${formatSecondsToHHMMSS(startTime)} olabilir, son timecode en geç ${formatSecondsToHHMMSS(endTime)} olabilir.
- Videonun oynatma çubuğundaki zamanı referans al. Tahmin etme, ekrandaki gerçek zamanı gözlemle.
- Eğer videoda görünen bir saat, sayaç veya zamanlayıcı varsa, onu referans ALMA — bunlar videonun kendi zamanı değil, içerik zamanıdır.
- Zaman damgalarını SS:DD:SS formatında yaz.
- Aralığın dışına çıkan timecode YAZMA.
`;
        if (selectedMode === 'Detaylı Transkript') {
          chunkPrompt = `${timingInstructions}
${continuityContext}
${basePrompt}

- set_timecodes fonksiyonunu sonuçlarla çağır.
- TÜM SONUÇLAR TÜRKÇE OLMALIDIR.

Şimdi analizinle fonksiyonu çağır.`;
        } else {
          chunkPrompt = `${timingInstructions}
${continuityContext}
${basePrompt}

- set_timecodes fonksiyonunu sonuçlarla çağır.
- TÜM SONUÇLAR TÜRKÇE OLMALIDIR.

Şimdi analizinle fonksiyonu çağır.`;
        }

        try {
            let chunkFile: UploadedFile | null = uploadedFile;
            let useChunkLocalTime = false;

            // Gemini API + parçalı analiz: videoyu kes ve ayrı yükle
            if (currentAPIConfig.provider === APIProvider.GEMINI && chunkDuration !== 'all') {
              const originalFile = fileRef.current;
              if (originalFile && originalFile.type.startsWith('video/')) {
                try {
                  setAnalysisProgress(
                    `Parça ${i + 1}/${numChunks} kesiliyor... (${formatSecondsToHHMMSS(startTime)} - ${formatSecondsToHHMMSS(endTime)})`
                  );
                  const sliced = await sliceVideo(originalFile, startTime, endTime);
                  if (cancelAnalysisRef.current) break;
                  console.log(`Video chunk ${i + 1} kesildi: ${sliced.size} bytes`);
                  setAnalysisProgress(
                    `Parça ${i + 1}/${numChunks} yükleniyor...`
                  );
                  chunkFile = await uploadFile(sliced);
                  if (cancelAnalysisRef.current) break;
                  useChunkLocalTime = true;
                  console.log(`Video chunk ${i + 1} Gemini'ye yüklendi`);
                } catch (sliceError) {
                  console.warn('Video kesme başarısız, tam video kullanılacak:', sliceError);
                  // Kesme başarısızsa orijinal dosyayı kullan
                }
              }
            }
            // Ollama için chunk'a özgü işleme
            else if (currentAPIConfig.provider === APIProvider.OLLAMA && file && 'name' in file) {
              const originalFile = fileRef.current;
              if (originalFile && originalFile.type.startsWith('video/')) {
                if (ollamaSendMode === 'video') {
                  // Video segment modu: kesilmiş video parçasını gönder
                  try {
                    setAnalysisProgress(
                      `Parça ${i + 1}/${numChunks} video kesiliyor... (${formatSecondsToHHMMSS(startTime)} - ${formatSecondsToHHMMSS(endTime)})`
                    );
                    const sliced = await sliceVideo(originalFile, startTime, endTime);
                    if (cancelAnalysisRef.current) break;
                    const { prepareOllamaVideoSegment } = await import('./api');
                    chunkFile = await prepareOllamaVideoSegment(sliced);
                    useChunkLocalTime = true;
                    console.log(`Video segment prepared for Ollama chunk ${i + 1}: ${sliced.size} bytes`);
                  } catch (videoError) {
                    console.warn('Video segment preparation failed, falling back to frame:', videoError);
                    // Fallback: frame extraction
                    const midTime = (startTime + endTime) / 2;
                    try {
                      const { extractOllamaFrameAtTime } = await import('./api');
                      chunkFile = await extractOllamaFrameAtTime(originalFile, midTime);
                    } catch (frameError) {
                      console.warn('Frame extraction also failed:', frameError);
                    }
                  }
                } else {
                  // Frame modu: ortadaki frame'i gönder
                  const midTime = (startTime + endTime) / 2;
                  try {
                    const { extractOllamaFrameAtTime } = await import('./api');
                    chunkFile = await extractOllamaFrameAtTime(originalFile, midTime);
                    console.log(`Extracted frame at ${midTime}s for chunk ${i + 1}`);
                  } catch (frameError) {
                    console.warn('Frame extraction failed, using original file:', frameError);
                  }
                }
              }
            }
            // OpenAI için chunk'a özgü işleme
            else if (currentAPIConfig.provider === APIProvider.OPENAI && file && 'name' in file) {
              const originalFile = fileRef.current;
              if (originalFile && originalFile.type.startsWith('video/')) {
                if (ollamaSendMode === 'video') {
                  try {
                    setAnalysisProgress(
                      `Parça ${i + 1}/${numChunks} çoklu kare çıkarılıyor... (${formatSecondsToHHMMSS(startTime)} - ${formatSecondsToHHMMSS(endTime)})`
                    );
                    const sliced = await sliceVideo(originalFile, startTime, endTime);
                    if (cancelAnalysisRef.current) break;
                    const { prepareOpenAIVideoSegment } = await import('./api');
                    chunkFile = await prepareOpenAIVideoSegment(sliced);
                    useChunkLocalTime = true;
                    console.log(`Multi-frame prepared for OpenAI chunk ${i + 1}`);
                  } catch (videoError) {
                    console.warn('Multi-frame preparation failed, falling back to single frame:', videoError);
                    const midTime = (startTime + endTime) / 2;
                    try {
                      const { extractOpenAIFrameAtTime } = await import('./api');
                      chunkFile = await extractOpenAIFrameAtTime(originalFile, midTime);
                    } catch (frameError) {
                      console.warn('Frame extraction also failed:', frameError);
                    }
                  }
                } else {
                  const midTime = (startTime + endTime) / 2;
                  try {
                    const { extractOpenAIFrameAtTime } = await import('./api');
                    chunkFile = await extractOpenAIFrameAtTime(originalFile, midTime);
                    console.log(`Extracted frame at ${midTime}s for OpenAI chunk ${i + 1}`);
                  } catch (frameError) {
                    console.warn('Frame extraction failed for OpenAI:', frameError);
                  }
                }
              }
            }

            // Eğer video kesildi ise, prompt'u chunk'ın yerel zamanına göre düzelt
            let finalPrompt = chunkPrompt;
            if (useChunkLocalTime) {
              const chunkDur = endTime - startTime;
              finalPrompt = `Bu video parçası, orijinal videonun ${formatSecondsToHHMMSS(startTime)} - ${formatSecondsToHHMMSS(endTime)} arasındaki bölümüdür.
Bu parçanın süresi: ${Math.round(chunkDur)} saniye.
${continuityContext}
${basePrompt}

### ZAMAN DAMGASI TALİMATLARI (KRİTİK)
- Bu video parçası orijinal videonun ${formatSecondsToHHMMSS(startTime)} ile ${formatSecondsToHHMMSS(endTime)} arasına karşılık gelir.
- Zaman damgalarını MUTLAKA orijinal videonun zamanına göre yaz (${formatSecondsToHHMMSS(startTime)}'dan başlayarak).
- Bu videonun 00:00:00'ı aslında orijinal videonun ${formatSecondsToHHMMSS(startTime)} zamanına denk gelir.
- Videonun her saniyesine ${startTime} saniye ekleyerek orijinal video zamanını hesapla.
- Örnek: Videonun 5. saniyesindeki bir olay = ${formatSecondsToHHMMSS(startTime + 5)}
- İlk timecode en erken ${formatSecondsToHHMMSS(startTime)}, son timecode en geç ${formatSecondsToHHMMSS(endTime)} olabilir.
- Zaman damgalarını SS:DD:SS formatında yaz.

- set_timecodes fonksiyonunu sonuçlarla çağır.
- TÜM SONUÇLAR TÜRKÇE OLMALIDIR.

Şimdi analizinle fonksiyonu çağır.`;
            }

            setAnalysisProgress(
                `Parça ${i + 1}/${numChunks} analiz ediliyor... (${formatSecondsToHHMMSS(startTime)} - ${formatSecondsToHHMMSS(endTime)})`
            );

            if (!chunkFile) {
              console.error(`Chunk ${i + 1}: Dosya yüklenemedi, atlanıyor`);
              overallError = (overallError || '') + `Parça ${i + 1} için dosya yüklenemedi. `;
              continue;
            }
            
            const resp = await generateContent(finalPrompt, functions, chunkFile);
            if (cancelAnalysisRef.current) break;
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
                if (call.args) {
                    let chunkTimecodes;
                    
                    // Kategorik süreç transkripti modunda özel işleme
                    if (selectedMode === 'Kategorik Süreç Transkripti' && call.name === 'set_categorical_timecodes' && Array.isArray(call.args.categoricalTimecodes)) {
                        chunkTimecodes = call.args.categoricalTimecodes.filter((tc: any) => {
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
                    } else if (Array.isArray(call.args.timecodes)) {
                        // Normal fonksiyonlar için mevcut filtering
                        chunkTimecodes = call.args.timecodes.filter((tc: any) => {
                            const tcSecs = timeToSecs(tc.time);
                            return tcSecs >= startTime && tcSecs < endTime;
                        });
                    } else {
                        console.error(`Invalid arguments for function call in chunk ${i+1}:`, call.args);
                        overallError = (overallError || '') + `Parça ${i + 1} için geçersiz argümanlar alındı. `;
                        continue;
                    }
                    
                    allTimecodes = allTimecodes.concat(chunkTimecodes);

                    // Sonraki parça için bağlam özeti oluştur (son 5 olayı al)
                    if (chunkTimecodes.length > 0) {
                      const lastEvents = chunkTimecodes.slice(-5);
                      previousChunkSummary = `Önceki parça (${formatSecondsToHHMMSS(startTime)} - ${formatSecondsToHHMMSS(endTime)}) son olayları:\n` +
                        lastEvents.map((tc: any) => {
                          const time = tc.startTime || tc.time;
                          const endT = tc.endTime ? ` - ${tc.endTime}` : '';
                          const cat = tc.category ? ` [${Array.isArray(tc.category) ? tc.category.join(', ') : tc.category}]` : '';
                          const desc = tc.description || tc.text || '';
                          return `- ${time}${endT}${cat}: ${desc}`;
                        }).join('\n');
                    }
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

    if (cancelAnalysisRef.current) {
      overallWarning = `⏹️ Analiz kullanıcı tarafından durduruldu. ${allTimecodes.length} zaman kodu toplandı.`;
    }

    if (allTimecodes.length > 0) {
        allTimecodes.sort((a, b) => timeToSecs(a.time) - timeToSecs(b.time));
        const uniqueTimecodes = allTimecodes.filter((tc, index, self) => 
            index === self.findIndex((t) => (t.time === tc.time && t.text === tc.text && t.value === tc.value))
        );
        setTimecodeList(uniqueTimecodes);
    } else if (!overallError && !cancelAnalysisRef.current) {
        setAnalysisError('Analiz tamamlandı ancak bu mod için gösterilecek bir sonuç üretilemedi. Modelin parçalara ayrılmış videodan veri çıkaramamış olması olabilir.');
    }

    if (overallError) setAnalysisError(overallError);
    if (overallWarning) setAnalysisWarning(overallWarning);

    setDebugInfo(lastDebugInfo);
    setIsLoading(false);
    setAnalysisProgress(null);
    scrollRef.current?.scrollTo({top: 0});
    
    // Analiz tamamlandı bildirimi gönder
    const resultCount = allTimecodes.length;
    if (!overallError && resultCount > 0) {
      sendNotification(
        '✅ Video Analizi Tamamlandı',
        `"${fileName}" dosyasının analizi başarıyla tamamlandı. ${resultCount} satır veri üretildi.`
      );
    } else if (!overallError && resultCount === 0) {
      sendNotification(
        '⚠️ Video Analizi Tamamlandı',
        `"${fileName}" analizi tamamlandı ancak veri üretilemedi.`
      );
    } else {
      sendNotification(
        '⚠️ Video Analizi Tamamlandı',
        `Analiz tamamlandı ancak bazı hatalar oluştu. ${resultCount > 0 ? resultCount + ' satır veri üretildi.' : ''}`
      );
    }
  };

  const handleReanalysis = async (withContext: boolean = true) => {
    if (!fileRef.current || !reanalysisStartTime || !reanalysisEndTime) return;

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
    cancelAnalysisRef.current = false;

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
      if (typeof promptFn === 'function' && 'subModes' in modeConfig && modeConfig.subModes) {
        basePrompt = promptFn(isCustomCategoricalMode ? categoricalPrompt : modeConfig.subModes[categoricalMode]);
      } else {
        basePrompt = typeof promptFn === 'function' ? promptFn(customPrompt) : '';
      }
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

    // Önceki analiz sonuçlarını bağlam olarak hazırla
    let previousAnalysisContext = '';
    if (withContext && timecodeList && timecodeList.length > 0) {
      // Yeniden analiz edilen aralıktaki mevcut sonuçları örnek olarak gönder
      const relevantTimecodes = timecodeList.filter((tc: any) => {
        const tcSecs = timeToSecs(tc.time);
        return tcSecs >= startSeconds && tcSecs <= endSeconds;
      });

      // Ayrıca aralığın hemen öncesindeki ve sonrasındaki olayları da bağlam olarak ekle
      const contextBefore = timecodeList.filter((tc: any) => {
        const tcSecs = timeToSecs(tc.time);
        return tcSecs >= (startSeconds - 10) && tcSecs < startSeconds;
      }).slice(-3);

      const contextAfter = timecodeList.filter((tc: any) => {
        const tcSecs = timeToSecs(tc.time);
        return tcSecs > endSeconds && tcSecs <= (endSeconds + 10);
      }).slice(0, 3);

      if (relevantTimecodes.length > 0 || contextBefore.length > 0 || contextAfter.length > 0) {
        const formatEventForContext = (tc: any) => {
          const time = tc.startTime || tc.time;
          const endT = tc.endTime ? ` - ${tc.endTime}` : '';
          const cat = tc.category ? ` [${Array.isArray(tc.category) ? tc.category.join(', ') : tc.category}]` : '';
          const desc = tc.description || tc.text || '';
          const loc = tc.location ? ` (${tc.location})` : '';
          return `- ${time}${endT}${cat}: ${desc}${loc}`;
        };

        previousAnalysisContext = `
### ÖNCEKİ ANALİZ SONUÇLARI (BAĞLAM VE ÖRNEK)
Aşağıda bu aralık için daha önce yapılmış analiz sonuçları verilmiştir. Bu bilgileri şu şekilde kullan:
- AYNI nesneleri, karakterleri ve öğeleri AYNI İSİMLERLE tanımla (örn: önceki analizde "kasklı avokado" dediyse, sen de "kasklı avokado" de).
- Format ve yapı olarak bu örnekleri referans al.
- Ancak daha önce KAÇIRILMIŞ olabilecek detayları da yakala — bu yeniden analiz daha kapsamlı olmalı.
- Önceki sonuçları birebir kopyalama, videoyu yeniden izleyerek kendi gözlemlerini yaz.
`;

        if (contextBefore.length > 0) {
          previousAnalysisContext += `
**Aralık öncesi bağlam (${formatSecondsToHHMMSS(startSeconds)} öncesi):**
${contextBefore.map(formatEventForContext).join('\n')}
`;
        }

        if (relevantTimecodes.length > 0) {
          previousAnalysisContext += `
**Mevcut analiz sonuçları (${formatSecondsToHHMMSS(startSeconds)} - ${formatSecondsToHHMMSS(endSeconds)}):**
${relevantTimecodes.map(formatEventForContext).join('\n')}
`;
        }

        if (contextAfter.length > 0) {
          previousAnalysisContext += `
**Aralık sonrası bağlam (${formatSecondsToHHMMSS(endSeconds)} sonrası):**
${contextAfter.map(formatEventForContext).join('\n')}
`;
        }
      }
    }

    setAnalysisProgress(`Seçilen aralık yeniden analiz ediliyor: ${reanalysisStartTime} - ${reanalysisEndTime}`);

    // Kategorik Süreç Transkripti modunda kullanılacak doğru fonksiyon adını belirle
    const isCategoricalReanalysis = activeMode === 'Kategorik Süreç Transkripti';
    const functionCallInstruction = isCategoricalReanalysis 
      ? 'set_categorical_timecodes fonksiyonunu sonuçlarla çağır.'
      : 'set_timecodes fonksiyonunu sonuçlarla çağır.';

    for (let i = 0; i < numChunks; i++) {
      if (cancelAnalysisRef.current) break;

      const chunkStart = startSeconds + (i * chunkSize);
      const chunkEnd = Math.min(startSeconds + ((i + 1) * chunkSize), endSeconds);

      setAnalysisProgress(
        `Parça ${i + 1}/${numChunks} yeniden analiz ediliyor... (${formatSecondsToHHMMSS(chunkStart)} - ${formatSecondsToHHMMSS(chunkEnd)})`
      );

      let chunkPrompt: string;
      const reTimingInstructions = `
### ZAMAN DOĞRULUK TALİMATLARI (KRİTİK)
- Bu videonun TOPLAM SÜRESİ: ${formatSecondsToHHMMSS(videoDuration)} (${Math.round(videoDuration)} saniye).
- Senden YALNIZCA ${formatSecondsToHHMMSS(chunkStart)} ile ${formatSecondsToHHMMSS(chunkEnd)} arasındaki bölümü DETAYLI olarak yeniden analiz etmeni istiyorum.
- MUTLAK ZAMAN DAMGALARI KULLAN: Tüm zaman kodları videonun 00:00:00 başlangıcından itibaren hesaplanmalıdır.
- İlk timecode en erken ${formatSecondsToHHMMSS(chunkStart)} olabilir, son timecode en geç ${formatSecondsToHHMMSS(chunkEnd)} olabilir.
- Videonun oynatma çubuğundaki zamanı referans al. Tahmin etme, ekrandaki gerçek zamanı gözlemle.
- Video içeriğindeki sayaçları veya süre göstergelerini video zamanı olarak KULLANMA.
- Zaman damgalarını SS:DD:SS formatında yaz.
- Aralığın dışına çıkan timecode YAZMA.
`;
      chunkPrompt = `${reTimingInstructions}
${previousAnalysisContext}
${basePrompt}

- Bu yeniden analiz olduğu için daha detaylı sonuçlar ver.
- Mümkün olduğunca çok detay yakala.
- ${functionCallInstruction}
- TÜM SONUÇLAR TÜRKÇE OLMALIDIR.

Şimdi detaylı analizinle fonksiyonu çağır.`;

      try {
        let chunkFile: UploadedFile | null = file;
        let useChunkLocalTime = false;

        // Gemini API: videoyu kes ve ayrı yükle
        if (currentAPIConfig.provider === APIProvider.GEMINI) {
          const originalFile = fileRef.current;
          if (originalFile && originalFile.type.startsWith('video/')) {
            try {
              setAnalysisProgress(
                `Parça ${i + 1}/${numChunks} kesiliyor... (${formatSecondsToHHMMSS(chunkStart)} - ${formatSecondsToHHMMSS(chunkEnd)})`
              );
              const sliced = await sliceVideo(originalFile, chunkStart, chunkEnd);
              if (cancelAnalysisRef.current) break;
              console.log(`Reanalysis chunk ${i + 1} kesildi: ${sliced.size} bytes`);
              setAnalysisProgress(
                `Parça ${i + 1}/${numChunks} yükleniyor...`
              );
              chunkFile = await uploadFile(sliced);
              if (cancelAnalysisRef.current) break;
              useChunkLocalTime = true;
            } catch (sliceError) {
              console.warn('Video kesme başarısız (reanalysis), tam video kullanılacak:', sliceError);
            }
          }
        }
        // Ollama için chunk'a özgü işleme
        else if (currentAPIConfig.provider === APIProvider.OLLAMA && file && 'name' in file) {
          const originalFile = fileRef.current;
          if (originalFile && originalFile.type.startsWith('video/')) {
            if (ollamaSendMode === 'video') {
              // Video segment modu
              try {
                setAnalysisProgress(
                  `Parça ${i + 1}/${numChunks} video kesiliyor... (${formatSecondsToHHMMSS(chunkStart)} - ${formatSecondsToHHMMSS(chunkEnd)})`
                );
                const sliced = await sliceVideo(originalFile, chunkStart, chunkEnd);
                if (cancelAnalysisRef.current) break;
                const { prepareOllamaVideoSegment } = await import('./api');
                chunkFile = await prepareOllamaVideoSegment(sliced);
                useChunkLocalTime = true;
                console.log(`Video segment prepared for Ollama reanalysis chunk ${i + 1}: ${sliced.size} bytes`);
              } catch (videoError) {
                console.warn('Video segment preparation failed for reanalysis, falling back to frame:', videoError);
                const midTime = (chunkStart + chunkEnd) / 2;
                try {
                  const { extractOllamaFrameAtTime } = await import('./api');
                  chunkFile = await extractOllamaFrameAtTime(originalFile, midTime);
                } catch (frameError) {
                  console.warn('Frame extraction failed for reanalysis:', frameError);
                }
              }
            } else {
              // Frame modu
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
        }
        // OpenAI için chunk'a özgü işleme
        else if (currentAPIConfig.provider === APIProvider.OPENAI && file && 'name' in file) {
          const originalFile = fileRef.current;
          if (originalFile && originalFile.type.startsWith('video/')) {
            if (ollamaSendMode === 'video') {
              try {
                setAnalysisProgress(
                  `Parça ${i + 1}/${numChunks} çoklu kare çıkarılıyor... (${formatSecondsToHHMMSS(chunkStart)} - ${formatSecondsToHHMMSS(chunkEnd)})`
                );
                const sliced = await sliceVideo(originalFile, chunkStart, chunkEnd);
                if (cancelAnalysisRef.current) break;
                const { prepareOpenAIVideoSegment } = await import('./api');
                chunkFile = await prepareOpenAIVideoSegment(sliced);
                useChunkLocalTime = true;
              } catch (videoError) {
                console.warn('Multi-frame preparation failed for reanalysis:', videoError);
                const midTime = (chunkStart + chunkEnd) / 2;
                try {
                  const { extractOpenAIFrameAtTime } = await import('./api');
                  chunkFile = await extractOpenAIFrameAtTime(originalFile, midTime);
                } catch (frameError) {
                  console.warn('Frame extraction failed for OpenAI reanalysis:', frameError);
                }
              }
            } else {
              const midTime = (chunkStart + chunkEnd) / 2;
              try {
                const { extractOpenAIFrameAtTime } = await import('./api');
                chunkFile = await extractOpenAIFrameAtTime(originalFile, midTime);
              } catch (frameError) {
                console.warn('Frame extraction failed for OpenAI reanalysis:', frameError);
              }
            }
          }
        }

        // Eğer video kesildi ise, prompt'u güncelle
        let finalPrompt = chunkPrompt;
        if (useChunkLocalTime) {
          const chunkDur = chunkEnd - chunkStart;
          finalPrompt = `Bu video parçası, orijinal videonun ${formatSecondsToHHMMSS(chunkStart)} - ${formatSecondsToHHMMSS(chunkEnd)} arasındaki bölümüdür.
Bu parçanın süresi: ${Math.round(chunkDur)} saniye.
${previousAnalysisContext}
${basePrompt}

### ZAMAN DAMGASI TALİMATLARI (KRİTİK)
- Bu video parçası orijinal videonun ${formatSecondsToHHMMSS(chunkStart)} ile ${formatSecondsToHHMMSS(chunkEnd)} arasına karşılık gelir.
- Zaman damgalarını MUTLAKA orijinal videonun zamanına göre yaz (${formatSecondsToHHMMSS(chunkStart)}'dan başlayarak).
- Bu videonun 00:00:00'ı aslında orijinal videonun ${formatSecondsToHHMMSS(chunkStart)} zamanına denk gelir.
- Videonun her saniyesine ${chunkStart} saniye ekleyerek orijinal video zamanını hesapla.
- Örnek: Videonun 5. saniyesindeki bir olay = ${formatSecondsToHHMMSS(chunkStart + 5)}
- İlk timecode en erken ${formatSecondsToHHMMSS(chunkStart)}, son timecode en geç ${formatSecondsToHHMMSS(chunkEnd)} olabilir.
- Zaman damgalarını SS:DD:SS formatında yaz.
- Bu yeniden analiz olduğu için daha detaylı sonuçlar ver.

- ${functionCallInstruction}
- TÜM SONUÇLAR TÜRKÇE OLMALIDIR.

Şimdi detaylı analizinle fonksiyonu çağır.`;
        }

        setAnalysisProgress(
          `Parça ${i + 1}/${numChunks} yeniden analiz ediliyor... (${formatSecondsToHHMMSS(chunkStart)} - ${formatSecondsToHHMMSS(chunkEnd)})`
        );

        if (!chunkFile) {
          console.error(`Reanalysis chunk ${i + 1}: Dosya yüklenemedi, atlanıyor`);
          continue;
        }

        const resp = await generateContent(finalPrompt, functions, chunkFile);
        if (cancelAnalysisRef.current) break;
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
            // Kategorik verilerin tam yapısını koru (startTime, endTime, category, description, location, text)
            reanalysisTimecodes = reanalysisTimecodes.concat(chunkCategoricalTimecodes.map((ctc: any) => {
              const categoryDisplay = Array.isArray(ctc.category) ? ctc.category.join(', ') : ctc.category;
              return {
                time: ctc.startTime,
                text: `[${categoryDisplay}]: ${ctc.description}`,
                startTime: ctc.startTime,
                endTime: ctc.endTime,
                category: ctc.category,
                description: ctc.description,
                location: ctc.location
              };
            }));
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
      if (cancelAnalysisRef.current) {
        setAnalysisWarning(`⏹️ Yeniden analiz durduruldu. ${reanalysisTimecodes.length} zaman kodu toplandı.`);
      } else {
        setAnalysisWarning(`✅ ${reanalysisStartTime} - ${reanalysisEndTime} aralığı başarıyla yeniden analiz edildi. ${reanalysisTimecodes.length} yeni zaman kodu eklendi.`);
      }
    } else if (!cancelAnalysisRef.current) {
      setAnalysisError(reanalysisError || 'Yeniden analiz sonucu üretilemedi.');
    } else {
      setAnalysisWarning('⏹️ Yeniden analiz durduruldu. Henüz veri toplanamamıştı.');
    }

    setIsReanalyzing(false);
    setAnalysisProgress(null);
    setReanalysisStartTime('');
    setReanalysisEndTime('');
    scrollRef.current?.scrollTo({top: 0});
  };

  // Tek bir transkript satırını silme
  const handleDeleteTimecode = (index: number) => {
    if (!timecodeList) return;
    const updated = timecodeList.filter((_, i) => i !== index);
    setTimecodeList(updated.length > 0 ? updated : null);
  };

  // Belirli zaman aralığındaki transkriptleri toplu silme
  const handleDeleteRange = () => {
    if (!timecodeList || !deleteRangeStart || !deleteRangeEnd) return;

    const startSecs = parseTimeToSeconds(deleteRangeStart);
    const endSecs = parseTimeToSeconds(deleteRangeEnd);

    if (startSecs >= endSecs) {
      setAnalysisError('Silme aralığı: Başlangıç zamanı bitiş zamanından küçük olmalıdır.');
      return;
    }

    const countBefore = timecodeList.length;
    const filtered = timecodeList.filter((tc: any) => {
      const tcSecs = timeToSecs(tc.time);
      return tcSecs < startSecs || tcSecs > endSecs;
    });
    const deletedCount = countBefore - filtered.length;

    if (deletedCount === 0) {
      setAnalysisWarning(`⚠️ ${deleteRangeStart} - ${deleteRangeEnd} aralığında silinecek transkript bulunamadı.`);
    } else {
      setTimecodeList(filtered.length > 0 ? filtered : null);
      setAnalysisWarning(`🗑️ ${deleteRangeStart} - ${deleteRangeEnd} aralığındaki ${deletedCount} transkript silindi.`);
    }

    setDeleteRangeStart('');
    setDeleteRangeEnd('');
  };


  const handleReset = () => {
    // localStorage'dan kaydedilmiş tercihleri yükle
    const saved = loadModePreferences();
    
    // Video ile ilgili state'leri sıfırla
    setVidUrl(null);
    setFile(null);
    setFileName('');
    setTimecodeList(null);
    setRequestedTimecode(null);
    setActiveMode(undefined);
    setIsLoading(false);
    setVideoError(false);
    setSrtTranscript('');
    setAnalysisError(null);
    setAnalysisWarning(null);
    setDebugInfo(null);
    setReanalysisStartTime('');
    setReanalysisEndTime('');
    setIsReanalyzing(false);
    setAnalysisRangeStart('');
    setAnalysisRangeEnd('');
    setDeleteRangeStart('');
    setDeleteRangeEnd('');
    setAnalyzedChunks([]);
    setImportedTranscriptName('');

    // Mod ayarlarını localStorage'dan geri yükle (sıfırlama yerine)
    setSelectedMode(saved?.selectedMode || 'Detaylı Transkript');
    setCustomPrompt(saved?.customPrompt || '');
    setChartPrompt(saved?.chartPrompt || '');
    setChartMode(saved?.chartMode || chartModes[0]);
    setCategoricalPrompt(saved?.categoricalPrompt || '');
    setCategoricalMode(saved?.categoricalMode || categoricalModes[0]);
    setChunkDuration(saved?.chunkDuration ?? 60);
    setOllamaSendMode(saved?.ollamaSendMode || 'frame');

    // Mod seçim ekranını belirle
    const restoredMode = saved?.selectedMode || 'Detaylı Transkript';
    if (restoredMode === 'Özel' || restoredMode === 'Grafik' || restoredMode === 'Kategorik Süreç Transkripti') {
      setShowModeSelection(false);
    } else {
      setShowModeSelection(true);
    }
    
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
                ) : currentAPIConfig.provider === APIProvider.OPENAI ? (
                  <p>OpenAI uyumlu API kullanılıyor. Video frame'leri analiz ederek sonuç üretir.</p>
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
          <div className="mode-header-top">
            <h1>Analiz Modunu Seçin</h1>
            {renderModelBadge()}
          </div>
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
                  <h2>Kategori seçin:</h2>
                  <div className="modeList">
                    {categoricalModes.map((mode) => (
                      <button
                        key={mode}
                        className={c('button', {active: mode === categoricalMode})}
                        onClick={() => {
                          setCategoricalMode(mode);
                          // Eğer "Özel" değilse, bu modun prompt'unu input alanına doldur
                          if (mode !== 'Özel') {
                            setCategoricalPrompt(modes['Kategorik Süreç Transkripti'].subModes![mode] || '');
                          }
                        }}>
                        {mode}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className={c({active: isCustomCategoricalMode})}
                    placeholder="Veya özel kategorileri virgülle ayırarak yazın (örn: Tıklama, Nesne Belirme, Puan Değişimi)..."
                    value={categoricalPrompt}
                    onChange={(e) => setCategoricalPrompt(e.target.value)}
                    onFocus={() => setCategoricalMode('Özel')}
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
                        onClick={() => {
                          setChartMode(mode);
                          // Eğer "Özel" değilse, bu modun prompt'unu input alanına doldur
                          if (mode !== 'Özel') {
                            setChartPrompt(modes['Grafik'].subModes![mode] || '');
                          }
                        }}>
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
                  { value: 10, label: '10s', desc: 'Çok Çok Çok Detaylı' },
                  { value: 20, label: '20s', desc: 'Çok Çok Detaylı' },                  
                  { value: 30, label: '30s', desc: 'Çok Detaylı' },
                  { value: 40, label: '40s', desc: 'Detaylı' },
                  { value: 60, label: '60s', desc: 'Standart' },
                  { value: 120, label: '120s', desc: 'Hızlı' },
                  { value: 180, label: '180s', desc: 'Daha Hızlı' },
                  { value: 240, label: '240s', desc: 'En Hızlı' },
                  { value: 360, label: '360s', desc: 'En En Hızlı' },
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
                  <p>📊 Video {chunkDuration}s parçalara bölünecek ({(() => {
                    const rangeStart = analysisRangeStart ? parseTimeToSeconds(analysisRangeStart) : 0;
                    const rangeEnd = analysisRangeEnd ? parseTimeToSeconds(analysisRangeEnd) : videoDuration;
                    const len = rangeEnd - rangeStart;
                    return Math.ceil(len / (chunkDuration as number));
                  })()} parça)</p>
                )}
              </div>
            </div>

            {/* Yerel API Gönderim Modu (Ollama / OpenAI) */}
            {(currentAPIConfig.provider === APIProvider.OLLAMA || currentAPIConfig.provider === APIProvider.OPENAI) && (
              <div className="setting-group">
                <label className="setting-label">
                  <span className="icon">videocam</span>
                  Görüntü Gönderim Modu
                </label>
                <p className="setting-description">
                  AI'ya her parça için tek bir kare mi yoksa çoklu kare mi gönderilsin?
                </p>
                <div className="chunk-duration-options">
                  <button
                    className={c('chunk-option', { active: ollamaSendMode === 'frame' })}
                    onClick={() => setOllamaSendMode('frame')}
                  >
                    <strong>🖼️ Kare</strong>
                    <span>Hızlı, düşük bellek</span>
                  </button>
                  <button
                    className={c('chunk-option', { active: ollamaSendMode === 'video' })}
                    onClick={() => setOllamaSendMode('video')}
                  >
                    <strong>🎬 Çoklu Kare</strong>
                    <span>Detaylı, yüksek bellek</span>
                  </button>
                </div>
                <div className="chunk-info">
                  {ollamaSendMode === 'frame' ? (
                    <p>🖼️ Her parçanın ortasından tek bir kare çıkarılıp gönderilecek (hızlı, tüm modeller destekler)</p>
                  ) : (
                    <p>🎬 Her parçadan çoklu kare çıkarılıp birlikte gönderilecek (daha detaylı analiz, daha yavaş)</p>
                  )}
                </div>
              </div>
            )}

            {/* Analiz Aralığı Seçimi */}
            {videoDuration > 0 && (
              <div className="setting-group">
                <label className="setting-label">
                  <span className="icon">content_cut</span>
                  Analiz Aralığı (isteğe bağlı)
                </label>
                <p className="setting-description">
                  Videonun sadece belirli bir bölümünü analiz etmek için başlangıç ve bitiş zamanı girin. Boş bırakırsanız tüm video analiz edilir.
                </p>
                <div className="time-inputs">
                  <div className="time-input-group">
                    <label>Başlangıç</label>
                    <input
                      type="text"
                      placeholder="00:00:00"
                      value={analysisRangeStart}
                      onChange={(e) => setAnalysisRangeStart(e.target.value)}
                    />
                    <small>Format: SS:DD:SS veya DD:SS veya SS</small>
                  </div>
                  <div className="time-input-group">
                    <label>Bitiş</label>
                    <input
                      type="text"
                      placeholder={formatSecondsToHHMMSS(videoDuration)}
                      value={analysisRangeEnd}
                      onChange={(e) => setAnalysisRangeEnd(e.target.value)}
                    />
                    <small>Format: SS:DD:SS veya DD:SS veya SS</small>
                  </div>
                </div>
                {(analysisRangeStart || analysisRangeEnd) && (
                  <div className="chunk-info">
                    <p>🎯 Analiz aralığı: {analysisRangeStart || '00:00:00'} → {analysisRangeEnd || formatSecondsToHHMMSS(videoDuration)}
                      {' '}({(() => {
                        const s = analysisRangeStart ? parseTimeToSeconds(analysisRangeStart) : 0;
                        const e = analysisRangeEnd ? parseTimeToSeconds(analysisRangeEnd) : videoDuration;
                        return formatSecondsToHHMMSS(e - s);
                      })()} süre)
                    </p>
                    <button
                      className="button secondary small"
                      onClick={() => { setAnalysisRangeStart(''); setAnalysisRangeEnd(''); }}
                      style={{ marginTop: '4px' }}
                    >
                      <span className="icon">clear</span> Tüm Videoyu Analiz Et
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Önceki Analiz Dosyası İçe Aktarma */}
          <div className="chunk-duration-section">
            <div className="setting-group">
              <label className="setting-label">
                <span className="icon">upload_file</span>
                Önceki Analiz Dosyasını Yükle (isteğe bağlı)
              </label>
              <p className="setting-description">
                Daha önce dışa aktardığınız SRT veya Excel (.xlsx) dosyasını yükleyerek mevcut analiz verileriyle devam edebilir,
                belirli aralıkları yeniden analiz ettirebilirsiniz.
              </p>
              <div
                className="upload-area compact"
                onClick={() => transcriptInputRef.current?.click()}
                onDrop={handleTranscriptDrop}
                onDragOver={(e) => e.preventDefault()}
                style={{ cursor: 'pointer', padding: '16px', minHeight: 'auto' }}
              >
                <div className="upload-content" style={{ gap: '8px' }}>
                  <span className="icon-large" style={{ fontSize: '2rem' }}>description</span>
                  {importedTranscriptName ? (
                    <p style={{ margin: 0 }}>
                      <strong>✅ {importedTranscriptName}</strong> yüklendi
                    </p>
                  ) : (
                    <p style={{ margin: 0 }}>SRT veya XLSX dosyasını sürükleyip bırakın veya tıklayarak seçin</p>
                  )}
                </div>
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
              (isCategoricalMode && isCustomCategoricalMode && !categoricalPrompt.trim()) ||
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
          {renderModelBadge()}
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
            onGapClick={(start, end) => {
              setReanalysisStartTime(start);
              setReanalysisEndTime(end);
            }}
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
                    <div className="reanalysis-chunk-duration">
                      <label>Parça Süresi</label>
                      <div className="chunk-buttons-inline">
                        {[10, 20, 30, 60].map((d) => (
                          <button
                            key={d}
                            className={`chunk-btn-sm${chunkDuration === d ? ' active' : ''}`}
                            onClick={() => setChunkDuration(d)}
                            disabled={isReanalyzing}
                          >
                            {d}s
                          </button>
                        ))}
                        <button
                          className={`chunk-btn-sm${chunkDuration === 'all' ? ' active' : ''}`}
                          onClick={() => setChunkDuration('all')}
                          disabled={isReanalyzing}
                        >
                          Tümü
                        </button>
                      </div>
                    </div>
                    {analyzedChunks && analyzedChunks.length > 0 && (
                      <div className="reanalysis-chunk-duration">
                        <label style={{marginTop: '12px', display: 'block'}}>Analiz Parçaları (Hızlı Seçim)</label>
                        <div className="chunk-buttons-inline" style={{marginTop: '8px'}}>
                          {analyzedChunks.map((chunk, idx) => (
                            <button
                              key={idx}
                              className="chunk-btn-sm"
                              onClick={() => {
                                setReanalysisStartTime(formatSecondsToHHMMSS(chunk.start));
                                setReanalysisEndTime(formatSecondsToHHMMSS(chunk.end));
                              }}
                              disabled={isReanalyzing}
                            >
                              {formatSecondsToHHMMSS(chunk.start)} - {formatSecondsToHHMMSS(chunk.end)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="reanalysis-actions">
                      <button
                        className="button"
                        onClick={() => handleReanalysis(true)}
                        disabled={isReanalyzing || !reanalysisStartTime || !reanalysisEndTime}
                        title="Önceki analiz sonuçları bağlam olarak gönderilir"
                      >
                        <span className="icon">{isReanalyzing ? 'hourglass_empty' : 'analytics'}</span>
                        {isReanalyzing ? 'Analiz Ediliyor...' : 'Bağlamlı Analiz'}
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => handleReanalysis(false)}
                        disabled={isReanalyzing || !reanalysisStartTime || !reanalysisEndTime}
                        title="Önceki analiz sonuçları gönderilmez, sıfırdan analiz yapılır"
                      >
                        <span className="icon">{isReanalyzing ? 'hourglass_empty' : 'restart_alt'}</span>
                        {isReanalyzing ? 'Analiz Ediliyor...' : 'Sıfırdan Analiz'}
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

              {/* Aralık Silme Paneli */}
              <details className="output-panel delete-range-panel">
                <summary>
                  <h3>Belirli Aralıktaki Transkriptleri Sil</h3>
                  <span className="icon">delete_sweep</span>
                  <span className="icon">expand_more</span>
                </summary>
                <div className="panel-content">
                  <div className="reanalysis-form">
                    <p>Belirli bir zaman aralığındaki tüm transkriptleri silmek için zaman kodlarını girin:</p>
                    <div className="time-inputs">
                      <div className="time-input-group">
                        <label htmlFor="delete-start-time">Başlangıç Zamanı</label>
                        <input
                          id="delete-start-time"
                          type="text"
                          placeholder="00:02:00"
                          value={deleteRangeStart}
                          onChange={(e) => setDeleteRangeStart(e.target.value)}
                        />
                        <small>Format: SS:DD:SS veya DD:SS veya SS</small>
                      </div>
                      <div className="time-input-group">
                        <label htmlFor="delete-end-time">Bitiş Zamanı</label>
                        <input
                          id="delete-end-time"
                          type="text"
                          placeholder="00:04:00"
                          value={deleteRangeEnd}
                          onChange={(e) => setDeleteRangeEnd(e.target.value)}
                        />
                        <small>Format: SS:DD:SS veya DD:SS veya SS</small>
                      </div>
                    </div>
                    {analyzedChunks && analyzedChunks.length > 0 && (
                      <div className="reanalysis-chunk-duration">
                        <label style={{marginTop: '12px', display: 'block'}}>Analiz Parçaları (Hızlı Seçim)</label>
                        <div className="chunk-buttons-inline" style={{marginTop: '8px'}}>
                          {analyzedChunks.map((chunk, idx) => (
                            <button
                              key={idx}
                              className="chunk-btn-sm"
                              onClick={() => {
                                setDeleteRangeStart(formatSecondsToHHMMSS(chunk.start));
                                setDeleteRangeEnd(formatSecondsToHHMMSS(chunk.end));
                              }}
                            >
                              {formatSecondsToHHMMSS(chunk.start)} - {formatSecondsToHHMMSS(chunk.end)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="reanalysis-actions">
                      <button
                        className="button danger"
                        onClick={handleDeleteRange}
                        disabled={!deleteRangeStart || !deleteRangeEnd}
                      >
                        <span className="icon">delete_sweep</span>
                        Aralığı Sil
                      </button>
                      <button
                        className="button secondary small"
                        onClick={() => {
                          setDeleteRangeStart('');
                          setDeleteRangeEnd('');
                        }}
                      >
                        <span className="icon">clear</span>
                        Temizle
                      </button>
                    </div>
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
                      <button onClick={() => transcriptInputRef.current?.click()} className="button small secondary">
                        <span className="icon">upload_file</span>
                        Dosya İçe Aktar
                      </button>
                    </div>
                    <span className="icon">expand_more</span>
                  </summary>
                  <div className="panel-content">
                    <textarea value={srtTranscript} readOnly rows={10} aria-label="SRT Transcript" />
                  </div>
                </details>
              )}
              
              <details className="output-panel transcript-panel" open>
                <summary>
                  <h3>Transkript ({timecodeList.length} satır)</h3>
                  <span className="icon">expand_more</span>
                </summary>
                <div className="panel-content">
                  {activeMode === 'Tablo' ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Başlangıç</th>
                          <th>Bitiş</th>
                          <th>Açıklama</th>
                          <th>Nesneler</th>
                          <th className="delete-col"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {timecodeList.map(({time, text, objects, startTime, endTime}, i) => (
                          <tr key={i} className="deletable-row">
                            <td role="button" onClick={() => setRequestedTimecode(timeToSecs(startTime || time))}><time>{startTime || time}</time></td>
                            <td role="button" onClick={() => setRequestedTimecode(timeToSecs(startTime || time))}><time>{endTime || '-'}</time></td>
                            <td role="button" onClick={() => setRequestedTimecode(timeToSecs(startTime || time))}>{text}</td>
                            <td role="button" onClick={() => setRequestedTimecode(timeToSecs(startTime || time))}>{objects?.join(', ')}</td>
                            <td className="delete-cell">
                              <button
                                className="delete-btn"
                                onClick={(e) => { e.stopPropagation(); handleDeleteTimecode(i); }}
                                title="Bu satırı sil"
                              >
                                <span className="icon">close</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : activeMode === 'Grafik' ? (
                    <Chart data={timecodeList} yLabel={chartLabel} jumpToTimecode={setRequestedTimecode} />
                  ) : activeMode && 'isList' in modes[activeMode] && modes[activeMode].isList ? (
                    <ul>
                      {timecodeList.map(({time, text, startTime, endTime}, i) => {
                        const displayTime = startTime && endTime 
                          ? `${startTime} - ${endTime}`
                          : time;
                        
                        return (
                          <li key={i} className="outputItem deletable-row">
                            <button onClick={() => setRequestedTimecode(timeToSecs(startTime || time))}>
                              <time>{displayTime}</time>
                              <p className="text">{text}</p>
                            </button>
                            <button
                              className="delete-btn"
                              onClick={() => handleDeleteTimecode(i)}
                              title="Bu satırı sil"
                            >
                              <span className="icon">close</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className='paragraph-output'>
                      {timecodeList.map(({time, text, startTime, endTime}, i) => {
                        const displayTime = startTime && endTime 
                          ? `${startTime} - ${endTime}`
                          : time;
                        
                        return (
                          <span key={i} className="sentence deletable-row">
                            <span role="button" onClick={() => setRequestedTimecode(timeToSecs(startTime || time))}>
                              <time>{displayTime}</time>
                              <span>{text}</span>
                            </span>
                            <button
                              className="delete-btn"
                              onClick={() => handleDeleteTimecode(i)}
                              title="Bu satırı sil"
                            >
                              <span className="icon">close</span>
                            </button>
                          </span>
                        );
                      })}
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
    <main className="dark">
      {(isLoadingVideo || isLoading || isReanalyzing) && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="spinner"></div>
            <p>{isLoadingVideo ? 'Video işleniyor...' : analysisProgress || (isReanalyzing ? 'Yeniden analiz yapılıyor...' : 'Analiz yapılıyor...')}</p>
            {(isLoading || isReanalyzing) && !isLoadingVideo && (
              <button
                className="button secondary"
                style={{ marginTop: '12px' }}
                onClick={() => { cancelAnalysisRef.current = true; }}
              >
                <span className="icon">stop_circle</span>
                Durdur
              </button>
            )}
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
      <input
        type="file"
        ref={transcriptInputRef}
        onChange={handleTranscriptImport}
        accept=".srt,.xlsx,.xls"
        style={{ display: 'none' }}
      />
    </main>
  );
}