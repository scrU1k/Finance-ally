# Finance-Ally

Finance-Ally is a secure, private-first personal finance and expense tracking application designed for mobile devices using React, TypeScript, and Capacitor.

## Features

- **Private & Local-First**: All data is stored locally on your device.
- **Glassmorphic Design**: A premium, modern UI with frosted glass effects and smooth animations.
- **Trip Vaults**: Separate your expenses by trips or vaults.
- **Smart Parsing**: Automatically scan and parse notifications to suggest categories and log expenses.
- **Secure Backups**: Export and import encrypted backups using strong PBKDF2 derived keys and AES-GCM encryption.

## Security Model

Finance-Ally prioritizes keeping your financial data secure. It's important to understand the two layers of security provided:

### 1. App Lock (Convenience Lock)
The PIN you set to enter the app serves as a **convenience lock** designed to protect your data from casual snooping (e.g., if you hand your phone unlocked to a friend). 
- It uses PBKDF2 (100,000 rounds) and a random salt unique to your profile to securely hash your PIN against brute-force attacks on the lock screen.
- **Limitation**: Because this app runs in a WebView (via Capacitor), JavaScript-level authentication cannot fully protect against an attacker with prolonged physical access, root privileges, or ADB debugging access to the device. An attacker with physical access could extract the local database. Do not consider the app lock a full security guarantee against physical device compromise.

### 2. Backup Encryption (Genuinely Strong)
When you export a backup of your data, the exported file is heavily encrypted.
- The backup uses **AES-256-GCM** encryption.
- The encryption key is derived using **PBKDF2** (100,000 iterations) with a secure random salt.
- Because the data leaves the device as ciphertext, this encryption is genuinely strong. The backup file is safe to store on cloud services or external drives, as it is cryptographically secure against unauthorized access without your password.
