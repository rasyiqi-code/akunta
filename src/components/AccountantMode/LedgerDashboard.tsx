import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { 
  FileSpreadsheet, Database, Play, CheckCircle, 
  AlertTriangle, Upload, Download, Plus, Sparkles, X, Trash2
} from 'lucide-react';
import { db } from '../../utils/db';
import { invoke } from '@tauri-apps/api/core';
import { 
  generateProfitLoss, generateBalanceSheet, postJournalEntry, 
  exportToBackupString, importFromBackupString, resetDatabase,
  generateEquityStatement, closePeriodBooks, getLockDateSetting, generateAgingReport
} from '../../utils/ledgerEngine';
import { adjustProductStock } from '../../utils/inventoryEngine';
import { runMonthlyDepreciation, addFixedAsset, calculateMonthlyDepreciation } from '../../utils/fixedAssetEngine';
import { getTaxSummary, generateEFakturCSV, generateEBupotCSV, reconcileBankStatement, type TaxTransaction } from '../../utils/pajakEngine';
import { getNarrativeAnalysis } from '../../utils/gemini';
import * as XLSX from 'xlsx';
import { TrialBalance } from './TrialBalance';
import { CashFlow } from './CashFlow';
import { SalesManager } from './SalesManager';
import { PurchaseManager } from './PurchaseManager';

const MonthlyDepreciationCell: React.FC<{ asset: any }> = ({ asset }) => {
  const [value, setValue] = useState<number>(0);

  useEffect(() => {
    let active = true;
    const fetchVal = async () => {
      const val = await calculateMonthlyDepreciation(asset);
      if (active) setValue(val);
    };
    fetchVal();
    return () => {
      active = false;
    };
  }, [asset]);

  return <span>Rp {value.toLocaleString('id-ID')}</span>;
};

interface LedgerDashboardProps {
  activeTab: 'JURNAL' | 'BUKUBESAR' | 'PERSEDIAAN' | 'ASETTETAP' | 'LABARUGI' | 'NERACA' | 'PAJAK' | 'NERACASALDO' | 'ARUSKAS' | 'PENJUALAN' | 'PEMBELIAN' | 'EKUITAS' | 'AGING';
}

