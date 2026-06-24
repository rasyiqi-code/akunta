import React, { useState, useEffect, useRef } from 'react';
import { Search, Sparkles, Navigation, Trash2, Download } from 'lucide-react';
import { db } from '../utils/db';
import { parseInputWithGemini } from '../utils/gemini';
import { exportToBackupString } from '../utils/ledgerEngine';

interface CommandMenuProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({ activeTab, setActiveTab }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [aiInputMode, setAiInputMode] = useState(false);
  const [aiText, setAiText] = useState('');
  
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Toggle modal saat menekan Ctrl+K atau Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fokus pada input saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      setSearchQuery('');
      setAiInputMode(false);
      setAiText('');
    }
  }, [isOpen]);

  // Deteksi klik di luar modal untuk menutup
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!isOpen) return null;

  const navigateTo = (tabName: any) => {
    setActiveTab(tabName);
    setIsOpen(false);
  };

  const handleBackup = async () => {
    try {
      const backupStr = await exportToBackupString();
      const blob = new Blob([backupStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Akunta_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setIsOpen(false);
    } catch (err) {
      console.error('Gagal mencadangkan data via CMD+K:', err);
    }
  };

  const handleClearChat = async () => {
    if (window.confirm('Bersihkan semua riwayat obrolan asisten AI?')) {
      await db.chatMessages.clear();
      // Tambahkan kembali pesan sapaan awal
      await db.chatMessages.add({
        sender: 'AI',
        text: "Halo! Saya Akunta AI, asisten keuangan pribadi Anda. Ketik apa saja untuk mencatat transaksi, seperti:\n- *\"Jual kopi susu 50rb tunai\"*\n- *\"Bayar sewa ruko 3jt pakai Bank Mandiri\"*\n- *\"Tampilkan laporan laba rugi bulan ini\"*",
        timestamp: new Date().toISOString(),
      });
      setIsOpen(false);
    }
  };

  const handleSendAiCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiText.trim() || isProcessingAi) return;

    const commandText = aiText;
    setAiText('');
    setIsProcessingAi(true);

    try {
      // 1. Simpan input user ke chat log DB agar reaktif di UI Chat
      await db.chatMessages.add({
        sender: 'USER',
        text: `⚡ [Command Menu]: ${commandText}`,
        timestamp: new Date().toISOString(),
      });

      // 2. Kirim ke Gemini parser
      const aiResult = await parseInputWithGemini(commandText);

      // 3. Tulis balasan ke chat log DB
      if (aiResult.intent === 'TRANSACTION_POST' && aiResult.transaction) {
        await db.chatMessages.add({
          sender: 'AI',
          text: aiResult.explanation,
          timestamp: new Date().toISOString(),
          cardType: 'CONFIRMATION',
          cardData: aiResult.transaction,
        });
      } else {
        await db.chatMessages.add({
          sender: 'AI',
          text: aiResult.explanation,
          timestamp: new Date().toISOString(),
        });
      }
      
      // Tutup menu setelah memicu perintah
      setIsOpen(false);
    } catch (err: any) {
      console.error('Gagal memproses transaksi AI via CMD+K:', err);
      await db.chatMessages.add({
        sender: 'AI',
        text: `Gagal memproses perintah cepat: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsProcessingAi(false);
    }
  };

  // List navigasi modul
  const navItems = [
    { label: 'Buka Jurnal Umum', value: 'JURNAL', icon: <Navigation size={13} /> },
    { label: 'Buka Daftar Akun (COA)', value: 'BUKUBESAR', icon: <Navigation size={13} /> },
    { label: 'Buka Persediaan Barang', value: 'PERSEDIAAN', icon: <Navigation size={13} /> },
    { label: 'Buka Modul Aset Tetap', value: 'ASETTETAP', icon: <Navigation size={13} /> },
    { label: 'Buka Laporan Laba Rugi', value: 'LABARUGI', icon: <Navigation size={13} /> },
    { label: 'Buka Laporan Neraca', value: 'NERACA', icon: <Navigation size={13} /> },
    { label: 'Buka Bank & Perpajakan', value: 'PAJAK', icon: <Navigation size={13} /> },
  ];

  const filteredNavItems = navItems.filter(item =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(5, 5, 8, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'start',
      justifyContent: 'center',
      paddingTop: '100px',
      zIndex: 9999,
      fontFamily: 'sans-serif'
    }}>
      <div 
        ref={modalRef}
        style={{
          width: '520px',
          background: 'rgba(20, 21, 30, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {aiInputMode ? (
          /* Form Input AI */
          <form onSubmit={handleSendAiCommand} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: '8px' }}>
              <Sparkles size={14} style={{ color: 'var(--accent-primary)' }} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Tulis instruksi transaksi cepat... (e.g. Jual kopi 50rb tunai)"
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                disabled={isProcessingAi}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
              <button 
                type="button" 
                onClick={() => setAiInputMode(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer' }}
              >
                Batal
              </button>
            </div>
            <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                {isProcessingAi ? 'Sedang memproses jurnal via AI...' : 'Tekan Enter untuk memproses'}
              </span>
              <button 
                type="submit" 
                disabled={isProcessingAi || !aiText.trim()}
                className="btn btn-primary"
                style={{ padding: '3px 10px', fontSize: '11px', height: '22px' }}
              >
                Proses
              </button>
            </div>
          </form>
        ) : (
          /* Menu Pencarian Standard */
          <>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: '8px' }}>
              <Search size={14} style={{ color: 'var(--text-muted)' }} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Ketik perintah atau navigasi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
              <span style={{ fontSize: '9px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', padding: '2px 5px', borderRadius: '3px' }}>
                ESC
              </span>
            </div>

            <div style={{ maxHeight: '280px', overflowY: 'auto', padding: '6px' }}>
              
              {/* Seksi Perintah Cerdas */}
              {searchQuery === '' && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ padding: '6px 10px', fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Tindakan Pintar
                  </div>
                  <div 
                    onClick={() => setAiInputMode(true)}
                    className="cmd-menu-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Sparkles size={13} style={{ color: '#818cf8' }} />
                    <span style={{ flex: 1 }}>Tanya AI / Tulis Transaksi Cepat</span>
                    <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Mulai Chat</span>
                  </div>
                </div>
              )}

              {/* Seksi Navigasi */}
              <div>
                <div style={{ padding: '6px 10px', fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Navigasi Modul
                </div>
                {filteredNavItems.map((item) => (
                  <div 
                    key={item.value}
                    onClick={() => navigateTo(item.value)}
                    className="cmd-menu-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      background: activeTab === item.value ? 'rgba(255,255,255,0.03)' : 'transparent'
                    }}
                  >
                    <span style={{ color: activeTab === item.value ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                      {item.icon}
                    </span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {activeTab === item.value && (
                      <span style={{ fontSize: '9.5px', color: 'var(--accent-primary)', fontWeight: 600 }}>Aktif</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Seksi Backup & Utilitas */}
              {searchQuery === '' && (
                <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '8px' }}>
                  <div style={{ padding: '6px 10px', fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Sistem & Backup
                  </div>
                  
                  <div 
                    onClick={handleBackup}
                    className="cmd-menu-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Download size={13} style={{ color: 'var(--accent-success)' }} />
                    <span style={{ flex: 1 }}>Ekspor Data Cadangan (.json)</span>
                    <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Offline Backup</span>
                  </div>

                  <div 
                    onClick={handleClearChat}
                    className="cmd-menu-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Trash2 size={13} style={{ color: 'var(--accent-danger)' }} />
                    <span style={{ flex: 1 }}>Bersihkan Riwayat Obrolan AI</span>
                    <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Reset Chat</span>
                  </div>
                </div>
              )}

              {filteredNavItems.length === 0 && searchQuery !== '' && (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Tidak ada perintah atau navigasi yang cocok dengan "{searchQuery}"
                </div>
              )}
            </div>

            <div style={{
              padding: '8px 16px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '9.5px',
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.01)'
            }}>
              <span>Navigasi: Klik / Enter</span>
              <span>Buka Menu: Ctrl+K / ⌘K</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
