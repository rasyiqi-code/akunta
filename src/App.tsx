import { useState, useEffect } from 'react';
import { 
  Sparkles, BookOpen, List, FileText, Layers, 
  Settings, Sun, Moon, ChevronRight, Sidebar
} from 'lucide-react';
import { initializeDatabase } from './utils/db';
import { WarRoom } from './components/AssistantMode/WarRoom';
import { ChatInterface } from './components/AssistantMode/ChatInterface';
import { LedgerDashboard } from './components/AccountantMode/LedgerDashboard';
import { TitleBar } from './components/TitleBar';

type ModuleTab = 'JURNAL' | 'BUKUBESAR' | 'PERSEDIAAN' | 'LABARUGI' | 'NERACA' | 'PAJAK';

function App() {
  const [activeTab, setActiveTab] = useState<ModuleTab>('JURNAL');
  const [isLightMode, setIsLightMode] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);
  const [showPreviewPane, setShowPreviewPane] = useState(true);
  const [previewTab, setPreviewTab] = useState<'WARROOM' | 'CHAT'>('WARROOM');

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
      <TitleBar />
      {/* Split Workspace */}
      <div className="workspace-container">
        
        {/* PANEL KIRI: Navigation Pane (Windows/GNOME Explorer Style) */}
        <aside className="sidebar-pane">
          <div>
            {/* Logo Section disatukan ke Sidebar Kiri */}
            <div className="logo-section" style={{ padding: '2px 8px 10px 8px', borderBottom: '1px solid var(--border-color)', marginBottom: '8px' }}>
              <div className="logo-icon">A</div>
              <span className="logo-text">AKUNTA</span>
              <span className="logo-tag">Desktop</span>
            </div>

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

          {/* Theme Toggle & System Info disatukan ke Bawah Sidebar */}
          <div style={{ 
            padding: '6px 8px 0 8px', 
            borderTop: '1px solid var(--border-color)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            fontSize: '9px', 
            color: 'var(--text-muted)' 
          }}>
            <span>Offline-First</span>
            <button 
              className="chat-action-btn" 
              style={{ margin: 0, width: '18px', height: '18px' }} 
              onClick={toggleTheme} 
              title="Ganti Tema"
            >
              {isLightMode ? <Moon size={11} /> : <Sun size={11} />}
            </button>
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
                className="btn btn-secondary"
                style={{ padding: '3px 8px' }}
                onClick={() => setShowPreviewPane(!showPreviewPane)}
                title="Toggle Asisten AI (Preview Pane)"
              >
                <Sidebar size={12} style={{ color: showPreviewPane ? 'var(--accent-primary)' : 'var(--text-secondary)' }} />
                <span>Asisten AI</span>
              </button>
            </div>
          </div>

          <LedgerDashboard activeTab={activeTab} />
        </main>

        {/* PANEL KANAN: Preview Pane (Asisten AI - War Room ATAU Chat) */}
        <aside className={`preview-assistant-pane ${showPreviewPane ? '' : 'collapsed'}`}>
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="panel-title">
              <Sparkles size={12} style={{ color: 'var(--accent-primary)' }} />
              <span>Asisten AI</span>
            </div>
            
            {/* Switch Tab Kecil ala Enterprise */}
            <div className="tab-switcher">
              <button 
                className={`tab-switcher-btn ${previewTab === 'WARROOM' ? 'active' : ''}`}
                onClick={() => setPreviewTab('WARROOM')}
              >
                Ringkasan
              </button>
              <button 
                className={`tab-switcher-btn ${previewTab === 'CHAT' ? 'active' : ''}`}
                onClick={() => setPreviewTab('CHAT')}
              >
                Chat AI
              </button>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {previewTab === 'WARROOM' ? (
              <WarRoom />
            ) : (
              <ChatInterface onReportRequested={(report) => {
                if (report === 'PIUTANG') {
                  setActiveTab('PAJAK');
                } else {
                  setActiveTab(report);
                }
              }} />
            )}
          </div>
        </aside>

      </div>
    </div>
  );
}

export default App;
