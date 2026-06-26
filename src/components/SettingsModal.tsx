import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { clearGeminiCache } from '../utils/ai';

interface Props {
  show: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const DEFAULT_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={KEY}',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
};

function detectProviderFromModel(model: string): string {
  const m = model.toLowerCase();
  if (m.startsWith('gemini-')) return 'gemini';
  if (m.startsWith('claude-')) return 'anthropic';
  return 'openai';
}

export const SettingsModal: React.FC<Props> = ({ show, onClose, onSaved }) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [modelName, setModelName] = useState('gemini-2.5-flash');
  const [apiUrl, setApiUrl] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    if (!show) return;
    (async () => {
      try {
        const settingsJson = await invoke<string>('get_app_settings_rust');
        const settings = JSON.parse(settingsJson);
        if (settings.gemini_api_key) setGeminiKey(settings.gemini_api_key);
        if (settings.gemini_model) setModelName(settings.gemini_model);
        if (settings.gemini_api_url) setApiUrl(settings.gemini_api_url);
        if (settings.user_name) setUserName(settings.user_name);
      } catch {}
    })();
  }, [show]);

  const handleModelChange = (newModel: string) => {
    setModelName(newModel);
    const prov = detectProviderFromModel(newModel);
    const defaultUrl = DEFAULT_URLS[prov];
    const existingProv = detectProviderFromModel(modelName);
    if (prov !== existingProv && !apiUrl) {
      setApiUrl(defaultUrl);
    }
  };

  const handleSave = async () => {
    try {
      await Promise.all([
        invoke('set_setting_rust', { key: 'gemini_api_key', value: geminiKey }),
        invoke('set_setting_rust', { key: 'gemini_model', value: modelName }),
        invoke('set_setting_rust', { key: 'gemini_api_url', value: apiUrl }),
        invoke('set_setting_rust', { key: 'user_name', value: userName }),
      ]);
      clearGeminiCache();
      onSaved?.();
      onClose();
    } catch (err: any) {
      alert(`Gagal menyimpan pengaturan: ${err}`);
    }
  };

  if (!show) return null;

  const provider = detectProviderFromModel(modelName);

  return (
    <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '480px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
            Pengaturan AI & Profil
          </h3>
          <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={onClose}>
            <X size={18} className="hover-scale" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">Nama Pengguna</label>
            <input
              type="text"
              className="form-input focus-glow"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px', width: '100%' }}
              placeholder="contoh: Budi"
              value={userName}
              onChange={e => setUserName(e.target.value)}
            />
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Digunakan untuk sapaan di dashboard.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Model AI</label>
            <input
              type="text"
              className="form-input focus-glow"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px', width: '100%', fontFamily: 'monospace' }}
              placeholder="gemini-2.5-flash"
              value={modelName}
              onChange={e => handleModelChange(e.target.value)}
            />
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Provider dideteksi otomatis dari nama model:
              {' '}<code>gpt-*</code> / <code>o1-*</code> / <code>o3-*</code> → OpenAI,
              {' '}<code>claude-*</code> → Anthropic,
              lainnya → Gemini
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">API Key</label>
            <input
              type="password"
              className="form-input focus-glow"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px', width: '100%', fontFamily: 'monospace' }}
              placeholder={
                provider === 'openai' ? 'sk-...' :
                provider === 'anthropic' ? 'sk-ant-...' :
                'Masukkan Gemini API Key Anda'
              }
              value={geminiKey}
              onChange={e => setGeminiKey(e.target.value)}
            />
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {provider === 'openai' ? 'OpenAI API key (sk-...). Dikirim via header Authorization.' :
               provider === 'anthropic' ? 'Anthropic API key (sk-ant-...). Dikirim via header x-api-key.' :
               'Gemini API key dari Google AI Studio. Dikirim via query parameter.'}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">API URL <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span></label>
            <input
              type="text"
              className="form-input focus-glow"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px', width: '100%', fontFamily: 'monospace', fontSize: '11px' }}
              placeholder={DEFAULT_URLS[provider] || DEFAULT_URLS.gemini}
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
            />
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Gunakan <code>{'{KEY}'}</code> dan <code>{'{MODEL}'}</code> sebagai placeholder. Biarkan kosong untuk default.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: 'var(--text-muted)', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
            <span>Terdeteksi:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'Google Gemini'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button type="button" className="btn btn-secondary hover-scale" onClick={onClose}>Batal</button>
            <button
              className="btn btn-primary hover-scale"
              onClick={handleSave}
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Save size={12} />
              <span>Simpan Pengaturan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
