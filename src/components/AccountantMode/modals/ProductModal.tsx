import React from 'react';
import { X } from 'lucide-react';

interface Props {
  show: boolean;
  productName: string;
  productSku: string;
  productPrice: number;
  editingProduct: any | null;
  onNameChange: (val: string) => void;
  onSkuChange: (val: string) => void;
  onPriceChange: (val: number) => void;
  onClose: () => void;
  onSaved: (e: React.FormEvent) => void;
}

export const ProductModal: React.FC<Props> = ({
  show, productName, productSku, productPrice, editingProduct,
  onNameChange, onSkuChange, onPriceChange,
  onClose, onSaved,
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
            {editingProduct ? 'Edit Produk' : 'Tambah Produk Baru'}
          </h3>
          <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={onClose}>
            <X size={18} className="hover-scale" />
          </button>
        </div>
        <form onSubmit={onSaved} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">Nama Produk</label>
            <input type="text" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: Kopi Arabika Lintong" value={productName} onChange={e => onNameChange(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">SKU Produk</label>
            <input type="text" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: KOPI-LNTG" value={productSku} onChange={e => onSkuChange(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Harga Jual per Unit (Rp)</label>
            <input type="number" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: 65000" value={productPrice || ''} onChange={e => onPriceChange(parseFloat(e.target.value) || 0)} required />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <button type="button" className="btn btn-secondary hover-scale" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary hover-scale">{editingProduct ? 'Simpan Perubahan' : 'Simpan Produk'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
