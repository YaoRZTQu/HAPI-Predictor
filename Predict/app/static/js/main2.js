// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', function() {
    // 获取表单和模态框元素
    const form = document.getElementById('predictionForm');
    const resultModal = new bootstrap.Modal(document.getElementById('resultModal'));
    const riskLevelDiv = document.getElementById('riskLevel');
    const predictionResultsTable = document.getElementById('predictionResults');
    const downloadReportBtn = document.getElementById('downloadReport');
    
    // 当前预测记录的文件名
    let currentPredictionFile = '';

    // 表单提交处理
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // 获取token
        const token = localStorage.getItem('access_token');
        
        // 隐藏任何之前的错误消息
        const errorAlert = document.getElementById('errorAlert');
        if (errorAlert) {
            errorAlert.style.display = 'none';
        }
        
        console.log('表单提交开始处理');

        // 进行表单验证
        if (!form.checkValidity()) {
            e.stopPropagation();
            form.classList.add('was-validated');
            console.log('表单验证失败');
            return;
        }

        // 检查所有必需字段
        const requiredFields = [
            '年龄', '住院第几天', '白细胞计数', '血钾浓度', '白蛋白计数',
            '吸烟史', '摩擦力/剪切力', '移动能力', '感知觉', '身体活动度',
            '日常食物获取', '水肿', '皮肤潮湿', '意识障碍',
            '高血压', '糖尿病', '冠心病', '下肢深静脉血栓'
        ];

        const formData = {};
        let missingFields = [];

        // 收集数值型输入
        const numericFields = ['年龄', '住院第几天', '白细胞计数', '血钾浓度', '白蛋白计数'];
        numericFields.forEach(field => {
            const input = form.querySelector(`[name="${field}"]`);
            if (!input || !input.value) {
                missingFields.push(field);
            } else {
                formData[field] = parseFloat(input.value);
            }
        });
        
        // 收集单选按钮数据
        const radioFields = [
            '吸烟史', '摩擦力/剪切力', '移动能力', '感知觉', '身体活动度', '日常食物获取',
            '水肿', '皮肤潮湿', '意识障碍'
        ];
        radioFields.forEach(field => {
            const selectedRadio = form.querySelector(`input[name="${field}"]:checked`);
            if (!selectedRadio) {
                missingFields.push(field);
            } else {
                formData[field] = selectedRadio.value;
            }
        });
        
        // 收集基础疾病数据
        const diseaseFields = ['高血压', '糖尿病', '冠心病', '下肢深静脉血栓'];
        diseaseFields.forEach(field => {
            const select = form.querySelector(`select[name="${field}"]`);
            if (!select || !select.value) {
                missingFields.push(field);
            } else {
                formData[field] = select.value;
            }
        });

        if (missingFields.length > 0) {
            alert(`请填写以下必需字段：\n${missingFields.join('\n')}`);
            return;
        }

        try {
            console.log('开始准备数据', formData);
            
            // 重置下载报告链接
            downloadReportBtn.href = '#';
            
            // 显示加载状态
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>预测中...';
            submitBtn.disabled = true;

            // 发送预测请求
            console.log('发送预测请求到', '/api/predictor/predict');
            const response = await fetch('/api/predictor/predict', { // Ensure URL is correct
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // *** ADD AUTHORIZATION HEADER ***
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData) // Send JSON data
            });

            // 恢复按钮状态
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
            
            console.log('收到响应', response.status, response.statusText);

            if (!response.ok) {
                let errorMessage = '预测请求失败';
                try {
                    // 尝试获取详细错误信息
                    const errorData = await response.json();
                    if (errorData.detail) {
                        errorMessage = errorData.detail;
                    }
                } catch (err) {
                    // 如果无法解析错误JSON，使用状态文本
                    errorMessage = `预测请求失败: ${response.status} ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            const result = await response.json();
            console.log('解析响应数据', result);
            
            if (result.success) {
                console.log('预测成功，处理结果');
                // 显示风险等级
                riskLevelDiv.className = 'alert text-center mb-4';
                riskLevelDiv.classList.add(getRiskLevelClass(result.risk_level));
                riskLevelDiv.textContent = `风险等级：${result.risk_level}`;

                // 清空并填充预测结果表格
                predictionResultsTable.innerHTML = '';
                Object.entries(result.predictions).forEach(([model, prediction]) => {
                    const probability = result.probabilities[model];
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${getModelDisplayName(model)}</td>
                        <td>${prediction === 1 ? '有风险' : '无风险'}</td>
                        <td>${(probability * 100).toFixed(2)}%</td>
                    `;
                    predictionResultsTable.appendChild(row);
                });

                // 设置下载报告链接
                if (result.report_id) {
                    downloadReportBtn.href = result.download_report_url || `/api/predictor/download_report/${result.report_id}`;
                }
                
                // 清除旧的图表实例（如果存在）
                const chartCanvas = document.getElementById('contributionChart');
                if (window.contributionChartInstance) {
                    window.contributionChartInstance.destroy();
                }

                // 绘制特征贡献度图表
                const contributionData = Object.entries(result.feature_contributions)
                    .map(([feature, value]) => ({
                        feature: getFeatureDisplayName(feature),
                        value: value
                    }))
                    .sort((a, b) => b.value - a.value);

                const ctx = chartCanvas.getContext('2d');
                window.contributionChartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: contributionData.map(d => d.feature),
                        datasets: [{
                            label: '特征贡献度',
                            data: contributionData.map(d => d.value),
                            backgroundColor: 'rgba(52, 152, 219, 0.6)',
                            borderColor: 'rgba(52, 152, 219, 1)',
                            borderWidth: 1,
                            barThickness: 16,  // 稍微减小条形宽度
                            borderRadius: 2,   // 添加圆角
                            barPercentage: 0.8,  // 控制条形宽度占用空间的百分比
                            categoryPercentage: 0.9  // 控制类别占用空间的百分比
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: {
                            padding: {
                                left: 15,
                                right: 25,  // 增加右侧padding以显示完整的数值
                                top: 15,
                                bottom: 15
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            },
                            title: {
                                display: true,
                                text: '特征对预测结果的贡献度',
                                padding: {
                                    top: 10,
                                    bottom: 20
                                }
                            }
                        },
                        scales: {
                            x: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: '贡献度'
                                },
                                grid: {
                                    display: true,
                                    drawBorder: true,
                                    color: 'rgba(0, 0, 0, 0.1)'
                                }
                            },
                            y: {
                                ticks: {
                                    font: {
                                        size: 11
                                    },
                                    padding: 8  // 增加标签和条形之间的间距
                                },
                                grid: {
                                    display: false  // 隐藏水平网格线
                                }
                            }
                        }
                    }
                });

                // 显示结果模态框
                resultModal.show();
            } else {
                throw new Error(result.message || '预测失败');
            }

        } catch (error) {
            // 显示错误提示
            console.error('预测错误:', error);
            
            // 使用警告框显示错误
            const errorAlert = document.getElementById('errorAlert');
            const errorMessage = document.getElementById('errorMessage');
            if (errorAlert && errorMessage) {
                errorMessage.textContent = `预测失败：${error.message}`;
                errorAlert.style.display = 'block';
                
                // 滚动到错误消息
                errorAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                // 降级到 alert
                alert('预测失败：' + error.message);
            }
        }
    });

    // 下载报告按钮点击处理
    downloadReportBtn.addEventListener('click', function() {
        if (currentPredictionFile) {
            // 在新窗口中打开PDF下载
            window.open(`/download_report/${currentPredictionFile}`, '_blank');
        }
    });

    // 重置按钮点击处理
    form.querySelector('button[type="reset"]').addEventListener('click', function() {
        form.classList.remove('was-validated');
        // 隐藏错误消息
        const errorAlert = document.getElementById('errorAlert');
        if (errorAlert) {
            errorAlert.style.display = 'none';
        }
        // 重置所有复选框
        form.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
        // 重置所有单选框
        form.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.checked = false;
        });
    });

    // 数值输入验证
    form.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('input', function() {
            validateNumericInput(this);
        });
    });

    // 添加加载状态样式
    const style = document.createElement('style');
    style.textContent = `
        .spinner-border {
            display: inline-block;
            width: 1rem;
            height: 1rem;
            border: 0.2em solid currentColor;
            border-right-color: transparent;
            border-radius: 50%;
            animation: spinner-border .75s linear infinite;
        }
        @keyframes spinner-border {
            to { transform: rotate(360deg); }
        }
        .chart-container img {
            max-height: 100%;
            width: auto;
            object-fit: contain;
        }
    `;
    document.head.appendChild(style);
});

