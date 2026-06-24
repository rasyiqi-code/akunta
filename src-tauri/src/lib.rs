use tauri::Manager;
use std::fs;
use serde::{Deserialize, Serialize};

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

#[derive(Serialize, Deserialize)]
struct JournalLine {
    #[serde(rename = "accountCode")]
    account_code: String,
    debit: f64,
    credit: f64,
}

#[derive(Serialize, Deserialize)]
struct JournalEntry {
    id: String,
    date: String,
    description: String,
    reference: Option<String>,
    lines: Vec<JournalLine>,
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
    tax_type: String, // "PPN_MASUKAN" | "PPN_KELUARAN" | "PPH_21"
}

#[derive(Serialize, Deserialize)]
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

#[derive(Serialize, Deserialize)]
struct PurchaseResult {
    #[serde(rename = "updatedProduct")]
    updated_product: Product,
}

#[derive(Serialize, Deserialize)]
struct SellResult {
    #[serde(rename = "updatedProduct")]
    updated_product: Product,
    #[serde(rename = "totalHpp")]
    total_hpp: f64,
}

#[derive(Serialize, Deserialize)]
struct AdjustResult {
    #[serde(rename = "updatedProduct")]
    updated_product: Product,
    diff: f64,
    #[serde(rename = "absQty")]
    abs_qty: f64,
    #[serde(rename = "totalVal")]
    total_val: f64,
}

#[tauri::command]
fn is_journal_balanced_rust(entry_json: String) -> Result<bool, String> {
    let entry: JournalEntry = serde_json::from_str(&entry_json)
        .map_err(|e| format!("Gagal mendeserialisasi entri jurnal: {}", e))?;
    
    let total_debit: f64 = entry.lines.iter().map(|l| l.debit).sum();
    let total_credit: f64 = entry.lines.iter().map(|l| l.credit).sum();
    
    Ok((total_debit - total_credit).abs() < 0.01)
}

#[tauri::command]
fn generate_general_ledger_rust(journals_json: String, account_json: String) -> Result<String, String> {
    let journals: Vec<JournalEntry> = serde_json::from_str(&journals_json)
        .map_err(|e| format!("Gagal mendeserialisasi jurnal: {}", e))?;
    let account: Account = serde_json::from_str(&account_json)
        .map_err(|e| format!("Gagal mendeserialisasi akun: {}", e))?;

    let mut running_balance = 0.0;
    let mut entries = Vec::new();

    // Urutkan jurnal berdasarkan tanggal secara menaik
    let mut sorted_journals = journals;
    sorted_journals.sort_by(|a, b| a.date.cmp(&b.date));

    for j in sorted_journals {
        let lines: Vec<&JournalLine> = j.lines.iter().filter(|l| l.account_code == account.code).collect();
        for l in lines {
            if account.normal_balance == "D" {
                running_balance += l.debit - l.credit;
            } else {
                running_balance += l.credit - l.debit;
            }
            entries.push(LedgerEntry {
                id: j.id.clone(),
                date: j.date.clone(),
                description: j.description.clone(),
                debit: l.debit,
                credit: l.credit,
                balance: running_balance,
            });
        }
    }

    let result = GeneralLedgerResult {
        account,
        entries,
        final_balance: running_balance,
    };

    serde_json::to_string(&result)
        .map_err(|e| format!("Gagal menserialisasi buku besar: {}", e))
}

#[tauri::command]
fn get_account_balances_rust(accounts_json: String, journals_json: String) -> Result<String, String> {
    let accounts: Vec<Account> = serde_json::from_str(&accounts_json)
        .map_err(|e| format!("Gagal mendeserialisasi akun: {}", e))?;
    let journals: Vec<JournalEntry> = serde_json::from_str(&journals_json)
        .map_err(|e| format!("Gagal mendeserialisasi jurnal: {}", e))?;

    use std::collections::HashMap;
    let mut balances: HashMap<String, f64> = HashMap::new();

    for acc in &accounts {
        balances.insert(acc.code.clone(), 0.0);
    }

    for j in journals {
        for line in j.lines {
            if let Some(acc) = accounts.iter().find(|a| a.code == line.account_code) {
                let current = balances.entry(line.account_code.clone()).or_insert(0.0);
                if acc.normal_balance == "D" {
                    *current += line.debit - line.credit;
                } else {
                    *current += line.credit - line.debit;
                }
            }
        }
    }

    serde_json::to_string(&balances)
        .map_err(|e| format!("Gagal menserialisasi saldo akun: {}", e))
}

