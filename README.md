# Akunta

Aplikasi akuntansi double-entry offline untuk UMKM Indonesia berbasis Tauri v2 + React 19 + Rust + SQLite.

## Prerequisites

- **Node.js** 20+
- **Rust** stable (via rustup)
- **System deps (Linux):**
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
    patchelf libssl-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
  ```
- **System deps (Windows):** MSVC build tools (via Visual Studio Build Tools)

## Build & Run

```bash
# Install frontend deps
npm install

# Development (hot-reload)
npm run tauri dev

# Production build
npm run tauri build
```

Artifak build ada di `src-tauri/target/release/bundle/`:
- **Linux:** `.deb`, `.AppImage`
- **Windows:** `.msi`, `.exe`

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite |
| Desktop | Tauri v2 (Rust) |
| Database | SQLite via rusqlite (bundled) |
| AI Provider | Google Gemini / OpenAI / Anthropic (auto-detect) |
| CSS | Glassmorphism custom (no framework) |

## Struktur Proyek

```
src/                          # Frontend React
├── components/               # Komponen UI
│   ├── AccountantMode/       # Mode Akuntan (tabel/jurnal)
│   │   └── modals/           # Modal terpisah per fitur
│   ├── AssistantMode/        # Mode Asisten (chat AI)
│   └── SettingsModal.tsx     # Pengaturan AI & profil
├── utils/
│   ├── ai.ts                 # Multi-provider AI abstraction
│   ├── db.ts                 # Frontend DB facade (invoke Rust)
│   └── ledgerEngine.ts       # Core ledger logic
src-tauri/                    # Backend Rust
├── src/
│   ├── accounting.rs         # Business logic (sales, purchase, inventory)
│   ├── commands_*.rs         # Tauri command handlers
│   ├── models.rs             # Data models (serde)
│   └── db.rs                 # SQLite init & migration
```

## Feature Overview

- **Double-entry accounting** — COA, Jurnal, Buku Besar, Neraca, Laba Rugi, Arus Kas
- **Penjualan & Pembelian** — Faktur, Order, Retur, Tracking PPN
- **Persediaan** — Multi-gudang, Average Cost, Stock Opname
- **Aset Tetap** — Penyusutan garis lurus otomatis, disposal
- **Pajak Indonesia** — e-Faktur CSV (PPN), e-Bupot CSV (PPh)
- **AI Multi-Provider** — Gemini/OpenAI/Anthropic untuk chat & diagnosis laporan
- **Rekonsiliasi Bank** — AI-assisted matching
- **Dua Mode** — Chat (Asisten) + Tabel (Akuntan), data sama

---

## PRD (Product Requirement Document)

Dokumen PRD lengkap tersedia di bagian bawah README ini, mencakup:

- Visi & Misi Produk
- Target Pengguna (Pak Budi, Mbak Ani, Tim Input)
- Filosofi Dua Muka (Asisten + Akuntan)
- Fitur & Requirements detail
- Roadmap 4 Fase
- Spesifikasi Teknis & Keamanan

---

## Lisensi

Proprietary — Hak cipta dilindungi.
