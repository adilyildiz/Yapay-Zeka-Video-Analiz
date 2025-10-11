/**
 * API Configuration Component
 */
import React, { useState, useEffect } from 'react';

// Basit cookie yardımcıları
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
import { APIProvider, APIConfig, getCurrentConfig, updateAPIConfig, testOllamaConnection, getOllamaModels } from './api';

interface APISettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChange: (config: APIConfig) => void;
}

export default function APISettings({ isOpen, onClose, onConfigChange }: APISettingsProps) {
  const [config, setConfig] = useState<APIConfig>(getCurrentConfig());
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  useEffect(() => {
    if (isOpen) {
        // Cookie'den ayarları yükle
        const cookieValue = getCookie('api_config');
        if (cookieValue) {
          try {
            const parsed = JSON.parse(cookieValue);
            setConfig(parsed);
          } catch {
            setConfig(getCurrentConfig());
          }
        } else {
          setConfig(getCurrentConfig());
        }
    }
  }, [isOpen]);

  const handleProviderChange = (provider: APIProvider) => {
    const newConfig = { ...config, provider };
    setConfig(newConfig);
  };

  const handleGeminiApiKeyChange = (apiKey: string) => {
    const newConfig = {
      ...config,
      gemini: { ...config.gemini, apiKey, model: config.gemini?.model || 'gemini-2.5-flash' }
    };
    setConfig(newConfig);
  };

  const handleGeminiModelChange = (model: string) => {
    const newConfig = {
      ...config,
      gemini: { ...config.gemini, model, apiKey: config.gemini?.apiKey || '' }
    };
    setConfig(newConfig);
  };

  const handleOllamaConfigChange = (field: 'baseURL' | 'model', value: string) => {
    const newConfig = {
      ...config,
      ollama: { ...config.ollama, [field]: value }
    };
    setConfig(newConfig);
  };

  const testConnection = async () => {
    if (config.provider === APIProvider.OLLAMA && config.ollama) {
      setIsTestingConnection(true);
      setConnectionStatus('');
      
      try {
        const isConnected = await testOllamaConnection(config.ollama);
        if (isConnected) {
          setConnectionStatus('✅ Ollama bağlantısı başarılı!');
          // Modelleri yükle
          setIsLoadingModels(true);
          const models = await getOllamaModels(config.ollama);
          setAvailableModels(models);
          setIsLoadingModels(false);
        } else {
          setConnectionStatus('❌ Ollama bağlantısı başarısız. Sunucunun çalıştığından emin olun.');
        }
      } catch (error) {
        setConnectionStatus(`❌ Bağlantı hatası: ${error}`);
      } finally {
        setIsTestingConnection(false);
      }
    }
  };

  const handleSave = () => {
     updateAPIConfig(config);
     // Cookie'ye yaz
     setCookie('api_config', JSON.stringify(config));
     onConfigChange(config);
     onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">API Yapılandırması</h2>
          <button
            onClick={onClose}
            className="modal-close"
          >
            ✕
          </button>
        </div>

        <div className="form-group">
          <label className="form-label">
            AI Sağlayıcısı Seçin
          </label>
          <p className="form-help">Video analizi için kullanılacak AI servisini seçin</p>
          <div className="radio-group">
            <div className="radio-option">
              <input
                type="radio"
                name="provider"
                value={APIProvider.GEMINI}
                checked={config.provider === APIProvider.GEMINI}
                onChange={() => handleProviderChange(APIProvider.GEMINI)}
                className="mr-3"
              />
              <div className="radio-label">
                <strong>Google Gemini</strong>
                <p>Güçlü video analizi ve transkripsiyon yetenekleri</p>
              </div>
            </div>
            <div className="radio-option">
              <input
                type="radio"
                name="provider"
                value={APIProvider.OLLAMA}
                checked={config.provider === APIProvider.OLLAMA}
                onChange={() => handleProviderChange(APIProvider.OLLAMA)}
                className="mr-3"
              />
              <div className="radio-label">
                <strong>Ollama (Yerel)</strong>
                <p>Yerel çalışan görsel AI modelleri (llava, moondream)</p>
              </div>
            </div>
          </div>
        </div>

          {config.provider === APIProvider.GEMINI && (
            <div className="form-group">
              <label className="form-label">
                Gemini API Anahtarı
              </label>
              <input
                type="password"
                value={config.gemini?.apiKey || ''}
                onChange={(e) => handleGeminiApiKeyChange(e.target.value)}
                placeholder="API anahtarınızı buraya girin"
              />
              <p className="form-help">
                <span className="icon">info</span>
                API anahtarını <strong>Google AI Studio</strong>'dan ücretsiz olarak alabilirsiniz
              </p>
              
              <label className="form-label" style={{ marginTop: '20px' }}>
                Gemini Model Seçimi
              </label>
              <select
                value={config.gemini?.model || 'gemini-2.5-flash'}
                onChange={(e) => handleGeminiModelChange(e.target.value)}
              >
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Hızlı)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Dengeli - Önerilen)</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Güçlü)</option>
              </select>
              <p className="form-help">
                <strong>Flash Lite:</strong> En hızlı, temel analizler için • 
                <strong>Flash:</strong> Hız ve kalite dengesi, çoğu kullanım için ideal • 
                <strong>Pro:</strong> En detaylı analiz, karmaşık videolar için
              </p>
            </div>
          )}

          {config.provider === APIProvider.OLLAMA && (
            <div className="form-group">
              <div>
                <label className="form-label">
                  Ollama Sunucu Adresi
                </label>
                <input
                  type="text"
                  value={config.ollama?.baseURL || ''}
                  onChange={(e) => handleOllamaConfigChange('baseURL', e.target.value)}
                  placeholder="http://localhost:11434"
                />
              </div>
              
              <div>
                <label className="form-label">
                  AI Model
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input
                    type="text"
                    value={config.ollama?.model || ''}
                    onChange={(e) => handleOllamaConfigChange('model', e.target.value)}
                    placeholder="llava:latest"
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={testConnection}
                    disabled={isTestingConnection}
                    className="button secondary"
                    style={{ minHeight: 'auto', padding: '12px 20px' }}
                  >
                    <span className="icon">wifi</span>
                    {isTestingConnection ? 'Test Ediliyor...' : 'Bağlantıyı Test Et'}
                  </button>
                </div>
                {connectionStatus && (
                  <p className="form-help status-indicator" style={{ marginTop: '8px' }}>
                    {connectionStatus}
                  </p>
                )}
              </div>

              {availableModels.length > 0 && (
                <div>
                  <label className="form-label">
                    Mevcut Modeller
                  </label>
                  <select
                    value={config.ollama?.model || ''}
                    onChange={(e) => handleOllamaConfigChange('model', e.target.value)}
                    disabled={isLoadingModels}
                  >
                    <option value="">Model seçin...</option>
                    {availableModels.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                  <p className="form-help">Sunucudan otomatik olarak alınan model listesi</p>
                </div>
              )}

              <div className="form-help" style={{ fontSize: '0.85rem', lineHeight: '1.6' }}>
                <p><strong>📋 Kullanım Talimatları:</strong></p>
                <p>• Ollama sunucusunun çalıştığından emin olun</p>
                <p>• Video analizi için <code>llava</code>, <code>moondream</code> gibi görsel modeller önerilir</p>
                <p>• Model yüklemek için: <code>ollama pull llava:latest</code></p>
                <br />
                <p><span className="status-warning">⚠️</span> Video'dan otomatik frame çıkarımı yapılır</p>
                <p><span className="status-success">ℹ️</span> Tam video analizi için Gemini API önerilir</p>
              </div>
            </div>
          )}

        <div className="modal-actions">
          <button
            onClick={onClose}
            className="button secondary"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            className="button"
          >
            Ayarları Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}