#[tauri::command]
fn generate_profit_loss_rust(
    accounts_json: String,
    journals_json: String,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<String, String> {
    let accounts: Vec<Account> = serde_json::from_str(&accounts_json)
        .map_err(|e| format!("Gagal mendeserialisasi akun: {}", e))?;
    let mut journals: Vec<JournalEntry> = serde_json::from_str(&journals_json)
        .map_err(|e| format!("Gagal mendeserialisasi jurnal: {}", e))?;

    if let Some(start) = start_date {
        journals.retain(|j| j.date >= start);
    }
    if let Some(end) = end_date {
        journals.retain(|j| j.date <= end);
    }

    let mut revenue = Vec::new();
    let mut expenses = Vec::new();
    let mut total_revenue = 0.0;
    let mut total_expenses = 0.0;

    for acc in accounts {
        if acc.acc_type != "PENDAPATAN" && acc.acc_type != "BEBAN" {
            continue;
        }

        let mut balance = 0.0;
        for j in &journals {
            for line in &j.lines {
                if line.account_code == acc.code {
                    if acc.normal_balance == "D" {
                        balance += line.debit - line.credit;
                    } else {
                        balance += line.credit - line.debit;
                    }
                }
            }
        }

        let item = RevenueExpenseItem {
            code: acc.code.clone(),
            name: acc.name.clone(),
            amount: balance,
        };

        if acc.acc_type == "PENDAPATAN" {
            total_revenue += balance;
            revenue.push(item);
        } else {
            total_expenses += balance;
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

    serde_json::to_string(&report)
        .map_err(|e| format!("Gagal menserialisasi laporan laba rugi: {}", e))
}

#[tauri::command]
fn generate_balance_sheet_rust(
    accounts_json: String,
    journals_json: String,
    net_profit: f64,
) -> Result<String, String> {
    let accounts: Vec<Account> = serde_json::from_str(&accounts_json)
        .map_err(|e| format!("Gagal mendeserialisasi akun: {}", e))?;
    let journals: Vec<JournalEntry> = serde_json::from_str(&journals_json)
        .map_err(|e| format!("Gagal mendeserialisasi jurnal: {}", e))?;

    use std::collections::HashMap;
    let mut balances: HashMap<String, f64> = HashMap::new();

    for acc in &accounts {
        balances.insert(acc.code.clone(), 0.0);
    }

    for j in journals {
        for line in j.lines {
            if let Some(acc) = accounts.iter().find(|a| a.code == line.account_code) {
                let current = balances.entry(line.account_code.clone()).or_insert(0.0);
                if acc.normal_balance == "D" {
                    *current += line.debit - line.credit;
                } else {
                    *current += line.credit - line.debit;
                }
            }
        }
    }

    let mut assets = Vec::new();
    let mut liabilities = Vec::new();
    let mut equity = Vec::new();
    let mut total_assets = 0.0;
    let mut total_liabilities = 0.0;
    let mut total_equity = 0.0;

    for acc in accounts {
        let mut balance = *balances.get(&acc.code).unwrap_or(&0.0);

        if acc.acc_type == "ASET" {
            assets.push(RevenueExpenseItem {
                code: acc.code.clone(),
                name: acc.name.clone(),
                amount: balance,
            });
            total_assets += balance;
        } else if acc.acc_type == "KEWAJIBAN" {
            liabilities.push(RevenueExpenseItem {
                code: acc.code.clone(),
                name: acc.name.clone(),
                amount: balance,
            });
            total_liabilities += balance;
        } else if acc.acc_type == "EKUITAS" {
            // Laba bersih berjalan masuk ke Laba Ditahan (code: "3102")
            if acc.code == "3102" {
                balance += net_profit;
            }
            equity.push(RevenueExpenseItem {
                code: acc.code.clone(),
                name: acc.name.clone(),
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

    serde_json::to_string(&report)
        .map_err(|e| format!("Gagal menserialisasi laporan neraca: {}", e))
}

#[tauri::command]
fn purchase_product_rust(product_json: String, qty: f64, unit_cost: f64) -> Result<String, String> {
    let mut product: Product = serde_json::from_str(&product_json)
        .map_err(|e| format!("Gagal mendeserialisasi data produk: {}", e))?;

    if qty <= 0.0 {
        let result = PurchaseResult {
            updated_product: product,
        };
        return serde_json::to_string(&result)
            .map_err(|e| format!("Gagal menserialisasi hasil: {}", e));
    }

    let current_stock = product.stock_qty;
    let current_avg_cost = product.average_cost;

    let total_cost = (current_stock * current_avg_cost) + (qty * unit_cost);
    let new_stock = current_stock + qty;
    let new_avg_cost = if new_stock > 0.0 { (total_cost / new_stock).round() } else { 0.0 };

    product.stock_qty = new_stock;
    product.average_cost = new_avg_cost;

    let result = PurchaseResult {
        updated_product: product,
    };

    serde_json::to_string(&result)
        .map_err(|e| format!("Gagal menserialisasi hasil pembelian: {}", e))
}

#[tauri::command]
fn sell_product_rust(product_json: String, qty: f64) -> Result<String, String> {
    let mut product: Product = serde_json::from_str(&product_json)
        .map_err(|e| format!("Gagal mendeserialisasi data produk: {}", e))?;

    if qty <= 0.0 {
        let result = SellResult {
            updated_product: product,
            total_hpp: 0.0,
        };
        return serde_json::to_string(&result)
            .map_err(|e| format!("Gagal menserialisasi hasil: {}", e));
    }

    if product.stock_qty < qty {
        return Err(format!(
            "Stok produk \"{}\" tidak mencukupi. Sisa stok: {} unit.",
            product.name, product.stock_qty
        ));
    }

    let hpp_per_unit = product.average_cost;
    let total_hpp = qty * hpp_per_unit;
    let new_stock = product.stock_qty - qty;

    product.stock_qty = new_stock;

    let result = SellResult {
        updated_product: product,
        total_hpp,
    };

    serde_json::to_string(&result)
        .map_err(|e| format!("Gagal menserialisasi hasil penjualan: {}", e))
}

#[tauri::command]
fn adjust_product_stock_rust(product_json: String, new_qty: f64) -> Result<String, String> {
    let mut product: Product = serde_json::from_str(&product_json)
        .map_err(|e| format!("Gagal mendeserialisasi data produk: {}", e))?;

    let diff = new_qty - product.stock_qty;
    let abs_qty = diff.abs();
    let total_val = abs_qty * product.average_cost;

    product.stock_qty = new_qty;

    let result = AdjustResult {
        updated_product: product,
        diff,
        abs_qty,
        total_val,
    };

    serde_json::to_string(&result)
        .map_err(|e| format!("Gagal menserialisasi hasil penyesuaian: {}", e))
}

#[tauri::command]
fn calculate_monthly_depreciation_rust(asset_json: String) -> Result<f64, String> {
    let asset: FixedAsset = serde_json::from_str(&asset_json)
        .map_err(|e| format!("Gagal mendeserialisasi data aset: {}", e))?;

    if asset.useful_life_years <= 0.0 {
        return Ok(0.0);
    }

    let depreciable_amount = asset.cost - asset.salvage_value;
    let total_months = asset.useful_life_years * 12.0;
    let monthly_depr = (depreciable_amount / total_months).round();

    Ok(monthly_depr)
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
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

/**
 * Tauri Command: Memproses penyusutan aset tetap secara native di Rust
 */
#[tauri::command]
fn calculate_depreciation_rust(assets_json: String) -> Result<String, String> {
    let assets: Vec<FixedAsset> = serde_json::from_str(&assets_json)
        .map_err(|e| format!("Gagal mendeserialisasi data aset tetap: {}", e))?;

    let mut updated_assets = Vec::new();
    let mut posted_journals = Vec::new();
    let mut total_depreciated = 0.0;

    for mut asset in assets {
        let depreciable_limit = asset.cost - asset.salvage_value;
        if asset.accumulated_depreciation >= depreciable_limit || asset.is_fully_depreciated.unwrap_or(false) {
            updated_assets.push(asset);
            continue;
        }

        // Kalkulasi penyusutan Metode Garis Lurus (Straight Line)
        let total_months = asset.useful_life_years * 12.0;
        let monthly_depr = (depreciable_limit / total_months).round();
        let mut final_depr = monthly_depr;

        if asset.accumulated_depreciation + final_depr >= depreciable_limit {
            final_depr = depreciable_limit - asset.accumulated_depreciation;
            asset.is_fully_depreciated = Some(true);
        }

        asset.accumulated_depreciation += final_depr;
        total_depreciated += final_depr;

        posted_journals.push(JournalEntryStub {
            asset_id: asset.id.clone(),
            asset_name: asset.name.clone(),
            amount: final_depr,
        });

        updated_assets.push(asset);
    }

    let result = DepreciationResult {
        updated_assets,
        total_depreciated,
        posted_journals,
    };

    serde_json::to_string(&result)
        .map_err(|e| format!("Gagal menserialisasi hasil penyusutan: {}", e))
}

/**
 * Tauri Command: Memproses analisis transaksi pajak (PPN/PPh) secara native di Rust
 */
#[tauri::command]
fn process_tax_rust(journals_json: String) -> Result<String, String> {
    let journals: Vec<JournalEntry> = serde_json::from_str(&journals_json)
        .map_err(|e| format!("Gagal mendeserialisasi data jurnal: {}", e))?;

    let mut ppn_masukan = 0.0;
    let mut ppn_keluaran = 0.0;
    let mut pph21 = 0.0;
    let pph23 = 0.0;
    let mut transactions = Vec::new();

    for journal in journals {
        for line in &journal.lines {
            if line.account_code == "1106" {
                // PPN Masukan (Debit)
                ppn_masukan += line.debit;
                transactions.push(TaxTransaction {
                    date: journal.date.clone(),
                    ref_id: journal.id.clone(),
                    description: journal.description.clone(),
                    dpp: (line.debit / 0.11).round(),
                    tax_amount: line.debit,
                    tax_type: "PPN_MASUKAN".to_string(),
                });
            } else if line.account_code == "2103" {
                // PPN Keluaran (Kredit)
                ppn_keluaran += line.credit;
                transactions.push(TaxTransaction {
                    date: journal.date.clone(),
                    ref_id: journal.id.clone(),
                    description: journal.description.clone(),
                    dpp: (line.credit / 0.11).round(),
                    tax_amount: line.credit,
                    tax_type: "PPN_KELUARAN".to_string(),
                });
            } else if line.account_code == "2102" {
                // PPh 21 (Kredit)
                pph21 += line.credit;
                transactions.push(TaxTransaction {
                    date: journal.date.clone(),
                    ref_id: journal.id.clone(),
                    description: journal.description.clone(),
                    dpp: (line.credit / 0.05).round(), // Asumsi tarif dasar 5%
                    tax_amount: line.credit,
                    tax_type: "PPH_21".to_string(),
                });
            }
        }
    }

    let summary = TaxSummary {
        ppn_masukan,
        ppn_keluaran,
        pph21,
        pph23,
        transactions,
    };

    serde_json::to_string(&summary)
        .map_err(|e| format!("Gagal menserialisasi data ringkasan pajak: {}", e))
}

/**
 * Tauri Command: Menghasilkan string CSV e-Faktur Pajak secara native di Rust
 */
#[tauri::command]
fn generate_efaktur_csv_rust(transactions_json: String, tax_type: String) -> Result<String, String> {
    let transactions: Vec<TaxTransaction> = serde_json::from_str(&transactions_json)
        .map_err(|e| format!("Gagal mendeserialisasi transaksi pajak: {}", e))?;

    let filtered: Vec<&TaxTransaction> = transactions
        .iter()
        .filter(|t| t.tax_type == tax_type)
        .collect();

    let mut csv = "FK,KD_AP,FG_PENGGANTI,NOMOR_FAKTUR,MASA_PAJAK,TAHUN_PAJAK,TANGGAL_FAKTUR,NPWP,NAMA,ALAMAT,JUMLAH_DPP,JUMLAH_PPN,JUMLAH_PPNBM,STATUS_APPROVAL,MEMO\n".to_string();

    for (index, t) in filtered.iter().enumerate() {
        let no_faktur = format!("010.002-26.{:08}", index + 1);
        let npwp = if tax_type == "PPN_MASUKAN" { "01.234.567.8-012.000" } else { "99.999.999.9-999.000" };
        let nama = if tax_type == "PPN_MASUKAN" { "Supplier Kopi Utama" } else { "Pelanggan Umum" };
        
        csv.push_str(&format!(
            "FK,01,0,{},06,2026,{},{},{},Jakarta,{},{},0,APPROVED,{}\n",
            no_faktur, t.date, npwp, nama, t.dpp, t.tax_amount, t.description
        ));
    }

    Ok(csv)
}

/**
 * Tauri Command: Menghasilkan string CSV e-Bupot PPh secara native di Rust
 */
#[tauri::command]
fn generate_ebupot_csv_rust(transactions_json: String) -> Result<String, String> {
    let transactions: Vec<TaxTransaction> = serde_json::from_str(&transactions_json)
        .map_err(|e| format!("Gagal mendeserialisasi transaksi pajak: {}", e))?;

    let filtered: Vec<&TaxTransaction> = transactions
        .iter()
        .filter(|t| t.tax_type == "PPH_21")
        .collect();

    let mut csv = "NO_BUKTI_POTONG,TANGGAL_BUKUPOT,IDENTITAS_PENERIMA_PENGHASILAN,NAMA_PENERIMA,KODE_OBJEK_PAJAK,PENGHASILAN_BRUTO,TARIF,PPH_DIPOTONG\n".to_string();

    for (index, t) in filtered.iter().enumerate() {
        let no_bupot = format!("21-26-{:07}", index + 1);
        csv.push_str(&format!(
            "{},{},1234567890123456,Pegawai Tetap,21-100-01,{},5%,{}\n",
            no_bupot, t.date, t.dpp, t.tax_amount
        ));
    }

    Ok(csv)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            save_export_file,
            calculate_depreciation_rust,
            process_tax_rust,
            generate_efaktur_csv_rust,
            generate_ebupot_csv_rust,
                        is_journal_balanced_rust,
            generate_general_ledger_rust,
            get_account_balances_rust,
            generate_profit_loss_rust,
            generate_balance_sheet_rust,
            purchase_product_rust,
            sell_product_rust,
            adjust_product_stock_rust,
            calculate_monthly_depreciation_rust
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
