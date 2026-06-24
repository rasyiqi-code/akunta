use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct FixedAsset {
    pub id: String,
    pub name: String,
    #[serde(rename = "purchaseDate")]
    pub purchase_date: String,
    pub cost: f64,
    #[serde(rename = "usefulLifeYears")]
    pub useful_life_years: f64,
    #[serde(rename = "salvageValue")]
    pub salvage_value: f64,
    #[serde(rename = "accumulatedDepreciation")]
    pub accumulated_depreciation: f64,
    #[serde(rename = "isFullyDepreciated")]
    pub is_fully_depreciated: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SalesDocumentItem {
    pub id: Option<i64>,
    #[serde(rename = "documentId")]
    pub document_id: String,
    #[serde(rename = "productId")]
    pub product_id: String,
    pub qty: f64,
    pub price: f64,
    pub discount: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SalesDocument {
    pub id: String,
    pub date: String,
    #[serde(rename = "contactId")]
    pub contact_id: String,
    #[serde(rename = "type")]
    pub doc_type: String, // 'QUOTATION' | 'ORDER' | 'DELIVERY' | 'INVOICE' | 'RETURN'
    pub status: String, // 'PENDING' | 'COMPLETED' | 'CANCELLED'
    #[serde(rename = "referenceId")]
    pub reference_id: Option<String>,
    #[serde(rename = "totalAmount")]
    pub total_amount: f64,
    #[serde(rename = "dpApplied")]
    pub dp_applied: f64,
    pub items: Option<Vec<SalesDocumentItem>>,
    #[serde(rename = "dueDate")]
    pub due_date: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PurchaseDocumentItem {
    pub id: Option<i64>,
    #[serde(rename = "documentId")]
    pub document_id: String,
    #[serde(rename = "productId")]
    pub product_id: String,
    pub qty: f64,
    pub price: f64,
    pub discount: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PurchaseDocument {
    pub id: String,
    pub date: String,
    #[serde(rename = "contactId")]
    pub contact_id: String,
    #[serde(rename = "type")]
    pub doc_type: String, // 'ORDER' | 'RECEIPT' | 'INVOICE' | 'RETURN'
    pub status: String, // 'PENDING' | 'COMPLETED' | 'CANCELLED'
    #[serde(rename = "referenceId")]
    pub reference_id: Option<String>,
    #[serde(rename = "totalAmount")]
    pub total_amount: f64,
    #[serde(rename = "dpApplied")]
    pub dp_applied: f64,
    pub items: Option<Vec<PurchaseDocumentItem>>,
    #[serde(rename = "dueDate")]
    pub due_date: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Warehouse {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct StockTakeItem {
    pub id: Option<i64>,
    #[serde(rename = "stockTakeId")]
    pub stock_take_id: String,
    #[serde(rename = "productId")]
    pub product_id: String,
    #[serde(rename = "systemQty")]
    pub system_qty: f64,
    #[serde(rename = "physicalQty")]
    pub physical_qty: f64,
    #[serde(rename = "diffQty")]
    pub diff_qty: f64,
    pub cost: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct StockTakeOrder {
    pub id: String,
    pub date: String,
    pub status: String, // 'DRAFT' | 'COMPLETED'
    pub items: Option<Vec<StockTakeItem>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FixedAssetAdjustment {
    pub id: String,
    #[serde(rename = "assetId")]
    pub asset_id: String,
    pub date: String,
    #[serde(rename = "type")]
    pub adj_type: String, // 'REVALUATION' | 'IMPAIRMENT'
    pub amount: f64,
    pub description: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JournalLine {
    #[serde(rename = "accountCode")]
    pub account_code: String,
    pub debit: f64,
    pub credit: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JournalEntry {
    pub id: String,
    pub date: String,
    pub description: String,
    pub reference: Option<String>,
    pub lines: Vec<JournalLine>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct JournalEntryWithAnomaly {
    pub id: String,
    pub date: String,
    pub description: String,
    pub reference: Option<String>,
    pub lines: Vec<JournalLine>,
    #[serde(rename = "isAnomaly")]
    pub is_anomaly: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Contact {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub contact_type: String, // 'CUSTOMER' | 'VENDOR'
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BankStatementItem {
    pub id: String,
    pub date: String,
    pub description: String,
    pub amount: f64,
    #[serde(rename = "matchedJournalId")]
    pub matched_journal_id: Option<String>,
    #[serde(rename = "confidenceScore")]
    pub confidence_score: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub id: Option<i64>,
    pub sender: String, // 'USER' | 'AI'
    pub text: String,
    pub timestamp: String,
    #[serde(rename = "cardType")]
    pub card_type: Option<String>,
    #[serde(rename = "cardData")]
    pub card_data: Option<String>, // JSON string
    #[serde(rename = "imageUrl")]
    pub image_url: Option<String>, // base64 string
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Product {
    pub id: String,
    pub name: String,
    pub sku: String,
    #[serde(rename = "stockQty")]
    pub stock_qty: f64,
    #[serde(rename = "averageCost")]
    pub average_cost: f64,
    #[serde(rename = "sellingPrice")]
    pub selling_price: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct InventoryLog {
    pub id: String,
    #[serde(rename = "productId")]
    pub product_id: String,
    pub date: String,
    #[serde(rename = "type")]
    pub log_type: String, // 'MASUK' | 'KELUAR' | 'ADJUSTMENT'
    pub qty: f64,
    pub cost: f64,
    pub reference: Option<String>,
    #[serde(rename = "warehouseId")]
    pub warehouse_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct DepreciationResult {
    #[serde(rename = "updatedAssets")]
    pub updated_assets: Vec<FixedAsset>,
    #[serde(rename = "totalDepreciated")]
    pub total_depreciated: f64,
    #[serde(rename = "postedJournals")]
    pub posted_journals: Vec<JournalEntryStub>,
}

#[derive(Serialize, Deserialize)]
pub struct JournalEntryStub {
    #[serde(rename = "assetId")]
    pub asset_id: String,
    #[serde(rename = "assetName")]
    pub asset_name: String,
    pub amount: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TaxTransaction {
    pub date: String,
    #[serde(rename = "refId")]
    pub ref_id: String,
    pub description: String,
    pub dpp: f64,
    #[serde(rename = "taxAmount")]
    pub tax_amount: f64,
    #[serde(rename = "taxType")]
    pub tax_type: String, // "PPN_MASUKAN" | "PPN_KELUARAN" | "PPH_21" | "PPH_23"
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TaxSummary {
    #[serde(rename = "ppnMasukan")]
    pub ppn_masukan: f64,
    #[serde(rename = "ppnKeluaran")]
    pub ppn_keluaran: f64,
    #[serde(rename = "pph21")]
    pub pph21: f64,
    #[serde(rename = "pph23")]
    pub pph23: f64,
    pub transactions: Vec<TaxTransaction>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Account {
    pub code: String,
    pub name: String,
    #[serde(rename = "type")]
    pub acc_type: String, // "ASET" | "KEWAJIBAN" | "EKUITAS" | "PENDAPATAN" | "BEBAN"
    #[serde(rename = "normalBalance")]
    pub normal_balance: String, // "D" | "K"
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LedgerEntry {
    pub id: String,
    pub date: String,
    pub description: String,
    pub debit: f64,
    pub credit: f64,
    pub balance: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GeneralLedgerResult {
    pub account: Account,
    pub entries: Vec<LedgerEntry>,
    #[serde(rename = "finalBalance")]
    pub final_balance: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RevenueExpenseItem {
    pub code: String,
    pub name: String,
    pub amount: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProfitLossReportRust {
    pub revenue: Vec<RevenueExpenseItem>,
    pub expenses: Vec<RevenueExpenseItem>,
    #[serde(rename = "totalRevenue")]
    pub total_revenue: f64,
    #[serde(rename = "totalExpenses")]
    pub total_expenses: f64,
    #[serde(rename = "netProfit")]
    pub net_profit: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BalanceSheetReportRust {
    pub assets: Vec<RevenueExpenseItem>,
    pub liabilities: Vec<RevenueExpenseItem>,
    pub equity: Vec<RevenueExpenseItem>,
    #[serde(rename = "totalAssets")]
    pub total_assets: f64,
    #[serde(rename = "totalLiabilities")]
    pub total_liabilities: f64,
    #[serde(rename = "totalEquity")]
    pub total_equity: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TrialBalanceItem {
    pub code: String,
    pub name: String,
    #[serde(rename = "type")]
    pub acc_type: String,
    pub debit: f64,
    pub credit: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TrialBalanceReport {
    pub items: Vec<TrialBalanceItem>,
    #[serde(rename = "totalDebit")]
    pub total_debit: f64,
    #[serde(rename = "totalCredit")]
    pub total_credit: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CashFlowItem {
    pub description: String,
    pub amount: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CashFlowReportRust {
    #[serde(rename = "operatingReceipts")]
    pub operating_receipts: Vec<CashFlowItem>,
    #[serde(rename = "operatingPayments")]
    pub operating_payments: Vec<CashFlowItem>,
    #[serde(rename = "totalOperating")]
    pub total_operating: f64,
    
    #[serde(rename = "investingReceipts")]
    pub investing_receipts: Vec<CashFlowItem>,
    #[serde(rename = "investingPayments")]
    pub investing_payments: Vec<CashFlowItem>,
    #[serde(rename = "totalInvesting")]
    pub total_investing: f64,
    
    #[serde(rename = "financingReceipts")]
    pub financing_receipts: Vec<CashFlowItem>,
    #[serde(rename = "financingPayments")]
    pub financing_payments: Vec<CashFlowItem>,
    #[serde(rename = "totalFinancing")]
    pub total_financing: f64,
    
    #[serde(rename = "netIncrease")]
    pub net_increase: f64,
    #[serde(rename = "startBalance")]
    pub start_balance: f64,
    #[serde(rename = "endBalance")]
    pub end_balance: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ReconciliationResult {
    pub matched: bool,
    #[serde(rename = "matchedJournalId")]
    pub matched_journal_id: Option<String>,
    #[serde(rename = "confidenceScore")]
    pub confidence_score: f64,
    #[serde(rename = "suggestedLines")]
    pub suggested_lines: Option<Vec<JournalLine>>,
    #[serde(rename = "suggestedDescription")]
    pub suggested_description: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct EquityStatementReport {
    #[serde(rename = "startEquity")]
    pub start_equity: f64,
    #[serde(rename = "additionalInvestment")]
    pub additional_investment: f64,
    #[serde(rename = "netProfit")]
    pub net_profit: f64,
    pub prive: f64,
    #[serde(rename = "endEquity")]
    pub end_equity: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AgingItem {
    #[serde(rename = "contactId")]
    pub contact_id: String,
    #[serde(rename = "contactName")]
    pub contact_name: String,
    pub current: f64,
    #[serde(rename = "period31To60")]
    pub period_31_60: f64,
    #[serde(rename = "period61To90")]
    pub period_61_90: f64,
    #[serde(rename = "over90")]
    pub over_90: f64,
    pub total: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AgingReport {
    pub items: Vec<AgingItem>,
    #[serde(rename = "totalCurrent")]
    pub total_current: f64,
    #[serde(rename = "total31To60")]
    pub total_31_60: f64,
    #[serde(rename = "total61To90")]
    pub total_61_90: f64,
    #[serde(rename = "totalOver90")]
    pub total_over_90: f64,
    #[serde(rename = "grandTotal")]
    pub grand_total: f64,
}
