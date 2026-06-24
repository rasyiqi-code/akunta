import { useState, useEffect } from 'react';
import { Sparkles, BarChart2, Sun, Moon } from 'lucide-react';
import { initializeDatabase } from './utils/db';
import { WarRoom } from './components/AssistantMode/WarRoom';
import { ChatInterface } from './components/AssistantMode/ChatInterface';
import { LedgerDashboard } from './components/AccountantMode/LedgerDashboard';

function App() {
  const [activeTab, setActiveTab] = useState<'JURNAL' | 'BUKUBESAR' | 'LABARUGI' | 'NERACA' | 'PAJAK' | 'PERSEDIAAN'>('JURNAL');
  const [isLightMode, setIsLightMode] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);

  // Inisialisasi Database Lokal pada saat mount
  useEffect(() => {
    const init = async () => {
      try {
        await initializeDatabase();
        setIsDbReady(true);
      } catch (err) {
        console.error('Gagal inisialisasi database:', err);
      }
    };
    init();
  }, []);

  // Ubah Tema Aplikasi (Dark/Light)
  const toggleTheme = () => {
    const nextTheme = !isLightMode;
    setIsLightMode(nextTheme);
    if (nextTheme) {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  };

  if (!isDbReady) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#090a0f',
        color: '#f3f4f6',
        fontFamily: 'sans-serif'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid rgba(255, 255, 255, 0.1)',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '16px'
        }}></div>
        <h3>Menginisialisasi Akunta Ledger...</h3>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header Utama */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">A</div>
          <span className="logo-text">AKUNTA</span>
          <span className="logo-tag">Desktop MVP</span>
        </div>

        <div className="header-actions">
          <button className="btn btn-secondary btn-circle" onClick={toggleTheme} title="Ganti Tema">
            {isLightMode ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </header>

      {/* Split Workspace */}
      <div className="workspace-container">
        
        {/* Panel Kiri: Mode Asisten (Dashboard War Room + Chat) */}
        <div className="split-panel panel-assistant" style={{ flex: '0 0 45%', minWidth: '400px' }}>
          <div className="panel-header">
            <div className="panel-title">
              <Sparkles size={16} style={{ color: 'var(--accent-primary)' }} />
              <span>💬 Mode Asisten (AI Naratif)</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {/* Setengah Atas: War Room (Dashboard) */}
            <div style={{ flex: '0 0 45%', overflowY: 'auto', borderBottom: '1px solid var(--border-color)' }}>
              <WarRoom />
            </div>
            {/* Setengah Bawah: Chat Interface */}
            <div style={{ flex: '0 0 55%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ChatInterface onReportRequested={(report) => {
                if (report === 'PIUTANG') {
                  setActiveTab('PAJAK');
                } else {
                  setActiveTab(report);
                }
              }} />
            </div>
          </div>
        </div>

        {/* Panel Kanan: Mode Akuntan (Tabel Grid & Laporan Keuangan) */}
        <div className="split-panel panel-accountant">
          <div className="panel-header">
            <div className="panel-title">
              <BarChart2 size={16} style={{ color: 'var(--accent-secondary)' }} />
              <span>🔧 Mode Akuntan (Ledger & Audit)</span>
            </div>
          </div>
          
          <LedgerDashboard activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>

      </div>
    </div>
  );
}

export default App;
