// data_dashboard.js - 数据看板交互脚本

// 全局变量
let predictionTrendChart = null;
let qaTrendChart = null;
let isDarkMode = localStorage.getItem('theme') === 'dark';
let fadeInElements = [];

// DOM 加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
    // 应用主题设置
    applyThemeSettings();
    
    // 初始化淡入动画元素
    initAnimations();
    
    // 加载数据
    loadDashboardData();
    
    // 绑定事件
    document.getElementById('refreshBtn').addEventListener('click', loadDashboardData);
    document.getElementById('exportBtn').addEventListener('click', exportDashboardReport);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // 添加滚动监听
    window.addEventListener('scroll', checkScrollAnimation);
});

// 初始化动画元素
function initAnimations() {
    // 选择需要动画的元素
    fadeInElements = document.querySelectorAll('.stat-card, .chart-container, .record-container');
    
    // 初始化状态
    fadeInElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    });
    
    // 立即检查可见元素
    setTimeout(checkScrollAnimation, 300);
}

// 检查并应用滚动动画
function checkScrollAnimation() {
    const triggerBottom = window.innerHeight * 0.85;
    
    fadeInElements.forEach(el => {
        const elementTop = el.getBoundingClientRect().top;
        
        if (elementTop < triggerBottom) {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }
    });
}

// 应用主题设置
function applyThemeSettings() {
    // 检查本地存储中的主题偏好
    isDarkMode = localStorage.getItem('theme') === 'dark';
    if (isDarkMode) {
        document.body.classList.add('night-mode');
    }
    
    // 应用高对比度设置
    if (localStorage.getItem('highContrast') === 'true') {
        document.body.classList.add('high-contrast');
    }
    
    // 应用字体大小设置
    const savedFontSize = localStorage.getItem('fontSize');
    if (savedFontSize) {
        const baseFontSize = parseInt(savedFontSize);
        document.documentElement.style.setProperty('--font-size-base', `${baseFontSize}px`);
        document.body.style.fontSize = `${baseFontSize}px`;
    }
}

// 处理登出
function handleLogout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('token_type');
    window.location.href = '/login';
}

