use tauri::State;
use tauri::Emitter;
use crate::DbState;
use crate::models::*;

fn rand_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let n: u32 = rng.gen_range(100_000..999_999);
    n.to_string()
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

#[tauri::command]
pub fn process_tax_rust(state: State<DbState>) -> Result<String, String> {
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
pub fn generate_efaktur_csv_rust(transactions_json: String, tax_type: String) -> Result<String, String> {
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
pub fn generate_ebupot_csv_rust(transactions_json: String, tax_type: String) -> Result<String, String> {
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

#[tauri::command]
pub fn get_bank_statements_rust(state: State<DbState>) -> Result<String, String> {
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
pub fn reconcile_bank_statement_rust(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
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
            matched: true,
            matched_journal_id: Some(new_jrn_id),
            confidence_score: 85.0,
            suggested_lines: Some(lines),
            suggested_description: Some(suggested_desc),
        };
        
        serde_json::to_string(&result).map_err(|e| e.to_string())
    }
}
