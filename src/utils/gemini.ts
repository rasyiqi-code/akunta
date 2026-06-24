import type { Account, Product } from '../types/ledger';
import { db, DEFAULT_ACCOUNTS } from './db';
import { invoke } from '@tauri-apps/api/core';

const GEMINI_API_KEY = 'AIzaSyBTZUtGC43Z9APtBDrGZAnClsjqjAqt4QU';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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
    inventoryChanges?: InventoryChange[]; // Melacak perubahan stok produk fisik jika ada
  };
  explanation: string;
  reportType?: 'LABARUGI' | 'NERACA' | 'BUKUBESAR' | 'PIUTANG' | 'PAJAK';
}

// Buat instruksi sistem yang menyertakan COA dan daftar produk inventaris
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

// Fungsi memanggil API Gemini
export async function parseInputWithGemini(inputText: string): Promise<GeminiResponse> {
  const accounts = await db.accounts.toArray().catch(() => DEFAULT_ACCOUNTS);
  const products = await db.products.toArray().catch(() => []);
  const systemInstruction = getSystemInstruction(accounts, products);

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${systemInstruction}\n\nInput Pengguna: "${inputText}"` }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API Error: Status ${response.status}`);
    }

    const result = await response.json();
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!responseText) {
      throw new Error('Respon Gemini kosong');
    }

    const parsedJson = JSON.parse(responseText.trim()) as GeminiResponse;
    return parsedJson;

  } catch (error) {
    console.error('Error memanggil Gemini API, menjalankan simulator fallback:', error);
    return runFallbackSimulator(inputText, products);
  }
}

// Simulator Fallback jika API gagal atau offline (rule-based)
function runFallbackSimulator(inputText: string, products: Product[]): GeminiResponse {
  const normalized = inputText.toLowerCase();
  const today = new Date().toISOString().split('T')[0];

  // Ekstraksi nominal angka sederhana
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

  // Cek jika menanyakan laporan
  if (normalized.includes('laba rugi') || normalized.includes('pendapatan') || normalized.includes('biaya')) {
    return {
      intent: 'REPORT_REQUEST',
      reportType: 'LABARUGI',
      explanation: 'Baik, saya akan menampilkan Laba Rugi usaha Anda di sebelah kanan.'
    };
  }
  if (normalized.includes('neraca') || normalized.includes('aset') || normalized.includes('modal') || normalized.includes('kondisi keuangan') || normalized.includes('sehat')) {
    return {
      intent: 'REPORT_REQUEST',
      reportType: 'NERACA',
      explanation: 'Saya tampilkan laporan Neraca keuangan terbaru di panel kanan.'
    };
  }
  if (normalized.includes('piutang') || normalized.includes('belum bayar') || normalized.includes('utang')) {
    return {
      intent: 'REPORT_REQUEST',
      reportType: 'PIUTANG',
      explanation: 'Menampilkan ringkasan piutang dan tagihan jatuh tempo di panel kanan.'
    };
  }
  if (normalized.includes('pajak') || normalized.includes('ppn') || normalized.includes('pph')) {
    return {
      intent: 'REPORT_REQUEST',
      reportType: 'PAJAK',
      explanation: 'Menampilkan status perpajakan bulan ini di panel kanan.'
    };
  }

  // Cari apakah ada nama produk demo dalam kalimat
  let foundProduct: Product | undefined;
  let qty = 1;
  const qtyMatch = normalized.match(/(\d+)\s*(pack|unit|dus|pcs)/);
  if (qtyMatch) {
    qty = parseInt(qtyMatch[1]);
  }

  for (const p of products) {
    if (normalized.includes(p.name.toLowerCase()) || normalized.includes('kopi') && p.sku === 'KOPI-ARB' || normalized.includes('susu') && p.sku === 'MILK-UHT') {
      foundProduct = p;
      break;
    }
  }

  // Deteksi pencatatan sederhana
  if (amount > 0 || foundProduct) {
    const finalAmount = amount > 0 ? amount : (foundProduct ? foundProduct.sellingPrice * qty : 0);

    // 1. Penjualan Produk / Jasa
    if (normalized.includes('jual') || normalized.includes('penjualan') || normalized.includes('terima duit')) {
      const inventoryChanges: InventoryChange[] = [];
      if (foundProduct) {
        inventoryChanges.push({
          productId: foundProduct.id,
          qty,
          type: 'KELUAR'
        });
      }

      return {
        intent: 'TRANSACTION_POST',
        transaction: {
          date: today,
          description: `Penjualan Tunai: ${qty} unit ${foundProduct ? foundProduct.name : 'Barang'}`,
          lines: [
            { accountCode: '1101', debit: finalAmount, credit: 0 }, // Kas Masuk
            { accountCode: '4101', debit: 0, credit: finalAmount }  // Pendapatan Penjualan
          ],
          inventoryChanges
        },
        explanation: `Saya mendeteksi penjualan tunai sebesar Rp ${finalAmount.toLocaleString('id-ID')} untuk ${qty} unit ${foundProduct ? foundProduct.name : 'Barang'}. Apakah Anda ingin mencatatnya?`
      };
    }

    // 2. Pembelian Produk (Inventory)
    if ((normalized.includes('beli') || normalized.includes('kulakan')) && foundProduct) {
      const unitCost = amount > 0 ? Math.round(amount / qty) : foundProduct.averageCost;
      const totalCost = unitCost * qty;

      return {
        intent: 'TRANSACTION_POST',
        transaction: {
          date: today,
          description: `Pembelian Stok: ${qty} unit ${foundProduct.name}`,
          lines: [
            { accountCode: '1105', debit: totalCost, credit: 0 }, // Debit Persediaan
            { accountCode: '1101', debit: 0, credit: totalCost }  // Kredit Kas
          ],
          inventoryChanges: [
            {
              productId: foundProduct.id,
              qty,
              type: 'MASUK',
              unitCost
            }
          ]
        },
        explanation: `Saya mendeteksi pembelian persediaan ${qty} unit ${foundProduct.name} seharga Rp ${totalCost.toLocaleString('id-ID')} secara tunai. Apakah ini benar?`
      };
    }

    // 3. Pembayaran Biaya Umum
    if (normalized.includes('bayar') || normalized.includes('beli') || normalized.includes('pengeluaran')) {
      let costAccount = '5206';
      let paymentAccount = '1101';

      if (normalized.includes('listrik') || normalized.includes('air') || normalized.includes('internet')) {
        costAccount = '5203';
      } else if (normalized.includes('gaji') || normalized.includes('karyawan')) {
        costAccount = '5201';
      } else if (normalized.includes('sewa') || normalized.includes('ruko')) {
        costAccount = '5202';
      } else if (normalized.includes('iklan') || normalized.includes('fb') || normalized.includes('google')) {
        costAccount = '5204';
      }

      if (normalized.includes('bca')) {
        paymentAccount = '1102';
      } else if (normalized.includes('mandiri')) {
        paymentAccount = '1103';
      }

      return {
        intent: 'TRANSACTION_POST',
        transaction: {
          date: today,
          description: `Pengeluaran: ${inputText}`,
          lines: [
            { accountCode: costAccount, debit: finalAmount, credit: 0 },
            { accountCode: paymentAccount, debit: 0, credit: finalAmount }
          ]
        },
        explanation: `Saya mendeteksi pengeluaran biaya sebesar Rp ${finalAmount.toLocaleString('id-ID')}. Apakah ini benar?`
      };
    }
  }

  return {
    intent: 'UNKNOWN',
    explanation: 'Maaf, saya belum mengerti maksud Anda. Anda bisa mengetik sesuatu seperti "Jual 2 pack kopi susu tunai" atau "Beli 5 pack kopi seharga 40rb tunai".'
  };
}

