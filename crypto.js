// 加密解密工具函數
class PasswordCrypto {
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
}

// 創建全局實例
window.passwordCrypto = new PasswordCrypto();