import React from 'react';
import { X } from 'lucide-react';
import { postJournalEntry } from '../../../utils/ledgerEngine';
import type { Account } from '../../../types/ledger';

interface JournalLine {
  accountCode: string;
  debit: number;
  credit: number;
}

interface Props {
  show: boolean;
  editingJournal: any | null;
  accounts: Account[];
  jurnalDate: string;
  jurnalDesc: string;
  jurnalLines: JournalLine[];
  onClose: () => void;
  onDateChange: (val: string) => void;
  onDescChange: (val: string) => void;
  onLinesChange: (lines: JournalLine[]) => void;
  onSaved: () => void;
}

export const JournalEntryModal: React.FC<Props> = ({
  show, editingJournal, accounts,
  jurnalDate, jurnalDesc, jurnalLines,
  onClose, onDateChange, onDescChange, onLinesChange, onSaved,
}) => {
  if (!show) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const filteredLines = jurnalLines
        .filter(l => l.accountCode !== '')
        .map(l => ({
          accountCode: l.accountCode,
          debit: parseFloat(String(l.debit)) || 0,
          credit: parseFloat(String(l.credit)) || 0,
        }));
      if (filteredLines.length < 2) {
        alert('Jurnal minimal memiliki 2 baris akun.');
        return;
      }
      await postJournalEntry({
        id: editingJournal?.id,
        date: jurnalDate,
        description: jurnalDesc,
        lines: filteredLines,
      });
      onClose();
      onSaved();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const addLine = () => {
    onLinesChange([...jurnalLines, { accountCode: '', debit: 0, credit: 0 }]);
  };

  const removeLine = (index: number) => {
    if (jurnalLines.length <= 2) return;
    onLinesChange(jurnalLines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof JournalLine, value: any) => {
    const updated = [...jurnalLines];
    (updated[index] as any)[field] = value;
    onLinesChange(updated);
  };

  const totalDebit = jurnalLines.reduce((s, l) => s + (parseFloat(String(l.debit)) || 0), 0);
  const totalCredit = jurnalLines.reduce((s, l) => s + (parseFloat(String(l.credit)) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '550px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
            {editingJournal ? 'Edit Jurnal' : 'Catat Jurnal Manual'}
          </h3>
          <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={onClose}>
            <X size={18} className="hover-scale" />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Tanggal</label>
              <input type="date" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} value={jurnalDate} onChange={e => onDateChange(e.target.value)} required />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Keterangan Jurnal</label>
              <input type="text" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: Penyesuaian akhir bulan" value={jurnalDesc} onChange={e => onDescChange(e.target.value)} required />
            </div>
          </div>

          <div style={{ marginBottom: '4px', fontWeight: 600, fontSize: '11px', color: 'var(--text-secondary)' }}>
            Rincian Akun (Debit/Kredit harus seimbang)
          </div>

          {jurnalLines.map((line, index) => (
            <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '4px', alignItems: 'center' }}>
              <select
                className="form-input focus-glow"
                style={{ flex: 2, background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }}
                value={line.accountCode}
                onChange={e => updateLine(index, 'accountCode', e.target.value)}
                required
              >
                <option value="">Pilih Akun...</option>
                {accounts.map(a => (
                  <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                ))}
              </select>
              <input
                type="number"
                className="form-input focus-glow"
                style={{ flex: 1, textAlign: 'right', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }}
                placeholder="Debit"
                value={line.debit || ''}
                onChange={e => updateLine(index, 'debit', e.target.value)}
              />
              <input
                type="number"
                className="form-input focus-glow"
                style={{ flex: 1, textAlign: 'right', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }}
                placeholder="Kredit"
                value={line.credit || ''}
                onChange={e => updateLine(index, 'credit', e.target.value)}
              />
              {jurnalLines.length > 2 && (
                <button type="button" onClick={() => removeLine(index)} style={{ background: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: '4px', color: 'var(--accent-danger)', cursor: 'pointer', padding: '4px 6px', fontSize: '12px' }}>
                  ✕
                </button>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
            <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={addLine}>
              + Tambah Baris
            </button>
            <div style={{ fontFamily: 'monospace', fontWeight: 600, color: isBalanced ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
              {isBalanced ? '✓ Balance' : `⛭ Selisih Rp ${(totalDebit - totalCredit).toLocaleString('id-ID')}`}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <button type="button" className="btn btn-secondary hover-scale" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary hover-scale" disabled={!isBalanced}>Simpan Jurnal</button>
          </div>
        </form>
      </div>
    </div>
  );
};