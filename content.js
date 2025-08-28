let isQuickLoginEnabled = true;
let currentSiteAccounts = [];
let masterKey = null;

// 從background script請求主密鑰和帳號資料
async function requestAccountData() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: 'getDecryptedAccounts',
            url: window.location.origin
        }, (response) => {
            if (response && response.success) {
                resolve(response.accounts || []);
            } else {
                resolve([]);
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    initializeQuickLogin();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeQuickLogin);
} else {
    initializeQuickLogin();
}

async function initializeQuickLogin() {
    try {
        // 使用URLUtils安全取得當前頁面origin
        const currentUrl = URLUtils.safeGetOrigin(window.location.href) || window.location.origin;
        
        // 檢查是否為支援的協議
        if (!URLUtils.isSupportedProtocol(window.location.href)) {
            console.log('Quick Login: 不支援的頁面協議');
            return;
        }
        
        // 從background script獲取解密的帳號資料
        currentSiteAccounts = await requestAccountData();
        
        if (currentSiteAccounts.length > 0) {
            detectLoginForms();
            
            if (currentSiteAccounts.length === 1) {
                if (isAutoFillEnabled()) {
                    // 單一帳號 + 自動填入啟用：直接自動填入，不顯示按鈕
                    setTimeout(() => {
                        autoFillCredentials(currentSiteAccounts[0]);
                    }, 1000);
                } else {
                    // 單一帳號 + 自動填入停用：顯示按鈕讓用戶手動點擊
                    addQuickFillButtons();
                }
            } else {
                // 多個帳號：顯示選擇按鈕
                addQuickFillButtons();
            }
        }
    } catch (error) {
        console.error('Quick Login 初始化失敗:', error);
    }
}

function detectLoginForms() {
    const forms = document.querySelectorAll('form');
    const potentialLoginForms = [];
    
    forms.forEach(form => {
        const usernameField = form.querySelector('input[type="text"], input[type="email"]');
        const passwordField = form.querySelector('input[type="password"]');
        
        if (usernameField && passwordField) {
            potentialLoginForms.push({
                form: form,
                usernameField: usernameField,
                passwordField: passwordField
            });
        }
    });
    
    if (potentialLoginForms.length === 0) {
        const allUsernameFields = document.querySelectorAll('input[type="text"], input[type="email"]');
        const allPasswordFields = document.querySelectorAll('input[type="password"]');
        
        if (allUsernameFields.length > 0 && allPasswordFields.length > 0) {
            potentialLoginForms.push({
                form: null,
                usernameField: allUsernameFields[0],
                passwordField: allPasswordFields[0]
            });
        }
    }
    
    return potentialLoginForms;
}

function addQuickFillButtons() {
    if (currentSiteAccounts.length === 0) return;
    
    const loginForms = detectLoginForms();
    
    loginForms.forEach((formData, index) => {
        addFillButtonToForm(formData, index);
    });
}

