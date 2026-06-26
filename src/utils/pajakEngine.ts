import { invoke } from '@tauri-apps/api/core';

export interface TaxTransaction {
  date: string;
  refId: string;
  description: string;
  dpp: number;
  taxAmount: number;
  taxType: 'PPN_MASUKAN' | 'PPN_KELUARAN' | 'PPH_21' | 'PPH_23';
}

/**
 * Menghitung ringkasan pajak secara NATIVE di Rust backend via SQLite.
 */
export async function getTaxSummary(): Promise<{
  ppnMasukan: number;
  ppnKeluaran: number;
  pph21: number;
  pph23: number;
  transactions: TaxTransaction[];
}> {
  try {
    const summaryJson = await invoke<string>('process_tax_rust');
    return JSON.parse(summaryJson);
  } catch (err: any) {
    console.error('Error processing tax in Rust:', err);
    return { ppnMasukan: 0, ppnKeluaran: 0, pph21: 0, pph23: 0, transactions: [] };
  }
}

/**
 * Menghasilkan data e-Faktur CSV Simulator secara NATIVE di Rust (dengan tanggal valid DD/MM/YYYY)
 */
export async function generateEFakturCSV(transactions: TaxTransaction[], type: 'MASUKAN' | 'KELUARAN'): Promise<string> {
  try {
    const taxType = type === 'MASUKAN' ? 'PPN_MASUKAN' : 'PPN_KELUARAN';
    return await invoke<string>('generate_efaktur_csv_rust', {
      transactionsJson: JSON.stringify(transactions),
      taxType
    });
  } catch (err: any) {
    console.error('Error generating eFaktur CSV in Rust:', err);
    return '';
  }
}

/**
 * Menghasilkan data e-Bupot CSV Simulator secara NATIVE di Rust (dengan tanggal valid DD/MM/YYYY)
 */
export async function generateEBupotCSV(transactions: TaxTransaction[], taxType: 'PPH_21' | 'PPH_23' = 'PPH_21'): Promise<string> {
  try {
    return await invoke<string>('generate_ebupot_csv_rust', {
      transactionsJson: JSON.stringify(transactions),
      taxType
    });
  } catch (err: any) {
    console.error('Error generating eBupot CSV in Rust:', err);
    return '';
  }
}

export interface ReconciliationResult {
  matched: boolean;
  matchedJournalId?: string;
  confidenceScore: number;
  suggestedLines?: { accountCode: string; debit: number; credit: number }[];
  suggestedDescription?: string;
}

/**
 * Merekonstruksi kecocokan mutasi bank secara native di Rust SQLite.
 */
export async function reconcileBankStatement(
  _journals: any[],
  date: string,
  description: string,
  amount: number,
  statementId: string,
  dryRun?: boolean
): Promise<ReconciliationResult> {
  try {
    const resultJson = await invoke<string>('reconcile_bank_statement_rust', {
      statementId,
      date,
      description,
      amount,
      dryRun: dryRun ?? false
    });
    return JSON.parse(resultJson);
  } catch (err: any) {
    console.error('Gagal rekonsiliasi di Rust SQLite:', err);
    throw new Error(err.message || err);
  }
}
