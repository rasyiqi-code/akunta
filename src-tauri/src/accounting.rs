use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use crate::{SalesDocument, PurchaseDocument, Warehouse, StockTakeOrder, FixedAssetAdjustment};

// Ambil semua dokumen penjualan beserta itemnya
pub fn get_sales_documents(conn: &Connection) -> Result<Vec<SalesDocument>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, date, contact_id, type, status, reference_id, total_amount, dp_applied FROM sales_documents ORDER BY date DESC"
    ).map_err(|e| e.to_string())?;

    let doc_iter = stmt.query_map([], |row| {
        Ok(SalesDocument {
            id: row.get(0)?,
            date: row.get(1)?,
            contact_id: row.get(2)?,
            doc_type: row.get(3)?,
            status: row.get(4)?,
            reference_id: row.get(5)?,
            total_amount: row.get(6)?,
            dp_applied: row.get(7)?,
            items: None,
        })
    }).map_err(|e| e.to_string())?;

    let mut docs = Vec::new();
    for d_res in doc_iter {
        let mut doc = d_res.map_err(|e| e.to_string())?;
        
        // Ambil item untuk dokumen ini
        let mut item_stmt = conn.prepare(
            "SELECT id, document_id, product_id, qty, price, discount FROM sales_document_items WHERE document_id = ?1"
        ).map_err(|e| e.to_string())?;
        
        let item_iter = item_stmt.query_map([&doc.id], |r| {
            Ok(crate::SalesDocumentItem {
                id: Some(r.get(0)?),
                document_id: r.get(1)?,
                product_id: r.get(2)?,
                qty: r.get(3)?,
                price: r.get(4)?,
                discount: r.get(5)?,
            })
        }).map_err(|e| e.to_string())?;
        
        let mut items = Vec::new();
        for i in item_iter {
            items.push(i.map_err(|e| e.to_string())?);
        }
        
        doc.items = Some(items);
        docs.push(doc);
    }

    Ok(docs)
}