// Analisis Laporan Keuangan (Story Mode) dengan visualisasi status kesehatan
export async function getNarrativeAnalysis(reportType: 'LABARUGI' | 'NERACA', reportData: any): Promise<string> {
  try {
    const dataString = JSON.stringify(reportData);
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Anda adalah CFO AI untuk pelaku UMKM. Jelaskan secara ramah, singkat, dan naratif (maksimal 4 paragraf) mengenai data laporan berikut:
                Tipe Laporan: ${reportType}
                Data Laporan: ${dataString}
                
                Ketentuan Khusus:
                1. Tulis judul utama di baris pertama berupa label kesehatan bisnis berdasarkan laba bersih/aset:
                   - Kategori SEHAT jika laba bersih bernilai positif yang tinggi (> Rp 5.000.000 atau total laba > 15% omzet).
                   - Kategori WASPADA jika laba tipis atau ada penurunan.
                   - Kategori KRITIS jika laba negatif (rugi).
                   Format baris pertama: "KESEHATAN BISNIS: [SEHAT / WASPADA / KRITIS]"
                2. Berikan narasi yang ramah tanpa istilah teknis debit/kredit.
                3. Berikan saran finansial proaktif.`
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) throw new Error('Narrative API error');
    
    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || 'Gagal menghasilkan narasi analisis.';
  } catch (error) {
    console.error('Error generating narrative analysis:', error);
    
    // Panggil analisis kesehatan laporan di Rust native backend
    try {
      const resultJson = await invoke<string>('analyze_report_health_rust', {
        reportType,
        reportDataJson: JSON.stringify(reportData)
      });
      const result = JSON.parse(resultJson);
      return result.narrativeText;
    } catch (err) {
      console.error('Gagal menjalankan analisis di Rust:', err);
      // Fallback local logic TS jika Rust juga gagal
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
}
