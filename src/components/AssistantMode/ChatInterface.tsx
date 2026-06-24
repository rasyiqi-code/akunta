import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Send, Sparkles, Check, X } from 'lucide-react';
import { db, DEFAULT_ACCOUNTS } from '../../utils/db';
import { parseInputWithGemini } from '../../utils/gemini';
import { postJournalEntry } from '../../utils/ledgerEngine';

interface ChatInterfaceProps {
  onReportRequested: (reportType: 'LABARUGI' | 'NERACA' | 'BUKUBESAR' | 'PIUTANG' | 'PAJAK') => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ onReportRequested }) => {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Ambil data chat dari IndexedDB secara reaktif
  const messages = useLiveQuery(() => db.chatMessages.toArray()) || [];

  // Auto-scroll ke bawah saat ada pesan baru
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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

    try {
      // 2. Kirim input ke Gemini API (atau simulator fallback)
      const aiResult = await parseInputWithGemini(userText);

      // 3. Tangani hasil parsing berdasarkan Intent
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
        // Intent UNKNOWN atau informasi umum
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

  const handleConfirmTransaction = async (msgId: number, transactionData: any) => {
    try {
      // Post transaksi ke General Ledger
      const journalId = await postJournalEntry(transactionData);
      
      // Update pesan konfirmasi agar keterangannya berganti lunas/terposting
      await db.chatMessages.update(msgId, {
        cardType: 'TRANSACTION_SUCCESS',
        text: `✅ **Transaksi Terposting!**\n\nJurnal berhasil dicatat di Core Ledger dengan ID: **${journalId}**.\n\n*Keterangan:* ${transactionData.description}`,
      });
      
      // Tambahkan pesan sukses dari AI
      await db.chatMessages.add({
        sender: 'AI',
        text: `Transaksi "${transactionData.description}" senilai Rp ${transactionData.lines.reduce((s: number, l: any) => s + l.debit, 0).toLocaleString('id-ID')} telah sukses dijurnal. Silakan cek tabel Jurnal Umum di panel kanan.`,
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
                  <span>Draft Jurnal Otomatis</span>
                </div>
                
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  <strong>Deskripsi:</strong> {msg.cardData.description} <br />
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
            placeholder="Catat transaksi atau minta laporan (misal: 'Jual kopi 50rb')..."
            disabled={isLoading}
          />
          <button type="submit" className="btn btn-primary btn-circle" disabled={isLoading || !inputValue.trim()}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};
