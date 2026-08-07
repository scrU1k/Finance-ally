# Technical Architecture & Implementation Documentation

## **Finance-Ally: Technical Reference Manual**

Finance-Ally is an offline-first, sandboxed, privacy-focused financial intelligence web and mobile application built with React 18, TypeScript, Vite, Tailwind CSS v4, and Capacitor Android. 

This document details the software architecture, data structures, cryptographic sub-systems, natural language processing pipelines, UI render mechanics, and compilation workflows.

---

## 🏗️ 1. High-Level Architecture Overview

Finance-Ally is designed around a zero-server, client-side execution model. All transaction parsing, category classification, data persistence, and encryption operations occur strictly within the client's execution context (Browser V8 engine / Android System WebView).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PRESENTATION LAYER                               │
│  React 18 Component Tree + Context API (Auth, Finance, Theme Providers)    │
│  Tailwind CSS v4 + Design Tokens (.dotgui Glassmorphism + React Portals)    │
└──────────────────────┬────────────────────────────────┬─────────────────────┘
                       │                                │
                       ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────┐
│          INTELLIGENCE LAYER          │  │  CRYPTO & BACKUP SUBSYSTEM       │
│  - Natural Language Parser (NLP)     │  │  - AES-256-GCM Encryption        │
│  - Arctic-FTS5 Trigram Classifier    │  │  - PBKDF2 (100k rounds) / SHA-256 │
│  - Bank Notification SMS Parser      │  │  - Web Crypto API (SubtleCrypto) │
│  - End of Month Audit Engine         │  └──────────────────────────────────┘
└──────────────────────┬───────────────┘                                
                       │                                                
                       ▼                                                
┌─────────────────────────────────────────────────────────────────────────────┐
│                             DATA LAYER                                      │
│  Dual Storage Architecture: IndexedDB (Primary) <-> LocalStorage (Fallback) │
└──────────────────────┬──────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          NATIVE BRIDGE LAYER                                │
│  Capacitor 6/7 Android Bridge (@capacitor/filesystem, @capacitor/share)     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 💾 2. Data Persistence Layer (`src/services/db.ts`)

Finance-Ally utilizes a **Dual Storage Architecture** to ensure fast sub-millisecond reads alongside data durability across app updates and webview restarts.

### 2.1 IndexedDB Schema (`FinanceAllyDB` v1)
The primary storage is IndexedDB managed asynchronously via raw Web API Promises without external ORM overhead:

* **`transactions` ObjectStore**: Key path `id`. Indexes: `date`, `categoryId`, `tripId`.
* **`categories` ObjectStore**: Key path `id`.
* **`trips` ObjectStore**: Key path `id`.
* **`userProfile` ObjectStore**: Key path `username`.

### 2.2 LocalStorage Fallback & Real-Time Sync
If IndexedDB is restricted or slow to initialize, the application transparently reads and writes to `localStorage` using structured keys:
- `fa_transactions`
- `fa_categories`
- `fa_trips`
- `fa_user_profile`
- `fa_forex_rates`

Every mutation (`saveTransaction`, `deleteTransaction`, `saveCategory`, `saveTrip`) writes synchronously to `localStorage` first to prevent race conditions and asynchronously updates IndexedDB.

---

## 🔒 3. Security & Cryptography Subsystem (`src/services/cryptoService.ts`)

Finance-Ally implements AES-256-GCM data encryption for backup files and salted SHA-256 hashing for authentication.

### 3.1 Local Password Hashing (`src/services/auth.ts`)
User authentication uses Web Crypto `crypto.subtle.digest`:
```typescript
const SALT = 'FinanceAllyLocalSalt2026';
// Hash = SHA-256(password + SALT)
```
The user hash is verified locally before setting the `isUnlocked` state in `AuthContext`.

### 3.2 Backup File Encryption (AES-256-GCM)
Exported `.json` backups can be optionally encrypted using a user-specified 4–8 character Export PIN.

#### Encryption Key Derivation (PBKDF2)
- **Algorithm**: PBKDF2 with HMAC-SHA-256
- **Iterations**: 100,000 rounds
- **Salt**: 16 cryptographically random bytes (`crypto.getRandomValues`)
- **Derived Key**: AES-256-GCM