// Buat Dokumen Penjualan Baru (jika INVOICE, buat Jurnal Otomatis & Mutasi Persediaan)
pub fn create_sales_document(conn: &Connection, doc: SalesDocument) -> Result<String, String> {
    // 1. Simpan dokumen utama
    conn.execute(
        "INSERT INTO sales_documents (id, date, contact_id, type, status, reference_id, total_amount, dp_applied) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![doc.id, doc.date, doc.contact_id, doc.doc_type, doc.status, doc.reference_id, doc.total_amount, doc.dp_applied],
    ).map_err(|e| e.to_string())?;

    // 2. Simpan items
    if let Some(items) = &doc.items {
        for item in items {
            conn.execute(
                "INSERT INTO sales_document_items (document_id, product_id, qty, price, discount) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![doc.id, item.product_id, item.qty, item.price, item.discount],
            ).map_err(|e| e.to_string())?;
        }
    }

    // 3. Logika Otomatisasi untuk Faktur Penjualan (INVOICE)
    if doc.doc_type == "INVOICE" {
        // A. Update status dokumen referensi (misal pesanan/pengiriman terkait diset COMPLETED)
        if let Some(ref_id) = &doc.reference_id {
            let _ = conn.execute(
                "UPDATE sales_documents SET status = 'COMPLETED' WHERE id = ?1",
                params![ref_id],
            );
        }

        // B. Buat Jurnal Double-Entry yang seimbang
        // Akun:
        // - Kas Utama (1101) atau Bank BCA (1102) -> Debit (Total Penjualan + PPN)
        // - Piutang Usaha (1104) -> Debit jika kredit/piutang
        // - Pendapatan Penjualan (4101) -> Kredit (Total Penjualan)
        // - PPN Keluaran (2103) -> Kredit (jika ada PPN, anggap 11%)
        // - HPP (5101) -> Debit
        // - Persediaan (1105) -> Kredit

        let has_ppn = true; // default untuk simulasi pajak PPN Keluaran
        let ppn_rate = 0.11;
        let dpp = doc.total_amount;
        let ppn_amount = if has_ppn { dpp * ppn_rate } else { 0.0 };
        let grand_total = dpp + ppn_amount;

        let journal_id = format!("JRN-SLS-{}", doc.id);
        let description = format!("Faktur Penjualan No. {}", doc.id);

        conn.execute(
            "INSERT INTO journals (id, date, description, reference, is_anomaly) VALUES (?1, ?2, ?3, ?4, 0)",
            params![journal_id, doc.date, description, doc.id],
        ).map_err(|e| e.to_string())?;

        // Debit: Kas atau Piutang
        // Untuk demo, jika contact_id adalah 'c-01' (Umum / Tunai), masuk ke Kas Utama (1101), selain itu Piutang Usaha (1104)
        let is_cash = doc.contact_id == "c-01";
        let debit_account = if is_cash { "1101" } else { "1104" };

        conn.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, ?2, ?3, 0.0)",
            params![journal_id, debit_account, grand_total],
        ).map_err(|e| e.to_string())?;

        // Kredit: Pendapatan Penjualan
        conn.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, ?2, 0.0, ?3)",
            params![journal_id, "4101", dpp],
        ).map_err(|e| e.to_string())?;

        // Kredit: PPN Keluaran (jika ada)
        if has_ppn {
            conn.execute(
                "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, ?2, 0.0, ?3)",
                params![journal_id, "2103", ppn_amount],
            ).map_err(|e| e.to_string())?;
        }

        // C. Update Persediaan & Jurnal HPP
        let mut total_cost = 0.0;
        if let Some(items) = &doc.items {
            for item in items {
                // Ambil info produk (average_cost & current qty)
                let mut prod_stmt = conn.prepare(
                    "SELECT average_cost, stock_qty FROM products WHERE id = ?1"
                ).map_err(|e| e.to_string())?;
                
                let (avg_cost, current_qty): (f64, f64) = prod_stmt.query_row([&item.product_id], |row| {
                    Ok((row.get(0)?, row.get(1)?))
                }).map_err(|e| e.to_string())?;

                let item_cost = avg_cost * item.qty;
                total_cost += item_cost;

                // Kurangi stok produk
                let new_qty = current_qty - item.qty;
                conn.execute(
                    "UPDATE products SET stock_qty = ?1 WHERE id = ?2",
                    params![new_qty, item.product_id],
                ).map_err(|e| e.to_string())?;

                // Buat inventory log mutasi keluar
                let log_id = format!("LOG-OUT-{}", doc.id);
                conn.execute(
                    "INSERT INTO inventory_logs (id, product_id, date, type, qty, cost, reference, warehouse_id) VALUES (?1, ?2, ?3, 'KELUAR', ?4, ?5, ?6, 'w-01')",
                    params![log_id, item.product_id, doc.date, item.qty, avg_cost, doc.id],
                ).map_err(|e| e.to_string())?;
            }
        }

        // Jurnal HPP vs Persediaan
        if total_cost > 0.0 {
            // Debit: HPP (5101)
            conn.execute(
                "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '5101', ?2, 0.0)",
                params![journal_id, total_cost],
            ).map_err(|e| e.to_string())?;

            // Kredit: Persediaan Barang Dagang (1105)
            conn.execute(
                "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1105', 0.0, ?2)",
                params![journal_id, total_cost],
            ).map_err(|e| e.to_string())?;
        }
    }

    Ok("Dokumen penjualan berhasil disimpan".to_string())
}

