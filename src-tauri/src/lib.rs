use tauri::Manager;
use tauri::Emitter;
use std::fs;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use rusqlite::Connection;

mod db;
mod accounting;

// State untuk menyimpan koneksi database SQLite secara thread-safe
pub struct DbState(pub Mutex<Connection>);

// ==========================================
// DATA STRUCTURES & DESERIALIZERS
// ==========================================

#[derive(Serialize, Deserialize, Clone)]
struct FixedAsset {
    id: String,
    name: String,
    #[serde(rename = "purchaseDate")]
    purchase_date: String,
    cost: f64,
    #[serde(rename = "usefulLifeYears")]
    useful_life_years: f64,
    #[serde(rename = "salvageValue")]
    salvage_value: f64,
    #[serde(rename = "accumulatedDepreciation")]
    accumulated_depreciation: f64,
    #[serde(rename = "isFullyDepreciated")]
    is_fully_depreciated: Option<bool>,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone)]
struct SalesDocumentItem {
    id: Option<i64>,
    #[serde(rename = "documentId")]
    document_id: String,
    #[serde(rename = "productId")]
    product_id: String,
    qty: f64,
    price: f64,
    discount: f64,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone)]
struct SalesDocument {
    id: String,
    date: String,
    #[serde(rename = "contactId")]
    contact_id: String,
    #[serde(rename = "type")]
    doc_type: String, // 'QUOTATION' | 'ORDER' | 'DELIVERY' | 'INVOICE' | 'RETURN'
    status: String, // 'PENDING' | 'COMPLETED' | 'CANCELLED'
    #[serde(rename = "referenceId")]
    reference_id: Option<String>,
    #[serde(rename = "totalAmount")]
    total_amount: f64,
    #[serde(rename = "dpApplied")]
    dp_applied: f64,
    items: Option<Vec<SalesDocumentItem>>,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone)]
struct PurchaseDocumentItem {
    id: Option<i64>,
    #[serde(rename = "documentId")]
    document_id: String,
    #[serde(rename = "productId")]
    product_id: String,
    qty: f64,
    price: f64,
    discount: f64,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone)]
struct PurchaseDocument {
    id: String,
    date: String,
    #[serde(rename = "contactId")]
    contact_id: String,
    #[serde(rename = "type")]
    doc_type: String, // 'ORDER' | 'RECEIPT' | 'INVOICE' | 'RETURN'
    status: String, // 'PENDING' | 'COMPLETED' | 'CANCELLED'
    #[serde(rename = "referenceId")]
    reference_id: Option<String>,
    #[serde(rename = "totalAmount")]
    total_amount: f64,
    #[serde(rename = "dpApplied")]
    dp_applied: f64,
    items: Option<Vec<PurchaseDocumentItem>>,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone)]
struct Warehouse {
    id: String,
    name: String,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone)]
struct StockTakeItem {
    id: Option<i64>,
    #[serde(rename = "stockTakeId")]
    stock_take_id: String,
    #[serde(rename = "productId")]
    product_id: String,
    #[serde(rename = "systemQty")]
    system_qty: f64,
    #[serde(rename = "physicalQty")]
    physical_qty: f64,
    #[serde(rename = "diffQty")]
    diff_qty: f64,
    cost: f64,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone)]
struct StockTakeOrder {
    id: String,
    date: String,
    status: String, // 'DRAFT' | 'COMPLETED'
    items: Option<Vec<StockTakeItem>>,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone)]
struct FixedAssetAdjustment {
    id: String,
    #[serde(rename = "assetId")]
    asset_id: String,
    date: String,
    #[serde(rename = "type")]
    adj_type: String, // 'REVALUATION' | 'IMPAIRMENT'
    amount: f64,
    description: String,
}


