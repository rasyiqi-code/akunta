import React from 'react';
import { X } from 'lucide-react';

interface Props {
  show: boolean;
  selectedAsset: any;
  disposalDate: string;
  disposalValue: number;
  onDateChange: (val: string) => void;
  onValueChange: (val: number) => void;
  onClose: () => void;
  onSaved: (e: React.FormEvent) => void;
}

export const DisposalModal: React.FC<Props> = ({
  show, selectedAsset, disposalDate, disposalValue,
  onDateChange, onValueChange, onClose, onSaved,
}) => {
  if (!show || !selectedAsset) return null;

  return (
    <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Pelepasan / Penjualan Aset</h3>
          <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={onClose}>
            <X size={18} className="hover-scale" />
          </button>
        </div>
        <form onSubmit={onSaved} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            Aset: <strong>{selectedAsset.name}</strong><br/>
            Nilai Buku: <strong>Rp {(selectedAsset.cost - selectedAsset.accumulatedDepreciation).toLocaleString('id-ID')}</strong>
          </div>
          <div className="form-group">
            <label className="form-label">Tanggal Pelepasan</label>
            <input type="date" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} value={disposalDate} onChange={e => onDateChange(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Nilai Jual / Pelepasan (Rp)</label>
            <input type="number" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: 5000000 (isi 0 jika dibuang)" value={disposalValue} onChange={e => onValueChange(parseFloat(e.target.value) || 0)} required />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <button type="button" className="btn btn-secondary hover-scale" onClick={onClose}>Batal</button>
            <button type="submit" style={{ background: 'var(--accent-danger)', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600', boxShadow: '0 4px 12px rgba(225, 28, 40, 0.25)' }} className="hover-scale">Post Pelepasan</button>
          </div>
        </form>
      </div>
    </div>
  );
};
