# Finance-Ally — Privacy Policy

**Version:** 3.1 • October 2026  
**License:** [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

---

## Executive Summary

> [!NOTE]
> **Finance-Ally is a 100% offline-first, client-side personal finance vault.**  
> No personal or financial data is ever collected, tracked, or sent to any remote server. Everything is processed and stored locally on your device within sandboxed client storage. Sensitive credentials in the Password Manager Vault and exported backups are protected by AES-256 authenticated encryption.

---

## 1. Zero Data Collection & Zero Telemetry

* **No Centralized Infrastructure:** The developers and maintainers of Finance-Ally do not own, operate, or maintain any centralized database, analytics collectors, tracking endpoints, or user telemetry servers.
* **No Telemetry or Profiling:** No user financial activity, balance amounts, payee names, habits, or behavioral data are ever recorded, collected, sold, or monitored.

---

## 2. Local-Only Storage & Access Control Architecture

* **Sandboxed Client Storage:** All transactions, categories, budgets, scheduled payments, and audit notes are persisted exclusively on your local device within client-side `IndexedDB` and `localStorage` storage sandboxes.
* **Application Gateway Lock:** The optional application lock (PIN or alphanumeric password) provides local interface session gating against casual physical snooping. Data remains contained within the operating system/browser sandboxed storage without cloud transmission.
* **Automated Local Snapshots:**
  * Automated snapshots (Daily, Weekly, Monthly, or Manual) are saved locally within your device's isolated application storage or native `Documents/Finance-Ally/Snapshots/` filesystem directory.
  * **Encrypted Snapshots:** When a Backup PIN is configured, snapshots are encrypted on-device using **AES-256-GCM** authenticated encryption.
  * **Plaintext Snapshots:** If no Backup PIN is set, snapshots are stored as standard unencrypted JSON files.
* **Data Sovereignty:** You retain full, unhindered ownership, control, and exportability of your financial records at all times.

---

## 3. Password Manager Vault Cryptography & Global Recovery Key

* **AES-256-GCM + Argon2id:** Credentials and secrets stored inside the Password Manager Vault are encrypted locally using AES-256-GCM. Encryption keys are derived via memory-hard **Argon2id** (32 MiB memory cost, 3 iterations, 1 parallelism thread).
* **Volatile Memory Only:** Decrypted secrets reside strictly in volatile application memory while actively unlocked and are purged upon app lock, session expiry, or tab close.
* **Unified Global Recovery Key:**
  * A 16-character full Base-62 emergency key (`FAK-xxxx-xxxx-xxxx-xxxx`) is generated on-device.
  * The key is protected using an irreversible one-way Argon2id verifier hash on the device.
  * Operates on a strict **zero-knowledge** basis: because the key is not stored anywhere in reversible plaintext or sent to external servers, no third party can recover it if you lose both your master credentials and recovery key.

---

## 4. On-Device Intelligence & Processing

* **Local Machine Learning:** Semantic smart categorization, category prediction, and dense vector embeddings execute entirely on-device within local Web Worker threads using WebAssembly and ONNX Runtime Web.
* **Pre-Compiled Rule Engine:** 109 financial categorization rules and dynamic search queries execute in memory without external API calls.
* **No Cloud AI / LLM APIs:** Your financial notes, payees, and transaction details are never transmitted to third-party artificial intelligence or machine learning APIs.

---

## 5. Outbound Network Requests

Finance-Ally is designed to operate 100% offline. All application fonts, icons, stylesheets, scripts, and runtime dependencies are bundled directly into the local application package.

The only optional outbound network requests ever initiated by the application are for publicly available operational assets:

1. **Forex Exchange Rates:** Outbound requests to public exchange rate APIs to refresh currency conversion tables. No user identifiers, device IDs, or financial records are included.
2. **Initial Model Download:** When local semantic AI tagging is first initialized, the lightweight quantized embedding model (`bge-small-en-v1.5`, ~33MB INT8) is downloaded once from public model repositories and cached permanently in local browser storage for offline use.

> [!IMPORTANT]
> At no time are your transactions, accounts, notes, balances, passwords, or credentials ever transmitted over any network.

---

## 6. Open Source & License

Finance-Ally is released under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)** license.
