# Finance-Ally — Private, Offline Financial Intelligence

> **Know where every rupee goes. Small habits. Big savings.**

Finance-Ally is a premium, beautifully crafted personal finance app designed for users who value privacy, speed, and sleek modern design. It operates 100% offline on your device, ensuring your sensitive spending data never touches a remote server or cloud network.

*Made with Antigravity*

---

## Why Choose Finance-Ally?

- **100% Offline & Private**: All your financial logs, trip budgets, and notes stay sandboxed on your device. No signup required, no cloud tracking, no hidden data sales. A local PIN lock guards your data from anyone else with access to your phone.
- **Stunning Glassmorphic Design**: Built with frosted glass surfaces, dynamic lighting, fluid micro-animations, and custom ambient glowing active tabs that feel alive.
- **Smart Natural Language Quick Logging**: Simply type expenses the way you think (`450rs coffee 2nd aug 8pm`, `250 petrol tomorrow at 9a`, `1200 dinner at 8pn`) — Finance-Ally parses the amount, date, time, category, and payment method automatically.
- **Scheduled Payments**: Set any expense for a future date and time. It registers as a scheduled payment, is excluded from your current total until due, and fires a native Android system notification the moment it activates — even if the app is closed.
- **Knowledge Assistant & Auto-Tag Rules**: Teach the app custom regional words, slang, or translations (`rule - doodh or dudh is Groceries`, `rule - chai is Food & Drinks`). Supports Devanagari script (`दूध`, `चहा`), French (`café`), Spanish, etc., with sub-millisecond O(L) Trie auto-detection during Quick Logging.
- **Trip Vaults**: Create dedicated trip vaults to track domestic & international travel spending in local currencies without mixing them into your daily home budget.
- **Split Bills**: Manage shared group expenses with friends. Calculate tips/taxes, track who paid, and generate formatted summaries to share.
- **Monthly Financial Audits**: Intelligent month-end reviews with automated letter grades (A+ to F), anomaly detection, top category breakdowns, and personalized savings suggestions.

---

## Complete Feature Breakdown

### 1. Smart Natural Language Quick Logging

Forget tedious multi-step form fields. Just type your expenses naturally into the Quick Log bar and press the arrow button.

**Time Parsing — with Full Typo Tolerance**
- Standard formats: `8pm`, `8.30pm`, `8:30 am`, `08-30 PM`, `14:30`.
- Typo variants fully understood: `8p`, `8p.`, `8pn`, `8.30pn`, `8:30an`, `8 a.`, `8.30 p.m.` — all resolve correctly.
- Contextual time inference: `at 8 for dinner` → 8:00 PM; `at 8 for breakfast` → 8:00 AM.
- Time-of-day words: `morning` → 9:00 AM, `afternoon` → 1:00 PM, `evening` → 7:00 PM, `night` → 10:00 PM.

**Date Parsing**
- Absolute: `2nd August`, `aug 2`, `02/08/2026`, `2-8-26`.
- Relative: `today`, `yesterday`, `tomorrow`, `day after tomorrow`, `2 days ago`.
- Weekday lookup: `Monday`, `Wednesday`, `Friday` (resolves to the most recent past occurrence).
- Relative weeks/months: `next week`, `last week`, `next month`, `last month` (same time, same day-of-week or date).
- Edge-case aware: `31 July → last month` correctly becomes `30 June`.

**Clean Note Extraction**
- All date tokens, time tokens, typo variants (`a.`, `p.`, `pn`, `tomorrow`, `day after`, `a.m.`, `p.m.`), currency words, and filler words (`for`, `at`, `spent on`, `paid`, `bought`) are stripped before the description is stored — leaving only the meaningful note.

**Other Parsing Capabilities**
- **Auto Multi-Currency Recognition**: `₹`, `Rs`, `Rupees`, `$`, `USD`, `€`, `EUR`, `£`, `GBP`, `¥`, `JPY`.
- **Auto-Categorization**: Intelligent detection for Food, Groceries, Transport, Electronics, Clothing, Housing, Entertainment, Health, Investments, and custom tags.
- **Interactive Tag Selector**: Tap the auto-assigned category to switch it before logging.

---

### 2. Notification Extraction (Offline & Privacy-First)

Finance-Ally features a dedicated **Notification Extraction** module designed to convert bank debit alerts, UPI messages, and transaction SMS text into logged expenses.

#### Extraction Capabilities
- **One-Tap Clipboard Extraction**: Copy a debit alert from HDFC, ICICI, SBI, Axis, GPay, Paytm, Swiggy, etc., and tap **"Paste Clipboard"** to extract the amount, merchant name, currency, and category instantly.
- **Custom Pattern Engine**: Create custom regex/placeholder templates (e.g. `Debited {CURRENCY} {AMOUNT} to {MERCHANT}`) to support any regional bank or payment app.

---

### 3. Scheduled Payments

