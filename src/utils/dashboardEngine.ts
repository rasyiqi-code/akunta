import { db } from './db';

export interface ReceivableAlert {
  id: string;
  type: 'RED' | 'YELLOW';
  text: string;
}

/**
 * Menganalisis piutang usaha (akun 1104) secara FIFO aging.
 * Termin default Net 30 hari dari tanggal transaksi.
 */
export function analyzeReceivablesFIFO(journalList: any[]): ReceivableAlert[] {
  // Urutkan jurnal dari tanggal terlama ke terbaru (FIFO)
  const sortedJournals = [...journalList].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  interface Receivable {
    id: string;
    date: string;
    description: string;
    debit: number;
    remaining: number;
  }
  
  const debitEntries: Receivable[] = [];
  let totalCredit = 0;

  for (const j of sortedJournals) {
    if (!j.lines) continue;
    for (const line of j.lines) {
      if (line.accountCode === '1104') {
        if (line.debit > 0) {
          debitEntries.push({
            id: j.id,
            date: j.date,
            description: j.description,
            debit: line.debit,
            remaining: line.debit
          });
        }
        if (line.credit > 0) {
          totalCredit += line.credit;
        }
      }
    }
  }

  // Alokasikan total pelunasan piutang secara FIFO
  let tempCredit = totalCredit;
  for (const entry of debitEntries) {
    if (tempCredit <= 0) break;
    if (tempCredit >= entry.remaining) {
      tempCredit -= entry.remaining;
      entry.remaining = 0;
    } else {
      entry.remaining -= tempCredit;
      tempCredit = 0;
    }
  }

  // Filter piutang aktif yang masih memiliki sisa saldo (remaining > 0)
  const activeReceivables = debitEntries.filter(e => e.remaining > 0);
  
  // Hitung aging jatuh tempo
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset jam untuk kalkulasi hari bersih
  const alertsList: ReceivableAlert[] = [];

  activeReceivables.forEach((rec, idx) => {
    const txDate = new Date(rec.date);
    const dueDate = new Date(txDate);
    dueDate.setDate(dueDate.getDate() + 30); // Tambah 30 hari jatuh tempo
    
    const diffTime = today.getTime() - dueDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // positif jika terlewat

    if (diffDays > 7) {
      alertsList.push({
        id: `rec-critical-${rec.id}-${idx}`,
        type: 'RED',
        text: `🚨 **Piutang Kritis:** Tagihan dari **"${rec.description}"** sebesar Rp ${rec.remaining.toLocaleString('id-ID')} telah menunggak ${diffDays} hari melewati jatuh tempo.`
      });
    } else if (diffDays >= 0 && diffDays <= 7) {
      alertsList.push({
        id: `rec-due-${rec.id}-${idx}`,
        type: 'YELLOW',
        text: `⚠️ **Piutang Jatuh Tempo:** Tagihan **"${rec.description}"** sebesar Rp ${rec.remaining.toLocaleString('id-ID')} telah lewat jatuh tempo ${diffDays === 0 ? 'hari ini' : `${diffDays} hari`}.`
      });
    } else {
      const daysToDue = Math.abs(diffDays);
      if (daysToDue <= 3) {
        alertsList.push({
          id: `rec-warning-${rec.id}-${idx}`,
          type: 'YELLOW',
          text: `⏳ **Piutang Dekat Tempo:** Tagihan **"${rec.description}"** sebesar Rp ${rec.remaining.toLocaleString('id-ID')} akan jatuh tempo dalam ${daysToDue} hari.`
        });
      }
    }
  });

  return alertsList;
}

/**
 * Memeriksa produk fisik yang memiliki stok kritis di bawah reorder point (5 unit)
 */
export async function getCriticalStockProducts(): Promise<any[]> {
  try {
    const productList = await db.products.toArray();
    return productList.filter(p => p.stockQty < 5);
  } catch (err) {
    console.error('Gagal memeriksa stok kritis:', err);
    return [];
  }
}
