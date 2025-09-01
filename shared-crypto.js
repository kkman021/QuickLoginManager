// 共用的加密工具類 - 可在所有環境中使用
class SharedPasswordCrypto {
    constructor() {
        this.masterKey = null;
    }
    
    // 設定主密鑰
    setMasterKey(key) {
        this.masterKey = key;
    }
    
    // 清除主密鑰
    clearMasterKey() {
        this.masterKey = null;
    }
    
    // 檢查是否有主密鑰
    hasMasterKey() {
        return this.masterKey !== null && this.masterKey !== '';
    }
    
    // 簡單的AES風格加密 (使用XOR + Base64)
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
            
            // 添加校驗碼以驗證解密正確性
            const checksum = this.hashString(text).substring(0, 8);
            const result = checksum + '|' + encrypted;
            
            return btoa(result);
        } catch (error) {
            console.error('加密失敗:', error);
            return text;
        }
    }
    
    // 解密函數
    decrypt(encryptedText, key) {
        if (!encryptedText || !key) return '';
        
        try {
            const decoded = atob(encryptedText);
            const parts = decoded.split('|');
            
            if (parts.length !== 2) {
                // 格式不正確，可能是舊版本未加密的數據
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
            
            // 驗證校驗碼
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
    
    // 簡單哈希函數
    hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash.toString();
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 轉換為32位整數
        }
        
        return Math.abs(hash).toString(36);
    }
    
    // 加密帳號資料
    encryptAccount(account) {
        if (!this.hasMasterKey()) {
            return account;
        }
        
        return {
            ...account,
            username: this.encrypt(account.username, this.masterKey),
            password: this.encrypt(account.password, this.masterKey),
            encrypted: true
        };
    }
    
    // 解密帳號資料
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
            // 如果解密失敗，username和password會是空字符串
            decryptionFailed: !decryptedUsername && !decryptedPassword
        };
    }
    
    // 批量解密帳號列表
    decryptAccounts(accounts) {
        if (!Array.isArray(accounts)) return [];
        
        return accounts.map(account => this.decryptAccount(account));
    }
    
    // 重新加密所有帳號(用於更換主密鑰)
    reencryptAccounts(accounts, oldKey, newKey) {
        if (!Array.isArray(accounts)) return [];
        
        const tempKey = this.masterKey;
        const result = [];
        
        for (const account of accounts) {
            // 先用舊密鑰解密
            this.setMasterKey(oldKey);
            const decrypted = this.decryptAccount(account);
            
            // 如果解密失敗，保留原始數據
            if (decrypted.decryptionFailed) {
                result.push(account);
                continue;
            }
            
            // 用新密鑰加密
            this.setMasterKey(newKey);
            const reencrypted = this.encryptAccount({
                ...decrypted,
                encrypted: false // 重置加密標記
            });
            
            result.push(reencrypted);
        }
        
        // 恢復原密鑰
        this.setMasterKey(tempKey);
        return result;
    }
    
    // 基於裝置資訊生成本地加密金鑰 - 環境無關版本
    async getDeviceKey() {
        // 檢查是否在 Chrome 擴充功能環境中
        if (typeof chrome === 'undefined' || !chrome.storage) {
            throw new Error('Chrome 擴充功能環境不可用');
        }
        
        // 生成或獲取裝置特定的唯一標識符
        const deviceFingerprint = await new Promise(resolve => {
            chrome.storage.local.get(['deviceFingerprint', 'installTime'], result => {
                if (!result.deviceFingerprint) {
                    // 生成基於多重因子的裝置指紋
                    const extensionId = chrome.runtime?.id || 'unknown';
                    const installTime = result.installTime || Date.now().toString();
                    const randomSalt = Math.random().toString(36).substring(2, 15) + 
                                     Math.random().toString(36).substring(2, 15);
                    
                    // 嘗試獲取瀏覽器信息（在 Service Worker 中可能不可用）
                    let browserInfo = '';
                    try {
                        if (typeof navigator !== 'undefined') {
                            const userAgent = navigator.userAgent || '';
                            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
                            const language = navigator.language || '';
                            browserInfo = userAgent + timezone + language;
                        }
                    } catch (e) {
                        // Service Worker 環境中無法訪問這些信息，使用替代方案
                        browserInfo = 'serviceWorker';
                    }
                    
                    const timestamp = Date.now().toString();
                    
                    // 組合多個因子創建唯一指紋
                    const fingerprint = this.hashString(
                        extensionId + installTime + randomSalt + browserInfo + timestamp + Math.random()
                    );
                    
                    // 存儲指紋和安裝時間
                    chrome.storage.local.set({ 
                        deviceFingerprint: fingerprint,
                        installTime: installTime
                    });
                    
                    resolve(fingerprint);
                } else {
                    resolve(result.deviceFingerprint);
                }
            });
        });
        
        return deviceFingerprint;
    }
    
    // 加密主金鑰並存儲到本地
    async saveMasterKeyToStorage(masterKey, sessionTimeout = 8 * 60 * 60 * 1000) { // 8小時
        try {
            const deviceKey = await this.getDeviceKey();
            const encryptedMasterKey = this.encrypt(masterKey, deviceKey);
            const expireTime = Date.now() + sessionTimeout;
            
            await chrome.storage.local.set({
                encryptedMasterKey,
                masterKeyExpireTime: expireTime
            });
            
            return true;
        } catch (error) {
            console.error('儲存主金鑰失敗:', error);
            return false;
        }
    }
    
    // 從存儲中讀取並解密主金鑰
    async loadMasterKeyFromStorage() {
        try {
            const result = await chrome.storage.local.get(['encryptedMasterKey', 'masterKeyExpireTime']);
            
            if (!result.encryptedMasterKey || !result.masterKeyExpireTime) {
                return null;
            }
            
            // 檢查是否過期
            if (Date.now() > result.masterKeyExpireTime) {
                // 清除過期的金鑰
                chrome.storage.local.remove(['encryptedMasterKey', 'masterKeyExpireTime']);
                return null;
            }
            
            const deviceKey = await this.getDeviceKey();
            const decryptedMasterKey = this.decrypt(result.encryptedMasterKey, deviceKey);
            
            return decryptedMasterKey || null;
        } catch (error) {
            console.error('載入主金鑰失敗:', error);
            return null;
        }
    }
    
    // 清除儲存的主金鑰
    async clearMasterKeyFromStorage() {
        try {
            await chrome.storage.local.remove(['encryptedMasterKey', 'masterKeyExpireTime']);
            return true;
        } catch (error) {
            console.error('清除主金鑰失敗:', error);
            return false;
        }
    }
}

// 導出到不同環境
if (typeof window !== 'undefined') {
    // 瀏覽器環境
    window.SharedPasswordCrypto = SharedPasswordCrypto;
} else if (typeof global !== 'undefined') {
    // Node.js 環境
    global.SharedPasswordCrypto = SharedPasswordCrypto;
} else if (typeof self !== 'undefined') {
    // Service Worker 環境
    self.SharedPasswordCrypto = SharedPasswordCrypto;
}