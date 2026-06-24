import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { generateTrialBalance } from '../../utils/ledgerEngine';
import type { TrialBalanceReport } from '../../types/ledger';
import { FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

export const TrialBalance: React.FC = () => {
  const [report, setReport] = useState<TrialBalanceReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const data = await generateTrialBalance();
      setReport(data);
    } catch (err) {
      console.error('Gagal memuat Trial Balance:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    let unlistenFn: (() => void) | undefined;

    const setupListener = async () => {
      unlistenFn = await listen('db-update', () => {
        if (active) {
          fetchReport();
        }
      });
    };

    fetchReport();
    setupListener();

    return () => {
      active = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const handleExportExcel = () => {
    if (!report) return;
    const dataToExport = report.items.map(item => ({
      'Kode Akun': item.code,
      'Nama Akun': item.name,
      'Tipe Akun': item.type,
      'Debit (Rp)': item.debit,
      'Kredit (Rp)': item.credit
    }));

    // Tambah baris total
    dataToExport.push({
      'Kode Akun': 'TOTAL',
      'Nama Akun': '',
      'Tipe Akun': '',
      'Debit (Rp)': report.totalDebit,
      'Kredit (Rp)': report.totalCredit
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance');
    XLSX.writeFile(wb, `Akunta_TrialBalance_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (isLoading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Memuat Neraca Saldo...</div>;
  }

  if (!report) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Gagal memuat data Neraca Saldo.</div>;
  }

  const isBalanced = Math.abs(report.totalDebit - report.totalCredit) < 0.01;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Neraca Saldo (Trial Balance)</h3>
          <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            Ringkasan saldo debit dan kredit dari seluruh akun COA pada periode berjalan.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={handleExportExcel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FileSpreadsheet size={12} />
          <span>Ekspor Excel</span>
        </button>
      </div>

      {/* Indikator Balance */}
      <div style={{
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        background: isBalanced ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
        border: `1px solid ${isBalanced ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
        fontSize: '12px',
        color: isBalanced ? 'var(--accent-success)' : 'var(--accent-danger)',
        fontWeight: 600
      }}>
        {isBalanced 
          ? '✓ Status: Neraca Saldo Seimbang (Balanced)' 
          : '⚠ Peringatan: Total Debit dan Total Kredit tidak seimbang! Cek kembali jurnal yang tidak balance.'}
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '120px' }}>Kode Akun</th>
              <th>Nama Akun</th>
              <th>Tipe Akun</th>
              <th style={{ textAlign: 'right', width: '150px' }}>Debit (Rp)</th>
              <th style={{ textAlign: 'right', width: '150px' }}>Kredit (Rp)</th>
            </tr>
          </thead>
          <tbody>
            {report.items.map(item => (
              <tr key={item.code}>
                <td><strong>{item.code}</strong></td>
                <td>{item.name}</td>
                <td><span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.type}</span></td>
                <td style={{ textAlign: 'right' }}>
                  {item.debit > 0 ? `Rp ${item.debit.toLocaleString('id-ID')}` : '-'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {item.credit > 0 ? `Rp ${item.credit.toLocaleString('id-ID')}` : '-'}
                </td>
              </tr>
            ))}
            <tr style={{ background: 'rgba(255,255,255,0.02)', fontWeight: 700, borderTop: '2px solid var(--border-color)' }}>
              <td colSpan={3} style={{ textTransform: 'uppercase' }}>TOTAL</td>
              <td style={{ textAlign: 'right', color: isBalanced ? 'var(--text-primary)' : 'var(--accent-danger)' }}>
                Rp {report.totalDebit.toLocaleString('id-ID')}
              </td>
              <td style={{ textAlign: 'right', color: isBalanced ? 'var(--text-primary)' : 'var(--accent-danger)' }}>
                Rp {report.totalCredit.toLocaleString('id-ID')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
