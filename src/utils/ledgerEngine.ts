import type { JournalEntry, TrialBalanceReport, CashFlowReport } from '../types/ledger';
import { invoke } from '@tauri-apps/api/core';


// Helper untuk generate ID acak di frontend
export function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
}

// Validasi apakah jurnal seimbang secara NATIVE di Rust
export async function isJournalBalanced(entry: Omit<JournalEntry, 'id'> | JournalEntry): Promise<boolean> {
  try {
    return await invoke<boolean>('is_journal_balanced_rust', {
      entryJson: JSON.stringify(entry)
    });
  } catch (err) {
    console.error('Gagal memvalidasi keseimbangan jurnal di Rust:', err);
    // Fallback minimal jika terjadi kesalahan internal
    const totalDebit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
    return Math.abs(totalDebit - totalCredit) < 0.01;
  }
}

// Tambah Jurnal Baru dengan validasi native di Rust SQLite
export async function postJournalEntry(entry: Omit<JournalEntry, 'id'> & { id?: string }): Promise<string> {
  const newId = entry.id || generateId('JRN');
  const finalEntry: JournalEntry = {
    ...entry,
    id: newId,
  };

  return await invoke<string>('post_journal_entry_rust', {
    entryJson: JSON.stringify(finalEntry)
  });
}

// Mengambil detail Buku Besar untuk satu akun langsung dari SQLite Rust
export async function getGeneralLedger(accountCode: string) {
  try {
    const resultJson = await invoke<string>('generate_general_ledger_rust', {
      accountCode
    });
    return JSON.parse(resultJson);
  } catch (err) {
    console.error('Gagal mengambil buku besar dari Rust:', err);
    throw err;
  }
}

// Hitung saldo semua akun langsung dari SQLite Rust
export async function getAccountBalances(): Promise<Record<string, number>> {
  try {
    const resultJson = await invoke<string>('get_account_balances_rust');
    return JSON.parse(resultJson);
  } catch (err) {
    console.error('Gagal mengambil saldo akun dari Rust:', err);
    return {};
  }
}

// Hitung Laba Rugi langsung dari SQLite Rust
export interface ProfitLossReport {
  revenue: { code: string; name: string; amount: number }[];
  expenses: { code: string; name: string; amount: number }[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

export async function generateProfitLoss(startDate?: string, endDate?: string): Promise<ProfitLossReport> {
  try {
    const resultJson = await invoke<string>('generate_profit_loss_rust', {
      startDate: startDate || null,
      endDate: endDate || null
    });
    return JSON.parse(resultJson);
  } catch (err) {
    console.error('Gagal mengambil laporan Laba Rugi dari Rust:', err);
    return {
      revenue: [],
      expenses: [],
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0
    };
  }
}

// Hitung Neraca (Balance Sheet) langsung dari SQLite Rust
export interface BalanceSheetReport {
  assets: { code: string; name: string; amount: number }[];
  liabilities: { code: string; name: string; amount: number }[];
  equity: { code: string; name: string; amount: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export async function generateBalanceSheet(): Promise<BalanceSheetReport> {
  try {
    const pl = await generateProfitLoss();
    const netProfit = pl.netProfit;

    const resultJson = await invoke<string>('generate_balance_sheet_rust', {
      netProfit
    });
    return JSON.parse(resultJson);
  } catch (err) {
    console.error('Gagal mengambil laporan Neraca dari Rust:', err);
    return {
      assets: [],
      liabilities: [],
      equity: [],
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0
    };
  }
}

// Backup & Restore Native ke Rust SQLite
export async function exportToBackupString(): Promise<string> {
  return await invoke<string>('export_backup_json_rust');
}

export async function importFromBackupString(jsonString: string): Promise<void> {
  return await invoke<void>('import_backup_json_rust', { jsonString });
}

export async function generateTrialBalance(): Promise<TrialBalanceReport> {
  try {
    const resultJson = await invoke<string>('generate_trial_balance_rust');
    return JSON.parse(resultJson);
  } catch (err) {
    console.error('Gagal mengambil Trial Balance dari Rust:', err);
    return { items: [], totalDebit: 0, totalCredit: 0 };
  }
}

export async function generateCashFlow(): Promise<CashFlowReport> {
  try {
    const resultJson = await invoke<string>('generate_cash_flow_rust');
    return JSON.parse(resultJson);
  } catch (err) {
    console.error('Gagal mengambil Laporan Arus Kas dari Rust:', err);
    return {
      operatingReceipts: [],
      operatingPayments: [],
      totalOperating: 0,
      investingReceipts: [],
      investingPayments: [],
      totalInvesting: 0,
      financingReceipts: [],
      financingPayments: [],
      totalFinancing: 0,
      netIncrease: 0,
      startBalance: 0,
      endBalance: 0,
    };
  }
}