// 加载仪表盘数据
async function loadDashboardData() {
    showLoading(true);
    
    try {
        // 获取统计数据
        const statsResponse = await fetch('/api/data-dashboard/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (!statsResponse.ok) {
            throw new Error('获取统计数据失败');
        }
        
        const statsData = await statsResponse.json();
        
        // 更新统计卡片
        updateStatCards(statsData);
        
        // 更新系统性能指标
        updatePerformanceIndicators(statsData.system_performance);
        
        // 获取预测趋势数据
        const trendResponse = await fetch('/api/data-dashboard/prediction-trend', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (!trendResponse.ok) {
            throw new Error('获取预测趋势数据失败');
        }
        
        const trendData = await trendResponse.json();
        
        // 获取问答趋势数据
        const qaTrendResponse = await fetch('/api/data-dashboard/qa-trend', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (!qaTrendResponse.ok) {
            throw new Error('获取问答趋势数据失败');
        }
        
        const qaTrendData = await qaTrendResponse.json();
        
        // 更新趋势图表
        updateTrendCharts(trendData, qaTrendData);
        
        // 获取最近的预测记录
        const predResponse = await fetch('/api/data-dashboard/recent-predictions', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (!predResponse.ok) {
            throw new Error('获取最近预测记录失败');
        }
        
        const predData = await predResponse.json();
        
        // 获取最近的问答记录
        const qaResponse = await fetch('/api/data-dashboard/recent-qa', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (!qaResponse.ok) {
            throw new Error('获取最近问答记录失败');
        }
        
        const qaData = await qaResponse.json();
        
        // 更新最近记录
        updateRecentPredictions(predData);
        updateRecentQA(qaData.qa_records);
        
        // 更新数据更新时间
        document.getElementById('last-update-time').textContent = 
            new Date().toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        
        showLoading(false);
        
    } catch (error) {
        console.error('加载数据失败:', error);
        showLoading(false);
        showError('加载数据失败，请重试');
    }
}

// 显示/隐藏加载动画
function showLoading(show) {
    const loadingElement = document.getElementById('loading');
    const contentSections = document.querySelectorAll('#stats-section, #charts-section, #records-section');
    
    if (show) {
        loadingElement.style.display = 'block';
        contentSections.forEach(section => {
            if (section) section.style.opacity = '0.5';
        });
    } else {
        loadingElement.style.display = 'none';
        contentSections.forEach(section => {
            if (section) section.style.opacity = '1';
        });
    }
}

// 显示错误消息
function showError(message) {
    // 简单的错误提示，实际应用中可以使用模态框或toast
    alert(message);
}

// 更新统计卡片
function updateStatCards(data) {
    // 获取旧值用于动画
    const oldModelsCount = parseInt(document.getElementById('models-count').textContent) || 0;
    const oldPredictionsCount = parseInt(document.getElementById('predictions-count').textContent) || 0;
    const oldQaCount = parseInt(document.getElementById('qa-count').textContent) || 0;
    const oldUsersCount = parseInt(document.getElementById('users-count').textContent) || 0;
    
    // 使用动画更新
    animateCounter('models-count', oldModelsCount, data.models_count);
    animateCounter('predictions-count', oldPredictionsCount, data.predictions_count);
    animateCounter('qa-count', oldQaCount, data.qa_count);
    animateCounter('users-count', oldUsersCount, data.users_count);
}

// 数字增长动画
function animateCounter(elementId, startValue, endValue) {
    const element = document.getElementById(elementId);
    const duration = 1000; // 动画持续时间（毫秒）
    const stepTime = 50; // 每步时间
    const steps = duration / stepTime;
    const increment = (endValue - startValue) / steps;
    
    let currentValue = startValue;
    let currentStep = 0;
    
    const animation = setInterval(() => {
        currentStep++;
        currentValue += increment;
        
        if (currentStep >= steps) {
            clearInterval(animation);
            element.textContent = endValue;
        } else {
            element.textContent = Math.round(currentValue);
        }
    }, stepTime);
}

// 更新系统性能指标
function updatePerformanceIndicators(performance) {
    // CPU使用率
    updateProgressBar('cpu-usage', performance.cpu_usage);
    
    // 内存使用率
    updateProgressBar('memory-usage', performance.memory_usage);
    
    // 磁盘使用率
    updateProgressBar('disk-usage', performance.disk_usage);
    
    // 响应时间 (响应时间单位是毫秒，范围是0-1000毫秒，超过300毫秒显示为警告)
    const responseTime = performance.response_time;
    const responseTimeMs = responseTime;
    const responseTimePercent = Math.min(responseTimeMs / 1000 * 100, 100);
    
    const responseTimeBar = document.getElementById('response-time-bar');
    if (responseTimeBar) {
        responseTimeBar.style.width = `${responseTimePercent}%`;
        
        if (responseTimeMs > 300) {
            responseTimeBar.className = 'progress-bar bg-warning';
        } else {
            responseTimeBar.className = 'progress-bar';
        }
    }
    
    const responseTimeValue = document.getElementById('response-time-value');
    if (responseTimeValue) {
        responseTimeValue.textContent = `${responseTimeMs}ms`;
    }
}

// 更新进度条
function updateProgressBar(id, value) {
    const bar = document.getElementById(`${id}-bar`);
    const valueElement = document.getElementById(`${id}-value`);
    
    if (!bar || !valueElement) return;
    
    // 保存原始宽度
    const originalWidth = bar.style.width;
    
    // 设置初始宽度为0并添加过渡效果
    bar.style.transition = 'width 1s ease-in-out';
    bar.style.width = '0%';
    
    // 触发重排以确保动画发生
    bar.offsetWidth;
    
    // 应用实际宽度
    bar.style.width = `${value}%`;
    valueElement.textContent = `${value}%`;
    
    // 根据使用率级别设置颜色
    if (value > 90) {
        bar.className = 'progress-bar bg-danger';
    } else if (value > 70) {
        bar.className = 'progress-bar bg-warning';
    } else {
        bar.className = 'progress-bar';
    }
}

// 更新趋势图表
function updateTrendCharts(trendData, qaTrendData) {
    const dates = trendData.dates;
    const singlePredCounts = trendData.single_prediction;
    const batchPredCounts = trendData.batch_prediction;
    
    // 计算总预测数（单例+批量）
    const totalPredCounts = singlePredCounts.map((count, index) => 
        count + batchPredCounts[index]
    );
    
    // 问答趋势数据
    const qaCounts = qaTrendData.counts;
    
    // 图表颜色设置
    const chartColors = {
        prediction: {
            line: isDarkMode ? 'rgba(0, 176, 255, 0.7)' : 'rgba(0, 96, 122, 0.7)',
            fill: isDarkMode ? 'rgba(0, 176, 255, 0.1)' : 'rgba(0, 96, 122, 0.1)'
        },
        qa: {
            line: isDarkMode ? 'rgba(255, 193, 7, 0.7)' : 'rgba(251, 140, 0, 0.7)',
            fill: isDarkMode ? 'rgba(255, 193, 7, 0.1)' : 'rgba(251, 140, 0, 0.1)'
        },
        text: isDarkMode ? '#E0E0E0' : '#666666',
        grid: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
    };
    
    // 预测趋势图
    if (predictionTrendChart) {
        predictionTrendChart.destroy();
    }
    
    const predCtx = document.getElementById('prediction-trend-chart').getContext('2d');
    predictionTrendChart = new Chart(predCtx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: '预测数量',
                data: totalPredCounts,
                borderColor: chartColors.prediction.line,
                backgroundColor: chartColors.prediction.fill,
                tension: 0.4,
                fill: true
            }]
        },
        options: getChartOptions('预测数量', chartColors)
    });
    
    // 问答趋势图
    if (qaTrendChart) {
        qaTrendChart.destroy();
    }
    
    const qaCtx = document.getElementById('qa-trend-chart').getContext('2d');
    qaTrendChart = new Chart(qaCtx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: '问答数量',
                data: qaCounts,
                borderColor: chartColors.qa.line,
                backgroundColor: chartColors.qa.fill,
                tension: 0.4,
                fill: true
            }]
        },
        options: getChartOptions('问答数量', chartColors)
    });
}

