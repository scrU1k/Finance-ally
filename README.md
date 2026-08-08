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
- **Trip Vaults**: Create dedicated trip vaults to track domestic & international travel spending in local currencies without mixing them into your daily home budget.
- **Split Bills**: Manage shared group expenses with friends. Calculate tips/taxes, track who paid, and generate formatted summaries to share.
- **Monthly Financial Audits**: Intelligent month-end reviews with automated letter grades (A+ to F), anomaly detection, top category breakdowns, and personalized savings suggestions.

---

## Complete Feature Breakdown

### 1. Smart Natural Language Quick Logging

Forget tedious multi-step form fields. Just type your expenses naturally into the Quick Log bar and press the arrow button.

**Time Parsing — with Full Typo Tolerance**
- Standard formats: `8pm`, `8.30pm`, `8:30 am`, `08-30 PM`, `14:30`
- Typo variants fully understood: `8p`, `8p.`, `8pn`, `8.30pn`, `8:30an`, `8 a.`, `8.30 p.m.` — all resolve correctly
- Contextual time inference: `at 8 for dinner` → 8:00 PM; `at 8 for breakfast` → 8:00 AM
- Time-of-day words: `morning` → 9:00 AM, `afternoon` → 1:00 PM, `evening` → 7:00 PM, `night` → 10:00 PM

**Date Parsing**
- Absolute: `2nd August`, `aug 2`, `02/08/2026`, `2-8-26`
- Relative: `today`, `yesterday`, `tomorrow`, `day after tomorrow`, `2 days ago`
- Weekday lookup: `Monday`, `Wednesday`, `Friday` (resolves to the most recent past occurrence)
- Relative weeks/months: `next week`, `last week`, `next month`, `last month` (same time, same day-of-week or date)
- Edge-case aware: `31 July → last month` correctly becomes `30 June`

**Clean Note Extraction**
- All date tokens, time tokens, typo variants (`a.`, `p.`, `pn`, `tomorrow`, `day after`, `a.m.`, `p.m.`), currency words, and filler words (`for`, `at`, `spent on`, `paid`, `bought`) are stripped before the description is stored — leaving only the meaningful note.

**Other Parsing Capabilities**
- **Auto Multi-Currency Recognition**: `₹`, `Rs`, `Rupees`, `$`, `USD`, `€`, `EUR`, `£`, `GBP`, `¥`, `JPY`
- **Auto-Categorization**: Intelligent detection for Food, Groceries, Transport, Electronics, Clothing, Housing, Entertainment, Health, Investments, and custom tags
- **Interactive Tag Selector**: Tap the auto-assigned category to switch it before logging
- **Cross Button Clears Input**: Tapping ✕ on a parsed preview removes both the preview card and clears the text box simultaneously

---

### 2. Scheduled Payments

Any expense with a future date/time is automatically recognized as a **Scheduled Payment**.

- **Visual Distinction**: Scheduled expenses appear with a clock icon and a countdown badge (`Due in 2 days`, `Due in 3h`) in the transaction timeline
- **Excluded from Totals**: Scheduled amounts are kept out of your current spend, category limits, and monthly audit until the scheduled moment arrives
- **Native Android Notifications**: When a scheduled payment becomes due, Android fires a heads-up system notification via `AlarmManager.setExactAndAllowWhileIdle()` — this works even when the app is fully closed or in the background
- **In-App Toast**: A floating 5-second toast banner appears with an Undo button when a payment activates
- **Quick Log Indicator**: While typing a future-dated expense in Quick Log, a `🕐 Schedule` badge appears below the payment mode chips to confirm the expense will be treated as scheduled
- **Multi-Log Support**: Selecting a future date in Multi-Log mode flags all expenses in that session as scheduled

---

### 3. Multi-Log Mode

Log multiple expenses to the same date quickly without re-typing the date each time.

- **Direct Calendar Access**: Tap the **Multi-Log** chip in the toolbar — the date picker opens immediately with no intermediate overlay
- **Date Shown Above Input**: The selected date appears as a compact pill centered above the Quick Log text box when Multi-Log is active
- **Change Date Easily**: Tap the date pill to open the calendar and select a different date
- **Exit Multi-Log**: Tap the **Multi-Log** chip again to deactivate. The chip turns purple while active to signal the mode is on
- **Scheduling Aware**: Selecting a future date in Multi-Log auto-schedules every expense in that session

---

### 4. Complete Privacy & Security

- **Startup App Lock**: Optional PIN lock card to guard your database from local access
- **AES-256 Encrypted Backups**: Export your complete financial backup as an encrypted `.json` file with optional PIN protection
- **Separated Settings Cards**: Password locking and backup PIN encryption are split into distinct cards for focused security customization
- **Zero Third-Party Tracking**: No analytics, no advertising SDKs, no external accounts — ever

---

### 5. Trip Vaults

Keep travel expenses organized and separate from your home budget:

- **Custom Currency Budgets**: Set trip budgets in foreign currencies (JPY for Japan, EUR for Europe, USD for US trips)
- **Active Trip Isolation**: Toggle a trip vault active to view and log expenses exclusively within that trip's dedicated timeline
- **Live & Cached Exchange Conversion**: Converts foreign trip spending into your home currency for overall net-worth tracking
- **Data Integrity**: Full local data restore cleanly recovers Trip Vault records, active tags, and travel logs

