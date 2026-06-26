import React from 'react';
import { X } from 'lucide-react';

interface Props {
  show: boolean;
  assetName: string;
  assetCost: number;
  assetLifeYears: number;
  assetSalvage: number;
  assetPurchaseDate: string;
  editingAsset: any | null;
  onNameChange: (val: string) => void;
  onCostChange: (val: number) => void;
  onLifeYearsChange: (val: number) => void;
  onSalvageChange: (val: number) => void;
  onPurchaseDateChange: (val: string) => void;
  onClose: () => void;
  onSaved: (e: React.FormEvent) => void;
}

export const AssetModal: React.FC<Props> = ({
  show, assetName, assetCost, assetLifeYears, assetSalvage, assetPurchaseDate, editingAsset,
  onNameChange, onCostChange, onLifeYearsChange, onSalvageChange, onPurchaseDateChange,
  onClose, onSaved,
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '420px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
            {editingAsset ? 'Edit Aset Tetap' : 'Tambah Aset Tetap Baru'}
          </h3>
          <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={onClose}>
            <X size={18} className="hover-scale" />
          </button>
        </div>
        <form onSubmit={onSaved} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">Nama Aset Tetap</label>
            <input type="text" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: Mesin Espresso, Komputer Kasir" value={assetName} onChange={e => onNameChange(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Tanggal Pembelian</label>
            <input type="date" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} value={assetPurchaseDate} onChange={e => onPurchaseDateChange(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Harga Perolehan (Rp)</label>
            <input type="number" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: 15000000" value={assetCost || ''} onChange={e => onCostChange(parseFloat(e.target.value) || 0)} required />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Umur Ekonomis (Thn)</label>
              <input type="number" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: 5" value={assetLifeYears || ''} onChange={e => onLifeYearsChange(parseInt(e.target.value) || 0)} required />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Residu / Sisa (Rp)</label>
              <input type="number" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: 3000000" value={assetSalvage || ''} onChange={e => onSalvageChange(parseFloat(e.target.value) || 0)} required />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <button type="button" className="btn btn-secondary hover-scale" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary hover-scale">{editingAsset ? 'Simpan Perubahan' : 'Simpan Aset'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
