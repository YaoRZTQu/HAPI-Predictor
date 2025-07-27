/**
 * 认证工具类 - 处理系统的用户认证和授权
 */

class AuthManager {
    constructor() {
        this.tokenKey = 'access_token';
        this.tokenTypeKey = 'token_type';
        this.usernameKey = 'username';
        this.roleKey = 'user_role';
        this.initialized = false;
        this.apiBaseUrl = '/api';
        this.tokenUrl = '/api/auth/token'; // 确保这个URL与后端路由匹配
        
        // 受保护的路径列表，访问这些路径需要登录
        this.protectedPaths = [
            '/dashboard',
            '/reconstruction',
            '/medical-qa',
            '/online-training'
        ];
        
        // 仅管理员可访问的路径
        this.adminPaths = [
            '/admin',
            '/predictor/batch',
            '/data-dashboard'
        ];
        
        // 初始化
        this.init();
    }
    
    /**
     * 初始化认证管理器
     */
    init() {
        if (this.initialized) return;
        
        console.log('初始化认证管理器...');
        
        // 检查当前路径是否需要保护
        const currentPath = window.location.pathname;
        
        // 如果当前页面是受保护的，且用户未登录，则重定向到登录页面
        if (this.isProtectedPath(currentPath) && !this.isLoggedIn()) {
            console.log('未授权访问受保护页面，重定向到登录页面');
            window.location.href = '/login';
            return;
        }
        
        // 如果当前页面仅管理员可访问，且用户不是管理员，则重定向到仪表盘
        if (this.isAdminPath(currentPath) && !this.isAdmin()) {
            console.log('非管理员访问管理页面，重定向到仪表盘');
            window.location.href = '/dashboard';
            return;
        }
        
        // 为所有API请求添加认证头
        this.setupRequestInterceptor();
        
        // 更新页面上的UI元素
        this.updateUIElements();
        
        this.initialized = true;
    }
    
    /**
     * 判断用户是否已登录
     */
    isLoggedIn() {
        const token = localStorage.getItem(this.tokenKey);
        return !!token;
    }
    
    /**
     * 检查当前用户是否是管理员
     */
    isAdmin() {
        const userRole = this.getUserRole();
        console.log('检查管理员权限，当前角色:', userRole);
        return userRole === 'admin';
    }
    
    /**
     * 判断路径是否是受保护的
     */
    isProtectedPath(path) {
        return this.protectedPaths.some(protectedPath => 
            path === protectedPath || path.startsWith(`${protectedPath}/`));
    }
    
    /**
     * 判断路径是否仅管理员可访问
     */
    isAdminPath(path) {
        return this.adminPaths.some(adminPath => 
            path === adminPath || path.startsWith(`${adminPath}/`));
    }
    
    /**
     * 设置API请求拦截器
     */
    setupRequestInterceptor() {
        const originalFetch = window.fetch;
        const self = this;
        
        window.fetch = function(url, options = {}) {
            // 只拦截对API的请求
            if (url.toString().includes('/api/')) {
                // 获取授权头
                const token = localStorage.getItem(self.tokenKey);
                const tokenType = localStorage.getItem(self.tokenTypeKey) || 'Bearer';
                
                if (token) {
                    // 创建新的options对象
                    options = options || {};
                    options.headers = options.headers || {};
                    
                    // 添加Authorization头
                    options.headers['Authorization'] = `${tokenType} ${token}`;
                    
                    // 确保包含凭据（cookies）
                    options.credentials = 'include';
                }
            }
            
            // 调用原始fetch方法
            return originalFetch(url, options);
        };
        
        console.log('已设置请求拦截器');
    }
    
