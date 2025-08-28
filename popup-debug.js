console.log('Popup script loading...');

let currentUrl = '';
let accounts = [];

// 檢查是否需要主密鑰輸入
async function checkMasterKeyRequired() {
    try {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.sync.get(['accounts']);
            const storedAccounts = result.accounts || [];
            
            // 檢查是否有加密的帳號
            const hasEncryptedAccounts = storedAccounts.some(account => account.encrypted);
            
            if (hasEncryptedAccounts || storedAccounts.length === 0) {
                // 首先檢查 background script 是否已有主密鑰
                const backgroundKeyCheck = await checkBackgroundMasterKey();
                
                if (backgroundKeyCheck.hasMasterKey) {
                    // Background 已有主密鑰，直接進入主界面
                    showMainContent();
                    getCurrentTab();
                    loadAccounts();
                } else {
                    // 需要輸入主密鑰
                    showMasterKeyInput();
                }
            } else {
                // 沒有加密帳號，直接進入主界面
                showMainContent();
                getCurrentTab();
                loadAccounts();
            }
        } else {
            showMainContent();
            getCurrentTab();  
            loadAccounts();
        }
    } catch (error) {
        console.error('檢查主密鑰需求失敗:', error);
        showMasterKeyInput();
    }
}

// 檢查 background script 是否已有主密鑰
async function checkBackgroundMasterKey() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: 'getMasterKey'
        }, (response) => {
            console.log('Background 主密鑰狀態:', response);
            resolve({
                hasMasterKey: !!(response && response.hasKey),
                setTime: response?.setTime
            });
        });
    });
}

// 顯示主密鑰輸入界面
function showMasterKeyInput() {
    document.getElementById('masterKeySection').style.display = 'block';
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('masterKey').focus();
}

// 顯示主要內容界面
function showMainContent() {
    document.getElementById('masterKeySection').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
}

// 處理解鎖
async function handleUnlock() {
    const masterKey = document.getElementById('masterKey').value;
    const statusElement = document.getElementById('keyStatus');
    
    if (!masterKey) {
        statusElement.className = 'key-status error';
        statusElement.textContent = '請輸入主密鑰';
        return;
    }
    
    try {
        statusElement.className = 'key-status warning';
        statusElement.textContent = '正在驗證...';
        
        // 設定主密鑰
        window.passwordCrypto.setMasterKey(masterKey);
        
        // 將主密鑰發送到background script
        chrome.runtime.sendMessage({
            action: 'setMasterKey',
            masterKey: masterKey
        });
        
        // 載入並嘗試解密帳號
        await loadAccounts();
        
        statusElement.className = 'key-status success';
        statusElement.textContent = '✓ 解鎖成功';
        
        // 清空輸入框
        document.getElementById('masterKey').value = '';
        
        // 延遲顯示主界面
        setTimeout(async () => {
            showMainContent();
            getCurrentTab();
            
            // 檢查並執行自動填入
            await checkAndExecuteAutoFill();
        }, 500);
        
    } catch (error) {
        console.error('解鎖失敗:', error);
        statusElement.className = 'key-status error';
        statusElement.textContent = '解鎖失敗，請重試';
    }
}

// 處理更改主密鑰
async function handleChangeMasterKey() {
    const newKey = document.getElementById('newMasterKey').value;
    const confirmKey = document.getElementById('confirmMasterKey').value;
    
    if (!newKey || !confirmKey) {
        alert('請填寫完整的新密鑰資訊');
        return;
    }
    
    if (newKey !== confirmKey) {
        alert('兩次輸入的密鑰不一致');
        return;
    }
    
    if (!confirm('確定要更改主密鑰嗎？這將重新加密所有帳號資料。')) {
        return;
    }
    
    try {
        // 透過 background script 更改主密鑰
        const changeResponse = await changeMasterKeyInBackground(newKey);
        
        if (!changeResponse.success) {
            throw new Error(changeResponse.error || '更改主密鑰失敗');
        }
        
        // 設定本地密鑰
        window.passwordCrypto.setMasterKey(newKey);
        
        // 清空表單
        document.getElementById('newMasterKey').value = '';
        document.getElementById('confirmMasterKey').value = '';
        
        // 重新載入帳號（使用新密鑰解密的帳號）
        await loadAccounts();
        
        alert('主密鑰更改成功！');
        
    } catch (error) {
        console.error('更改主密鑰失敗:', error);
        alert('更改主密鑰失敗，請重試');
    }
}

