import { invoke } from '@tauri-apps/api/core';

// Logika Pembelian Produk (Menambah Stok & hitung Average Cost) di Rust SQLite
export async function purchaseProduct(
  productId: string,
  qty: number,
  unitCost: number,
  date: string,
  refJournalId?: string
): Promise<void> {
  try {
    await invoke<string>('purchase_product_rust', {
      productId,
      qty,
      unitCost,
      date,
      refJournalId: refJournalId || null
    });
  } catch (err: any) {
    console.error('Gagal memproses pembelian di Rust SQLite:', err);
    throw new Error(err.message || err);
  }
}

// Logika Penjualan Produk (Mengurangi Stok & Jurnal HPP Otomatis di Rust SQLite)
export async function sellProduct(
  productId: string,
  qty: number,
  date: string,
  refJournalId?: string
): Promise<number> {
  try {
    const resultJson = await invoke<string>('sell_product_rust', {
      productId,
      qty,
      date,
      refJournalId: refJournalId || null
    });
    const result = JSON.parse(resultJson);
    return result.totalHpp;
  } catch (err: any) {
    console.error('Gagal memproses penjualan di Rust SQLite:', err);
    throw new Error(err.message || err);
  }
}

// Penyesuaian Stok Manual / Stock Opname di Rust SQLite
export async function adjustProductStock(
  productId: string,
  newQty: number,
  date: string,
  reason: string
): Promise<void> {
  try {
    await invoke<string>('adjust_product_stock_rust', {
      productId,
      newQty,
      date,
      reason
    });
  } catch (err: any) {
    console.error('Gagal memproses penyesuaian stok di Rust SQLite:', err);
    throw new Error(err.message || err);
  }
}
