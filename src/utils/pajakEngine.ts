import { db } from './db';
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
 * Menghitung ringkasan pajak secara NATIVE di Rust backend via Tauri.
 */
export async function getTaxSummary(): Promise<{
  ppnMasukan: number;
  ppnKeluaran: number;
  pph21: number;
  pph23: number;
  transactions: TaxTransaction[];
}> {
  try {
    const journals = await db.journals.toArray();
    
    // Panggil analisis pajak di Rust native
    const summaryJson = await invoke<string>('process_tax_rust', {
      journalsJson: JSON.stringify(journals)
    });

    return JSON.parse(summaryJson);
  } catch (err: any) {
    console.error('Error processing tax in Rust:', err);
    // Fallback jika tauri tidak tersedia
    return { ppnMasukan: 0, ppnKeluaran: 0, pph21: 0, pph23: 0, transactions: [] };
  }
}

/**
 * Menghasilkan data e-Faktur CSV Simulator secara NATIVE di Rust
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
 * Menghasilkan data e-Bupot CSV Simulator secara NATIVE di Rust
 */
export async function generateEBupotCSV(transactions: TaxTransaction[]): Promise<string> {
  try {
    return await invoke<string>('generate_ebupot_csv_rust', {
      transactionsJson: JSON.stringify(transactions)
    });
  } catch (err: any) {
    console.error('Error generating eBupot CSV in Rust:', err);
    return '';
  }
}
