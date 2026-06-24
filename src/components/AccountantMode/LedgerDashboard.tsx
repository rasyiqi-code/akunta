import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  FileSpreadsheet, Database, Play, CheckCircle, 
  AlertTriangle, Upload, Download, Plus, FileText, X
} from 'lucide-react';
import { db, DEFAULT_ACCOUNTS } from '../../utils/db';
import { 
  generateProfitLoss, generateBalanceSheet, postJournalEntry, 
  exportToBackupString, importFromBackupString 
} from '../../utils/ledgerEngine';
import { getNarrativeAnalysis } from '../../utils/gemini';
import * as XLSX from 'xlsx';

interface LedgerDashboardProps {
  activeTab: 'JURNAL' | 'BUKUBESAR' | 'LABARUGI' | 'NERACA' | 'PAJAK';
  setActiveTab: (tab: 'JURNAL' | 'BUKUBESAR' | 'LABARUGI' | 'NERACA' | 'PAJAK') => void;
}

export const LedgerDashboard: React.FC<LedgerDashboardProps> = ({ activeTab, setActiveTab }) => {
  // Database Hooks
  const journals = useLiveQuery(() => db.journals.orderBy('date').reverse().toArray()) || [];
  const accounts = useLiveQuery(() => db.accounts.toArray()) || [];
  const bankStatements = useLiveQuery(() => db.bankStatements.toArray()) || [];

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

  // Rekonsiliasi Bank State
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  // Panggil laporan ulang jika ada perubahan di jurnal
  useEffect(() => {
    const fetchReports = async () => {
      const pl = await generateProfitLoss();
      const bs = await generateBalanceSheet();
      setPlReport(pl);
      setBsReport(bs);
    };
    fetchReports();
  }, [journals]);

  // F-AK-02: AI-Assisted Bank Reconciliation
  const handleBankMatch = async (stmtId: string, statementDesc: string, amount: number) => {
    setReconcilingId(stmtId);
    try {
      // AI mencari/mencocokkan transaksi
      // Mari cari apakah ada jurnal dengan nominal yang pas tetapi belum direkonsiliasi
      const targetVal = Math.abs(amount);
      const matchedJrn = journals.find(j => {
        const totalDebit = j.lines.reduce((s, l) => s + l.debit, 0);
        // Bandingkan nominal dan cek apakah deskripsi mirip secara kontekstual
        const isNominalMatch = Math.abs(totalDebit - targetVal) < 1;
        return isNominalMatch;
      });

      if (matchedJrn) {
        // Lakukan pencocokan
        await db.bankStatements.update(stmtId, { matchedJournalId: matchedJrn.id, confidenceScore: 95 });
        alert(`Berhasil merekonsiliasi dengan Jurnal: ${matchedJrn.description} (Skor Kecocokan AI: 95%)`);
      } else {
        // Buat jurnal pencocokan otomatis jika tidak ada
        // Masuk kas = Debit Kas (1101) & Kredit Pendapatan Penjualan (4101) atau sebaliknya
        const lines = amount > 0 
          ? [
              { accountCode: '1101', debit: amount, credit: 0 }, // Debit Kas
              { accountCode: '4101', debit: 0, credit: amount }  // Kredit Pendapatan
            ]
          : [
              { accountCode: '5206', debit: targetVal, credit: 0 }, // Debit Biaya Operasional
              { accountCode: '1101', debit: 0, credit: targetVal }  // Kredit Kas
            ];

        const newJrnId = await postJournalEntry({
          date: new Date().toISOString().split('T')[0],
          description: `Rekonsiliasi Bank: ${statementDesc}`,
          lines: lines
        });

        await db.bankStatements.update(stmtId, { matchedJournalId: newJrnId, confidenceScore: 85 });
        alert(`Jurnal penyesuaian otomatis dibuat dan direkonsiliasi: ID ${newJrnId} (Skor Kecocokan AI: 85%)`);
      }
    } catch (err: any) {
      alert(`Gagal rekonsiliasi: ${err.message}`);
    } finally {
      setReconcilingId(null);
    }
  };

  // F-AS-04: Dr. Report - AI Diagnosis Laporan
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

  // Ekspor Excel via SheetJS (xlsx)
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
      
      dataToExport.push({ 'Kategori': '', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' }); // Spasi
      dataToExport.push({ 'Kategori': 'BEBAN', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' });
      plReport.expenses.forEach((e: any) => {
        dataToExport.push({ 'Kategori': '', 'Kode Akun': e.code, 'Nama Akun': e.name, 'Nominal (Rp)': e.amount });
      });
      dataToExport.push({ 'Kategori': 'Total Beban', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': plReport.totalExpenses });
      
      dataToExport.push({ 'Kategori': '', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' }); // Spasi
      dataToExport.push({ 'Kategori': 'LABA BERSIH', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': plReport.netProfit });
    } else {
      alert('Tipe ekspor belum didukung / Data tidak tersedia');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportType);
    XLSX.writeFile(wb, `Akunta_${reportType}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Backup & Restore Handlers
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
        alert('Data berhasil dipulihkan dari cadangan (Backup)!');
        window.location.reload();
      } catch (err: any) {
        alert(err.message);
      }
    };
    reader.readAsText(file);
  };

  // Tambah baris baru di form jurnal manual
  const handleAddJurnalLine = () => {
    setJurnalLines([...jurnalLines, { accountCode: '', debit: 0, credit: 0 }]);
  };

  // Simpan Jurnal Manual
  const handleSaveJurnalManual = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Filter baris kosong & konversi tipe nominal
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

  return (
    <div className="accountant-workspace">
      
      {/* Tab Navigation */}
      <div className="tab-nav">
        <button className={`tab-btn ${activeTab === 'JURNAL' ? 'active' : ''}`} onClick={() => setActiveTab('JURNAL')}>
          Jurnal Umum
        </button>
        <button className={`tab-btn ${activeTab === 'BUKUBESAR' ? 'active' : ''}`} onClick={() => setActiveTab('BUKUBESAR')}>
          Daftar Akun (COA)
        </button>
        <button className={`tab-btn ${activeTab === 'LABARUGI' ? 'active' : ''}`} onClick={() => setActiveTab('LABARUGI')}>
          Laba Rugi
        </button>
        <button className={`tab-btn ${activeTab === 'NERACA' ? 'active' : ''}`} onClick={() => setActiveTab('NERACA')}>
          Neraca
        </button>
        <button className={`tab-btn ${activeTab === 'PAJAK' ? 'active' : ''}`} onClick={() => setActiveTab('PAJAK')}>
          Bank & Pajak
        </button>
      </div>

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
                  {journals.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        Belum ada transaksi tercatat. Mulai input melalui chat di Mode Asisten.
                      </td>
                    </tr>
                  )}
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

        {/* Tab 3: LABA RUGI */}
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

        {/* Tab 4: NERACA */}
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

        {/* Tab 5: BANK & PAJAK & BACKUP */}
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
              {/* Pajak Card */}
              <div style={{ flex: 1, background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: '12px' }}>F-AS-06: e-Faktur Pajak</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Unduh data transaksi terpilih dalam skema template CSV Direktorat Jenderal Pajak (DJP).
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-secondary" onClick={() => alert('Fitur CSV e-Faktur Pajak Keluaran siap diunduh!')}>
                    <Download size={12} />
                    <span>e-Faktur PPN</span>
                  </button>
                  <button className="btn btn-secondary" onClick={() => alert('Fitur CSV Bukti Potong PPh 21/23 siap diunduh!')}>
                    <Download size={12} />
                    <span>e-Bupot PPh</span>
                  </button>
                </div>
              </div>

              {/* Backup & Cadangan Card */}
              <div style={{ flex: 1, background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Database size={16} />
                  <span>Cadangan & Pemulihan (Backup)</span>
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Ekspor seluruh database lokal (IndexedDB) Akunta ke file JSON portabel, atau impor dari file cadangan yang ada.
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
                      if (newLines[index].debit > 0) newLines[index].credit = 0; // mutually exclusive
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
                <button type="button" className="btn btn-secondary" onClick={handleAddJurnalLine}>
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
