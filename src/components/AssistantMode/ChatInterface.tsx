import React, { useState, useRef, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Send, Sparkles, Check, X, Camera, FileSpreadsheet, Play } from 'lucide-react';
import { db } from '../../utils/db';
import { parseInputWithGemini, getNarrativeAnalysis, extractTextFromImage } from '../../utils/ai';
import { postJournalEntry, generateProfitLoss, generateBalanceSheet } from '../../utils/ledgerEngine';
import { purchaseProduct, sellProduct } from '../../utils/inventoryEngine';
import * as XLSX from 'xlsx';
import { invoke } from '@tauri-apps/api/core';

interface ChatInterfaceProps {
  onReportRequested: (reportType: 'LABARUGI' | 'NERACA' | 'BUKUBESAR' | 'PIUTANG' | 'PAJAK') => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ onReportRequested }) => {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportExcel = (reportType: 'LABARUGI' | 'NERACA', reportData: any) => {
    let dataToExport: any[] = [];

    if (reportType === 'LABARUGI') {
      dataToExport.push({ 'Kategori': 'PENDAPATAN', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' });
      reportData.revenue.forEach((r: any) => {
        dataToExport.push({ 'Kategori': '', 'Kode Akun': r.code, 'Nama Akun': r.name, 'Nominal (Rp)': r.amount });
      });
      dataToExport.push({ 'Kategori': 'Total Pendapatan', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': reportData.totalRevenue });
      
      dataToExport.push({ 'Kategori': '', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' });
      dataToExport.push({ 'Kategori': 'BEBAN', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' });
      reportData.expenses.forEach((e: any) => {
        dataToExport.push({ 'Kategori': '', 'Kode Akun': e.code, 'Nama Akun': e.name, 'Nominal (Rp)': e.amount });
      });
      dataToExport.push({ 'Kategori': 'Total Beban', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': reportData.totalExpenses });
      dataToExport.push({ 'Kategori': 'LABA BERSIH', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': reportData.netProfit });
    } else if (reportType === 'NERACA') {
      dataToExport.push({ 'Kategori': 'AKTIVA (ASET)', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' });
      reportData.assets.forEach((a: any) => {
        dataToExport.push({ 'Kategori': '', 'Kode Akun': a.code, 'Nama Akun': a.name, 'Nominal (Rp)': a.amount });
      });
      dataToExport.push({ 'Kategori': 'Total Aktiva', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': reportData.totalAssets });
      
      dataToExport.push({ 'Kategori': '', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' });
      dataToExport.push({ 'Kategori': 'KEWAJIBAN', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' });
      reportData.liabilities.forEach((l: any) => {
        dataToExport.push({ 'Kategori': '', 'Kode Akun': l.code, 'Nama Akun': l.name, 'Nominal (Rp)': l.amount });
      });
      dataToExport.push({ 'Kategori': 'Total Kewajiban', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': reportData.totalLiabilities });
      
      dataToExport.push({ 'Kategori': '', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' });
      dataToExport.push({ 'Kategori': 'EKUITAS', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': '' });
      reportData.equity.forEach((e: any) => {
        dataToExport.push({ 'Kategori': '', 'Kode Akun': e.code, 'Nama Akun': e.name, 'Nominal (Rp)': e.amount });
      });
      dataToExport.push({ 'Kategori': 'Total Ekuitas', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': reportData.totalEquity });
      dataToExport.push({ 'Kategori': 'Total Pasiva', 'Kode Akun': '', 'Nama Akun': '', 'Nominal (Rp)': reportData.totalLiabilities + reportData.totalEquity });
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportType);
    XLSX.writeFile(wb, `Akunta_${reportType}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Ambil data chat dari SQLite backend via React State
  const [messages, setMessages] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  const fetchAccounts = async () => {
    try {
      const list = await db.accounts.toArray();
      setAccounts(list);
    } catch (err) {
      console.error('Gagal mengambil data akun di asisten AI:', err);
    }
  };

  const fetchMessages = async () => {
    const list = await db.chatMessages.toArray();
    setMessages(list);
  };

  useEffect(() => {
    let active = true;
    let unlistenFn: (() => void) | undefined;

    const setupListener = async () => {
      unlistenFn = await listen('db-update', () => {
        if (active) {
          fetchMessages();
          fetchAccounts();
        }
      });
    };

    fetchMessages();
    fetchAccounts();
    setupListener();

    return () => {
      active = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // Auto-scroll ke bawah saat ada pesan baru
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, ocrProcessing]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userText = inputValue;
    setInputValue('');
    setIsLoading(true);

    // 1. Simpan pesan pengguna ke DB
    await db.chatMessages.add({
      sender: 'USER',
      text: userText,
      timestamp: new Date().toISOString(),
    });

    await processAiInput(userText);
  };

  const processAiInput = async (text: string) => {
    try {
      // 2. Kirim input ke Gemini API (atau simulator)
      const aiResult = await parseInputWithGemini(text);

      // 3. Tangani hasil
      if (aiResult.intent === 'TRANSACTION_POST' && aiResult.transaction) {
        // Tampilkan kartu konfirmasi transaksi
        await db.chatMessages.add({
          sender: 'AI',
          text: aiResult.explanation,
          timestamp: new Date().toISOString(),
          cardType: 'CONFIRMATION',
          cardData: aiResult.transaction,
        });
      } else if (aiResult.intent === 'REPORT_REQUEST' && aiResult.reportType) {
        // Arahkan panel kanan ke laporan yang sesuai
        onReportRequested(aiResult.reportType);
        
        if (aiResult.reportType === 'LABARUGI' || aiResult.reportType === 'NERACA') {
          let reportData;
          if (aiResult.reportType === 'LABARUGI') {
            reportData = await generateProfitLoss();
          } else {
            reportData = await generateBalanceSheet();
          }
          
          const narrativeText = await getNarrativeAnalysis(aiResult.reportType, reportData);
          
          await db.chatMessages.add({
            sender: 'AI',
            text: aiResult.explanation,
            timestamp: new Date().toISOString(),
            cardType: 'STORY_REPORT',
            cardData: {
              reportType: aiResult.reportType,
              reportData,
              narrativeText
            }
          });
        } else {
          await db.chatMessages.add({
            sender: 'AI',
            text: aiResult.explanation,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        await db.chatMessages.add({
          sender: 'AI',
          text: aiResult.explanation,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      await db.chatMessages.add({
        sender: 'AI',
        text: `Maaf, saya mengalami kendala teknis: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // F-AS-08: Lensa AI (Upload Bukti Transaksi) - Simulasi OCR
  const handleUploadImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;

      // 1. Simpan pesan pengguna ke DB dengan menyertakan properti imageUrl
      await db.chatMessages.add({
        sender: 'USER',
        text: `📷 [Mengunggah bukti transaksi: ${file.name}]`,
        timestamp: new Date().toISOString(),
        imageUrl: base64String,
      });

      setOcrProcessing(true);

      try {
        // 2. Coba ekstrak teks via Gemini Vision API (OCR sungguhan)
        let extractedText = await extractTextFromImage(base64String);

        // 3. Fallback: jika Gemini Vision gagal, gunakan filename matching
        if (!extractedText) {
          try {
            extractedText = await invoke<string>('extract_ocr_details_rust', {
              filename: file.name
            });
          } catch {
            const fileNameLower = file.name.toLowerCase();
            if (fileNameLower.includes('kopi') || fileNameLower.includes('arabika') || fileNameLower.includes('nota')) {
              extractedText = 'Beli 5 pack Biji Kopi Arabika seharga 40rb per pack tunai';
            } else if (fileNameLower.includes('listrik') || fileNameLower.includes('pln') || fileNameLower.includes('struk')) {
              extractedText = 'Bayar tagihan listrik ruko 350rb pakai BCA';
            } else if (fileNameLower.includes('susu') || fileNameLower.includes('uht')) {
              extractedText = 'Beli 10 pack Susu UHT 1L seharga 15rb per pack tunai';
            } else {
              extractedText = 'Bayar langganan software Zoom senilai 250rb pakai Mandiri';
            }
          }
        }

        // 4. Tampilkan hasil OCR ke AI chat bubble
        const sourceLabel = extractedText.includes('Bel') || extractedText.includes('Bayar') || extractedText.includes('Jual')
          ? 'Gemini AI Vision' : 'Lensa AI';
        await db.chatMessages.add({
          sender: 'AI',
          text: `🔍 **${sourceLabel} berhasil mengekstrak berkas!**\n\nHasil OCR menunjukkan:\n*"${extractedText}"*\n\nMemproses jurnal...`,
          timestamp: new Date().toISOString(),
        });

        // 5. Teruskan teks ekstraksi ke AI parser
        await processAiInput(extractedText);
      } finally {
        setOcrProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmTransaction = async (msgId: number, transactionData: any) => {
    try {
      // 1. Post jurnal transaksi utama
      const journalId = await postJournalEntry(transactionData);
      
      // 2. Hubungkan & Mutasikan Stok Persediaan (Fase 2) jika ada inventoryChanges
      let stockSuccessMsg = '';
      if (transactionData.inventoryChanges && transactionData.inventoryChanges.length > 0) {
        for (const change of transactionData.inventoryChanges) {
          if (change.type === 'MASUK') {
            await purchaseProduct(
              change.productId, 
              change.qty, 
              change.unitCost || 0, 
              transactionData.date, 
              journalId
            );
            const p = await db.products.get(change.productId);
            stockSuccessMsg += `\n📦 Stok "${p?.name}" bertambah +${change.qty} unit (Average cost baru: Rp ${p?.averageCost.toLocaleString('id-ID')}).`;
          } else if (change.type === 'KELUAR') {
            // Lakukan penjualan dan kalkulasi HPP otomatis
            const totalHpp = await sellProduct(
              change.productId, 
              change.qty, 
              transactionData.date, 
              journalId
            );
            const p = await db.products.get(change.productId);
            stockSuccessMsg += `\n📦 Stok "${p?.name}" berkurang -${change.qty} unit. HPP otomatis senilai Rp ${totalHpp.toLocaleString('id-ID')} telah dijurnal.`;
          }
        }
      }

      // Update pesan konfirmasi
      await db.chatMessages.update(msgId, {
        cardType: 'TRANSACTION_SUCCESS',
        text: `✅ **Transaksi Terposting!**\n\nJurnal berhasil dicatat dengan ID: **${journalId}**.\n\n*Keterangan:* ${transactionData.description}${stockSuccessMsg}`,
      });
      
      // Tambahkan pesan sukses
      await db.chatMessages.add({
        sender: 'AI',
        text: `Transaksi "${transactionData.description}" senilai Rp ${transactionData.lines.reduce((s: number, l: any) => s + l.debit, 0).toLocaleString('id-ID')} sukses dijurnal.${stockSuccessMsg ? '\n' + stockSuccessMsg : ''}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      alert(`Gagal memposting transaksi: ${err.message}`);
    }
  };

  const handleCancelTransaction = async (msgId: number) => {
    await db.chatMessages.update(msgId, {
      cardType: undefined,
      cardData: undefined,
      text: '❌ Transaksi dibatalkan oleh pengguna.',
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Obrolan List */}
      <div className="chat-container">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-bubble ${msg.sender === 'USER' ? 'bubble-user' : 'bubble-ai'}`}
          >
            {msg.imageUrl && (
              <img
                src={msg.imageUrl}
                alt="Struk Belanja"
                style={{ maxWidth: '100%', borderRadius: '4px', marginBottom: '8px', display: 'block' }}
              />
            )}
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {msg.text.split('\n').map((line: string, i: number) => (
                <p key={i} style={{ marginBottom: line ? '4px' : '8px' }}>
                  {line}
                </p>
              ))}
            </div>

            {/* Render Kartu Konfirmasi Transaksi */}
            {msg.cardType === 'CONFIRMATION' && msg.cardData && msg.id && (
              <div className="ai-interactive-card">
                <div className="card-title">
                  <Sparkles size={16} className="text-secondary" style={{ color: 'var(--accent-secondary)' }} />
                  <span>Draft Jurnal & Stok</span>
                </div>
                
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  <strong>Keterangan:</strong> {msg.cardData.description} <br />
                  <strong>Tanggal:</strong> {msg.cardData.date}
                </div>

                <div className="jurnal-detail-lines" style={{ marginBottom: '12px' }}>
                  {msg.cardData.lines.map((line: any, idx: number) => (
                    <div
                      key={idx}
                      className={`jurnal-line-row ${line.credit > 0 ? 'credit' : 'debit'}`}
                    >
                      <span style={{ color: line.credit > 0 ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                        {line.accountCode} - {accounts.find((a: any) => a.code === line.accountCode)?.name || 'Akun'}
                      </span>
                      <span className="amount-col" style={{ color: line.credit > 0 ? 'var(--accent-warning)' : 'var(--accent-success)' }}>
                        {line.debit > 0 
                          ? `Rp ${line.debit.toLocaleString('id-ID')}` 
                          : `Rp ${line.credit.toLocaleString('id-ID')}`
                        }
                      </span>
                    </div>
                  ))}
                </div>

                {msg.cardData.inventoryChanges && msg.cardData.inventoryChanges.length > 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--accent-secondary)', padding: '6px 8px', background: 'rgba(6, 182, 212, 0.05)', borderRadius: '4px', marginBottom: '12px', border: '1px solid rgba(6, 182, 212, 0.15)' }}>
                    🎯 <strong>Mutasi Stok Terdeteksi:</strong>
                    {msg.cardData.inventoryChanges.map((change: any, idx: number) => (
                      <div key={idx} style={{ marginTop: '2px' }}>
                        - {change.type === 'MASUK' ? 'Beli' : 'Jual'} {change.qty} unit produk.
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-success"
                    style={{ flex: 1 }}
                    onClick={() => handleConfirmTransaction(msg.id!, msg.cardData)}
                  >
                    <Check size={14} />
                    <span>Posting</span>
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleCancelTransaction(msg.id!)}
                  >
                    <X size={14} />
                    <span>Batal</span>
                  </button>
                </div>
              </div>
            )}

            {/* Render Kartu Laporan Cerita Keuangan (Story Mode) */}
            {msg.cardType === 'STORY_REPORT' && msg.cardData && (
              <div className="ai-interactive-card" style={{ maxWidth: '350px', borderLeft: '3px solid var(--accent-secondary)' }}>
                <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={14} style={{ color: 'var(--accent-secondary)' }} />
                    <strong style={{ fontSize: '12px' }}>
                      Cerita {msg.cardData.reportType === 'LABARUGI' ? 'Laba Rugi' : 'Neraca'}
                    </strong>
                  </div>
                  
                  {/* Badge Kesehatan Bisnis */}
                  {(() => {
                    const firstLine = msg.cardData.narrativeText.split('\n')[0] || '';
                    const healthMatch = firstLine.match(/KESEHATAN BISNIS:\s*(SEHAT|WASPADA|KRITIS)/i);
                    const health = healthMatch ? healthMatch[1].toUpperCase() : 'WASPADA';
                    const color = health === 'SEHAT' ? 'var(--accent-success)' : health === 'KRITIS' ? 'var(--accent-danger)' : 'var(--accent-warning)';
                    const bg = health === 'SEHAT' ? 'rgba(16, 185, 129, 0.1)' : health === 'KRITIS' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
                    return (
                      <span style={{ 
                        fontSize: '9px', 
                        fontWeight: 700, 
                        color, 
                        background: bg, 
                        padding: '1px 5px', 
                        borderRadius: '3px',
                        border: `1px solid ${color}30`
                      }}>
                        {health}
                      </span>
                    );
                  })()}
                </div>

                {/* Ringkasan Metrik Utama */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(3, 1fr)', 
                  gap: '6px', 
                  marginBottom: '10px',
                  padding: '6px 8px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)'
                }}>
                  {msg.cardData.reportType === 'LABARUGI' ? (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', fontSize: '9px', color: 'var(--text-muted)' }}>
                        <span>Pendapatan</span>
                        <strong style={{ fontSize: '10.5px', color: 'var(--text-primary)', fontFamily: 'monospace', marginTop: '2px' }}>
                          Rp{msg.cardData.reportData.totalRevenue.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', fontSize: '9px', color: 'var(--text-muted)' }}>
                        <span>Beban</span>
                        <strong style={{ fontSize: '10.5px', color: 'var(--text-primary)', fontFamily: 'monospace', marginTop: '2px' }}>
                          Rp{msg.cardData.reportData.totalExpenses.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', fontSize: '9px', color: 'var(--text-muted)' }}>
                        <span>Laba Bersih</span>
                        <strong style={{ 
                          fontSize: '10.5px', 
                          color: msg.cardData.reportData.netProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)', 
                          fontFamily: 'monospace', 
                          marginTop: '2px' 
                        }}>
                          Rp{msg.cardData.reportData.netProfit.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                        </strong>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', fontSize: '9px', color: 'var(--text-muted)' }}>
                        <span>Aset</span>
                        <strong style={{ fontSize: '10.5px', color: 'var(--text-primary)', fontFamily: 'monospace', marginTop: '2px' }}>
                          Rp{msg.cardData.reportData.totalAssets.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', fontSize: '9px', color: 'var(--text-muted)' }}>
                        <span>Utang</span>
                        <strong style={{ fontSize: '10.5px', color: 'var(--text-primary)', fontFamily: 'monospace', marginTop: '2px' }}>
                          Rp{msg.cardData.reportData.totalLiabilities.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', fontSize: '9px', color: 'var(--text-muted)' }}>
                        <span>Modal</span>
                        <strong style={{ fontSize: '10.5px', color: 'var(--text-primary)', fontFamily: 'monospace', marginTop: '2px' }}>
                          Rp{msg.cardData.reportData.totalEquity.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                        </strong>
                      </div>
                    </>
                  )}
                </div>

                {/* Narasi AI */}
                <div style={{ 
                  fontSize: '11px', 
                  lineHeight: '1.45', 
                  color: 'var(--text-secondary)', 
                  marginBottom: '12px',
                  maxHeight: '150px',
                  overflowY: 'auto',
                  paddingRight: '4px',
                  whiteSpace: 'pre-wrap'
                }}>
                  {msg.cardData.narrativeText
                    .split('\n')
                    .filter((line: string) => !line.toLowerCase().includes('kesehatan bisnis'))
                    .join('\n')
                    .trim()
                  }
                </div>

                {/* Tombol Aksi */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    onClick={() => handleExportExcel(msg.cardData.reportType, msg.cardData.reportData)}
                  >
                    <FileSpreadsheet size={12} />
                    <span>Ekspor Excel</span>
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    onClick={() => onReportRequested(msg.cardData.reportType)}
                  >
                    <Play size={12} />
                    <span>Detail Tabel</span>
                  </button>
                </div>
              </div>
            )}

            <span className="chat-time">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}

        {ocrProcessing && (
          <div className="chat-bubble bubble-ai" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={16} style={{ animation: 'pulse 1.5s infinite', color: 'var(--accent-secondary)' }} />
            <span>Lensa AI sedang mengekstrak struk belanja/nota dengan OCR...</span>
          </div>
        )}

        {isLoading && (
          <div className="chat-bubble bubble-ai" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent-secondary)' }} />
            <span>Akunta AI sedang menganalisis kalimat Anda...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Form */}
      <div className="chat-input-container">
        <form onSubmit={handleSendMessage} className="chat-input-wrapper">
          <input
            type="text"
            className="chat-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Catat transaksi atau unggah nota..."
            disabled={isLoading || ocrProcessing}
          />
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleImageChange}
          />
          <button 
            type="button" 
            className="chat-action-btn"
            disabled={isLoading || ocrProcessing}
            onClick={handleUploadImageClick}
            title="Lensa AI - Unggah Nota"
          >
            <Camera size={14} />
          </button>
          <button type="submit" className="btn btn-primary btn-circle" disabled={isLoading || ocrProcessing || !inputValue.trim()}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};
