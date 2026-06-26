import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface Props {
  show: boolean;
  closePeriodDate: string;
  onDateChange: (val: string) => void;
  onClose: () => void;
  onProceed: () => void;
}

export const ClosePeriodModal: React.FC<Props> = ({
  show, closePeriodDate, onDateChange, onClose, onProceed,
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '450px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Jalankan Tutup Buku Periodik</h3>
          <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={onClose}>
            <X size={18} className="hover-scale" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '8px', fontSize: '11px', color: 'var(--accent-danger)', lineHeight: '1.5' }}>
            <div style={{ fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={14} />
              <span>PERINGATAN PENTING</span>
            </div>
            Proses tutup buku akan mengunci transaksi sebelum/pada tanggal penutupan. 
            Sistem akan membuat jurnal penutup otomatis untuk menolkan saldo akun Pendapatan & Beban, serta memindahkan laba bersih ke Laba Ditahan. Tindakan ini tidak dapat dibatalkan secara instan.
          </div>

          <div className="form-group">
            <label className="form-label">Tanggal Penutupan Buku</label>
            <input 
              type="date" 
              className="form-input focus-glow" 
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px', width: '100%' }} 
              value={closePeriodDate} 
              onChange={e => onDateChange(e.target.value)} 
              required 
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button className="btn btn-primary" style={{ background: 'var(--accent-primary)', color: 'black' }} onClick={onProceed}>Proses Tutup Buku</button>
          </div>
        </div>
      </div>
    </div>
  );
};
