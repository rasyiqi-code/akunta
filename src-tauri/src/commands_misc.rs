use tauri::{State, Emitter, Manager};
use std::fs;
use serde::{Deserialize, Serialize};
use crate::DbState;
use crate::models::*;
use crate::db;
use crate::accounting;

#[allow(dead_code)]
fn rand_id() -> String {
    use rand::Rng;
    let s: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(7)
        .map(char::from)
        .collect();
    s.to_lowercase()
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub fn save_export_file(app: tauri::AppHandle, filename: String, content: String) -> Result<String, String> {
    let doc_path = app.path().document_dir()
        .map_err(|e| format!("Gagal mendapatkan folder Documents: {}", e))?;
    
    let file_path = doc_path.join(&filename);
    
    fs::write(&file_path, content)
        .map_err(|e| format!("Gagal menulis berkas ke disk: {}", e))?;
        
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_chat_messages_rust(state: State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, sender, text, timestamp, card_type, card_data, image_url FROM chat_messages ORDER BY id ASC").map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([], |row| {
        Ok(ChatMessage {
            id: Some(row.get(0)?),
            sender: row.get(1)?,
            text: row.get(2)?,
            timestamp: row.get(3)?,
            card_type: row.get(4)?,
            card_data: row.get(5)?,
            image_url: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut messages = Vec::new();
    for m in iter {
        messages.push(m.map_err(|e| e.to_string())?);
    }
    
    serde_json::to_string(&messages).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_chat_message_rust(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
    sender: String,
    text: String,
    timestamp: String,
    card_type: Option<String>,
    card_data_json: Option<String>,
    image_url: Option<String>,
) -> Result<i64, String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO chat_messages (sender, text, timestamp, card_type, card_data, image_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![sender, text, timestamp, card_type, card_data_json, image_url],
    ).map_err(|e| e.to_string())?;
    
    let last_id = conn.last_insert_rowid();
    
    let _ = app_handle.emit("db-update", "chat_messages");
    
    Ok(last_id)
}

#[tauri::command]
pub fn update_chat_message_rust(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
    id: i64,
    text: String,
    card_type: Option<String>,
    card_data_json: Option<String>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE chat_messages SET text = ?1, card_type = ?2, card_data = ?3 WHERE id = ?4",
        rusqlite::params![text, card_type, card_data_json, id],
    ).map_err(|e| e.to_string())?;
    
    let _ = app_handle.emit("db-update", "chat_messages");
    Ok(())
}

#[tauri::command]
pub fn clear_chat_messages_rust(app_handle: tauri::AppHandle, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM chat_messages", []).map_err(|e| e.to_string())?;
    
    let _ = app_handle.emit("db-update", "chat_messages");
    Ok(())
}

#[tauri::command]
pub fn extract_ocr_details_rust(filename: String) -> Result<String, String> {
    let name_lower = filename.to_lowercase();
    let text = if name_lower.contains("kopi") || name_lower.contains("arabika") || name_lower.contains("nota") {
        "Beli 5 pack Biji Kopi Arabika seharga 40rb per pack tunai"
    } else if name_lower.contains("listrik") || name_lower.contains("pln") || name_lower.contains("struk") {
        "Bayar tagihan listrik ruko 350rb pakai BCA"
    } else if name_lower.contains("susu") || name_lower.contains("uht") {
        "Beli 10 pack Susu UHT 1L seharga 15rb per pack tunai"
    } else {
        "Bayar langganan software Zoom senilai 250rb pakai Mandiri"
    };
    Ok(text.to_string())
}

#[tauri::command]
pub fn analyze_report_health_rust(report_type: String, report_data_json: String) -> Result<String, String> {
    #[derive(Serialize, Deserialize)]
    struct HealthAnalysisResult {
        health: String,
        #[serde(rename = "narrativeText")]
        narrative_text: String,
    }

    if report_type == "LABARUGI" {
        let report: ProfitLossReportRust = serde_json::from_str(&report_data_json)
            .map_err(|e| format!("Gagal mendeserialisasi data: {}", e))?;

        let health = if report.net_profit > 5000000.0 || (report.total_revenue > 0.0 && report.net_profit > 0.15 * report.total_revenue) {
            "SEHAT".to_string()
        } else if report.net_profit <= 0.0 {
            "KRITIS".to_string()
        } else {
            "WASPADA".to_string()
        };

        let advice = if health == "SEHAT" {
            "Bisnis Anda berjalan sangat sehat! Pertahankan performa ini dan pertimbangkan untuk menaikkan kapasitas produksi."
        } else if health == "WASPADA" {
            "Bisnis Anda mencatat keuntungan namun dengan margin yang tipis. Coba periksa biaya operasional yang bisa dikurangi."
        } else {
            "Peringatan: Bisnis Anda mengalami kerugian operasional bulan ini. Segera evaluasi harga jual produk dan tekan pengeluaran darurat."
        };

        let narrative_text = format!(
            "KESEHATAN BISNIS: {}\n\nBerdasarkan data Laba Rugi saat ini, Total Pendapatan Anda adalah Rp {} dengan Total Beban Rp {}.\n\nLaba bersih Anda tercatat sebesar Rp {}.\n\n{}",
            health,
            report.total_revenue,
            report.total_expenses,
            report.net_profit,
            advice
        );

        let result = HealthAnalysisResult {
            health,
            narrative_text,
        };

        serde_json::to_string(&result).map_err(|e| e.to_string())
    } else if report_type == "NERACA" {
        let report: BalanceSheetReportRust = serde_json::from_str(&report_data_json)
            .map_err(|e| format!("Gagal mendeserialisasi data: {}", e))?;

        let ratio = if report.total_liabilities > 0.0 {
            report.total_assets / report.total_liabilities
        } else {
            f64::MAX
        };

        let health = if ratio >= 2.0 {
            "SEHAT".to_string()
        } else if ratio >= 1.0 {
            "WASPADA".to_string()
        } else {
            "KRITIS".to_string()
        };

        let advice = match health.as_str() {
            "SEHAT" => "Kondisi neraca sangat baik, kepemilikan aset jauh lebih besar dari utang.",
            "WASPADA" => "Porsi utang Anda cukup tinggi. Jaga likuiditas kas agar pembayaran utang lancar.",
            _ => "KRITIS: Utang Anda melebihi total aset. Segera lakukan konsolidasi utang dan evaluasi pengeluaran.",
        };

        let narrative_text = format!(
            "KESEHATAN BISNIS: {}\n\nNeraca keuangan Anda menunjukkan total kepemilikan Aset sebesar Rp {}, dengan total Utang/Kewajiban Rp {} dan Modal Pemilik Rp {}.\n\nAset Anda seimbang dengan Kewajiban + Ekuitas. {}",
            health,
            report.total_assets,
            report.total_liabilities,
            report.total_equity,
            advice
        );

        let result = HealthAnalysisResult {
            health,
            narrative_text,
        };

        serde_json::to_string(&result).map_err(|e| e.to_string())
    } else {
        Err(format!("Tipe laporan tidak dikenal: {}", report_type))
    }
}

#[tauri::command]
pub fn export_backup_json_rust(state: State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    
    // 1. Ambil accounts
    let mut stmt = conn.prepare("SELECT code, name, type, normal_balance FROM accounts").unwrap();
    let accounts: Vec<Account> = stmt.query_map([], |row| {
        Ok(Account {
            code: row.get(0)?,
            name: row.get(1)?,
            acc_type: row.get(2)?,
            normal_balance: row.get(3)?,
        })
    }).unwrap().map(|r| r.unwrap()).collect();
    
    // 2. Ambil journals beserta lines
    let mut stmt = conn.prepare("SELECT id, date, description, reference, is_anomaly FROM journals").unwrap();
    let journals: Vec<JournalEntryWithAnomaly> = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let date: String = row.get(1)?;
        let description: String = row.get(2)?;
        let reference: Option<String> = row.get(3)?;
        let is_anomaly_int: i32 = row.get(4)?;
        
        let mut stmt_l = conn.prepare("SELECT account_code, debit, credit FROM journal_lines WHERE journal_id = ?1").unwrap();
        let lines: Vec<JournalLine> = stmt_l.query_map([&id], |r| {
            Ok(JournalLine {
                account_code: r.get(0)?,
                debit: r.get(1)?,
                credit: r.get(2)?,
            })
        }).unwrap().map(|r| r.unwrap()).collect();
        
        Ok(JournalEntryWithAnomaly {
            id,
            date,
            description,
            reference,
            lines,
            is_anomaly: is_anomaly_int == 1,
        })
    }).unwrap().map(|r| r.unwrap()).collect();
    
    // 3. Ambil contacts
    let mut stmt = conn.prepare("SELECT id, name, type FROM contacts").unwrap();
    let contacts: Vec<Contact> = stmt.query_map([], |row| {
        Ok(Contact {
            id: row.get(0)?,
            name: row.get(1)?,
            contact_type: row.get(2)?,
        })
    }).unwrap().map(|r| r.unwrap()).collect();
    
    // 4. Ambil bank statements
    let mut stmt = conn.prepare("SELECT id, date, description, amount, matched_journal_id, confidence_score FROM bank_statements").unwrap();
    let bank_statements: Vec<BankStatementItem> = stmt.query_map([], |row| {
        Ok(BankStatementItem {
            id: row.get(0)?,
            date: row.get(1)?,
            description: row.get(2)?,
            amount: row.get(3)?,
            matched_journal_id: row.get(4)?,
            confidence_score: row.get(5)?,
        })
    }).unwrap().map(|r| r.unwrap()).collect();
    
    // 5. Ambil products
    let mut stmt = conn.prepare("SELECT id, name, sku, stock_qty, average_cost, selling_price FROM products").unwrap();
    let products: Vec<Product> = stmt.query_map([], |row| {
        Ok(Product {
            id: row.get(0)?,
            name: row.get(1)?,
            sku: row.get(2)?,
            stock_qty: row.get(3)?,
            average_cost: row.get(4)?,
            selling_price: row.get(5)?,
        })
    }).unwrap().map(|r| r.unwrap()).collect();
    
    // 6. Ambil inventory logs
    let mut stmt = conn.prepare("SELECT id, product_id, date, type, qty, cost, reference, warehouse_id FROM inventory_logs").unwrap();
    let inventory_logs: Vec<InventoryLog> = stmt.query_map([], |row| {
        Ok(InventoryLog {
            id: row.get(0)?,
            product_id: row.get(1)?,
            date: row.get(2)?,
            log_type: row.get(3)?,
            qty: row.get(4)?,
            cost: row.get(5)?,
            reference: row.get(6)?,
            warehouse_id: row.get(7)?,
        })
    }).unwrap().map(|r| r.unwrap()).collect();
    
    // 7. Ambil fixed assets
    let mut stmt = conn.prepare("SELECT id, name, purchase_date, cost, useful_life_years, salvage_value, accumulated_depreciation, is_fully_depreciated FROM fixed_assets").unwrap();
    let fixed_assets: Vec<FixedAsset> = stmt.query_map([], |row| {
        let is_fully_depr_int: i32 = row.get(7)?;
        Ok(FixedAsset {
            id: row.get(0)?,
            name: row.get(1)?,
            purchase_date: row.get(2)?,
            cost: row.get(3)?,
            useful_life_years: row.get(4)?,
            salvage_value: row.get(5)?,
            accumulated_depreciation: row.get(6)?,
            is_fully_depreciated: Some(is_fully_depr_int == 1),
        })
    }).unwrap().map(|r| r.unwrap()).collect();

    // Fungsi bantu: konversi query row ke serde_json::Value
    let rows_to_json = |sql: &str| -> Vec<serde_json::Value> {
        let mut stmt = conn.prepare(sql).unwrap();
        let col_count = stmt.column_count();
        let col_names: Vec<String> = (0..col_count)
            .map(|i| stmt.column_name(i).unwrap().to_string())
            .collect();
        stmt.query_map([], |row| {
            let mut map = serde_json::Map::new();
            for i in 0..col_count {
                let val: String = row.get(i).unwrap_or_default();
                map.insert(col_names[i].clone(), serde_json::Value::String(val));
            }
            Ok(serde_json::Value::Object(map))
        }).unwrap().map(|r| r.unwrap()).collect()
    };

    let settings = rows_to_json("SELECT key, value FROM settings");
    let warehouses = rows_to_json("SELECT id, name FROM warehouses");
    let sales_documents = rows_to_json("SELECT id, date, contact_id, type AS doc_type, status, reference_id, total_amount, ppn_amount, grand_total, dp_applied FROM sales_documents");
    let sales_document_items = rows_to_json("SELECT document_id, product_id, qty, price, discount FROM sales_document_items");
    let purchase_documents = rows_to_json("SELECT id, date, contact_id, type AS doc_type, status, reference_id, total_amount, ppn_amount, grand_total, dp_applied FROM purchase_documents");
    let purchase_document_items = rows_to_json("SELECT document_id, product_id, qty, price, discount FROM purchase_document_items");
    let chat_messages = rows_to_json("SELECT id, role, content, created_at FROM chat_messages");
    let fixed_asset_adjustments = rows_to_json("SELECT id, asset_id, adjustment_type, previous_value, new_value, date, description FROM fixed_asset_adjustments");

    let backup_data = serde_json::json!({
        "accounts": accounts,
        "journals": journals,
        "contacts": contacts,
        "bankStatements": bank_statements,
        "products": products,
        "inventoryLogs": inventory_logs,
        "fixedAssets": fixed_assets,
        "settings": settings,
        "warehouses": warehouses,
        "salesDocuments": sales_documents,
        "salesDocumentItems": sales_document_items,
        "purchaseDocuments": purchase_documents,
        "purchaseDocumentItems": purchase_document_items,
        "chatMessages": chat_messages,
        "fixedAssetAdjustments": fixed_asset_adjustments,
    });
    
    Ok(backup_data.to_string())
}

#[tauri::command]
pub fn import_backup_json_rust(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
    json_string: String,
) -> Result<(), String> {
    let data: serde_json::Value = serde_json::from_str(&json_string)
        .map_err(|e| format!("Format berkas backup tidak valid: {}", e))?;
        
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Clear all tables (with foreign key handling)
    tx.execute("PRAGMA foreign_keys = OFF;", []).unwrap();
    for table in &[
        "fixed_asset_adjustments",
        "stock_take_items",
        "stock_take_orders",
        "purchase_document_items",
        "purchase_documents",
        "sales_document_items",
        "sales_documents",
        "chat_messages",
        "inventory_logs",
        "journal_lines",
        "journals",
        "products",
        "bank_statements",
        "contacts",
        "warehouses",
        "settings",
        "fixed_assets",
        "accounts",
    ] {
        let query = format!("DELETE FROM {}", table);
        tx.execute(&query, []).unwrap();
    }
    tx.execute("PRAGMA foreign_keys = ON;", []).unwrap();
    
    // Insert accounts
    if let Some(arr) = data["accounts"].as_array() {
        for val in arr {
            tx.execute(
                "INSERT INTO accounts (code, name, type, normal_balance) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![
                    val["code"].as_str().unwrap(),
                    val["name"].as_str().unwrap(),
                    val["type"].as_str().unwrap(),
                    val["normalBalance"].as_str().unwrap_or("D")
                ]
            ).unwrap();
        }
    }
    
    // Insert journals
    if let Some(arr) = data["journals"].as_array() {
        for val in arr {
            let id = val["id"].as_str().unwrap();
            tx.execute(
                "INSERT INTO journals (id, date, description, reference, is_anomaly) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![
                    id,
                    val["date"].as_str().unwrap(),
                    val["description"].as_str().unwrap(),
                    val["reference"].as_str(),
                    if val["isAnomaly"].as_bool().unwrap_or(false) { 1 } else { 0 }
                ]
            ).unwrap();
            
            if let Some(lines) = val["lines"].as_array() {
                for l in lines {
                    tx.execute(
                        "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, ?2, ?3, ?4)",
                        rusqlite::params![
                            id,
                            l["accountCode"].as_str().unwrap(),
                            l["debit"].as_f64().unwrap_or(0.0),
                            l["credit"].as_f64().unwrap_or(0.0)
                        ]
                    ).unwrap();
                }
            }
        }
    }

    // Insert contacts
    if let Some(arr) = data["contacts"].as_array() {
        for val in arr {
            tx.execute(
                "INSERT INTO contacts (id, name, type) VALUES (?1, ?2, ?3)",
                rusqlite::params![
                    val["id"].as_str().unwrap(),
                    val["name"].as_str().unwrap(),
                    val["type"].as_str().unwrap()
                ]
            ).unwrap();
        }
    }

    // Insert bank statements
    if let Some(arr) = data["bankStatements"].as_array() {
        for val in arr {
            let amount = val["amount"].as_f64().unwrap_or(0.0);
            tx.execute(
                "INSERT INTO bank_statements (id, date, description, amount, matched_journal_id, confidence_score) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    val["id"].as_str().unwrap_or(""),
                    val["date"].as_str().unwrap_or(""),
                    val["description"].as_str().unwrap_or(""),
                    amount,
                    val["matchedJournalId"].as_str(),
                    val["confidenceScore"].as_f64()
                ]
            ).unwrap();
        }
    }

    // Insert products
    if let Some(arr) = data["products"].as_array() {
        for val in arr {
            tx.execute(
                "INSERT INTO products (id, name, sku, stock_qty, average_cost, selling_price) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    val["id"].as_str().unwrap(),
                    val["name"].as_str().unwrap(),
                    val["sku"].as_str().unwrap(),
                    val["stockQty"].as_f64().unwrap_or(0.0),
                    val["averageCost"].as_f64().unwrap_or(0.0),
                    val["sellingPrice"].as_f64().unwrap_or(0.0)
                ]
            ).unwrap();
        }
    }

    // Insert inventory logs
    if let Some(arr) = data["inventoryLogs"].as_array() {
        for val in arr {
            tx.execute(
                "INSERT INTO inventory_logs (id, product_id, date, type, qty, cost, reference, warehouse_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    val["id"].as_str().unwrap(),
                    val["productId"].as_str().unwrap(),
                    val["date"].as_str().unwrap(),
                    val["type"].as_str().unwrap(),
                    val["qty"].as_f64().unwrap(),
                    val["cost"].as_f64().unwrap(),
                    val["reference"].as_str(),
                    val["warehouseId"].as_str().unwrap_or("w-01")
                ]
            ).unwrap();
        }
    }

    // Insert fixed assets
    if let Some(arr) = data["fixedAssets"].as_array() {
        for val in arr {
            tx.execute(
                "INSERT INTO fixed_assets (id, name, purchase_date, cost, useful_life_years, salvage_value, accumulated_depreciation, is_fully_depreciated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    val["id"].as_str().unwrap(),
                    val["name"].as_str().unwrap(),
                    val["purchaseDate"].as_str().unwrap(),
                    val["cost"].as_f64().unwrap(),
                    val["usefulLifeYears"].as_f64().unwrap(),
                    val["salvageValue"].as_f64().unwrap(),
                    val["accumulatedDepreciation"].as_f64().unwrap_or(0.0),
                    if val["isFullyDepreciated"].as_bool().unwrap_or(false) { 1 } else { 0 }
                ]
            ).unwrap();
        }
    }

    // Insert settings
    if let Some(arr) = data["settings"].as_array() {
        for val in arr {
            tx.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                rusqlite::params![
                    val["key"].as_str().unwrap_or(""),
                    val["value"].as_str().unwrap_or("")
                ]
            ).unwrap();
        }
    }

    // Insert warehouses
    if let Some(arr) = data["warehouses"].as_array() {
        for val in arr {
            tx.execute(
                "INSERT OR REPLACE INTO warehouses (id, name, location) VALUES (?1, ?2, ?3)",
                rusqlite::params![
                    val["id"].as_str().unwrap_or(""),
                    val["name"].as_str().unwrap_or(""),
                    val["location"].as_str().unwrap_or("")
                ]
            ).unwrap();
        }
    }

    // Insert sales documents
    if let Some(arr) = data["salesDocuments"].as_array() {
        for val in arr {
            tx.execute(
                "INSERT OR REPLACE INTO sales_documents (id, date, contact_id, type, status, reference_id, total_amount, ppn_amount, grand_total, dp_applied) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                rusqlite::params![
                    val["id"].as_str().unwrap_or(""),
                    val["date"].as_str().unwrap_or(""),
                    val["contactId"].as_str().unwrap_or(""),
                    val["docType"].as_str().unwrap_or(""),
                    val["status"].as_str().unwrap_or(""),
                    val["referenceId"].as_str(),
                    val["totalAmount"].as_f64().unwrap_or(0.0),
                    val["ppnAmount"].as_f64().unwrap_or(0.0),
                    val["grandTotal"].as_f64().unwrap_or(0.0),
                    val["dpApplied"].as_f64().unwrap_or(0.0)
                ]
            ).unwrap();
        }
    }

    // Insert sales document items
    if let Some(arr) = data["salesDocumentItems"].as_array() {
        for val in arr {
            tx.execute(
                "INSERT OR REPLACE INTO sales_document_items (document_id, product_id, qty, price, discount) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![
                    val["documentId"].as_str().unwrap_or(""),
                    val["productId"].as_str().unwrap_or(""),
                    val["qty"].as_f64().unwrap_or(0.0),
                    val["price"].as_f64().unwrap_or(0.0),
                    val["discount"].as_f64().unwrap_or(0.0)
                ]
            ).unwrap();
        }
    }

    // Insert purchase documents
    if let Some(arr) = data["purchaseDocuments"].as_array() {
        for val in arr {
            tx.execute(
                "INSERT OR REPLACE INTO purchase_documents (id, date, contact_id, type, status, reference_id, total_amount, ppn_amount, grand_total, dp_applied) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                rusqlite::params![
                    val["id"].as_str().unwrap_or(""),
                    val["date"].as_str().unwrap_or(""),
                    val["contactId"].as_str().unwrap_or(""),
                    val["docType"].as_str().unwrap_or(""),
                    val["status"].as_str().unwrap_or(""),
                    val["referenceId"].as_str(),
                    val["totalAmount"].as_f64().unwrap_or(0.0),
                    val["ppnAmount"].as_f64().unwrap_or(0.0),
                    val["grandTotal"].as_f64().unwrap_or(0.0),
                    val["dpApplied"].as_f64().unwrap_or(0.0)
                ]
            ).unwrap();
        }
    }

    // Insert purchase document items
    if let Some(arr) = data["purchaseDocumentItems"].as_array() {
        for val in arr {
            tx.execute(
                "INSERT OR REPLACE INTO purchase_document_items (document_id, product_id, qty, price, discount) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![
                    val["documentId"].as_str().unwrap_or(""),
                    val["productId"].as_str().unwrap_or(""),
                    val["qty"].as_f64().unwrap_or(0.0),
                    val["price"].as_f64().unwrap_or(0.0),
                    val["discount"].as_f64().unwrap_or(0.0)
                ]
            ).unwrap();
        }
    }

    // Insert chat messages
    if let Some(arr) = data["chatMessages"].as_array() {
        for val in arr {
            tx.execute(
                "INSERT OR REPLACE INTO chat_messages (id, role, content, created_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![
                    val["id"].as_str().unwrap_or(""),
                    val["role"].as_str().unwrap_or(""),
                    val["content"].as_str().unwrap_or(""),
                    val["createdAt"].as_str().unwrap_or("")
                ]
            ).unwrap();
        }
    }

    // Insert fixed asset adjustments
    if let Some(arr) = data["fixedAssetAdjustments"].as_array() {
        for val in arr {
            tx.execute(
                "INSERT OR REPLACE INTO fixed_asset_adjustments (id, asset_id, adjustment_type, previous_value, new_value, date, description) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    val["id"].as_str().unwrap_or(""),
                    val["assetId"].as_str().unwrap_or(""),
                    val["adjustmentType"].as_str().unwrap_or(""),
                    val["previousValue"].as_f64().unwrap_or(0.0),
                    val["newValue"].as_f64().unwrap_or(0.0),
                    val["date"].as_str().unwrap_or(""),
                    val["description"].as_str().unwrap_or("")
                ]
            ).unwrap();
        }
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    
    // Emit ke all listeners
    let _ = app_handle.emit("db-update", "all");
    
    Ok(())
}

