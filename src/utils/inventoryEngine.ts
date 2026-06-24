import { db } from './db';
import { generateId, postJournalEntry } from './ledgerEngine';
import type { InventoryLog } from '../types/ledger';

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

  const currentStock = product.stockQty;
  const currentAvgCost = product.averageCost;

  // Hitung Average Cost Baru
  const totalCost = (currentStock * currentAvgCost) + (qty * unitCost);
  const newStock = currentStock + qty;
  const newAvgCost = newStock > 0 ? Math.round(totalCost / newStock) : 0;

  // Perbarui data produk
  await db.products.update(productId, {
    stockQty: newStock,
    averageCost: newAvgCost
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

  if (product.stockQty < qty) {
    throw new Error(`Stok produk "${product.name}" tidak mencukupi. Sisa stok: ${product.stockQty} unit.`);
  }

  const hppPerUnit = product.averageCost;
  const totalHpp = qty * hppPerUnit;
  const newStock = product.stockQty - qty;

  // Perbarui kuantitas stok produk
  await db.products.update(productId, {
    stockQty: newStock
  });

  // Catat Log Mutasi
  const logId = generateId('ILG');
  const log: InventoryLog = {
    id: logId,
    productId,
    date,
    type: 'KELUAR',
    qty,
    cost: hppPerUnit,
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

  const diff = newQty - product.stockQty;
  if (diff === 0) return;

  const absQty = Math.abs(diff);

  // Perbarui kuantitas stok
  await db.products.update(productId, {
    stockQty: newQty
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
  const totalVal = absQty * product.averageCost;
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