// 簡單的showTab函數用於調試
function showTab(tabName) {
    console.log('showTab called with:', tabName);
    
    // 移除所有active類
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // 添加active類到正確的標籤
    const clickedTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (clickedTab) {
        clickedTab.classList.add('active');
    }
    
    // 顯示對應的內容
    const tabContentMap = {
        'fill': 'fillTab',
        'manage': 'manageTab', 
        'add': 'addTab',
        'settings': 'settingsTab'
    };
    
    const contentId = tabContentMap[tabName];
    if (contentId) {
        const contentElement = document.getElementById(contentId);
        if (contentElement) {
            contentElement.classList.add('active');
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded');
    
    // 檢查是否需要顯示主密鑰輸入
    checkMasterKeyRequired();
    
    // 添加主密鑰相關事件監聽器
    const unlockBtn = document.getElementById('unlockBtn');
    const masterKeyInput = document.getElementById('masterKey');
    const changeMasterKeyBtn = document.getElementById('changeMasterKeyBtn');
    
    if (unlockBtn) {
        unlockBtn.addEventListener('click', handleUnlock);
    }
    
    if (masterKeyInput) {
        masterKeyInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleUnlock();
            }
        });
    }
    
    if (changeMasterKeyBtn) {
        changeMasterKeyBtn.addEventListener('click', handleChangeMasterKey);
    }
    
    // 添加標籤頁點擊事件
    const tabs = document.querySelectorAll('.tab');
    console.log('Found tabs:', tabs.length);
    
    tabs.forEach((tab, index) => {
        console.log(`Tab ${index}:`, tab.textContent);
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            console.log('Tab clicked:', tabName);
            showTab(tabName);
        });
    });
    
    // 添加表單事件監聽器
    const form = document.getElementById('addAccountForm');
    if (form) {
        form.addEventListener('submit', handleAddAccount);
    }
    
    const filter = document.getElementById('siteFilter');
    if (filter) {
        filter.addEventListener('change', filterAccounts);
    }
    
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelEdit);
    }
});

async function getCurrentTab() {
    console.log('Getting current tab...');
    try {
        if (typeof chrome !== 'undefined' && chrome.tabs) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // 使用URLUtils取得標籤頁URL資訊
            const urlInfo = URLUtils.getTabUrlInfo(tab);
            console.log('Tab URL info:', urlInfo);
            
            currentUrl = urlInfo.isSupported ? urlInfo.origin : urlInfo.displayText;
            
            const urlElement = document.getElementById('currentUrl');
            const websiteUrlElement = document.getElementById('websiteUrl');
            
            if (urlElement) {
                urlElement.textContent = urlInfo.displayText;
            }
            if (websiteUrlElement && urlInfo.isSupported) {
                websiteUrlElement.value = urlInfo.origin;
            }
            
            // 只有在支援的URL時才載入站點帳號
            if (urlInfo.isSupported) {
                loadSiteAccounts();
            }
        } else {
            console.log('Chrome tabs API not available');
            document.getElementById('currentUrl').textContent = '無法取得(測試模式)';
        }
    } catch (error) {
        console.error('取得目前分頁失敗:', error);
        document.getElementById('currentUrl').textContent = '載入失敗';
    }
}

async function loadAccounts() {
    console.log('Loading accounts...');
    try {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            // 透過 background script 獲取所有解密的帳號（不限制 URL）
            const allDecryptedAccounts = await getAllDecryptedAccounts();
            accounts = allDecryptedAccounts;
            console.log('Loaded decrypted accounts from background:', accounts.length);
            
            updateSiteFilter();
            updateAllAccountsList();
            loadSiteAccounts();
        } else {
            console.log('Chrome storage API not available');
        }
    } catch (error) {
        console.error('載入帳號失敗:', error);
    }
}

// 從 background script 獲取所有解密的帳號
async function getAllDecryptedAccounts() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: 'getAllDecryptedAccounts'
        }, (response) => {
            if (response && response.success) {
                resolve(response.accounts || []);
            } else {
                console.error('從 background 獲取帳號失敗:', response);
                resolve([]);
            }
        });
    });
}

