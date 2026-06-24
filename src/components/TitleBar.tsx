import { useEffect, useState } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [appWindow, setAppWindow] = useState<any>(null);

  useEffect(() => {
    try {
      const win = getCurrentWindow();
      setAppWindow(win);

      // Cek status maximize di awal
      win.isMaximized().then(setIsMaximized).catch(console.error);

      // Listen perubahan status maximize
      const unlisten = win.onResized(async () => {
        const maximized = await win.isMaximized();
        setIsMaximized(maximized);
      });

      return () => {
        unlisten.then(fn => fn());
      };
    } catch (e) {
      console.warn('Tauri API tidak tersedia. Berjalan di browser?', e);
    }
  }, []);

  const handleMinimize = async () => {
    if (appWindow) {
      try {
        await appWindow.minimize();
      } catch (err) {
        console.error('Gagal minimize:', err);
      }
    }
  };

  const handleToggleMaximize = async () => {
    if (appWindow) {
      try {
        await appWindow.toggleMaximize();
      } catch (err) {
        console.error('Gagal toggle maximize:', err);
      }
    }
  };

  const handleClose = async () => {
    if (appWindow) {
      try {
        await appWindow.close();
      } catch (err) {
        console.error('Gagal close:', err);
      }
    }
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-drag-area" data-tauri-drag-region>
        <div className="titlebar-logo" data-tauri-drag-region>
          <span className="logo-dot"></span>
          <span data-tauri-drag-region>Akunta</span>
        </div>
        <div className="titlebar-title" data-tauri-drag-region>
          Akunta - Dua Muka
        </div>
      </div>
      
      <div className="titlebar-controls">
        <button 
          className="titlebar-btn minimize" 
          onClick={handleMinimize}
          title="Minimize"
        >
          <Minus size={11} />
        </button>
        <button 
          className="titlebar-btn maximize" 
          onClick={handleToggleMaximize}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Copy size={9} style={{ transform: 'rotate(180deg)' }} /> : <Square size={9} />}
        </button>
        <button 
          className="titlebar-btn close" 
          onClick={handleClose}
          title="Tutup"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}