function addFillButtonToForm(formData, formIndex) {
    const { usernameField, passwordField } = formData;
    
    if (!usernameField || !passwordField) return;
    
    const existingButton = document.getElementById(`quickLoginBtn_${formIndex}`);
    if (existingButton) {
        existingButton.remove();
    }
    
    const buttonContainer = document.createElement('div');
    buttonContainer.id = `quickLoginBtn_${formIndex}`;
    buttonContainer.style.cssText = `
        position: absolute;
        z-index: 10000;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Roboto, sans-serif;
        font-size: 13px;
        min-width: 180px;
    `;
    
    if (currentSiteAccounts.length === 1) {
        const fillButton = document.createElement('button');
        fillButton.textContent = `填入 (${currentSiteAccounts[0].username})`;
        fillButton.style.cssText = `
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            width: 100%;
            height: 42px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(79, 172, 254, 0.3);
        `;
        
        fillButton.addEventListener('mouseenter', () => {
            fillButton.style.transform = 'translateY(-1px)';
            fillButton.style.boxShadow = '0 4px 8px rgba(79, 172, 254, 0.4)';
        });
        
        fillButton.addEventListener('mouseleave', () => {
            fillButton.style.transform = 'translateY(0)';
            fillButton.style.boxShadow = '0 2px 4px rgba(79, 172, 254, 0.3)';
        });
        fillButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fillFormWithAccount(formData, currentSiteAccounts[0]);
            buttonContainer.style.display = 'none';
        });
        buttonContainer.appendChild(fillButton);
    } else {
        currentSiteAccounts.forEach((account, index) => {
            const fillButton = document.createElement('button');
            fillButton.textContent = account.username;
            fillButton.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height:20px;
                background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                color: white;
                border: none;
                padding: 10px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                margin-bottom: ${index < currentSiteAccounts.length - 1 ? '8px' : '0'};
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                transition: all 0.2s ease;
                box-shadow: 0 2px 4px rgba(79, 172, 254, 0.3);
            `;
            
            fillButton.addEventListener('mouseenter', () => {
                fillButton.style.transform = 'translateY(-1px)';
                fillButton.style.boxShadow = '0 4px 8px rgba(79, 172, 254, 0.4)';
            });
            
            fillButton.addEventListener('mouseleave', () => {
                fillButton.style.transform = 'translateY(0)';
                fillButton.style.boxShadow = '0 2px 4px rgba(79, 172, 254, 0.3)';
            });
            
            fillButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                fillFormWithAccount(formData, account);
                buttonContainer.style.display = 'none';
            });
            buttonContainer.appendChild(fillButton);
        });
    }
    
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.cssText = `
        position: absolute;
        top: -8px;
        right: -8px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
        color: white;
        border: none;
        cursor: pointer;
        font-size: 12px;
        font-weight: bold;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(238, 90, 82, 0.3);
    `;
    
    closeButton.addEventListener('mouseenter', () => {
        closeButton.style.transform = 'scale(1.1)';
        closeButton.style.boxShadow = '0 4px 8px rgba(238, 90, 82, 0.4)';
    });
    
    closeButton.addEventListener('mouseleave', () => {
        closeButton.style.transform = 'scale(1)';
        closeButton.style.boxShadow = '0 2px 4px rgba(238, 90, 82, 0.3)';
    });
    closeButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        buttonContainer.style.display = 'none';
    });
    buttonContainer.appendChild(closeButton);
    
    positionButtonNearField(buttonContainer, passwordField);
    document.body.appendChild(buttonContainer);
    
    const showButton = () => {
        if (isFormFieldFocused(formData)) {
            buttonContainer.style.display = 'block';
        }
    };
    
    const hideButton = (e) => {
        setTimeout(() => {
            if (!buttonContainer.contains(e.relatedTarget) && 
                !isFormFieldFocused(formData)) {
                buttonContainer.style.display = 'none';
            }
        }, 100);
    };
    
    usernameField.addEventListener('focus', showButton);
    passwordField.addEventListener('focus', showButton);
    usernameField.addEventListener('blur', hideButton);
    passwordField.addEventListener('blur', hideButton);
    
    buttonContainer.style.display = 'none';
}

function isFormFieldFocused(formData) {
    const activeElement = document.activeElement;
    return activeElement === formData.usernameField || activeElement === formData.passwordField;
}

function positionButtonNearField(button, field) {
    const rect = field.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    button.style.left = (rect.left + scrollLeft) + 'px';
    button.style.top = (rect.bottom + scrollTop + 5) + 'px';
}

function fillFormWithAccount(formData, account) {
    const { usernameField, passwordField } = formData;
    
    if (usernameField) {
        usernameField.value = account.username;
        usernameField.dispatchEvent(new Event('input', { bubbles: true }));
        usernameField.dispatchEvent(new Event('change', { bubbles: true }));
        usernameField.focus();
    }
    
    if (passwordField) {
        passwordField.value = account.password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    setTimeout(() => {
        if (passwordField) {
            passwordField.focus();
        }
    }, 100);
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
    
    if (usernameField && passwordField) {
        fillFormWithAccount({ usernameField, passwordField }, account);
    }
}

function isAutoFillEnabled() {
    return localStorage.getItem('quickLoginAutoFill') !== 'false';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'fillAccount') {
        const account = currentSiteAccounts.find(acc => acc.id === message.accountId);
        if (account) {
            autoFillCredentials(account);
        }
    }
    
    if (message.action === 'toggleAutoFill') {
        isQuickLoginEnabled = !isQuickLoginEnabled;
        localStorage.setItem('quickLoginAutoFill', isQuickLoginEnabled.toString());
        sendResponse({ enabled: isQuickLoginEnabled });
    }
    
    if (message.action === 'reinitializeAutoFill') {
        console.log('收到重新初始化自動填入請求');
        // 重新初始化自動填入系統
        initializeQuickLogin();
        sendResponse({ success: true });
    }
});

const observer = new MutationObserver((mutations) => {
    let shouldReinitialize = false;
    
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.tagName === 'FORM' || 
                        node.querySelector && (node.querySelector('input[type="password"]') || node.querySelector('form'))) {
                        shouldReinitialize = true;
                    }
                }
            });
        }
    });
    
    if (shouldReinitialize) {
        setTimeout(initializeQuickLogin, 500);
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

window.addEventListener('resize', () => {
    setTimeout(() => {
        document.querySelectorAll('[id^="quickLoginBtn_"]').forEach((button, index) => {
            const loginForms = detectLoginForms();
            if (loginForms[index]) {
                positionButtonNearField(button, loginForms[index].passwordField);
            }
        });
    }, 100);
});