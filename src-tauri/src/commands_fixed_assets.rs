use tauri::State;
use tauri::Emitter;
use crate::DbState;
use crate::models::*;
use crate::accounting;

#[tauri::command]
pub fn get_fixed_assets_rust(state: State<DbState>) -> Result<String, String> {
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
pub fn add_fixed_asset_rust(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
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
pub fn calculate_monthly_depreciation_rust(asset_json: String) -> Result<f64, String> {
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
pub fn calculate_depreciation_rust(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
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

#[tauri::command]
pub fn dispose_fixed_asset_rust(
    state: State<'_, DbState>,
    asset_id: String,
    disposal_date: String,
    disposal_value: f64,
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    accounting::dispose_fixed_asset(&conn, &asset_id, &disposal_date, disposal_value)
}

#[tauri::command]
pub fn adjust_fixed_asset_rust(state: State<'_, DbState>, adj_json: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let adj: FixedAssetAdjustment = serde_json::from_str(&adj_json).map_err(|e| e.to_string())?;
    accounting::adjust_fixed_asset(&conn, adj)
}