// 辅助函数：获取风险等级对应的CSS类
function getRiskLevelClass(riskLevel) {
    switch (riskLevel) {
        case '高风险':
            return 'high-risk';
        case '中风险':
            return 'medium-risk';
        case '低风险':
            return 'low-risk';
        default:
            return '';
    }
}

// 辅助函数：获取模型显示名称
function getModelDisplayName(modelName) {
    const displayNames = {
        'xgboost': 'XGBoost模型',
        'random_forest': '随机森林模型',
        'logistic_regression': '逻辑回归模型',
        'naive_bayes': '朴素贝叶斯模型'
    };
    return displayNames[modelName] || modelName;
}

// 辅助函数：验证数值输入
function validateNumericInput(input) {
    const value = parseFloat(input.value);
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    
    if (input.name === '年龄') {
        if (isNaN(value) || value < 0 || value > 120) {
            input.setCustomValidity('请输入有效年龄（0-120岁）');
        } else {
            input.setCustomValidity('');
        }
    } else if (input.name === '住院第几天') {
        if (isNaN(value) || value < 0) {
            input.setCustomValidity('请输入有效住院时长');
        } else {
            input.setCustomValidity('');
        }
    } else if (['白细胞计数', '血钾浓度', '白蛋白计数'].includes(input.name)) {
        if (isNaN(value) || value < 0) {
            input.setCustomValidity('请输入有效的检验值');
        } else {
            input.setCustomValidity('');
        }
    }
}

