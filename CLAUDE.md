# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a Chrome extension (Manifest V3) called "Quick Login Manager" that helps users store and auto-fill login credentials. The extension stores encrypted account data using Chrome's sync storage and provides automated form filling across web pages.

### Core Components:

- **shared-crypto.js**: Unified encryption/decryption library used across all contexts (background, popup, content scripts)
- **background.js**: Service worker handling storage operations and communication, uses shared crypto library via importScripts
- **popup.js** (popup-debug.js): Popup interface logic for managing accounts with debug functionality
- **content.js**: Injected into web pages to detect login forms and provide auto-fill functionality
- **crypto.js**: Compatibility wrapper that creates global instances of shared crypto classes
- **url-utils.js**: URL matching utilities supporting both domain and path matching modes

### Code Architecture Improvements:
- **Shared Library**: `SharedPasswordCrypto` class consolidates all encryption logic in one place
- **Environment Detection**: Handles different contexts (browser window, Service Worker, content script)
- **Backward Compatibility**: Existing code continues to work via compatibility wrappers
- **Reduced Duplication**: Eliminates duplicated crypto logic between files

### Key Features:
- Encrypted password storage with master key
- Automatic login form detection
- Smart form filling with custom CSS selectors
- URL matching (domain or path-based)
- Chrome sync storage integration

## Development Commands

This extension has no build system - it's plain JavaScript. To develop:

1. **Load Extension**: 
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select project folder

2. **Reload Extension**: Click reload button in Chrome extensions page after code changes

3. **Debug**: Use Chrome DevTools on popup, and check Console in DevTools for background script logs

## Code Conventions

- **Language**: Mixed Chinese and English (UI text in Traditional Chinese, code comments in Chinese, variable names in English)
- **Storage**: Uses Chrome's `chrome.storage.sync` API for account data
- **Encryption**: Custom XOR-based encryption with master key stored in memory during session
- **Form Detection**: Automatic detection of login forms using common selectors
- **Communication**: Chrome runtime messaging between background, content, and popup scripts
- **Shared Code**: Common functionality consolidated in `shared-crypto.js` to reduce duplication

## Important Implementation Details

### URL Matching System
The extension supports two matching modes per account:
- `domain`: Matches by hostname/origin (default)
- `path`: Matches by full URL path

### Encryption Flow
1. Master key stored temporarily in background script memory
2. Account data encrypted before storage using XOR + Base64
3. Decryption happens in background script, decrypted data sent to content scripts
4. Checksum validation ensures decryption integrity

### Content Script Auto-fill
- Detects login forms on page load and DOM changes
- Shows floating buttons near password fields when focused
- Supports both single account auto-fill and multi-account selection
- Can be disabled via localStorage setting

### Security Considerations
- **Master Key Persistence**: Master key now encrypted and stored locally using device-specific encryption
- **Dual Storage**: Master key stored both in memory (Service Worker) and encrypted in chrome.storage.local
- **Automatic Recovery**: Service Worker automatically loads encrypted master key on startup
- **Configurable Timeout**: Master key persistence timeout configurable (default 8 hours)
- **Device-Specific Encryption**: Uses extension ID + install timestamp for device-specific key derivation
- Extension requests `<all_urls>` permission for form filling

### Master Key Improvements (Latest Update)
The extension now implements persistent master key storage to solve Service Worker lifecycle issues:

**New Features:**
- Master keys encrypted with device-specific keys before local storage
- Automatic master key recovery when Service Worker restarts
- Configurable persistence timeouts (1-168 hours, default 8 hours)
- Debug tools in Settings tab for testing master key functionality
- Enhanced security with dual-layer protection (memory + encrypted storage)

**Storage Flow:**
1. User sets master key → stored in Service Worker memory
2. Master key encrypted with device key → stored in chrome.storage.local
3. Service Worker restart → automatically loads encrypted master key
4. Expiration handling → auto-cleanup of expired keys