/**
 * API Configuration Component
 */
import React, { useState, useEffect } from 'react';
import { APIProvider, APIConfig, getCurrentConfig, updateAPIConfig, testOllamaConnection, getOllamaModels, getGeminiModels, testOpenAIConnection, getOpenAIModels } from './api';

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
  const [geminiModels, setGeminiModels] = useState<{id: string, displayName: string}[]>([]);
  const [isLoadingGeminiModels, setIsLoadingGeminiModels] = useState(false);
  const [openaiModels, setOpenaiModels] = useState<string[]>([]);
  const [isLoadingOpenaiModels, setIsLoadingOpenaiModels] = useState(false);

  useEffect(() => {
    if (isOpen) {
        // localStorage'dan ayarları yükle (getCurrentConfig zaten localStorage'dan okur)
        setConfig(getCurrentConfig());
    }
  }, [isOpen]);

  // Gemini API anahtarı değiştiğinde modelleri çek
  useEffect(() => {
    const apiKey = config.gemini?.apiKey;
    if (apiKey && apiKey.length > 10 && config.provider === APIProvider.GEMINI) {
      setIsLoadingGeminiModels(true);
      getGeminiModels(apiKey).then(models => {
        setGeminiModels(models);
        setIsLoadingGeminiModels(false);
      });
    }
  }, [config.gemini?.apiKey, config.provider]);

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

  const handleOpenAIConfigChange = (field: 'baseURL' | 'apiKey' | 'model', value: string) => {
    const newConfig = {
      ...config,
      openai: { ...config.openai, baseURL: config.openai?.baseURL || 'http://localhost:8080', apiKey: config.openai?.apiKey || '', model: config.openai?.model || 'gpt-4o', [field]: value }
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
    } else if (config.provider === APIProvider.OPENAI && config.openai) {
      setIsTestingConnection(true);
      setConnectionStatus('');

      try {
        const isConnected = await testOpenAIConnection(config.openai);
        if (isConnected) {
          setConnectionStatus('✅ OpenAI API bağlantısı başarılı!');
          setIsLoadingOpenaiModels(true);
          const models = await getOpenAIModels(config.openai);
          setOpenaiModels(models);
          setIsLoadingOpenaiModels(false);
        } else {
          setConnectionStatus('❌ API bağlantısı başarısız. Sunucu adresini ve API anahtarını kontrol edin.');
        }
      } catch (error) {
        setConnectionStatus(`❌ Bağlantı hatası: ${error}`);
      } finally {
        setIsTestingConnection(false);
      }
    }
  };

  const handleSave = () => {
     // updateAPIConfig artık otomatik olarak localStorage'a kaydediyor
     updateAPIConfig(config);
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
            <div className="radio-option">
              <input
                type="radio"
                name="provider"
                value={APIProvider.OPENAI}
                checked={config.provider === APIProvider.OPENAI}
                onChange={() => handleProviderChange(APIProvider.OPENAI)}
                className="mr-3"
              />
              <div className="radio-label">
                <strong>OpenAI Uyumlu API</strong>
                <p>LocalAI, LM Studio, OpenAI veya herhangi bir OpenAI-uyumlu endpoint</p>
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
                disabled={isLoadingGeminiModels}
              >
                {geminiModels.length > 0 ? (
                  geminiModels.map(model => (
                    <option key={model.id} value={model.id}>{model.displayName}</option>
                  ))
                ) : (
                  <>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Hızlı)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Dengeli - Önerilen)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Güçlü)</option>
                    <option value="gemma-3-27b-it">Gemma 3 27B IT</option>
                  </>
                )}
              </select>
              <p className="form-help">
                {isLoadingGeminiModels 
                  ? '⏳ Modeller yükleniyor...' 
                  : geminiModels.length > 0 
                    ? `✅ ${geminiModels.length} model API'den yüklendi`
                    : 'API anahtarını girdikten sonra modeller otomatik yüklenecektir'}
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

          {config.provider === APIProvider.OPENAI && (
            <div className="form-group">
              <div>
                <label className="form-label">
                  API Sunucu Adresi (Base URL)
                </label>
                <input
                  type="text"
                  value={config.openai?.baseURL || ''}
                  onChange={(e) => handleOpenAIConfigChange('baseURL', e.target.value)}
                  placeholder="http://localhost:8080"
                />
                <p className="form-help">
                  <span className="icon">info</span>
                  /v1/chat/completions endpoint'i otomatik eklenir
                </p>
              </div>

              <div>
                <label className="form-label">
                  API Anahtarı (isteğe bağlı)
                </label>
                <input
                  type="password"
                  value={config.openai?.apiKey || ''}
                  onChange={(e) => handleOpenAIConfigChange('apiKey', e.target.value)}
                  placeholder="sk-... veya boş bırakın"
                />
                <p className="form-help">LocalAI için genellikle gerekli değildir. OpenAI için zorunludur.</p>
              </div>

              <div>
                <label className="form-label">
                  Model
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input
                    type="text"
                    value={config.openai?.model || ''}
                    onChange={(e) => handleOpenAIConfigChange('model', e.target.value)}
                    placeholder="gpt-4o"
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

              {openaiModels.length > 0 && (
                <div>
                  <label className="form-label">
                    Mevcut Modeller
                  </label>
                  <select
                    value={config.openai?.model || ''}
                    onChange={(e) => handleOpenAIConfigChange('model', e.target.value)}
                    disabled={isLoadingOpenaiModels}
                  >
                    <option value="">Model seçin...</option>
                    {openaiModels.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                  <p className="form-help">Sunucudan otomatik olarak alınan model listesi</p>
                </div>
              )}

              <div className="form-help" style={{ fontSize: '0.85rem', lineHeight: '1.6' }}>
                <p><strong>📋 Kullanım Talimatları:</strong></p>
                <p>• <strong>LocalAI:</strong> <code>http://localhost:8080</code> — API anahtarı gerekmez</p>
                <p>• <strong>LM Studio:</strong> <code>http://localhost:1234</code> — API anahtarı gerekmez</p>
                <p>• <strong>OpenAI:</strong> <code>https://api.openai.com</code> — API anahtarı zorunlu</p>
                <p>• Vision destekli model gereklidir (gpt-4o, llava vb.)</p>
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