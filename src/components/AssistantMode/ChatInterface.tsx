import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Send, Sparkles, Check, X, Camera } from 'lucide-react';
import { db, DEFAULT_ACCOUNTS } from '../../utils/db';
import { parseInputWithGemini } from '../../utils/gemini';
import { postJournalEntry } from '../../utils/ledgerEngine';
import { purchaseProduct, sellProduct } from '../../utils/inventoryEngine';

interface ChatInterfaceProps {
  onReportRequested: (reportType: 'LABARUGI' | 'NERACA' | 'BUKUBESAR' | 'PIUTANG' | 'PAJAK') => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ onReportRequested }) => {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ambil data chat dari IndexedDB
  const messages = useLiveQuery(() => db.chatMessages.toArray()) || [];

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
        
        await db.chatMessages.add({
          sender: 'AI',
          text: aiResult.explanation,
          timestamp: new Date().toISOString(),
        });
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

    setOcrProcessing(true);
    
    // Tampilkan pratinjau unggahan di chat
    await db.chatMessages.add({
      sender: 'USER',
      text: `📷 [Mengunggah bukti transaksi: ${file.name}]`,
      timestamp: new Date().toISOString(),
    });

    // Simulasi pemrosesan OCR 2.5 detik
    setTimeout(async () => {
      setOcrProcessing(false);
      setIsLoading(true);

      // Pilih teks simulasi berdasarkan nama berkas agar demo terasa sangat realistik
      let ocrSimulatedText = 'Bayar langganan software Zoom senilai 250rb pakai Mandiri';
      const fileNameLower = file.name.toLowerCase();

      if (fileNameLower.includes('kopi') || fileNameLower.includes('arabika') || fileNameLower.includes('nota')) {
        ocrSimulatedText = 'Beli 5 pack Biji Kopi Arabika seharga 40rb per pack tunai';
      } else if (fileNameLower.includes('listrik') || fileNameLower.includes('pln') || fileNameLower.includes('struk')) {
        ocrSimulatedText = 'Bayar tagihan listrik ruko 350rb pakai BCA';
      } else if (fileNameLower.includes('susu') || fileNameLower.includes('uht')) {
        ocrSimulatedText = 'Beli 10 pack Susu UHT 1L seharga 15rb per pack tunai';
      }

      await db.chatMessages.add({
        sender: 'AI',
        text: `🔍 **Lensa AI berhasil mengekstrak berkas!**\n\nHasil OCR menunjukkan nota belanja:\n*"${ocrSimulatedText}"*\n\nMemproses jurnal...`,
        timestamp: new Date().toISOString(),
      });

      await processAiInput(ocrSimulatedText);
    }, 2500);
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
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {msg.text.split('\n').map((line, i) => (
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
                        {line.accountCode} - {line.credit > 0 ? '   ' : ''}
                        {DEFAULT_ACCOUNTS.find((a: any) => a.code === line.accountCode)?.name || 'Akun'}
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
            className="btn btn-secondary btn-circle" 
            style={{ marginRight: '6px', background: 'transparent', border: 'none' }}
            disabled={isLoading || ocrProcessing}
            onClick={handleUploadImageClick}
            title="Lensa AI - Unggah Nota"
          >
            <Camera size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <button type="submit" className="btn btn-primary btn-circle" disabled={isLoading || ocrProcessing || !inputValue.trim()}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};
