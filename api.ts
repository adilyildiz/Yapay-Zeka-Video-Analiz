/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */

import {
  FunctionDeclaration,
  GoogleGenAI,
  File as GeminiFile,
  FunctionCallingConfigMode,
} from '@google/genai';
import OllamaAPI, { OllamaConfig, OllamaUploadedFile } from './ollama-api';
import OpenAIAPI, { OpenAIConfig, OpenAIUploadedFile } from './openai-api';

// localStorage yardımcı fonksiyonları
function getStoredConfig(): string {
  try {
    return localStorage.getItem('api_config') || '';
  } catch {
    return '';
  }
}

function setStoredConfig(value: string): void {
  try {
    localStorage.setItem('api_config', value);
  } catch (e) {
    console.warn('localStorage\'a API config yazılamadı:', e);
  }
}

export enum APIProvider {
  GEMINI = 'gemini',
  OLLAMA = 'ollama',
  OPENAI = 'openai'
}

// Çoklu Gemini API anahtarı yönetimi
export interface SavedGeminiKey {
  label: string;
  apiKey: string;
}

const GEMINI_KEYS_STORAGE_KEY = 'gemini_api_keys';

export function getSavedGeminiKeys(): SavedGeminiKey[] {
  try {
    const stored = localStorage.getItem(GEMINI_KEYS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as SavedGeminiKey[];
    }
  } catch (e) {
    console.warn('Gemini API anahtarları okunamadı:', e);
  }
  return [];
}

export function saveGeminiKeys(keys: SavedGeminiKey[]): void {
  try {
    localStorage.setItem(GEMINI_KEYS_STORAGE_KEY, JSON.stringify(keys));
  } catch (e) {
    console.warn('Gemini API anahtarları kaydedilemedi:', e);
  }
}

export function addGeminiKey(label: string, apiKey: string): SavedGeminiKey[] {
  const keys = getSavedGeminiKeys();
  keys.push({ label, apiKey });
  saveGeminiKeys(keys);
  return keys;
}

export function removeGeminiKey(index: number): SavedGeminiKey[] {
  const keys = getSavedGeminiKeys();
  keys.splice(index, 1);
  saveGeminiKeys(keys);
  return keys;
}

export interface APIConfig {
  provider: APIProvider;
  gemini?: {
    apiKey: string;
    model: string;
  };
  ollama?: OllamaConfig;
  openai?: OpenAIConfig;
}

// API configuration - bu normalde bir config dosyasından gelecek
let currentConfig: APIConfig = {
  provider: APIProvider.GEMINI,
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
    model: 'gemini-2.5-flash'
  },
  ollama: {
    baseURL: 'http://localhost:11434',
    model: 'llava:latest'
  },
  openai: {
    baseURL: 'http://localhost:8080',
    apiKey: '',
    model: 'gpt-4o'
  }
};

let geminiClient = new GoogleGenAI({apiKey: currentConfig.gemini?.apiKey || ''});
let ollamaClient: OllamaAPI | null = null;
let openaiClient: OpenAIAPI | null = null;

// Inline base64 ile gönderilen dosya tipi (Files API başarısız olursa kullanılır)
export interface InlineUploadedFile {
  inlineData: {
    mimeType: string;
    data: string; // base64
  };
  mimeType: string;
  name: string;
}

export function isInlineUploadedFile(file: UploadedFile): file is InlineUploadedFile {
  return 'inlineData' in file;
}

