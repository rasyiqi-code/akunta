import { db } from './db';
import type { FixedAsset, JournalEntry, JournalLine } from '../types/ledger';
import { postJournalEntry } from './ledgerEngine';
import { invoke } from '@tauri-apps/api/core';

/**
 * Menghitung penyusutan bulanan (Straight-Line)
 * Dipanggil secara lokal jika diperlukan untuk render cepat
 */
export function calculateMonthlyDepreciation(asset: FixedAsset): number {
  if (asset.usefulLifeYears <= 0) return 0;
  const depreciableAmount = asset.cost - asset.salvageValue;
  const totalMonths = asset.usefulLifeYears * 12;
  return Math.round(depreciableAmount / totalMonths);
}

/**
 * Menjalankan penyusutan aset secara NATIVE di Rust backend via Tauri.
 * Dan memperbarui database lokal offline IndexedDB di frontend.
 */
export async function runMonthlyDepreciation(): Promise<{ count: number; totalAmount: number }> {
  const assets = await db.fixedAssets.toArray();
  const todayStr = new Date().toISOString().split('T')[0];

  try {
    // Panggil logic Rust secara native
    const resultJson = await invoke<string>('calculate_depreciation_rust', {
      assetsJson: JSON.stringify(assets)
    });

    const result = JSON.parse(resultJson);

    // Update database IndexedDB dengan aset yang telah diperbarui oleh Rust
    for (const asset of result.updatedAssets) {
      await db.fixedAssets.put(asset);
    }

    // Posting Jurnal Penyesuaian ke Ledger di frontend berdasarkan hasil dari Rust
    let count = 0;
    for (const stub of result.postedJournals) {
      const lines: JournalLine[] = [
        { accountCode: '5205', debit: stub.amount, credit: 0 },
        { accountCode: '1202', debit: 0, credit: stub.amount }
      ];

      const journal: JournalEntry = {
        id: `depr-${stub.assetId}-${Date.now()}-${count}`,
        date: todayStr,
        description: `Penyesuaian Penyusutan Bulanan (Rust Native) - ${stub.assetName}`,
        reference: `ASSET/${stub.assetId}`,
        lines
      };

      await postJournalEntry(journal);
      count++;
    }

    return {
      count: result.postedJournals.length,
      totalAmount: result.totalDepreciated
    };

  } catch (err: any) {
    console.error('Error running depreciation in Rust:', err);
    throw new Error(`Gagal penyusutan native: ${err.message || err}`);
  }
}

/**
 * Menambahkan aset tetap baru ke database
 */
export async function addFixedAsset(asset: Omit<FixedAsset, 'accumulatedDepreciation' | 'isFullyDepreciated'>): Promise<void> {
  const newAsset: FixedAsset = {
    ...asset,
    accumulatedDepreciation: 0,
    isFullyDepreciated: false
  };
  await db.fixedAssets.add(newAsset);
}