    /**
     * 更新页面上的UI元素
     */
    updateUIElements() {
        console.log('开始更新UI元素');
        
        // 显示当前用户名
        const usernameElement = document.getElementById('currentUsername');
        if (usernameElement) {
            usernameElement.textContent = this.getUsername() || '用户';
        }
        
        // 获取管理员功能元素
        const adminLink = document.getElementById('adminLink');
        const batchPredictLink = document.getElementById('batchPredictLink');
        const dataDashboardLink = document.getElementById('dataDashboardLink');
        
        // 获取仪表盘页面的管理员功能卡片
        const batchPredictCard = document.getElementById('batchPredictCard');
        const contactAndReply = document.getElementById('contactAndReply');
        const adminFeaturesRow = document.getElementById('adminFeaturesRow');
        
        console.log('当前用户角色:', this.getUserRole());
        console.log('是否为管理员:', this.isAdmin());
        console.log('找到的元素:', {
            adminLink: !!adminLink,
            batchPredictLink: !!batchPredictLink,
            dataDashboardLink: !!dataDashboardLink,
            batchPredictCard: !!batchPredictCard,
            contactAndReply: !!contactAndReply,
            adminFeaturesRow: !!adminFeaturesRow
        });
        
        if (this.isAdmin()) {
            console.log('当前用户是管理员，显示管理员功能');
            // 显示导航栏管理员专用功能
            if (adminLink) {
                adminLink.style.display = 'block';
                console.log('显示管理控制台链接');
            }
            if (batchPredictLink) {
                batchPredictLink.style.display = 'block';
                console.log('显示批量预测链接');
            } else {
                console.warn('batchPredictLink 元素不存在');
            }
            if (dataDashboardLink) {
                dataDashboardLink.style.display = 'block';
                console.log('显示数据看板链接');
            } else {
                console.warn('dataDashboardLink 元素不存在');
            }
            
            // 显示仪表盘页面的管理员功能卡片
            if (batchPredictCard) {
                batchPredictCard.style.display = 'block';
                console.log('显示批量预测卡片');
            }
            if (contactAndReply) {
                contactAndReply.style.display = 'none';
                console.log('隐藏咨询留言卡片');
            }
            if (adminFeaturesRow) {
                adminFeaturesRow.style.display = 'flex';
                console.log('显示管理员功能行');
            }
        } else {
            console.log('当前用户不是管理员，隐藏管理员功能');
            // 隐藏导航栏管理员专用功能
            if (adminLink) {
                adminLink.style.display = 'none';
                console.log('隐藏管理控制台链接');
            }
            if (batchPredictLink) {
                batchPredictLink.style.display = 'none';
                console.log('隐藏批量预测链接');
            }
            if (dataDashboardLink) {
                dataDashboardLink.style.display = 'none';
                console.log('隐藏数据看板链接');
            }
            
            // 隐藏仪表盘页面的管理员功能卡片
            if (batchPredictCard) {
                batchPredictCard.style.display = 'none';
                console.log('隐藏批量预测卡片');
            }
            if (contactAndReply) {
                contactAndReply.style.display = 'block';
                console.log('显示咨询留言卡片');
            }
            if (adminFeaturesRow) {
                adminFeaturesRow.style.display = 'none';
                console.log('隐藏管理员功能行');
            }
        }
    }
    
    /**
     * 登出
     */
    logout() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.tokenTypeKey);
        localStorage.removeItem(this.usernameKey);
        localStorage.removeItem(this.roleKey);
        
        // 重定向到登录页面
        window.location.href = '/login';
    }
    
    /**
     * 获取当前用户名
     */
    getUsername() {
        return localStorage.getItem(this.usernameKey);
    }
    
    /**
     * 获取用户角色
     */
    getUserRole() {
        const role = localStorage.getItem('user_role');
        console.log('获取用户角色:', role);
        return role;
    }
    
    // 通用的fetch方法，自动添加认证头
    async fetch(url, options = {}) {
        // 获取令牌
        const token = localStorage.getItem(this.tokenKey);
        const tokenType = localStorage.getItem(this.tokenTypeKey);
        
        if (!token || !tokenType) {
            throw new Error('未登录或令牌已过期');
        }
        
        // 构建请求选项
        const fetchOptions = {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `${tokenType} ${token}`
            }
        };
        
        return fetch(url, fetchOptions);
    }

    /**
     * 登录成功后的处理
     */
    async handleLoginSuccess(data) {
        // 保存认证信息
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('token_type', data.token_type);
        localStorage.setItem('username', data.username);
        localStorage.setItem('user_role', data.role || 'user'); // 确保保存角色信息
        
        console.log('登录成功，保存的用户信息:', {
            username: data.username,
            role: data.role || 'user'
        });
        
        // 立即更新UI元素
        this.updateUIElements();
        
        // 重定向到仪表盘
        window.location.href = '/dashboard';
    }
}

// 创建全局认证管理器实例
const authManager = new AuthManager();

// 文档加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM完全加载，执行初始化');
    
    // 查找登出按钮并绑定事件
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            authManager.logout();
        });
    }
    
    // 立即更新UI元素
    authManager.updateUIElements();
});
