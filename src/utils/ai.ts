import type { Account, Product } from '../types/ledger';
import { db, DEFAULT_ACCOUNTS } from './db';
import { invoke } from '@tauri-apps/api/core';

type Provider = 'gemini' | 'openai' | 'anthropic';

let cachedKey = '';
let cachedUrlTemplate = '';
let cachedProvider: Provider = 'gemini';
let cachedModel = '';

function detectProvider(model: string, urlTemplate: string): Provider {
  const m = model.toLowerCase();
  const u = urlTemplate.toLowerCase();
  if (m.startsWith('gemini-') || u.includes('googleapis.com') || u.includes('generativelanguage')) return 'gemini';
  if (m.startsWith('claude-') || u.includes('anthropic.com')) return 'anthropic';
  return 'openai';
}

async function refreshConfig(): Promise<void> {
  try {
    const [key, urlTemplate, model] = await Promise.all([
      invoke<string>('get_gemini_api_key_rust'),
      invoke<string>('get_gemini_api_url_rust'),
      invoke<string>('get_gemini_model_rust'),
    ]);
    cachedKey = key;
    cachedUrlTemplate = urlTemplate;
    cachedModel = model;
    cachedProvider = detectProvider(model, urlTemplate);
  } catch {
    cachedKey = '';
    cachedUrlTemplate = '';
    cachedProvider = 'gemini';
    cachedModel = 'gemini-2.5-flash';
  }
}

async function getApiConfig(): Promise<{ url: string; key: string; provider: Provider; model: string }> {
  if (!cachedKey && !cachedUrlTemplate) {
    await refreshConfig();
  }
  const key = cachedKey;
  if (!key) return { url: '', key: '', provider: cachedProvider, model: cachedModel };

  let url: string;
  if (cachedUrlTemplate) {
    url = cachedUrlTemplate
      .replace('{KEY}', key)
      .replace('{MODEL}', cachedModel);
  } else if (cachedProvider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
  } else if (cachedProvider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${cachedModel}:generateContent?key=${key}`;
  }

  return { url, key, provider: cachedProvider, model: cachedModel };
}

export function clearGeminiCache() {
  cachedKey = '';
  cachedUrlTemplate = '';
  cachedProvider = 'gemini';
  cachedModel = '';
}

export interface InventoryChange {
  productId: string;
  qty: number;
  type: 'MASUK' | 'KELUAR';
  unitCost?: number;
}

export interface GeminiResponse {
  intent: 'TRANSACTION_POST' | 'REPORT_REQUEST' | 'UNKNOWN';
  transaction?: {
    date: string;
    description: string;
    lines: {
      accountCode: string;
      debit: number;
      credit: number;
    }[];
    inventoryChanges?: InventoryChange[];
  };
  explanation: string;
  reportType?: 'LABARUGI' | 'NERACA' | 'BUKUBESAR' | 'PIUTANG' | 'PAJAK';
}

// ──────────────────────────────────────────────
// Provider-specific helpers
// ──────────────────────────────────────────────

function buildChatRequest(provider: Provider, systemPrompt: string, userText: string, opts?: { jsonMode?: boolean; temperature?: number }): object {
  const temp = opts?.temperature ?? 0.1;
  const model = cachedModel || 'gemini-2.5-flash';

  if (provider === 'openai') {
    return {
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      temperature: temp,
      ...(opts?.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    };
  }

  if (provider === 'anthropic') {
    const body: any = {
      model: model,
      max_tokens: 4096,
      system: [{ type: 'text', text: systemPrompt }],
      messages: [{ role: 'user', content: userText }],
      temperature: temp,
    };
    if (opts?.jsonMode) {
      body.messages[0].content = `${systemPrompt}\n\nInput Pengguna: "${userText}"\n\nKembalikan hanya JSON valid tanpa markdown.`;
    }
    return body;
  }

  // Gemini
  const body: any = {
    contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nInput Pengguna: "${userText}"` }] }],
    generationConfig: { temperature: temp },
  };
  if (opts?.jsonMode) {
    body.generationConfig.responseMimeType = 'application/json';
  }
  return body;
}