// Tarayıcı File nesnesini base64 string'e dönüştürür
function fileToBase64(file: globalThis.File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:video/mp4;base64,XXXX formatından sadece base64 kısmını al
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export type UploadedFile = GeminiFile | OllamaUploadedFile | OpenAIUploadedFile | InlineUploadedFile;

// API konfigürasyonunu güncelleme fonksiyonu
export function updateAPIConfig(config: APIConfig, persist = true) {
  currentConfig = config;
  
  // localStorage'a kaydet
  if (persist) {
    setStoredConfig(JSON.stringify(config));
  }
  
  // Gemini client'ı güncelle
  if (config.gemini?.apiKey) {
    geminiClient = new GoogleGenAI({apiKey: config.gemini.apiKey});
  }
  
  // Ollama client'ı güncelle
  if (config.ollama && (!ollamaClient || 
      ollamaClient['config'].baseURL !== config.ollama.baseURL ||
      ollamaClient['config'].model !== config.ollama.model)) {
    ollamaClient = new OllamaAPI(config.ollama);
  }

  // OpenAI client'ı güncelle
  if (config.openai && (!openaiClient ||
      openaiClient['config'].baseURL !== config.openai.baseURL ||
      openaiClient['config'].model !== config.openai.model ||
      openaiClient['config'].apiKey !== config.openai.apiKey)) {
    openaiClient = new OpenAIAPI(config.openai);
  }
}

export function getCurrentConfig(): APIConfig {
  // localStorage'dan config'i yükle
  const storedValue = getStoredConfig();
  if (storedValue) {
    try {
      const storedConfig = JSON.parse(storedValue) as APIConfig;
      // localStorage'daki config ile currentConfig'i güncelle (persist=false, tekrar yazmaya gerek yok)
      updateAPIConfig(storedConfig, false);
      return storedConfig;
    } catch (error) {
      console.warn('localStorage\'dan API config okunamadı:', error);
    }
  }
  return currentConfig;
}

async function generateContent(
  text: string,
  functionDeclarations: FunctionDeclaration[],
  file: UploadedFile,
) {
  // Debug logging
  console.log('Current API Provider:', currentConfig.provider);
  console.log('Function declarations count:', functionDeclarations.length);
  
  if (currentConfig.provider === APIProvider.OLLAMA) {
    if (!ollamaClient) {
      if (!currentConfig.ollama) {
        throw new Error('Ollama configuration not found');
      }
      ollamaClient = new OllamaAPI(currentConfig.ollama);
    }
    
    // Multi-frame modu (extraImages varsa) ise video-specific generate kullan
    const ollamaFile = file as OllamaUploadedFile;
    if (ollamaFile.extraImages && ollamaFile.extraImages.length > 0) {
      return await ollamaClient.generateContentWithVideo(text, functionDeclarations, ollamaFile);
    }
    return await ollamaClient.generateContent(text, functionDeclarations, ollamaFile);
  } else if (currentConfig.provider === APIProvider.OPENAI) {
    if (!openaiClient) {
      if (!currentConfig.openai) {
        throw new Error('OpenAI configuration not found');
      }
      openaiClient = new OpenAIAPI(currentConfig.openai);
    }

    return await openaiClient.generateContent(text, functionDeclarations, file as OpenAIUploadedFile);
  } else {
    // Gemini API
    if (!currentConfig.gemini?.apiKey) {
      throw new Error('Gemini API key is not configured. Please set your API key in the settings.');
    }
    
    console.log('Using Gemini API with key:', currentConfig.gemini.apiKey.substring(0, 10) + '...');
    
    try {
      const response = await geminiClient.models.generateContent({
        model: currentConfig.gemini?.model || 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {text},
              isInlineUploadedFile(file)
                ? {
                    inlineData: {
                      mimeType: (file as InlineUploadedFile).inlineData.mimeType,
                      data: (file as InlineUploadedFile).inlineData.data,
                    },
                  }
                : {
                    fileData: {
                      mimeType: file.mimeType,
                      fileUri: (file as GeminiFile).uri,
                    },
                  },
            ],
          },
        ],
        config: {
          temperature: 0.3,
          //topP: 0.9,
          //topK: 40,
          //maxOutputTokens: 4096, // Detaylı transkript için daha yüksek limit
          tools: [{functionDeclarations}],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
            },
          },
        },
      });

      return response;
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw new Error(`Gemini API failed: ${error}`);
    }
  }
}

