// 載入共用模組
importScripts('shared-crypto.js', 'url-utils.js');

chrome.runtime.onInstalled.addListener(() => {
    console.log('Quick Login Manager 已安装');
});

chrome.action.onClicked.addListener((tab) => {
    chrome.action.openPopup();
});

// 存儲主密鑰（僅在背景頁面生命週期內）
let backgroundMasterKey = null;
let masterKeySetTime = null;
const crypto = new SharedPasswordCrypto();

// Service Worker 啟動時嘗試載入主金鑰
async function initializeMasterKey() {
    try {
        const savedMasterKey = await crypto.loadMasterKeyFromStorage();
        if (savedMasterKey) {
            backgroundMasterKey = savedMasterKey;
            masterKeySetTime = Date.now();
            crypto.setMasterKey(savedMasterKey);
            console.log('已從存儲載入主金鑰');
        }
    } catch (error) {
        console.error('載入主金鑰失敗:', error);
    }
}

// Service Worker 生命週期事件
self.addEventListener('activate', async () => {
    console.log('Service Worker activated');
    await initializeMasterKey();
});

self.addEventListener('install', () => {
    console.log('Service Worker installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'setMasterKey') {
        backgroundMasterKey = message.masterKey;
        masterKeySetTime = Date.now();
        crypto.setMasterKey(message.masterKey);
        
        // 將主金鑰加密存儲到本地
        crypto.saveMasterKeyToStorage(message.masterKey, message.sessionTimeout || 8 * 60 * 60 * 1000)
            .then(success => {
                if (success) {
                    console.log('主密鑰已設定並存儲到本地');
                } else {
                    console.warn('主密鑰設定成功但存儲失敗');
                }
            });
        
        sendResponse({ success: true });
        return true;
    }
    
    if (message.action === 'getMasterKey') {
        // 如果記憶體中沒有主金鑰，嘗試從存儲載入
        if (!backgroundMasterKey) {
            initializeMasterKey().then(() => {
                const keyStatus = {
                    masterKey: backgroundMasterKey,
                    hasKey: !!backgroundMasterKey,
                    setTime: masterKeySetTime
                };
                sendResponse(keyStatus);
            });
            return true;
        }
        
        const keyStatus = {
            masterKey: backgroundMasterKey,
            hasKey: !!backgroundMasterKey,
            setTime: masterKeySetTime
        };
        sendResponse(keyStatus);
        return true;
    }
    
    if (message.action === 'clearMasterKey') {
        backgroundMasterKey = null;
        masterKeySetTime = null;
        crypto.clearMasterKey();
        
        // 清除存儲的主金鑰
        crypto.clearMasterKeyFromStorage()
            .then(success => {
                console.log('主密鑰已清除:', success);
                sendResponse({ success });
            });
        
        return true;
    }
    
    if (message.action === 'getDecryptedAccounts') {
        chrome.storage.sync.get(['accounts'], async (result) => {
            const encryptedAccounts = result.accounts || [];
            
            // 如果記憶體中沒有主金鑰，嘗試從存儲載入
            if (!backgroundMasterKey) {
                await initializeMasterKey();
            }
            
            if (!backgroundMasterKey) {
                // 仍然沒有主密鑰，返回空數組
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
        chrome.storage.sync.get(['accounts'], async (result) => {
            const encryptedAccounts = result.accounts || [];
            
            // 如果記憶體中沒有主金鑰，嘗試從存儲載入
            if (!backgroundMasterKey) {
                await initializeMasterKey();
            }
            
            if (!backgroundMasterKey) {
                // 仍然沒有主密鑰，返回失敗
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