#[tauri::command]
pub fn get_contacts_rust(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, type FROM contacts")
        .map_err(|e| format!("Gagal mempersiapkan query contacts: {}", e))?;
    let contacts_iter = stmt.query_map([], |row| {
        Ok(Contact {
            id: row.get(0)?,
            name: row.get(1)?,
            contact_type: row.get(2)?,
        })
    }).map_err(|e| format!("Gagal memetakan query contacts: {}", e))?;

    let mut contacts = Vec::new();
    for contact in contacts_iter {
        contacts.push(contact.map_err(|e| e.to_string())?);
    }

    serde_json::to_string(&contacts).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_contact_rust(app_handle: tauri::AppHandle, state: State<'_, DbState>, contact_json: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let contact: Contact = serde_json::from_str(&contact_json).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO contacts (id, name, type) VALUES (?1, ?2, ?3)",
        rusqlite::params![contact.id, contact.name, contact.contact_type],
    ).map_err(|e| format!("Gagal menambahkan kontak ke database: {}", e))?;
    
    let _ = app_handle.emit("db-update", "contacts");
    Ok(())
}

#[tauri::command]
pub fn update_contact_rust(app_handle: tauri::AppHandle, state: State<'_, DbState>, contact_json: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let contact: Contact = serde_json::from_str(&contact_json).map_err(|e| e.to_string())?;
    accounting::update_contact(&conn, &contact)?;
    let _ = app_handle.emit("db-update", "contacts");
    Ok(())
}

