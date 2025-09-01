// 使用共用的加密工具類，保持向後兼容性
// 創建全局實例（兼容現有代碼）
window.passwordCrypto = new SharedPasswordCrypto();

// 向後兼容：保持原有的 PasswordCrypto 名稱
window.PasswordCrypto = SharedPasswordCrypto;