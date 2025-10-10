const loginForm = document.getElementById('loginForm');
const submitButton = document.getElementById('submitButton');
const loadingIndicator = document.getElementById('loadingIndicator');
const buttonText = document.getElementById('buttonText');
const messageDiv = document.getElementById('message');
const themeToggle = document.getElementById('theme-toggle');

let baseFontSize = 16; // 基础字体大小

// 主题切换功能
function initThemeToggle() {
    // 检查本地存储的主题偏好
    if (localStorage.getItem('nightMode') === 'true') {
        document.body.classList.add('night-mode');
        themeToggle.checked = true;
    }
    
    // 添加主题切换事件
    themeToggle.addEventListener('change', () => {
        if (themeToggle.checked) {
            document.body.classList.add('night-mode');
            localStorage.setItem('nightMode', 'true');
        } else {
            document.body.classList.remove('night-mode');
            localStorage.setItem('nightMode', 'false');
        }
    });
}

function showLoading() {
    submitButton.disabled = true;
    loadingIndicator.style.display = 'inline-block';
    buttonText.textContent = 'Logging in...';
}

function hideLoading() {
    submitButton.disabled = false;
    loadingIndicator.style.display = 'none';
    buttonText.textContent = 'Log in';
}

function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    // 应用动画
    requestAnimationFrame(() => {
        messageDiv.style.animation = 'message-fade-in 0.3s forwards';
    });
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    showLoading();
    showMessage('Logging in...', 'success');
    
    try {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);
        
        const response = await fetch('/api/auth/token', {
            method: 'POST',
            body: formData,
            credentials: 'include'  // 确保包含 cookies
        });
        
        if (response.ok) {
            const data = await response.json();
            showMessage('Login successful! Redirecting......', 'success');
            
            // 保存用户信息和token
            localStorage.setItem('username', data.username);
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('token_type', data.token_type);
            localStorage.setItem('user_role', data.role || 'user');
            
            // 设置全局Authorization头部，用于后续API请求
            const authToken = `${data.token_type} ${data.access_token}`;
            console.log('Authentication token has been set:', authToken.substring(0, 20) + '...');
            console.log('User Role:', data.role || 'user');
            
            // 延迟跳转到仪表盘
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1000);
        } else {
            try {
                const data = await response.json();
                showMessage(data.detail || 'Login failed, please check your username and password', 'error');
            } catch (e) {
                showMessage(`Login failed: ${response.status} ${response.statusText}`, 'error');
            }
            hideLoading();
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('Login failed, please check your network connection', 'error');
        hideLoading();
    }
});

// 添加全局请求拦截器，为所有请求添加Authorization头
document.addEventListener('DOMContentLoaded', () => {
    // 检查是否已登录
    const token = localStorage.getItem('access_token');
    const tokenType = localStorage.getItem('token_type');
    
    if (token && tokenType) {
        console.log('Saved token found, may already be logged in');
    }
    
    // 初始化主题
    initThemeToggle();
    
    // 添加键盘快捷键
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+D: 切换夜间模式
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            themeToggle.checked = !themeToggle.checked;
            themeToggle.dispatchEvent(new Event('change'));
        }
        
        // Enter键提交表单
        if (e.key === 'Enter' && document.activeElement.tagName !== 'BUTTON') {
            e.preventDefault();
            submitButton.click();
        }
    });
}); 