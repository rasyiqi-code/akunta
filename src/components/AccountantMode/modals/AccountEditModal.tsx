import React from 'react';
import { X } from 'lucide-react';
import { db } from '../../../utils/db';
import type { Account } from '../../../types/ledger';

interface Props {
  show: boolean;
  editingAccount: Account | null;
  onClose: () => void;
  onSaved: () => void;
}

export const AccountEditModal: React.FC<Props> = ({ show, editingAccount, onClose, onSaved }) => {
  if (!show) return null;

  return (
    <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '450px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
            {editingAccount ? `Edit Akun: ${editingAccount.code}` : 'Tambah Akun Baru'}
          </h3>
          <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={onClose}>
            <X size={18} className="hover-scale" />
          </button>
        </div>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const formData = new FormData(form);
          const account = {
            code: (formData.get('code') as string).trim(),
            name: (formData.get('name') as string).trim(),
            type: formData.get('type') as string,
            normalBalance: formData.get('normalBalance') as string,
          };
          await db.accounts.put(account as any);
          onClose();
          onSaved();
        }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">Kode Akun</label>
            <input name="code" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} defaultValue={editingAccount?.code || ''} required placeholder="contoh: 1106" />
          </div>
          <div className="form-group">
            <label className="form-label">Nama Akun</label>
            <input name="name" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} defaultValue={editingAccount?.name || ''} required placeholder="contoh: Kas Kecil" />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Tipe Akun</label>
              <select name="type" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} defaultValue={editingAccount?.type || 'ASET'} required>
                <option value="ASET">ASET</option>
                <option value="KEWAJIBAN">KEWAJIBAN</option>
                <option value="EKUITAS">EKUITAS</option>
                <option value="PENDAPATAN">PENDAPATAN</option>
                <option value="BEBAN">BEBAN</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Saldo Normal</label>
              <select name="normalBalance" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} defaultValue={editingAccount?.normalBalance || 'D'} required>
                <option value="D">DEBIT</option>
                <option value="K">KREDIT</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <button type="button" className="btn btn-secondary hover-scale" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary hover-scale">Simpan Akun</button>
          </div>
        </form>
      </div>
    </div>
  );
};