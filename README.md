# Product Requirement Document (PRD)

## AKUNTA
### *Aplikasi Akuntansi Dua Muka: Cerdas, Naratif, namun Andal secara Standar*

---

| **Dokumen** | Detail |
|---|---|
| **Nama Produk** | Akunta |
| **Versi Dokumen** | 1.0 |
| **Tanggal** | 24 Juni 2026 |
| **Penulis** | Tim Produk Akunta |
| **Status** | Draft untuk Pengembangan Awal |

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Visi & Misi Produk](#2-visi--misi-produk)
3. [Target Pengguna & Persona](#3-target-pengguna--persona)
4. [Masalah yang Diselesaikan](#4-masalah-yang-diselesaikan)
5. [Arsitektur Konseptual: Filosofi Dua Muka](#5-arsitektur-konseptual-filosofi-dua-muka)
6. [Fitur & Requirements](#6-fitur--requirements)
   - [6.1 Fondasi: Modul Akuntansi Standar](#61-fondasi-modul-akuntansi-standar)
   - [6.2 Mode Asisten: Fitur AI Naratif](#62-mode-asisten-fitur-ai-naratif)
   - [6.3 Mode Akuntan: Fitur Audit & Kontrol](#63-mode-akuntan-fitur-audit--kontrol)
7. [Desain Interaksi & UI/UX](#7-desain-interaksi--uiux)
8. [Spesifikasi Teknis & Infrastruktur AI](#8-spesifikasi-teknis--infrastruktur-ai)
9. [Keamanan, Privasi & Kepatuhan](#9-keamanan-privasi--kepatuhan)
10. [Metrik Keberhasilan](#10-metrik-keberhasilan)
11. [Roadmap Pengembangan](#11-roadmap-pengembangan)

---

## 1. Ringkasan Eksekutif

**Akunta** adalah aplikasi akuntansi berbasis cloud untuk UMKM dan perusahaan menengah di Indonesia. Akunta dibangun di atas fondasi standar akuntansi PSAK dan kepatuhan perpajakan Indonesia yang ketat (seperti Accurate), namun membungkus seluruh kompleksitas itu dalam **dua lapis antarmuka**:

1. **Mode Asisten** (default): Antarmuka percakapan naratif berbasis AI Generatif. Pengguna awam berinteraksi dengan bahasa alami. Tidak ada tabel, tidak ada jurnal, tidak ada istilah debit/kredit.
2. **Mode Akuntan**: Antarmuka tabel, grid, dan form standar penuh untuk keperluan audit, koreksi, rekonsiliasi mendalam, dan pelaporan pajak detail.

Kedua mode bekerja pada **satu database transaksional yang sama** secara real-time. Akunta tidak mengorbankan kedisiplinan akuntansi demi kemudahan, melainkan menyembunyikan kompleksitas di balik AI yang memahami konteks bisnis Indonesia.

---

## 2. Visi & Misi Produk

**Visi:**
Menjadi jembatan antara disiplin akuntansi profesional dan kebutuhan praktis pelaku usaha Indonesia, di mana setiap pemilik bisnis dapat memahami keuangannya se-intuitif berbicara dengan seorang CFO, tanpa perlu memahami debit/kredit.

**Misi:**
1. Menyediakan mesin akuntansi yang 100% patuh PSAK dan perpajakan Indonesia.
2. Menghadirkan lapisan AI naratif yang menerjemahkan setiap transaksi menjadi bahasa manusia.
3. Memberikan akses tanpa batas bagi akuntan profesional untuk melakukan audit dan koreksi pada data mentah yang sama.
4. Mendeteksi anomali, potensi fraud, dan memberikan proyeksi keuangan masa depan secara proaktif.

---

## 3. Target Pengguna & Persona

### Persona 1: Pak Budi (Pemilik Bisnis / Decision Maker)
- **Usia:** 35-50 tahun
- **Bisnis:** Kedai kopi, distributor kecil, bengkel, butik, kontraktor
- **Pendidikan:** Non-akuntansi
- **Pain Points:**
  - Tidak mengerti istilah debit/kredit, neraca, trial balance
  - Ingin tahu "Apakah bisnis saya sehat?" tanpa membaca tabel
  - Ingin tahu "Siapa yang belum bayar?" dengan cepat
  - Takut salah urus pajak
  - Tidak punya waktu input transaksi lama-lama
- **Kebutuhan dari Akunta:** Mode Asisten. Bicara/ketik bahasa sehari-hari. Lihat ringkasan naratif. Dapat peringatan dini.

### Persona 2: Mbak Ani (Akuntan Internal / Konsultan Pajak)
- **Usia:** 25-40 tahun
- **Keahlian:** Akuntansi, PSAK, perpajakan
- **Pain Points:**
  - Data dari klien/Pak Budi sering berantakan, tidak standar
  - Butuh akses ke jurnal asli, buku besar, detail GL
  - Butuh tools rekonsiliasi bank yang presisi
  - Harus menyiapkan SPT dan e-Faktur dengan data valid
- **Kebutuhan dari Akunta:** Mode Akuntan. Full access ke tabel, jurnal, export data. Tools rekonsiliasi AI-assisted. Log aktivitas.

### Persona 3: Tim Input Harian (Admin / Kasir)
- **Usia:** 20-30 tahun
- **Keahlian:** Operasional dasar, familiar dengan chat/WA
- **Pain Points:**
  - Takut salah input kategori
  - Input penjualan/pembelian harus cepat
  - Sering lupa mencatat biaya kecil
- **Kebutuhan dari Akunta:** Mode Asisten via chat singkat. Cukup ketik "Jual 2 kopi susu 25rb tunai".

---

## 4. Masalah yang Diselesaikan

| Masalah | Solusi Akunta |
|---|---|
| Aplikasi akuntansi terlalu kompleks untuk pemilik bisnis awam | Mode Asisten menyembunyikan kompleksitas, menggantinya dengan bahasa alami |
| Aplikasi akuntansi "mudah" tidak memenuhi standar audit & pajak | Fondasi PSAK penuh tersedia di Mode Akuntan, data yang sama persis |
| Data keuangan sering salah input karena user tidak paham akun | AI menginterpretasi maksud user dan memetakan ke akun standar secara otomatis |
| Pemilik bisnis tidak tahu kondisi keuangan real-time | Dashboard naratif proaktif memberi tahu "uang masuk, keluar, masalah, prediksi" tanpa diminta |
| Fraud & kebocoran tidak terdeteksi dini | AI terus memonitor anomali transaksi dan perubahan data mencurigakan |
| Rekonsiliasi bank memakan waktu berhari-hari | AI mencocokkan konteks transaksi, bukan hanya nominal dan tanggal |

---

## 5. Arsitektur Konseptual: Filosofi Dua Muka

```
┌─────────────────────────────────────────────────────────┐
│                     PENGGUNA                             │
│                                                         │
│     ┌─────────────┐              ┌─────────────┐        │
│     │ MODE ASISTEN│              │MODE AKUNTAN │        │
│     │  (Default)  │              │ (Tombol Kecil)│      │
│     │             │              │             │        │
│     │ • Percakapan│              │ • Tabel     │        │
│     │ • Narasi    │              │ • Jurnal    │        │
│     │ • Bahasa    │              │ • Form      │        │
│     │   Alami     │              │   Standar   │        │
│     │ • Kartu     │              │ • Export    │        │
│     │   Ringkasan │              │   Excel/PDF │        │
│     └──────┬──────┘              └──────┬──────┘        │
│            │                            │               │
│            └──────────┬─────────────────┘               │
│                       ▼                                 │
│         ┌──────────────────────────┐                   │
│         │    AKUNTA AI ENGINE      │                   │
│         │  • NLP / Intent Parser   │                   │
│         │  • Account Classifier    │                   │
│         │  • Tax Rule Engine       │                   │
│         │  • Anomaly Detector      │                   │
│         │  • Narrative Generator   │                   │
│         └──────────┬───────────────┘                   │
│                    ▼                                    │
│         ┌──────────────────────────┐                   │
│         │   AKUNTA CORE LEDGER     │                   │
│         │  (Double-Entry Engine)   │                   │
│         │  • Chart of Accounts     │                   │
│         │  • General Ledger        │                   │
│         │  • AR/AP/Inventory       │                   │
│         │  • Fixed Assets          │                   │
│         │  • Tax Modules           │                   │
│         └──────────┬───────────────┘                   │
│                    ▼                                    │
│         ┌──────────────────────────┐                   │
│         │   DATABASE TUNGGAL       │                   │
│         │   (PostgreSQL + Redis)   │                   │
│         └──────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

**Prinsip Kunci:** Mode Asisten dan Mode Akuntan adalah **view** dari data yang sama. Tidak ada duplikasi. Tidak ada sinkronisasi. Real-time, single source of truth.

---

## 6. Fitur & Requirements

### 6.1 Fondasi: Modul Akuntansi Standar

Seluruh fitur di bawah WAJIB ada dan beroperasi penuh di belakang layar. Di Mode Akuntan, semuanya dapat diakses via UI tabel/form standar.

| Modul | Fitur Wajib | Standar Acuan |
|---|---|---|
| **Chart of Accounts (COA)** | Template COA standar PSAK, customizable. Hierarki akun, tipe akun, saldo normal. | PSAK Umum & EMKM |
| **Buku Besar & Jurnal** | Jurnal Umum, Jurnal Memorial, Jurnal Penyesuaian, Jurnal Penutup. Posting otomatis dari subledger. | Double-entry bookkeeping |
| **Penjualan (AR)** | Sales Order (opsional) → Delivery Order → Faktur Penjualan → Retur Penjualan. Termasuk tracking PPN Keluaran. | PSAK 72 (Pendapatan) |
| **Pembelian (AP)** | Purchase Order (opsional) → Penerimaan Barang → Faktur Pembelian → Retur Pembelian. Termasuk tracking PPN Masukan & PPh 23/4(2). | PSAK |
| **Persediaan** | Metode FIFO & Average. Multi gudang. Stok adjustment, transfer antar gudang, stock opname. | PSAK 14 |
| **Kas & Bank** | Kas Masuk, Kas Keluar, Transfer Antar Rekening, Rekonsiliasi Bank. Multi kas/bank. | Standar |
| **Aset Tetap** | Daftar aset, metode penyusutan (Garis Lurus & Saldo Menurun), perhitungan otomatis, disposal aset. | PSAK 16 |
| **Pajak** | PPN Masukan/Keluaran, e-Faktur XML generation, Bukti Potong PPh 21/23/4(2)/26, SPT Masa PPN & PPh Badan draft data. | UU PPN, UU PPh, PER DJP |
| **Laporan Standar** | Neraca (Standar & Perbandingan), Laba Rugi (Standar & Perbandingan), Arus Kas, Perubahan Modal, Trial Balance, Detail GL, Aging AR/AP. | PSAK 1 |

---

### 6.2 Mode Asisten: Fitur AI Naratif

Ini adalah **default UI** yang dilihat semua user saat login, kecuali mereka sengaja pindah ke Mode Akuntan.

#### F-AS-01: Dashboard Naratif "War Room"
**Deskripsi:** Layar utama setelah login. Bukan dashboard grafik, melainkan kanvas naratif yang memberikan ringkasan bisnis seperti asisten pribadi.
**Elemen Wajib:**
- **Sapaan Personal:** "Selamat pagi/siang/sore/malam, [Nama]."
- **Ringkasan Keuangan Harian (Kartu):** Uang Masuk Hari Ini, Uang Keluar Hari Ini, Saldo Gabungan Bank/Kas, Laba/Rugi Bulan Ini (sementara). Angka real-time dari database.
- **Notifikasi Prioritas (Alert Cards):**
  - **Merah (Kritis):** Piutang jatuh tempo signifikan (>7 hari), saldo bank di bawah threshold untuk pembayaran terjadwal.
  - **Kuning (Perhatian):** Piutang mendekati jatuh tempo, stok kritis (< reorder point), lonjakan biaya abnormal.
  - **Biru (Informasi):** Pembayaran customer baru masuk, faktur baru diterbitkan.
- **Input Baris Percakapan:** "Ketik sesuatu... (misal: catat penjualan, kondisi keuanganku, siapa yang belum bayar?)"

#### F-AS-02: Input Transaksi Percakapan
**Deskripsi:** Semua pencatatan transaksi (penjualan, pembelian, pengeluaran, penerimaan) dilakukan via percakapan teks atau suara.
**Persyaratan AI:**
- Memahami maksud dari kalimat tidak terstruktur.
- Mampu mengekstrak entitas: jumlah, akun biaya/pendapatan, customer/vendor, metode pembayaran, tanggal (default: hari ini), produk (untuk inventory).
- Mampu menangani input majemuk: "Bayar listrik 1,5jt dan internet 500rb pake BCA."
- Mampu meminta konfirmasi untuk hal ambigu sebelum posting.
- **Output:** Konfirmasi singkat di chat + jurnal otomatis terbuat di Core Ledger.

**Contoh Skenario & Intent Mapping:**
| Input User | Intent AI | Aksi Core Ledger |
|---|---|---|
| "Jual 2 latte 40rb tunai" | Penjualan Tunai | Faktur Penjualan (Tunai) + Kurangi Stok + Kas Masuk |
| "PT ABC beli 5 dus sirup, ngutang dulu" | Penjualan Kredit | Faktur Penjualan (Kredit) + Piutang PT ABC + Kurangi Stok |
| "Bayar langganan Zoom 250rb pake Mandiri" | Pembelian/Pengeluaran Jasa | Kas Keluar (Bank Mandiri) + Biaya Langganan Software + PPN/PPH jika relevan |
| "Beli bahan baku kopi 10kg 1,5jt, bayar nanti ke supplier A" | Pembelian Kredit | Faktur Pembelian (Kredit) + Utang Supplier A + Tambah Stok |
| "Terima pembayaran dari Toko Lancar 5jt via transfer BCA" | Penerimaan Piutang | Kas Masuk (BCA) + Kurangi Piutang Toko Lancar |

#### F-AS-03: Laporan "Cerita Keuangan" (Story Mode)
**Deskripsi:** Saat user bertanya "Bagaimana kondisi keuanganku?", AI merender Narasi Keuangan, bukan tabel.
**Struktur Output:**
1. **Cerita Asetmu:** Total aset, breakdown aset terbesar dalam bahasa sederhana.
2. **Cerita Utangmu:** Total liabilitas, breakdown utang bank & pajak.
3. **Posisi Kekayaan Bersih:** Ekuitas, tren naik/turun dari bulan lalu, label kesehatan (SEHAT / WASPADA / KRITIS).
4. **Cerita Laba Bulan Ini:** Omzet, laba kotor, margin (%), laba bersih.
5. **Sorotan AI:** Poin-poin yang perlu perhatian (biaya melonjak, pendapatan turun, dll).
6. **CTA (Call to Action):** Tombol "Export Laporan Standar (PDF/Excel)" di bagian bawah untuk auditor/pajak.

#### F-AS-04: "Dr. Report" - Diagnosis Laporan Otomatis
**Deskripsi:** Saat user membuka laporan standar di Mode Akuntan, tombol **[Diagnosis AI]** tersedia. Di Mode Asisten, diagnosis ini otomatis muncul sebagai bagian dari "Cerita Keuangan" atau alert.
**Kemampuan Diagnosis:**
- Menjelaskan penyebab laba naik/turun (misal: "Laba turun 10% karena Biaya Iklan naik 300% & Diskon Penjualan naik 50%").
- Mendeteksi ketidakseimbangan neraca dan menebak penyebabnya (misal: "Piutang mungkin belum direkonsiliasi, cek 3 transaksi ini...").
- Membandingkan realisasi vs anggaran (jika fitur anggaran aktif).

#### F-AS-05: Monitoring Piutang "Thread" View
**Deskripsi:** Bukan tabel aging AR, melainkan tampilan seperti chat atau kartu per customer.
**Kategori:**
- **Perhatian (Merah):** Telat > 7 hari. Tampilkan nama, total tagihan, faktur paling lama, aksi [Kirim Pengingat] [Buat Janji Bayar].
- **Segera Jatuh Tempo (Kuning):** Jatuh tempo dalam 3 hari.
- **Baru Lunas (Hijau):** Pembayaran diterima dalam 2 hari terakhir.
**Fitur Aksi:** Kirim email pengingat otomatis dengan template ramah/formil yang di-generate AI.

#### F-AS-06: Pajak "Kartu Setoran" View
**Deskripsi:** Ringkasan kewajiban pajak bulan berjalan dalam bentuk kartu per jenis pajak.
**Tampilan:**
- **PPN:** PK, PM, Kurang/Lebih Bayar, tanggal setor, tombol [Download CSV e-Faktur].
- **PPh 23/4(2)/26:** Total bukti potong, total PPh terutang, tombol [Buat e-Bupot].
- **Alert Pajak:** Jika ada transaksi yang belum dibuatkan bukti potong. "⚠️ Ada 2 transaksi sewa yang belum dibuatkan bukti potong PPh 4(2)."

#### F-AS-07: Penjadwalan & Autopilot Berkala Cerdas
**Deskripsi:** AI mempelajari transaksi berulang dan menawarkan otomatisasi.
**Perilaku AI:**
- Deteksi pola transaksi bulanan (sewa, gaji, langganan).
- Notifikasi: "Saya lihat Anda selalu input sewa ruko tiap tanggal 1. Mau saya jadwalkan otomatis?"
- Jika dijadwalkan, AI otomatis membuat jurnal + bukti potong terkait pada tanggal yang dijadwalkan.
- **Cek Saldo Sebelum Eksekusi:** "Sewa ruko otomatis akan dibayar besok, tapi saldo BCA Anda kurang Rp 5 juta. Mau tunda atau pindahkan dari Mandiri?"

#### F-AS-08: Lensa AI (Upload Bukti Transaksi)
**Deskripsi:** User dapat mengunggah foto/PDF bukti transaksi (nota, invoice supplier, bukti transfer) sebagai pengganti input teks.
**Kemampuan AI:**
- **OCR & Ekstraksi:** Ekstrak tanggal, jumlah, nama vendor/customer, detail item.
- **Klasifikasi:** Petakan ke akun standar, deteksi PPN/PPH.
- **Output:** Menampilkan draft transaksi lengkap di chat, meminta konfirmasi sebelum posting.

---

### 6.3 Mode Akuntan: Fitur Audit & Kontrol

Mode ini adalah "wajah Accurate" dari Akunta. Dapat diakses via tombol kecil "🔧 Mode Akuntan" di pojok kanan atas.

#### F-AK-01: Tampilan Tabel & Grid Standar
Seluruh modul (Penjualan, Pembelian, Persediaan, Kas/Bank, Buku Besar, Aset Tetap) memiliki tampilan tabel dengan kolom standar, filter, sort, dan export ke Excel/PDF.

#### F-AK-02: Rekonsiliasi Bank AI-Assisted
**Deskripsi:** Menggabungkan UI rekonsiliasi standar (tabel bank vs catatan) dengan lapisan AI.
**Keunikan AI:**
- Mencocokkan transaksi tidak hanya berdasarkan nominal & tanggal, tapi juga **konteks** (nama lawan transaksi di bank statement vs nama customer/vendor, analisis memo, riwayat pembayaran).
- Menampilkan "Tingkat Keyakinan" (Match Confidence Score) untuk setiap saran pencocokan.
- Akuntan tinggal centang dan konfirmasi.

#### F-AK-03: Jurnal & Posting View
Tampilan jurnal dua kolom (Debit/Kredit) standar. Akuntan dapat membuat, mengedit (dengan hak akses), dan membatalkan posting jurnal.

#### F-AK-04: Audit Trail & Log Anomali
**Deskripsi:** Bukan sekadar log mentah, tapi log dengan narasi AI.
**Fitur:**
- **Log Perubahan:** Siapa, kapan, apa yang diubah, nilai sebelum & sesudah.
- **Label Anomali Otomatis:** AI menandai perubahan yang mencurigakan, misal: "⚠️ ANOMALI: Diskon faktur diubah dari 0% ke 20% pasca-penjualan, diakses dari HP di luar jam kerja."
- **Filter Anomali:** Akuntan bisa langsung filter hanya untuk transaksi yang ditandai AI sebagai mencurigakan.

#### F-AK-05: Export & Compliance
- Export Neraca, Laba Rugi, Arus Kas ke Excel/PDF standar.
- Export CSV e-Faktur PPN (format DJP).
- Export CSV Bukti Potong PPh (format DJP).
- Export General Ledger untuk audit.

---

## 7. Desain Interaksi & UI/UX

### 7.1 Prinsip Desain
1. **Mobile-First namun Desktop-Excellent:** Mode Asisten harus nyaman di HP (seperti WhatsApp). Mode Akuntan optimal di Desktop (tablet minimum).
2. **Zero Jargon (Mode Asisten):** Tidak ada kata "debit", "kredit", "buku besar", "COA" di Mode Asisten.
3. **Konfirmasi Sebelum Eksekusi:** AI tidak pernah posting transaksi tanpa konfirmasi pengguna, kecuali untuk transaksi terjadwal yang sudah disetujui sebelumnya.
4. **Transparansi:** User selalu bisa klik "Lihat Detail" pada narasi AI untuk melihat data sumber di Mode Akuntan.

### 7.2 Hirarki Layar (Mode Asisten - Mobile)
1. **War Room (Dashboard Naratif):** Layar utama, scroll vertikal. Kartu ringkasan di atas, notifikasi prioritas di bawahnya, bar input chat sticky di bottom.
2. **Thread Monitoring Piutang:** Akses dari notifikasi atau menu samping. Tampilan list kartu customer.
3. **Cerita Keuangan:** Akses dari pertanyaan "Bagaimana kondisi keuanganku?". Tampilan narasi terstruktur.
4. **Kartu Pajak:** Akses dari menu samping. Tampilan grid kartu per jenis pajak.
5. **Profil & Pengaturan:** Akses dari menu samping. Pengaturan profil bisnis, threshold alert, preferensi bahasa AI (formal/santai).

### 7.3 Transisi Mode
- Tombol "🔧 Mode Akuntan" selalu ada di pojok kanan atas (desktop) atau di menu samping (mobile).
- Klik tombol tersebut akan membuka antarmuka baru (SPA route berbeda) dengan tampilan tabel.
- Dari Mode Akuntan, tombol berubah menjadi "💬 Mode Asisten" untuk kembali.
- **State persistence:** Posisi terakhir user di Mode Akuntan (misal: sedang membuka Faktur Penjualan #123) disimpan, sehingga ketika kembali tidak hilang.

---

## 8. Spesifikasi Teknis & Infrastruktur AI

### 8.1 Stack Teknologi (Usulan)
- **Frontend:** React / Next.js (Web), React Native (Mobile)
- **Backend:** Node.js (NestJS) atau Python (FastAPI)
- **Database:** PostgreSQL (transaksi akuntansi, double-entry integrity), Redis (caching, session, antrian AI)
- **AI/ML Stack:**
  - **LLM Gateway:** Model Bahasa Besar (seperti GPT-4o, Claude, atau LLM lokal/open-source) untuk NLP, intent parsing, dan narrative generation.
  - **Vector Database (Pinecone/pgvector):** Untuk menyimpan embedding historis transaksi, digunakan oleh Anomaly Detector untuk membandingkan transaksi baru dengan pola normal.
  - **OCR Engine:** Untuk fitur Lensa AI (upload bukti transaksi).
  - **Rule Engine:** Sistem rule-based terpisah untuk logika pajak (PPN, PPh) yang deterministik, tidak boleh hanya mengandalkan LLM. LLM hanya untuk klasifikasi intent, bukan untuk perhitungan pajak final.

### 8.2 Keamanan Data AI
- **Tidak ada data keuangan mentah yang dikirim ke LLM pihak ketiga tanpa anonimisasi.** Data seperti nama customer, nominal eksak, nama vendor akan di-masking sebelum dikirim untuk NLP intent parsing jika menggunakan API eksternal.
- Alternatif: Menggunakan LLM open-source yang di-self-host untuk privasi penuh.
- **Audit Trail AI:** Setiap keputusan yang dibuat AI (klasifikasi akun, deteksi pajak) harus tercatat log-nya, sehingga akuntan bisa mengaudit "pemikiran" AI.

### 8.3 Integrasi
- **Integrasi Bank Indonesia (BCA, Mandiri, BNI, BRI, dll):** API untuk auto-fetch mutasi bank, bahan baku rekonsiliasi AI.
- **Integrasi DJP (e-Faktur, e-Bupot):** API atau file format XML/CSV untuk upload langsung dari aplikasi.
- **Integrasi Marketplace/Toko Online (Tokopedia, Shopee, dll):** API untuk auto-fetch penjualan (fitur lanjutan).

---

## 9. Keamanan, Privasi & Kepatuhan

### 9.1 Keamanan Data
- Enkripsi data at-rest (AES-256) dan in-transit (TLS 1.3).
- Multi-Factor Authentication (MFA) untuk semua user.
- Role-Based Access Control (RBAC): Pemilik Bisnis (Mode Asisten default, bisa akses Mode Akuntan), Akuntan (Mode Akuntan full), Admin Input (Mode Asisten terbatas, tidak bisa akses laporan laba rugi).

### 9.2 Privasi AI
- User dapat memilih tingkat privasi AI:
  - **Standard:** Data dianonimisasi, diproses di cloud AI.
  - **Private:** Semua pemrosesan AI dilakukan on-premise/self-hosted (untuk enterprise).
- Kebijakan data yang jelas: Data keuangan tidak akan digunakan untuk melatih model AI publik.

### 9.3 Kepatuhan Perpajakan
- Mengikuti aturan terbaru DJP (PER terbaru).
- Update template e-Faktur/e-Bupot secara berkala.
- Mode Akuntan harus menyediakan data yang siap audit oleh KAP.

---

## 10. Metrik Keberhasilan (KPIs)

### 10.1 User Adoption
- **Onboarding Time:** 80% pengguna baru (pemilik bisnis) berhasil mencatat transaksi pertama dalam < 5 menit setelah install.
- **DAU/MAU Ratio:** > 40% (menunjukkan aplikasi digunakan setiap hari, bukan hanya akhir bulan).

### 10.2 Efisiensi
- **Waktu Input Transaksi:** Rata-rata < 20 detik per transaksi di Mode Asisten.
- **Waktu Rekonsiliasi Bank:** 70% lebih cepat dibanding metode manual di aplikasi standar.
- **Error Rate Input Kategori:** < 2% (diukur dari seberapa sering Akuntan harus mengoreksi jurnal yang dibuat AI).

### 10.3 Kepuasan
- **NPS (Net Promoter Score) Pemilik Bisnis:** > 60 (Sangat Puas).
- **NPS Akuntan:** > 40 (Puas, karena data standar tersedia).
- **Support Ticket Volume:** < 1 tiket per 50 user per bulan (menunjukkan AI cukup membantu).

### 10.4 Bisnis
- **Konversi Trial ke Paid:** > 30%.
- **Monthly Churn Rate:** < 5%.
- **MRR (Monthly Recurring Revenue):** (Target disesuaikan saat go-to-market).

---

## 11. Roadmap Pengembangan

### Fase 1: MVP (Minimum Viable Product) - 6 Bulan
**Fokus:** Fondasi akuntansi + Mode Asisten dasar.
- Core Ledger: COA, Jurnal Umum, Kas/Bank, Penjualan, Pembelian (Mode Akuntan).
- Mode Asisten: Dashboard Naratif (ringkasan saldo, piutang alert).
- Mode Asisten: Input transaksi via chat (penjualan tunai/kredit, pengeluaran sederhana).
- Mode Akuntan: Jurnal view, tabel standar.
- **Belum ada:** Persediaan, Aset Tetap, Pajak otomatis, Rekonsiliasi AI.

### Fase 2: Peluncuran Publik (Public Launch) - 12 Bulan
**Fokus:** Modul lengkap + Pajak + Lensa AI.
- Modul Persediaan & Aset Tetap.
- Modul Pajak PPN & PPh (e-Faktur, e-Bupot).
- Laporan Cerita Keuangan (Story Mode).
- Lensa AI (Upload Bukti Transaksi).
- Integrasi Bank (1-2 bank besar).
- Multi-user & RBAC.

### Fase 3: Keunggulan AI (AI Advantage) - 18 Bulan
**Fokus:** Fitur AI canggih & proaktif.
- Rekonsiliasi Bank AI-Assisted.
- Dr. Report: Diagnosis Laporan.
- Anomaly Detection & Fraud Alert.
- Penjadwalan & Autopilot Cerdas.
- Integrasi Marketplace.

### Fase 4: Ekosistem & Enterprise - 24 Bulan+
**Fokus:** Platform dan ekosistem.
- Akunta App Store (plugin/add-on dari pihak ketiga).
- API publik untuk integrasi custom.
- Mode Enterprise dengan self-hosted AI (Private Mode).
- Fitur Budgeting & Forecasting berbasis AI.

---

## Penutup

Akunta bukan sekadar aplikasi akuntansi. Ia adalah upaya untuk mendemokratisasi pemahaman keuangan bagi jutaan pelaku UMKM Indonesia, dengan tetap menghormati disiplin ilmu akuntansi. Dengan filosofi **Dua Muka**, Akunta melayani dua kebutuhan yang selama ini dianggap bertentangan: **kemudahan** bagi pemilik bisnis dan **kedisiplinan** bagi akuntan.

PRD ini adalah fondasi untuk membangun produk tersebut. Semua keputusan desain, teknis, dan bisnis harus diuji terhadap satu pertanyaan: *"Apakah ini membuat Pak Budi lebih paham keuangannya, tanpa membuat Mbak Ani kehilangan kepercayaan pada datanya?"*

---

**Dokumen disusun oleh:** Tim Produk Akunta
**Tanggal Efektif:** 24 Juni 2026
**Review Berkala:** Setiap 3 bulan atau saat ada perubahan signifikan pada regulasi PSAK/Perpajakan.