// 透過 background script 儲存帳號
async function saveAccountToBackground(account, isEditing) {
    return new Promise((resolve) => {
        const action = isEditing ? 'updateAccount' : 'saveAccount';
        chrome.runtime.sendMessage({
            action: action,
            account: account
        }, (response) => {
            resolve(response || { success: false });
        });
    });
}

// 透過 background script 刪除帳號
async function deleteAccountFromBackground(accountId) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: 'deleteAccount',
            accountId: accountId
        }, (response) => {
            resolve(response || { success: false });
        });
    });
}

// 透過 background script 更改主密鑰
async function changeMasterKeyInBackground(newMasterKey) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: 'changeMasterKey',
            newMasterKey: newMasterKey
        }, (response) => {
            resolve(response || { success: false });
        });
    });
}

// 檢查自動填入設定並觸發content script重新初始化
async function checkAndExecuteAutoFill() {
    try {
        // 檢查自動填入是否啟用（預設啟用）
        const isAutoFillEnabled = localStorage.getItem('quickLoginAutoFill') !== 'false';
        
        if (!isAutoFillEnabled) {
            console.log('自動填入已停用，跳過重新初始化');
            return;
        }
        
        // 獲取當前頁面
        if (typeof chrome !== 'undefined' && chrome.tabs) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab || !tab.url) {
                console.log('無法獲取當前頁面信息');
                return;
            }
            
            // 檢查是否為支援的協議
            if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) {
                console.log('當前頁面不支援自動填入');
                return;
            }
            
            console.log('觸發 content script 重新初始化自動填入');
            
            // 向 content script 發送重新初始化訊息
            chrome.tabs.sendMessage(tab.id, {
                action: 'reinitializeAutoFill'
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('Content script 可能尚未載入，這是正常的');
                } else {
                    console.log('重新初始化請求已發送');
                }
            });
        }
    } catch (error) {
        console.error('自動填入檢查失敗:', error);
    }
}

function loadSiteAccounts() {
    console.log('Loading site accounts for:', currentUrl);
    
    const container = document.getElementById('siteAccounts');
    if (!container) return;
    
    // 使用URLUtils過濾帳號
    const siteAccounts = URLUtils.filterAccountsByUrl(accounts, currentUrl);
    
    // 如果沒有找到帳號且currentUrl不是支援的協議
    if (siteAccounts.length === 0 && !URLUtils.isSupportedProtocol(currentUrl)) {
        container.innerHTML = '<div class="empty-state"><div class="icon">ℹ️</div><div>此類型頁面不支援自動填入</div></div>';
        return;
    }
    
    if (siteAccounts.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">🔑</div><div>沒有找到目前網站的帳號</div></div>';
        return;
    }
    
    container.innerHTML = siteAccounts.map(account => {
        const displayUsername = account.username || '解密失敗';
        const isDecryptionFailed = account.decryptionFailed;
        
        return `
        <div class="account-item ${isDecryptionFailed ? 'decryption-failed' : ''}">
            <div class="account-info">
                <div class="account-username">${escapeHtml(displayUsername)}</div>
                <div class="account-url" title="${escapeHtml(account.url)}">${escapeHtml(shortenUrl(account.url))}</div>
                ${isDecryptionFailed ? '<div class="decrypt-status">⚠️ 無法解密</div>' : ''}
            </div>
            <div class="account-actions">
                <button class="small-btn" data-action="fill" data-id="${account.id}" ${isDecryptionFailed ? 'disabled' : ''} title="自動填入">🚀</button>
                <button class="small-btn secondary-btn" data-action="edit" data-id="${account.id}" ${isDecryptionFailed ? 'disabled' : ''} title="編輯">✏️</button>
                <button class="small-btn danger-btn" data-action="delete" data-id="${account.id}" title="刪除">🗑️</button>
            </div>
        </div>
    `}).join('');
    
    // 添加事件監聽器
    container.querySelectorAll('button[data-action]').forEach(button => {
        button.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            const accountId = this.getAttribute('data-id');
            
            switch(action) {
                case 'fill':
                    fillAccount(accountId);
                    break;
                case 'edit':
                    editAccount(accountId);
                    break;
                case 'delete':
                    deleteAccount(accountId);
                    break;
            }
        });
    });
}

