import type { FixedAsset } from '../types/ledger';
import { invoke } from '@tauri-apps/api/core';

/**
 * Menghitung penyusutan bulanan (Straight-Line) secara native di Rust
 */
export async function calculateMonthlyDepreciation(asset: FixedAsset): Promise<number> {
  try {
    return await invoke<number>('calculate_monthly_depreciation_rust', {
      assetJson: JSON.stringify(asset)
    });
  } catch (err) {
    console.error('Gagal menghitung penyusutan bulanan di Rust:', err);
    if (asset.usefulLifeYears <= 0) return 0;
    const depreciableAmount = asset.cost - asset.salvageValue;
    const totalMonths = asset.usefulLifeYears * 12;
    return Math.round(depreciableAmount / totalMonths);
  }
}

/**
 * Menjalankan penyusutan aset secara NATIVE di Rust backend via SQLite transaction.
 */
export async function runMonthlyDepreciation(): Promise<{ count: number; totalAmount: number }> {
  try {
    const resultJson = await invoke<string>('calculate_depreciation_rust');
    const result = JSON.parse(resultJson);
    
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
 * Menambahkan aset tetap baru ke database Rust SQLite secara native
 */
export async function addFixedAsset(asset: Omit<FixedAsset, 'accumulatedDepreciation' | 'isFullyDepreciated'>): Promise<void> {
  try {
    await invoke<string>('add_fixed_asset_rust', {
      assetJson: JSON.stringify(asset)
    });
  } catch (err: any) {
    console.error('Gagal menambah aset tetap di Rust:', err);
    throw new Error(err.message || err);
  }
}
