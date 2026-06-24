import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { generateCashFlow } from '../../utils/ledgerEngine';
import type { CashFlowReport } from '../../types/ledger';
import { FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

export const CashFlow: React.FC = () => {
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const data = await generateCashFlow();
      setReport(data);
    } catch (err) {
      console.error('Gagal memuat Laporan Arus Kas:', err);
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
    const dataToExport: any[] = [];

    // Aktivitas Operasional
    dataToExport.push({ 'Aktivitas': 'ARUS KAS DARI AKTIVITAS OPERASIONAL', 'Keterangan': '', 'Jumlah (Rp)': '' });
    report.operatingReceipts.forEach(r => {
      dataToExport.push({ 'Aktivitas': '', 'Keterangan': `Penerimaan: ${r.description}`, 'Jumlah (Rp)': r.amount });
    });
    report.operatingPayments.forEach(p => {
      dataToExport.push({ 'Aktivitas': '', 'Keterangan': `Pengeluaran: ${p.description}`, 'Jumlah (Rp)': -p.amount });
    });
    dataToExport.push({ 'Aktivitas': 'Total Arus Kas Operasional', 'Keterangan': '', 'Jumlah (Rp)': report.totalOperating });

    // Aktivitas Investasi
    dataToExport.push({ 'Aktivitas': '', 'Keterangan': '', 'Jumlah (Rp)': '' });
    dataToExport.push({ 'Aktivitas': 'ARUS KAS DARI AKTIVITAS INVESTASI', 'Keterangan': '', 'Jumlah (Rp)': '' });
    report.investingReceipts.forEach(r => {
      dataToExport.push({ 'Aktivitas': '', 'Keterangan': `Penerimaan: ${r.description}`, 'Jumlah (Rp)': r.amount });
    });
    report.investingPayments.forEach(p => {
      dataToExport.push({ 'Aktivitas': '', 'Keterangan': `Pengeluaran: ${p.description}`, 'Jumlah (Rp)': -p.amount });
    });
    dataToExport.push({ 'Aktivitas': 'Total Arus Kas Investasi', 'Keterangan': '', 'Jumlah (Rp)': report.totalInvesting });

    // Aktivitas Pendanaan
    dataToExport.push({ 'Aktivitas': '', 'Keterangan': '', 'Jumlah (Rp)': '' });
    dataToExport.push({ 'Aktivitas': 'ARUS KAS DARI AKTIVITAS PENDANAAN', 'Keterangan': '', 'Jumlah (Rp)': '' });
    report.financingReceipts.forEach(r => {
      dataToExport.push({ 'Aktivitas': '', 'Keterangan': `Penerimaan: ${r.description}`, 'Jumlah (Rp)': r.amount });
    });
    report.financingPayments.forEach(p => {
      dataToExport.push({ 'Aktivitas': '', 'Keterangan': `Pengeluaran: ${p.description}`, 'Jumlah (Rp)': -p.amount });
    });
    dataToExport.push({ 'Aktivitas': 'Total Arus Kas Pendanaan', 'Keterangan': '', 'Jumlah (Rp)': report.totalFinancing });

    // Rekapitulasi Kas
    dataToExport.push({ 'Aktivitas': '', 'Keterangan': '', 'Jumlah (Rp)': '' });
    dataToExport.push({ 'Aktivitas': 'Kenaikan / (Penurunan) Bersih Kas', 'Keterangan': '', 'Jumlah (Rp)': report.netIncrease });
    dataToExport.push({ 'Aktivitas': 'Saldo Kas Awal Periode', 'Keterangan': '', 'Jumlah (Rp)': report.startBalance });
    dataToExport.push({ 'Aktivitas': 'Saldo Kas Akhir Periode', 'Keterangan': '', 'Jumlah (Rp)': report.endBalance });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cash Flow');
    XLSX.writeFile(wb, `Akunta_CashFlow_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (isLoading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Memuat Laporan Arus Kas...</div>;
  }

  if (!report) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Gagal memuat data Laporan Arus Kas.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Laporan Arus Kas (Metode Langsung)</h3>
          <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            Laporan penerimaan dan pengeluaran kas yang diklasifikasikan ke aktivitas operasional, investasi, dan pendanaan.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={handleExportExcel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FileSpreadsheet size={12} />
          <span>Ekspor Excel</span>
        </button>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Aktivitas & Rincian Transaksi Kas</th>
              <th style={{ textAlign: 'right', width: '200px' }}>Nilai (Rp)</th>
            </tr>
          </thead>
          <tbody>
            {/* 1. OPERASIONAL */}
            <tr style={{ background: 'rgba(255,255,255,0.01)', fontWeight: 600 }}>
              <td colSpan={2}>ARUS KAS DARI AKTIVITAS OPERASIONAL</td>
            </tr>
            {report.operatingReceipts.map((r, i) => (
              <tr key={`op-rec-${i}`}>
                <td style={{ paddingLeft: '24px', color: 'var(--text-secondary)' }}>Penerimaan: {r.description}</td>
                <td style={{ textAlign: 'right', color: 'var(--accent-success)' }}>Rp {r.amount.toLocaleString('id-ID')}</td>
              </tr>
            ))}
            {report.operatingPayments.map((p, i) => (
              <tr key={`op-pay-${i}`}>
                <td style={{ paddingLeft: '24px', color: 'var(--text-secondary)' }}>Pengeluaran: {p.description}</td>
                <td style={{ textAlign: 'right', color: 'var(--accent-danger)' }}>-Rp {p.amount.toLocaleString('id-ID')}</td>
              </tr>
            ))}
            {report.operatingReceipts.length === 0 && report.operatingPayments.length === 0 && (
              <tr>
                <td style={{ paddingLeft: '24px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Tidak ada aktivitas kas operasional</td>
                <td style={{ textAlign: 'right' }}>-</td>
              </tr>
            )}
            <tr style={{ fontWeight: 600, background: 'rgba(255,255,255,0.005)' }}>
              <td style={{ paddingLeft: '16px' }}>Total Arus Kas dari Aktivitas Operasional</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: report.totalOperating >= 0 ? 'var(--text-primary)' : 'var(--accent-danger)' }}>
                Rp {report.totalOperating.toLocaleString('id-ID')}
              </td>
            </tr>

            {/* 2. INVESTASI */}
            <tr style={{ background: 'rgba(255,255,255,0.01)', fontWeight: 600 }}>
              <td colSpan={2}>ARUS KAS DARI AKTIVITAS INVESTASI</td>
            </tr>
            {report.investingReceipts.map((r, i) => (
              <tr key={`inv-rec-${i}`}>
                <td style={{ paddingLeft: '24px', color: 'var(--text-secondary)' }}>Penerimaan: {r.description}</td>
                <td style={{ textAlign: 'right', color: 'var(--accent-success)' }}>Rp {r.amount.toLocaleString('id-ID')}</td>
              </tr>
            ))}
            {report.investingPayments.map((p, i) => (
              <tr key={`inv-pay-${i}`}>
                <td style={{ paddingLeft: '24px', color: 'var(--text-secondary)' }}>Pengeluaran: {p.description}</td>
                <td style={{ textAlign: 'right', color: 'var(--accent-danger)' }}>-Rp {p.amount.toLocaleString('id-ID')}</td>
              </tr>
            ))}
            {report.investingReceipts.length === 0 && report.investingPayments.length === 0 && (
              <tr>
                <td style={{ paddingLeft: '24px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Tidak ada aktivitas kas investasi</td>
                <td style={{ textAlign: 'right' }}>-</td>
              </tr>
            )}
            <tr style={{ fontWeight: 600, background: 'rgba(255,255,255,0.005)' }}>
              <td style={{ paddingLeft: '16px' }}>Total Arus Kas dari Aktivitas Investasi</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: report.totalInvesting >= 0 ? 'var(--text-primary)' : 'var(--accent-danger)' }}>
                Rp {report.totalInvesting.toLocaleString('id-ID')}
              </td>
            </tr>

            {/* 3. PENDANAAN */}
            <tr style={{ background: 'rgba(255,255,255,0.01)', fontWeight: 600 }}>
              <td colSpan={2}>ARUS KAS DARI AKTIVITAS PENDANAAN</td>
            </tr>
            {report.financingReceipts.map((r, i) => (
              <tr key={`fin-rec-${i}`}>
                <td style={{ paddingLeft: '24px', color: 'var(--text-secondary)' }}>Penerimaan: {r.description}</td>
                <td style={{ textAlign: 'right', color: 'var(--accent-success)' }}>Rp {r.amount.toLocaleString('id-ID')}</td>
              </tr>
            ))}
            {report.financingPayments.map((p, i) => (
              <tr key={`fin-pay-${i}`}>
                <td style={{ paddingLeft: '24px', color: 'var(--text-secondary)' }}>Pengeluaran: {p.description}</td>
                <td style={{ textAlign: 'right', color: 'var(--accent-danger)' }}>-Rp {p.amount.toLocaleString('id-ID')}</td>
              </tr>
            ))}
            {report.financingReceipts.length === 0 && report.financingPayments.length === 0 && (
              <tr>
                <td style={{ paddingLeft: '24px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Tidak ada aktivitas kas pendanaan</td>
                <td style={{ textAlign: 'right' }}>-</td>
              </tr>
            )}
            <tr style={{ fontWeight: 600, background: 'rgba(255,255,255,0.005)' }}>
              <td style={{ paddingLeft: '16px' }}>Total Arus Kas dari Aktivitas Pendanaan</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: report.totalFinancing >= 0 ? 'var(--text-primary)' : 'var(--accent-danger)' }}>
                Rp {report.totalFinancing.toLocaleString('id-ID')}
              </td>
            </tr>

            {/* REKAPITULASI */}
            <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 700 }}>
              <td style={{ textTransform: 'uppercase' }}>Kenaikan / (Penurunan) Bersih Kas</td>
              <td style={{ textAlign: 'right', color: report.netIncrease >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                {report.netIncrease >= 0 ? '+' : ''}Rp {report.netIncrease.toLocaleString('id-ID')}
              </td>
            </tr>
            <tr style={{ fontWeight: 600 }}>
              <td style={{ color: 'var(--text-secondary)' }}>Saldo Kas & Bank Awal Periode</td>
              <td style={{ textAlign: 'right' }}>Rp {report.startBalance.toLocaleString('id-ID')}</td>
            </tr>
            <tr style={{ background: 'rgba(255,255,255,0.02)', fontWeight: 700, fontSize: '13px' }}>
              <td style={{ color: 'var(--accent-primary)', textTransform: 'uppercase' }}>Saldo Kas & Bank Akhir Periode</td>
              <td style={{ textAlign: 'right', color: 'var(--accent-primary)' }}>Rp {report.endBalance.toLocaleString('id-ID')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
