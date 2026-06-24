import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { TrendingUp, Wallet, AlertTriangle, Info, BellRing } from 'lucide-react';
import { db } from '../../utils/db';
import { getAccountBalances, generateProfitLoss } from '../../utils/ledgerEngine';
import { analyzeReceivablesFIFO, getCriticalStockProducts, ReceivableAlert } from '../../utils/dashboardEngine';

export const WarRoom: React.FC = () => {
  const [cashInToday, setCashInToday] = useState(0);
  const [cashOutToday, setCashOutToday] = useState(0);
  const [totalBankBalance, setTotalBankBalance] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  
  // State untuk melacak data produk kritis dan alert piutang
  const [criticalProducts, setCriticalProducts] = useState<any[]>([]);
  const [receivablesAlerts, setReceivablesAlerts] = useState<ReceivableAlert[]>([]);

  // Reaktif terhadap perubahan database jurnal via React State
  const [journals, setJournals] = useState<any[]>([]);

  // Fungsi untuk mendapatkan sapaan dinamis berdasarkan jam sistem lokal
  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours >= 4 && hours < 11) return 'Selamat pagi';
    if (hours >= 11 && hours < 15) return 'Selamat siang';
    if (hours >= 15 && hours < 18) return 'Selamat sore';
    return 'Selamat malam';
  };

  // Memperbarui notifikasi stok dan piutang dari engine eksternal
  const updateDashboardAnalysis = async (journalList: any[]) => {
    const recAlerts = analyzeReceivablesFIFO(journalList);
    setReceivablesAlerts(recAlerts);
    
    const critProds = await getCriticalStockProducts();
    setCriticalProducts(critProds);
  };

  const fetchJournals = async () => {
    try {
      const list = await db.journals.toArray();
      setJournals(list);
      await updateDashboardAnalysis(list);
    } catch (err) {
      console.error('Gagal memuat jurnal untuk War Room:', err);
    }
  };

  useEffect(() => {
    let active = true;
    let unlistenFn: (() => void) | undefined;

    const setupListener = async () => {
      unlistenFn = await listen('db-update', () => {
        if (active) {
          fetchJournals();
        }
      });
    };

    fetchJournals();
    setupListener();

    return () => {
      active = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  useEffect(() => {
    const calculateDashboardStats = async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const balances = await getAccountBalances();

      // Saldo Bank Gabungan (Kas Utama 1101 + BCA 1102 + Mandiri 1103)
      const cashVal = (balances['1101'] || 0) + (balances['1102'] || 0) + (balances['1103'] || 0);
      setTotalBankBalance(cashVal);

      // Hitung uang masuk & keluar hari ini
      let inToday = 0;
      let outToday = 0;

      const journalsToday = journals.filter(j => j.date === todayStr);
      for (const j of journalsToday) {
        for (const line of j.lines) {
          if (['1101', '1102', '1103'].includes(line.accountCode)) {
            if (line.debit > 0) inToday += line.debit;
            if (line.credit > 0) outToday += line.credit;
          }
        }
      }
      setCashInToday(inToday);
      setCashOutToday(outToday);

      // Laba Bersih Bulan Ini
      const pl = await generateProfitLoss();
      setNetProfit(pl.netProfit);
    };

    calculateDashboardStats();
  }, [journals]);

  // Evaluasi notifikasi berdasarkan data real-time
  const alerts: { type: 'RED' | 'YELLOW' | 'BLUE'; text: string; id: string }[] = [];

  // 1. Masukkan alert piutang dari analisis FIFO
  receivablesAlerts.forEach(a => {
    alerts.push({
      id: a.id,
      type: a.type === 'RED' ? 'RED' : 'YELLOW',
      text: a.text
    });
  });

  // 2. Masukkan alert produk dengan stok kritis
  criticalProducts.forEach(p => {
    alerts.push({
      id: `prod-crit-${p.id}`,
      type: 'YELLOW',
      text: `⚠️ **Stok Kritis:** Produk **"${p.name}"** hanya tersisa **${p.stockQty} unit** (di bawah reorder point 5 unit).`
    });
  });

  // 3. Alert saldo bank di bawah batas aman operasional
  if (totalBankBalance < 5000000) {
    alerts.push({
      id: 'alt-bank',
      type: 'YELLOW',
      text: `⚠️ **Perhatian Saldo:** Total saldo kas/bank Anda saat ini Rp ${totalBankBalance.toLocaleString('id-ID')}, di bawah batas aman operasional harian (Rp 5.000.000).`
    });
  }

  // 4. Cari anomali dari jurnal untuk peringatan audit
  const anomalies = journals.filter(j => j.isAnomaly);
  if (anomalies.length > 0) {
    alerts.push({
      id: 'alt-anom',
      type: 'RED',
      text: `🚨 **Peringatan Audit:** AI mendeteksi ${anomalies.length} transaksi tidak wajar / anomali yang perlu ditinjau ulang di Mode Akuntan.`
    });
  }

  // 5. Tips Keuangan / Info default (hanya muncul jika tidak ada alert kritis)
  if (netProfit < 0) {
    alerts.push({
      id: 'alt-loss',
      type: 'YELLOW',
      text: `📈 **Evaluasi Operasional:** Laba bersih bulan ini bernilai negatif (Rugi Rp ${Math.abs(netProfit).toLocaleString('id-ID')}). Coba batasi biaya operasional non-esensial.`
    });
  } else if (netProfit > 10000000) {
    alerts.push({
      id: 'alt-profit',
      type: 'BLUE',
      text: `🎉 **Performa Luar Biasa:** Laba bersih usaha bulan ini menembus Rp ${netProfit.toLocaleString('id-ID')}. Sangat baik untuk investasi penambahan inventaris.`
    });
  } else {
    if (alerts.length === 0) {
      alerts.push({
        id: 'alt-info',
        type: 'BLUE',
        text: `💡 **Tips Keuangan:** Rutin catat pengeluaran kecil agar Laba Rugi akhir bulan mencerminkan profitabilitas usaha yang akurat.`
      });
    }
  }

  return (
    <div style={{ padding: '10px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      
      {/* Sapaan Personal */}
      <div>
        <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px', color: 'var(--text-primary)' }}>
          {getGreeting()}, Pak Budi!
        </h3>
        <p style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>
          Ringkasan kesehatan finansial usaha Anda per hari ini.
        </p>
      </div>

      {/* Grid Kartu Harian */}
      <div className="financial-card-grid">
        {/* Kas/Bank */}
        <div className="financial-summary-card" style={{ borderLeft: '2px solid var(--accent-primary)' }}>
          <span className="card-label">
            <Wallet size={11} /> Kas/Bank
          </span>
          <div className="card-value">
            Rp {totalBankBalance.toLocaleString('id-ID')}
          </div>
        </div>

        {/* Laba/Rugi */}
        <div className="financial-summary-card" style={{ borderLeft: `2px solid ${netProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'}` }}>
          <span className="card-label">
            <TrendingUp size={11} /> Laba Bersih
          </span>
          <div className="card-value" style={{ color: netProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
            {netProfit < 0 ? '-' : ''}Rp {Math.abs(netProfit).toLocaleString('id-ID')}
          </div>
        </div>

        {/* Uang Masuk Hari Ini */}
        <div className="financial-summary-card" style={{ borderLeft: '2px solid var(--accent-success)' }}>
          <span className="card-label">Uang Masuk Hari Ini</span>
          <div className="card-value" style={{ fontSize: '13px', color: 'var(--accent-success)' }}>
            +Rp {cashInToday.toLocaleString('id-ID')}
          </div>
        </div>

        {/* Uang Keluar Hari Ini */}
        <div className="financial-summary-card" style={{ borderLeft: '2px solid var(--accent-danger)' }}>
          <span className="card-label">Uang Keluar Hari Ini</span>
          <div className="card-value" style={{ fontSize: '13px', color: 'var(--accent-danger)' }}>
            -Rp {cashOutToday.toLocaleString('id-ID')}
          </div>
        </div>
      </div>

      {/* Notifikasi Prioritas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h4 style={{ fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
          <BellRing size={11} />
          <span>Alerts & Analisis AI</span>
        </h4>
        
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`notification-banner ${
              alert.type === 'RED'
                ? 'banner-red'
                : alert.type === 'YELLOW'
                ? 'banner-yellow'
                : 'banner-blue'
            }`}
          >
            {alert.type === 'RED' ? (
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            ) : alert.type === 'YELLOW' ? (
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            ) : (
              <Info size={13} style={{ flexShrink: 0 }} />
            )}
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {alert.text.split('**').map((chunk, idx) => (
                idx % 2 === 1 ? <strong key={idx}>{chunk}</strong> : chunk
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Panduan Input Cepat */}
      <div style={{ background: 'rgba(255,255,255,0.01)', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginTop: 'auto' }}>
        <h5 style={{ fontSize: '10.5px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
          💡 Pintasan Input Percakapan
        </h5>
        <ul style={{ fontSize: '10px', color: 'var(--text-secondary)', paddingLeft: '12px', lineHeight: '1.4' }}>
          <li>"Jual kopi susu 50rb tunai"</li>
          <li>"Beli bahan kopi 1.2jt ngutang"</li>
          <li>"Bayar gaji karyawan 4jt pake BCA"</li>
        </ul>
      </div>

    </div>
  );
};


