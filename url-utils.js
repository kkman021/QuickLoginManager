// URL處理工具函數
class URLUtils {
    /**
     * 檢查URL是否為支援的協議
     * @param {string} url - 要檢查的URL
     * @returns {boolean} 是否為HTTP/HTTPS協議
     */
    static isSupportedProtocol(url) {
        return url && (url.startsWith('http://') || url.startsWith('https://'));
    }
    
    /**
     * 安全地取得URL的origin
     * @param {string} url - 要處理的URL
     * @returns {string|null} URL的origin，失敗時返回null
     */
    static safeGetOrigin(url) {
        if (!this.isSupportedProtocol(url)) {
            return null;
        }
        
        try {
            return new URL(url).origin;
        } catch (error) {
            console.warn('無法解析URL origin:', url, error);
            return null;
        }
    }
    
    /**
     * 安全地取得URL的hostname
     * @param {string} url - 要處理的URL
     * @returns {string|null} URL的hostname，失敗時返回null
     */
    static safeGetHostname(url) {
        if (!this.isSupportedProtocol(url)) {
            return null;
        }
        
        try {
            return new URL(url).hostname;
        } catch (error) {
            console.warn('無法解析URL hostname:', url, error);
            return null;
        }
    }
    
    /**
     * 比較兩個URL是否匹配（支援domain和path匹配模式）
     * @param {string} url1 - 第一個URL
     * @param {string} url2 - 第二個URL
     * @param {string} matchMode - 匹配模式: 'domain' 或 'path'，預設為 'domain'
     * @returns {boolean} 是否匹配
     */
    static urlsMatch(url1, url2, matchMode = 'domain') {
        if (!url1 || !url2) return false;
        
        // 完全匹配
        if (url1 === url2) return true;
        
        if (matchMode === 'path') {
            // 路徑模式：需要完整路徑匹配
            return this.pathsMatch(url1, url2);
        } else {
            // 域名模式：只比較域名
            return this.domainsMatch(url1, url2);
        }
    }
    
    /**
     * 比較兩個URL的域名是否匹配
     * @param {string} url1 - 第一個URL
     * @param {string} url2 - 第二個URL
     * @returns {boolean} 域名是否匹配
     */
    static domainsMatch(url1, url2) {
        if (!url1 || !url2) return false;
        
        // 嘗試origin匹配
        const origin1 = this.safeGetOrigin(url1);
        const origin2 = this.safeGetOrigin(url2);
        if (origin1 && origin2 && origin1 === origin2) return true;
        
        // 嘗試hostname匹配
        const hostname1 = this.safeGetHostname(url1);
        const hostname2 = this.safeGetHostname(url2);
        if (hostname1 && hostname2 && hostname1 === hostname2) return true;
        
        return false;
    }
    
    /**
     * 比較兩個URL的路徑是否匹配
     * @param {string} url1 - 第一個URL
     * @param {string} url2 - 第二個URL
     * @returns {boolean} 路徑是否匹配
     */
    static pathsMatch(url1, url2) {
        if (!url1 || !url2) return false;
        
        try {
            const urlObj1 = new URL(url1);
            const urlObj2 = new URL(url2);
            
            // 首先檢查域名是否匹配
            if (urlObj1.origin !== urlObj2.origin) {
                return false;
            }
            
            // 然後檢查路徑是否匹配（current URL需要在account URL路徑範圍內）
            const path1 = urlObj1.pathname.replace(/\/$/, '') || '/';
            const path2 = urlObj2.pathname.replace(/\/$/, '') || '/';
            
            // 如果其中一個是根路徑，則只需域名匹配
            if (path1 === '/' || path2 === '/') {
                return true;
            }
            
            // 檢查當前頁面路徑是否在帳號路徑範圍內
            return path2.startsWith(path1) || path1.startsWith(path2);
        } catch (error) {
            console.warn('路徑匹配失敗:', url1, url2, error);
            return this.domainsMatch(url1, url2);
        }
    }
    
    /**
     * 從Chrome標籤頁取得安全的URL資訊
     * @param {object} tab - Chrome tab對象
     * @returns {object} 包含URL資訊的對象
     */
    static getTabUrlInfo(tab) {
        if (!tab || !tab.url) {
            return {
                isSupported: false,
                url: '',
                origin: null,
                displayText: '無URL資訊'
            };
        }
        
        const isSupported = this.isSupportedProtocol(tab.url);
        
        if (!isSupported) {
            return {
                isSupported: false,
                url: tab.url,
                origin: null,
                displayText: '不支援的頁面'
            };
        }
        
        const origin = this.safeGetOrigin(tab.url);
        
        return {
            isSupported: true,
            url: tab.url,
            origin: origin || tab.url,
            displayText: origin || tab.url
        };
    }
    
    /**
     * 從帳號列表中過濾出匹配指定URL的帳號
     * @param {Array} accounts - 帳號列表
     * @param {string} targetUrl - 目標URL
     * @param {boolean} excludeDecryptionFailed - 是否排除解密失敗的帳號
     * @returns {Array} 匹配的帳號列表
     */
    static filterAccountsByUrl(accounts, targetUrl, excludeDecryptionFailed = false) {
        if (!Array.isArray(accounts) || !targetUrl) {
            return [];
        }
        
        return accounts.filter(account => {
            // 排除解密失敗的帳號（如果需要）
            if (excludeDecryptionFailed && account.decryptionFailed) {
                return false;
            }
            
            // 使用帳號的匹配模式進行URL匹配
            const matchMode = account.matchMode || 'domain'; // 預設為域名匹配
            return this.urlsMatch(account.url, targetUrl, matchMode);
        });
    }
    
    /**
     * 驗證URL格式是否有效
     * @param {string} url - 要驗證的URL
     * @returns {boolean} 是否為有效URL
     */
    static isValidUrl(url) {
        if (!url || typeof url !== 'string') return false;
        
        try {
            new URL(url);
            return true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * 標準化URL（移除末尾斜線、統一協議等）
     * @param {string} url - 要標準化的URL
     * @returns {string} 標準化後的URL
     */
    static normalizeUrl(url) {
        if (!this.isValidUrl(url)) return url;
        
        try {
            const urlObj = new URL(url);
            // 移除末尾斜線（除非是根路徑）
            if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
                urlObj.pathname = urlObj.pathname.slice(0, -1);
            }
            return urlObj.toString();
        } catch (error) {
            return url;
        }
    }
}

// 對外暴露URLUtils類別
if (typeof window !== 'undefined') {
    window.URLUtils = URLUtils;
} else if (typeof global !== 'undefined') {
    global.URLUtils = URLUtils;
}