// 获取图表配置
function getChartOptions(yAxisTitle, colors) {
    return {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: isDarkMode ? '#333' : 'white',
                titleColor: colors.text,
                bodyColor: colors.text,
                borderColor: colors.grid,
                borderWidth: 1
            }
        },
        scales: {
            x: {
                grid: {
                    display: false
                },
                ticks: {
                    color: colors.text
                }
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: colors.grid
                },
                ticks: {
                    color: colors.text
                },
                title: {
                    display: true,
                    text: yAxisTitle,
                    color: colors.text
                }
            }
        }
    };
}

// 更新图表主题
function updateChartsTheme() {
    if (predictionTrendChart && qaTrendChart) {
        // 获取最新数据
        const predData = predictionTrendChart.data.datasets[0].data;
        const predLabels = predictionTrendChart.data.labels;
        const qaData = qaTrendChart.data.datasets[0].data;
        
        // 重新渲染图表
        updateTrendCharts(
            predLabels.map((date, i) => ({ date, count: predData[i] })),
            predLabels.map((date, i) => ({ date, count: qaData[i] }))
        );
    }
}

// 更新最近预测记录
function updateRecentPredictions(predictions) {
    const container = document.getElementById('recent-predictions');
    container.innerHTML = '';
    
    if (!predictions || predictions.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">暂无预测记录</p>';
        return;
    }
    
    predictions.forEach(pred => {
        const predItem = document.createElement('div');
        predItem.className = 'record-item';
        predItem.innerHTML = `
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <strong>${pred.username || '未知用户'}</strong> 
                    进行了${pred.prediction_type === 'single' ? '单例' : '批量'}预测
                    <div class="mt-1 small">
                        风险级别: <span class="badge ${getRiskBadgeClass(pred.risk_level)}">${getRiskLevelName(pred.risk_level)}</span>
                    </div>
                </div>
                <div class="text-muted small">${pred.created_at || '未知时间'}</div>
            </div>
            <div class="d-flex mt-2">
                <button class="btn btn-sm btn-outline-primary me-2" onclick="viewPredictionDetail('${pred.id}')">
                    <i class="bi bi-eye me-1"></i> 查看详情
                </button>
            </div>
        `;
        container.appendChild(predItem);
    });
}

