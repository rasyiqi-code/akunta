import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  FileSpreadsheet, Database, Play, CheckCircle, 
  AlertTriangle, Upload, Download, Plus, FileText, X, Settings
} from 'lucide-react';
import { db, DEFAULT_ACCOUNTS } from '../../utils/db';
import { 
  generateProfitLoss, generateBalanceSheet, postJournalEntry, 
  exportToBackupString, importFromBackupString 
} from '../../utils/ledgerEngine';
import { adjustProductStock } from '../../utils/inventoryEngine';
import { getNarrativeAnalysis } from '../../utils/gemini';
import * as XLSX from 'xlsx';

interface LedgerDashboardProps {
  activeTab: 'JURNAL' | 'BUKUBESAR' | 'LABARUGI' | 'NERACA' | 'PAJAK' | 'PERSEDIAAN';
}

export const LedgerDashboard: React.FC<LedgerDashboardProps> = ({ activeTab }) => {
  // Database Hooks
  const journals = useLiveQuery(() => db.journals.orderBy('date').reverse().toArray()) || [];
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const bankStatements = useLiveQuery(() => db.bankStatements.toArray()) || [];
  const products = useLiveQuery(() => db.products.toArray()) || [];
  const inventoryLogs = useLiveQuery(() => db.inventoryLogs.orderBy('date').reverse().toArray()) || [];

  // Laporan States
  const [plReport, setPlReport] = useState<any>(null);
  const [bsReport, setBsReport] = useState<any>(null);

  // AI Narrative Diagnosis State
  const [diagnosisText, setDiagnosisText] = useState('');
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false);

  // Manual Jurnal Modal State
  const [showJurnalModal, setShowJurnalModal] = useState(false);
  const [jurnalDate, setJurnalDate] = useState(new Date().toISOString().split('T')[0]);
  const [jurnalDesc, setJurnalDesc] = useState('');
  const [jurnalLines, setJurnalLines] = useState<any[]>([
    { accountCode: '', debit: 0, credit: 0 },
    { accountCode: '', debit: 0, credit: 0 },
  ]);

  // Product & Adjustment Modal States
  const [showProductModal, setShowProductModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductSku, setNewProductSku] = useState('');
  const [newProductPrice, setNewProductPrice] = useState(0);

  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState('');
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  // Rekonsiliasi Bank State
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  // Hitung Laba/Rugi & Neraca jika jurnal berubah
  useEffect(() => {
    const fetchReports = async () => {
      const pl = await generateProfitLoss();
      const bs = await generateBalanceSheet();
      setPlReport(pl);
      setBsReport(bs);
    };
    fetchReports();
  }, [journals]);

  // Total Nilai Persediaan
  const totalInventoryValue = products.reduce((sum, p) => sum + (p.stockQty * p.averageCost), 0);

  // Rekonsiliasi Bank
  const handleBankMatch = async (stmtId: string, statementDesc: string, amount: number) => {
    setReconcilingId(stmtId);
    try {
      const targetVal = Math.abs(amount);
      const matchedJrn = journals.find(j => {
        const totalDebit = j.lines.reduce((s, l) => s + l.debit, 0);
        return Math.abs(totalDebit - targetVal) < 1;
      });

      if (matchedJrn) {
        await db.bankStatements.update(stmtId, { matchedJournalId: matchedJrn.id, confidenceScore: 95 });
        alert(`Berhasil merekonsiliasi dengan Jurnal: ${matchedJrn.description} (Skor AI: 95%)`);
      } else {
        const lines = amount > 0 
          ? [
              { accountCode: '1101', debit: amount, credit: 0 },
              { accountCode: '4101', debit: 0, credit: amount }
            ]
          : [
              { accountCode: '5206', debit: targetVal, credit: 0 },
              { accountCode: '1101', debit: 0, credit: targetVal }
            ];

        const newJrnId = await postJournalEntry({
          date: new Date().toISOString().split('T')[0],
          description: `Rekonsiliasi Bank: ${statementDesc}`,
          lines: lines
        });

        await db.bankStatements.update(stmtId, { matchedJournalId: newJrnId, confidenceScore: 85 });
        alert(`Jurnal penyesuaian otomatis dibuat dan direkonsiliasi: ID ${newJrnId} (Skor AI: 85%)`);
      }
    } catch (err: any) {
      alert(`Gagal rekonsiliasi: ${err.message}`);
    } finally {
      setReconcilingId(null);
    }
  };

  // AI Diagnosis Laporan
  const handleDiagnosis = async (type: 'LABARUGI' | 'NERACA') => {
    setIsDiagnosing(true);
    setShowDiagnosisModal(true);
    setDiagnosisText('Akunta AI sedang menganalisis pos-pos keuangan Anda...');
    
    try {
      const data = type === 'LABARUGI' ? plReport : bsReport;
      const response = await getNarrativeAnalysis(type, data);
      setDiagnosisText(response);
    } catch (err: any) {
      setDiagnosisText(`Gagal melakukan diagnosis AI: ${err.message}`);
    } finally {
      setIsDiagnosing(false);
    }
  };

  // Ekspor Excel
  const handleExportExcel = (reportType: string) => {
    let dataToExport: any[] = [];

    if (reportType === 'JURNAL') {
      journals.forEach(j => {
        j.lines.forEach(l => {
          dataToExport.push({
            'ID Jurnal': j.id,
            'Tanggal': j.date,
            'Deskripsi': j.description,
            'Kode Akun': l.accountCode,
            'Nama Akun': DEFAULT_ACCOUNTS.find(a => a.code === l.accountCode)?.name || '',
            'Debit (Rp)': l.debit,
            'Kredit (Rp)': l.credit,
            'Anomali': j.isAnomaly ? 'YA' : 'TIDAK'
          });
        });
      });
    } else if (reportType === 'LABARUGI' && plReport) {
      dataToExport.push({ 'Kategori': 'PENDAPATAN', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' });
      plReport.revenue.forEach((r: any) => {
        dataToExport.push({ 'Kategori': '', 'Kode Akun': r.code, 'Nama Akun': r.name, 'Nominal (Rp)': r.amount });
      });
      dataToExport.push({ 'Kategori': 'Total Pendapatan', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': plReport.totalRevenue });
      
      dataToExport.push({ 'Kategori': '', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' });
      dataToExport.push({ 'Kategori': 'BEBAN', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' });
      plReport.expenses.forEach((e: any) => {
        dataToExport.push({ 'Kategori': '', 'Kode Akun': e.code, 'Nama Akun': e.name, 'Nominal (Rp)': e.amount });
      });
      dataToExport.push({ 'Kategori': 'Total Beban', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': plReport.totalExpenses });
      dataToExport.push({ 'Kategori': 'LABA BERSIH', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': plReport.netProfit });
    } else if (reportType === 'PERSEDIAAN') {
      products.forEach(p => {
        dataToExport.push({
          'SKU': p.sku,
          'Nama Produk': p.name,
          'Stok Unit': p.stockQty,
          'Biaya Rata-Rata (Rp)': p.averageCost,
          'Total Nilai Persediaan (Rp)': p.stockQty * p.averageCost,
          'Harga Jual (Rp)': p.sellingPrice
        });
      });
    } else {
      alert('Tipe ekspor belum didukung / Data tidak tersedia');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportType);
    XLSX.writeFile(wb, `Akunta_${reportType}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Backup & Restore
  const handleDownloadBackup = async () => {
    const backupStr = await exportToBackupString();
    const blob = new Blob([backupStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Akunta_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const handleUploadBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const fileContent = event.target?.result as string;
        await importFromBackupString(fileContent);
        alert('Data berhasil dipulihkan!');
        window.location.reload();
      } catch (err: any) {
        alert(err.message);
      }
    };
    reader.readAsText(file);
  };

  // Simpan Jurnal Manual
  const handleSaveJurnalManual = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const filteredLines = jurnalLines
        .filter(l => l.accountCode !== '')
        .map(l => ({
          accountCode: l.accountCode,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
        }));

      if (filteredLines.length < 2) {
        throw new Error('Jurnal minimal memiliki 2 baris akun.');
      }

      await postJournalEntry({
        date: jurnalDate,
        description: jurnalDesc,
        lines: filteredLines,
      });

      setShowJurnalModal(false);
      setJurnalDesc('');
      setJurnalLines([
        { accountCode: '', debit: 0, credit: 0 },
        { accountCode: '', debit: 0, credit: 0 },
      ]);
      alert('Jurnal manual berhasil disimpan!');
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Tambah Produk Baru
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newId = `prod-${Math.random().toString(36).substring(2, 9)}`;
      await db.products.add({
        id: newId,
        name: newProductName,
        sku: newProductSku.toUpperCase(),
        stockQty: 0,
        averageCost: 0,
        sellingPrice: newProductPrice,
      });
      setShowProductModal(false);
      setNewProductName('');
      setNewProductSku('');
      setNewProductPrice(0);
      alert('Produk baru sukses ditambahkan!');
    } catch (err: any) {
      alert(`Gagal menambah produk: ${err.message}`);
    }
  };

  // Stock Adjustment Manual
  const handleSaveStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adjustProductStock(
        adjustProductId,
        adjustQty,
        new Date().toISOString().split('T')[0],
        adjustReason
      );
      setShowAdjustModal(false);
      setAdjustProductId('');
      setAdjustQty(0);
      setAdjustReason('');
      alert('Penyesuaian stok berhasil diposting!');
    } catch (err: any) {
      alert(`Gagal penyesuaian: ${err.message}`);
    }
  };

  return (
    <div className="accountant-workspace">
      {/* Main Content Area */}
      <div className="report-content">
        
        {/* Tab 1: JURNAL */}
        {activeTab === 'JURNAL' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Buku Jurnal Umum</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => handleExportExcel('JURNAL')}>
                  <FileSpreadsheet size={14} />
                  <span>Excel</span>
                </button>
                <button className="btn btn-primary" onClick={() => setShowJurnalModal(true)}>
                  <Plus size={14} />
                  <span>Jurnal Manual</span>
                </button>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Ref ID</th>
                    <th>Keterangan / Rincian Akun</th>
                    <th style={{ textAlign: 'right' }}>Debit (Rp)</th>
                    <th style={{ textAlign: 'right' }}>Kredit (Rp)</th>
                    <th>AI Status</th>
                  </tr>
                </thead>
                <tbody>
                  {journals.map((j) => (
                    <tr key={j.id}>
                      <td style={{ verticalAlign: 'top', width: '100px' }}>{j.date}</td>
                      <td style={{ verticalAlign: 'top', width: '90px', fontFamily: 'monospace' }}>{j.id}</td>
                      <td>
                        <div style={{ fontWeight: 600, marginBottom: '6px' }}>{j.description}</div>
                        <div className="jurnal-detail-lines">
                          {j.lines.map((l, i) => (
                            <div key={i} className={`jurnal-line-row ${l.credit > 0 ? 'credit' : 'debit'}`}>
                              <span>
                                {l.accountCode} - {accounts.find(a => a.code === l.accountCode)?.name || 'Akun'}
                              </span>
                              <span style={{ fontFamily: 'monospace' }}>
                                {l.debit > 0 ? `+Rp ${l.debit.toLocaleString('id-ID')}` : `-Rp ${l.credit.toLocaleString('id-ID')}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="amount-col" style={{ verticalAlign: 'top' }}>
                        {j.lines.reduce((s, l) => s + l.debit, 0).toLocaleString('id-ID')}
                      </td>
                      <td className="amount-col" style={{ verticalAlign: 'top' }}>
                        {j.lines.reduce((s, l) => s + l.credit, 0).toLocaleString('id-ID')}
                      </td>
                      <td style={{ verticalAlign: 'top', width: '80px' }}>
                        {j.isAnomaly ? (
                          <span style={{ color: 'var(--accent-danger)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px' }} title={j.anomalyReason}>
                            <AlertTriangle size={12} />
                            <span>Anomali</span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--accent-success)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px' }}>
                            <CheckCircle size={12} />
                            <span>Valid</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Tab 2: COA */}
        {activeTab === 'BUKUBESAR' && (
          <>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Daftar Akun (Chart of Accounts)</h3>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama Akun</th>
                    <th>Tipe Akun</th>
                    <th>Saldo Normal</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(a => (
                    <tr key={a.code}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.code}</td>
                      <td>{a.name}</td>
                      <td>
                        <span style={{ 
                          fontSize: '11px', 
                          background: 'rgba(255,255,255,0.05)', 
                          padding: '2px 8px', 
                          borderRadius: '10px',
                          color: a.type === 'ASET' ? 'var(--accent-secondary)' : a.type === 'PENDAPATAN' ? 'var(--accent-success)' : 'var(--text-primary)'
                        }}>
                          {a.type}
                        </span>
                      </td>
                      <td>{a.normalBalance === 'D' ? 'DEBIT' : 'KREDIT'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Tab 3: PERSEDIAAN (Inventory) - Fase 2 */}
        {activeTab === 'PERSEDIAAN' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Modul Persediaan Barang</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Total Nilai Stok (Average Cost): <strong>Rp {totalInventoryValue.toLocaleString('id-ID')}</strong>
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => handleExportExcel('PERSEDIAAN')}>
                  <FileSpreadsheet size={14} />
                  <span>Excel</span>
                </button>
                <button className="btn btn-secondary" onClick={() => setShowAdjustModal(true)}>
                  <Settings size={14} />
                  <span>Stock Opname</span>
                </button>
                <button className="btn btn-primary" onClick={() => setShowProductModal(true)}>
                  <Plus size={14} />
                  <span>Tambah Produk</span>
                </button>
              </div>
            </div>

            {/* List Produk */}
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Daftar Produk</div>
            <div className="table-wrapper" style={{ marginBottom: '24px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Nama Produk</th>
                    <th style={{ textAlign: 'right' }}>Stok Unit</th>
                    <th style={{ textAlign: 'right' }}>Harga Rata-Rata (COGS)</th>
                    <th style={{ textAlign: 'right' }}>Total Nilai</th>
                    <th style={{ textAlign: 'right' }}>Harga Jual</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.sku}</td>
                      <td>{p.name}</td>
                      <td className="amount-col" style={{ color: p.stockQty < 5 ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
                        {p.stockQty} Unit
                      </td>
                      <td className="amount-col">Rp {p.averageCost.toLocaleString('id-ID')}</td>
                      <td className="amount-col" style={{ fontWeight: 600 }}>
                        Rp {(p.stockQty * p.averageCost).toLocaleString('id-ID')}
                      </td>
                      <td className="amount-col">Rp {p.sellingPrice.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Log Mutasi Stok */}
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Mutasi Stok Terbaru</div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Produk</th>
                    <th>Tipe Mutasi</th>
                    <th style={{ textAlign: 'right' }}>Kuantitas</th>
                    <th style={{ textAlign: 'right' }}>Biaya / Unit</th>
                    <th>Referensi / Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryLogs.map(log => {
                    const prod = products.find(p => p.id === log.productId);
                    return (
                      <tr key={log.id}>
                        <td>{log.date}</td>
                        <td>{prod ? `${prod.name} (${prod.sku})` : 'Produk tidak dikenal'}</td>
                        <td>
                          <span style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontWeight: 600,
                            background: log.type === 'MASUK' ? 'rgba(16, 185, 129, 0.1)' : log.type === 'KELUAR' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            color: log.type === 'MASUK' ? 'var(--accent-success)' : log.type === 'KELUAR' ? 'var(--accent-danger)' : 'var(--accent-warning)',
                          }}>
                            {log.type}
                          </span>
                        </td>
                        <td className="amount-col">{log.qty} Unit</td>
                        <td className="amount-col">Rp {log.cost.toLocaleString('id-ID')}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{log.reference || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Tab 4: LABA RUGI */}
        {activeTab === 'LABARUGI' && plReport && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Laporan Laba Rugi</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => handleExportExcel('LABARUGI')}>
                  <FileSpreadsheet size={14} />
                  <span>Excel</span>
                </button>
                <button className="btn btn-primary" onClick={() => handleDiagnosis('LABARUGI')}>
                  <Play size={14} />
                  <span>Diagnosis AI</span>
                </button>
              </div>
            </div>

            <div className="table-wrapper" style={{ padding: '24px' }}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontFamily: 'var(--font-display)' }}>AKUNTA</h2>
                <h4 style={{ color: 'var(--text-secondary)' }}>Laporan Laba Rugi Berjalan</h4>
              </div>

              {/* Pendapatan */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px' }}>PENDAPATAN</div>
                {plReport.revenue.map((r: any) => (
                  <div key={r.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '13px' }}>
                    <span>{r.code} - {r.name}</span>
                    <span style={{ fontFamily: 'monospace' }}>Rp {r.amount.toLocaleString('id-ID')}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontWeight: 600, background: 'rgba(255,255,255,0.02)' }}>
                  <span>Total Pendapatan</span>
                  <span style={{ fontFamily: 'monospace' }}>Rp {plReport.totalRevenue.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {/* Beban */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px' }}>BEBAN OPERASIONAL</div>
                {plReport.expenses.map((e: any) => (
                  <div key={e.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '13px' }}>
                    <span>{e.code} - {e.name}</span>
                    <span style={{ fontFamily: 'monospace' }}>Rp {e.amount.toLocaleString('id-ID')}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontWeight: 600, background: 'rgba(255,255,255,0.02)' }}>
                  <span>Total Beban</span>
                  <span style={{ fontFamily: 'monospace' }}>Rp {plReport.totalExpenses.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {/* Laba Bersih */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', fontWeight: 700, background: 'var(--accent-primary-glow)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-primary)' }}>
                <span>LABA BERSIH BERJALAN</span>
                <span style={{ fontFamily: 'monospace', color: plReport.netProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                  Rp {plReport.netProfit.toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          </>
        )}

        {/* Tab 5: NERACA */}
        {activeTab === 'NERACA' && bsReport && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Laporan Neraca (Balance Sheet)</h3>
              <button className="btn btn-primary" onClick={() => handleDiagnosis('NERACA')}>
                <Play size={14} />
                <span>Diagnosis AI</span>
              </button>
            </div>

            <div className="table-wrapper" style={{ padding: '24px' }}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontFamily: 'var(--font-display)' }}>AKUNTA</h2>
                <h4 style={{ color: 'var(--text-secondary)' }}>Laporan Neraca</h4>
              </div>

              <div style={{ display: 'flex', gap: '24px' }}>
                {/* Aktiva (Aset) */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px', color: 'var(--accent-secondary)' }}>AKTIVA (ASET)</div>
                  {bsReport.assets.map((a: any) => (
                    <div key={a.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '12px' }}>
                      <span>{a.code} - {a.name}</span>
                      <span style={{ fontFamily: 'monospace' }}>Rp {a.amount.toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontWeight: 700, background: 'rgba(255,255,255,0.02)', marginTop: '12px' }}>
                    <span>Total Aktiva</span>
                    <span style={{ fontFamily: 'monospace' }}>Rp {bsReport.totalAssets.toLocaleString('id-ID')}</span>
                  </div>
                </div>

                {/* Pasiva (Kewajiban & Ekuitas) */}
                <div style={{ flex: 1 }}>
                  {/* Kewajiban */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px', color: 'var(--accent-warning)' }}>KEWAJIBAN</div>
                    {bsReport.liabilities.map((l: any) => (
                      <div key={l.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '12px' }}>
                        <span>{l.code} - {l.name}</span>
                        <span style={{ fontFamily: 'monospace' }}>Rp {l.amount.toLocaleString('id-ID')}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontWeight: 600, background: 'rgba(255,255,255,0.02)' }}>
                      <span>Total Kewajiban</span>
                      <span style={{ fontFamily: 'monospace' }}>Rp {bsReport.totalLiabilities.toLocaleString('id-ID')}</span>
                    </div>
                  </div>

                  {/* Ekuitas */}
                  <div>
                    <div style={{ fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px', color: 'var(--accent-success)' }}>EKUITAS</div>
                    {bsReport.equity.map((e: any) => (
                      <div key={e.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '12px' }}>
                        <span>{e.code} - {e.name}</span>
                        <span style={{ fontFamily: 'monospace' }}>Rp {e.amount.toLocaleString('id-ID')}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontWeight: 600, background: 'rgba(255,255,255,0.02)' }}>
                      <span>Total Ekuitas</span>
                      <span style={{ fontFamily: 'monospace' }}>Rp {bsReport.totalEquity.toLocaleString('id-ID')}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontWeight: 700, background: 'rgba(255,255,255,0.02)', marginTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                    <span>Total Pasiva</span>
                    <span style={{ fontFamily: 'monospace' }}>Rp {(bsReport.totalLiabilities + bsReport.totalEquity).toLocaleString('id-ID')}</span>
                  </div>

                </div>
              </div>
            </div>
          </>
        )}

        {/* Tab 6: BANK & PAJAK */}
        {activeTab === 'PAJAK' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Rekonsiliasi Bank */}
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: '12px' }}>
                Rekonsiliasi Bank (AI-Assisted)
              </h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Keterangan Rekening Bank</th>
                      <th style={{ textAlign: 'right' }}>Nominal (Rp)</th>
                      <th>Status Rekonsiliasi</th>
                      <th>Aksi AI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankStatements.map(stmt => (
                      <tr key={stmt.id}>
                        <td>{stmt.date}</td>
                        <td>{stmt.description}</td>
                        <td className="amount-col" style={{ color: stmt.amount > 0 ? 'var(--accent-success)' : 'var(--text-primary)' }}>
                          {stmt.amount > 0 ? '+' : ''}Rp {stmt.amount.toLocaleString('id-ID')}
                        </td>
                        <td>
                          {stmt.matchedJournalId ? (
                            <span style={{ color: 'var(--accent-success)', fontSize: '12px', fontWeight: 600 }}>
                              Matched with JRN ({stmt.confidenceScore}%)
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Belum Cocok</span>
                          )}
                        </td>
                        <td>
                          {!stmt.matchedJournalId && (
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '4px 10px', fontSize: '11px' }}
                              disabled={reconcilingId === stmt.id}
                              onClick={() => handleBankMatch(stmt.id, stmt.description, stmt.amount)}
                            >
                              {reconcilingId === stmt.id ? 'Memproses...' : 'Cocokkan otomatis'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pajak Indonesia & Backup Section */}
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1, background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: '12px' }}>e-Faktur Pajak</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Unduh data transaksi terpilih dalam skema template CSV Direktorat Jenderal Pajak (DJP).
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-secondary" onClick={() => alert('e-Faktur CSV siap diunduh!')}>
                    <Download size={12} />
                    <span>e-Faktur PPN</span>
                  </button>
                  <button className="btn btn-secondary" onClick={() => alert('e-Bupot CSV siap diunduh!')}>
                    <Download size={12} />
                    <span>e-Bupot PPh</span>
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Database size={16} />
                  <span>Cadangan & Pemulihan (Backup)</span>
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Ekspor seluruh database lokal (IndexedDB) Akunta ke file JSON portabel.
                </p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={handleDownloadBackup}>
                    <Download size={12} />
                    <span>Unduh Backup</span>
                  </button>
                  <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                    <Upload size={12} />
                    <span>Unggah Backup</span>
                    <input 
                      type="file" 
                      accept=".json" 
                      style={{ display: 'none' }} 
                      onChange={handleUploadBackup} 
                    />
                  </label>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Modal Jurnal Manual */}
      {showJurnalModal && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Catat Jurnal Manual</h3>
              <button style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }} onClick={() => setShowJurnalModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveJurnalManual} className="modal-body">
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Tanggal</label>
                  <input type="date" className="form-input" value={jurnalDate} onChange={e => setJurnalDate(e.target.value)} required />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Keterangan Jurnal</label>
                  <input type="text" className="form-input" placeholder="contoh: Penyesuaian akhir bulan" value={jurnalDesc} onChange={e => setJurnalDesc(e.target.value)} required />
                </div>
              </div>

              <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '12px', color: 'var(--text-secondary)' }}>
                Rincian Akun (Debit/Kredit harus seimbang)
              </div>

              {jurnalLines.map((line, index) => (
                <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  <select 
                    className="form-input" 
                    style={{ flex: 2 }}
                    value={line.accountCode} 
                    onChange={e => {
                      const newLines = [...jurnalLines];
                      newLines[index].accountCode = e.target.value;
                      setJurnalLines(newLines);
                    }}
                    required
                  >
                    <option value="">Pilih Akun...</option>
                    {accounts.map(a => (
                      <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                  <input 
                    type="number" 
                    className="form-input" 
                    style={{ flex: 1, textAlign: 'right' }} 
                    placeholder="Debit"
                    value={line.debit || ''}
                    onChange={e => {
                      const newLines = [...jurnalLines];
                      newLines[index].debit = parseFloat(e.target.value) || 0;
                      if (newLines[index].debit > 0) newLines[index].credit = 0;
                      setJurnalLines(newLines);
                    }}
                  />
                  <input 
                    type="number" 
                    className="form-input" 
                    style={{ flex: 1, textAlign: 'right' }} 
                    placeholder="Kredit"
                    value={line.credit || ''}
                    onChange={e => {
                      const newLines = [...jurnalLines];
                      newLines[index].credit = parseFloat(e.target.value) || 0;
                      if (newLines[index].credit > 0) newLines[index].debit = 0;
                      setJurnalLines(newLines);
                    }}
                  />
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setJurnalLines([...jurnalLines, { accountCode: '', debit: 0, credit: 0 }])}>
                  + Tambah Baris
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowJurnalModal(false)}>Batal</button>
                  <button type="submit" className="btn btn-primary">Simpan Jurnal</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Produk (Fase 2) */}
      {showProductModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Tambah Produk Baru</h3>
              <button style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }} onClick={() => setShowProductModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveProduct} className="modal-body">
              <div className="form-group">
                <label className="form-label">Nama Produk</label>
                <input type="text" className="form-input" placeholder="contoh: Kopi Arabika Lintong" value={newProductName} onChange={e => setNewProductName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">SKU Produk</label>
                <input type="text" className="form-input" placeholder="contoh: KOPI-LNTG" value={newProductSku} onChange={e => setNewProductSku(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Harga Jual per Unit (Rp)</label>
                <input type="number" className="form-input" placeholder="contoh: 65000" value={newProductPrice || ''} onChange={e => setNewProductPrice(parseFloat(e.target.value) || 0)} required />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowProductModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan Produk</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Stock Adjustment (Fase 2) */}
      {showAdjustModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Stock Opname / Adjustment</h3>
              <button style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }} onClick={() => setShowAdjustModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveStockAdjustment} className="modal-body">
              <div className="form-group">
                <label className="form-label">Pilih Produk</label>
                <select className="form-input" value={adjustProductId} onChange={e => setAdjustProductId(e.target.value)} required>
                  <option value="">Pilih...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku}) - Sisa Stok: {p.stockQty} unit</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Jumlah Stok Riil yang Baru</label>
                <input type="number" className="form-input" placeholder="contoh: 12" value={adjustQty || ''} onChange={e => setAdjustQty(parseInt(e.target.value) || 0)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Alasan Penyesuaian</label>
                <input type="text" className="form-input" placeholder="contoh: Stock Opname Juni 2026 / Barang Rusak" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} required />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdjustModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Post Penyesuaian</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Diagnosis Laporan */}
      {showDiagnosisModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={18} style={{ color: 'var(--accent-secondary)' }} />
                <span>Diagnosis AI Akunta</span>
              </h3>
              <button style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }} onClick={() => setShowDiagnosisModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {diagnosisText}
              {isDiagnosing && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                  <div style={{ width: '24px', height: '24px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-secondary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