#### Encryption Payload Schema
```json
{
  "_fa_encrypted": true,
  "encrypted": "<Base64 Ciphertext>",
  "iv": "<Base64 12-byte IV>",
  "salt": "<Base64 16-byte PBKDF2 Salt>"
}
```

#### Decryption Flow
1. `isEncryptedBackup(jsonString)` detects `_fa_encrypted: true`.
2. App renders `PinModal` requesting the user's Export PIN.
3. PBKDF2 derives the key using the payload's `salt`.
4. `crypto.subtle.decrypt` verifies tag integrity and decrypts ciphertext into the original JSON string.

---

## 🧠 4. Intelligence & Natural Language Parser (`src/services/naturalLanguageParser.ts`)

The Quick Log bar processes free-form text input using a deterministic multi-stage parsing pipeline.

### 4.1 Exhaustive Time Parsing Matrix
Extracted via `parseExhaustiveTime()`:

| Input Pattern | Regex Token Match | Result (`h24`, `label`) |
|---|---|---|
| `8pm`, `08pm`, `8 pm` | `\b(\d{1,2})\s*(am\|pm)\b` | `20:00`, `8:00 PM` |
| `8.30pm`, `8:30 pm`, `08.00pm` | `\b(\d{1,2})[\.\:\-](\d{2})\s*(am\|pm)\b` | `20:30`, `8:30 PM` |
| `8-pm` | Hyphen with no minutes group | `20:00`, `8:00 PM` |
| `8-30pm`, `08-30 pm` | Hyphen with minutes group | `20:30`, `8:30 PM` |
| `at 14:30`, `at 1430` | 24-hour military notation | `14:30`, `14:30` |

### 4.2 Exhaustive Date Parsing Matrix
Extracted via `parseExhaustiveDate()`:

| Format Type | Examples | Resolution Strategy |
|---|---|---|
| Ordinal + Month | `2nd August`, `1st jan`, `2nd of Aug` | Match day number + month token -> map to current year |
| Month + Ordinal | `August 2nd`, `Aug 2`, `august 02` | Match month token + day number |
| Slash / Dash / Dot | `2/08`, `02/08/26`, `02/08/2026` | Parse `D/M` or `D/M/Y`. Expand 2-digit years (`26` -> `2026`). |
| Relative Keywords | `today`, `yesterday`, `2 days ago` | Calculate relative offset from `new Date()` |
| Day of Week | `wednesday`, `friday` | Compute distance to previous weekday |

### 4.3 Amount & Currency Extraction
Multi-stage regex precedence:
1. `Number + Currency Code/Symbol` (`300 rupees`, `1.8 GBP`, `450 rs`, `₹500`, `$20`)
2. `Currency Symbol + Number` (`$150`, `€40`, `£12.50`)
3. `Preposition + Number` (`for 250`, `costing 1200`)
4. Fallback number extraction ignoring measurement units (`kg`, `litre`, `pcs`).

### 4.4 Semantic Category Classifier (`src/services/semanticClassifier.ts`)
Uses trigram word-boundary token matching (`categorizeNoteWithArcticFTS5`) mapped against financial dictionaries:
- `cat-food`: dining out, coffee, zomato, swiggy, starbucks, burger, lunch, dinner
- `cat-groceries`: supermarket, milk, eggs, vegetables, fruits, zepto, blinkit, mart
- `cat-transport`: uber, ola, cab, fuel, petrol, metro, auto, parking, toll
- `cat-electronics`: apple, laptop, mobile, charger, amazon, headphones
- `cat-housing`: rent, wifi, electricity, maintenance, water, broadband

---

## 🎨 5. UI Architecture & Design System (`.dotgui`)

### 5.1 Glassmorphic Stacking Context & Portals
To prevent CSS `backdrop-blur-2xl` clipping when modals are nested inside scrollable or absolute components, all global popups (`CustomDatePicker`, `CustomTimePicker`, `PinModal`, `SettingsModal`) utilize **React Portals** (`createPortal(..., document.body)`).

