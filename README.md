# Finance-Ally — Private, Local-First Financial Intelligence

> **Know where every rupee goes. Small habits. Big savings.**

Finance-Ally is a private, beautifully crafted personal finance application designed for users who value data privacy, speed, and modern design. It operates as a 100% local-first, offline-capable application with sandboxed device storage, ensuring your sensitive transactions, travel logs, and credentials never touch a remote server or cloud database.

*Made with Antigravity*

---

## Why Choose Finance-Ally?

- **100% Local-First & Zero Cloud Lock-in**: All your transactions, trip budgets, credentials, and notes remain on your device in sandboxed IndexedDB and encrypted storage. No mandatory account signup, no cloud tracking, no analytics telemetry, and zero third-party data collection.
- **Unified Global Recovery Key**: Single universal emergency recovery key (`FAK-xxxx-xxxx-xxxx-xxxx`) protects all three security gates (Startup App Lock, Password Vault Master PIN, and Backup PIN). Easily change or recover forgotten PINs/passwords without losing your encrypted password cards or backups.
- **Stunning Glassmorphic Interface**: Built with frosted glass surfaces, dynamic lighting, fluid micro-interactions, responsive mobile toolbars, hardware-accelerated momentum scrolling, and ambient glowing active tabs.
- **Smart Natural Language Quick Logging**: Type expenses naturally (`450rs coffee 2nd aug 8pm`, `250 petrol tomorrow at 9a`, `1200 dinner at 8pn`) with built-in arithmetic math evaluation (`250+50 coffee`, `1200*2 rent`, `500/2 groceries`).
- **Multi-Currency Normalization**: Log transactions in multiple currencies (INR, USD, EUR, GBP, JPY, etc.). Monthly audits, smart suggestions, velocity charts, and natural language queries normalize amounts to your base currency using live or cached forex rates.
- **Scheduled Payments with Exact Android Alarms**: Set future expenses that stay excluded from your current balance until due. Native Android `AlarmManager` triggers exact heads-up alerts even if the app is closed, and cancels alarms when transactions are updated or removed.
- **Unified Trips & Split Bills Vault**: Seamlessly track vacation spending in local currencies alongside group bill splitting with custom tax/tip shares and one-tap share summaries in a unified tab.
- **Password Vault UI Overhaul (Argon2id + AES-256-GCM)**: Multiple layout viewing styles (Compact, Detailed, Card/Grid) with single-line auto-lock timers, mobile overflow constraints, dedicated Master PIN encryption, and zero-knowledge escrow recovery.
- **Timeline Waypoint Scrubber**: Fast visual scrub bar with ruler milestones, vibration feedback, 2-second auto-dismiss on mobile, and steady long-press stationary hold inspection.
- **Automated Local Snapshots & Hardened Security**: Disaster recovery snapshots (Daily, Weekly, Monthly, or manual) with AES-256-GCM backup encryption, elevated PBKDF2/Argon2id KDF parameters, and CSV formula injection protection.
- **Recurring Subscriptions with Multi-Cycle Catch-up**: Manage repeating services and automatically catch up multiple missed payment cycles with exact historical due dates.
- **Knowledge Assistant & Auto-Tag Rules**: Teach the app custom slang and regional words (`rule - doodh or dudh is Groceries`, `rule - chai is Food & Drinks`). Supports Devanagari script (`दूध`, `पेट्रोल`), accented Latin (`café`), and international characters via an ultra-lightweight, memory-efficient Trie (<250KB RAM footprint).
- **Month-End Financial Audits**: Actionable letter grades (`A+` to `F`), week-to-week volatility scoring, category concentration metrics, and anomaly detection to keep your spending in check.

---

## Complete Feature Breakdown

### 1. Smart Natural Language Quick Logging

Log expenses effortlessly in seconds using the Quick Log bar.