#[derive(Serialize, Deserialize, Clone)]
struct JournalLine {
    #[serde(rename = "accountCode")]
    account_code: String,
    debit: f64,
    credit: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct JournalEntry {
    id: String,
    date: String,
    description: String,
    reference: Option<String>,
    lines: Vec<JournalLine>,
}

#[derive(Serialize, Deserialize, Clone)]
struct JournalEntryWithAnomaly {
    id: String,
    date: String,
    description: String,
    reference: Option<String>,
    lines: Vec<JournalLine>,
    #[serde(rename = "isAnomaly")]
    is_anomaly: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct Contact {
    id: String,
    name: String,
    #[serde(rename = "type")]
    contact_type: String, // 'CUSTOMER' | 'VENDOR'
}

#[derive(Serialize, Deserialize, Clone)]
struct BankStatementItem {
    id: String,
    date: String,
    description: String,
    amount: f64,
    #[serde(rename = "matchedJournalId")]
    matched_journal_id: Option<String>,
    #[serde(rename = "confidenceScore")]
    confidence_score: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ChatMessage {
    id: Option<i64>,
    sender: String, // 'USER' | 'AI'
    text: String,
    timestamp: String,
    #[serde(rename = "cardType")]
    card_type: Option<String>,
    #[serde(rename = "cardData")]
    card_data: Option<String>, // JSON string
    #[serde(rename = "imageUrl")]
    image_url: Option<String>, // base64 string
}

#[derive(Serialize, Deserialize, Clone)]
struct Product {
    id: String,
    name: String,
    sku: String,
    #[serde(rename = "stockQty")]
    stock_qty: f64,
    #[serde(rename = "averageCost")]
    average_cost: f64,
    #[serde(rename = "sellingPrice")]
    selling_price: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct InventoryLog {
    id: String,
    #[serde(rename = "productId")]
    product_id: String,
    date: String,
    #[serde(rename = "type")]
    log_type: String, // 'MASUK' | 'KELUAR' | 'ADJUSTMENT'
    qty: f64,
    cost: f64,
    reference: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct DepreciationResult {
    #[serde(rename = "updatedAssets")]
    updated_assets: Vec<FixedAsset>,
    #[serde(rename = "totalDepreciated")]
    total_depreciated: f64,
    #[serde(rename = "postedJournals")]
    posted_journals: Vec<JournalEntryStub>,
}

#[derive(Serialize, Deserialize)]
struct JournalEntryStub {
    #[serde(rename = "assetId")]
    asset_id: String,
    #[serde(rename = "assetName")]
    asset_name: String,
    amount: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct TaxTransaction {
    date: String,
    #[serde(rename = "refId")]
    ref_id: String,
    description: String,
    dpp: f64,
    #[serde(rename = "taxAmount")]
    tax_amount: f64,
    #[serde(rename = "taxType")]
    tax_type: String, // "PPN_MASUKAN" | "PPN_KELUARAN" | "PPH_21" | "PPH_23"
}

#[derive(Serialize, Deserialize, Clone)]
struct TaxSummary {
    #[serde(rename = "ppnMasukan")]
    ppn_masukan: f64,
    #[serde(rename = "ppnKeluaran")]
    ppn_keluaran: f64,
    #[serde(rename = "pph21")]
    pph21: f64,
    #[serde(rename = "pph23")]
    pph23: f64,
    transactions: Vec<TaxTransaction>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Account {
    code: String,
    name: String,
    #[serde(rename = "type")]
    acc_type: String, // "ASET" | "KEWAJIBAN" | "EKUITAS" | "PENDAPATAN" | "BEBAN"
    #[serde(rename = "normalBalance")]
    normal_balance: String, // "D" | "K"
}

#[derive(Serialize, Deserialize, Clone)]
struct LedgerEntry {
    id: String,
    date: String,
    description: String,
    debit: f64,
    credit: f64,
    balance: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct GeneralLedgerResult {
    account: Account,
    entries: Vec<LedgerEntry>,
    #[serde(rename = "finalBalance")]
    final_balance: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct RevenueExpenseItem {
    code: String,
    name: String,
    amount: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct ProfitLossReportRust {
    revenue: Vec<RevenueExpenseItem>,
    expenses: Vec<RevenueExpenseItem>,
    #[serde(rename = "totalRevenue")]
    total_revenue: f64,
    #[serde(rename = "totalExpenses")]
    total_expenses: f64,
    #[serde(rename = "netProfit")]
    net_profit: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct BalanceSheetReportRust {
    assets: Vec<RevenueExpenseItem>,
    liabilities: Vec<RevenueExpenseItem>,
    equity: Vec<RevenueExpenseItem>,
    #[serde(rename = "totalAssets")]
    total_assets: f64,
    #[serde(rename = "totalLiabilities")]
    total_liabilities: f64,
    #[serde(rename = "totalEquity")]
    total_equity: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct TrialBalanceItem {
    code: String,
    name: String,
    #[serde(rename = "type")]
    acc_type: String,
    debit: f64,
    credit: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct TrialBalanceReport {
    items: Vec<TrialBalanceItem>,
    #[serde(rename = "totalDebit")]
    total_debit: f64,
    #[serde(rename = "totalCredit")]
    total_credit: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct CashFlowItem {
    description: String,
    amount: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct CashFlowReportRust {
    #[serde(rename = "operatingReceipts")]
    operating_receipts: Vec<CashFlowItem>,
    #[serde(rename = "operatingPayments")]
    operating_payments: Vec<CashFlowItem>,
    #[serde(rename = "totalOperating")]
    total_operating: f64,
    
    #[serde(rename = "investingReceipts")]
    investing_receipts: Vec<CashFlowItem>,
    #[serde(rename = "investingPayments")]
    investing_payments: Vec<CashFlowItem>,
    #[serde(rename = "totalInvesting")]
    total_investing: f64,
    
    #[serde(rename = "financingReceipts")]
    financing_receipts: Vec<CashFlowItem>,
    #[serde(rename = "financingPayments")]
    financing_payments: Vec<CashFlowItem>,
    #[serde(rename = "totalFinancing")]
    total_financing: f64,
    
    #[serde(rename = "netIncrease")]
    net_increase: f64,
    #[serde(rename = "startBalance")]
    start_balance: f64,
    #[serde(rename = "endBalance")]
    end_balance: f64,
}

#[derive(Serialize, Deserialize)]
struct ReconciliationResult {
    matched: bool,
    #[serde(rename = "matchedJournalId")]
    matched_journal_id: Option<String>,
    #[serde(rename = "confidenceScore")]
    confidence_score: f64,
    #[serde(rename = "suggestedLines")]
    suggested_lines: Option<Vec<JournalLine>>,
    #[serde(rename = "suggestedDescription")]
    suggested_description: Option<String>,
}

// ==========================================
// HELPERS
// ==========================================

fn detect_anomaly_rules(entry: &JournalEntry) -> bool {
    let total_amount: f64 = entry.lines.iter().map(|l| l.debit).sum();
    let desc_lower = entry.description.to_lowercase();
    
    // Anomali 1: Nilai transaksi sangat besar untuk skala UMKM (misal > 50 juta rupiah)
    if total_amount > 50_000_000.0 {
        return true;
    }

    // Anomali 2: Transaksi diskon atau biaya dengan kata kunci mencurigakan
    if desc_lower.contains("diskon") && (desc_lower.contains("cashback") || total_amount > 5_000_000.0) {
        return true;
    }

    // Anomali 3: Pengeluaran biaya di luar kas utama/bank yang tidak terpetakan dengan baik
    false
}

// ==========================================
// TAURI COMMANDS (DATABASE CRUD & LOGIC)
// ==========================================

#[tauri::command]
fn get_accounts_rust(state: tauri::State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT code, name, type, normal_balance FROM accounts").map_err(|e| e.to_string())?;
    
    let accounts_iter = stmt.query_map([], |row| {
        Ok(Account {
            code: row.get(0)?,
            name: row.get(1)?,
            acc_type: row.get(2)?,
            normal_balance: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut accounts = Vec::new();
    for acc in accounts_iter {
        accounts.push(acc.map_err(|e| e.to_string())?);
    }
    
    serde_json::to_string(&accounts).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_journals_rust(state: tauri::State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt_j = conn.prepare("SELECT id, date, description, reference, is_anomaly FROM journals ORDER BY date DESC, id DESC").map_err(|e| e.to_string())?;
    
    let journals_iter = stmt_j.query_map([], |row| {
        let id: String = row.get(0)?;
        let date: String = row.get(1)?;
        let description: String = row.get(2)?;
        let reference: Option<String> = row.get(3)?;
        let is_anomaly_int: i32 = row.get(4)?;
        
        Ok((id, date, description, reference, is_anomaly_int == 1))
    }).map_err(|e| e.to_string())?;
    
    let mut entries = Vec::new();
    
    for item in journals_iter {
        let (id, date, description, reference, is_anomaly) = item.map_err(|e| e.to_string())?;
        
        // Ambil lines untuk jurnal ini
        let mut stmt_l = conn.prepare("SELECT account_code, debit, credit FROM journal_lines WHERE journal_id = ?1").map_err(|e| e.to_string())?;
        let lines_iter = stmt_l.query_map([&id], |row| {
            Ok(JournalLine {
                account_code: row.get(0)?,
                debit: row.get(1)?,
                credit: row.get(2)?,
            })
        }).map_err(|e| e.to_string())?;
        
        let mut lines = Vec::new();
        for l in lines_iter {
            lines.push(l.map_err(|e| e.to_string())?);
        }
        
        entries.push(JournalEntryWithAnomaly {
            id,
            date,
            description,
            reference,
            lines,
            is_anomaly,
        });
    }
    
    serde_json::to_string(&entries).map_err(|e| e.to_string())
}

#[tauri::command]
fn post_journal_entry_rust(
    app_handle: tauri::AppHandle,
    state: tauri::State<DbState>,
    entry_json: String,
) -> Result<String, String> {
    let entry: JournalEntry = serde_json::from_str(&entry_json)
        .map_err(|e| format!("Gagal parsing entri jurnal: {}", e))?;
        
    // Validasi balanced
    let total_debit: f64 = entry.lines.iter().map(|l| l.debit).sum();
    let total_credit: f64 = entry.lines.iter().map(|l| l.credit).sum();
    if (total_debit - total_credit).abs() > 0.01 {
        return Err("Jurnal tidak seimbang! Total Debit harus sama dengan total Kredit.".to_string());
    }
    
    let is_anomaly = detect_anomaly_rules(&entry);
    
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    tx.execute(
        "INSERT OR REPLACE INTO journals (id, date, description, reference, is_anomaly) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![entry.id, entry.date, entry.description, entry.reference, if is_anomaly { 1 } else { 0 }],
    ).map_err(|e| format!("Gagal insert jurnal: {}", e))?;
    
    tx.execute("DELETE FROM journal_lines WHERE journal_id = ?1", [&entry.id]).map_err(|e| e.to_string())?;
    
    for line in &entry.lines {
        tx.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![entry.id, line.account_code, line.debit, line.credit],
        ).map_err(|e| format!("Gagal insert baris jurnal: {}", e))?;
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    
    // Emit event ke frontend agar reaktif
    let _ = app_handle.emit("db-update", "journals");
    
    Ok(entry.id)
}

#[tauri::command]
fn is_journal_balanced_rust(entry_json: String) -> Result<bool, String> {
    let entry: JournalEntry = serde_json::from_str(&entry_json)
        .map_err(|e| format!("Gagal parsing entri jurnal: {}", e))?;
    
    let total_debit: f64 = entry.lines.iter().map(|l| l.debit).sum();
    let total_credit: f64 = entry.lines.iter().map(|l| l.credit).sum();
    
    Ok((total_debit - total_credit).abs() < 0.01)
}

#[tauri::command]
fn generate_general_ledger_rust(
    state: tauri::State<DbState>,
    account_code: String,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    
    // Ambil detail akun
    let account: Account = conn.query_row(
        "SELECT code, name, type, normal_balance FROM accounts WHERE code = ?1",
        [&account_code],
        |row| Ok(Account {
            code: row.get(0)?,
            name: row.get(1)?,
            acc_type: row.get(2)?,
            normal_balance: row.get(3)?,
        })
    ).map_err(|_| format!("Akun dengan kode {} tidak ditemukan.", account_code))?;
    
    // Ambil baris jurnal untuk akun ini, urutkan berdasarkan tanggal jurnal
    let mut stmt = conn.prepare(
        r#"SELECT j.id, j.date, j.description, jl.debit, jl.credit 
           FROM journal_lines jl
           JOIN journals j ON jl.journal_id = j.id
           WHERE jl.account_code = ?1
           ORDER BY j.date ASC, j.id ASC"#
    ).map_err(|e| e.to_string())?;
    
    let entries_iter = stmt.query_map([&account_code], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, f64>(3)?,
            row.get::<_, f64>(4)?,
        ))
    }).map_err(|e| e.to_string())?;
    
    let mut running_balance = 0.0;
    let mut entries = Vec::new();
    
    for item in entries_iter {
        let (id, date, description, debit, credit) = item.map_err(|e| e.to_string())?;
        
        if account.normal_balance == "D" {
            running_balance += debit - credit;
        } else {
            running_balance += credit - debit;
        }
        
        entries.push(LedgerEntry {
            id,
            date,
            description,
            debit,
            credit,
            balance: running_balance,
        });
    }
    
    let result = GeneralLedgerResult {
        account,
        entries,
        final_balance: running_balance,
    };
    
    serde_json::to_string(&result).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_account_balances_rust(state: tauri::State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    
    // Ambil semua akun
    let mut stmt_acc = conn.prepare("SELECT code, normal_balance FROM accounts").map_err(|e| e.to_string())?;
    let accounts_iter = stmt_acc.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;
    
    use std::collections::HashMap;
    let mut balances = HashMap::new();
    
    for acc in accounts_iter {
        let (code, normal_balance) = acc.map_err(|e| e.to_string())?;
        
        // Hitung total debit & kredit di SQLite
        let (total_debit, total_credit): (f64, f64) = conn.query_row(
            "SELECT COALESCE(SUM(debit), 0.0), COALESCE(SUM(credit), 0.0) FROM journal_lines WHERE account_code = ?1",
            [&code],
            |row| Ok((row.get(0)?, row.get(1)?))
        ).unwrap_or((0.0, 0.0));
        
        let bal = if normal_balance == "D" {
            total_debit - total_credit
        } else {
            total_credit - total_debit
        };
        
        balances.insert(code, bal);
    }
    
    serde_json::to_string(&balances).map_err(|e| e.to_string())
}

#[tauri::command]
fn generate_profit_loss_rust(
    state: tauri::State<DbState>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    
    // Ambil akun PENDAPATAN & BEBAN
    let mut stmt = conn.prepare(
        "SELECT code, name, type, normal_balance FROM accounts WHERE type IN ('PENDAPATAN', 'BEBAN')"
    ).map_err(|e| e.to_string())?;
    
    let accounts_iter = stmt.query_map([], |row| {
        Ok(Account {
            code: row.get(0)?,
            name: row.get(1)?,
            acc_type: row.get(2)?,
            normal_balance: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut revenue = Vec::new();
    let mut expenses = Vec::new();
    let mut total_revenue = 0.0;
    let mut total_expenses = 0.0;
    
    let start = start_date.unwrap_or_else(|| "1970-01-01".to_string());
    let end = end_date.unwrap_or_else(|| "9999-12-31".to_string());
    
    for acc in accounts_iter {
        let account = acc.map_err(|e| e.to_string())?;
        
        // Sum debit & credit di range tanggal
        let (total_debit, total_credit): (f64, f64) = conn.query_row(
            r#"SELECT COALESCE(SUM(jl.debit), 0.0), COALESCE(SUM(jl.credit), 0.0) 
               FROM journal_lines jl
               JOIN journals j ON jl.journal_id = j.id
               WHERE jl.account_code = ?1 AND j.date >= ?2 AND j.date <= ?3"#,
            rusqlite::params![account.code, start, end],
            |row| Ok((row.get(0)?, row.get(1)?))
        ).unwrap_or((0.0, 0.0));
        
        let amount = if account.normal_balance == "D" {
            total_debit - total_credit
        } else {
            total_credit - total_debit
        };
        
        let item = RevenueExpenseItem {
            code: account.code.clone(),
            name: account.name.clone(),
            amount,
        };
        
        if account.acc_type == "PENDAPATAN" {
            total_revenue += amount;
            revenue.push(item);
        } else {
            total_expenses += amount;
            expenses.push(item);
        }
    }
    
    let report = ProfitLossReportRust {
        revenue,
        expenses,
        total_revenue,
        total_expenses,
        net_profit: total_revenue - total_expenses,
    };
    
    serde_json::to_string(&report).map_err(|e| e.to_string())
}

#[tauri::command]
fn generate_balance_sheet_rust(
    state: tauri::State<DbState>,
    net_profit: f64,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    
    let mut stmt = conn.prepare(
        "SELECT code, name, type, normal_balance FROM accounts WHERE type IN ('ASET', 'KEWAJIBAN', 'EKUITAS')"
    ).map_err(|e| e.to_string())?;
    
    let accounts_iter = stmt.query_map([], |row| {
        Ok(Account {
            code: row.get(0)?,
            name: row.get(1)?,
            acc_type: row.get(2)?,
            normal_balance: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut assets = Vec::new();
    let mut liabilities = Vec::new();
    let mut equity = Vec::new();
    let mut total_assets = 0.0;
    let mut total_liabilities = 0.0;
    let mut total_equity = 0.0;
    
    for acc in accounts_iter {
        let account = acc.map_err(|e| e.to_string())?;
        
        // Sum debit & credit
        let (total_debit, total_credit): (f64, f64) = conn.query_row(
            "SELECT COALESCE(SUM(debit), 0.0), COALESCE(SUM(credit), 0.0) FROM journal_lines WHERE account_code = ?1",
            [&account.code],
            |row| Ok((row.get(0)?, row.get(1)?))
        ).unwrap_or((0.0, 0.0));
        
        let mut balance = if account.normal_balance == "D" {
            total_debit - total_credit
        } else {
            total_credit - total_debit
        };
        
        if account.acc_type == "ASET" {
            assets.push(RevenueExpenseItem {
                code: account.code.clone(),
                name: account.name.clone(),
                amount: balance,
            });
            total_assets += balance;
        } else if account.acc_type == "KEWAJIBAN" {
            liabilities.push(RevenueExpenseItem {
                code: account.code.clone(),
                name: account.name.clone(),
                amount: balance,
            });
            total_liabilities += balance;
        } else if account.acc_type == "EKUITAS" {
            // Laba bersih masuk ke Laba Ditahan (3102)
            if account.code == "3102" {
                balance += net_profit;
            }
            equity.push(RevenueExpenseItem {
                code: account.code.clone(),
                name: account.name.clone(),
                amount: balance,
            });
            total_equity += balance;
        }
    }
    
    let report = BalanceSheetReportRust {
        assets,
        liabilities,
        equity,
        total_assets,
        total_liabilities,
        total_equity,
    };
    
    serde_json::to_string(&report).map_err(|e| e.to_string())
}

// ==========================================
// INVENTORY BUSINESS LOGIC (SQLite transactions)
// ==========================================

#[tauri::command]
fn get_products_rust(state: tauri::State<DbState>) -> Result<String, String> {
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
fn add_product_rust(
    app_handle: tauri::AppHandle,
    state: tauri::State<DbState>,
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
fn get_inventory_logs_rust(state: tauri::State<DbState>) -> Result<String, String> {
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
fn purchase_product_rust(
    app_handle: tauri::AppHandle,
    state: tauri::State<DbState>,
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
fn sell_product_rust(
    app_handle: tauri::AppHandle,
    state: tauri::State<DbState>,
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
fn adjust_product_stock_rust(
    app_handle: tauri::AppHandle,
    state: tauri::State<DbState>,
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

// ==========================================
// FIXED ASSETS BUSINESS LOGIC (with checks)
// ==========================================

#[tauri::command]
fn get_fixed_assets_rust(state: tauri::State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, name, purchase_date, cost, useful_life_years, salvage_value, accumulated_depreciation, is_fully_depreciated FROM fixed_assets").map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([], |row| {
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
    }).map_err(|e| e.to_string())?;
    
    let mut assets = Vec::new();
    for a in iter {
        assets.push(a.map_err(|e| e.to_string())?);
    }
    
    serde_json::to_string(&assets).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_fixed_asset_rust(
    app_handle: tauri::AppHandle,
    state: tauri::State<DbState>,
    asset_json: String,
) -> Result<String, String> {
    let asset: FixedAsset = serde_json::from_str(&asset_json)
        .map_err(|e| format!("Gagal parsing aset: {}", e))?;
        
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO fixed_assets (id, name, purchase_date, cost, useful_life_years, salvage_value, accumulated_depreciation, is_fully_depreciated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0.0, 0)",
        rusqlite::params![asset.id, asset.name, asset.purchase_date, asset.cost, asset.useful_life_years, asset.salvage_value],
    ).map_err(|e| e.to_string())?;
    
    let _ = app_handle.emit("db-update", "assets");
    
    Ok(asset.id)
}

#[tauri::command]
fn calculate_monthly_depreciation_rust(asset_json: String) -> Result<f64, String> {
    let asset: FixedAsset = serde_json::from_str(&asset_json)
        .map_err(|e| format!("Gagal parsing aset: {}", e))?;
        
    if asset.useful_life_years <= 0.0 {
        return Ok(0.0);
    }
    
    let depreciable_amount = asset.cost - asset.salvage_value;
    let total_months = asset.useful_life_years * 12.0;
    let monthly_depr = (depreciable_amount / total_months).round();
    
    Ok(monthly_depr)
}

#[tauri::command]
fn calculate_depreciation_rust(
    app_handle: tauri::AppHandle,
    state: tauri::State<DbState>,
) -> Result<String, String> {
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Ambil semua aset ke dalam Vec lokal agar drop pinjaman tx lebih awal
    let assets: Vec<FixedAsset> = {
        let mut stmt = tx.prepare(
            "SELECT id, name, purchase_date, cost, useful_life_years, salvage_value, accumulated_depreciation, is_fully_depreciated FROM fixed_assets"
        ).map_err(|e| e.to_string())?;
        
        let iter = stmt.query_map([], |row| {
            let is_fully: i32 = row.get(7)?;
            Ok(FixedAsset {
                id: row.get(0)?,
                name: row.get(1)?,
                purchase_date: row.get(2)?,
                cost: row.get(3)?,
                useful_life_years: row.get(4)?,
                salvage_value: row.get(5)?,
                accumulated_depreciation: row.get(6)?,
                is_fully_depreciated: Some(is_fully == 1),
            })
        }).map_err(|e| e.to_string())?;
        
        let mut list = Vec::new();
        for item in iter {
            list.push(item.map_err(|e| e.to_string())?);
        }
        list
    };
    
    let mut updated_assets = Vec::new();
    let mut posted_journals = Vec::new();
    let mut total_depreciated = 0.0;
    let today_str = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut count = 0;
    
    for mut asset in assets {
        
        // Cek umur manfaat > 0
        if asset.useful_life_years <= 0.0 {
            updated_assets.push(asset);
            continue; // Abaikan atau lompati aset yang rusak parameternya
        }
        
        let depreciable_limit = asset.cost - asset.salvage_value;
        if asset.accumulated_depreciation >= depreciable_limit || asset.is_fully_depreciated.unwrap_or(false) {
            updated_assets.push(asset);
            continue;
        }
        
        let total_months = asset.useful_life_years * 12.0;
        let monthly_depr = (depreciable_limit / total_months).round();
        let mut final_depr = monthly_depr;
        
        if asset.accumulated_depreciation + final_depr >= depreciable_limit {
            final_depr = depreciable_limit - asset.accumulated_depreciation;
            asset.is_fully_depreciated = Some(true);
        }
        
        asset.accumulated_depreciation += final_depr;
        total_depreciated += final_depr;
        
        // Update database fixed asset
        tx.execute(
            "UPDATE fixed_assets SET accumulated_depreciation = ?1, is_fully_depreciated = ?2 WHERE id = ?3",
            rusqlite::params![asset.accumulated_depreciation, if asset.is_fully_depreciated.unwrap_or(false) { 1 } else { 0 }, asset.id],
        ).map_err(|e| e.to_string())?;
        
        // Post jurnal penyesuaian ke jurnal table
        // Debit: 5205 (Beban Penyusutan), Kredit: 1202 (Akumulasi Penyusutan)
        let jrn_id = format!("JRN-DEPR-{}-{}-{}", asset.id, today_str, count);
        tx.execute(
            "INSERT INTO journals (id, date, description, reference, is_anomaly) VALUES (?1, ?2, ?3, ?4, 0)",
            rusqlite::params![
                jrn_id, 
                today_str, 
                format!("Penyesuaian Penyusutan Bulanan - {}", asset.name),
                format!("ASSET/{}", asset.id)
            ],
        ).map_err(|e| e.to_string())?;
        
        tx.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '5205', ?2, 0.0)",
            rusqlite::params![jrn_id, final_depr],
        ).map_err(|e| e.to_string())?;
        
        tx.execute(
            "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, '1202', 0.0, ?2)",
            rusqlite::params![jrn_id, final_depr],
        ).map_err(|e| e.to_string())?;
        
        posted_journals.push(JournalEntryStub {
            asset_id: asset.id.clone(),
            asset_name: asset.name.clone(),
            amount: final_depr,
        });
        
        updated_assets.push(asset);
        count += 1;
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    
    let _ = app_handle.emit("db-update", "assets");
    
    let result = DepreciationResult {
        updated_assets,
        total_depreciated,
        posted_journals,
    };
    
    serde_json::to_string(&result).map_err(|e| e.to_string())
}

// ==========================================
// TAX BUSINESS LOGIC (complete with PPh 23)
// ==========================================

#[tauri::command]
fn process_tax_rust(state: tauri::State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    
    // Ambil seluruh line jurnal
    let mut stmt = conn.prepare(
        r#"SELECT j.date, j.id, j.description, jl.account_code, jl.debit, jl.credit 
           FROM journal_lines jl
           JOIN journals j ON jl.journal_id = j.id"#
    ).map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, f64>(4)?,
            row.get::<_, f64>(5)?,
        ))
    }).map_err(|e| e.to_string())?;
    
    let mut ppn_masukan = 0.0;
    let mut ppn_keluaran = 0.0;
    let mut pph21 = 0.0;
    let mut pph23 = 0.0; // PPh 23 sekarang akan dihitung secara dinamis!
    let mut transactions = Vec::new();
    
    for item in iter {
        let (date, id, description, account_code, debit, credit) = item.map_err(|e| e.to_string())?;
        
        if account_code == "1106" {
            // PPN Masukan (Debit)
            ppn_masukan += debit;
            transactions.push(TaxTransaction {
                date: date.clone(),
                ref_id: id.clone(),
                description: description.clone(),
                dpp: (debit / 0.11).round(),
                tax_amount: debit,
                tax_type: "PPN_MASUKAN".to_string(),
            });
        } else if account_code == "2103" {
            // PPN Keluaran (Kredit)
            ppn_keluaran += credit;
            transactions.push(TaxTransaction {
                date: date.clone(),
                ref_id: id.clone(),
                description: description.clone(),
                dpp: (credit / 0.11).round(),
                tax_amount: credit,
                tax_type: "PPN_KELUARAN".to_string(),
            });
        } else if account_code == "2102" {
            // PPh 21 (Kredit)
            pph21 += credit;
            transactions.push(TaxTransaction {
                date: date.clone(),
                ref_id: id.clone(),
                description: description.clone(),
                dpp: (credit / 0.05).round(), // Asumsi tarif dasar 5%
                tax_amount: credit,
                tax_type: "PPH_21".to_string(),
            });
        } else if account_code == "2104" {
            // PPh 23 (Kredit) - Memperbaiki bug PPh 23
            pph23 += credit;
            transactions.push(TaxTransaction {
                date: date.clone(),
                ref_id: id.clone(),
                description: description.clone(),
                dpp: (credit / 0.02).round(), // Tarif PPh 23 untuk jasa adalah 2%
                tax_amount: credit,
                tax_type: "PPH_23".to_string(),
            });
        }
    }
    
    let summary = TaxSummary {
        ppn_masukan,
        ppn_keluaran,
        pph21,
        pph23,
        transactions,
    };
    
    serde_json::to_string(&summary).map_err(|e| e.to_string())
}

#[tauri::command]
fn generate_efaktur_csv_rust(transactions_json: String, tax_type: String) -> Result<String, String> {
    let transactions: Vec<TaxTransaction> = serde_json::from_str(&transactions_json)
        .map_err(|e| format!("Gagal parsing data: {}", e))?;
        
    let filtered: Vec<&TaxTransaction> = transactions.iter().filter(|t| t.tax_type == tax_type).collect();
    
    // Header standard e-Faktur
    let mut csv = "FK,KD_AP,FG_PENGGANTI,NOMOR_FAKTUR,MASA_PAJAK,TAHUN_PAJAK,TANGGAL_FAKTUR,NPWP,NAMA,ALAMAT,JUMLAH_DPP,JUMLAH_PPN,JUMLAH_PPNBM,STATUS_APPROVAL,MEMO\n".to_string();
    
    for (idx, t) in filtered.iter().enumerate() {
        let no_faktur = format!("010.002-26.{:08}", idx + 1);
        let npwp = if tax_type == "PPN_MASUKAN" { "01.234.567.8-012.000" } else { "99.999.999.9-999.000" };
        let nama = if tax_type == "PPN_MASUKAN" { "Supplier Kopi Utama" } else { "Pelanggan Umum" };
        
        // Memformat tanggal YYYY-MM-DD ke DD/MM/YYYY agar valid di e-Faktur DJP
        let formatted_date = format_date_djp(&t.date);
        
        csv.push_str(&format!(
            "FK,01,0,{},06,2026,{},{},{},Jakarta,{},{},0,APPROVED,{}\n",
            no_faktur, formatted_date, npwp, nama, t.dpp, t.tax_amount, t.description
        ));
    }
    
    Ok(csv)
}

#[tauri::command]
fn generate_ebupot_csv_rust(transactions_json: String, tax_type: String) -> Result<String, String> {
    let transactions: Vec<TaxTransaction> = serde_json::from_str(&transactions_json)
        .map_err(|e| format!("Gagal parsing data: {}", e))?;
        
    let filtered: Vec<&TaxTransaction> = transactions.iter().filter(|t| t.tax_type == tax_type).collect();
    
    let mut csv = "NO_BUKTI_POTONG,TANGGAL_BUKUPOT,IDENTITAS_PENERIMA_PENGHASILAN,NAMA_PENERIMA,KODE_OBJEK_PAJAK,PENGHASILAN_BRUTO,TARIF,PPH_DIPOTONG\n".to_string();
    
    for (idx, t) in filtered.iter().enumerate() {
        let no_bupot = if tax_type == "PPH_21" {
            format!("21-26-{:07}", idx + 1)
        } else {
            format!("23-26-{:07}", idx + 1)
        };
        
        let kode_objek = if tax_type == "PPH_21" { "21-100-01" } else { "24-104-01" };
        let tarif_text = if tax_type == "PPH_21" { "0.05" } else { "0.02" }; // Format tarif berupa numerik desimal
        
        let formatted_date = format_date_djp(&t.date);
        
        csv.push_str(&format!(
            "{},{},1234567890123456,Penerima Jasa/Pegawai,{},{},{},{}\n",
            no_bupot, formatted_date, kode_objek, t.dpp, tarif_text, t.tax_amount
        ));
    }
    
    Ok(csv)
}

fn format_date_djp(date_str: &str) -> String {
    // Input: YYYY-MM-DD -> Output: DD/MM/YYYY
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() == 3 {
        format!("{}/{}/{}", parts[2], parts[1], parts[0])
    } else {
        date_str.to_string()
    }
}

// ==========================================
// RECONCILIATION & UTILS
// ==========================================

#[tauri::command]
fn get_bank_statements_rust(state: tauri::State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, date, description, amount, matched_journal_id, confidence_score FROM bank_statements").map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([], |row| {
        Ok(BankStatementItem {
            id: row.get(0)?,
            date: row.get(1)?,
            description: row.get(2)?,
            amount: row.get(3)?,
            matched_journal_id: row.get(4)?,
            confidence_score: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut items = Vec::new();
    for i in iter {
        items.push(i.map_err(|e| e.to_string())?);
    }
    
    serde_json::to_string(&items).map_err(|e| e.to_string())
}

#[tauri::command]
fn reconcile_bank_statement_rust(
    app_handle: tauri::AppHandle,
    state: tauri::State<DbState>,
    statement_id: String,
    date: String,
    description: String,
    amount: f64,
) -> Result<String, String> {
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Cari jurnal yang cocok di database
    let target_val = amount.abs();
    
    let mut matched_jrn_id: Option<String> = None;
    let mut matched_description: Option<String> = None;
    let mut matched_date: Option<String> = None;
    
    {
        let mut stmt = tx.prepare(
            r#"SELECT j.id, j.date, j.description, SUM(jl.debit) 
               FROM journals j
               JOIN journal_lines jl ON j.id = jl.journal_id
               GROUP BY j.id"#
        ).map_err(|e| e.to_string())?;
        
        let iter = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, f64>(3)?,
            ))
        }).map_err(|e| e.to_string())?;
        
        for item in iter {
            let (id, j_date, j_desc, total_debit) = item.map_err(|e| e.to_string())?;
            if (total_debit - target_val).abs() < 1.0 {
                matched_jrn_id = Some(id);
                matched_description = Some(j_desc);
                matched_date = Some(j_date);
                break;
            }
        }
    }
    
    if let Some(jrn_id) = matched_jrn_id {
        let mut score = 80.0;
        if matched_date.unwrap_or_default() == date {
            score += 10.0;
        }
        
        let j_desc_lower = matched_description.unwrap_or_default().to_lowercase();
        let s_desc_lower = description.to_lowercase();
        
        let mut matches = false;
        for word in s_desc_lower.split_whitespace() {
            if word.len() > 3 && j_desc_lower.contains(word) {
                matches = true;
                break;
            }
        }
        if matches {
            score += 5.0;
        }
        
        // Update bank statements di database
        tx.execute(
            "UPDATE bank_statements SET matched_journal_id = ?1, confidence_score = ?2 WHERE id = ?3",
            rusqlite::params![jrn_id, score, statement_id],
        ).map_err(|e| e.to_string())?;
        
        tx.commit().map_err(|e| e.to_string())?;
        
        let _ = app_handle.emit("db-update", "bank_statements");
        
        let result = ReconciliationResult {
            matched: true,
            matched_journal_id: Some(jrn_id),
            confidence_score: score,
            suggested_lines: None,
            suggested_description: None,
        };
        
        serde_json::to_string(&result).map_err(|e| e.to_string())
    } else {
        // Buat jurnal penyesuaian otomatis
        let suggested_desc = format!("Rekonsiliasi Bank: {}", description);
        
        let lines = if amount > 0.0 {
            vec![
                JournalLine { account_code: "1101".to_string(), debit: amount, credit: 0.0 }, // Kas Utama
                JournalLine { account_code: "4101".to_string(), debit: 0.0, credit: amount }, // Pendapatan
            ]
        } else {
            let mut cost_acc = "5206".to_string(); // Beban Operasional Lainnya
            let s_desc_lower = description.to_lowercase();
            if s_desc_lower.contains("listrik") || s_desc_lower.contains("pln") || s_desc_lower.contains("air") {
                cost_acc = "5203".to_string();
            } else if s_desc_lower.contains("zoom") || s_desc_lower.contains("software") {
                cost_acc = "5206".to_string();
            } else if s_desc_lower.contains("gaji") {
                cost_acc = "5201".to_string();
            } else if s_desc_lower.contains("sewa") {
                cost_acc = "5202".to_string();
            } else if s_desc_lower.contains("iklan") || s_desc_lower.contains("google") || s_desc_lower.contains("fb") {
                cost_acc = "5204".to_string();
            }
            
            vec![
                JournalLine { account_code: cost_acc, debit: target_val, credit: 0.0 },
                JournalLine { account_code: "1101".to_string(), debit: 0.0, credit: target_val }, // Kas Utama
            ]
        };
        
        // Simpan jurnal penyesuaian baru ke database
        let new_jrn_id = format!("JRN-ADJ-RECON-{}", rand_id());
        tx.execute(
            "INSERT INTO journals (id, date, description, reference, is_anomaly) VALUES (?1, ?2, ?3, ?4, 0)",
            rusqlite::params![new_jrn_id, date, suggested_desc, format!("BANK/{}", statement_id)],
        ).map_err(|e| e.to_string())?;
        
        for line in &lines {
            tx.execute(
                "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![new_jrn_id, line.account_code, line.debit, line.credit],
            ).map_err(|e| e.to_string())?;
        }
        
        // Match bank statement ke jurnal baru ini
        tx.execute(
            "UPDATE bank_statements SET matched_journal_id = ?1, confidence_score = ?2 WHERE id = ?3",
            rusqlite::params![new_jrn_id, 85.0, statement_id],
        ).map_err(|e| e.to_string())?;
        
        tx.commit().map_err(|e| e.to_string())?;
        
        let _ = app_handle.emit("db-update", "bank_statements");
        
        let result = ReconciliationResult {
            matched: false,
            matched_journal_id: None,
            confidence_score: 85.0,
            suggested_lines: Some(lines),
            suggested_description: Some(suggested_desc),
        };
        
        serde_json::to_string(&result).map_err(|e| e.to_string())
    }
}

// ==========================================
// CHAT HISTORY STORAGE
// ==========================================

#[tauri::command]
fn get_chat_messages_rust(state: tauri::State<DbState>) -> Result<String, String> {
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
fn add_chat_message_rust(
    app_handle: tauri::AppHandle,
    state: tauri::State<DbState>,
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
fn update_chat_message_rust(
    app_handle: tauri::AppHandle,
    state: tauri::State<DbState>,
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
fn clear_chat_messages_rust(app_handle: tauri::AppHandle, state: tauri::State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM chat_messages", []).map_err(|e| e.to_string())?;
    
    let _ = app_handle.emit("db-update", "chat_messages");
    Ok(())
}

// ==========================================
// REST OF ORIGINAL IMPLEMENTATIONS
// ==========================================

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn save_export_file(app: tauri::AppHandle, filename: String, content: String) -> Result<String, String> {
    let doc_path = app.path().document_dir()
        .map_err(|e| format!("Gagal mendapatkan folder Documents: {}", e))?;
    
    let file_path = doc_path.join(&filename);
    
    fs::write(&file_path, content)
        .map_err(|e| format!("Gagal menulis berkas ke disk: {}", e))?;
        
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn extract_ocr_details_rust(filename: String) -> Result<String, String> {
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
fn analyze_report_health_rust(report_type: String, report_data_json: String) -> Result<String, String> {
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

        let health = if report.total_assets > report.total_liabilities * 2.0 {
            "SEHAT".to_string()
        } else {
            "WASPADA".to_string()
        };

        let advice = if health == "SEHAT" {
            "Kondisi neraca sangat baik, kepemilikan aset jauh lebih besar dari utang."
        } else {
            "Peringatan: Porsi utang Anda cukup tinggi dibanding aset yang dimiliki. Jaga likuiditas kas Anda agar pembayaran utang lancar."
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

// Helper untuk generate ID acak string
fn rand_id() -> String {
    use rand::Rng;
    let s: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(7)
        .map(char::from)
        .collect();
    s.to_lowercase()
}

// ==========================================
// BACKUP & RESTORE NATIVE
// ==========================================

#[tauri::command]
fn export_backup_json_rust(state: tauri::State<DbState>) -> Result<String, String> {
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

    // 2. Ambil journals
    let mut stmt = conn.prepare("SELECT id, date, description, reference, is_anomaly FROM journals").unwrap();
    let journals: Vec<JournalEntryWithAnomaly> = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let date: String = row.get(1)?;
        let description: String = row.get(2)?;
        let reference: Option<String> = row.get(3)?;
        let is_anomaly_int: i32 = row.get(4)?;
        
        let mut stmt_lines = conn.prepare_cached("SELECT account_code, debit, credit FROM journal_lines WHERE journal_id = ?1").unwrap();
        let lines: Vec<JournalLine> = stmt_lines.query_map([&id], |row| {
            Ok(JournalLine {
                account_code: row.get(0)?,
                debit: row.get(1)?,
                credit: row.get(2)?,
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
    let mut stmt = conn.prepare("SELECT id, product_id, date, type, qty, cost, reference FROM inventory_logs").unwrap();
    let inventory_logs: Vec<InventoryLog> = stmt.query_map([], |row| {
        Ok(InventoryLog {
            id: row.get(0)?,
            product_id: row.get(1)?,
            date: row.get(2)?,
            log_type: row.get(3)?,
            qty: row.get(4)?,
            cost: row.get(5)?,
            reference: row.get(6)?,
        })
    }).unwrap().map(|r| r.unwrap()).collect();

    // 7. Ambil fixed assets
    let mut stmt = conn.prepare("SELECT id, name, purchase_date, cost, useful_life_years, salvage_value, accumulated_depreciation, is_fully_depreciated FROM fixed_assets").unwrap();
    let fixed_assets: Vec<FixedAsset> = stmt.query_map([], |row| {
        let fully: i32 = row.get(7)?;
        Ok(FixedAsset {
            id: row.get(0)?,
            name: row.get(1)?,
            purchase_date: row.get(2)?,
            cost: row.get(3)?,
            useful_life_years: row.get(4)?,
            salvage_value: row.get(5)?,
            accumulated_depreciation: row.get(6)?,
            is_fully_depreciated: Some(fully == 1),
        })
    }).unwrap().map(|r| r.unwrap()).collect();

    let backup_data = serde_json::json!({
        "accounts": accounts,
        "journals": journals,
        "contacts": contacts,
        "bankStatements": bank_statements,
        "products": products,
        "inventoryLogs": inventory_logs,
        "fixedAssets": fixed_assets
    });
    
    Ok(backup_data.to_string())
}

#[tauri::command]
fn import_backup_json_rust(
    app_handle: tauri::AppHandle,
    state: tauri::State<DbState>,
    json_string: String,
) -> Result<(), String> {
    let data: serde_json::Value = serde_json::from_str(&json_string)
        .map_err(|e| format!("Format berkas backup tidak valid: {}", e))?;
        
    let mut conn = state.0.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Clear all tables
    tx.execute("DELETE FROM journal_lines", []).unwrap();
    tx.execute("DELETE FROM journals", []).unwrap();
    tx.execute("DELETE FROM accounts", []).unwrap();
    tx.execute("DELETE FROM contacts", []).unwrap();
    tx.execute("DELETE FROM bank_statements", []).unwrap();
    tx.execute("DELETE FROM inventory_logs", []).unwrap();
    tx.execute("DELETE FROM products", []).unwrap();
    tx.execute("DELETE FROM fixed_assets", []).unwrap();
    
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
            tx.execute(
                "INSERT INTO bank_statements (id, date, description, amount, matched_journal_id, confidence_score) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    val["id"].as_str().unwrap(),
                    val["date"].as_str().unwrap(),
                    val["description"].as_str().unwrap(),
                    val["amount"].as_f64().unwrap(),
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
                "INSERT INTO inventory_logs (id, product_id, date, type, qty, cost, reference) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    val["id"].as_str().unwrap(),
                    val["productId"].as_str().unwrap(),
                    val["date"].as_str().unwrap(),
                    val["type"].as_str().unwrap(),
                    val["qty"].as_f64().unwrap(),
                    val["cost"].as_f64().unwrap(),
                    val["reference"].as_str()
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
    
    tx.commit().map_err(|e| e.to_string())?;
    
    // Emit ke all listeners
    let _ = app_handle.emit("db-update", "all");
    
    Ok(())
}

#[tauri::command]
fn generate_trial_balance_rust(state: tauri::State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    
    let mut stmt = conn.prepare(
        "SELECT code, name, type, normal_balance FROM accounts ORDER BY code ASC"
    ).map_err(|e| e.to_string())?;
    
    let accounts_iter = stmt.query_map([], |row| {
        Ok(Account {
            code: row.get(0)?,
            name: row.get(1)?,
            acc_type: row.get(2)?,
            normal_balance: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut items = Vec::new();
    let mut total_debit = 0.0;
    let mut total_credit = 0.0;
    
    for acc in accounts_iter {
        let account = acc.map_err(|e| e.to_string())?;
        
        let (total_debit_acc, total_credit_acc): (f64, f64) = conn.query_row(
            "SELECT COALESCE(SUM(debit), 0.0), COALESCE(SUM(credit), 0.0) FROM journal_lines WHERE account_code = ?1",
            [&account.code],
            |row| Ok((row.get(0)?, row.get(1)?))
        ).unwrap_or((0.0, 0.0));
        
        let mut item_debit = 0.0;
        let mut item_credit = 0.0;
        
        if account.normal_balance == "D" {
            let bal = total_debit_acc - total_credit_acc;
            if bal >= 0.0 {
                item_debit = bal;
            } else {
                item_credit = -bal;
            }
        } else {
            let bal = total_credit_acc - total_debit_acc;
            if bal >= 0.0 {
                item_credit = bal;
            } else {
                item_debit = -bal;
            }
        }
        
        total_debit += item_debit;
        total_credit += item_credit;
        
        items.push(TrialBalanceItem {
            code: account.code,
            name: account.name,
            acc_type: account.acc_type,
            debit: item_debit,
            credit: item_credit,
        });
    }
    
    let report = TrialBalanceReport {
        items,
        total_debit,
        total_credit,
    };
    
    serde_json::to_string(&report).map_err(|e| e.to_string())
}

#[tauri::command]
fn generate_cash_flow_rust(state: tauri::State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    
    let (end_debit, end_credit): (f64, f64) = conn.query_row(
        "SELECT COALESCE(SUM(debit), 0.0), COALESCE(SUM(credit), 0.0) FROM journal_lines WHERE account_code IN ('1101', '1102', '1103')",
        [],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((0.0, 0.0));
    let end_balance = end_debit - end_credit;
    
    let mut stmt = conn.prepare(
        r#"SELECT jl.journal_id, jl.account_code, jl.debit, jl.credit, j.description 
           FROM journal_lines jl
           JOIN journals j ON jl.journal_id = j.id
           WHERE jl.account_code IN ('1101', '1102', '1103')
           ORDER BY j.date ASC"#
    ).map_err(|e| e.to_string())?;
    
    struct RawCashLine {
        journal_id: String,
        debit: f64,
        credit: f64,
        description: String,
    }
    
    let cash_lines_iter = stmt.query_map([], |row| {
        Ok(RawCashLine {
            journal_id: row.get(0)?,
            debit: row.get(2)?,
            credit: row.get(3)?,
            description: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut operating_receipts = Vec::new();
    let mut operating_payments = Vec::new();
    let mut total_operating = 0.0;
    
    let investing_receipts = Vec::new();
    let mut investing_payments = Vec::new();
    let mut total_investing = 0.0;
    
    let mut financing_receipts = Vec::new();
    let financing_payments = Vec::new();
    let mut total_financing = 0.0;
    
    for row in cash_lines_iter {
        let cash_line = row.map_err(|e| e.to_string())?;
        
        let mut stmt_offset = conn.prepare(
            "SELECT account_code FROM journal_lines WHERE journal_id = ?1 AND account_code NOT IN ('1101', '1102', '1103')"
        ).map_err(|e| e.to_string())?;
        
        struct OffsetLine {
            account_code: String,
        }
        
        let offset_iter = stmt_offset.query_map([&cash_line.journal_id], |r| {
            Ok(OffsetLine {
                account_code: r.get(0)?,
            })
        }).map_err(|e| e.to_string())?;
        
        let mut offsets = Vec::new();
        for o in offset_iter {
            offsets.push(o.map_err(|e| e.to_string())?);
        }
        
        if cash_line.debit > 0.0 {
            let amount = cash_line.debit;
            
            if let Some(offset) = offsets.first() {
                let acc_type: String = conn.query_row(
                    "SELECT type FROM accounts WHERE code = ?1",
                    [&offset.account_code],
                    |row| row.get(0)
                ).unwrap_or_else(|_| "LAIN".to_string());
                
                if acc_type == "PENDAPATAN" || offset.account_code == "1104" {
                    total_operating += amount;
                    operating_receipts.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                } else if acc_type == "EKUITAS" {
                    total_financing += amount;
                    financing_receipts.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                } else if acc_type == "KEWAJIBAN" {
                    total_financing += amount;
                    financing_receipts.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                } else {
                    total_operating += amount;
                    operating_receipts.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                }
            } else {
                total_operating += amount;
                operating_receipts.push(CashFlowItem {
                    description: cash_line.description.clone(),
                    amount,
                });
            }
        } else if cash_line.credit > 0.0 {
            let amount = cash_line.credit;
            
            if let Some(offset) = offsets.first() {
                let acc_type: String = conn.query_row(
                    "SELECT type FROM accounts WHERE code = ?1",
                    [&offset.account_code],
                    |row| row.get(0)
                ).unwrap_or_else(|_| "LAIN".to_string());
                
                if acc_type == "BEBAN" {
                    total_operating -= amount;
                    operating_payments.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                } else if offset.account_code == "1105" || offset.account_code == "2101" {
                    total_operating -= amount;
                    operating_payments.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                } else if offset.account_code.starts_with("12") {
                    total_investing -= amount;
                    investing_payments.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                } else {
                    total_operating -= amount;
                    operating_payments.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                }
            } else {
                total_operating -= amount;
                operating_payments.push(CashFlowItem {
                    description: cash_line.description.clone(),
                    amount,
                });
            }
        }
    }
    
    let net_increase = total_operating + total_investing + total_financing;
    let start_balance = end_balance - net_increase;
    
    let report = CashFlowReportRust {
        operating_receipts,
        operating_payments,
        total_operating,
        
        investing_receipts,
        investing_payments,
        total_investing,
        
        financing_receipts,
        financing_payments,
        total_financing,
        
        net_increase,
        start_balance,
        end_balance,
    };
    
    serde_json::to_string(&report).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_sales_documents_rust(state: tauri::State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let docs = accounting::get_sales_documents(&conn)?;
    serde_json::to_string(&docs).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_sales_document_rust(state: tauri::State<'_, DbState>, doc_json: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let doc: SalesDocument = serde_json::from_str(&doc_json).map_err(|e| e.to_string())?;
    accounting::create_sales_document(&conn, doc)
}

#[tauri::command]
fn get_purchase_documents_rust(state: tauri::State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let docs = accounting::get_purchase_documents(&conn)?;
    serde_json::to_string(&docs).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_purchase_document_rust(state: tauri::State<'_, DbState>, doc_json: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let doc: PurchaseDocument = serde_json::from_str(&doc_json).map_err(|e| e.to_string())?;
    accounting::create_purchase_document(&conn, doc)
}

#[tauri::command]
fn get_warehouses_rust(state: tauri::State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let list = accounting::get_warehouses(&conn)?;
    serde_json::to_string(&list).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_stock_takes_rust(state: tauri::State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let list = accounting::get_stock_takes(&conn)?;
    serde_json::to_string(&list).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_stock_take_rust(state: tauri::State<'_, DbState>, order_json: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let order: StockTakeOrder = serde_json::from_str(&order_json).map_err(|e| e.to_string())?;
    accounting::create_stock_take(&conn, order)
}

#[tauri::command]
fn dispose_fixed_asset_rust(state: tauri::State<'_, DbState>, asset_id: String, disposal_date: String, disposal_value: f64) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    accounting::dispose_fixed_asset(&conn, &asset_id, &disposal_date, disposal_value)
}

#[tauri::command]
fn adjust_fixed_asset_rust(state: tauri::State<'_, DbState>, adj_json: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let adj: FixedAssetAdjustment = serde_json::from_str(&adj_json).map_err(|e| e.to_string())?;
    accounting::adjust_fixed_asset(&conn, adj)
}

// ==========================================
// ENTRY POINT RUN & ROUTING HANDLER
// ==========================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Inisialisasi Database SQLite
            let conn = db::init_db(app.handle())
                .map_err(|e| {
                    eprintln!("DATABASE INIT ERROR: {}", e);
                    std::io::Error::new(std::io::ErrorKind::Other, e)
                })?;
            
            // Simpan koneksi dalam Tauri State
            app.manage(DbState(Mutex::new(conn)));
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            save_export_file,
            get_accounts_rust,
            get_journals_rust,
            post_journal_entry_rust,
            is_journal_balanced_rust,
            generate_general_ledger_rust,
            get_account_balances_rust,
            generate_profit_loss_rust,
            generate_balance_sheet_rust,
            generate_trial_balance_rust,
            generate_cash_flow_rust,
            get_products_rust,
            add_product_rust,
            get_inventory_logs_rust,
            purchase_product_rust,
            sell_product_rust,
            adjust_product_stock_rust,
            get_fixed_assets_rust,
            add_fixed_asset_rust,
            calculate_monthly_depreciation_rust,
            calculate_depreciation_rust,
            process_tax_rust,
            generate_efaktur_csv_rust,
            generate_ebupot_csv_rust,
            get_bank_statements_rust,
            reconcile_bank_statement_rust,
            get_chat_messages_rust,
            add_chat_message_rust,
            update_chat_message_rust,
            clear_chat_messages_rust,
            extract_ocr_details_rust,
            analyze_report_health_rust,
            export_backup_json_rust,
            import_backup_json_rust,
            get_sales_documents_rust,
            create_sales_document_rust,
            get_purchase_documents_rust,
            create_purchase_document_rust,
            get_warehouses_rust,
            get_stock_takes_rust,
            create_stock_take_rust,
            dispose_fixed_asset_rust,
            adjust_fixed_asset_rust
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