// 获取风险级别对应的样式类
function getRiskBadgeClass(riskLevel) {
    switch(riskLevel) {
        case 'high':
            return 'bg-danger';
        case 'medium':
            return 'bg-warning text-dark';
        case 'low':
            return 'bg-success';
        default:
            return 'bg-secondary';
    }
}

// 获取风险级别的中文名称
function getRiskLevelName(riskLevel) {
    switch(riskLevel) {
        case 'high':
            return '高风险';
        case 'medium':
            return '中等风险';
        case 'low':
            return '低风险';
        default:
            return '未知';
    }
}

// 查看预测详情
async function viewPredictionDetail(id) {
    try {
        const response = await fetch(`/api/data-dashboard/prediction/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('获取预测详情失败');
        }
        
        const data = await response.json();
        
        // 显示预测详情模态框
        const modal = new bootstrap.Modal(document.getElementById('predictionDetailModal'));
        
        // 更新模态框内容
        document.getElementById('prediction-id').textContent = data.id;
        document.getElementById('prediction-user').textContent = data.user;
        document.getElementById('prediction-model').textContent = data.model;
        document.getElementById('prediction-time').textContent = new Date(data.timestamp).toLocaleString('zh-CN');
        
        // 更新风险等级，添加适当的样式类
        const riskLevelElement = document.getElementById('prediction-risk-level');
        riskLevelElement.textContent = getRiskLevelName(data.risk_level);
        riskLevelElement.className = `badge ${getRiskBadgeClass(data.risk_level)}`;
        
        // 更新输入数据表格
        updateInputDataTable(data.input_data);
        
        // 更新预测结果
        updatePredictionResultsTable(data.results);
        
        // 显示模态框
        modal.show();
        
    } catch (error) {
        console.error('获取预测详情失败:', error);
        showError('获取预测详情失败，请重试');
    }
}

// 下载预测报告
async function downloadPredictionReport(id) {
    try {
        const response = await fetch(`/api/predictor/download_report/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('下载报告失败');
        }
        
        // 获取blob数据
        const blob = await response.blob();
        
        // 创建下载链接
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `prediction_report_${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
    } catch (error) {
        console.error('下载报告失败:', error);
        showError('下载报告失败，请重试');
    }
}

// 更新输入数据表格
function updateInputDataTable(inputData) {
    const tableBody = document.getElementById('input-data-table').querySelector('tbody');
    tableBody.innerHTML = '';
    
    // 遍历输入数据字段
    Object.entries(inputData).forEach(([key, value]) => {
        const row = document.createElement('tr');
        
        // 处理键名，将下划线替换为空格并首字母大写
        const formattedKey = key
            .replace(/_/g, ' ')
            .replace(/\b\w/g, char => char.toUpperCase());
        
        // 处理值，如果是对象或数组则格式化为JSON文本，长度过长则截断
        let formattedValue = value;
        if (typeof value === 'object' && value !== null) {
            formattedValue = JSON.stringify(value, null, 2);
            // 如果是JSON字符串，则添加pre标签使其保持格式
            formattedValue = `<pre class="mb-0 code-block">${formattedValue}</pre>`;
        } else if (typeof value === 'string' && value.length > 50) {
            // 长字符串显示截断版本并提供展开按钮
            formattedValue = `
                <div class="text-truncate" style="max-width: 300px;" title="${value}">${value}</div>
                <button class="btn btn-link btn-sm p-0 mt-1 show-full-text">显示全部</button>
                <div class="full-text" style="display: none;">
                    <pre class="mb-0 mt-2 code-block">${value}</pre>
                    <button class="btn btn-link btn-sm p-0 mt-1 hide-full-text">收起</button>
                </div>
            `;
        }
        
        row.innerHTML = `
            <td class="field-name" style="font-weight: 500;">${formattedKey}</td>
            <td class="field-value">${formattedValue}</td>
        `;
        tableBody.appendChild(row);
    });
    
    // 绑定展开/收起按钮事件
    tableBody.querySelectorAll('.show-full-text').forEach(button => {
        button.addEventListener('click', function() {
            this.style.display = 'none';
            this.previousElementSibling.style.display = 'none';
            this.nextElementSibling.style.display = 'block';
        });
    });
    
    tableBody.querySelectorAll('.hide-full-text').forEach(button => {
        button.addEventListener('click', function() {
            const fullTextDiv = this.parentElement;
            fullTextDiv.style.display = 'none';
            fullTextDiv.previousElementSibling.style.display = 'block';
            fullTextDiv.previousElementSibling.previousElementSibling.style.display = 'block';
        });
    });
}

// 更新预测结果表格
function updatePredictionResultsTable(results) {
    const tableBody = document.getElementById('prediction-results-table').querySelector('tbody');
    tableBody.innerHTML = '';
    
    // 遍历预测结果
    Object.entries(results).forEach(([model, result]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${model}</td>
            <td>${result.prediction}</td>
            <td>${(result.probability * 100).toFixed(2)}%</td>
        `;
        tableBody.appendChild(row);
    });
}

