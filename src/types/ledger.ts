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
}