---

### 6. Split Bills Engine

Managing shared expenses with friends made simple:

- **Tip & Tax Calculation**: Add custom tip or tax percentages to calculate exact per-person shares
- **Paid / Pending Status Toggles**: Tap status badges for each friend to track who has settled up
- **Formatted Share Summaries**: One-tap copy generates a formatted summary listing total cost, individual shares, and payment statuses
- **Auto-Log My Share**: Log your personal portion into the main daily timeline with a single tap

---

### 7. Interactive Daily Timeline & View Modes

- **Adaptive Toolbar**: Three content-fitted chips — **Search**, **Multi-Log**, and a **View Mode** cycler (Compact → List → Grid) — sit in a responsive, wrapping row that scales gracefully to any screen width without truncation or overflow
- **Day & Period Views**: Toggle between Day, Week, Month, Year, and All-Time spending summaries
- **Daily Spending Chart**: Tap the "Spending Trend" header to switch between smooth line charts and detailed bar graphs
- **Search & Filter**: Tap Search to expand an inline search bar with category filter chips; a pulsing blue dot indicates an active filter
- **Minimized Floating Pill**: Collapse the summary bar into a compact floating pill showing your total spend without consuming screen space

---

### 8. Clipboard Auto-Detection & Notification Scanner

- **Sleek Auto-Detection Toast**: Copy a bank SMS or transaction notification to your clipboard — a floating banner appears automatically
- **1-Tap Log & Edit**: Quick-log instantly or tap Edit to open the Transaction Editor pre-filled with the parsed amount, merchant, currency, and category
- **Universal Currency Dictionary**: Supports INR, USD, CAD, AUD, SGD, EUR, GBP, JPY, CNY, CHF, AED, and more
- **Notification Scanner**: Scans bank and payment app notifications passively to surface transactional messages for review

---

### 9. Monthly Financial Audits & Smart Insights

- **Financial Health Grade**: Monthly grade from `A+` to `F` based on budget adherence and spending consistency
- **Top Spending Day**: Highlights your highest expenditure day of the month
- **Anomaly Detection**: Warns about unusual spending spikes in specific categories
- **Actionable Advice**: Tailored suggestions on subscriptions to cut or categories to optimize

---

### 10. Dynamic Tab Navigation

- **Scrolling Tab Row**: Core tabs (`Expenditure`, `Subscriptions`, `Trip Manager`) and More Tools (`Notification Scanner`, `Financial Audit`, `Split Bills`, `Spend Insights`) are organized into a smart dynamic row
- **Clutter-Free Dropdown**: Viewing a core tab shows a chevron dropdown for tools; viewing a tool shows the tool row with a dropdown back to core tabs — always one tap from anywhere

---

## Native Android Integration

Finance-Ally's Android build is a first-class native experience, not just a web wrapper:

- **Native Notification Channel**: A dedicated `scheduled_payments` Android notification channel is created on first launch with `IMPORTANCE_HIGH` (heads-up banners, sound, vibration)
- **Runtime Permission Prompt**: The app requests `POST_NOTIFICATIONS` permission natively via `MainActivity` on Android 13+ devices, ensuring the system dialog appears immediately on first open
- **AlarmManager Scheduling**: Future scheduled payments register exact OS-level alarms via `AlarmManager.setExactAndAllowWhileIdle()` — reliable delivery even when the app is killed
- **BroadcastReceiver Delivery**: `NotificationReceiver` is a registered Android `BroadcastReceiver` that the OS calls directly to fire the notification, bypassing the WebView entirely
- **Bank Notification Listener**: Passively listens for transactional bank notifications to pre-fill expense logging (requires Notification Access permission, optional)
- **SMS Transaction Detection**: Reads incoming SMS messages from known bank senders to auto-surface transaction prompts

---

## Supported Devices & Formats

- **Web App**: Runs in any modern desktop or mobile browser
- **Android App**: Native APK with Android notification channels, AlarmManager scheduling, local file storage, native share integration, and zero high-risk background permissions for a clean Play Protect installation

---

## Version History

| Version | Highlights |
|---------|-----------|
| **v1.1** | Scheduled payments with native AlarmManager notifications, Multi-Log mode, typo-tolerant time parsing (`8pn`, `8a.`, `8.30an`), contextual time inference, clean note extraction, responsive auto-fitting toolbar chips, `flex-wrap` overflow safety, `Schedule` badge in Quick Log preview |
| **v1.0** | Initial release — Quick Log NLP, Trip Vaults, Split Bills, Monthly Audit, Clipboard Detection, Glassmorphic UI |

---

## License

This project is licensed under the **[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](./LICENSE)** license.

- **Free for Personal Use**: Anyone is free to download, use, and run the app for personal finances
- **Modifications & Forks**: You are free to fork, adapt, and build upon this project for non-commercial purposes, provided appropriate credit is given and derivative works are shared under the same license
- **Non-Commercial**: Commercial distribution, sale, or monetization of this software is strictly prohibited without explicit written permission
