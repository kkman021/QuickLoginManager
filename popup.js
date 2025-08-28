let currentUrl = '';
let accounts = [];

document.addEventListener('DOMContentLoaded', function() {
    getCurrentTab();
    loadAccounts();
    
    document.getElementById('addAccountForm').addEventListener('submit', handleAddAccount);
    document.getElementById('siteFilter').addEventListener('change', filterAccounts);
});

async function getCurrentTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentUrl = new URL(tab.url).origin;
        document.getElementById('currentUrl').textContent = currentUrl;
        document.getElementById('websiteUrl').value = currentUrl;
        loadSiteAccounts();
    } catch (error) {
        console.error('取得目前分頁失敗:', error);
    }
}

async function loadAccounts() {
    try {
        const result = await chrome.storage.sync.get(['accounts']);
        accounts = result.accounts || [];
        updateSiteFilter();
        updateAllAccountsList();
        loadSiteAccounts();
    } catch (error) {
        console.error('載入帳號失敗:', error);
    }
}

function loadSiteAccounts() {
    const siteAccounts = accounts.filter(account => 
        account.url === currentUrl || account.url === new URL(currentUrl).hostname
    );
    
    const container = document.getElementById('siteAccounts');
    
    if (siteAccounts.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">沒有找到目前網站的帳號</div>';
        return;
    }
    
    container.innerHTML = siteAccounts.map(account => `
        <div class="account-item">
            <div class="account-info">
                <div class="account-username">${escapeHtml(account.username)}</div>
                <div class="account-url">${escapeHtml(account.url)}</div>
            </div>
            <div class="account-actions">
                <button class="small-btn" onclick="fillAccount('${account.id}')">填入</button>
                <button class="small-btn secondary-btn" onclick="editAccount('${account.id}')">編輯</button>
                <button class="small-btn danger-btn" onclick="deleteAccount('${account.id}')">刪除</button>
            </div>
        </div>
    `).join('');
}

function updateSiteFilter() {
    const sites = [...new Set(accounts.map(account => account.url))];
    const select = document.getElementById('siteFilter');
    
    select.innerHTML = '<option value="">所有網站</option>' +
        sites.map(site => `<option value="${escapeHtml(site)}">${escapeHtml(site)}</option>`).join('');
}

function updateAllAccountsList() {
    const container = document.getElementById('allAccounts');
    
    if (accounts.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">沒有儲存的帳號</div>';
        return;
    }
    
    container.innerHTML = accounts.map(account => `
        <div class="account-item">
            <div class="account-info">
                <div class="account-username">${escapeHtml(account.username)}</div>
                <div class="account-url">${escapeHtml(account.url)}</div>
            </div>
            <div class="account-actions">
                <button class="small-btn secondary-btn" onclick="editAccount('${account.id}')">編輯</button>
                <button class="small-btn danger-btn" onclick="deleteAccount('${account.id}')">刪除</button>
            </div>
        </div>
    `).join('');
}

function filterAccounts() {
    const filterValue = document.getElementById('siteFilter').value;
    const filteredAccounts = filterValue ? accounts.filter(account => account.url === filterValue) : accounts;
    
    const container = document.getElementById('allAccounts');
    
    if (filteredAccounts.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">沒有找到符合的帳號</div>';
        return;
    }
    
    container.innerHTML = filteredAccounts.map(account => `
        <div class="account-item">
            <div class="account-info">
                <div class="account-username">${escapeHtml(account.username)}</div>
                <div class="account-url">${escapeHtml(account.url)}</div>
            </div>
            <div class="account-actions">
                <button class="small-btn secondary-btn" onclick="editAccount('${account.id}')">編輯</button>
                <button class="small-btn danger-btn" onclick="deleteAccount('${account.id}')">刪除</button>
            </div>
        </div>
    `).join('');
}

async function handleAddAccount(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const account = {
        id: Date.now().toString(),
        url: document.getElementById('websiteUrl').value,
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
        usernameSelector: document.getElementById('usernameSelector').value || '',
        passwordSelector: document.getElementById('passwordSelector').value || ''
    };
    
    accounts.push(account);
    
    try {
        await chrome.storage.sync.set({ accounts: accounts });
        
        event.target.reset();
        document.getElementById('websiteUrl').value = currentUrl;
        
        updateSiteFilter();
        updateAllAccountsList();
        loadSiteAccounts();
        
        showTab('fill');
        alert('帳號儲存成功！');
    } catch (error) {
        console.error('儲存帳號失敗:', error);
        alert('儲存失敗，請重試');
    }
}

async function fillAccount(accountId) {
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) return;
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: fillCredentials,
            args: [account.username, account.password, account.usernameSelector, account.passwordSelector]
        });
        
        window.close();
    } catch (error) {
        console.error('填入帳號失敗:', error);
        alert('填入失敗，請重試');
    }
}

function fillCredentials(username, password, usernameSelector, passwordSelector) {
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
    if (!confirm('確定要刪除這個帳號嗎？')) return;
    
    accounts = accounts.filter(acc => acc.id !== accountId);
    
    try {
        await chrome.storage.sync.set({ accounts: accounts });
        updateSiteFilter();
        updateAllAccountsList();
        loadSiteAccounts();
    } catch (error) {
        console.error('刪除帳號失敗:', error);
        alert('刪除失敗，請重試');
    }
}

function editAccount(accountId) {
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) return;
    
    document.getElementById('websiteUrl').value = account.url;
    document.getElementById('username').value = account.username;
    document.getElementById('password').value = account.password;
    document.getElementById('usernameSelector').value = account.usernameSelector;
    document.getElementById('passwordSelector').value = account.passwordSelector;
    
    deleteAccount(accountId);
    showTab('add');
}

function showTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[onclick="showTab('${tabName}')"]`).classList.add('active');
    
    switch(tabName) {
        case 'fill':
            document.getElementById('fillTab').classList.add('active');
            break;
        case 'manage':
            document.getElementById('manageTab').classList.add('active');
            break;
        case 'add':
            document.getElementById('addTab').classList.add('active');
            break;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}