use rusqlite::{Connection, Result};

pub fn init_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    use tauri::Manager;

    // Cari folder data aplikasi resmi Tauri
    let db_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Gagal mendapatkan app data dir: {}", e))?;

    // Buat foldernya jika belum ada
    let _ = std::fs::create_dir_all(&db_dir);

    let db_path = db_dir.join("akunta.db");

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Gagal membuka database SQLite pada {:?}: {}", db_path, e))?;

    // Aktifkan foreign keys
    conn.execute("PRAGMA foreign_keys = ON;", [])
        .map_err(|e| format!("Gagal mengaktifkan foreign keys: {}", e))?;

    migrate_schema(&conn)?;
    seed_default_data(&conn)?;

    Ok(conn)
}

fn migrate_schema(conn: &Connection) -> std::result::Result<(), String> {
    let queries = vec![
        // 1. Akun (Chart of Accounts)
        r#"CREATE TABLE IF NOT EXISTS accounts (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL, -- 'ASET' | 'KEWAJIBAN' | 'EKUITAS' | 'PENDAPATAN' | 'BEBAN'
            normal_balance TEXT NOT NULL -- 'D' | 'K'
        );"#,
        // 2. Jurnal
        r#"CREATE TABLE IF NOT EXISTS journals (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            description TEXT NOT NULL,
            reference TEXT,
            is_anomaly INTEGER DEFAULT 0 -- 0 = false, 1 = true
        );"#,
        // 3. Baris Jurnal (Double-Entry lines)
        r#"CREATE TABLE IF NOT EXISTS journal_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_id TEXT NOT NULL,
            account_code TEXT NOT NULL,
            debit REAL NOT NULL,
            credit REAL NOT NULL,
            FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE,
            FOREIGN KEY (account_code) REFERENCES accounts(code)
        );"#,
        // 4. Kontak (Customer / Vendor)
        r#"CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL -- 'CUSTOMER' | 'VENDOR'
        );"#,
        // 5. Rekening Koran Bank
        r#"CREATE TABLE IF NOT EXISTS bank_statements (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            matched_journal_id TEXT,
            confidence_score REAL,
            FOREIGN KEY (matched_journal_id) REFERENCES journals(id) ON DELETE SET NULL
        );"#,
        // 6. Produk Inventaris
        r#"CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            sku TEXT NOT NULL UNIQUE,
            stock_qty REAL NOT NULL DEFAULT 0.0,
            average_cost REAL NOT NULL DEFAULT 0.0,
            selling_price REAL NOT NULL DEFAULT 0.0
        );"#,
        // 7. Log Mutasi Inventaris
        r#"CREATE TABLE IF NOT EXISTS inventory_logs (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            date TEXT NOT NULL,
            type TEXT NOT NULL, -- 'MASUK' | 'KELUAR' | 'ADJUSTMENT'
            qty REAL NOT NULL,
            cost REAL NOT NULL,
            reference TEXT,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );"#,
        // 8. Aset Tetap
        r#"CREATE TABLE IF NOT EXISTS fixed_assets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            purchase_date TEXT NOT NULL,
            cost REAL NOT NULL,
            useful_life_years REAL NOT NULL,
            salvage_value REAL NOT NULL,
            accumulated_depreciation REAL NOT NULL DEFAULT 0.0,
            is_fully_depreciated INTEGER DEFAULT 0 -- 0 = false, 1 = true
        );"#,
        // 9. Riwayat Chat AI
        r#"CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL, -- 'USER' | 'AI'
            text TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            card_type TEXT, -- 'CONFIRMATION' | 'STORY_REPORT' | 'ALERT' | 'TRANSACTION_SUCCESS'
            card_data TEXT, -- JSON string metadata tambahan
            image_url TEXT -- base64 image jika ada
        );"#,
        // 10. Warehouses
        r#"CREATE TABLE IF NOT EXISTS warehouses (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
        );"#,
        // 11. Sales Documents
        r#"CREATE TABLE IF NOT EXISTS sales_documents (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            contact_id TEXT NOT NULL,
            type TEXT NOT NULL, -- 'QUOTATION' | 'ORDER' | 'DELIVERY' | 'INVOICE' | 'RETURN'
            status TEXT NOT NULL, -- 'PENDING' | 'COMPLETED' | 'CANCELLED'
            reference_id TEXT,
            total_amount REAL NOT NULL,
            dp_applied REAL DEFAULT 0.0,
            FOREIGN KEY (contact_id) REFERENCES contacts(id)
        );"#,
        // 12. Sales Document Items
        r#"CREATE TABLE IF NOT EXISTS sales_document_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            qty REAL NOT NULL,
            price REAL NOT NULL,
            discount REAL DEFAULT 0.0,
            FOREIGN KEY (document_id) REFERENCES sales_documents(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id)
        );"#,
        // 13. Purchase Documents
        r#"CREATE TABLE IF NOT EXISTS purchase_documents (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            contact_id TEXT NOT NULL,
            type TEXT NOT NULL, -- 'ORDER' | 'RECEIPT' | 'INVOICE' | 'RETURN'
            status TEXT NOT NULL, -- 'PENDING' | 'COMPLETED' | 'CANCELLED'
            reference_id TEXT,
            total_amount REAL NOT NULL,
            dp_applied REAL DEFAULT 0.0,
            FOREIGN KEY (contact_id) REFERENCES contacts(id)
        );"#,
        // 14. Purchase Document Items
        r#"CREATE TABLE IF NOT EXISTS purchase_document_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            qty REAL NOT NULL,
            price REAL NOT NULL,
            discount REAL DEFAULT 0.0,
            FOREIGN KEY (document_id) REFERENCES purchase_documents(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id)
        );"#,
        // 15. Stock Take Orders
        r#"CREATE TABLE IF NOT EXISTS stock_take_orders (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            status TEXT NOT NULL -- 'DRAFT' | 'COMPLETED'
        );"#,
        // 16. Stock Take Items
        r#"CREATE TABLE IF NOT EXISTS stock_take_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_take_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            system_qty REAL NOT NULL,
            physical_qty REAL NOT NULL,
            diff_qty REAL NOT NULL,
            cost REAL NOT NULL,
            FOREIGN KEY (stock_take_id) REFERENCES stock_take_orders(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id)
        );"#,
        // 17. Fixed Asset Adjustments
        r#"CREATE TABLE IF NOT EXISTS fixed_asset_adjustments (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            date TEXT NOT NULL,
            type TEXT NOT NULL, -- 'REVALUATION' | 'IMPAIRMENT'
            amount REAL NOT NULL,
            description TEXT NOT NULL,
            FOREIGN KEY (asset_id) REFERENCES fixed_assets(id) ON DELETE CASCADE
        );"#,
    ];

    for q in queries {
        conn.execute(q, [])
            .map_err(|e| format!("Gagal membuat tabel dengan query: {}\nError: {}", q, e))?;
    }

    // Tambah kolom baru via ALTER TABLE secara aman
    let _ = conn.execute("ALTER TABLE fixed_assets ADD COLUMN status TEXT DEFAULT 'ACTIVE';", []);
    let _ = conn.execute("ALTER TABLE fixed_assets ADD COLUMN disposal_date TEXT;", []);
    let _ = conn.execute("ALTER TABLE fixed_assets ADD COLUMN disposal_value REAL DEFAULT 0.0;", []);
    let _ = conn.execute("ALTER TABLE fixed_assets ADD COLUMN disposal_gain_loss REAL DEFAULT 0.0;", []);
    let _ = conn.execute("ALTER TABLE inventory_logs ADD COLUMN warehouse_id TEXT DEFAULT 'w-01';", []);

    Ok(())
}

