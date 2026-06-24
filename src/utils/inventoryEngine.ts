import { db } from './db';
import { generateId, postJournalEntry } from './ledgerEngine';
import type { InventoryLog } from '../types/ledger';
import { invoke } from '@tauri-apps/api/core';

// Logika Pembelian Produk (Menambah Stok & hitung Average Cost)
export async function purchaseProduct(
  productId: string,
  qty: number,
  unitCost: number,
  date: string,
  refJournalId?: string
): Promise<void> {
  if (qty <= 0) return;

  const product = await db.products.get(productId);
  if (!product) throw new Error('Produk tidak ditemukan');

  let updatedProduct;
  try {
    const resultJson = await invoke<string>('purchase_product_rust', {
      productJson: JSON.stringify(product),
      qty,
      unitCost
    });
    const result = JSON.parse(resultJson);
    updatedProduct = result.updatedProduct;
  } catch (err) {
    console.warn('Gagal memproses pembelian di Rust, menggunakan fallback TS:', err);
    // Fallback TS
    const currentStock = product.stockQty;
    const currentAvgCost = product.averageCost;
    const totalCost = (currentStock * currentAvgCost) + (qty * unitCost);
    const newStock = currentStock + qty;
    const newAvgCost = newStock > 0 ? Math.round(totalCost / newStock) : 0;
    updatedProduct = {
      ...product,
      stockQty: newStock,
      averageCost: newAvgCost
    };
  }

  // Perbarui data produk
  await db.products.update(productId, {
    stockQty: updatedProduct.stockQty,
    averageCost: updatedProduct.averageCost
  });

  // Catat Log Mutasi
  const logId = generateId('ILG');
  const log: InventoryLog = {
    id: logId,
    productId,
    date,
    type: 'MASUK',
    qty,
    cost: unitCost,
    reference: refJournalId
  };

  await db.inventoryLogs.add(log);
}

// Logika Penjualan Produk (Mengurangi Stok & Jurnal HPP Otomatis)
export async function sellProduct(
  productId: string,
  qty: number,
  date: string,
  refJournalId?: string
): Promise<number> {
  if (qty <= 0) return 0;

  const product = await db.products.get(productId);
  if (!product) throw new Error('Produk tidak ditemukan');

  let updatedProduct;
  let totalHpp;

  try {
    const resultJson = await invoke<string>('sell_product_rust', {
      productJson: JSON.stringify(product),
      qty
    });
    const result = JSON.parse(resultJson);
    updatedProduct = result.updatedProduct;
    totalHpp = result.totalHpp;
  } catch (err: any) {
    console.warn('Gagal memproses penjualan di Rust, menggunakan fallback TS:', err);
    if (err && typeof err === 'string' && err.includes('tidak mencukupi')) {
      throw new Error(err);
    }
    if (product.stockQty < qty) {
      throw new Error(`Stok produk "${product.name}" tidak mencukupi. Sisa stok: ${product.stockQty} unit.`);
    }

    // Fallback TS
    const hppPerUnit = product.averageCost;
    totalHpp = qty * hppPerUnit;
    const newStock = product.stockQty - qty;
    updatedProduct = {
      ...product,
      stockQty: newStock
    };
  }

  // Perbarui kuantitas stok produk
  await db.products.update(productId, {
    stockQty: updatedProduct.stockQty
  });

  // Catat Log Mutasi
  const logId = generateId('ILG');
  const log: InventoryLog = {
    id: logId,
    productId,
    date,
    type: 'KELUAR',
    qty,
    cost: product.averageCost,
    reference: refJournalId
  };
  await db.inventoryLogs.add(log);

  // Buat Jurnal HPP Otomatis di GL
  // Debit 5101 (HPP) & Kredit 1105 (Persediaan Barang Dagang)
  if (totalHpp > 0) {
    await postJournalEntry({
      date,
      description: `Pencatatan HPP Otomatis atas penjualan ${qty} unit ${product.name}`,
      reference: refJournalId,
      lines: [
        { accountCode: '5101', debit: totalHpp, credit: 0 }, // Debit HPP
        { accountCode: '1105', debit: 0, credit: totalHpp }  // Kredit Persediaan
      ]
    });
  }

  return totalHpp;
}

// Penyesuaian Stok Manual (Stock Opname)
export async function adjustProductStock(
  productId: string,
  newQty: number,
  date: string,
  reason: string
): Promise<void> {
  const product = await db.products.get(productId);
  if (!product) throw new Error('Produk tidak ditemukan');

  let updatedProduct;
  let diff;
  let absQty;
  let totalVal;

  try {
    const resultJson = await invoke<string>('adjust_product_stock_rust', {
      productJson: JSON.stringify(product),
      newQty
    });
    const result = JSON.parse(resultJson);
    updatedProduct = result.updatedProduct;
    diff = result.diff;
    absQty = result.absQty;
    totalVal = result.totalVal;
  } catch (err) {
    console.warn('Gagal memproses penyesuaian stok di Rust, menggunakan fallback TS:', err);
    // Fallback TS
    diff = newQty - product.stockQty;
    absQty = Math.abs(diff);
    totalVal = absQty * product.averageCost;
    updatedProduct = {
      ...product,
      stockQty: newQty
    };
  }

  if (diff === 0) return;

  // Perbarui kuantitas stok
  await db.products.update(productId, {
    stockQty: updatedProduct.stockQty
  });

  // Catat Log
  const logId = generateId('ILG');
  const log: InventoryLog = {
    id: logId,
    productId,
    date,
    type: 'ADJUSTMENT',
    qty: absQty,
    cost: product.averageCost,
    reference: reason
  };
  await db.inventoryLogs.add(log);

  // Jurnal penyesuaian nilai persediaan di GL
  if (totalVal > 0) {
    if (diff > 0) {
      // Penyesuaian positif (stok bertambah): Debit Persediaan (1105), Kredit Beban Operasional Lainnya (5206) sebagai pengurang beban
      await postJournalEntry({
        date,
        description: `Penyesuaian Persediaan (Positif): ${reason}`,
        lines: [
          { accountCode: '1105', debit: totalVal, credit: 0 },
          { accountCode: '5206', debit: 0, credit: totalVal }
        ]
      });
    } else {
      // Penyesuaian negatif (stok berkurang): Debit Beban Operasional Lainnya (5206), Kredit Persediaan (1105)
      await postJournalEntry({
        date,
        description: `Penyesuaian Persediaan (Negatif): ${reason}`,
        lines: [
          { accountCode: '5206', debit: totalVal, credit: 0 },
          { accountCode: '1105', debit: 0, credit: totalVal }
        ]
      });
    }
  }
}
