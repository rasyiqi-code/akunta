use tauri::State;
use tauri::Emitter;
use crate::DbState;
use crate::models::*;
use crate::accounting;

fn rand_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let n: u32 = rng.gen_range(100_000..999_999);
    n.to_string()
}

#[tauri::command]
pub fn get_products_rust(state: State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, name, sku, stock_qty, average_cost, selling_price FROM products").map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([], |row| {
        Ok(Product {
            id: row.get(0)?,
            name: row.get(1)?,
            sku: row.get(2)?,
            stock_qty: row.get(3)?,
            average_cost: row.get(4)?,
            selling_price: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut products = Vec::new();
    for p in iter {
        products.push(p.map_err(|e| e.to_string())?);
    }
    
    serde_json::to_string(&products).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_product_rust(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
    product_json: String,
) -> Result<(), String> {
    let product: Product = serde_json::from_str(&product_json)
        .map_err(|e| format!("Gagal parsing produk: {}", e))?;
        
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO products (id, name, sku, stock_qty, average_cost, selling_price) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            product.id,
            product.name,
            product.sku,
            product.stock_qty,
            product.average_cost,
            product.selling_price
        ],
    ).map_err(|e| e.to_string())?;
    
    let _ = app_handle.emit("db-update", "products");
    Ok(())
}

#[tauri::command]
pub fn get_inventory_logs_rust(state: State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, product_id, date, type, qty, cost, reference FROM inventory_logs ORDER BY date DESC, id DESC").map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([], |row| {
        Ok(InventoryLog {
            id: row.get(0)?,
            product_id: row.get(1)?,
            date: row.get(2)?,
            log_type: row.get(3)?,
            qty: row.get(4)?,
            cost: row.get(5)?,
            reference: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut logs = Vec::new();
    for l in iter {
        logs.push(l.map_err(|e| e.to_string())?);
    }
    
    serde_json::to_string(&logs).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn purchase_product_rust(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
    product_id: String,
    qty: f64,
    unit_cost: f64,
    date: String,
    ref_journal_id: Option<String>,
) -> Result<String, String> {
    if qty <= 0.0 {
        return Err("Kuantitas pembelian harus lebih besar dari 0.".to_string());
    }

    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Ambil detail produk
    let mut product: Product = tx.query_row(
        "SELECT id, name, sku, stock_qty, average_cost, selling_price FROM products WHERE id = ?1",
        [&product_id],
        |row| Ok(Product {
            id: row.get(0)?,
            name: row.get(1)?,
            sku: row.get(2)?,
            stock_qty: row.get(3)?,
            average_cost: row.get(4)?,
            selling_price: row.get(5)?,
        })
    ).map_err(|_| "Produk tidak ditemukan.".to_string())?;
    
    // Hitung average cost baru
    let current_stock = product.stock_qty;
    let current_avg_cost = product.average_cost;
    let total_cost = (current_stock * current_avg_cost) + (qty * unit_cost);
    let new_stock = current_stock + qty;
    let new_avg_cost = if new_stock > 0.0 { (total_cost / new_stock).round() } else { 0.0 };
    
    // Update data produk
    tx.execute(
        "UPDATE products SET stock_qty = ?1, average_cost = ?2 WHERE id = ?3",
        rusqlite::params![new_stock, new_avg_cost, product_id],
    ).map_err(|e| e.to_string())?;
    
    // Catat log inventaris
    let log_id = format!("ILG-{}", rand_id());
    tx.execute(
        "INSERT INTO inventory_logs (id, product_id, date, type, qty, cost, reference) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![log_id, product_id, date, "MASUK", qty, unit_cost, ref_journal_id],
    ).map_err(|e| e.to_string())?;
    
    tx.commit().map_err(|e| e.to_string())?;
    
    let _ = app_handle.emit("db-update", "products");
    
    product.stock_qty = new_stock;
    product.average_cost = new_avg_cost;
    
    serde_json::to_string(&product).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sell_product_rust(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
    product_id: String,
    qty: f64,
    date: String,
    ref_journal_id: Option<String>,
) -> Result<String, String> {
    if qty <= 0.0 {
        return Err("Kuantitas penjualan harus lebih besar dari 0.".to_string());
    }

    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Ambil detail produk
    let mut product: Product = tx.query_row(
        "SELECT id, name, sku, stock_qty, average_cost, selling_price FROM products WHERE id = ?1",
        [&product_id],
        |row| Ok(Product {
            id: row.get(0)?,
            name: row.get(1)?,
            sku: row.get(2)?,
            stock_qty: row.get(3)?,
            average_cost: row.get(4)?,
            selling_price: row.get(5)?,
        })
    ).map_err(|_| "Produk tidak ditemukan.".to_string())?;
    
    if product.stock_qty < qty {
        return Err(format!(
            "Stok produk \"{}\" tidak mencukupi. Sisa stok: {} unit.",
            product.name, product.stock_qty
        ));
    }
    
    let hpp_per_unit = product.average_cost;
    let total_hpp = qty * hpp_per_unit;
    let new_stock = product.stock_qty - qty;
    
    // Update data produk
    tx.execute(
        "UPDATE products SET stock_qty = ?1 WHERE id = ?2",
        rusqlite::params![new_stock, product_id],
    ).map_err(|e| e.to_string())?;
    
    // Catat log inventaris
    let log_id = format!("ILG-{}", rand_id());
    tx.execute(
        "INSERT INTO inventory_logs (id, product_id, date, type, qty, cost, reference) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![log_id, product_id, date, "KELUAR", qty, hpp_per_unit, ref_journal_id],
    ).map_err(|e| e.to_string())?;
    
    // Posting Jurnal HPP Otomatis
    // Debit 5101 (HPP) & Kredit 1105 (Persediaan Barang Dagang)
    if total_hpp > 0.0 {
        let jrn_id = format!("JRN-HPP-{}", rand_id());
        tx.execute(
            "INSERT INTO journals (id, date, description, reference, is_anomaly) VALUES (?1, ?2, ?3, ?4, 0)",
            rusqlite::params![jrn_id, date, format!("Pencatatan HPP Otomatis atas penjualan {} unit {}", qty, product.name), ref_journal_id],
        ).map_err(|e| e.to_string())?;
        
        tx.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '5101', ?2, 0.0)",
            rusqlite::params![jrn_id, total_hpp],
        ).map_err(|e| e.to_string())?;
        
        tx.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1105', 0.0, ?2)",
            rusqlite::params![jrn_id, total_hpp],
        ).map_err(|e| e.to_string())?;
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    
    let _ = app_handle.emit("db-update", "products");
    
    product.stock_qty = new_stock;
    
    let result = serde_json::json!({
        "updatedProduct": product,
        "totalHpp": total_hpp
    });
    
    Ok(result.to_string())
}

#[tauri::command]
pub fn adjust_product_stock_rust(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
    product_id: String,
    new_qty: f64,
    date: String,
    reason: String,
) -> Result<String, String> {
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Ambil detail produk
    let mut product: Product = tx.query_row(
        "SELECT id, name, sku, stock_qty, average_cost, selling_price FROM products WHERE id = ?1",
        [&product_id],
        |row| Ok(Product {
            id: row.get(0)?,
            name: row.get(1)?,
            sku: row.get(2)?,
            stock_qty: row.get(3)?,
            average_cost: row.get(4)?,
            selling_price: row.get(5)?,
        })
    ).map_err(|_| "Produk tidak ditemukan.".to_string())?;
    
    let diff = new_qty - product.stock_qty;
    let abs_qty = diff.abs();
    let total_val = abs_qty * product.average_cost;
    
    if diff == 0.0 {
        return Err("Kuantitas baru sama dengan stok saat ini. Tidak ada penyesuaian.".to_string());
    }
    
    // Update data produk
    tx.execute(
        "UPDATE products SET stock_qty = ?1 WHERE id = ?2",
        rusqlite::params![new_qty, product_id],
    ).map_err(|e| e.to_string())?;
    
    // Catat log inventaris
    let log_id = format!("ILG-{}", rand_id());
    tx.execute(
        "INSERT INTO inventory_logs (id, product_id, date, type, qty, cost, reference) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![log_id, product_id, date, "ADJUSTMENT", abs_qty, product.average_cost, reason],
    ).map_err(|e| e.to_string())?;
    
    // Jurnal Penyesuaian GL
    if total_val > 0.0 {
        let jrn_id = format!("JRN-ADJ-{}", rand_id());
        
        if diff > 0.0 {
            // Positif: Debit Persediaan (1105), Kredit Beban Operasional Lainnya (5206)
            tx.execute(
                "INSERT INTO journals (id, date, description, reference, is_anomaly) VALUES (?1, ?2, ?3, ?4, 0)",
                rusqlite::params![jrn_id, date, format!("Penyesuaian Persediaan (Positif): {}", reason), ""],
            ).map_err(|e| e.to_string())?;
            
            tx.execute(
                "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1105', ?2, 0.0)",
                rusqlite::params![jrn_id, total_val],
            ).map_err(|e| e.to_string())?;
            
            tx.execute(
                "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '5206', 0.0, ?2)",
                rusqlite::params![jrn_id, total_val],
            ).map_err(|e| e.to_string())?;
        } else {
            // Negatif: Debit Beban Operasional Lainnya (5206), Kredit Persediaan (1105)
            tx.execute(
                "INSERT INTO journals (id, date, description, reference, is_anomaly) VALUES (?1, ?2, ?3, ?4, 0)",
                rusqlite::params![jrn_id, date, format!("Penyesuaian Persediaan (Negatif): {}", reason), ""],
            ).map_err(|e| e.to_string())?;
            
            tx.execute(
                "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '5206', ?2, 0.0)",
                rusqlite::params![jrn_id, total_val],
            ).map_err(|e| e.to_string())?;
            
            tx.execute(
                "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1105', 0.0, ?2)",
                rusqlite::params![jrn_id, total_val],
            ).map_err(|e| e.to_string())?;
        }
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    
    let _ = app_handle.emit("db-update", "products");
    
    product.stock_qty = new_qty;
    
    let result = serde_json::json!({
        "updatedProduct": product,
        "diff": diff,
        "absQty": abs_qty,
        "totalVal": total_val
    });
    
    Ok(result.to_string())
}

#[tauri::command]
pub fn get_sales_documents_rust(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let docs = accounting::get_sales_documents(&conn)?;
    serde_json::to_string(&docs).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_sales_document_rust(state: State<'_, DbState>, doc_json: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let doc: SalesDocument = serde_json::from_str(&doc_json).map_err(|e| e.to_string())?;
    accounting::create_sales_document(&conn, doc)
}

#[tauri::command]
pub fn get_purchase_documents_rust(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let docs = accounting::get_purchase_documents(&conn)?;
    serde_json::to_string(&docs).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_purchase_document_rust(state: State<'_, DbState>, doc_json: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let doc: PurchaseDocument = serde_json::from_str(&doc_json).map_err(|e| e.to_string())?;
    accounting::create_purchase_document(&conn, doc)
}

#[tauri::command]
pub fn get_warehouses_rust(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let list = accounting::get_warehouses(&conn)?;
    serde_json::to_string(&list).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_stock_takes_rust(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let list = accounting::get_stock_takes(&conn)?;
    serde_json::to_string(&list).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_stock_take_rust(state: State<'_, DbState>, order_json: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let order: StockTakeOrder = serde_json::from_str(&order_json).map_err(|e| e.to_string())?;
    accounting::create_stock_take(&conn, order)
}
