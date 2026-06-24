import { db } from './db';
import type { JournalEntry } from '../types/ledger';

// Helper untuk generate ID acak
export function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
}

// Validasi apakah jurnal seimbang
export function isJournalBalanced(entry: Omit<JournalEntry, 'id'> | JournalEntry): boolean {
  const totalDebit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
  
  // Menggunakan toleransi pembulatan karena float
  return Math.abs(totalDebit - totalCredit) < 0.01;
}

// Tambah Jurnal Baru dengan validasi
export async function postJournalEntry(entry: Omit<JournalEntry, 'id'> & { id?: string }): Promise<string> {
  if (!isJournalBalanced(entry)) {
    throw new Error('Jurnal tidak seimbang! Total Debit harus sama dengan total Kredit.');
  }

  const newId = entry.id || generateId('JRN');
  const finalEntry: JournalEntry = {
    ...entry,
    id: newId,
  };

  await db.journals.put(finalEntry);
  return newId;
}

// Mengambil detail Buku Besar untuk satu akun
export async function getGeneralLedger(accountCode: string) {
  const journals = await db.journals.orderBy('date').toArray();
  const account = await db.accounts.get(accountCode);
  if (!account) throw new Error('Akun tidak ditemukan');

  let runningBalance = 0;
  const entries: {
    id: string;
    date: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
  }[] = [];

  for (const j of journals) {
    const lines = j.lines.filter(l => l.accountCode === accountCode);
    for (const l of lines) {
      if (account.normalBalance === 'D') {
        runningBalance += l.debit - l.credit;
      } else {
        runningBalance += l.credit - l.debit;
      }
      entries.push({
        id: j.id,
        date: j.date,
        description: j.description,
        debit: l.debit,
        credit: l.credit,
        balance: runningBalance
      });
    }
  }

  return { account, entries, finalBalance: runningBalance };
}

// Hitung saldo semua akun
export async function getAccountBalances(): Promise<Record<string, number>> {
  const accounts = await db.accounts.toArray();
  const journals = await db.journals.toArray();

  const balances: Record<string, number> = {};

  // Inisialisasi saldo nol
  for (const acc of accounts) {
    balances[acc.code] = 0;
  }

  // Akumulasikan dari jurnal
  for (const j of journals) {
    for (const line of j.lines) {
      const acc = accounts.find(a => a.code === line.accountCode);
      if (!acc) continue;

      if (acc.normalBalance === 'D') {
        balances[line.accountCode] += line.debit - line.credit;
      } else {
        balances[line.accountCode] += line.credit - line.debit;
      }
    }
  }

  return balances;
}

// Hitung Laba Rugi
export interface ProfitLossReport {
  revenue: { code: string; name: string; amount: number }[];
  expenses: { code: string; name: string; amount: number }[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

export async function generateProfitLoss(startDate?: string, endDate?: string): Promise<ProfitLossReport> {
  const accounts = await db.accounts.toArray();
  let journals = await db.journals.toArray();

  // Filter tanggal jika ada
  if (startDate || endDate) {
    journals = journals.filter(j => {
      if (startDate && j.date < startDate) return false;
      if (endDate && j.date > endDate) return false;
      return true;
    });
  }

  const revenue: { code: string; name: string; amount: number }[] = [];
  const expenses: { code: string; name: string; amount: number }[] = [];

  let totalRevenue = 0;
  let totalExpenses = 0;

  for (const acc of accounts) {
    if (acc.type !== 'PENDAPATAN' && acc.type !== 'BEBAN') continue;

    let balance = 0;
    for (const j of journals) {
      for (const line of j.lines) {
        if (line.accountCode === acc.code) {
          if (acc.normalBalance === 'D') {
            balance += line.debit - line.credit;
          } else {
            balance += line.credit - line.debit;
          }
        }
      }
    }

    if (acc.type === 'PENDAPATAN') {
      revenue.push({ code: acc.code, name: acc.name, amount: balance });
      totalRevenue += balance;
    } else {
      expenses.push({ code: acc.code, name: acc.name, amount: balance });
      totalExpenses += balance;
    }
  }

  return {
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
  };
}

// Hitung Neraca (Balance Sheet)
export interface BalanceSheetReport {
  assets: { code: string; name: string; amount: number }[];
  liabilities: { code: string; name: string; amount: number }[];
  equity: { code: string; name: string; amount: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export async function generateBalanceSheet(): Promise<BalanceSheetReport> {
  const accounts = await db.accounts.toArray();
  const balances = await getAccountBalances();
  
  // Hitung laba bersih berjalan untuk masuk ke ekuitas
  const pl = await generateProfitLoss();
  const netProfit = pl.netProfit;

  const assets: { code: string; name: string; amount: number }[] = [];
  const liabilities: { code: string; name: string; amount: number }[] = [];
  const equity: { code: string; name: string; amount: number }[] = [];

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  for (const acc of accounts) {
    const balance = balances[acc.code] || 0;

    if (acc.type === 'ASET') {
      assets.push({ code: acc.code, name: acc.name, amount: balance });
      totalAssets += balance;
    } else if (acc.type === 'KEWAJIBAN') {
      liabilities.push({ code: acc.code, name: acc.name, amount: balance });
      totalLiabilities += balance;
    } else if (acc.type === 'EKUITAS') {
      let finalBalance = balance;
      // Jika Laba Ditahan, tambahkan laba bersih berjalan
      if (acc.code === '3102') {
        finalBalance += netProfit;
      }
      equity.push({ code: acc.code, name: acc.name, amount: finalBalance });
      totalEquity += finalBalance;
    }
  }

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity: totalEquity,
  };
}

// Backup & Restore
export async function exportToBackupString(): Promise<string> {
  const accounts = await db.accounts.toArray();
  const journals = await db.journals.toArray();
  const contacts = await db.contacts.toArray();
  const bankStatements = await db.bankStatements.toArray();

  const backupData = {
    accounts,
    journals,
    contacts,
    bankStatements
  };

  return JSON.stringify(backupData, null, 2);
}

export async function importFromBackupString(jsonString: string): Promise<void> {
  try {
    const data = JSON.parse(jsonString);
    if (!data.accounts || !data.journals || !data.contacts) {
      throw new Error('Format cadangan data tidak valid.');
    }

    // Gunakan transaction untuk menjamin integritas
    await db.transaction('rw', [db.accounts, db.journals, db.contacts, db.bankStatements], async () => {
      await db.accounts.clear();
      await db.journals.clear();
      await db.contacts.clear();
      await db.bankStatements.clear();

      await db.accounts.bulkAdd(data.accounts);
      await db.journals.bulkAdd(data.journals);
      await db.contacts.bulkAdd(data.contacts);
      if (data.bankStatements) {
        await db.bankStatements.bulkAdd(data.bankStatements);
      }
    });
  } catch (error: any) {
    throw new Error(`Gagal mengimpor data: ${error.message}`);
  }
}
