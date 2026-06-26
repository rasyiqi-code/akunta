import React from 'react';
import { X } from 'lucide-react';

interface StockTakeItem {
  productId: string;
  systemQty: number;
  physicalQty: number;
  cost: number;
}

interface Props {
  show: boolean;
  products: any[];
  newStockTakeItems: StockTakeItem[];
  onItemsChange: (items: StockTakeItem[]) => void;
  onClose: () => void;
  onSaved: (e: React.FormEvent) => void;
}

export const StockTakeModal: React.FC<Props> = ({
  show, products, newStockTakeItems,
  onItemsChange, onClose, onSaved,
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Stock Opname Fisik Baru</h3>
          <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={onClose}>
            <X size={18} className="hover-scale" />
          </button>
        </div>
        <form onSubmit={onSaved} className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Isi kuantitas riil hasil perhitungan fisik di gudang. Selisih akan menjurnal otomatis.
          </div>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '45vh' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <th style={{ padding: '8px' }}>Nama Barang</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>Stok Sistem</th>
                  <th style={{ textAlign: 'right', width: '120px', padding: '8px' }}>Stok Fisik</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>Selisih</th>
                </tr>
              </thead>
              <tbody>
                {newStockTakeItems.map((item, index) => {
                  const prodName = products.find(p => p.id === item.productId)?.name || item.productId;
                  const diff = item.physicalQty - item.systemQty;
                  return (
                    <tr key={item.productId} className="cmd-menu-item">
                      <td style={{ padding: '8px' }}>{prodName}</td>
                      <td style={{ textAlign: 'right', padding: '8px' }}>{item.systemQty} Unit</td>
                      <td style={{ textAlign: 'right', padding: '8px' }}>
                        <input
                          type="number"
                          className="form-input focus-glow"
                          style={{ width: '90px', textAlign: 'right', display: 'inline-block', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '4px 6px', borderRadius: '4px' }}
                          value={item.physicalQty}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            const updated = [...newStockTakeItems];
                            updated[index].physicalQty = val;
                            onItemsChange(updated);
                          }}
                        />
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px', color: diff === 0 ? 'var(--text-primary)' : diff > 0 ? 'var(--accent-success)' : 'var(--accent-danger)', fontWeight: 600 }}>
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px', marginTop: '4px' }}>
            <button type="button" className="btn btn-secondary hover-scale" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary hover-scale">Post Hasil Opname</button>
          </div>
        </form>
      </div>
    </div>
  );
};