function buildImageRequest(provider: Provider, mimeType: string, imageData: string, textPrompt: string): object {
  const model = cachedModel || 'gemini-2.5-flash';

  if (provider === 'openai') {
    return {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: textPrompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageData}` } },
          ],
        },
      ],
      temperature: 0.1,
    };
  }

  if (provider === 'anthropic') {
    return {
      model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: textPrompt },
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageData } },
          ],
        },
      ],
      temperature: 0.1,
    };
  }

  return {
    contents: [{
      parts: [
        { inlineData: { mimeType, data: imageData } },
        { text: textPrompt },
      ],
    }],
    generationConfig: { temperature: 0.1 },
  };
}

function parseChatResponse(provider: Provider, data: any): string {
  if (provider === 'openai') {
    return data?.choices?.[0]?.message?.content || '';
  }
  if (provider === 'anthropic') {
    const content = data?.content;
    if (Array.isArray(content)) {
      return content.map((c: any) => c.text || '').join('');
    }
    return '';
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function apiFetch(url: string, provider: Provider, key: string, body: object): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider === 'openai') {
    headers['Authorization'] = `Bearer ${key}`;
  } else if (provider === 'anthropic') {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  }
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

// ──────────────────────────────────────────────
// System instruction
// ──────────────────────────────────────────────

const getSystemInstruction = (accounts: Account[], products: Product[]) => {
  const coaString = accounts.map(a => `- [${a.code}] ${a.name} (Tipe: ${a.type}, Saldo Normal: ${a.normalBalance})`).join('\n');
  const productsString = products.map(p => `- [${p.id}] ${p.name} (SKU: ${p.sku}, Stok Saat Ini: ${p.stockQty}, Harga Jual: ${p.sellingPrice})`).join('\n');

  return `Anda adalah Akunta AI, asisten CFO dan AI Akuntansi cerdas untuk UMKM di Indonesia.
Tugas Anda adalah memproses percakapan dari pemilik usaha (bahasa Indonesia) dan menerjemahkannya menjadi entri jurnal double-entry akuntansi standar, mengenali jika mereka meminta laporan keuangan, atau mengenali jika mereka membeli/menjual produk fisik.

Berikut adalah Daftar Akun (Chart of Accounts - COA):
${coaString}

Berikut adalah Daftar Produk Inventaris saat ini:
${productsString}

ATURAN PENTING:
1. Jika pengguna ingin mencatat transaksi (penjualan, pembelian, biaya, sewa, kas keluar/masuk, dll):
   - Set "intent" menjadi "TRANSACTION_POST".
   - Ekstrak "date" (format YYYY-MM-DD). Gunakan hari ini (${new Date().toISOString().split('T')[0]}) sebagai default jika tanggal tidak disebutkan.
   - Buat penjelasan singkat dan padat tanpa istilah teknis "debit/kredit" di kolom "explanation".
   - Susun baris jurnal double-entry di kolom "transaction". Total Debit dan total Kredit HARUS PERSIS SAMA (seimbang).
   - Pastikan nominal uang diekstrak dengan benar (misal: "1,5jt" = 1500000, "50rb" = 50000).
   - Hubungkan dengan Produk Fisik jika ada (misal: "jual 2 pack biji kopi" atau "beli 10 pack biji kopi"):
     * Tambahkan array "inventoryChanges" di dalam "transaction".
     * Isi "productId", "qty", "type" ('MASUK' untuk pembelian, 'KELUAR' untuk penjualan), dan "unitCost" (khusus pembelian, isi harga beli per unit yang disebutkan).
     * Jika penjualan barang dagang, catat penjualan senilai harga jualnya di Kredit Pendapatan Penjualan (4101) dan Debit Kas/Piutang. JANGAN buat baris jurnal HPP di sini, karena sistem akan membuat jurnal HPP secara otomatis di background berdasarkan average cost.
   - Ingat aturan dasar jurnal akuntansi:
     * Kas/Bank bertambah di DEBIT, berkurang di KREDIT.
     * Pendapatan bertambah di KREDIT, berkurang di DEBIT.
     * Beban bertambah di DEBIT, berkurang di KREDIT.
     * Persediaan bertambah di DEBIT (ketika beli tunai/kredit), berkurang di KREDIT.

2. Jika pengguna meminta laporan keuangan, analisis laba rugi, kondisi kesehatan bisnis, daftar piutang, atau pajak:
   - Set "intent" menjadi "REPORT_REQUEST".
   - Set "reportType" menjadi salah satu dari: "LABARUGI", "NERACA", "BUKUBESAR", "PIUTANG", "PAJAK".
   - Berikan rangkuman naratif awal atau tanggapan ramah di kolom "explanation".

3. Jika input tidak dipahami atau di luar topik akuntansi:
   - Set "intent" menjadi "UNKNOWN".
   - Berikan respon penjelasan yang ramah.

4. Anda HARUS mengembalikan respon dalam format JSON murni dengan struktur berikut:
{
  "intent": "TRANSACTION_POST" | "REPORT_REQUEST" | "UNKNOWN",
  "transaction": {
    "date": "YYYY-MM-DD",
    "description": "Keterangan deskriptif transaksi dalam bahasa Indonesia",
    "lines": [
      { "accountCode": "KODE_AKUN", "debit": number, "credit": number }
    ],
    "inventoryChanges": [
      { "productId": "id-produk", "qty": number, "type": "MASUK" | "KELUAR", "unitCost": number }
    ]
  },
  "explanation": "Penjelasan naratif ramah untuk pengguna tanpa menggunakan jargon debit/kredit.",
  "reportType": "LABARUGI" | "NERACA" | "BUKUBESAR" | "PIUTANG" | "PAJAK"
}

JANGAN sisipkan teks Markdown atau penjelasan di luar JSON tersebut. Kembalikan JSON valid saja.`;
};

// ──────────────────────────────────────────────
// Public API functions
// ──────────────────────────────────────────────

export async function extractTextFromImage(base64Image: string): Promise<string> {
  const config = await getApiConfig();
  if (!config.key) return '';

  const mimeType = base64Image.split(';')[0].replace('data:', '');
  const imageData = base64Image.split(',')[1];
  const prompt = 'Ekstrak semua informasi transaksi dari gambar ini. ' +
    'Jika ini struk/nota pembelian, sebutkan barang, jumlah, harga, dan total. ' +
    'Jika ini bukti transfer/bayar, sebutkan nominal, penerima, dan keterangan. ' +
    'Balas dengan format naratif singkat seperti contoh: "Beli 5 pack kopi susu seharga 40rb per pack tunai"';

  try {
    const body = buildImageRequest(config.provider, mimeType, imageData, prompt);
    const response = await apiFetch(config.url, config.provider, config.key, body);
    if (!response.ok) return '';
    const data = await response.json();
    return parseChatResponse(config.provider, data);
  } catch {
    return '';
  }
}

export async function parseInputWithGemini(inputText: string): Promise<GeminiResponse> {
  const accounts = await db.accounts.toArray().catch(() => DEFAULT_ACCOUNTS);
  const products = await db.products.toArray().catch(() => []);
  const systemInstruction = getSystemInstruction(accounts, products);
  const config = await getApiConfig();

  if (!config.key) {
    return runFallbackSimulator(inputText, products);
  }

  try {
    const body = buildChatRequest(config.provider, systemInstruction, inputText, { jsonMode: true });
    const response = await apiFetch(config.url, config.provider, config.key, body);

    if (!response.ok) {
      throw new Error(`API Error: Status ${response.status}`);
    }

    const result = await response.json();
    const responseText = parseChatResponse(config.provider, result);

    if (!responseText) {
      throw new Error('Respon kosong');
    }

    const cleaned = responseText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
    return JSON.parse(cleaned) as GeminiResponse;
  } catch (error) {
    console.error('Error memanggil AI API, menjalankan simulator fallback:', error);
    return runFallbackSimulator(inputText, products);
  }
}

// ──────────────────────────────────────────────
// Narrative Analysis
// ──────────────────────────────────────────────

export async function getNarrativeAnalysis(reportType: 'LABARUGI' | 'NERACA', reportData: any): Promise<string> {
  const config = await getApiConfig();
  if (!config.key) {
    return 'KESEHATAN BISNIS: TIDAK TERSEDIA\n\nAPI Key belum dikonfigurasi. Atur di Pengaturan > API Key.';
  }

  const dataString = JSON.stringify(reportData);
  const prompt = `Anda adalah CFO AI untuk pelaku UMKM. Jelaskan secara ramah, singkat, dan naratif (maksimal 4 paragraf) mengenai data laporan berikut:
Tipe Laporan: ${reportType}
Data Laporan: ${dataString}

Ketentuan Khusus:
1. Tulis judul utama di baris pertama berupa label kesehatan bisnis berdasarkan laba bersih/aset:
   - Kategori SEHAT jika laba bersih bernilai positif yang tinggi (> Rp 5.000.000 atau total laba > 15% omzet).
   - Kategori WASPADA jika laba tipis atau ada penurunan.
   - Kategori KRITIS jika laba negatif (rugi).
   Format baris pertama: "KESEHATAN BISNIS: [SEHAT / WASPADA / KRITIS]"
2. Berikan narasi yang ramah tanpa istilah teknis debit/kredit.
3. Berikan saran finansial proaktif.`;

  try {
    const body = buildChatRequest(config.provider, '', prompt, { temperature: 0.3 });
    const response = await apiFetch(config.url, config.provider, config.key, body);

    if (!response.ok) throw new Error('Narrative API error');

    const result = await response.json();
    const text = parseChatResponse(config.provider, result);
    if (text) return text;
  } catch (error) {
    console.error('Error generating narrative analysis:', error);
  }

  // Fallback: Rust health analysis
  try {
    const resultJson = await invoke<string>('analyze_report_health_rust', {
      reportType,
      reportDataJson: JSON.stringify(reportData),
    });
    const result = JSON.parse(resultJson);
    return result.narrativeText;
  } catch (err) {
    console.error('Gagal menjalankan analisis di Rust:', err);
    if (reportType === 'LABARUGI') {
      const health = reportData.netProfit > 5000000 ? 'SEHAT' : reportData.netProfit > 0 ? 'WASPADA' : 'KRITIS';
      return `KESEHATAN BISNIS: ${health}

Berdasarkan data Laba Rugi saat ini, Total Pendapatan Anda adalah Rp ${reportData.totalRevenue.toLocaleString('id-ID')} dengan Total Beban Rp ${reportData.totalExpenses.toLocaleString('id-ID')}.

Laba bersih Anda tercatat sebesar Rp ${reportData.netProfit.toLocaleString('id-ID')}. 
${health === 'SEHAT' ? 'Bisnis Anda berjalan sangat sehat! Pertahankan performa ini dan pertimbangkan untuk menaikkan kapasitas produksi.' : health === 'WASPADA' ? 'Bisnis Anda mencatat keuntungan namun dengan margin yang tipis. Coba periksa biaya operasional yang bisa dikurangi.' : 'Peringatan: Bisnis Anda mengalami kerugian operasional bulan ini. Segera evaluasi harga jual produk dan tekan pengeluaran darurat.'}`;
    } else {
      const health = reportData.totalAssets > reportData.totalLiabilities * 2 ? 'SEHAT' : 'WASPADA';
      return `KESEHATAN BISNIS: ${health}

Neraca keuangan Anda menunjukkan total kepemilikan Aset sebesar Rp ${reportData.totalAssets.toLocaleString('id-ID')}, dengan total Utang/Kewajiban Rp ${reportData.totalLiabilities.toLocaleString('id-ID')} dan Modal Pemilik Rp ${reportData.totalEquity.toLocaleString('id-ID')}.

Aset Anda seimbang dengan Kewajiban + Ekuitas. ${health === 'SEHAT' ? 'Kondisi neraca sangat baik, kepemilikan aset jauh lebih besar dari utang.' : 'Peringatan: Porsi utang Anda cukup tinggi dibanding aset yang dimiliki. Jaga likuiditas kas Anda agar pembayaran utang lancar.'}`;
    }
  }
}

// ──────────────────────────────────────────────
// Fallback Simulator (unchanged)
// ──────────────────────────────────────────────

function runFallbackSimulator(inputText: string, products: Product[]): GeminiResponse {
  const normalized = inputText.toLowerCase();
  const today = new Date().toISOString().split('T')[0];

  let amount = 0;
  const jutaMatch = normalized.match(/(\d+[,.]?\d*)\s*(jt|juta)/);
  const ribuMatch = normalized.match(/(\d+[,.]?\d*)\s*(rb|ribu)/);
  const plainMatch = normalized.match(/(\d+[\d.,]*)/);

  if (jutaMatch) {
    amount = parseFloat(jutaMatch[1].replace(',', '.')) * 1000000;
  } else if (ribuMatch) {
    amount = parseFloat(ribuMatch[1].replace(',', '.')) * 1000;
  } else if (plainMatch) {
    amount = parseFloat(plainMatch[1].replace(/[.,]/g, ''));
  }

  if (normalized.includes('laba rugi') || normalized.includes('pendapatan') || normalized.includes('biaya')) {
    return { intent: 'REPORT_REQUEST', reportType: 'LABARUGI', explanation: 'Baik, saya akan menampilkan Laba Rugi usaha Anda di sebelah kanan.' };
  }
  if (normalized.includes('neraca') || normalized.includes('aset') || normalized.includes('modal') || normalized.includes('kondisi keuangan') || normalized.includes('sehat')) {
    return { intent: 'REPORT_REQUEST', reportType: 'NERACA', explanation: 'Saya tampilkan laporan Neraca keuangan terbaru di panel kanan.' };
  }
  if (normalized.includes('piutang') || normalized.includes('belum bayar') || normalized.includes('utang')) {
    return { intent: 'REPORT_REQUEST', reportType: 'PIUTANG', explanation: 'Menampilkan ringkasan piutang dan tagihan jatuh tempo di panel kanan.' };
  }
  if (normalized.includes('pajak') || normalized.includes('ppn') || normalized.includes('pph')) {
    return { intent: 'REPORT_REQUEST', reportType: 'PAJAK', explanation: 'Menampilkan status perpajakan bulan ini di panel kanan.' };
  }

  let foundProduct: Product | undefined;
  let qty = 1;
  const qtyMatch = normalized.match(/(\d+)\s*(pack|unit|dus|pcs)/);
  if (qtyMatch) qty = parseInt(qtyMatch[1]);

  for (const p of products) {
    if (normalized.includes(p.name.toLowerCase()) || normalized.includes('kopi') && p.sku === 'KOPI-ARB' || normalized.includes('susu') && p.sku === 'MILK-UHT') {
      foundProduct = p;
      break;
    }
  }

  if (amount > 0 || foundProduct) {
    const finalAmount = amount > 0 ? amount : (foundProduct ? foundProduct.sellingPrice * qty : 0);

    if (normalized.includes('jual') || normalized.includes('penjualan') || normalized.includes('terima duit')) {
      const inventoryChanges: InventoryChange[] = [];
      if (foundProduct) inventoryChanges.push({ productId: foundProduct.id, qty, type: 'KELUAR' });
      return {
        intent: 'TRANSACTION_POST',
        transaction: { date: today, description: `Penjualan Tunai: ${qty} unit ${foundProduct ? foundProduct.name : 'Barang'}`, lines: [{ accountCode: '1101', debit: finalAmount, credit: 0 }, { accountCode: '4101', debit: 0, credit: finalAmount }], inventoryChanges },
        explanation: `Saya mendeteksi penjualan tunai sebesar Rp ${finalAmount.toLocaleString('id-ID')} untuk ${qty} unit ${foundProduct ? foundProduct.name : 'Barang'}. Apakah Anda ingin mencatatnya?`
      };
    }

    if ((normalized.includes('beli') || normalized.includes('kulakan')) && foundProduct) {
      const unitCost = amount > 0 ? Math.round(amount / qty) : foundProduct.averageCost;
      const totalCost = unitCost * qty;
      return {
        intent: 'TRANSACTION_POST',
        transaction: { date: today, description: `Pembelian Stok: ${qty} unit ${foundProduct.name}`, lines: [{ accountCode: '1105', debit: totalCost, credit: 0 }, { accountCode: '1101', debit: 0, credit: totalCost }], inventoryChanges: [{ productId: foundProduct.id, qty, type: 'MASUK', unitCost }] },
        explanation: `Saya mendeteksi pembelian persediaan ${qty} unit ${foundProduct.name} seharga Rp ${totalCost.toLocaleString('id-ID')} secara tunai. Apakah ini benar?`
      };
    }

    if (normalized.includes('bayar') || normalized.includes('beli') || normalized.includes('pengeluaran')) {
      let costAccount = '5206';
      let paymentAccount = '1101';
      if (normalized.includes('listrik') || normalized.includes('air') || normalized.includes('internet')) costAccount = '5203';
      else if (normalized.includes('gaji') || normalized.includes('karyawan')) costAccount = '5201';
      else if (normalized.includes('sewa') || normalized.includes('ruko')) costAccount = '5202';
      else if (normalized.includes('iklan') || normalized.includes('fb') || normalized.includes('google')) costAccount = '5204';
      if (normalized.includes('bca')) paymentAccount = '1102';
      else if (normalized.includes('mandiri')) paymentAccount = '1103';
      return {
        intent: 'TRANSACTION_POST',
        transaction: { date: today, description: `Pengeluaran: ${inputText}`, lines: [{ accountCode: costAccount, debit: finalAmount, credit: 0 }, { accountCode: paymentAccount, debit: 0, credit: finalAmount }] },
        explanation: `Saya mendeteksi pengeluaran biaya sebesar Rp ${finalAmount.toLocaleString('id-ID')}. Apakah ini benar?`
      };
    }
  }

  return {
    intent: 'UNKNOWN',
    explanation: 'Maaf, saya belum mengerti maksud Anda. Anda bisa mengetik sesuatu seperti "Jual 2 pack kopi susu tunai" atau "Beli 5 pack kopi seharga 40rb tunai".'
  };
}