// Ambil semua dokumen pembelian beserta itemnya
pub fn get_purchase_documents(conn: &Connection) -> Result<Vec<PurchaseDocument>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, date, contact_id, type, status, reference_id, total_amount, dp_applied FROM purchase_documents ORDER BY date DESC"
    ).map_err(|e| e.to_string())?;

    let doc_iter = stmt.query_map([], |row| {
        Ok(PurchaseDocument {
            id: row.get(0)?,
            date: row.get(1)?,
            contact_id: row.get(2)?,
            doc_type: row.get(3)?,
            status: row.get(4)?,
            reference_id: row.get(5)?,
            total_amount: row.get(6)?,
            dp_applied: row.get(7)?,
            items: None,
        })
    }).map_err(|e| e.to_string())?;

    let mut docs = Vec::new();
    for d_res in doc_iter {
        let mut doc = d_res.map_err(|e| e.to_string())?;
        
        let mut item_stmt = conn.prepare(
            "SELECT id, document_id, product_id, qty, price, discount FROM purchase_document_items WHERE document_id = ?1"
        ).map_err(|e| e.to_string())?;
        
        let item_iter = item_stmt.query_map([&doc.id], |r| {
            Ok(crate::PurchaseDocumentItem {
                id: Some(r.get(0)?),
                document_id: r.get(1)?,
                product_id: r.get(2)?,
                qty: r.get(3)?,
                price: r.get(4)?,
                discount: r.get(5)?,
            })
        }).map_err(|e| e.to_string())?;
        
        let mut items = Vec::new();
        for i in item_iter {
            items.push(i.map_err(|e| e.to_string())?);
        }
        
        doc.items = Some(items);
        docs.push(doc);
    }

    Ok(docs)
}