Any expense with a future date/time is automatically recognized as a **Scheduled Payment**.

- **Excluded from Totals**: Scheduled amounts are kept out of your current spend, category limits, and monthly audit until the scheduled moment arrives.
- **Native Android Notifications**: When a scheduled payment becomes due, Android fires a heads-up system notification.
- **In-App Toast**: A floating 5-second toast banner appears with an Undo button when a payment activates.
- **Multi-Log Support**: Selecting a future date in Multi-Log mode flags all expenses in that session as scheduled.

---

### 4. Complete Privacy & Security

- **Startup App Lock**: Optional PIN lock card to guard your database from local access.
- **RSA-2048 + AES-256-GCM Encrypted Backups**: Export your complete financial backup as an encrypted `.json.enc` file with PIN protection. Furthermore enabling auto-backup ensures data `Snapshots` are backed onto device storage, fully encrypted as per user convenience - `Daily`, `Weekly`, `Monthly`, `Off(Manual)`. These snapshots can be restored by the user at any time, and to upto 5 snapshots are stored on-device at once.
- **Zero Third-Party Tracking**: No analytics, no advertising SDKs, no external accounts — ever.

---

### 5. Trip Vaults

Keep travel expenses organized and separate from your home budget:

- **Custom Currency Budgets**: Set trip budgets in foreign currencies (JPY for Japan, EUR for Europe, USD for US trips).
- **Active Trip Isolation**: Toggle a trip vault active to view and log expenses exclusively within that trip's dedicated timeline.
- **Live & Cached Exchange Conversion**: Converts foreign trip spending into your home currency for overall net-worth tracking.
- **Data Integrity**: Full local data restore cleanly recovers Trip Vault records, active tags, and travel logs.

---

### 6. Split Bills Engine

Managing shared expenses with friends made simple:

- **Tip & Tax Calculation**: Add custom tip or tax percentages to calculate exact per-person shares.
- **Paid / Pending Status Toggles**: Tap status badges for each friend to track who has settled up.
- **Formatted Share Summaries**: One-tap copy generates a formatted summary listing total cost, individual shares, and payment statuses.
- **Auto-Log My Share**: Log your personal portion into the main daily timeline with a single tap.

---

### 7. Interactive Timeline & Multi-Period View Engine

- **Single-Line Controls Toolbar**: Built with icon-only **Search**, direct **Chart Jump**, **Multi-Log**, and **View** pill buttons — guaranteed to sit on a single line on any mobile screen without wrapping or truncation.
- **Collapsible Daily Headers**: Click the cyan calendar icon or date text to collapse/expand that day's logs into a single compact line showing the date and total daily spend. When collapsed, the icon dynamically switches to a grey chevron down icon.
- **Multi-Period Aggregated Views**: Tap the **View** button to open a floating glassmorphic popover menu offering 4 time grouping modes:
  - **Day** (Default): Daily timeline logs with `Compact`, `List`, or `Grid` card layout options. Loads the last 30 active days by default with a `Load older history` button.
  - **Week**: Aggregated weekly spending cards displaying Week Number, Date Range (e.g. `Aug 3 – Aug 9, 2026`), active spending days, and total spend — no individual item clutter.
  - **Month**: Aggregated monthly cards showing Month Name (e.g. `August 2026`), total monthly spend, and daily average.
  - **Year**: Clean annual overview cards showing Year (e.g. `2026`), total yearly spend, total logs, and the **Highest Spending Month** highlight (e.g. `Highest: August (₹45,200)`).
- **Log Duplication**: Long-pressing logs reveals a Copy icon button in the floating selection bar to bulk-duplicate old recurring payments into new draft logs. Detail view modals also feature a dedicated Copy button.
- **Trip Tag Quick Logging**: Choose or switch Trip Tags directly inside the Quick Log preview chip bar before saving.
- **Side-Swipe Month Date Picker**: In the custom calendar date selector, swipe left or right to seamlessly navigate between months.
- **Monthly & Annual Review Notes**: Dedicated `<Month Name, Year> Note` and `<Year> Note` cards appear in timeline feeds. 

---

### 8. Monthly Financial Audits & Smart Insights

- **Financial Health Grade**: Monthly grade from `A+` to `F` based on budget adherence and spending consistency (with explicit `O (Building Baseline)` indicator for accounts under 3 months).
- **Coefficient of Variation (CV) Volatility**: Measures week-to-week spend erraticness weighted by category spend share, with week bucketing capped at 4 to eliminate month-boundary distortions.
- **Subscription Creep Anomaly Detection**: Cross-references transaction frequencies to flag unrecorded subscriptions while preventing false positives on common recurring purchases.
- **Actionable Advice**: Tailored suggestions on subscriptions to cut or categories to optimize.

---

### 9. Dynamic Tab Navigation

