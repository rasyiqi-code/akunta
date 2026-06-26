use std::sync::Mutex;
use rusqlite::Connection;
use tauri::Manager;

mod db;
mod accounting;
pub mod models;
pub use models::*;
mod commands_accounting;
mod commands_inventory;
mod commands_fixed_assets;
mod commands_tax;
mod commands_misc;
mod commands_aging;

// State untuk menyimpan koneksi database SQLite secara thread-safe
pub struct DbState(pub Mutex<Connection>);

// Ekspor semua command dari submodul agar masuk scope lib.rs
use commands_accounting::*;
use commands_inventory::*;
use commands_fixed_assets::*;
use commands_tax::*;
use commands_misc::*;
use commands_aging::*;

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
            adjust_fixed_asset_rust,
            update_fixed_asset_rust,
            delete_fixed_asset_rust,
            get_contacts_rust,
            add_contact_rust,
            update_contact_rust,
            delete_contact_rust,
            delete_sales_document_rust,
            delete_purchase_document_rust,
            add_warehouse_rust,
            update_warehouse_rust,
            delete_warehouse_rust,
            reset_database_rust,
            get_lock_date_rust,
            close_books_rust,
            generate_equity_statement_rust,
            generate_aging_report_rust,
            get_gemini_api_key_rust,
            get_gemini_api_url_rust,
            get_gemini_model_rust,
            set_setting_rust,
            get_app_settings_rust,
            upsert_account_rust,
            delete_account_rust,
            delete_journal_rust,
            update_product_rust,
            delete_product_rust
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
