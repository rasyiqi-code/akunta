import type { Account } from '../types/ledger';
import { db, DEFAULT_ACCOUNTS } from './db';

const GEMINI_API_KEY = 'AIzaSyBTZUtGC43Z9APtBDrGZAnClsjqjAqt4QU';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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
  };
  explanation: string;
  reportType?: 'LABARUGI' | 'NERACA' | 'BUKUBESAR' | 'PIUTANG' | 'PAJAK';
}

// Buat instruksi sistem yang akan memandu model
const getSystemInstruction = (accounts: Account[]) => {
  const coaString = accounts.map(a => `- [${a.code}] ${a.name} (Tipe: ${a.type}, Saldo Normal: ${a.normalBalance})`).join('\n');
  
  return `Anda adalah Akunta AI, asisten CFO dan AI Akuntansi cerdas untuk UMKM di Indonesia.
Tugas Anda adalah memproses percakapan dari pemilik usaha (bahasa Indonesia) dan menerjemahkannya menjadi entri jurnal double-entry akuntansi standar atau mengenali jika mereka meminta laporan keuangan.

Berikut adalah Daftar Akun (Chart of Accounts - COA) resmi yang digunakan di sistem ini:
${coaString}

ATURAN PENTING:
1. Jika pengguna ingin mencatat transaksi (penjualan, pembelian, biaya, sewa, kas keluar/masuk, dll):
   - Set "intent" menjadi "TRANSACTION_POST".
   - Ekstrak "date" (format YYYY-MM-DD). Gunakan hari ini (${new Date().toISOString().split('T')[0]}) sebagai default jika tanggal tidak disebutkan.
   - Buat penjelasan singkat dan padat tanpa istilah teknis "debit/kredit" di kolom "explanation".
   - Susun baris jurnal double-entry di kolom "transaction". Total Debit dan total Kredit HARUS PERSIS SAMA (seimbang).
   - Pastikan nominal uang diekstrak dengan benar (misal: "1,5jt" = 1500000, "50rb" = 50000, "100 ribu" = 100000).
   - Ingat aturan dasar akuntansi:
     * Kas/Bank bertambah di DEBIT, berkurang di KREDIT.
     * Pendapatan bertambah di KREDIT, berkurang di DEBIT.
     * Beban bertambah di DEBIT, berkurang di KREDIT.
     * Piutang bertambah di DEBIT (ketika jual kredit), berkurang di KREDIT (ketika terima pelunasan).
     * Utang bertambah di KREDIT (ketika beli kredit), berkurang di DEBIT (ketika bayar utang).

2. Jika pengguna meminta laporan keuangan, analisis laba rugi, kondisi kesehatan bisnis, daftar piutang, atau pajak:
   - Set "intent" menjadi "REPORT_REQUEST".
   - Set "reportType" menjadi salah satu dari: "LABARUGI", "NERACA", "BUKUBESAR", "PIUTANG", "PAJAK".
   - Berikan rangkuman naratif awal atau tanggapan ramah di kolom "explanation".

3. Jika input tidak dipahami atau di luar topik akuntansi:
   - Set "intent" menjadi "UNKNOWN".
   - Berikan respon penjelasan yang ramah dan tanyakan apa yang ingin dicatat.

4. Anda HARUS mengembalikan respon dalam format JSON murni dengan struktur berikut:
{
  "intent": "TRANSACTION_POST" | "REPORT_REQUEST" | "UNKNOWN",
  "transaction": {
    "date": "YYYY-MM-DD",
    "description": "Keterangan deskriptif transaksi dalam bahasa Indonesia",
    "lines": [
      { "accountCode": "KODE_AKUN", "debit": number, "credit": number }
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
  const systemInstruction = getSystemInstruction(accounts);

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
          temperature: 0.1, // Temperature rendah untuk konsistensi JSON
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
    return runFallbackSimulator(inputText, accounts);
  }
}

// Simulator Fallback jika API gagal atau offline (rule-based)
function runFallbackSimulator(inputText: string, _accounts: Account[]): GeminiResponse {
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
  if (normalized.includes('neraca') || normalized.includes('aset') || normalized.includes('modal') || normalized.includes('kondisi keuangan')) {
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

  // Deteksi pencatatan sederhana
  if (amount > 0) {
    // 1. Penjualan Tunai ("jual latte 40rb tunai")
    if (normalized.includes('jual') || normalized.includes('penjualan') || normalized.includes('terima duit')) {
      return {
        intent: 'TRANSACTION_POST',
        transaction: {
          date: today,
          description: `Penjualan Tunai: ${inputText}`,
          lines: [
            { accountCode: '1101', debit: amount, credit: 0 }, // Kas Masuk
            { accountCode: '4101', debit: 0, credit: amount }  // Pendapatan Penjualan
          ]
        },
        explanation: `Saya mendeteksi penjualan tunai sebesar Rp ${amount.toLocaleString('id-ID')}. Apakah Anda ingin mencatatnya?`
      };
    }

    // 2. Pembayaran Biaya ("bayar listrik 1.5jt")
    if (normalized.includes('bayar') || normalized.includes('beli') || normalized.includes('pengeluaran')) {
      let costAccount = '5206'; // Operasional Lainnya
      let paymentAccount = '1101'; // Kas Utama

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
            { accountCode: costAccount, debit: amount, credit: 0 },
            { accountCode: paymentAccount, debit: 0, credit: amount }
          ]
        },
        explanation: `Saya mendeteksi pengeluaran biaya sebesar Rp ${amount.toLocaleString('id-ID')}. Apakah ini benar?`
      };
    }
  }

  return {
    intent: 'UNKNOWN',
    explanation: 'Maaf, saya belum mengerti maksud Anda. Anda bisa mengetik sesuatu seperti "Jual tunai 100 ribu" atau "Bayar listrik 500rb pakai BCA".'
  };
}

// Fungsi meminta analisis penjelasan narasi dari Gemini untuk laporan laba rugi
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
                text: `Anda adalah CFO AI untuk pelaku UMKM. Jelaskan secara ramah, singkat, dan naratif (maksimal 4 paragraf/bullet points) mengenai data laporan berikut:
                Tipe Laporan: ${reportType}
                Data Laporan: ${dataString}
                
                Tulis dalam bahasa Indonesia yang membumi tanpa jargon rumit debit/kredit. Berikan nasihat finansial proaktif jika ada masalah (seperti pengeluaran yang tinggi atau profit tipis).`
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
    if (reportType === 'LABARUGI') {
      return `Berdasarkan data Laba Rugi saat ini, Total Pendapatan Anda adalah Rp ${reportData.totalRevenue.toLocaleString('id-ID')} dengan Total Beban Rp ${reportData.totalExpenses.toLocaleString('id-ID')}. \n\nLaba bersih Anda tercatat sebesar Rp ${reportData.netProfit.toLocaleString('id-ID')}. Secara umum kondisi operasional berjalan normal, terus monitor biaya bulanan Anda untuk menjaga margin tetap optimal.`;
    } else {
      return `Neraca Anda menunjukkan Total Aset sebesar Rp ${reportData.totalAssets.toLocaleString('id-ID')}, dengan Kewajiban Rp ${reportData.totalLiabilities.toLocaleString('id-ID')} dan Ekuitas Rp ${reportData.totalEquity.toLocaleString('id-ID')}. \n\nAset Anda seimbang dengan Kewajiban + Ekuitas Anda. Pastikan likuiditas kas Anda cukup untuk menutupi kewajiban jangka pendek.`;
    }
  }
}
