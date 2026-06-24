import { useState, useEffect } from 'react';
import { 
  Sparkles, BookOpen, List, FileText, Layers, 
  Settings, Sun, Moon, ChevronRight, Sidebar
} from 'lucide-react';
import { initializeDatabase } from './utils/db';
import { WarRoom } from './components/AssistantMode/WarRoom';
import { ChatInterface } from './components/AssistantMode/ChatInterface';
import { LedgerDashboard } from './components/AccountantMode/LedgerDashboard';

type ModuleTab = 'JURNAL' | 'BUKUBESAR' | 'PERSEDIAAN' | 'LABARUGI' | 'NERACA' | 'PAJAK';

function App() {
  const [activeTab, setActiveTab] = useState<ModuleTab>('JURNAL');
  const [isLightMode, setIsLightMode] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);
  const [showPreviewPane, setShowPreviewPane] = useState(true);

  // Inisialisasi Database
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

  // Toggle Tema
  const toggleTheme = () => {
    const nextTheme = !isLightMode;
    setIsLightMode(nextTheme);
    if (nextTheme) {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  };

  // Label Breadcrumbs berdasarkan tab aktif
  const getTabLabel = (tab: ModuleTab) => {
    switch(tab) {
      case 'JURNAL': return 'Jurnal Umum';
      case 'BUKUBESAR': return 'Daftar Akun (COA)';
      case 'PERSEDIAAN': return 'Persediaan';
      case 'LABARUGI': return 'Laporan Laba Rugi';
      case 'NERACA': return 'Laporan Neraca';
      case 'PAJAK': return 'Bank & Perpajakan';
      default: return 'Modul';
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
          width: '24px',
          height: '24px',
          border: '2px solid rgba(255, 255, 255, 0.1)',
          borderTopColor: '#4f46e5',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '12px'
        }}></div>
        <h4 style={{ fontSize: '12px' }}>Menginisialisasi Akunta Ledger...</h4>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header Utama (Sangat Ramping) */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">A</div>
          <span className="logo-text">AKUNTA</span>
          <span className="logo-tag">Windows Layout</span>
        </div>

        <div className="header-actions">
          <button className="btn btn-secondary btn-circle" style={{ width: '24px', height: '24px' }} onClick={toggleTheme} title="Ganti Tema">
            {isLightMode ? <Moon size={13} /> : <Sun size={13} />}
          </button>
        </div>
      </header>

      {/* Split Workspace */}
      <div className="workspace-container">
        
        {/* PANEL KIRI: Navigation Pane (Windows Explorer Style) */}
        <aside className="sidebar-pane">
          <div>
            <div className="sidebar-section-title">Navigasi Utama</div>
            <nav className="sidebar-menu">
              <div 
                className={`sidebar-item ${activeTab === 'JURNAL' ? 'active' : ''}`}
                onClick={() => setActiveTab('JURNAL')}
              >
                <BookOpen size={13} />
                <span>Jurnal Umum</span>
              </div>
              
              <div 
                className={`sidebar-item ${activeTab === 'BUKUBESAR' ? 'active' : ''}`}
                onClick={() => setActiveTab('BUKUBESAR')}
              >
                <List size={13} />
                <span>Daftar Akun (COA)</span>
              </div>

              <div 
                className={`sidebar-item ${activeTab === 'PERSEDIAAN' ? 'active' : ''}`}
                onClick={() => setActiveTab('PERSEDIAAN')}
              >
                <Layers size={13} />
                <span>Persediaan</span>
              </div>
            </nav>

            <div className="sidebar-section-title" style={{ marginTop: '12px' }}>Laporan Keuangan</div>
            <nav className="sidebar-menu">
              <div 
                className={`sidebar-item ${activeTab === 'LABARUGI' ? 'active' : ''}`}
                onClick={() => setActiveTab('LABARUGI')}
              >
                <FileText size={13} />
                <span>Laba Rugi</span>
              </div>

              <div 
                className={`sidebar-item ${activeTab === 'NERACA' ? 'active' : ''}`}
                onClick={() => setActiveTab('NERACA')}
              >
                <FileText size={13} />
                <span>Neraca</span>
              </div>

              <div 
                className={`sidebar-item ${activeTab === 'PAJAK' ? 'active' : ''}`}
                onClick={() => setActiveTab('PAJAK')}
              >
                <Settings size={13} />
                <span>Bank & Pajak</span>
              </div>
            </nav>
          </div>

          <div style={{ padding: '0 12px 6px 12px', fontSize: '9.5px', color: 'var(--text-muted)' }}>
            System Offline-First
          </div>
        </aside>

        {/* PANEL TENGAH: Content Pane (Tabel & Grid Laporan) */}
        <main className="main-content-pane">
          {/* Command Bar (Breadcrumbs & Toggle Pane) */}
          <div className="command-bar">
            <div className="breadcrumbs">
              <span>Akunta</span>
              <span className="separator"><ChevronRight size={10} /></span>
              <span className="active-path">{getTabLabel(activeTab)}</span>
            </div>
            
            <div className="command-actions">
              <button 
                className={`btn ${showPreviewPane ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '3px 8px' }}
                onClick={() => setShowPreviewPane(!showPreviewPane)}
                title="Toggle Asisten AI (Preview Pane)"
              >
                <Sidebar size={12} />
                <span>{showPreviewPane ? 'Sembunyikan AI' : 'Tampilkan AI'}</span>
              </button>
            </div>
          </div>

          <LedgerDashboard activeTab={activeTab} />
        </main>

        {/* PANEL KANAN: Preview Pane (Asisten AI - War Room & Chat) */}
        <aside className={`preview-assistant-pane ${showPreviewPane ? '' : 'collapsed'}`}>
          <div className="panel-header" style={{ background: 'transparent' }}>
            <div className="panel-title">
              <Sparkles size={12} style={{ color: 'var(--accent-primary)' }} />
              <span>Preview Pane: Asisten AI</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {/* Bagian Atas: War Room (Dashboard Ringkas) */}
            <div style={{ flex: '0 0 45%', overflowY: 'auto', borderBottom: '1px solid var(--border-color)' }}>
              <WarRoom />
            </div>
            {/* Bagian Bawah: Chat Interface */}
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
        </aside>

      </div>
    </div>
  );
}

export default App;