function updateSiteFilter() {
    const sites = [...new Set(accounts.map(account => account.url))];
    const select = document.getElementById('siteFilter');
    if (!select) return;
    
    select.innerHTML = '<option value="">所有網站</option>' +
        sites.map(site => `<option value="${escapeHtml(site)}">${escapeHtml(site)}</option>`).join('');
}

function updateAllAccountsList() {
    const container = document.getElementById('allAccounts');
    if (!container) return;
    
    if (accounts.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">📝</div><div>沒有儲存的帳號</div></div>';
        return;
    }
    
    container.innerHTML = accounts.map(account => {
        const displayUsername = account.username || '解密失敗';
        const isDecryptionFailed = account.decryptionFailed;
        
        return `
        <div class="account-item ${isDecryptionFailed ? 'decryption-failed' : ''}">
            <div class="account-info">
                <div class="account-username">${escapeHtml(displayUsername)}</div>
                <div class="account-url" title="${escapeHtml(account.url)}">${escapeHtml(shortenUrl(account.url))}</div>
                ${isDecryptionFailed ? '<div class="decrypt-status">⚠️ 無法解密</div>' : ''}
            </div>
            <div class="account-actions">
                <button class="small-btn" data-action="copy" data-id="${account.id}" ${isDecryptionFailed ? 'disabled' : ''} title="複製帳號（密碼留空）">📋</button>
                <button class="small-btn secondary-btn" data-action="edit" data-id="${account.id}" ${isDecryptionFailed ? 'disabled' : ''} title="編輯">✏️</button>
                <button class="small-btn danger-btn" data-action="delete" data-id="${account.id}" title="刪除">🗑️</button>
            </div>
        </div>
    `}).join('');
    
    // 添加事件監聽器
    container.querySelectorAll('button[data-action]').forEach(button => {
        button.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            const accountId = this.getAttribute('data-id');
            
            switch(action) {
                case 'copy':
                    copyAccount(accountId);
                    break;
                case 'edit':
                    editAccount(accountId);
                    break;
                case 'delete':
                    deleteAccount(accountId);
                    break;
            }
        });
    });
}

function filterAccounts() {
    console.log('Filtering accounts...');
    const filterValue = document.getElementById('siteFilter').value;
    const filteredAccounts = filterValue ? accounts.filter(account => account.url === filterValue) : accounts;
    
    const container = document.getElementById('allAccounts');
    if (!container) return;
    
    if (filteredAccounts.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><div>沒有找到符合的帳號</div></div>';
        return;
    }
    
    container.innerHTML = filteredAccounts.map(account => {
        const displayUsername = account.username || '解密失敗';
        const isDecryptionFailed = account.decryptionFailed;
        
        return `
        <div class="account-item ${isDecryptionFailed ? 'decryption-failed' : ''}">
            <div class="account-info">
                <div class="account-username">${escapeHtml(displayUsername)}</div>
                <div class="account-url" title="${escapeHtml(account.url)}">${escapeHtml(shortenUrl(account.url))}</div>
                ${isDecryptionFailed ? '<div class="decrypt-status">⚠️ 無法解密</div>' : ''}
            </div>
            <div class="account-actions">
                <button class="small-btn" data-action="copy" data-id="${account.id}" ${isDecryptionFailed ? 'disabled' : ''} title="複製帳號（密碼留空）">📋</button>
                <button class="small-btn secondary-btn" data-action="edit" data-id="${account.id}" ${isDecryptionFailed ? 'disabled' : ''} title="編輯">✏️</button>
                <button class="small-btn danger-btn" data-action="delete" data-id="${account.id}" title="刪除">🗑️</button>
            </div>
        </div>
    `}).join('');
    
    // 添加事件監聽器
    container.querySelectorAll('button[data-action]').forEach(button => {
        button.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            const accountId = this.getAttribute('data-id');
            
            switch(action) {
                case 'copy':
                    copyAccount(accountId);
                    break;
                case 'edit':
                    editAccount(accountId);
                    break;
                case 'delete':
                    deleteAccount(accountId);
                    break;
            }
        });
    });
}

