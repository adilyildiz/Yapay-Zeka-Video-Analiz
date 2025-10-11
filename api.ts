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

// Cookie yardımcı fonksiyonları
function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  return document.cookie.split('; ').reduce((r, v) => {
    const parts = v.split('=');
    return parts[0] === name ? decodeURIComponent(parts[1]) : r;
  }, '');
}

export enum APIProvider {
  GEMINI = 'gemini',
  OLLAMA = 'ollama'
}

export interface APIConfig {
  provider: APIProvider;
  gemini?: {
    apiKey: string;
    model: string;
  };
  ollama?: OllamaConfig;
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
  }
};

let geminiClient = new GoogleGenAI({apiKey: currentConfig.gemini?.apiKey || ''});
let ollamaClient: OllamaAPI | null = null;

export type UploadedFile = GeminiFile | OllamaUploadedFile;

// API konfigürasyonunu güncelleme fonksiyonu
export function updateAPIConfig(config: APIConfig) {
  currentConfig = config;
  
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
}

export function getCurrentConfig(): APIConfig {
  // Cookie'den config'i yükle
  const cookieValue = getCookie('api_config');
  console.log('API Config cookie değeri:', cookieValue);
  if (cookieValue) {
    try {
      const cookieConfig = JSON.parse(cookieValue) as APIConfig;
      console.log('Cookie\'den okunan config:', cookieConfig);
      // Cookie'deki config ile currentConfig'i güncelle
      updateAPIConfig(cookieConfig);
      return cookieConfig;
    } catch (error) {
      console.warn('Cookie\'den API config okunamadı:', error);
    }
  }
  console.log('Cookie bulunamadı, varsayılan config döndürülüyor:', currentConfig);
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
    
    return await ollamaClient.generateContent(text, functionDeclarations, file as OllamaUploadedFile);
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
              {
                fileData: {
                  mimeType: file.mimeType,
                  fileUri: (file as GeminiFile).uri,
                },
              },
            ],
          },
        ],
        config: {
          temperature: 0.5,
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
  } else {
    // Gemini API
    const blob = new Blob([file], {type: file.type});

    console.log('Uploading to Gemini...');
    const uploadedFile = await geminiClient.files.upload({
      file: blob,
      config: {
        displayName: file.name,
      },
    });
    console.log('Uploaded.');
    console.log('Getting...');
    let getFile = await geminiClient.files.get({
      name: uploadedFile.name,
    });
    while (getFile.state === 'PROCESSING') {
      getFile = await geminiClient.files.get({
        name: uploadedFile.name,
      });
      console.log(`current file status: ${getFile.state}`);
      console.log('File is still processing, retrying in 5 seconds');

      await new Promise((resolve) => {
        setTimeout(resolve, 5000);
      });
    }
    console.log(getFile.state);
    if (getFile.state === 'FAILED') {
      throw new Error('File processing failed.');
    }
    console.log('Done');
    return getFile;
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

export {generateContent, uploadFile};