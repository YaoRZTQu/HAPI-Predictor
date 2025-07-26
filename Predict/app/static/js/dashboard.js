// 导入主题和辅助功能设置
document.addEventListener('DOMContentLoaded', function() {
    updateDashboardUI();
    
    // 从页面模板获取用户名
    const usernameSpan = document.getElementById('username');
    const usernameFromServer = usernameSpan.textContent.trim();
    
    // 如果服务器返回了用户名，但本地存储没有，则更新本地存储
    if (usernameFromServer && usernameFromServer !== '') {
        if (!localStorage.getItem('username')) {
            localStorage.setItem('username', usernameFromServer);
        } else {
            // 如果本地存储有用户名，则更新页面显示
            const storedUsername = localStorage.getItem('username');
            if (usernameFromServer === '{{ username }}' && storedUsername) {
                usernameSpan.textContent = storedUsername;
            }
        }
    }
    
    // 登出按钮事件处理
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        // 如果存在authManager对象，使用它进行登出
        if (typeof authManager !== 'undefined') {
            authManager.logout();
        } else {
            // 备用登出逻辑
            localStorage.removeItem('access_token');
            localStorage.removeItem('token_type');
            localStorage.removeItem('username');
            window.location.href = '/login';
        }
    });
});  // 检查用户权限并显示相应功能
function updateDashboardUI() {
    const userRole = localStorage.getItem('user_role');
    const batchPredictCard = document.getElementById('batchPredictCard');
    const adminFeaturesRow = document.getElementById('adminFeaturesRow');
    
    if (userRole === 'admin') {
        // 管理员用户显示所有功能
        if (batchPredictCard) batchPredictCard.style.display = 'block';
        if (adminFeaturesRow) adminFeaturesRow.style.display = 'flex';
    } else {
        // 普通用户隐藏管理员功能
        if (batchPredictCard) batchPredictCard.style.display = 'none';
        if (adminFeaturesRow) adminFeaturesRow.style.display = 'none';
    }
}
