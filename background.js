// Manifest V3不支援importScripts，需要直接複製所需的類別

// 首先載入URLUtils（直接複製）
class URLUtils {
    static isSupportedProtocol(url) {
        return url && (url.startsWith('http://') || url.startsWith('https://'));
    }
    
    static safeGetOrigin(url) {
        if (!this.isSupportedProtocol(url)) return null;
        try {
            return new URL(url).origin;
        } catch (error) {
            return null;
        }
    }
    
    static safeGetHostname(url) {
        if (!this.isSupportedProtocol(url)) return null;
        try {
            return new URL(url).hostname;
        } catch (error) {
            return null;
        }
    }
    
    static urlsMatch(url1, url2, matchMode = 'domain') {
        if (!url1 || !url2) return false;
        if (url1 === url2) return true;
        
        if (matchMode === 'path') {
            return this.pathsMatch(url1, url2);
        } else {
            return this.domainsMatch(url1, url2);
        }
    }
    
    static domainsMatch(url1, url2) {
        if (!url1 || !url2) return false;
        
        const origin1 = this.safeGetOrigin(url1);
        const origin2 = this.safeGetOrigin(url2);
        if (origin1 && origin2 && origin1 === origin2) return true;
        
        const hostname1 = this.safeGetHostname(url1);
        const hostname2 = this.safeGetHostname(url2);
        if (hostname1 && hostname2 && hostname1 === hostname2) return true;
        
        return false;
    }
    
    static pathsMatch(url1, url2) {
        if (!url1 || !url2) return false;
        
        try {
            const urlObj1 = new URL(url1);
            const urlObj2 = new URL(url2);
            
            if (urlObj1.origin !== urlObj2.origin) {
                return false;
            }
            
            const path1 = urlObj1.pathname.replace(/\/$/, '') || '/';
            const path2 = urlObj2.pathname.replace(/\/$/, '') || '/';
            
            if (path1 === '/' || path2 === '/') {
                return true;
            }
            
            return path2.startsWith(path1) || path1.startsWith(path2);
        } catch (error) {
            console.warn('路徑匹配失敗:', url1, url2, error);
            return this.domainsMatch(url1, url2);
        }
    }
    
    static filterAccountsByUrl(accounts, targetUrl, excludeDecryptionFailed = false) {
        if (!Array.isArray(accounts) || !targetUrl) return [];
        
        return accounts.filter(account => {
            if (excludeDecryptionFailed && account.decryptionFailed) return false;
            const matchMode = account.matchMode || 'domain';
            return this.urlsMatch(account.url, targetUrl, matchMode);
        });
    }
}

// 然後是crypto類別
class PasswordCrypto {
    constructor() {
        this.masterKey = null;
    }
    
    setMasterKey(key) {
        this.masterKey = key;
    }
    
    clearMasterKey() {
        this.masterKey = null;
    }
    
    hasMasterKey() {
        return this.masterKey !== null && this.masterKey !== '';
    }
    
    encrypt(text, key) {
        if (!text || !key) return text;
        
        try {
            const keyHash = this.hashString(key);
            let encrypted = '';
            
            for (let i = 0; i < text.length; i++) {
                const keyChar = keyHash.charCodeAt(i % keyHash.length);
                const textChar = text.charCodeAt(i);
                encrypted += String.fromCharCode(textChar ^ keyChar);
            }
            
            const checksum = this.hashString(text).substring(0, 8);
            const result = checksum + '|' + encrypted;
            
            return btoa(result);
        } catch (error) {
            console.error('加密失敗:', error);
            return text;
        }
    }
    
    decrypt(encryptedText, key) {
        if (!encryptedText || !key) return '';
        
        try {
            const decoded = atob(encryptedText);
            const parts = decoded.split('|');
            
            if (parts.length !== 2) {
                return '';
            }
            
            const [expectedChecksum, encrypted] = parts;
            const keyHash = this.hashString(key);
            let decrypted = '';
            
            for (let i = 0; i < encrypted.length; i++) {
                const keyChar = keyHash.charCodeAt(i % keyHash.length);
                const encryptedChar = encrypted.charCodeAt(i);
                decrypted += String.fromCharCode(encryptedChar ^ keyChar);
            }
            
            const actualChecksum = this.hashString(decrypted).substring(0, 8);
            if (expectedChecksum !== actualChecksum) {
                console.warn('解密校驗失敗，可能密鑰錯誤');
                return '';
            }
            
            return decrypted;
        } catch (error) {
            console.error('解密失敗:', error);
            return '';
        }
    }
    
    hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash.toString();
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        return Math.abs(hash).toString(36);
    }
    
    decryptAccount(account) {
        if (!this.hasMasterKey() || !account.encrypted) {
            return account;
        }
        
        const decryptedUsername = this.decrypt(account.username, this.masterKey);
        const decryptedPassword = this.decrypt(account.password, this.masterKey);
        
        return {
            ...account,
            username: decryptedUsername,
            password: decryptedPassword,
            decryptionFailed: !decryptedUsername && !decryptedPassword
        };
    }
    
    decryptAccounts(accounts) {
        if (!Array.isArray(accounts)) return [];
        return accounts.map(account => this.decryptAccount(account));
    }
}

chrome.runtime.onInstalled.addListener(() => {
    console.log('Quick Login Manager 已安装');
});

chrome.action.onClicked.addListener((tab) => {
    chrome.action.openPopup();
});

// 存儲主密鑰（僅在背景頁面生命週期內）
let backgroundMasterKey = null;
let masterKeySetTime = null;
const crypto = new PasswordCrypto();

// Service Worker 生命週期事件
self.addEventListener('activate', () => {
    console.log('Service Worker activated');
});

self.addEventListener('install', () => {
    console.log('Service Worker installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'setMasterKey') {
        backgroundMasterKey = message.masterKey;
        masterKeySetTime = Date.now();
        crypto.setMasterKey(message.masterKey);
        console.log('主密鑰已設定到 Background Service Worker 記憶體中');
        sendResponse({ success: true });
        return true;
    }
    
    if (message.action === 'getMasterKey') {
        const keyStatus = {
            masterKey: backgroundMasterKey,
            hasKey: !!backgroundMasterKey,
            setTime: masterKeySetTime
        };
        sendResponse(keyStatus);
        return true;
    }
    
    if (message.action === 'getDecryptedAccounts') {
        chrome.storage.sync.get(['accounts'], (result) => {
            const encryptedAccounts = result.accounts || [];
            
            if (!backgroundMasterKey) {
                // 沒有主密鑰，返回空數組
                sendResponse({ success: false, accounts: [] });
                return;
            }
            
            try {
                // 解密帳號
                const decryptedAccounts = crypto.decryptAccounts(encryptedAccounts);
                
                // 根據URL過濾帳號
                const currentUrl = message.url;
                const siteAccounts = URLUtils.filterAccountsByUrl(
                    decryptedAccounts, 
                    currentUrl, 
                    true // 排除解密失敗的帳號
                );
                
                sendResponse({ success: true, accounts: siteAccounts });
            } catch (error) {
                console.error('Background解密帳號失敗:', error);
                sendResponse({ success: false, accounts: [] });
            }
        });
        return true;
    }
    
    if (message.action === 'getAllDecryptedAccounts') {
        chrome.storage.sync.get(['accounts'], (result) => {
            const encryptedAccounts = result.accounts || [];
            
            if (!backgroundMasterKey) {
                // 沒有主密鑰，返回失敗
                sendResponse({ success: false, accounts: [], error: 'No master key' });
                return;
            }
            
            try {
                // 解密所有帳號（不做 URL 過濾）
                const decryptedAccounts = crypto.decryptAccounts(encryptedAccounts);
                console.log('Background 解密了', decryptedAccounts.length, '個帳號');
                
                sendResponse({ success: true, accounts: decryptedAccounts });
            } catch (error) {
                console.error('Background 解密所有帳號失敗:', error);
                sendResponse({ success: false, accounts: [], error: error.message });
            }
        });
        return true;
    }
    
    if (message.action === 'getAccounts') {
        chrome.storage.sync.get(['accounts'], (result) => {
            sendResponse({ accounts: result.accounts || [] });
        });
        return true;
    }
    
    if (message.action === 'saveAccount') {
        chrome.storage.sync.get(['accounts'], (result) => {
            const accounts = result.accounts || [];
            accounts.push(message.account);
            
            chrome.storage.sync.set({ accounts: accounts }, () => {
                sendResponse({ success: true });
            });
        });
        return true;
    }
    
    if (message.action === 'deleteAccount') {
        chrome.storage.sync.get(['accounts'], (result) => {
            const accounts = result.accounts || [];
            const filteredAccounts = accounts.filter(acc => acc.id !== message.accountId);
            
            chrome.storage.sync.set({ accounts: filteredAccounts }, () => {
                sendResponse({ success: true });
            });
        });
        return true;
    }
    
    if (message.action === 'updateAccount') {
        chrome.storage.sync.get(['accounts'], (result) => {
            const accounts = result.accounts || [];
            const index = accounts.findIndex(acc => acc.id === message.account.id);
            
            if (index !== -1) {
                accounts[index] = message.account;
                chrome.storage.sync.set({ accounts: accounts }, () => {
                    sendResponse({ success: true });
                });
            } else {
                sendResponse({ success: false, error: '帳號不存在' });
            }
        });
        return true;
    }
    
    if (message.action === 'changeMasterKey') {
        if (!backgroundMasterKey) {
            sendResponse({ success: false, error: '沒有當前主密鑰' });
            return true;
        }
        
        chrome.storage.sync.get(['accounts'], (result) => {
            try {
                const encryptedAccounts = result.accounts || [];
                const oldKey = backgroundMasterKey;
                const newKey = message.newMasterKey;
                
                // 先解密所有帳號
                const decryptedAccounts = crypto.decryptAccounts(encryptedAccounts);
                
                // 用新密鑰重新加密
                crypto.setMasterKey(newKey);
                const reencryptedAccounts = decryptedAccounts.map(account => {
                    return crypto.encryptAccount(account);
                });
                
                // 儲存重新加密的帳號
                chrome.storage.sync.set({ accounts: reencryptedAccounts }, () => {
                    // 更新 background 的主密鑰
                    backgroundMasterKey = newKey;
                    masterKeySetTime = Date.now();
                    
                    console.log('主密鑰已更改，重新加密了', reencryptedAccounts.length, '個帳號');
                    sendResponse({ success: true });
                });
            } catch (error) {
                console.error('更改主密鑰失敗:', error);
                sendResponse({ success: false, error: error.message });
            }
        });
        return true;
    }
    
    // 舊的 autoFillCurrent 邏輯已被移除，現在使用 content script 的原有自動填入系統
});

