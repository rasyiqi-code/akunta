import Dexie, { type Table } from 'dexie';
import type { Account, JournalEntry, Contact, BankStatementItem, Product, InventoryLog } from '../types/ledger';

// Interface untuk riwayat obrolan di Mode Asisten
export interface ChatMessage {
  id?: number;
  sender: 'USER' | 'AI';
  text: string;
  timestamp: string;
  // Metadata tambahan untuk render kartu interaktif jika diperlukan
  cardType?: 'CONFIRMATION' | 'STORY_REPORT' | 'ALERT' | 'TRANSACTION_SUCCESS';
  cardData?: any; 
}

class AkuntaDatabase extends Dexie {
  accounts!: Table<Account, string>;
  journals!: Table<JournalEntry, string>;
  contacts!: Table<Contact, string>;
  bankStatements!: Table<BankStatementItem, string>;
  chatMessages!: Table<ChatMessage, number>;
  products!: Table<Product, string>;
  inventoryLogs!: Table<InventoryLog, string>;

  constructor() {
    super('AkuntaDatabase');
    this.version(2).stores({
      accounts: 'code, name, type, normalBalance, parentCode',
      journals: 'id, date, isAnomaly',
      contacts: 'id, name, type',
      bankStatements: 'id, date, matchedJournalId',
      chatMessages: '++id, sender, timestamp',
      products: 'id, name, sku',
      inventoryLogs: 'id, productId, date, type',
    });
  }
}

export const db = new AkuntaDatabase();

// Inisialisasi Chart of Accounts (COA) Standar PSAK EMKM jika database kosong
export const DEFAULT_ACCOUNTS: Account[] = [
  // ASET
  { code: '1101', name: 'Kas Utama', type: 'ASET', normalBalance: 'D' },
  { code: '1102', name: 'Bank BCA', type: 'ASET', normalBalance: 'D' },
  { code: '1103', name: 'Bank Mandiri', type: 'ASET', normalBalance: 'D' },
  { code: '1104', name: 'Piutang Usaha', type: 'ASET', normalBalance: 'D' },
  { code: '1105', name: 'Persediaan Barang Dagang', type: 'ASET', normalBalance: 'D' },
  { code: '1106', name: 'PPN Masukan', type: 'ASET', normalBalance: 'D' },
  { code: '1201', name: 'Peralatan Kantor', type: 'ASET', normalBalance: 'D' },
  { code: '1202', name: 'Akumulasi Penyusutan Peralatan', type: 'ASET', normalBalance: 'K' },
  // KEWAJIBAN
  { code: '2101', name: 'Utang Usaha', type: 'KEWAJIBAN', normalBalance: 'K' },
  { code: '2102', name: 'Utang Pajak PPh 21', type: 'KEWAJIBAN', normalBalance: 'K' },
  { code: '2103', name: 'PPN Keluaran', type: 'KEWAJIBAN', normalBalance: 'K' },
  // EKUITAS
  { code: '3101', name: 'Modal Pemilik', type: 'EKUITAS', normalBalance: 'K' },
  { code: '3102', name: 'Laba Ditahan', type: 'EKUITAS', normalBalance: 'K' },
  // PENDAPATAN
  { code: '4101', name: 'Pendapatan Penjualan', type: 'PENDAPATAN', normalBalance: 'K' },
  { code: '4102', name: 'Pendapatan Jasa', type: 'PENDAPATAN', normalBalance: 'K' },
  // BEBAN
  { code: '5101', name: 'Beban Pokok Penjualan (HPP)', type: 'BEBAN', normalBalance: 'D' },
  { code: '5201', name: 'Beban Gaji', type: 'BEBAN', normalBalance: 'D' },
  { code: '5202', name: 'Beban Sewa Ruko', type: 'BEBAN', normalBalance: 'D' },
  { code: '5203', name: 'Beban Listrik, Air & Internet', type: 'BEBAN', normalBalance: 'D' },
  { code: '5204', name: 'Beban Iklan & Pemasaran', type: 'BEBAN', normalBalance: 'D' },
  { code: '5205', name: 'Beban Penyusutan', type: 'BEBAN', normalBalance: 'D' },
  { code: '5206', name: 'Beban Operasional Lainnya', type: 'BEBAN', normalBalance: 'D' },
];

export async function initializeDatabase() {
  const count = await db.accounts.count();
  if (count === 0) {
    // Inisialisasi COA
    await db.accounts.bulkAdd(DEFAULT_ACCOUNTS);

    // Tambah kontak default
    const defaultContacts: Contact[] = [
      { id: 'c-01', name: 'Umum / Tunai', type: 'CUSTOMER' },
      { id: 'c-02', name: 'PT Sejahtera Mulia', type: 'CUSTOMER' },
      { id: 'v-01', name: 'Supplier Kopi Indonesia', type: 'VENDOR' },
      { id: 'v-02', name: 'PLN Persero', type: 'VENDOR' },
    ];
    await db.contacts.bulkAdd(defaultContacts);

    // Tambah beberapa transaksi bank awal untuk demo rekonsiliasi
    const defaultStatements: BankStatementItem[] = [
      { id: 'st-01', date: '2026-06-20', description: 'TRANSFER DARI PT SEJAHTERA', amount: 5000000 },
      { id: 'st-02', date: '2026-06-21', description: 'BIAYA ADMIN BANK', amount: -15000 },
      { id: 'st-03', date: '2026-06-22', description: 'TARIKAN TUNAI KAS', amount: -2000000 },
      { id: 'st-04', date: '2026-06-23', description: 'PEMBAYARAN ZOOM INC', amount: -250000 },
    ];
    await db.bankStatements.bulkAdd(defaultStatements);

    // Tambah produk inventaris default
    const defaultProducts: Product[] = [
      { id: 'prod-01', name: 'Biji Kopi Arabika', sku: 'KOPI-ARB', stockQty: 10, averageCost: 40000, sellingPrice: 60000 },
      { id: 'prod-02', name: 'Suku UHT 1L', sku: 'MILK-UHT', stockQty: 20, averageCost: 15000, sellingPrice: 22000 },
    ];
    await db.products.bulkAdd(defaultProducts);

    // Tambah log mutasi persediaan awal
    const defaultInventoryLogs: InventoryLog[] = [
      { id: 'log-01', productId: 'prod-01', date: '2026-06-20', type: 'MASUK', qty: 10, cost: 40000, reference: 'INIT' },
      { id: 'log-02', productId: 'prod-02', date: '2026-06-20', type: 'MASUK', qty: 20, cost: 15000, reference: 'INIT' },
    ];
    await db.inventoryLogs.bulkAdd(defaultInventoryLogs);

    // Tambahkan sapaan awal dari AI di chat
    await db.chatMessages.add({
      sender: 'AI',
      text: 'Halo! Saya Akunta AI, asisten keuangan pribadi Anda. Ketik apa saja untuk mencatat transaksi, seperti: \n- *"Jual kopi susu 50rb tunai"* \n- *"Bayar sewa ruko 3jt pakai Bank Mandiri"* \n- *"Tampilkan laporan laba rugi bulan ini"*',
      timestamp: new Date().toISOString(),
    });
  }
}