async function uploadFile(file: globalThis.File): Promise<UploadedFile> {
  if (currentConfig.provider === APIProvider.OLLAMA) {
    if (!ollamaClient) {
      if (!currentConfig.ollama) {
        throw new Error('Ollama configuration not found');
      }
      ollamaClient = new OllamaAPI(currentConfig.ollama);
    }
    
    console.log('Processing file for Ollama...');
    const uploadedFile = await ollamaClient.uploadFile(file);
    console.log('File processed for Ollama.');
    return uploadedFile;
  } else if (currentConfig.provider === APIProvider.OPENAI) {
    if (!openaiClient) {
      if (!currentConfig.openai) {
        throw new Error('OpenAI configuration not found');
      }
      openaiClient = new OpenAIAPI(currentConfig.openai);
    }

    console.log('Processing file for OpenAI...');
    const uploadedFile = await openaiClient.uploadFile(file);
    console.log('File processed for OpenAI.');
    return uploadedFile;
  } else {
    // Gemini API — sıra: 1) inline base64, 2) tarayıcı Files API, 3) sunucu proxy
    const apiKey = currentConfig.gemini!.apiKey;
    const INLINE_MAX_SIZE = 20 * 1024 * 1024; // 20MB

    // 1. Inline base64 denemesi (dosya <= 20MB ise)
    if (file.size <= INLINE_MAX_SIZE) {
      try {
        console.log(`Inline base64 gönderim deneniyor (${(file.size / 1024 / 1024).toFixed(1)}MB)...`);
        const base64Data = await fileToBase64(file);
        const inlineFile: InlineUploadedFile = {
          inlineData: {
            mimeType: file.type,
            data: base64Data,
          },
          mimeType: file.type,
          name: file.name,
        };
        console.log('Done (inline base64)');
        return inlineFile;
      } catch (inlineError) {
        console.warn('Inline base64 gönderim başarısız:', inlineError);
      }
    } else {
      console.log(`Dosya boyutu (${(file.size / 1024 / 1024).toFixed(1)}MB) inline limit (20MB) üzerinde, atlanıyor.`);
    }

    // 2. Tarayıcı taraflı Files API denemesi
    try {
      console.log('Uploading to Gemini (browser-side Files API)...');
      const blob = new Blob([file], { type: file.type });
      const uploadedFile = await geminiClient.files.upload({
        file: blob,
        config: { displayName: file.name },
      });

      let getFile = await geminiClient.files.get({ name: uploadedFile.name! });
      while (getFile.state === 'PROCESSING') {
        await new Promise(resolve => setTimeout(resolve, 5000));
        getFile = await geminiClient.files.get({ name: uploadedFile.name! });
        console.log(`current file status: ${getFile.state}`);
      }
      if (getFile.state === 'FAILED') {
        throw new Error('File processing failed.');
      }
      console.log('Done (browser-side Files API)');
      return getFile;
    } catch (browserError) {
      console.warn('Tarayıcı taraflı Files API başarısız:', browserError);
    }

    // 3. Sunucu proxy'ye düş
    console.warn('Sunucu proxy deneniyor...');
    const arrayBuffer = await file.arrayBuffer();
    const response = await fetch('/api/gemini-upload', {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        'X-Gemini-Api-Key': apiKey,
        'X-Filename': encodeURIComponent(file.name),
      },
      body: arrayBuffer,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Gemini upload başarısız: ${err.error}`);
    }

    const uploadedFile = await response.json();
    console.log('Done (server proxy)');
    return uploadedFile;
  }
}

// Gemini modellerini REST API'den alma fonksiyonu
export async function getGeminiModels(apiKey: string): Promise<{id: string, displayName: string}[]> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (!response.ok) {
      throw new Error(`API hatası: ${response.status}`);
    }
    const data = await response.json();
    const models: {id: string, displayName: string}[] = [];
    for (const model of data.models || []) {
      // Video analizi için uygun olan generateContent destekli modelleri filtrele
      const methods: string[] = model.supportedGenerationMethods || [];
      if (model.name && methods.includes('generateContent')) {
        const id = model.name.replace('models/', '');
        // Gemini ve Gemma modellerini göster (tts, image, live, embedding vb. hariç)
        if ((id.startsWith('gemini-') || id.startsWith('gemma-')) && 
            !id.includes('tts') && 
            !id.includes('image') && 
            !id.includes('live') && 
            !id.includes('embedding') &&
            !id.includes('computer-use') &&
            !id.includes('deep-research') &&
            !id.includes('robotics')) {
          models.push({
            id,
            displayName: model.displayName || id
          });
        }
      }
    }
    return models;
  } catch (error) {
    console.error('Gemini modelleri alınamadı:', error);
    return [];
  }
}

// Ollama bağlantısını test etme fonksiyonu
export async function testOllamaConnection(config: OllamaConfig): Promise<boolean> {
  const testClient = new OllamaAPI(config);
  return await testClient.checkConnection();
}

// Ollama modellerini alma fonksiyonu
export async function getOllamaModels(config: OllamaConfig): Promise<string[]> {
  const testClient = new OllamaAPI(config);
  return await testClient.getAvailableModels();
}

// Ollama için chunk-specific frame extraction
export async function extractOllamaFrameAtTime(file: globalThis.File, timeInSeconds: number): Promise<OllamaUploadedFile> {
  if (!ollamaClient) {
    if (!currentConfig.ollama) {
      throw new Error('Ollama configuration not found');
    }
    ollamaClient = new OllamaAPI(currentConfig.ollama);
  }
  
  return await ollamaClient.extractFrameAtTime(file, timeInSeconds);
}

// Ollama için çoklu kare çıkarma (belirli zamanlarda)
export async function extractOllamaFramesAtTimes(file: globalThis.File, times: number[]): Promise<OllamaUploadedFile[]> {
  if (!ollamaClient) {
    if (!currentConfig.ollama) {
      throw new Error('Ollama configuration not found');
    }
    ollamaClient = new OllamaAPI(currentConfig.ollama);
  }
  
  return await ollamaClient.extractFramesAtTimes(file, times);
}

// Ollama için video segmenti hazırlama (kesilmiş video parçası gönderimi)
export async function prepareOllamaVideoSegment(file: globalThis.File): Promise<OllamaUploadedFile> {
  if (!ollamaClient) {
    if (!currentConfig.ollama) {
      throw new Error('Ollama configuration not found');
    }
    ollamaClient = new OllamaAPI(currentConfig.ollama);
  }
  
  return await ollamaClient.prepareVideoSegment(file);
}

// Ollama video segment ile analiz
export async function generateOllamaContentWithVideo(
  text: string,
  functionDeclarations: any[],
  file: OllamaUploadedFile,
) {
  if (!ollamaClient) {
    if (!currentConfig.ollama) {
      throw new Error('Ollama configuration not found');
    }
    ollamaClient = new OllamaAPI(currentConfig.ollama);
  }
  
  return await ollamaClient.generateContentWithVideo(text, functionDeclarations, file);
}

// OpenAI bağlantısını test etme fonksiyonu
export async function testOpenAIConnection(config: OpenAIConfig): Promise<boolean> {
  const testClient = new OpenAIAPI(config);
  return await testClient.checkConnection();
}

// OpenAI modellerini alma fonksiyonu
export async function getOpenAIModels(config: OpenAIConfig): Promise<string[]> {
  const testClient = new OpenAIAPI(config);
  return await testClient.getAvailableModels();
}

// OpenAI için chunk-specific frame extraction
export async function extractOpenAIFrameAtTime(file: globalThis.File, timeInSeconds: number): Promise<OpenAIUploadedFile> {
  if (!openaiClient) {
    if (!currentConfig.openai) {
      throw new Error('OpenAI configuration not found');
    }
    openaiClient = new OpenAIAPI(currentConfig.openai);
  }
  return await openaiClient.extractFrameAtTime(file, timeInSeconds);
}

// OpenAI için çoklu kare hazırlama
export async function prepareOpenAIVideoSegment(file: globalThis.File): Promise<OpenAIUploadedFile> {
  if (!openaiClient) {
    if (!currentConfig.openai) {
      throw new Error('OpenAI configuration not found');
    }
    openaiClient = new OpenAIAPI(currentConfig.openai);
  }
  return await openaiClient.prepareVideoSegment(file);
}

export {generateContent, uploadFile};