**Typo-Tolerant Time Parsing**
- Standard formats: `8pm`, `8.30pm`, `8:30 am`, `08-30 PM`, `14:30`.
- Typo variants recognized: `8p`, `8p.`, `8pn`, `8.30pn`, `8:30an`, `8 a.`, `8.30 p.m.`.
- Contextual time inference: `at 8 for dinner` → 8:00 PM; `at 8 for breakfast` → 8:00 AM.
- Time-of-day keywords: `morning` → 9:00 AM, `afternoon` → 1:00 PM, `evening` → 7:00 PM, `night` → 10:00 PM.

**Timezone-Safe Date Parsing**
- Absolute formats: `2nd August`, `aug 2`, `02/08/2026`, `2-8-26`.
- Relative formats: `today`, `yesterday`, `tomorrow`, `day after tomorrow`, `2 days ago`.
- Weekday lookups: `Monday`, `Wednesday`, `Friday` (resolves to the most recent past occurrence).
- Relative periods: `next week`, `last week`, `next month`, `last month`.
- Calendar day validation: Nonexistent dates like `31 April` or `29 February` in non-leap years are automatically caught and corrected.

**Clean Note Extraction**
- Strips date and time tokens, typo variants, currency symbols, and prepositional filler words (`spent on`, `paid for`, `bought at`), saving only clean, concise descriptions.

**Multi-Currency Auto-Detection**
- Supports `₹`, `Rs`, `Rupees`, `$`, `USD`, `€`, `EUR`, `£`, `GBP`, `¥`, `JPY`.
- Interactive category selector lets you adjust auto-detected categories with one tap before saving.

**Inline Math Expressions & Arithmetic Evaluation**
- Directly perform basic arithmetic when entering amounts: addition (`+`), subtraction (`-`), multiplication (`*`), and division (`/`).
- Examples: `250+50 coffee` (logs 300), `1200*2 rent` (logs 2400), `500/2 groceries` (logs 250), `350-40 lunch` (logs 310).
- Safely evaluated on-device through a deterministic token-based arithmetic parser without dynamic code evaluation or injection risks.

---

### 2. Multi-Currency Normalization

Finance-Ally maintains complete currency awareness:
- **Preserved Transaction Currency**: Every expense retains its original currency tag.
- **Unified Aggregations**: Dashboard period spend, live charts, smart suggestions, category rankings, and month-end audits automatically convert amounts to your base currency using live or cached exchange rates.
- **Forex Sync**: Fetches real-time exchange rates when online and persists the sync timestamp in local storage. Graceful offline fallback rates ensure calculations work without internet access.

---

### 3. Scheduled Payments

Expenses set for a future date or time are automatically flagged as **Scheduled Payments**:
- **Excluded from Current Spend**: Kept out of your day-to-day totals, category limits, and audits until the exact scheduled date arrives.
- **Native Android Alarms**: Uses Android's `AlarmManager.setExactAndAllowWhileIdle()` to ensure high-priority alerts fire on time, even if the device is in Doze mode or the app is closed.
- **Lifecycle Synchronization**: Editing, deleting, or converting a scheduled payment to unscheduled immediately cancels the pending Android alarm.
- **In-App Toast**: When a scheduled payment becomes due, an in-app banner notifies you with an instant Undo option.

---

### 4. Privacy, Security & Global Recovery Key

Finance-Ally is built with a zero-knowledge, local-first security architecture:

```
Standard Operations (Current PIN / Password):
  • Change App Password   ───> Enter Current Password   ───> Enter New Password
  • Change Vault Master PIN ─> Enter Current Master PIN ───> Enter New Master PIN
  • Change Backup PIN     ───> Enter Current Backup PIN ───> Enter New Backup PIN

Emergency Fallback ("Forgot Password / PIN?"):
  • Forgot App Password   ───> Enter Global Recovery Key ───> Set New Password
  • Forgot Vault Master PIN ─> Enter Global Recovery Key ───> Set New Master PIN (preserves cards)
  • Forgot Backup PIN     ───> Enter Global Recovery Key ───> Set New Backup PIN (preserves backups)
```