export const LedgerDashboard: React.FC<LedgerDashboardProps> = ({ activeTab }) => {
  // Database States Lokal
  const [journals, setJournals] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [bankStatements, setBankStatements] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<any[]>([]);
  const [fixedAssets, setFixedAssets] = useState<any[]>([]);
  const [inventorySubTab, setInventorySubTab] = useState<'BARANG' | 'GUDANG' | 'OPNAME'>('BARANG');
  const [stockTakes, setStockTakes] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  // Fungsi untuk menarik data dari Rust SQLite
  const fetchData = async () => {
    try {
      const [jList, aList, bList, pList, lList, fList, stList, wList] = await Promise.all([
        db.journals.toArray(),
        db.accounts.toArray(),
        db.bankStatements.toArray(),
        db.products.toArray(),
        db.inventoryLogs.toArray(),
        db.fixedAssets.toArray(),
        db.stockTakes.toArray(),
        db.warehouses.toArray()
      ]);
      setJournals(jList);
      setAccounts(aList);
      setBankStatements(bList);
      setProducts(pList);
      setInventoryLogs(lList);
      setFixedAssets(fList);
      setStockTakes(stList);
      setWarehouses(wList);
    } catch (e) {
      console.error("Gagal mengambil data dari SQLite backend:", e);
    }
  };

  // Inisialisasi data & dengarkan update database dari Rust
  useEffect(() => {
    let active = true;
    let unlistenFn: (() => void) | undefined;

    const setupListener = async () => {
      unlistenFn = await listen('db-update', () => {
        if (active) {
          fetchData();
        }
      });
    };

    fetchData();
    setupListener();

    return () => {
      active = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // Laporan States
  const [plReport, setPlReport] = useState<any>(null);
  const [bsReport, setBsReport] = useState<any>(null);
  const [taxSummary, setTaxSummary] = useState<{ ppnMasukan: number; ppnKeluaran: number; pph21: number; pph23: number; transactions: TaxTransaction[] }>({ ppnMasukan: 0, ppnKeluaran: 0, pph21: 0, pph23: 0, transactions: [] });

  // Aset Tetap States
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [assetCost, setAssetCost] = useState(0);
  const [assetLifeYears, setAssetLifeYears] = useState(5);
  const [assetSalvage, setAssetSalvage] = useState(0);
  const [assetPurchaseDate, setAssetPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [isDepreciating, setIsDepreciating] = useState(false);

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
  
  const [showNewStockTakeModal, setShowNewStockTakeModal] = useState(false);
  const [newStockTakeItems, setNewStockTakeItems] = useState<any[]>([]);

  const [showDisposalModal, setShowDisposalModal] = useState(false);
  const [selectedAssetForDisposal, setSelectedAssetForDisposal] = useState<any>(null);
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().split('T')[0]);
  const [disposalValue, setDisposalValue] = useState(0);

  // Rekonsiliasi Bank State
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  // Perubahan Ekuitas States
  const [equityReport, setEquityReport] = useState<any>(null);
  const [equityStartDate, setEquityStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [equityEndDate, setEquityEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Aging AR/AP States
  const [agingReportType, setAgingReportType] = useState<'AR' | 'AP'>('AR');
  const [agingReport, setAgingReport] = useState<any>(null);

  // Tutup Buku States
  const [currentLockDate, setCurrentLockDate] = useState<string>('');
  const [showClosePeriodModal, setShowClosePeriodModal] = useState<boolean>(false);
  const [closePeriodDate, setClosePeriodDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Load Perubahan Ekuitas
  useEffect(() => {
    const fetchEquity = async () => {
      const res = await generateEquityStatement(equityStartDate, equityEndDate);
      setEquityReport(res);
    };
    fetchEquity();
  }, [journals, equityStartDate, equityEndDate]);

  // Load Aging Report
  useEffect(() => {
    const fetchAging = async () => {
      const res = await generateAgingReport(agingReportType);
      setAgingReport(res);
    };
    fetchAging();
  }, [journals, agingReportType]);

  // Load Lock Date
  useEffect(() => {
    const fetchLockDate = async () => {
      const ld = await getLockDateSetting();
      setCurrentLockDate(ld);
    };
    fetchLockDate();
  }, [journals]);

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

  // Ambil data Pajak jika jurnal berubah
  useEffect(() => {
    const fetchTax = async () => {
      const summary = await getTaxSummary();
      setTaxSummary(summary);
    };
    fetchTax();
  }, [journals]);

  const handleResetDatabase = async () => {
    if (!window.confirm("Apakah Anda yakin ingin mereset seluruh database? Semua data transaksi, produk, aset tetap, dan log akan dihapus dan dikembalikan ke data awal (default).")) {
      return;
    }
    try {
      await resetDatabase();
      alert("Database berhasil direset!");
      fetchData();
    } catch (err) {
      console.error("Gagal mereset database:", err);
      alert("Gagal mereset database: " + err);
    }
  };

  const handleClosePeriod = async () => {
    if (!window.confirm(`PENTING: Anda akan melakukan Tutup Buku untuk periode yang berakhir pada tanggal ${closePeriodDate}.\n\nSemua transaksi pada atau sebelum tanggal ini akan dikunci dan jurnal penutup otomatis akan dibuat.\n\nApakah Anda yakin?`)) {
      return;
    }
    try {
      await closePeriodBooks(closePeriodDate);
      alert(`Sukses! Buku untuk periode sampai dengan ${closePeriodDate} telah ditutup dan dikunci.`);
      setShowClosePeriodModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
      alert(`Gagal melakukan tutup buku: ${err}`);
    }
  };


  const saveNativeFile = async (content: string, filename: string) => {
    try {
      const savedPath = await invoke<string>('save_export_file', {
        filename,
        content
      });
      alert(`Berkas berhasil disimpan secara native di:\n${savedPath}`);
    } catch (err: any) {
      console.warn('Gagal menyimpan file secara native via Tauri, beralih ke download browser:', err);
      downloadCSV(content, filename);
    }
  };

  const handleExportEFaktur = async (type: 'MASUKAN' | 'KELUARAN') => {
    try {
      const csvContent = await generateEFakturCSV(taxSummary.transactions, type);
      if (csvContent) {
        await saveNativeFile(csvContent, `e-Faktur_PPN_${type === 'MASUKAN' ? 'Masukan' : 'Keluaran'}_${new Date().toISOString().split('T')[0]}.csv`);
      } else {
        alert('Tidak ada transaksi PPN untuk diekspor.');
      }
    } catch (err: any) {
      alert(`Gagal mengekspor e-Faktur: ${err.message}`);
    }
  };

  const handleExportEBupot = async () => {
    try {
      const csvContent = await generateEBupotCSV(taxSummary.transactions);
      if (csvContent) {
        await saveNativeFile(csvContent, `e-Bupot_PPh21_${new Date().toISOString().split('T')[0]}.csv`);
      } else {
        alert('Tidak ada transaksi PPh 21 untuk diekspor.');
      }
    } catch (err: any) {
      alert(`Gagal mengekspor e-Bupot: ${err.message}`);
    }
  };

  const handleExportEBupot23 = async () => {
    try {
      const csvContent = await generateEBupotCSV(taxSummary.transactions, 'PPH_23');
      if (csvContent) {
        await saveNativeFile(csvContent, `e-Bupot_PPh23_${new Date().toISOString().split('T')[0]}.csv`);
      } else {
        alert('Tidak ada transaksi PPh 23 untuk diekspor.');
      }
    } catch (err: any) {
      alert(`Gagal mengekspor e-Bupot PPh 23: ${err.message}`);
    }
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddFixedAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName || assetCost <= 0 || assetLifeYears <= 0) {
      alert('Mohon isi formulir aset dengan benar.');
      return;
    }
    try {
      await addFixedAsset({
        id: `fa-${Date.now()}`,
        name: assetName,
        purchaseDate: assetPurchaseDate,
        cost: assetCost,
        usefulLifeYears: assetLifeYears,
        salvageValue: assetSalvage
      });

      // Debit: 1201 (Peralatan Kantor)
      // Kredit: 1101 (Kas Utama)
      await postJournalEntry({
        id: `acq-fa-${Date.now()}`,
        date: assetPurchaseDate,
        description: `Perolehan Aset Tetap - ${assetName}`,
        lines: [
          { accountCode: '1201', debit: assetCost, credit: 0 },
          { accountCode: '1101', debit: 0, credit: assetCost }
        ]
      });

      alert('Aset tetap berhasil ditambahkan dan jurnal perolehan diposting.');
      setShowAssetModal(false);
      setAssetName('');
      setAssetCost(0);
      setAssetSalvage(0);
    } catch (err: any) {
      alert(`Gagal menambah aset: ${err.message}`);
    }
  };

  const handleRunDepreciation = async () => {
    setIsDepreciating(true);
    try {
      const res = await runMonthlyDepreciation();
      if (res.count > 0) {
        alert(`Sukses menjalankan penyusutan bulanan untuk ${res.count} aset sebesar Rp ${res.totalAmount.toLocaleString('id-ID')}. Jurnal penyesuaian telah dibuat.`);
      } else {
        alert('Tidak ada aset tetap yang memerlukan penyusutan saat ini (sudah disusutkan penuh).');
      }
    } catch (err: any) {
      alert(`Gagal menjalankan penyusutan: ${err.message}`);
    } finally {
      setIsDepreciating(false);
    }
  };

  // Total Nilai Persediaan
  const totalInventoryValue = products.reduce((sum, p) => sum + (p.stockQty * p.averageCost), 0);

  // Rekonsiliasi Bank
  const handleBankMatch = async (stmtId: string, statementDesc: string, amount: number) => {
    setReconcilingId(stmtId);
    try {
      const statementDate = new Date().toISOString().split('T')[0];
      const matchResult = await reconcileBankStatement(journals, statementDate, statementDesc, amount, stmtId);

      if (matchResult.matched && matchResult.matchedJournalId) {
        alert(`Berhasil merekonsiliasi dengan Jurnal: ${matchResult.matchedJournalId} (Skor AI: ${matchResult.confidenceScore}%)`);
        
        // Picu pembaruan data secara langsung
        const event = new CustomEvent('db-update');
        window.dispatchEvent(event);
        fetchData();
      } else {
        alert('Tidak ditemukan kecocokan transaksi bank.');
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
        j.lines.forEach((l: any) => {
          dataToExport.push({
            'ID Jurnal': j.id,
            'Tanggal': j.date,
            'Deskripsi': j.description,
            'Kode Akun': l.accountCode,
            'Nama Akun': accounts.find(a => a.code === l.accountCode)?.name || '',
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

  const handleSaveNewStockTake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newStockTakeItems.length === 0) {
      alert('Tambahkan minimal 1 item barang untuk opname.');
      return;
    }

    const orderId = `OPN-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    const formattedOrder = {
      id: orderId,
      date: new Date().toISOString().split('T')[0],
      status: 'COMPLETED' as const,
      items: newStockTakeItems.map(i => ({
        stockTakeId: orderId,
        productId: i.productId,
        systemQty: Number(i.systemQty),
        physicalQty: Number(i.physicalQty),
        diffQty: Number(i.physicalQty) - Number(i.systemQty),
        cost: Number(i.cost)
      }))
    };

    try {
      await db.stockTakes.add(formattedOrder);
      setShowNewStockTakeModal(false);
      setNewStockTakeItems([]);
      alert('Stock opname fisik berhasil diposting dan jurnal penyesuaian terbuat otomatis!');
      const event = new CustomEvent('db-update');
      window.dispatchEvent(event);
      fetchData();
    } catch (err: any) {
      alert(`Gagal menyimpan stock opname: ${err.message}`);
    }
  };

  const handlePostDisposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetForDisposal) return;

    try {
      await invoke('dispose_fixed_asset_rust', {
        assetId: selectedAssetForDisposal.id,
        disposalDate,
        disposalValue: Number(disposalValue)
      });
      setShowDisposalModal(false);
      setSelectedAssetForDisposal(null);
      setDisposalValue(0);
      alert('Pelepasan aset tetap sukses dan jurnal penutupan nilai buku diposting otomatis!');
      const event = new CustomEvent('db-update');
      window.dispatchEvent(event);
      fetchData();
    } catch (err: any) {
      alert(`Gagal melepas aset: ${err}`);
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
                    <tr key={j.id} className="cmd-menu-item">
                      <td style={{ verticalAlign: 'top', width: '100px' }}>{j.date}</td>
                      <td style={{ verticalAlign: 'top', width: '90px', fontFamily: 'monospace' }}>{j.id}</td>
                      <td>
                        <div style={{ fontWeight: 600, marginBottom: '6px' }}>{j.description}</div>
                        <div className="jurnal-detail-lines">
                          {j.lines.map((l: any, i: number) => (
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
                        {j.lines.reduce((s: number, l: any) => s + l.debit, 0).toLocaleString('id-ID')}
                      </td>
                      <td className="amount-col" style={{ verticalAlign: 'top' }}>
                        {j.lines.reduce((s: number, l: any) => s + l.credit, 0).toLocaleString('id-ID')}
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
                    <tr key={a.code} className="cmd-menu-item">
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
                 {inventorySubTab === 'OPNAME' ? (
                   <button className="btn btn-primary" onClick={() => {
                     // Inisialisasi item opname awal dari daftar produk yang ada
                     setNewStockTakeItems(products.map(p => ({
                       productId: p.id,
                       systemQty: p.stockQty,
                       physicalQty: p.stockQty,
                       cost: p.averageCost
                     })));
                     setShowNewStockTakeModal(true);
                   }}>
                     <Plus size={14} />
                     <span>Mulai Opname Baru</span>
                   </button>
                 ) : (
                   <button className="btn btn-primary" onClick={() => setShowProductModal(true)}>
                     <Plus size={14} />
                     <span>Tambah Produk</span>
                   </button>
                 )}
               </div>
            </div>

            {/* Sub-tabs Persediaan */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px', marginTop: '12px' }}>
              {(['BARANG', 'GUDANG', 'OPNAME'] as const).map(subTab => (
                <button
                  key={subTab}
                  onClick={() => setInventorySubTab(subTab)}
                  style={{
                    background: inventorySubTab === subTab ? 'rgba(255,255,255,0.08)' : 'transparent',
                    border: 'none',
                    color: inventorySubTab === subTab ? '#ffffff' : '#9ca3af',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: inventorySubTab === subTab ? '500' : '400',
                  }}
                >
                  {subTab === 'BARANG' && 'Daftar Barang & Mutasi'}
                  {subTab === 'GUDANG' && 'Sebaran Gudang'}
                  {subTab === 'OPNAME' && 'Stock Opname Fisik'}
                </button>
              ))}
            </div>

            {/* SUB TAB 1: DAFTAR BARANG */}
            {inventorySubTab === 'BARANG' && (
              <>
                <div style={{ fontWeight: 600, fontSize: '12px', marginTop: '16px', marginBottom: '8px', color: 'var(--text-secondary)' }}>Daftar Produk</div>
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
                        <tr key={p.id} className="cmd-menu-item">
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

                <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '8px', color: 'var(--text-secondary)' }}>Mutasi Stok Terbaru</div>
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
                          <tr key={log.id} className="cmd-menu-item">
                            <td>{log.date}</td>
                            <td>{prod ? `${prod.name} (${prod.sku})` : 'Produk tidak dikenal'}</td>
                            <td>
                              <span style={{
                                fontSize: '10px',
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
                            <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{log.reference || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* SUB TAB 2: SEBARAN GUDANG */}
            {inventorySubTab === 'GUDANG' && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '8px', color: 'var(--text-secondary)' }}>Stok per Gudang</div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Nama Produk</th>
                        <th style={{ textAlign: 'right' }}>{warehouses[0]?.name || 'Gudang Utama'} ({warehouses[0]?.id || 'w-01'})</th>
                        <th style={{ textAlign: 'right' }}>{warehouses[1]?.name || 'Gudang Transit'} ({warehouses[1]?.id || 'w-02'})</th>
                        <th style={{ textAlign: 'right' }}>Total Stok</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map(p => {
                        // Hitung stok riil dari log inventaris untuk masing-masing gudang
                        const getStockByWarehouse = (productId: string, warehouseId: string) => {
                          return inventoryLogs
                            .filter(log => log.productId === productId && log.warehouseId === warehouseId)
                            .reduce((total, log) => {
                              if (log.type === 'MASUK') {
                                return total + log.qty;
                              } else if (log.type === 'KELUAR') {
                                return total - log.qty;
                              } else if (log.type === 'ADJUSTMENT') {
                                return total + log.qty;
                              }
                              return total;
                            }, 0);
                        };

                        const calcMainQty = getStockByWarehouse(p.id, 'w-01');
                        const calcTransitQty = getStockByWarehouse(p.id, 'w-02');
                        // Fallback jika tidak ada log mutasi tetapi produk memiliki data stok di tabel produk
                        const totalCalc = calcMainQty + calcTransitQty;
                        const mainQty = totalCalc === 0 && p.stockQty > 0 ? p.stockQty : calcMainQty;
                        const transitQty = calcTransitQty;

                        return (
                          <tr key={p.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.sku}</td>
                            <td>{p.name}</td>
                            <td className="amount-col">{mainQty} Unit</td>
                            <td className="amount-col">{transitQty} Unit</td>
                            <td className="amount-col" style={{ fontWeight: 600 }}>{p.stockQty} Unit</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB TAB 3: STOCK OPNAME FISIK */}
            {inventorySubTab === 'OPNAME' && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '8px', color: 'var(--text-secondary)' }}>Riwayat Stock Opname Fisik</div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID Opname</th>
                        <th>Tanggal</th>
                        <th>Jumlah Produk</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockTakes.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            Belum ada riwayat stock opname fisik.
                          </td>
                        </tr>
                      ) : (
                        stockTakes.map(st => (
                          <tr key={st.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{st.id}</td>
                            <td>{st.date}</td>
                            <td>{st.items?.length || 0} Barang</td>
                            <td style={{ color: 'var(--accent-success)' }}>{st.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
                  <div key={r.code} className="cmd-menu-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '13px', borderRadius: '4px' }}>
                    <span>{r.code} - {r.name}</span>
                    <span style={{ fontFamily: 'monospace' }}>Rp {r.amount.toLocaleString('id-ID')}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontWeight: 600, background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                  <span>Total Pendapatan</span>
                  <span style={{ fontFamily: 'monospace' }}>Rp {plReport.totalRevenue.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {/* Beban */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px' }}>BEBAN OPERASIONAL</div>
                {plReport.expenses.map((e: any) => (
                  <div key={e.code} className="cmd-menu-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '13px', borderRadius: '4px' }}>
                    <span>{e.code} - {e.name}</span>
                    <span style={{ fontFamily: 'monospace' }}>Rp {e.amount.toLocaleString('id-ID')}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontWeight: 600, background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
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

        {/* Tab: NERACA SALDO */}
        {activeTab === 'NERACASALDO' && (
          <TrialBalance />
        )}

        {/* Tab: ARUS KAS */}
        {activeTab === 'ARUSKAS' && (
          <CashFlow />
        )}

        {/* Tab: PERUBAHAN EKUITAS */}
        {activeTab === 'EKUITAS' && equityReport && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Laporan Perubahan Ekuitas</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Periode:</span>
                <input 
                  type="date" 
                  value={equityStartDate} 
                  onChange={(e) => setEquityStartDate(e.target.value)} 
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>s/d</span>
                <input 
                  type="date" 
                  value={equityEndDate} 
                  onChange={(e) => setEquityEndDate(e.target.value)} 
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}
                />
              </div>
            </div>

            <div className="table-wrapper" style={{ padding: '24px' }}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontFamily: 'var(--font-display)' }}>AKUNTA</h2>
                <h4 style={{ color: 'var(--text-secondary)' }}>Laporan Perubahan Ekuitas</h4>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Untuk Periode yang Berakhir dari {equityStartDate} sampai {equityEndDate}
                </div>
              </div>

              <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
                  <span>Modal Awal Pemilik</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>Rp {equityReport.startEquity.toLocaleString('id-ID')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', color: 'var(--accent-success)' }}>
                  <span>(+) Tambahan Investasi Pemilik</span>
                  <span style={{ fontFamily: 'monospace' }}>Rp {equityReport.additionalInvestment.toLocaleString('id-ID')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', color: 'var(--accent-secondary)' }}>
                  <span>(+) Laba Bersih Periode Berjalan</span>
                  <span style={{ fontFamily: 'monospace' }}>Rp {equityReport.netProfit.toLocaleString('id-ID')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', color: 'var(--accent-danger)', borderBottom: '1px solid var(--border-color)' }}>
                  <span>(-) Penarikan Prive Pemilik</span>
                  <span style={{ fontFamily: 'monospace' }}>Rp ({equityReport.prive.toLocaleString('id-ID')})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', fontWeight: 700, background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', marginTop: '8px' }}>
                  <span>MODAL AKHIR PEMILIK</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--accent-primary)' }}>Rp {equityReport.endEquity.toLocaleString('id-ID')}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Tab: AGING AR/AP */}
        {activeTab === 'AGING' && agingReport && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                Laporan Umur {agingReportType === 'AR' ? 'Piutang (Aging AR)' : 'Utang (Aging AP)'}
              </h3>
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-input)', padding: '2px', borderRadius: 'var(--radius-sm)' }}>
                <button 
                  className={`btn ${agingReportType === 'AR' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 12px', fontSize: '11px', margin: 0 }}
                  onClick={() => setAgingReportType('AR')}
                >
                  Piutang Usaha (AR)
                </button>
                <button 
                  className={`btn ${agingReportType === 'AP' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 12px', fontSize: '11px', margin: 0 }}
                  onClick={() => setAgingReportType('AP')}
                >
                  Utang Usaha (AP)
                </button>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Kontak / Mitra</th>
                    <th style={{ textAlign: 'right' }}>Belum Jatuh Tempo / 0-30 Hari</th>
                    <th style={{ textAlign: 'right' }}>31 - 60 Hari</th>
                    <th style={{ textAlign: 'right' }}>61 - 90 Hari</th>
                    <th style={{ textAlign: 'right' }}>&gt; 90 Hari</th>
                    <th style={{ textAlign: 'right' }}>Total Tagihan</th>
                  </tr>
                </thead>
                <tbody>
                  {agingReport.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                        Tidak ada invoice outstanding ({agingReportType === 'AR' ? 'piutang' : 'utang'}) yang ditemukan.
                      </td>
                    </tr>
                  ) : (
                    agingReport.items.map((item: any) => (
                      <tr key={item.contactId}>
                        <td style={{ fontWeight: 600 }}>{item.contactName}</td>
                        <td className="amount-col">Rp {item.current.toLocaleString('id-ID')}</td>
                        <td className="amount-col" style={{ color: item.period31To60 > 0 ? 'var(--accent-warning)' : 'inherit' }}>
                          Rp {item.period31To60.toLocaleString('id-ID')}
                        </td>
                        <td className="amount-col" style={{ color: item.period61To90 > 0 ? 'rgba(234, 179, 8, 0.9)' : 'inherit' }}>
                          Rp {item.period61To90.toLocaleString('id-ID')}
                        </td>
                        <td className="amount-col" style={{ color: item.over90 > 0 ? 'var(--accent-danger)' : 'inherit', fontWeight: item.over90 > 0 ? 600 : 'normal' }}>
                          Rp {item.over90.toLocaleString('id-ID')}
                        </td>
                        <td className="amount-col" style={{ fontWeight: 700 }}>
                          Rp {item.total.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))
                  )}
                  {agingReport.items.length > 0 && (
                    <tr style={{ fontWeight: 700, background: 'rgba(255,255,255,0.02)', borderTop: '2px solid var(--border-color)' }}>
                      <td>TOTAL</td>
                      <td className="amount-col">Rp {agingReport.totalCurrent.toLocaleString('id-ID')}</td>
                      <td className="amount-col">Rp {agingReport.total31_60.toLocaleString('id-ID')}</td>
                      <td className="amount-col">Rp {agingReport.total61_90.toLocaleString('id-ID')}</td>
                      <td className="amount-col">Rp {agingReport.totalOver90.toLocaleString('id-ID')}</td>
                      <td className="amount-col" style={{ color: 'var(--accent-primary)' }}>
                        Rp {agingReport.grandTotal.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Diagram/Bar Visual sederhana untuk representasi umur */}
            {agingReport.items.length > 0 && (
              <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginTop: '20px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Distribusi Risiko Umur Tagihan</h4>
                <div style={{ display: 'flex', height: '24px', borderRadius: '4px', overflow: 'hidden' }}>
                  {agingReport.grandTotal > 0 ? (
                    <>
                      <div 
                        style={{ width: `${(agingReport.totalCurrent / agingReport.grandTotal) * 100}%`, background: 'var(--accent-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'black', fontWeight: 700 }}
                        title={`Lancar: Rp ${agingReport.totalCurrent.toLocaleString('id-ID')}`}
                      >
                        {agingReport.totalCurrent > 0 && `${Math.round((agingReport.totalCurrent / agingReport.grandTotal) * 100)}%`}
                      </div>
                      <div 
                        style={{ width: `${(agingReport.total31_60 / agingReport.grandTotal) * 100}%`, background: 'var(--accent-warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'black', fontWeight: 700 }}
                        title={`31-60 hari: Rp ${agingReport.total31_60.toLocaleString('id-ID')}`}
                      >
                        {agingReport.total31_60 > 0 && `${Math.round((agingReport.total31_60 / agingReport.grandTotal) * 100)}%`}
                      </div>
                      <div 
                        style={{ width: `${(agingReport.total61_90 / agingReport.grandTotal) * 100}%`, background: 'rgba(234, 179, 8, 0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'black', fontWeight: 700 }}
                        title={`61-90 hari: Rp ${agingReport.total61_90.toLocaleString('id-ID')}`}
                      >
                        {agingReport.total61_90 > 0 && `${Math.round((agingReport.total61_90 / agingReport.grandTotal) * 100)}%`}
                      </div>
                      <div 
                        style={{ width: `${(agingReport.totalOver90 / agingReport.grandTotal) * 100}%`, background: 'var(--accent-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'white', fontWeight: 700 }}
                        title={`>90 hari: Rp ${agingReport.totalOver90.toLocaleString('id-ID')}`}
                      >
                        {agingReport.totalOver90 > 0 && `${Math.round((agingReport.totalOver90 / agingReport.grandTotal) * 100)}%`}
                      </div>
                    </>
                  ) : (
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                      Tidak ada data grafik
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '8px', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--accent-success)', borderRadius: '50%' }}></span>
                    0-30 Hari
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--accent-warning)', borderRadius: '50%' }}></span>
                    31-60 Hari
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'rgba(234, 179, 8, 0.9)', borderRadius: '50%' }}></span>
                    61-90 Hari
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--accent-danger)', borderRadius: '50%' }}></span>
                    &gt;90 Hari
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Tab: ASET TETAP (Fase 2) */}
        {activeTab === 'ASETTETAP' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Daftar Aset Tetap</h3>
                <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Kelola aset tetap dan jalankan kalkulasi akumulasi penyusutan bulanan (Metode Garis Lurus).</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary" onClick={() => setShowAssetModal(true)}>
                  <Plus size={12} />
                  <span>Tambah Aset Tetap</span>
                </button>
                <button className="btn btn-secondary" onClick={handleRunDepreciation} disabled={isDepreciating}>
                  <Play size={12} />
                  <span>{isDepreciating ? 'Memproses...' : 'Jalankan Penyusutan Bulanan'}</span>
                </button>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nama Aset</th>
                    <th>Tanggal Perolehan</th>
                    <th style={{ textAlign: 'right' }}>Harga Perolehan (Rp)</th>
                    <th style={{ textAlign: 'right' }}>Nilai Residu (Rp)</th>
                    <th>Umur Ekonomis</th>
                    <th style={{ textAlign: 'right' }}>Penyusutan Bulanan (Rp)</th>
                    <th style={{ textAlign: 'right' }}>Akumulasi Penyusutan (Rp)</th>
                    <th style={{ textAlign: 'right' }}>Nilai Buku (Rp)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fixedAssets.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                        Tidak ada aset tetap terdaftar.
                      </td>
                    </tr>
                  ) : (
                    fixedAssets.map(asset => {
                      const bookValue = asset.cost - asset.accumulatedDepreciation;
                      return (
                        <tr key={asset.id} className="cmd-menu-item">
                          <td><strong>{asset.name}</strong></td>
                          <td>{asset.purchaseDate}</td>
                          <td style={{ textAlign: 'right' }}>Rp {asset.cost.toLocaleString('id-ID')}</td>
                          <td style={{ textAlign: 'right' }}>Rp {asset.salvageValue.toLocaleString('id-ID')}</td>
                          <td>{asset.usefulLifeYears} Tahun</td>
                          <td style={{ textAlign: 'right' }}><MonthlyDepreciationCell asset={asset} /></td>
                          <td style={{ textAlign: 'right' }}>Rp {asset.accumulatedDepreciation.toLocaleString('id-ID')}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>Rp {bookValue.toLocaleString('id-ID')}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {asset.status === 'DISPOSED' ? (
                                <span style={{ color: 'var(--accent-danger)', fontWeight: 600 }}>Dilepas</span>
                              ) : asset.isFullyDepreciated ? (
                                <span style={{ color: 'var(--accent-success)', fontWeight: 600 }}>Fully Depreciated</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>Penyusutan Berjalan</span>
                              )}
                              
                              {asset.status !== 'DISPOSED' && (
                                <button 
                                  className="btn btn-secondary" 
                                  style={{ padding: '2px 6px', fontSize: '10px' }}
                                  onClick={() => {
                                    setSelectedAssetForDisposal(asset);
                                    setShowDisposalModal(true);
                                  }}
                                >
                                  Lepas
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 6: BANK & PAJAK */}
        {activeTab === 'PAJAK' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Ringkasan Saldo Pajak */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div style={{ background: 'var(--bg-card)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>e-Faktur PPN Masukan</span>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: 'var(--accent-success)' }}>
                  Rp {taxSummary.ppnMasukan.toLocaleString('id-ID')}
                </h3>
              </div>
              <div style={{ background: 'var(--bg-card)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>e-Faktur PPN Keluaran</span>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: 'var(--accent-warning)' }}>
                  Rp {taxSummary.ppnKeluaran.toLocaleString('id-ID')}
                </h3>
              </div>
              <div style={{ background: 'var(--bg-card)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Utang Pajak PPh 21</span>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: 'var(--accent-danger)' }}>
                  Rp {taxSummary.pph21.toLocaleString('id-ID')}
                </h3>
              </div>
            </div>
            
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div style={{ flex: 1, background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: '12px' }}>e-Faktur Pajak ( simulator )</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Unduh template e-Faktur PPN (Masukan/Keluaran) dan e-Bupot PPh (21/23) dari sistem untuk pelaporan DJP.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <button className="btn btn-secondary" onClick={() => handleExportEFaktur('MASUKAN')}>
                    <Download size={12} />
                    <span>e-Faktur PPN Masukan</span>
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleExportEFaktur('KELUARAN')}>
                    <Download size={12} />
                    <span>e-Faktur PPN Keluaran</span>
                  </button>
                  <button className="btn btn-secondary" onClick={handleExportEBupot}>
                    <Download size={12} />
                    <span>e-Bupot PPh 21</span>
                  </button>
                  <button className="btn btn-secondary" onClick={handleExportEBupot23}>
                    <Download size={12} />
                    <span>e-Bupot PPh 23</span>
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Database size={16} />
                    <span>Cadangan & Pemulihan (Backup)</span>
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Ekspor seluruh database lokal (IndexedDB) Akunta ke file JSON portabel.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={handleDownloadBackup}>
                    <Download size={12} />
                    <span>Unduh Backup</span>
                  </button>
                  <label className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
                    <Upload size={12} />
                    <span>Unggah Backup</span>
                    <input 
                      type="file" 
                      accept=".json" 
                      style={{ display: 'none' }} 
                      onChange={handleUploadBackup} 
                    />
                  </label>
                  <button 
                    className="btn btn-danger" 
                    onClick={handleResetDatabase}
                    style={{ 
                      background: 'var(--accent-danger)', 
                      color: 'white', 
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600
                    }}
                  >
                    <Trash2 size={12} />
                    <span>Reset Data</span>
                  </button>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle size={16} style={{ color: 'var(--accent-success)' }} />
                    <span>Tutup Buku Periodik</span>
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Kunci entri transaksi sebelum/pada tanggal penutupan. Pendapatan & Beban dinolkan ke Laba Ditahan.
                  </p>
                  <div style={{ marginBottom: '16px', fontSize: '12px' }}>
                    Status Kunci Buku: <strong style={{ color: currentLockDate ? 'var(--accent-warning)' : 'var(--text-secondary)' }}>
                      {currentLockDate ? `Terkunci s/d ${currentLockDate}` : 'Bebas (Belum dikunci)'}
                    </strong>
                  </div>
                </div>
                <button 
                  className="btn btn-primary" 
                  onClick={() => setShowClosePeriodModal(true)}
                  style={{ width: 'fit-content' }}
                >
                  <Play size={12} />
                  <span>Jalankan Tutup Buku</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'PENJUALAN' && (
          <SalesManager />
        )}

        {activeTab === 'PEMBELIAN' && (
          <PurchaseManager />
        )}

      </div>

      {/* Modal Tutup Buku */}
      {showClosePeriodModal && (
        <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '450px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Jalankan Tutup Buku Periodik</h3>
              <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowClosePeriodModal(false)}>
                <X size={18} className="hover-scale" />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '8px', fontSize: '11px', color: 'var(--accent-danger)', lineHeight: '1.5' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={14} />
                  <span>PERINGATAN PENTING</span>
                </div>
                Proses tutup buku akan mengunci transaksi sebelum/pada tanggal penutupan. 
                Sistem akan membuat jurnal penutup otomatis untuk menolkan saldo akun Pendapatan & Beban, serta memindahkan laba bersih ke Laba Ditahan. Tindakan ini tidak dapat dibatalkan secara instan.
              </div>

              <div className="form-group">
                <label className="form-label">Tanggal Penutupan Buku</label>
                <input 
                  type="date" 
                  className="form-input focus-glow" 
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px', width: '100%' }} 
                  value={closePeriodDate} 
                  onChange={e => setClosePeriodDate(e.target.value)} 
                  required 
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowClosePeriodModal(false)}
                >
                  Batal
                </button>
                <button 
                  className="btn btn-primary" 
                  style={{ background: 'var(--accent-primary)', color: 'black' }}
                  onClick={handleClosePeriod}
                >
                  Proses Tutup Buku
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Jurnal Manual */}
      {showJurnalModal && (
        <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '550px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Catat Jurnal Manual</h3>
              <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowJurnalModal(false)}>
                <X size={18} className="hover-scale" />
              </button>
            </div>
            <form onSubmit={handleSaveJurnalManual} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Tanggal</label>
                  <input type="date" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} value={jurnalDate} onChange={e => setJurnalDate(e.target.value)} required />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Keterangan Jurnal</label>
                  <input type="text" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: Penyesuaian akhir bulan" value={jurnalDesc} onChange={e => setJurnalDesc(e.target.value)} required />
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
                    className="form-input focus-glow" 
                    style={{ flex: 1, textAlign: 'right', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} 
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
                    className="form-input focus-glow" 
                    style={{ flex: 1, textAlign: 'right', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} 
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

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary hover-scale" onClick={() => setJurnalLines([...jurnalLines, { accountCode: '', debit: 0, credit: 0 }])}>
                  + Tambah Baris
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn btn-secondary hover-scale" onClick={() => setShowJurnalModal(false)}>Batal</button>
                  <button type="submit" className="btn btn-primary hover-scale">Simpan Jurnal</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Produk (Fase 2) */}
      {showProductModal && (
        <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Tambah Produk Baru</h3>
              <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowProductModal(false)}>
                <X size={18} className="hover-scale" />
              </button>
            </div>
            <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Nama Produk</label>
                <input type="text" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: Kopi Arabika Lintong" value={newProductName} onChange={e => setNewProductName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">SKU Produk</label>
                <input type="text" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: KOPI-LNTG" value={newProductSku} onChange={e => setNewProductSku(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Harga Jual per Unit (Rp)</label>
                <input type="number" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: 65000" value={newProductPrice || ''} onChange={e => setNewProductPrice(parseFloat(e.target.value) || 0)} required />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary hover-scale" onClick={() => setShowProductModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary hover-scale">Simpan Produk</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Stock Adjustment (Fase 2) */}
      {showAdjustModal && (
        <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Stock Opname / Adjustment</h3>
              <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowAdjustModal(false)}>
                <X size={18} className="hover-scale" />
              </button>
            </div>
            <form onSubmit={handleSaveStockAdjustment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Pilih Produk</label>
                <select className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} value={adjustProductId} onChange={e => setAdjustProductId(e.target.value)} required>
                  <option value="">Pilih...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku}) - Sisa Stok: {p.stockQty} unit</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Jumlah Stok Riil yang Baru</label>
                <input type="number" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: 12" value={adjustQty || ''} onChange={e => setAdjustQty(parseInt(e.target.value) || 0)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Alasan Penyesuaian</label>
                <input type="text" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: Stock Opname Juni 2026 / Barang Rusak" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} required />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary hover-scale" onClick={() => setShowAdjustModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary hover-scale">Post Penyesuaian</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Stock Opname Fisik Baru */}
      {showNewStockTakeModal && (
        <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Stock Opname Fisik Baru</h3>
              <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowNewStockTakeModal(false)}>
                <X size={18} className="hover-scale" />
              </button>
            </div>
            <form onSubmit={handleSaveNewStockTake} className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                                setNewStockTakeItems(updated);
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
                <button type="button" className="btn btn-secondary hover-scale" onClick={() => setShowNewStockTakeModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary hover-scale">Post Hasil Opname</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Pelepasan Aset (Disposal) */}
      {showDisposalModal && selectedAssetForDisposal && (
        <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Pelepasan / Penjualan Aset</h3>
              <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => {
                setShowDisposalModal(false);
                setSelectedAssetForDisposal(null);
              }}>
                <X size={18} className="hover-scale" />
              </button>
            </div>
            <form onSubmit={handlePostDisposal} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                Aset: <strong>{selectedAssetForDisposal.name}</strong><br/>
                Nilai Buku: <strong>Rp {(selectedAssetForDisposal.cost - selectedAssetForDisposal.accumulatedDepreciation).toLocaleString('id-ID')}</strong>
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal Pelepasan</label>
                <input type="date" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} value={disposalDate} onChange={e => setDisposalDate(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Nilai Jual / Pelepasan (Rp)</label>
                <input type="number" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: 5000000 (isi 0 jika dibuang)" value={disposalValue} onChange={e => setDisposalValue(parseFloat(e.target.value) || 0)} required />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary hover-scale" onClick={() => {
                  setShowDisposalModal(false);
                  setSelectedAssetForDisposal(null);
                }}>Batal</button>
                <button type="submit" style={{ background: 'var(--accent-danger)', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600', boxShadow: '0 4px 12px rgba(225, 28, 40, 0.25)' }} className="hover-scale">Post Pelepasan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Aset Tetap (Fase 2) */}
      {showAssetModal && (
        <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px', width: '420px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Tambah Aset Tetap Baru</h3>
              <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowAssetModal(false)}>
                <X size={18} className="hover-scale" />
              </button>
            </div>
            <form onSubmit={handleAddFixedAsset} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Nama Aset Tetap</label>
                <input type="text" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: Mesin Espresso, Komputer Kasir" value={assetName} onChange={e => setAssetName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal Pembelian</label>
                <input type="date" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} value={assetPurchaseDate} onChange={e => setAssetPurchaseDate(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Harga Perolehan (Rp)</label>
                <input type="number" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: 15000000" value={assetCost || ''} onChange={e => setAssetCost(parseFloat(e.target.value) || 0)} required />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Umur Ekonomis (Thn)</label>
                  <input type="number" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: 5" value={assetLifeYears || ''} onChange={e => setAssetLifeYears(parseInt(e.target.value) || 0)} required />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Residu / Sisa (Rp)</label>
                  <input type="number" className="form-input focus-glow" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-input)', padding: '6px 8px', borderRadius: '6px' }} placeholder="contoh: 3000000" value={assetSalvage || ''} onChange={e => setAssetSalvage(parseFloat(e.target.value) || 0)} required />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary hover-scale" onClick={() => setShowAssetModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary hover-scale">Simpan Aset</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Diagnosis Laporan */}
      {showDiagnosisModal && (
        <div className="modal-overlay modal-overlay-premium" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel glow-pulse-border" style={{ padding: '24px', borderRadius: '12px', width: '500px', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} style={{ color: 'var(--accent-primary)' }} />
                <span>Diagnosis AI Akunta</span>
              </h3>
              <button style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowDiagnosisModal(false)}>
                <X size={18} className="hover-scale" />
              </button>
            </div>
            <div className="custom-scrollbar" style={{ fontSize: '12.5px', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', overflowY: 'auto', maxHeight: '50vh', paddingRight: '4px' }}>
              {diagnosisText}
              {isDiagnosing && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                  <div style={{ width: '24px', height: '24px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
