use tauri::State;
use tauri::Emitter;
use crate::DbState;
use crate::models::*;

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

#[tauri::command]
pub fn upsert_account_rust(state: State<'_, DbState>, account_json: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let account: Account = serde_json::from_str(&account_json).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO accounts (code, name, type, normal_balance) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![account.code, account.name, account.acc_type, account.normal_balance],
    ).map_err(|e| format!("Gagal menyimpan akun: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn delete_account_rust(state: State<'_, DbState>, code: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM accounts WHERE code = ?1", [&code])
        .map_err(|e| format!("Gagal menghapus akun: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_accounts_rust(state: State<DbState>) -> Result<String, String> {
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
pub fn delete_journal_rust(state: State<'_, DbState>, journal_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM journal_lines WHERE journal_id = ?1", [&journal_id])
        .map_err(|e| format!("Gagal menghapus lines jurnal: {}", e))?;
    conn.execute("DELETE FROM journals WHERE id = ?1", [&journal_id])
        .map_err(|e| format!("Gagal menghapus jurnal: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_journals_rust(state: State<DbState>) -> Result<String, String> {
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
pub fn post_journal_entry_rust(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
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
    
    // Validasi lock_date
    let lock_date: String = conn.query_row(
        "SELECT value FROM settings WHERE key = 'lock_date'",
        [],
        |row| row.get(0)
    ).unwrap_or_default();
    
    if !lock_date.is_empty() && entry.date <= lock_date {
        return Err(format!("Transaksi ditolak karena tanggal transaksi ({}) berada pada atau sebelum tanggal tutup buku ({}).", entry.date, lock_date));
    }
    
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
pub fn is_journal_balanced_rust(entry_json: String) -> Result<bool, String> {
    let entry: JournalEntry = serde_json::from_str(&entry_json)
        .map_err(|e| format!("Gagal parsing entri jurnal: {}", e))?;
    
    let total_debit: f64 = entry.lines.iter().map(|l| l.debit).sum();
    let total_credit: f64 = entry.lines.iter().map(|l| l.credit).sum();
    
    Ok((total_debit - total_credit).abs() < 0.01)
}

#[tauri::command]
pub fn generate_general_ledger_rust(
    state: State<DbState>,
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
pub fn get_account_balances_rust(state: State<DbState>) -> Result<String, String> {
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
pub fn generate_profit_loss_rust(
    state: State<DbState>,
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
pub fn generate_balance_sheet_rust(
    state: State<DbState>,
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

#[tauri::command]
pub fn generate_trial_balance_rust(state: State<DbState>) -> Result<String, String> {
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
pub fn generate_cash_flow_rust(state: State<DbState>) -> Result<String, String> {
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
    
    let mut investing_receipts = Vec::new();
    let mut investing_payments = Vec::new();
    let mut total_investing = 0.0;
    
    let mut financing_receipts = Vec::new();
    let mut financing_payments = Vec::new();
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
        
        // Helper untuk klasifikasi akun offset ke kategori arus kas
        let classify_offset = |acc_code: &str| -> &'static str {
            if acc_code == "1104" || acc_code == "1105" {
                "OPERATING"
            } else if acc_code.starts_with("12") {
                "INVESTING"
            } else if acc_code == "2101" {
                "OPERATING"
            } else {
                "OTHER"
            }
        };

        let classify_by_type = |acc_type: &str| -> &'static str {
            match acc_type {
                "PENDAPATAN" => "OPERATING",
                "BEBAN" => "OPERATING",
                "EKUITAS" => "FINANCING",
                "KEWAJIBAN" => "OPERATING",
                _ => "OPERATING",
            }
        };

        if cash_line.debit > 0.0 {
            let amount = cash_line.debit;
            let mut category = "OPERATING";

            for offset in &offsets {
                let acc_type: String = conn.query_row(
                    "SELECT type FROM accounts WHERE code = ?1",
                    [&offset.account_code],
                    |row| row.get(0)
                ).unwrap_or_else(|_| "LAIN".to_string());

                let cat = classify_by_type(&acc_type);
                if cat == "FINANCING" {
                    category = "FINANCING";
                } else if cat == "INVESTING" && category != "FINANCING" {
                    category = "INVESTING";
                }
            }

            match category {
                "FINANCING" => {
                    total_financing += amount;
                    financing_receipts.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                }
                "INVESTING" => {
                    total_investing += amount;
                    investing_receipts.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                }
                _ => {
                    total_operating += amount;
                    operating_receipts.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                }
            }
        } else if cash_line.credit > 0.0 {
            let amount = cash_line.credit;
            let mut category = "OPERATING";

            for offset in &offsets {
                let code_cat = classify_offset(&offset.account_code);
                let acc_type: String = conn.query_row(
                    "SELECT type FROM accounts WHERE code = ?1",
                    [&offset.account_code],
                    |row| row.get(0)
                ).unwrap_or_else(|_| "LAIN".to_string());
                let type_cat = classify_by_type(&acc_type);

                let cat = if code_cat != "OTHER" { code_cat } else { type_cat };
                if cat == "INVESTING" {
                    category = "INVESTING";
                } else if cat == "FINANCING" && category != "INVESTING" {
                    category = "FINANCING";
                }
            }

            match category {
                "INVESTING" => {
                    total_investing -= amount;
                    investing_payments.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                }
                "FINANCING" => {
                    total_financing -= amount;
                    financing_payments.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                }
                _ => {
                    total_operating -= amount;
                    operating_payments.push(CashFlowItem {
                        description: cash_line.description.clone(),
                        amount,
                    });
                }
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
pub fn get_lock_date_rust(state: State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    let lock_date: String = conn.query_row(
        "SELECT value FROM settings WHERE key = 'lock_date'",
        [],
        |row| row.get(0)
    ).unwrap_or_default();
    Ok(lock_date)
}

#[tauri::command]
pub fn close_books_rust(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
    close_date: String,
) -> Result<String, String> {
    let mut conn = state.0.lock().unwrap();
    
    // 1. Cek lock_date sebelumnya
    let current_lock_date: String = conn.query_row(
        "SELECT value FROM settings WHERE key = 'lock_date'",
        [],
        |row| row.get(0)
    ).unwrap_or_default();
    
    if !current_lock_date.is_empty() && close_date <= current_lock_date {
        return Err(format!("Tanggal tutup buku ({}) harus setelah tanggal tutup buku sebelumnya ({}).", close_date, current_lock_date));
    }
    
    let mut lines = Vec::new();
    let mut total_debit = 0.0;
    let mut total_credit = 0.0;
    
    // 2. Cari tahu jurnal penutup terakhir yang sudah ada (jika ada)
    let last_close_date: String = conn.query_row(
        "SELECT value FROM settings WHERE key = 'lock_date'",
        [],
        |row| row.get(0)
    ).unwrap_or_default();

    // 2b. Ambil saldo akun pendapatan dan beban sejak tutup buku terakhir sampai close_date
    {
        let mut stmt = conn.prepare(
            r#"SELECT a.code, a.type, a.normal_balance,
                      COALESCE(SUM(jl.debit), 0.0), COALESCE(SUM(jl.credit), 0.0)
               FROM accounts a
               JOIN journal_lines jl ON a.code = jl.account_code
               JOIN journals j ON jl.journal_id = j.id
               WHERE a.type IN ('PENDAPATAN', 'BEBAN') AND j.date > ?1 AND j.date <= ?2
               GROUP BY a.code"#
        ).map_err(|e| e.to_string())?;
        
        let rows = stmt.query_map(rusqlite::params![last_close_date, close_date], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, f64>(3)?,
                row.get::<_, f64>(4)?,
            ))
        }).map_err(|e| e.to_string())?;

        for r in rows {
            let (code, acc_type, normal_balance, debit, credit) = r.map_err(|e| e.to_string())?;
            
            let balance = if normal_balance == "D" {
                debit - credit
            } else {
                credit - debit
            };
            
            if balance.abs() < 0.01 {
                continue;
            }
            
            if acc_type == "PENDAPATAN" {
                lines.push(JournalLine {
                    account_code: code,
                    debit: balance,
                    credit: 0.0,
                });
                total_debit += balance;
            } else if acc_type == "BEBAN" {
                lines.push(JournalLine {
                    account_code: code,
                    debit: 0.0,
                    credit: balance,
                });
                total_credit += balance;
            }
        }
    }
    
    // Hitung Laba Bersih
    let net_profit = total_debit - total_credit;
    if net_profit.abs() >= 0.01 {
        if net_profit > 0.0 {
            // Untung: Kredit Laba Ditahan (3102)
            lines.push(JournalLine {
                account_code: "3102".to_string(),
                debit: 0.0,
                credit: net_profit,
            });
        } else {
            // Rugi: Debit Laba Ditahan (3102)
            lines.push(JournalLine {
                account_code: "3102".to_string(),
                debit: -net_profit,
                credit: 0.0,
            });
        }
    }
    
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Jika ada akun yang ditutup, buat jurnal penutup
    if !lines.is_empty() {
        let close_jrn_id = format!("JRN-CLOSE-{}", close_date);
        
        // Hapus dulu jika jurnal penutup dengan id sama sudah ada (untuk keamanan idempotensi)
        tx.execute("DELETE FROM journal_lines WHERE journal_id = ?1", [&close_jrn_id]).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM journals WHERE id = ?1", [&close_jrn_id]).map_err(|e| e.to_string())?;
        
        tx.execute(
            "INSERT INTO journals (id, date, description, reference, is_anomaly) VALUES (?1, ?2, ?3, ?4, 0)",
            rusqlite::params![
                close_jrn_id,
                close_date,
                format!("Jurnal Penutup Otomatis per {}", close_date),
                "TUTUP_BUKU"
            ]
        ).map_err(|e| e.to_string())?;
        
        for line in &lines {
            tx.execute(
                "INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![close_jrn_id, line.account_code, line.debit, line.credit]
            ).map_err(|e| e.to_string())?;
        }
    }
    
    // 3. Update settings lock_date
    tx.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('lock_date', ?1)",
        [&close_date]
    ).map_err(|e| e.to_string())?;
    
    tx.commit().map_err(|e| e.to_string())?;
    
    let _ = app_handle.emit("db-update", "journals");
    let _ = app_handle.emit("db-update", "settings");
    
    Ok(close_date)
}

#[tauri::command]
pub fn generate_equity_statement_rust(
    state: State<DbState>,
    start_date: String,
    end_date: String,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    
    // 1. Modal awal (sebelum start_date)
    let (debit_3101_start, credit_3101_start): (f64, f64) = conn.query_row(
        "SELECT COALESCE(SUM(jl.debit), 0.0), COALESCE(SUM(jl.credit), 0.0) FROM journal_lines jl JOIN journals j ON jl.journal_id = j.id WHERE jl.account_code = '3101' AND j.date < ?1",
        [&start_date],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((0.0, 0.0));
    let bal_3101_start = credit_3101_start - debit_3101_start;

    let (debit_3102_start, credit_3102_start): (f64, f64) = conn.query_row(
        "SELECT COALESCE(SUM(jl.debit), 0.0), COALESCE(SUM(jl.credit), 0.0) FROM journal_lines jl JOIN journals j ON jl.journal_id = j.id WHERE jl.account_code = '3102' AND j.date < ?1",
        [&start_date],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((0.0, 0.0));
    let bal_3102_start = credit_3102_start - debit_3102_start;
    
    let start_equity = bal_3101_start + bal_3102_start;
    
    // 2. Transaksi Modal Pemilik (3101) selama periode
    let (debit_3101_period, credit_3101_period): (f64, f64) = conn.query_row(
        "SELECT COALESCE(SUM(jl.debit), 0.0), COALESCE(SUM(jl.credit), 0.0) FROM journal_lines jl JOIN journals j ON jl.journal_id = j.id WHERE jl.account_code = '3101' AND j.date >= ?1 AND j.date <= ?2",
        rusqlite::params![start_date, end_date],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((0.0, 0.0));
    
    let additional_investment = credit_3101_period;
    let prive = debit_3101_period;
    
    // 3. Laba Bersih berjalan selama periode (dari Pendapatan & Beban)
    let mut stmt_pl = conn.prepare(
        r#"SELECT a.type, jl.debit, jl.credit 
           FROM journal_lines jl
           JOIN journals j ON jl.journal_id = j.id
           JOIN accounts a ON jl.account_code = a.code
           WHERE a.type IN ('PENDAPATAN', 'BEBAN') AND j.date >= ?1 AND j.date <= ?2"#
    ).map_err(|e| e.to_string())?;

    let pl_iter = stmt_pl.query_map(rusqlite::params![start_date, end_date], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?, row.get::<_, f64>(2)?))
    }).map_err(|e| e.to_string())?;

    let mut net_profit = 0.0;
    for item in pl_iter {
        let (acc_type, debit, credit) = item.map_err(|e| e.to_string())?;
        if acc_type == "PENDAPATAN" {
            net_profit += credit - debit;
        } else if acc_type == "BEBAN" {
            net_profit -= debit - credit;
        }
    }
    
    let end_equity = start_equity + additional_investment - prive + net_profit;
    
    let report = EquityStatementReport {
        start_equity,
        additional_investment,
        net_profit,
        prive,
        end_equity,
    };
    
    serde_json::to_string(&report).map_err(|e| e.to_string())
}