async function handleAddAccount(event) {
    console.log('Handle add account called');
    event.preventDefault();
    
    const form = event.target;
    const isEditing = form.dataset.editId;
    
    const account = {
        id: isEditing || Date.now().toString(),
        url: document.getElementById('websiteUrl').value,
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
        usernameSelector: document.getElementById('usernameSelector').value || '',
        passwordSelector: document.getElementById('passwordSelector').value || '',
        matchMode: document.getElementById('matchMode').value || 'domain',
        encrypted: false
    };
    
    console.log(isEditing ? 'Updating account:' : 'Adding account:', account);
    
    // 加密帳號資料
    const encryptedAccount = window.passwordCrypto.encryptAccount(account);
    
    try {
        // 透過 background script 儲存或更新帳號
        const saveResponse = await saveAccountToBackground(encryptedAccount, isEditing);
        
        if (!saveResponse.success) {
            throw new Error(saveResponse.error || '儲存失敗');
        }
        
        if (isEditing) {
            // 編輯模式：更新本地帳號列表
            const index = accounts.findIndex(acc => acc.id === isEditing);
            if (index !== -1) {
                accounts[index] = account;
            }
            
            // 清除編輯模式標記
            delete form.dataset.editId;
            const submitBtn = form.querySelector('button[type="submit"]');
            const cancelBtn = document.getElementById('cancelEditBtn');
            submitBtn.textContent = '💾 儲存帳號';
            cancelBtn.style.display = 'none';
            
            // 恢復標籤頁按鈕文字
            const addTab = document.querySelector('[data-tab="add"]');
            if (addTab) {
                addTab.textContent = '新增';
            }
        } else {
            // 新增模式：添加到本地帳號列表
            accounts.push(account);
        }
        
        event.target.reset();
        document.getElementById('websiteUrl').value = currentUrl;
        
        updateSiteFilter();
        updateAllAccountsList();
        loadSiteAccounts();
        
        showTab('fill');
        alert(isEditing ? '帳號更新成功！' : '帳號儲存成功！');
    } catch (error) {
        console.error(isEditing ? '更新帳號失敗:' : '儲存帳號失敗:', error);
        alert(isEditing ? '更新失敗，請重試' : '儲存失敗，請重試');
    }
}

async function fillAccount(accountId) {
    console.log('Fill account:', accountId);
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) return;
    
    try {
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.scripting) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: fillCredentials,
                args: [account.username, account.password, account.usernameSelector, account.passwordSelector]
            });
            
            window.close();
        } else {
            console.log('Chrome scripting API not available');
            alert('無法執行填入(測試模式)');
        }
    } catch (error) {
        console.error('填入帳號失敗:', error);
        alert('填入失敗，請重試');
    }
}

