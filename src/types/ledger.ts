// Tipe data untuk sistem akuntansi Core Ledger (Double-Entry Bookkeeping)

export type AccountType = 'ASET' | 'KEWAJIBAN' | 'EKUITAS' | 'PENDAPATAN' | 'BEBAN';

export interface Account {
  code: string;         // Kode Akun (contoh: '1101', '2101')
  name: string;         // Nama Akun (contoh: 'Kas', 'Utang Usaha')
  type: AccountType;    // Tipe Akun
  normalBalance: 'D' | 'K'; // Saldo Normal (Debit/Kredit)
  parentCode?: string;  // Kode akun induk untuk hierarki
}

export interface JournalLine {
  accountCode: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;               // ID unik jurnal
  date: string;             // Format YYYY-MM-DD
  description: string;      // Penjelasan transaksi
  reference?: string;       // Referensi dokumen (misal: "INV/2026/001")
  lines: JournalLine[];     // Detail baris debit/kredit (harus seimbang)
  isAnomaly?: boolean;      // Ditandai jika ada kecurigaan anomali oleh AI
  anomalyReason?: string;   // Alasan deteksi anomali
}

export interface Contact {
  id: string;
  name: string;
  type: 'CUSTOMER' | 'VENDOR';
  phone?: string;
  email?: string;
}

export interface BankStatementItem {
  id: string;
  date: string;
  description: string;
  amount: number; // Positif untuk masuk, negatif untuk keluar
  matchedJournalId?: string; // Menyimpan ID jurnal yang cocok jika sudah direkonsiliasi
  confidenceScore?: number;  // Skor kecocokan AI (0-100)
}

export interface BackupData {
  accounts: Account[];
  journals: JournalEntry[];
  contacts: Contact[];
  bankStatements: BankStatementItem[];
  products: Product[];
  inventoryLogs: InventoryLog[];
  fixedAssets?: FixedAsset[];
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  stockQty: number;
  averageCost: number;
  sellingPrice: number;
}

export interface InventoryLog {
  id: string;
  productId: string;
  date: string;
  type: 'MASUK' | 'KELUAR' | 'ADJUSTMENT';
  qty: number;
  cost: number;
  reference?: string; // Menyimpan Ref ID Jurnal terkait
}

export interface FixedAsset {
  id: string;
  name: string;
  purchaseDate: string; // YYYY-MM-DD
  cost: number;         // Harga perolehan
  usefulLifeYears: number; // Umur ekonomis (tahun)
  salvageValue: number;   // Nilai sisa / residu
  accumulatedDepreciation: number; // Akumulasi penyusutan saat ini
  isFullyDepreciated?: boolean;   // Status jika umur ekonomis habis
}

export type UserRole = 'OWNER' | 'ACCOUNTANT' | 'STAFF';