#[tauri::command]
pub fn delete_contact_rust(app_handle: tauri::AppHandle, state: State<'_, DbState>, contact_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    accounting::delete_contact(&conn, &contact_id)?;
    let _ = app_handle.emit("db-update", "contacts");
    Ok(())
}

#[tauri::command]
pub fn get_gemini_api_key_rust(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let key: String = conn.query_row(
        "SELECT value FROM settings WHERE key = 'gemini_api_key'",
        [],
        |row| row.get(0),
    ).unwrap_or_else(|_| std::env::var("GEMINI_API_KEY").unwrap_or_default());
    Ok(key)
}

#[tauri::command]
pub fn get_gemini_api_url_rust(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let url: String = conn.query_row(
        "SELECT value FROM settings WHERE key = 'gemini_api_url'",
        [],
        |row| row.get(0),
    ).unwrap_or_default();
    Ok(url)
}

#[tauri::command]
pub fn get_gemini_model_rust(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let model: String = conn.query_row(
        "SELECT value FROM settings WHERE key = 'gemini_model'",
        [],
        |row| row.get(0),
    ).unwrap_or_else(|_| "gemini-2.5-flash".to_string());
    Ok(model)
}

#[tauri::command]
pub fn set_setting_rust(state: State<'_, DbState>, key: String, value: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_app_settings_rust(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
        ))
    }).map_err(|e| e.to_string())?;
    let mut map = serde_json::Map::new();
    for r in rows {
        let (k, v) = r.map_err(|e| e.to_string())?;
        map.insert(k, serde_json::Value::String(v));
    }
    serde_json::to_string(&map).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reset_database_rust(app_handle: tauri::AppHandle, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    
    // Clear all tables (dalam urutan yang aman untuk foreign key)
    let tables = vec![
        "fixed_asset_adjustments",
        "stock_take_items",
        "stock_take_orders",
        "purchase_document_items",
        "purchase_documents",
        "sales_document_items",
        "sales_documents",
        "inventory_logs",
        "journal_lines",
        "journals",
        "chat_messages",
        "fixed_assets",
        "products",
        "bank_statements",
        "contacts",
        "warehouses",
        "settings",
        "accounts",
    ];
    
    // Nonaktifkan foreign key sementara agar urutan hapus tidak masalah
    conn.execute("PRAGMA foreign_keys = OFF;", []).unwrap();
    for table in &tables {
        let query = format!("DELETE FROM {}", table);
        conn.execute(&query, [])
            .map_err(|e| format!("Gagal menghapus data tabel {}: {}", table, e))?;
    }
    conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();
    
    // Reset sequence auto-increment
    let _ = conn.execute("DELETE FROM sqlite_sequence", []);
    
    // Seed default data (tanpa data demo)
    db::seed_default_data(&conn, false)?;
    
    // Emit ke all listeners
    let _ = app_handle.emit("db-update", "all");
    
    Ok(())
}