- **Startup App Lock**: Optional PIN lock screen guarding the application UI from unauthorized access on shared devices.
- **Unified Global Recovery Key**: A single emergency recovery key (`FAK-xxxx-xxxx-xxxx-xxxx`) generated during setup allows resetting the App Lock, Vault Master PIN, or Backup PIN if forgotten.
- **Password Vault UI Overhaul (Argon2id + AES-256-GCM)**:
  - Multiple layout viewing styles: **Compact**, **Detailed**, and **Card/Grid** modes.
  - Sensitive credentials encrypted on-device via Argon2id (32 MiB memory cost, 3 iterations) and AES-256-GCM.
  - Zero-knowledge recovery escrow wrapper allowing Master PIN reset without losing stored cards.
  - Single-line auto-lock timer status with quick manual lock and mobile screen overflow constraints.
- **Security Audit Hardening & Cryptographic Integrity**:
  - Elevated PBKDF2 iterations to 600,000 for legacy compatibility alongside memory-hard Argon2id.
  - Strict CSV formula injection neutralization prefixing unsafe symbols (`=`, `+`, `-`, `@`, `\t`, `\r`) with single quotes on export.
  - Constant-time PIN comparisons to eliminate timing attack vectors.
  - Decrypted secrets purged immediately from volatile memory on auto-lock, session timeout, or tab blur.
- **Encrypted Backups & Local Snapshots**:
  - Full database exports can be password-protected as `.json.enc` files via Argon2id (32 MiB memory, 3 iterations) and AES-256-GCM. Backups created with v3.1+ include recovery escrow support for emergency restoration with the Global Recovery Key.
  - Automated disaster recovery snapshots (`Daily`, `Weekly`, `Monthly`, or manual) store up to 5 snapshots in browser storage and native Android `Documents/` storage.
  - Snapshots are encrypted with AES-256-GCM when a Backup PIN is configured. If no Backup PIN is set, snapshots are stored as plaintext JSON and badged with an amber `PLAINTEXT` indicator in Settings.
- **Zero Third-Party Telemetry & Clear Disclosures**:
  - No analytics, tracking SDKs, or cloud accounts.
  - Typography is 100% locally embedded.
  - Network access is strictly restricted to public foreign exchange rate queries and a one-time initial download of the lightweight `Xenova/bge-small-en-v1.5` ONNX model weights (cached in browser storage thereafter).

---

### 5. Unified Trips & Split Bills Vault

Keep travel spending and shared expenses organized in a single dedicated tab:
- **Custom Currency Budgets**: Set dedicated budgets in local foreign currencies (e.g. JPY in Japan, EUR in Europe).
- **Timeline Integration Toggle**: Trip expenses are included in your main daily timeline by default. Users can toggle **"Trip Expenses in Timeline"** OFF in Settings to isolate trip logs exclusively to the Trip Vault.
- **Live & Cached Currency Conversions**: Real-time conversion calculates trip totals in your home base currency for comprehensive tracking.
- **Per-Person Split Calculation**: Easily split bills with friends including custom tip and tax percentages.
- **Payment Status Tracking**: Tap badges to toggle individual participants between Paid and Pending.
- **Formatted Share Summaries**: One-tap copy generates a clean text summary ready to share in messaging apps.
- **Auto-Log Personal Share**: Log your individual share into the daily timeline with a single tap.

---

### 6. Subscriptions & Recurring Bills

- **Recurring Expense Tracking**: Manage subscriptions across weekly, monthly, and yearly cycles.
- **Multi-Cycle Catch-up Loop**: If the app hasn't been opened for several billing cycles, the catch-up processor advances and logs each overdue cycle with its exact historical due date (up to 12 cycles).

---

### 7. Interactive Timeline & Multi-Period Views