### 5.2 CSS Variable Design Tokens (`src/index.css`)
Tailwind CSS v4 `@theme` bindings map to CSS variables configured per theme:
```css
@theme {
  --color-brand-blue: var(--brand-blue);
  --color-brand-mint: var(--brand-mint);
  --color-brand-coral: var(--brand-coral);
  --color-canvas: var(--canvas);
  --color-surface-card: var(--surface-card);
  --color-surface-soft: var(--surface-soft);
  --color-ink: var(--ink);
  --animate-breathe: breathe 3s ease-in-out infinite;
}
```

#### Breathing Tab Keyframes
```css
@keyframes breathe {
  0%, 100% { opacity: 1; box-shadow: 0 0 12px var(--hairline); }
  50% { opacity: 0.7; box-shadow: 0 0 2px transparent; }
}
```

### 5.3 Themes Matrix
- `dotgui-dark`: Obsidian Dark (`#0e0e0c`)
- `dotgui-light`: Warm Light (`#fafaf7`)
- `cyberpunk`: Cyberpunk Neon (`#05050c`)
- `emerald`: Emerald Mint (`#04140d`)
- `sunset`: Sunset Copper (`#120b09`)
- `system`: System preference media query auto-switch (`prefers-color-scheme`)

---

## 🛠️ 6. Capacitor Android Build Pipeline

### 6.1 Native Build Execution Flow
```bash
# 1. Compile TypeScript and Vite production bundle
npm run build

# 2. Sync web assets (dist/) into Capacitor Android assets
npx cap sync android

# 3. Assemble Release APK via Gradle Wrapper
cd android && .\gradlew assembleRelease
```

### 6.2 Output APK Artifact
- **Gradle Release Output**: `android/app/build/outputs/apk/release/app-release.apk`
- **Root Release Copy**: `Finance-Ally-Signed-Release.apk`

---

## 📂 7. Project Directory Tree

```
Finance-ally/
├── android/                   # Capacitor Android Native Project
│   └── app/build/outputs/apk/ # Generated APK artifacts
├── dist/                      # Web Production Distribution Bundle
├── src/
│   ├── components/
│   │   ├── audit/             # End of Month Audit components
│   │   ├── auth/              # Lockscreen & Onboarding modals
│   │   ├── common/            # CustomSelect, CustomDatePicker, CustomTimePicker, PinModal
│   │   ├── dashboard/         # DailyTimeline, QuickLogBar, TransactionModal
│   │   ├── insights/          # Smart Suggestions & Insights
│   │   ├── layout/            # Header, SidebarNav, BottomPeriodBar
│   │   ├── scanner/           # Notification Scanner Modal
│   │   ├── settings/          # SettingsModal & Currency Switcher
│   │   ├── tools/             # SplitBillModal
│   │   └── trips/             # Trip Vaults & Foreign Trip modals
│   ├── context/
│   │   ├── AuthContext.tsx    # Auth state & lock screen control
│   │   ├── FinanceContext.tsx # Central transactions, categories, trips state
│   │   └── ThemeContext.tsx   # Visual theme & typography provider
│   ├── services/
│   │   ├── auth.ts            # Local user profile & SHA-256 password services
│   │   ├── cryptoService.ts   # AES-256-GCM encryption & PBKDF2 PIN services
│   │   ├── currency.ts        # Forex rates sync & conversion engine
│   │   ├── db.ts              # IndexedDB + LocalStorage dual storage engine
│   │   ├── insightsEngine.ts  # Financial audit & anomaly detection rules
│   │   ├── naturalLanguageParser.ts # Multi-format NLP parser
│   │   ├── notificationParser.ts    # Payment SMS regex parser
│   │   └── semanticClassifier.ts    # Trigram category classifier
│   ├── types/
│   │   └── index.ts           # Core TypeScript interfaces & types
│   ├── App.tsx                # Main App Shell & Navigation manager
│   ├── index.css              # Design tokens & Tailwind v4 theme definitions
│   └── main.tsx               # DOM Mounting point
├── capacitor.config.json      # Capacitor Configuration
├── index.html                 # App HTML Shell + Inline Theme Bootstrapper
└── package.json               # Dependencies & build scripts
```
