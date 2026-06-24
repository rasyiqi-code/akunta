import { invoke } from '@tauri-apps/api/core';
import type { Account, JournalEntry, Contact, BankStatementItem, Product, InventoryLog, FixedAsset, Warehouse, StockTakeOrder } from '../types/ledger';

// Interface untuk riwayat obrolan di Mode Asisten
export interface ChatMessage {
  id?: number;
  sender: 'USER' | 'AI';
  text: string;
  timestamp: string;
  cardType?: 'CONFIRMATION' | 'STORY_REPORT' | 'ALERT' | 'TRANSACTION_SUCCESS';
  cardData?: any;
  imageUrl?: string; // Menyimpan data URL gambar Base64
}

// Facade / Pembungkus Asinkron untuk mengalihkan Dexie IndexedDB ke SQLite Rust Native
export const db = {
  accounts: {
    toArray: async (): Promise<Account[]> => {
      try {
        const res = await invoke<string>('get_accounts_rust');
        return JSON.parse(res);
      } catch (err) {
        console.error('Error fetching accounts from Rust SQLite:', err);
        return [];
      }
    },
    count: async (): Promise<number> => {
      const accounts = await db.accounts.toArray();
      return accounts.length;
    },
    get: async (code: string): Promise<Account | undefined> => {
      const accounts = await db.accounts.toArray();
      return accounts.find(a => a.code === code);
    }
  },

  journals: {
    toArray: async (): Promise<JournalEntry[]> => {
      try {
        const res = await invoke<string>('get_journals_rust');
        return JSON.parse(res);
      } catch (err) {
        console.error('Error fetching journals from Rust SQLite:', err);
        return [];
      }
    },
    put: async (entry: JournalEntry): Promise<string> => {
      return await invoke<string>('post_journal_entry_rust', {
        entryJson: JSON.stringify(entry)
      });
    }
  },

  chatMessages: {
    toArray: async (): Promise<ChatMessage[]> => {
      try {
        const res = await invoke<string>('get_chat_messages_rust');
        const list = JSON.parse(res);
        return list.map((m: any) => ({
          id: m.id,
          sender: m.sender,
          text: m.text,
          timestamp: m.timestamp,
          cardType: m.cardType || undefined,
          cardData: m.cardData ? JSON.parse(m.cardData) : undefined,
          imageUrl: m.imageUrl || undefined
        }));
      } catch (err) {
        console.error('Error fetching chat messages from Rust SQLite:', err);
        return [];
      }
    },
    add: async (msg: ChatMessage): Promise<number> => {
      return await invoke<number>('add_chat_message_rust', {
        sender: msg.sender,
        text: msg.text,
        timestamp: msg.timestamp || new Date().toISOString(),
        cardType: msg.cardType || null,
        cardDataJson: msg.cardData ? JSON.stringify(msg.cardData) : null,
        imageUrl: msg.imageUrl || null
      });
    },
    update: async (id: number, changes: Partial<ChatMessage>): Promise<void> => {
      return await invoke<void>('update_chat_message_rust', {
        id,
        text: changes.text || '',
        cardType: changes.cardType || null,
        cardDataJson: changes.cardData ? JSON.stringify(changes.cardData) : null
      });
    },
    clear: async (): Promise<void> => {
      return await invoke<void>('clear_chat_messages_rust');
    }
  },

  products: {
    toArray: async (): Promise<Product[]> => {
      try {
        const res = await invoke<string>('get_products_rust');
        return JSON.parse(res);
      } catch (err) {
        console.error('Error fetching products from Rust SQLite:', err);
        return [];
      }
    },
    get: async (id: string): Promise<Product | undefined> => {
      const list = await db.products.toArray();
      return list.find(p => p.id === id);
    },
    add: async (product: Product): Promise<void> => {
      await invoke<void>('add_product_rust', {
        productJson: JSON.stringify(product)
      });
    },
    update: async (id: string, _changes: Partial<Product>): Promise<void> => {
      // Tidak melakukan apa-apa di frontend karena data stok diperbarui
      // via transaksi native di Rust.
      console.log(`Frontend DB: request update product ${id} ignored. Handled by Rust.`);
      return;
    }
  },

  inventoryLogs: {
    toArray: async (): Promise<InventoryLog[]> => {
      try {
        const res = await invoke<string>('get_inventory_logs_rust');
        return JSON.parse(res);
      } catch (err) {
        console.error('Error fetching inventory logs from Rust SQLite:', err);
        return [];
      }
    }
  },

  fixedAssets: {
    toArray: async (): Promise<FixedAsset[]> => {
      try {
        const res = await invoke<string>('get_fixed_assets_rust');
        const list = JSON.parse(res);
        return list.map((a: any) => ({
          ...a,
          isFullyDepreciated: a.isFullyDepreciated || false
        }));
      } catch (err) {
        console.error('Error fetching fixed assets from Rust SQLite:', err);
        return [];
      }
    },
    get: async (id: string): Promise<FixedAsset | undefined> => {
      const list = await db.fixedAssets.toArray();
      return list.find(a => a.id === id);
    },
    add: async (asset: Omit<FixedAsset, 'accumulatedDepreciation' | 'isFullyDepreciated'> & { id: string }): Promise<void> => {
      await invoke<string>('add_fixed_asset_rust', {
        assetJson: JSON.stringify(asset)
      });
    },
    put: async (asset: FixedAsset): Promise<void> => {
      // Penyusutan bulanan ditangani secara native di Rust.
      console.log(`Frontend DB: request put asset ${asset.id} ignored. Handled by Rust.`);
      return;
    }
  },

  bankStatements: {
    toArray: async (): Promise<BankStatementItem[]> => {
      try {
        const res = await invoke<string>('get_bank_statements_rust');
        return JSON.parse(res);
      } catch (err) {
        console.error('Error fetching bank statements from Rust SQLite:', err);
        return [];
      }
    },
    update: async (id: string, _changes: Partial<BankStatementItem>): Promise<void> => {
      // Ditangani via reconcile_bank_statement_rust.
      console.log(`Frontend DB: request update bank statement ${id} ignored. Handled by Rust.`);
      return;
    }
  },

  contacts: {
    toArray: async (): Promise<Contact[]> => {
      // Mengambil kontak jika perlu, dummy untuk demo
      return [
        { id: 'c-01', name: 'Umum / Tunai', type: 'CUSTOMER' },
        { id: 'c-02', name: 'PT Sejahtera Mulia', type: 'CUSTOMER' },
        { id: 'v-01', name: 'Supplier Kopi Indonesia', type: 'VENDOR' },
        { id: 'v-02', name: 'PLN Persero', type: 'VENDOR' },
      ];
    }
  },

  salesDocuments: {
    toArray: async (): Promise<any[]> => {
      try {
        const res = await invoke<string>('get_sales_documents_rust');
        return JSON.parse(res);
      } catch (err) {
        console.error('Error fetching sales documents:', err);
        return [];
      }
    },
    add: async (doc: any): Promise<void> => {
      await invoke<void>('create_sales_document_rust', {
        docJson: JSON.stringify(doc)
      });
    }
  },

  purchaseDocuments: {
    toArray: async (): Promise<any[]> => {
      try {
        const res = await invoke<string>('get_purchase_documents_rust');
        return JSON.parse(res);
      } catch (err) {
        console.error('Error fetching purchase documents:', err);
        return [];
      }
    },
    add: async (doc: any): Promise<void> => {
      await invoke<void>('create_purchase_document_rust', {
        docJson: JSON.stringify(doc)
      });
    }
  },

  warehouses: {
    toArray: async (): Promise<Warehouse[]> => {
      try {
        const res = await invoke<string>('get_warehouses_rust');
        return JSON.parse(res);
      } catch (err) {
        console.error('Error fetching warehouses:', err);
        return [];
      }
    }
  },

  stockTakes: {
    toArray: async (): Promise<StockTakeOrder[]> => {
      try {
        const res = await invoke<string>('get_stock_takes_rust');
        return JSON.parse(res);
      } catch (err) {
        console.error('Error fetching stock takes:', err);
        return [];
      }
    },
    add: async (order: StockTakeOrder): Promise<void> => {
      await invoke<void>('create_stock_take_rust', {
        orderJson: JSON.stringify(order)
      });
    }
  }
};

// Dummy Accounts agar tidak merusak import static DEFAULT_ACCOUNTS
export const DEFAULT_ACCOUNTS: Account[] = [];

// Fungsi inisialisasi dummy di frontend karena database diinisialisasi secara native di Rust
export async function initializeDatabase() {
  console.log('Database Akunta SQLite diinisialisasi secara native di backend Rust.');
}