async function getCurrentTabUrl() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return new URL(tab.url).origin;
}

function autoFillCredentials(account) {
    let usernameField, passwordField;
    
    if (account.usernameSelector) {
        usernameField = document.querySelector(account.usernameSelector);
    } else {
        usernameField = document.querySelector('input[type="text"]') ||
                       document.querySelector('input[type="email"]') ||
                       document.querySelector('input[name*="user"]') ||
                       document.querySelector('input[name*="email"]') ||
                       document.querySelector('input[id*="user"]') ||
                       document.querySelector('input[id*="email"]');
    }
    
    if (account.passwordSelector) {
        passwordField = document.querySelector(account.passwordSelector);
    } else {
        passwordField = document.querySelector('input[type="password"]');
    }
    
    if (usernameField) {
        usernameField.value = account.username;
        usernameField.dispatchEvent(new Event('input', { bubbles: true }));
        usernameField.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    if (passwordField) {
        passwordField.value = account.password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.accounts) {
        console.log('帳號資料已更新');
    }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        checkAndShowAutoFillOption(tab);
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        checkAndShowAutoFillOption(tab);
    }
});

async function checkAndShowAutoFillOption(tab) {
    try {
        const url = new URL(tab.url).origin;
        const result = await chrome.storage.sync.get(['accounts']);
        const accounts = result.accounts || [];
        
        const siteAccounts = URLUtils.filterAccountsByUrl(accounts, url);
        
        if (siteAccounts.length > 0) {
            chrome.action.setBadgeText({
                text: siteAccounts.length.toString(),
                tabId: tab.id
            });
            chrome.action.setBadgeBackgroundColor({
                color: '#007bff'
            });
        } else {
            chrome.action.setBadgeText({
                text: '',
                tabId: tab.id
            });
        }
    } catch (error) {
        console.error('檢查自動填入選項失敗:', error);
    }
}