// Buat Dokumen Pembelian Baru (jika INVOICE, buat Jurnal Otomatis & Mutasi Persediaan)
pub fn create_purchase_document(conn: &Connection, doc: PurchaseDocument) -> Result<String, String> {
    conn.execute(
        "INSERT INTO purchase_documents (id, date, contact_id, type, status, reference_id, total_amount, dp_applied) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![doc.id, doc.date, doc.contact_id, doc.doc_type, doc.status, doc.reference_id, doc.total_amount, doc.dp_applied],
    ).map_err(|e| e.to_string())?;

    if let Some(items) = &doc.items {
        for item in items {
            conn.execute(
                "INSERT INTO purchase_document_items (document_id, product_id, qty, price, discount) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![doc.id, item.product_id, item.qty, item.price, item.discount],
            ).map_err(|e| e.to_string())?;
        }
    }

    if doc.doc_type == "INVOICE" {
        if let Some(ref_id) = &doc.reference_id {
            let _ = conn.execute(
                "UPDATE purchase_documents SET status = 'COMPLETED' WHERE id = ?1",
                params![ref_id],
            );
        }

        // Jurnal Otomatis Pembelian:
        // - Persediaan Barang Dagang (1105) -> Debit (Dpp)
        // - PPN Masukan (1106) -> Debit (PPN 11%)
        // - Utang Usaha (2101) atau Bank BCA/Kas (1102/1101) -> Kredit (Grand Total)

        let has_ppn = true;
        let ppn_rate = 0.11;
        let dpp = doc.total_amount;
        let ppn_amount = if has_ppn { dpp * ppn_rate } else { 0.0 };
        let grand_total = dpp + ppn_amount;

        let journal_id = format!("JRN-PUR-{}", doc.id);
        let description = format!("Faktur Pembelian No. {}", doc.id);

        conn.execute(
            "INSERT INTO journals (id, date, description, reference, is_anomaly) VALUES (?1, ?2, ?3, ?4, 0)",
            params![journal_id, doc.date, description, doc.id],
        ).map_err(|e| e.to_string())?;

        // Debit: Persediaan Barang Dagang (1105)
        conn.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1105', ?2, 0.0)",
            params![journal_id, dpp],
        ).map_err(|e| e.to_string())?;

        // Debit: PPN Masukan (1106) jika ada
        if has_ppn {
            conn.execute(
                "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1106', ?2, 0.0)",
                params![journal_id, ppn_amount],
            ).map_err(|e| e.to_string())?;
        }

        // Kredit: Utang Usaha (2101) atau Kas (1101)
        let is_cash = doc.contact_id == "c-01"; // contoh tunai
        let credit_account = if is_cash { "1101" } else { "2101" };

        conn.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, ?2, 0.0, ?3)",
            params![journal_id, credit_account, grand_total],
        ).map_err(|e| e.to_string())?;

        // Update Stok Produk & Hitung Average Cost
        if let Some(items) = &doc.items {
            for item in items {
                let mut prod_stmt = conn.prepare(
                    "SELECT average_cost, stock_qty FROM products WHERE id = ?1"
                ).map_err(|e| e.to_string())?;
                
                let (old_avg, old_qty): (f64, f64) = prod_stmt.query_row([&item.product_id], |row| {
                    Ok((row.get(0)?, row.get(1)?))
                }).map_err(|e| e.to_string())?;

                // Hitung Moving Average Cost baru
                let new_qty = old_qty + item.qty;
                let new_avg = if new_qty > 0.0 {
                    ((old_qty * old_avg) + (item.qty * item.price)) / new_qty
                } else {
                    item.price
                };

                conn.execute(
                    "UPDATE products SET stock_qty = ?1, average_cost = ?2 WHERE id = ?3",
                    params![new_qty, new_avg, item.product_id],
                ).map_err(|e| e.to_string())?;

                // Buat inventory log mutasi masuk
                let log_id = format!("LOG-IN-{}", doc.id);
                conn.execute(
                    "INSERT INTO inventory_logs (id, product_id, date, type, qty, cost, reference, warehouse_id) VALUES (?1, ?2, ?3, 'MASUK', ?4, ?5, ?6, 'w-01')",
                    params![log_id, item.product_id, doc.date, item.qty, item.price, doc.id],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok("Dokumen pembelian berhasil disimpan".to_string())
}

// Ambil Daftar Gudang
pub fn get_warehouses(conn: &Connection) -> Result<Vec<Warehouse>, String> {
    let mut stmt = conn.prepare("SELECT id, name FROM warehouses").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(Warehouse {
            id: row.get(0)?,
            name: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for item in iter {
        list.push(item.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

// Ambil Laporan/Daftar Stock Opname
pub fn get_stock_takes(conn: &Connection) -> Result<Vec<StockTakeOrder>, String> {
    let mut stmt = conn.prepare("SELECT id, date, status FROM stock_take_orders ORDER BY date DESC").map_err(|e| e.to_string())?;
    let order_iter = stmt.query_map([], |row| {
        Ok(StockTakeOrder {
            id: row.get(0)?,
            date: row.get(1)?,
            status: row.get(2)?,
            items: None,
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for ord_res in order_iter {
        let mut ord = ord_res.map_err(|e| e.to_string())?;
        
        let mut item_stmt = conn.prepare(
            "SELECT id, stock_take_id, product_id, system_qty, physical_qty, diff_qty, cost FROM stock_take_items WHERE stock_take_id = ?1"
        ).map_err(|e| e.to_string())?;
        
        let item_iter = item_stmt.query_map([&ord.id], |r| {
            Ok(crate::StockTakeItem {
                id: Some(r.get(0)?),
                stock_take_id: r.get(1)?,
                product_id: r.get(2)?,
                system_qty: r.get(3)?,
                physical_qty: r.get(4)?,
                diff_qty: r.get(5)?,
                cost: r.get(6)?,
            })
        }).map_err(|e| e.to_string())?;
        
        let mut items = Vec::new();
        for i in item_iter {
            items.push(i.map_err(|e| e.to_string())?);
        }
        ord.items = Some(items);
        list.push(ord);
    }

    Ok(list)
}

// Buat Stock Opname Baru & Buat Jurnal Penyesuaian jika COMPLETED
pub fn create_stock_take(conn: &Connection, order: StockTakeOrder) -> Result<String, String> {
    conn.execute(
        "INSERT INTO stock_take_orders (id, date, status) VALUES (?1, ?2, ?3)",
        params![order.id, order.date, order.status],
    ).map_err(|e| e.to_string())?;

    if let Some(items) = &order.items {
        for item in items {
            conn.execute(
                "INSERT INTO stock_take_items (stock_take_id, product_id, system_qty, physical_qty, diff_qty, cost) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![order.id, item.product_id, item.system_qty, item.physical_qty, item.diff_qty, item.cost],
            ).map_err(|e| e.to_string())?;

            // Jika status COMPLETED, langsung update kuantitas di persediaan produk & inventaris log
            if order.status == "COMPLETED" {
                conn.execute(
                    "UPDATE products SET stock_qty = ?1 WHERE id = ?2",
                    params![item.physical_qty, item.product_id],
                ).map_err(|e| e.to_string())?;

                let log_type = if item.diff_qty > 0.0 { "ADJUSTMENT" } else { "ADJUSTMENT" };
                let log_id = format!("LOG-ADJ-{}", order.id);
                conn.execute(
                    "INSERT INTO inventory_logs (id, product_id, date, type, qty, cost, reference, warehouse_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'w-01')",
                    params![log_id, item.product_id, order.date, log_type, item.diff_qty.abs(), item.cost, order.id],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    // Jika COMPLETED, buat Jurnal Penyesuaian ke COA Beban
    if order.status == "COMPLETED" {
        let mut total_adjustment_cost = 0.0;
        if let Some(items) = &order.items {
            for item in items {
                // Selisih nilai moneter = diff_qty * cost
                total_adjustment_cost += item.diff_qty * item.cost;
            }
        }

        if total_adjustment_cost != 0.0 {
            let journal_id = format!("JRN-ADJ-{}", order.id);
            let description = format!("Penyesuaian Selisih Opname No. {}", order.id);

            conn.execute(
                "INSERT INTO journals (id, date, description, reference, is_anomaly) VALUES (?1, ?2, ?3, ?4, 0)",
                params![journal_id, order.date, description, order.id],
            ).map_err(|e| e.to_string())?;

            if total_adjustment_cost < 0.0 {
                // Fisik kurang (kehilangan persediaan) -> Beban Selisih Opname (Beban Operasional Lainnya) Debit, Persediaan Kredit
                let abs_val = total_adjustment_cost.abs();
                conn.execute(
                    "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '5206', ?2, 0.0)",
                    params![journal_id, abs_val],
                ).map_err(|e| e.to_string())?;

                conn.execute(
                    "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1105', 0.0, ?2)",
                    params![journal_id, abs_val],
                ).map_err(|e| e.to_string())?;
            } else {
                // Fisik lebih -> Persediaan Debit, Pendapatan/Pengurangan Beban Kredit
                conn.execute(
                    "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1105', ?2, 0.0)",
                    params![journal_id, total_adjustment_cost],
                ).map_err(|e| e.to_string())?;

                conn.execute(
                    "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '5206', 0.0, ?2)",
                    params![journal_id, total_adjustment_cost],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok("Stock Opname berhasil disimpan".to_string())
}

// Disposisi Aset Tetap (Pelepasan Aset)
pub fn dispose_fixed_asset(conn: &Connection, asset_id: &str, disposal_date: &str, disposal_value: f64) -> Result<String, String> {
    // 1. Ambil info aset
    let mut stmt = conn.prepare(
        "SELECT name, cost, accumulated_depreciation FROM fixed_assets WHERE id = ?1"
    ).map_err(|e| e.to_string())?;

    let (name, cost, acc_dep): (String, f64, f64) = stmt.query_row([asset_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    }).map_err(|e| e.to_string())?;

    // 2. Hitung Laba/Rugi pelepasan aset
    // Nilai Buku = Cost - Akumulasi Penyusutan
    let book_value = cost - acc_dep;
    let gain_loss = disposal_value - book_value;

    // 3. Update status aset
    conn.execute(
        "UPDATE fixed_assets SET status = 'DISPOSED', disposal_date = ?1, disposal_value = ?2, disposal_gain_loss = ?3, is_fully_depreciated = 1 WHERE id = ?4",
        params![disposal_date, disposal_value, gain_loss, asset_id],
    ).map_err(|e| e.to_string())?;

    // 4. Jurnal Pelepasan Aset
    // - Kas/Bank (1101 atau 1102) -> Debit (Nilai Jual Aset)
    // - Akumulasi Penyusutan (1202) -> Debit (Acc Dep dihapus)
    // - Kerugian Pelepasan (5206) -> Debit jika rugi (gain_loss < 0)
    // - Aset Tetap (1201) -> Kredit (Cost dihapus)
    // - Keuntungan Pelepasan (5206 dikurangi atau pendapatan) -> Kredit jika untung (gain_loss > 0)

    let journal_id = format!("JRN-DISP-{}", asset_id);
    let description = format!("Pelepasan Aset Tetap: {}", name);

    conn.execute(
        "INSERT INTO journals (id, date, description, reference, is_anomaly) VALUES (?1, ?2, ?3, ?4, 0)",
        params![journal_id, disposal_date, description, asset_id],
    ).map_err(|e| e.to_string())?;

    // Debit: Akumulasi Penyusutan
    conn.execute(
        "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1202', ?2, 0.0)",
        params![journal_id, acc_dep],
    ).map_err(|e| e.to_string())?;

    // Debit: Kas (jika ada nilai jual)
    if disposal_value > 0.0 {
        conn.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1101', ?2, 0.0)",
            params![journal_id, disposal_value],
        ).map_err(|e| e.to_string())?;
    }

    // Penanganan Laba / Rugi Pelepasan
    if gain_loss < 0.0 {
        // Rugi pelepasan aset -> Debit Beban (5206)
        conn.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '5206', ?2, 0.0)",
            params![journal_id, gain_loss.abs()],
        ).map_err(|e| e.to_string())?;
    } else if gain_loss > 0.0 {
        // Laba pelepasan aset -> Kredit Beban/Pendapatan (5206 / akun pendapatan lain)
        conn.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '5206', 0.0, ?2)",
            params![journal_id, gain_loss],
        ).map_err(|e| e.to_string())?;
    }

    // Kredit: Peralatan Kantor (1201)
    conn.execute(
        "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1201', 0.0, ?2)",
        params![journal_id, cost],
    ).map_err(|e| e.to_string())?;

    Ok("Aset tetap berhasil dilepas".to_string())
}

// Revaluasi Aset Tetap (Penyesuaian Nilai Buku)
pub fn adjust_fixed_asset(conn: &Connection, adj: FixedAssetAdjustment) -> Result<String, String> {
    conn.execute(
        "INSERT INTO fixed_asset_adjustments (id, asset_id, date, type, amount, description) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![adj.id, adj.asset_id, adj.date, adj.adj_type, adj.amount, adj.description],
    ).map_err(|e| e.to_string())?;

    // Jurnal Revaluasi:
    // - Jika REVALUATION (Kenaikan): Debit Peralatan Kantor (1201), Kredit Beban (atau Ekuitas Selisih Revaluasi)
    // - Jika IMPAIRMENT (Penurunan): Debit Beban Penyusutan (5205), Kredit Akumulasi Penyusutan (1202)

    let journal_id = format!("JRN-ADJ-FA-{}", adj.id);
    conn.execute(
        "INSERT INTO journals (id, date, description, reference, is_anomaly) VALUES (?1, ?2, ?3, ?4, 0)",
        params![journal_id, adj.date, adj.description, adj.id],
    ).map_err(|e| e.to_string())?;

    if adj.adj_type == "REVALUATION" {
        // Update akumulasi depresiasi atau nilai buku di database
        // Untuk kemudahan, kita kurangi akumulasi depresiasi aset
        let _ = conn.execute(
            "UPDATE fixed_assets SET accumulated_depreciation = MAX(0.0, accumulated_depreciation - ?1) WHERE id = ?2",
            params![adj.amount, adj.asset_id],
        );

        // Debit: Akumulasi Penyusutan (1202)
        conn.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1202', ?2, 0.0)",
            params![journal_id, adj.amount],
        ).map_err(|e| e.to_string())?;

        // Kredit: Beban Penyusutan (5205)
        conn.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '5205', 0.0, ?2)",
            params![journal_id, adj.amount],
        ).map_err(|e| e.to_string())?;
    } else {
        // Impairment (Penurunan Nilai) -> Tambah Akumulasi Penyusutan
        let _ = conn.execute(
            "UPDATE fixed_assets SET accumulated_depreciation = accumulated_depreciation + ?1 WHERE id = ?2",
            params![adj.amount, adj.asset_id],
        );

        // Debit: Beban Penyusutan (5205)
        conn.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '5205', ?2, 0.0)",
            params![journal_id, adj.amount],
        ).map_err(|e| e.to_string())?;

        // Kredit: Akumulasi Penyusutan (1202)
        conn.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1202', 0.0, ?2)",
            params![journal_id, adj.amount],
        ).map_err(|e| e.to_string())?;
    }

    Ok("Nilai aset tetap berhasil disesuaikan".to_string())
}
