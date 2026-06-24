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
    let mut pph23 = 0.0;
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
            generate_ebupot_csv_rust
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