// 更新最近问答记录
function updateRecentQA(qaRecords) {
    const container = document.getElementById('recent-qa');
    container.innerHTML = '';
    
    if (!qaRecords || qaRecords.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">暂无问答记录</p>';
        return;
    }
    
    qaRecords.forEach(qa => {
        const timestamp = new Date(qa.timestamp);
        const formattedDate = timestamp.toLocaleString('zh-CN');
        
        const qaItem = document.createElement('div');
        qaItem.className = 'record-item';
        qaItem.innerHTML = `
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <strong>${qa.user}</strong> 提问: 
                    <span class="text-primary">${qa.question.length > 50 ? qa.question.substring(0, 50) + '...' : qa.question}</span>
                </div>
                <div class="text-muted small">${formattedDate}</div>
            </div>
            <div class="mt-2">
                <button class="btn btn-sm btn-outline-primary" onclick="viewConversation('${qa.conversation_id}')">
                    <i class="bi bi-chat-dots me-1"></i> 查看对话
                </button>
            </div>
        `;
        container.appendChild(qaItem);
    });
}

// 导出数据看板报告
function exportDashboardReport() {
    alert('报告导出功能正在开发中...');
    // TODO: 实现报告导出功能
}

// 查看对话详情
async function viewConversation(id) {
    try {
        const response = await fetch(`/api/data-dashboard/conversation/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('获取对话详情失败');
        }
        
        const data = await response.json();
        
        // 显示对话详情模态框
        const modal = new bootstrap.Modal(document.getElementById('conversationModal'));
        
        // 更新模态框内容
        document.getElementById('conversation-id').textContent = data.id;
        document.getElementById('conversation-user').textContent = data.user;
        document.getElementById('conversation-time').textContent = new Date(data.timestamp).toLocaleString('zh-CN');
        
        // 更新对话内容
        const conversationBody = document.getElementById('conversation-body');
        conversationBody.innerHTML = '';
        
        data.messages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.role === 'user' ? 'user-message' : 'system-message'}`;
            messageDiv.innerHTML = `
                <div class="message-content">
                    <div class="message-text">${msg.content}</div>
                    <div class="message-time">${new Date(msg.timestamp).toLocaleTimeString('zh-CN')}</div>
                </div>
            `;
            conversationBody.appendChild(messageDiv);
        });
        
        // 显示模态框
        modal.show();
        
    } catch (error) {
        console.error('获取对话详情失败:', error);
        showError('获取对话详情失败，请重试');
    }
} 