- **Scrolling Tab Row**: Core tabs (`Expenditure`, `Subscriptions`, `Trip Manager`) and More Tools (`Notification Extraction`, `Financial Audit`, `Split Bills`, `Spend Insights`) are organized into a smart dynamic row.
- **Clutter-Free Dropdown**: Viewing a core tab shows a chevron dropdown for tools; viewing a tool shows the tool row with a dropdown back to core tabs — always one tap from anywhere.

---

### 10. Knowledge Assistant & Offline RAG Vector Engine

Finance-Ally 2.0 features a state-of-the-art, 100% offline **Financial Knowledge Engine** powered by `Xenova/bge-small-en-v1.5` ONNX WebAssembly embeddings, an intent-driven expert system, and an auto-tag rules parser.

- **109 Embedded Master Financial Rules**: Pre-compiled 384-dimensional unit vector database covering 11 core financial domains:
  - `investment_basics` (SIP, Index funds, EPF, NPS, ELSS, Sovereign Gold Bonds, rebalancing)
  - `debt_management` (Debt avalanche, snowball, credit card minimum pay trap, gold loans, BNPL)
  - `budgeting_framework` (50/30/20 rule, zero-based budgeting, envelope method)
  - `spending_pattern` (Food delivery premiums, UPI blind spots, salary day splurges, weekend spikes)
  - `savings_advice` (3–6 month emergency funds, liquid funds vs savings, paying yourself first)
  - `credit_health` (CIBIL mechanics, 30% utilization rule, old card preservation)
  - `forex_travel` (Zero-forex markup cards, DCC traps, forex cards)
  - `large_purchase`, `subscription_audit`, `category_trend`, `financial_concepts`
- **Hybrid Custom & Pre-built Rules Hierarchy**: Evaluates user-defined custom rules first (e.g. `[CUSTOM] max 5000 on Food`), then seamlessly defaults to the 109 pre-built financial rules to audit discretionary spending and budget health.
- **Natural Language Dynamic Range Queries**: Parse expenses and totals across any custom date range (e.g. *"in the past 3 months"*, *"last 2 weeks"*, *"past 10 days"*, *"in the last 2 years"*).
- **All-Time & Lifetime Spend Insights**: Instantly compute overall expenditure, top category spend, and transaction velocity since account creation (*"What is my all-time total spend?"*).
- **Multi-Point Structured Financial Assessment**: Holistic questions (*"Am I doing good?"*, *"Am I spending wisely?"*) generate a detailed 4-point breakdown:
  1. Financial Health Score (0–100) + Status Badge (**Excellent**, **Healthy**, **Fair**, **Needs Attention**)
  2. Monthly Budget & Pace (MTD spent, projected month-end, historical ceiling, % delta)
  3. Category Concentration (Top category % of spend)
  4. Active Rules Compliance Audit & Actionable Recommendation
- **Dual-Metric Daily Average Rate**: Resolves ambiguities by clearly distinguishing between:
  - **Calendar Daily Burn Rate**: `Total Month Spend / Days Elapsed in Month` (e.g. `₹82/day`).
  - **Active Spending Day Average**: `Total Month Spend / Unique Purchase Days` (e.g. `₹203.75/spending day`).
- **Interactive Timeframe Toggle (`Week` | `Month` | `Year`)**: Toggle spending insight cards dynamically between weekly, monthly, and yearly velocity.
- **Multilingual & Devanagari Script Support**: Powered by a 512-slot Unicode Trie memory engine. Create auto-tagging rules in Devanagari script (`rule - दूध is Groceries`), French, Hindi, Spanish, Marathi, etc.
- **Commands Pop-Over Modal**: Tap **Commands** to open an interactive cheat sheet of all natural language commands. All commands execute seamlessly regardless of uppercase or lowercase input.

---

## Native Android Integration

Finance-Ally's Android build is a first-class native experience, not just a web wrapper:

- **Native Notification Channel**: A dedicated Android notification channel is created on first launch with high-priority heads-up alerts.
- **Runtime Permission Prompt**: The app requests `POST_NOTIFICATIONS` permission natively on Android 13+ devices, ensuring the system dialog appears immediately on first open.
- **AlarmManager Background Scheduling**: Future scheduled payments register exact OS-level alarms via `AlarmManager.setExactAndAllowWhileIdle()`, firing system notifications even when the app is completely closed.

---

## Supported Devices & Formats

- **Web App**: Runs in any modern desktop or mobile browser.
- **Android App**: Native APK with Android notification channels, AlarmManager scheduling, local file storage, native share integration, and zero high-risk background permissions for a clean Play Protect installation.

---

## License

This project is licensed under the **[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](./LICENSE)** license.

- **Free for Personal Use**: Anyone is free to download, use, and run the app for personal finances
- **Modifications & Forks**: You are free to fork, adapt, and build upon this project for non-commercial purposes, provided appropriate credit is given and derivative works are shared under the same license
- **Non-Commercial**: Commercial distribution, sale, or monetization of this software is strictly prohibited without explicit written permission