// 辅助函数：格式化日期时间
function formatDateTime(date) {
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(date);
}

// 添加特征名称显示转换函数
function getFeatureDisplayName(feature) {
    const displayNames = {
        '住院时长': '住院时长',
        '白细胞': '白细胞计数',
        '血钾': '血钾浓度',
        '白蛋白': '白蛋白计数',
        '日常食物获取量': '日常食物获取',
    };
    return displayNames[feature] || feature;
}

// 显示/隐藏预测表单
function togglePredictionForm() {
    const form = document.getElementById('prediction-form');
    const resultContainer = document.getElementById('result-container');
    
    if (form.style.display === 'none') {
        form.style.display = 'block';
        resultContainer.style.display = 'none';
    } else {
        form.style.display = 'none';
    }
}

// 开始新预测
function newPrediction() {
    document.getElementById('predict-form').reset();
    document.getElementById('result-container').style.display = 'none';
    document.getElementById('prediction-form').style.display = 'block';
}

// 在页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    console.log('页面加载完成，JavaScript已初始化');
    
    // 表单提交处理
    const form = document.getElementById('predict-form');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log('表单提交事件触发');
            
            // 获取表单数据
            const formData = new FormData(this);
            const data = {};
            for (let [key, value] of formData.entries()) {
                data[key] = value;
            }
            
            console.log('提交的数据:', data);
            
            // 发送预测请求
            fetch('/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.message || '预测失败');
                    });
                }
                return response.json();
            })
            .then(result => {
                console.log('预测结果:', result);
                if (result.status === 'success') {
                    displayResults(result);
                } else {
                    alert('预测失败: ' + result.message);
                }
            })
            .catch(error => {
                console.error('错误:', error);
                alert('错误: ' + error.message);
            });
        });
    } else {
        console.warn('未找到预测表单元素');
    }
});

// 显示预测结果
function displayResults(data) {
    // 隐藏表单，显示结果
    document.getElementById('prediction-form').style.display = 'none';
    document.getElementById('result-container').style.display = 'block';
    
    console.log('显示结果:', data);
    
    // 设置风险等级
    const riskLevel = data.risk_level;
    const riskAlert = document.getElementById('risk-level-alert');
    const riskText = document.getElementById('risk-level-value');
    
    riskText.textContent = riskLevel;
    
    // 设置风险等级的颜色
    if (riskLevel === '高风险') {
        riskAlert.className = 'alert alert-danger';
    } else if (riskLevel === '中风险') {
        riskAlert.className = 'alert alert-warning';
    } else {
        riskAlert.className = 'alert alert-success';
    }
    
    // 填充模型预测结果
    const predictionResults = document.getElementById('prediction-results');
    predictionResults.innerHTML = '';
    
    const modelNames = {
        'xgboost': 'XGBoost模型',
        'random_forest': '随机森林模型',
        'logistic_regression': '逻辑回归模型',
        'naive_bayes': '朴素贝叶斯模型'
    };
    
    for (const model in data.predictions) {
        const row = document.createElement('tr');
        
        const modelCell = document.createElement('td');
        modelCell.textContent = modelNames[model] || model;
        
        const resultCell = document.createElement('td');
        resultCell.textContent = data.predictions[model] === 1 ? '有风险' : '无风险';
        
        const probCell = document.createElement('td');
        const probability = (data.probabilities[model] * 100).toFixed(2) + '%';
        probCell.textContent = probability;
        
        row.appendChild(modelCell);
        row.appendChild(resultCell);
        row.appendChild(probCell);
        
        predictionResults.appendChild(row);
    }
    
    // 填充特征重要性
    const featureImportance = document.getElementById('feature-importance');
    featureImportance.innerHTML = '';
    
    for (const feature in data.feature_contributions) {
        const row = document.createElement('tr');
        
        const featureCell = document.createElement('td');
        featureCell.textContent = feature;
        
        const weightCell = document.createElement('td');
        weightCell.textContent = data.feature_contributions[feature].toFixed(4);
        
        row.appendChild(featureCell);
        row.appendChild(weightCell);
        
        featureImportance.appendChild(row);
    }
    
    // 设置下载报告链接
    document.getElementById('download-report').href = '/download_report/' + data.filename;
}