- **Single-Line Mobile Toolbar**: Icon-only search, chart jump, multi-log, and view modes designed to never wrap or truncate on mobile screens.
- **Timeline Waypoint Scrubber**: Fixed vertical scrub bar with ruler milestones, dynamic color coding, haptic feedback, 2-second auto-dismiss on mobile, and steady long-press stationary hold inspection.
- **Collapsible Daily Groups**: Tap the calendar icon or date header to collapse or expand any day's logs into a single compact line showing date and daily spend.
- **Multi-Period Aggregated Views**:
  - **Day**: Daily timeline logs with Compact, List, or Grid layout options (loads 30 days by default with historical pagination).
  - **Week**: Weekly spending summaries showing Week Number, Date Range (e.g. `Aug 3 – Aug 9, 2026`), active days, and total spend.
  - **Month**: Monthly cards displaying total spend, daily burn rate, and top category.
  - **Year**: Annual cards showing yearly spend, total transaction count, and the highest spending month highlight.
- **Log Duplication**: Long-press logs or open detail modals to duplicate past expenses into new draft logs.

---

### 8. Monthly Financial Audits & Smart Insights

- **Financial Health Grade**: Monthly ratings from `A+` to `F` reflecting budget adherence and spending consistency.
- **Coefficient of Variation (CV) Volatility**: Weighted category volatility scoring with 4-week bucketing to avoid month-boundary skews.
- **Subscription Creep Detection**: Flags unrecorded recurring charges and unexpected spikes.
- **Smart Spending Suggestions**: Practical recommendations on categories to trim and potential monthly savings.

---

### 9. Knowledge Assistant & Local RAG Vector Engine

- **109 Embedded Financial Rules**: Pre-compiled 384-dimensional unit vector database covering debt avalanche/snowball, emergency funds, SIP investing, credit utilization, and spending psychology.
- **On-Device ONNX Embeddings**: Runs `Xenova/bge-small-en-v1.5` entirely in the browser using WebAssembly and Web Workers.
- **Ultra-Lightweight Trie Dictionary**: Custom Unicode-aware `TrieNode` graph (<250KB memory footprint vs 147MB legacy buffers), saving ~300MB RAM across the main thread and worker threads.
- **Multilingual Auto-Tag Rules**: Create rules in English, Hindi, Devanagari script (`rule - दूध is Groceries`), French, Spanish, and more.
- **Natural Language Range Queries**: Ask questions in plain English (*"How much did I spend on groceries last month?"*, *"What is my all-time spend?"*).

---

## Native Android Integration

Finance-Ally provides a native-grade experience on Android via Capacitor:
- **Notification Channels**: Automatic high-priority notification channels created on first run.
- **Runtime Permissions**: Native `POST_NOTIFICATIONS` permission prompt for Android 13+.
- **AlarmManager Integration**: Exact background alarm scheduling that respects Doze mode and idle states.
- **Offline Filesystem Storage**: Database snapshots saved directly to `Directory.Documents/Finance-Ally/Snapshots/` for easy backup access.

---

## Supported Devices & Installation

- **Web App (PWA)**: Runs in any modern desktop or mobile browser at [https://scru1k.github.io/Finance-ally/](https://scru1k.github.io/Finance-ally/).
- **iOS**:
  1. Open [Finance-Ally](https://scru1k.github.io/Finance-ally/) in Safari.
  2. Tap the **Share** button and select **Add to Home Screen**.
  3. The app installs as a standalone PWA with offline caching and native app behavior.
- **Android App**: Native APK with exact alarms, system notifications, local filesystem access, and zero high-risk background permissions.

---

## License

This project is licensed under the **[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](./LICENSE)** license.

- **Free for Personal Use**: Download, use, and run the app for your personal finances freely.
- **Modifications & Forks**: You are free to fork, adapt, and build upon this project for non-commercial purposes, provided appropriate credit is given and derivative works are shared under the same license.
- **Non-Commercial**: Commercial distribution, sale, or monetization of this software is strictly prohibited without explicit written permission.
