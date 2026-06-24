use tauri::State;
use crate::DbState;
use crate::models::{AgingReport, AgingItem};
use chrono::{NaiveDate, Utc};
use std::collections::HashMap;

#[tauri::command]
pub fn generate_aging_report_rust(
    state: State<DbState>,
    report_type: String, // "AR" atau "AP"
) -> Result<String, String> {
    let conn = state.0.lock().unwrap();

    let query = if report_type == "AR" {
        r#"
        SELECT 
            c.id, 
            c.name, 
            d.total_amount, 
            d.dp_applied,
            d.date, 
            d.due_date
        FROM sales_documents d
        JOIN contacts c ON d.contact_id = c.id
        WHERE d.type = 'INVOICE' AND d.status = 'PENDING'
        "#
    } else {
        r#"
        SELECT 
            c.id, 
            c.name, 
            d.total_amount, 
            d.dp_applied,
            d.date, 
            d.due_date
        FROM purchase_documents d
        JOIN contacts c ON d.contact_id = c.id
        WHERE d.type = 'INVOICE' AND d.status = 'PENDING'
        "#
    };

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let doc_iter = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?, // contact_id
            row.get::<_, String>(1)?, // contact_name
            row.get::<_, f64>(2)?,    // total_amount
            row.get::<_, f64>(3)?,    // dp_applied
            row.get::<_, String>(4)?, // date
            row.get::<_, Option<String>>(5)?, // due_date
        ))
    }).map_err(|e| e.to_string())?;

    let today = Utc::now().date_naive();
    let mut accumulators: HashMap<String, (String, f64, f64, f64, f64)> = HashMap::new();

    for doc in doc_iter {
        let (contact_id, contact_name, total_amount, dp_applied, date_str, due_date_opt) = doc.map_err(|e| e.to_string())?;

        // Fallback due_date: date + 30 hari
        let due_date = match due_date_opt {
            Some(d) if !d.is_empty() => {
                NaiveDate::parse_from_str(&d, "%Y-%m-%d").unwrap_or_else(|_| {
                    NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
                        .unwrap_or(today) + chrono::Duration::days(30)
                })
            }
            _ => {
                NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
                    .unwrap_or(today) + chrono::Duration::days(30)
            }
        };

        // Hitung nilai piutang/utang (termasuk PPN 11% dikurangi down payment)
        let unpaid = (total_amount * 1.11 - dp_applied).max(0.0);
        if unpaid <= 0.0 {
            continue;
        }

        let days_late = (today - due_date).num_days();

        let entry = accumulators.entry(contact_id).or_insert((contact_name, 0.0, 0.0, 0.0, 0.0));
        
        if days_late <= 30 {
            entry.1 += unpaid;
        } else if days_late <= 60 {
            entry.2 += unpaid;
        } else if days_late <= 90 {
            entry.3 += unpaid;
        } else {
            entry.4 += unpaid;
        }
    }

    let mut items = Vec::new();
    let mut total_current = 0.0;
    let mut total_31_60 = 0.0;
    let mut total_61_90 = 0.0;
    let mut total_over_90 = 0.0;
    let mut grand_total = 0.0;

    for (contact_id, (contact_name, current, period_31_60, period_61_90, over_90)) in accumulators {
        let total = current + period_31_60 + period_61_90 + over_90;
        
        total_current += current;
        total_31_60 += period_31_60;
        total_61_90 += period_61_90;
        total_over_90 += over_90;
        grand_total += total;

        items.push(AgingItem {
            contact_id,
            contact_name,
            current,
            period_31_60,
            period_61_90,
            over_90,
            total,
        });
    }

    // Urutkan berdasarkan nama kontak agar konsisten
    items.sort_by(|a, b| a.contact_name.cmp(&b.contact_name));

    let report = AgingReport {
        items,
        total_current,
        total_31_60,
        total_61_90,
        total_over_90,
        grand_total,
    };

    serde_json::to_string(&report).map_err(|e| e.to_string())
}