function fillCredentials(username, password, usernameSelector, passwordSelector) {
    console.log('Filling credentials...');
    let usernameField, passwordField;
    
    if (usernameSelector) {
        usernameField = document.querySelector(usernameSelector);
    } else {
        usernameField = document.querySelector('input[type="text"]') ||
                       document.querySelector('input[type="email"]') ||
                       document.querySelector('input[name*="user"]') ||
                       document.querySelector('input[name*="email"]') ||
                       document.querySelector('input[id*="user"]') ||
                       document.querySelector('input[id*="email"]');
    }
    
    if (passwordSelector) {
        passwordField = document.querySelector(passwordSelector);
    } else {
        passwordField = document.querySelector('input[type="password"]');
    }
    
    if (usernameField) {
        usernameField.value = username;
        usernameField.dispatchEvent(new Event('input', { bubbles: true }));
        usernameField.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    if (passwordField) {
        passwordField.value = password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

async function deleteAccount(accountId) {
    console.log('Delete account:', accountId);
    if (!confirm('確定要刪除這個帳號嗎？')) return;
    
    try {
        // 透過 background script 刪除帳號
        const deleteResponse = await deleteAccountFromBackground(accountId);
        
        if (!deleteResponse.success) {
            throw new Error(deleteResponse.error || '刪除失敗');
        }
        
        // 從本地帳號列表中移除
        accounts = accounts.filter(acc => acc.id !== accountId);
        
        updateSiteFilter();
        updateAllAccountsList();
        loadSiteAccounts();
        
        console.log('帳號刪除成功');
    } catch (error) {
        console.error('刪除帳號失敗:', error);
        alert('刪除失敗，請重試');
    }
}

function editAccount(accountId) {
    console.log('Edit account:', accountId);
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) return;
    
    // 填入編輯表單
    document.getElementById('websiteUrl').value = account.url;
    document.getElementById('username').value = account.username;
    document.getElementById('password').value = account.password;
    document.getElementById('usernameSelector').value = account.usernameSelector || '';
    document.getElementById('passwordSelector').value = account.passwordSelector || '';
    document.getElementById('matchMode').value = account.matchMode || 'domain';
    
    // 標記為編輯模式，而不是直接刪除
    const form = document.getElementById('addAccountForm');
    form.dataset.editId = accountId;
    
    // 更改按鈕文字和顯示取消按鈕
    const submitBtn = form.querySelector('button[type="submit"]');
    const cancelBtn = document.getElementById('cancelEditBtn');
    submitBtn.textContent = '🔄 更新帳號';
    cancelBtn.style.display = 'block';
    
    // 更改標籤頁按鈕文字為「編輯」
    const addTab = document.querySelector('[data-tab="add"]');
    if (addTab) {
        addTab.textContent = '編輯';
    }
    
    // 切換到新增/編輯標籤頁
    showTab('add');
}

function copyAccount(accountId) {
    console.log('Copy account:', accountId);
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) return;
    
    // 填入複製表單，密碼欄位留空
    document.getElementById('websiteUrl').value = account.url;
    document.getElementById('username').value = account.username;
    document.getElementById('password').value = ''; // 密碼留空
    document.getElementById('usernameSelector').value = account.usernameSelector || '';
    document.getElementById('passwordSelector').value = account.passwordSelector || '';
    document.getElementById('matchMode').value = account.matchMode || 'domain';
    
    // 確保處於新增模式（不是編輯模式）
    const form = document.getElementById('addAccountForm');
    delete form.dataset.editId;
    
    // 確保按鈕顯示為新增狀態
    const submitBtn = form.querySelector('button[type="submit"]');
    const cancelBtn = document.getElementById('cancelEditBtn');
    submitBtn.textContent = '💾 儲存帳號';
    cancelBtn.style.display = 'none';
    
    // 確保標籤頁按鈕顯示為新增
    const addTab = document.querySelector('[data-tab="add"]');
    if (addTab) {
        addTab.textContent = '新增';
    }
    
    // 切換到新增標籤頁
    showTab('add');
    
    // 讓密碼欄位獲得焦點，提醒用戶輸入新密碼
    document.getElementById('password').focus();
}

function cancelEdit() {
    console.log('Cancel edit called');
    const form = document.getElementById('addAccountForm');
    
    // 清除編輯模式標記
    delete form.dataset.editId;
    
    // 重置按鈕狀態
    const submitBtn = form.querySelector('button[type="submit"]');
    const cancelBtn = document.getElementById('cancelEditBtn');
    submitBtn.textContent = '💾 儲存帳號';
    cancelBtn.style.display = 'none';
    
    // 恢復標籤頁按鈕文字
    const addTab = document.querySelector('[data-tab="add"]');
    if (addTab) {
        addTab.textContent = '新增';
    }
    
    // 重置表單
    form.reset();
    document.getElementById('websiteUrl').value = currentUrl;
    
    // 切換回帳號列表
    showTab('manage');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 智慧縮短 URL 顯示
function shortenUrl(url, maxLength = 40) {
    if (!url || url.length <= maxLength) return url;
    
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const path = urlObj.pathname + urlObj.search;
        
        // 如果只是域名就太長了，直接截斷
        if (domain.length >= maxLength - 3) {
            return domain.substring(0, maxLength - 3) + '...';
        }
        
        // 優先顯示域名，然後顯示部分路徑
        const domainPart = urlObj.protocol + '//' + domain;
        const remainingLength = maxLength - domainPart.length - 3; // 3 for '...'
        
        if (path.length <= remainingLength) {
            return url; // 完整顯示
        }
        
        // 截斷路徑部分
        if (remainingLength > 0) {
            return domainPart + path.substring(0, remainingLength) + '...';
        } else {
            return domainPart + '...';
        }
    } catch (error) {
        // 如果不是有效URL，直接截斷
        return url.substring(0, maxLength - 3) + '...';
    }
}

// CSP修復完成，不再需要全域函數

console.log('Popup script loaded successfully');