pub fn seed_default_data(conn: &Connection) -> std::result::Result<(), String> {
    // 1. Cek & Seed Accounts
    let count_accounts: i64 = conn
        .query_row("SELECT COUNT(*) FROM accounts", [], |r| r.get(0))
        .map_err(|e| format!("Gagal membaca count accounts: {}", e))?;

    if count_accounts == 0 {
        let default_accounts = vec![
            // ASET
            ("1101", "Kas Utama", "ASET", "D"),
            ("1102", "Bank BCA", "ASET", "D"),
            ("1103", "Bank Mandiri", "ASET", "D"),
            ("1104", "Piutang Usaha", "ASET", "D"),
            ("1105", "Persediaan Barang Dagang", "ASET", "D"),
            ("1106", "PPN Masukan", "ASET", "D"),
            ("1201", "Peralatan Kantor", "ASET", "D"),
            ("1202", "Akumulasi Penyusutan Peralatan", "ASET", "K"),
            // KEWAJIBAN
            ("2101", "Utang Usaha", "KEWAJIBAN", "K"),
            ("2102", "Utang Pajak PPh 21", "KEWAJIBAN", "K"),
            ("2103", "PPN Keluaran", "KEWAJIBAN", "K"),
            ("2104", "Utang Pajak PPh 23", "KEWAJIBAN", "K"), // PPh 23 ditambahkan di database!
            // EKUITAS
            ("3101", "Modal Pemilik", "EKUITAS", "K"),
            ("3102", "Laba Ditahan", "EKUITAS", "K"),
            // PENDAPATAN
            ("4101", "Pendapatan Penjualan", "PENDAPATAN", "K"),
            ("4102", "Pendapatan Jasa", "PENDAPATAN", "K"),
            // BEBAN
            ("5101", "Beban Pokok Penjualan (HPP)", "BEBAN", "D"),
            ("5201", "Beban Gaji", "BEBAN", "D"),
            ("5202", "Beban Sewa Ruko", "BEBAN", "D"),
            ("5203", "Beban Listrik, Air & Internet", "BEBAN", "D"),
            ("5204", "Beban Iklan & Pemasaran", "BEBAN", "D"),
            ("5205", "Beban Penyusutan", "BEBAN", "D"),
            ("5206", "Beban Operasional Lainnya", "BEBAN", "D"),
        ];

        for acc in default_accounts {
            conn.execute(
                "INSERT INTO accounts (code, name, type, normal_balance) VALUES (?1, ?2, ?3, ?4)",
                [acc.0, acc.1, acc.2, acc.3],
            )
            .map_err(|e| format!("Gagal memasukkan akun default {}: {}", acc.0, e))?;
        }
    }

    // 2. Cek & Seed Contacts
    let count_contacts: i64 = conn
        .query_row("SELECT COUNT(*) FROM contacts", [], |r| r.get(0))
        .map_err(|e| format!("Gagal membaca count contacts: {}", e))?;

    if count_contacts == 0 {
        let default_contacts = vec![
            ("c-01", "Umum / Tunai", "CUSTOMER"),
            ("c-02", "PT Sejahtera Mulia", "CUSTOMER"),
            ("v-01", "Supplier Kopi Indonesia", "VENDOR"),
            ("v-02", "PLN Persero", "VENDOR"),
        ];

        for c in default_contacts {
            conn.execute(
                "INSERT INTO contacts (id, name, type) VALUES (?1, ?2, ?3)",
                [c.0, c.1, c.2],
            )
            .map_err(|e| format!("Gagal memasukkan kontak default {}: {}", c.0, e))?;
        }
    }

    // 3. Cek & Seed Bank Statements
    let count_statements: i64 = conn
        .query_row("SELECT COUNT(*) FROM bank_statements", [], |r| r.get(0))
        .map_err(|e| format!("Gagal membaca count bank statements: {}", e))?;

    if count_statements == 0 {
        let default_statements = vec![
            (
                "st-01",
                "2026-06-20",
                "TRANSFER DARI PT SEJAHTERA",
                5000000.0,
            ),
            ("st-02", "2026-06-21", "BIAYA ADMIN BANK", -15000.0),
            ("st-03", "2026-06-22", "TARIKAN TUNAI KAS", -2000000.0),
            ("st-04", "2026-06-23", "PEMBAYARAN ZOOM INC", -250000.0),
        ];

        for s in default_statements {
            conn.execute(
                "INSERT INTO bank_statements (id, date, description, amount) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![s.0, s.1, s.2, s.3],
            ).map_err(|e| format!("Gagal memasukkan bank statement default {}: {}", s.0, e))?;
        }
    }

    // 4. Cek & Seed Products
    let count_products: i64 = conn
        .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
        .map_err(|e| format!("Gagal membaca count products: {}", e))?;

    if count_products == 0 {
        let default_products = vec![
            (
                "prod-01",
                "Biji Kopi Arabika",
                "KOPI-ARB",
                10.0,
                40000.0,
                60000.0,
            ),
            ("prod-02", "Suku UHT 1L", "MILK-UHT", 20.0, 15000.0, 22000.0),
        ];

        for p in default_products {
            conn.execute(
                "INSERT INTO products (id, name, sku, stock_qty, average_cost, selling_price) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![p.0, p.1, p.2, p.3, p.4, p.5],
            ).map_err(|e| format!("Gagal memasukkan produk default {}: {}", p.0, e))?;
        }
    }

    // 5. Cek & Seed Inventory Logs
    let count_inv_logs: i64 = conn
        .query_row("SELECT COUNT(*) FROM inventory_logs", [], |r| r.get(0))
        .map_err(|e| format!("Gagal membaca count inventory logs: {}", e))?;

    if count_inv_logs == 0 {
        let default_logs = vec![
            (
                "log-01",
                "prod-01",
                "2026-06-20",
                "MASUK",
                10.0,
                40000.0,
                "INIT",
            ),
            (
                "log-02",
                "prod-02",
                "2026-06-20",
                "MASUK",
                20.0,
                15000.0,
                "INIT",
            ),
        ];

        for l in default_logs {
            conn.execute(
                "INSERT INTO inventory_logs (id, product_id, date, type, qty, cost, reference) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![l.0, l.1, l.2, l.3, l.4, l.5, l.6],
            ).map_err(|e| format!("Gagal memasukkan log inventaris default {}: {}", l.0, e))?;
        }
    }

    // 6. Cek & Seed Fixed Assets
    let count_assets: i64 = conn
        .query_row("SELECT COUNT(*) FROM fixed_assets", [], |r| r.get(0))
        .map_err(|e| format!("Gagal membaca count fixed assets: {}", e))?;

    if count_assets == 0 {
        let default_assets = vec![
            (
                "fa-01",
                "Mesin Espresso La Marzocco",
                "2026-01-10",
                15000000.0,
                5.0,
                3000000.0,
                1000000.0,
                0,
            ),
            (
                "fa-02",
                "iPad Pro Kasir & Stand",
                "2026-03-15",
                6000000.0,
                3.0,
                600000.0,
                450000.0,
                0,
            ),
        ];

        for a in default_assets {
            conn.execute(
                "INSERT INTO fixed_assets (id, name, purchase_date, cost, useful_life_years, salvage_value, accumulated_depreciation, is_fully_depreciated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![a.0, a.1, a.2, a.3, a.4, a.5, a.6, a.7],
            ).map_err(|e| format!("Gagal memasukkan aset tetap default {}: {}", a.0, e))?;
        }
    }

    // 7. Cek & Seed Initial Chat Message
    let count_messages: i64 = conn
        .query_row("SELECT COUNT(*) FROM chat_messages", [], |r| r.get(0))
        .map_err(|e| format!("Gagal membaca count chat messages: {}", e))?;

    if count_messages == 0 {
        // Gunakan timestamp statis format ISO agar konsisten
        let now = "2026-06-24T20:00:00.000Z";
        conn.execute(
            "INSERT INTO chat_messages (sender, text, timestamp) VALUES (?1, ?2, ?3)",
            [
                "AI",
                "Halo! Saya Akunta AI, asisten keuangan pribadi Anda. Ketik apa saja untuk mencatat transaksi, seperti:\n- *\"Jual kopi susu 50rb tunai\"*\n- *\"Bayar sewa ruko 3jt pakai Bank Mandiri\"*\n- *\"Tampilkan laporan laba rugi bulan ini\"*",
                &now
            ],
        ).map_err(|e| format!("Gagal memasukkan pesan selamat datang: {}", e))?;
    }

    // 8. Cek & Seed Warehouses
    let count_warehouses: i64 = conn
        .query_row("SELECT COUNT(*) FROM warehouses", [], |r| r.get(0))
        .map_err(|e| format!("Gagal membaca count warehouses: {}", e))?;

    if count_warehouses == 0 {
        conn.execute(
            "INSERT INTO warehouses (id, name) VALUES ('w-01', 'Gudang Utama')",
            [],
        ).map_err(|e| format!("Gagal memasukkan gudang utama default: {}", e))?;
        conn.execute(
            "INSERT INTO warehouses (id, name) VALUES ('w-02', 'Gudang Transit')",
            [],
        ).map_err(|e| format!("Gagal memasukkan gudang transit default: {}", e))?;
    }

    Ok(())
}

