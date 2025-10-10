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
            'Age', 'Length of hospitalization', 'White blood cells', 'Serum potassium', 'Albumin',
            'Smoking history', 'Friction or shear', 'Mobility', 'Sensation', 'Physical activity',
            'Daily food intake', 'Edema', 'Moist skin', 'Consciousness',
            'Hypertension', 'Diabetes mellitus', 'Coronary heart disease', 'Deep vein thrombosis'
        ];

        const formData = {};
        let missingFields = [];

        // 收集数值型输入
        const numericFields = ['Age', 'Length of hospitalization', 'White blood cells', 'Serum potassium', 'Albumin'];
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
            'Smoking history', 'Friction or shear', 'Mobility', 'Sensation', 'Physical activity', 'Daily food intake',
            'Edema', 'Moist skin', 'Consciousness'
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
        const diseaseFields = ['Hypertension', 'Diabetes mellitus', 'Coronary heart disease', 'Deep vein thrombosis'];
        diseaseFields.forEach(field => {
            const select = form.querySelector(`select[name="${field}"]`);
            if (!select || !select.value) {
                missingFields.push(field);
            } else {
                formData[field] = select.value;
            }
        });

        if (missingFields.length > 0) {
            alert(`Please fill in the required fields below:\n${missingFields.join('\n')}`);
            return;
        }

        try {
            console.log('开始准备数据', formData);
            
            // 重置下载报告链接
            downloadReportBtn.href = '#';
            
            // 显示加载状态
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Predicting...';
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
                let errorMessage = 'Prediction request failed';
                try {
                    // 尝试获取详细错误信息
                    const errorData = await response.json();
                    if (errorData.detail) {
                        errorMessage = errorData.detail;
                    }
                } catch (err) {
                    // 如果无法解析错误JSON，使用状态文本
                    errorMessage = `Prediction request failed: ${response.status} ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            const result = await response.json();
            console.log('解析响应数据', result);
            
            if (result.success) {
                console.log('Prediction successful, processing results');
                // {{ AURA-X: Modify - 改为英文显示风险等级 }}
                // 显示风险等级
                riskLevelDiv.className = 'alert text-center mb-4';
                riskLevelDiv.classList.add(getRiskLevelClass(result.risk_level));
                riskLevelDiv.textContent = `Risk Level: ${result.risk_level}`;

                // {{ AURA-X: Add - 显示护理措施建议 }}
                const nursingInterventionsDiv = document.getElementById('nursingInterventions');
                const interventionContentDiv = document.getElementById('interventionContent');
                const interventions = getNursingInterventions(result.risk_level);
                
                if (interventions) {
                    let interventionHTML = `<h6 class="text-primary mb-3">${interventions.title}</h6>`;
                    interventions.measures.forEach(measure => {
                        interventionHTML += `
                            <div class="mb-3">
                                <h6 class="fw-bold text-secondary">${measure.title}</h6>
                                <p class="ms-3 mb-2">${measure.content}</p>
                            </div>
                        `;
                    });
                    interventionContentDiv.innerHTML = interventionHTML;
                    nursingInterventionsDiv.style.display = 'block';
                } else {
                    nursingInterventionsDiv.style.display = 'none';
                }

                // 清空并填充预测结果表格
                predictionResultsTable.innerHTML = '';
                Object.entries(result.predictions).forEach(([model, prediction]) => {
                    const probability = result.probabilities[model];
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${getModelDisplayName(model)}</td>
                        <td>${prediction === 1 ? 'At Risk' : 'No Risk'}</td>
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
                // {{ AURA-X: Add - 添加调试日志以检查特征映射 }}
                console.log('原始特征贡献度数据:', result.feature_contributions);
                const contributionData = Object.entries(result.feature_contributions)
                    .map(([feature, value]) => {
                        const displayName = getFeatureDisplayName(feature);
                        // {{ AURA-X: Add - 如果映射失败，至少显示原始名称 }}
                        const finalName = displayName || feature || 'Unknown Feature';
                        console.log(`特征映射: "${feature}" -> "${finalName}"`);
                        return {
                            feature: finalName,
                            value: value
                        };
                    })
                    .sort((a, b) => b.value - a.value);
                console.log('处理后的特征数据:', contributionData);

                const ctx = chartCanvas.getContext('2d');
                window.contributionChartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: contributionData.map(d => d.feature),
                        datasets: [{
                            label: 'Feature Contribution',
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
                                left: 20,  // {{ AURA-X: Modify - 增加左侧padding确保标签完整显示 }}
                                right: 30,  // 增加右侧padding以显示完整的数值
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
                                text: 'Feature Contribution to Prediction',
                                padding: {
                                    top: 10,
                                    bottom: 20
                                },
                                font: {
                                    size: 14,
                                    weight: 'bold'
                                }
                            }
                        },
                        scales: {
                            x: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Contribution Score'
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
                                        size: 10  // {{ AURA-X: Modify - 稍微减小字体以确保所有标签可见 }}
                                    },
                                    padding: 5,  // 减少padding节省空间
                                    autoSkip: false,  // {{ AURA-X: Add - 禁用自动跳过，显示所有标签 }}
                                    maxRotation: 0,   // {{ AURA-X: Add - 禁止旋转标签 }}
                                    minRotation: 0    // {{ AURA-X: Add - 保持标签水平 }}
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
                throw new Error(result.message || 'Prediction failed');
            }

        } catch (error) {
            // 显示错误提示
            console.error('Prediction error:', error);
            
            // 使用警告框显示错误
            const errorAlert = document.getElementById('errorAlert');
            const errorMessage = document.getElementById('errorMessage');
            if (errorAlert && errorMessage) {
                errorMessage.textContent = `Prediction failed: ${error.message}`;
                errorAlert.style.display = 'block';
                
                // 滚动到错误消息
                errorAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                // 降级到 alert
                alert('Prediction failed: ' + error.message);
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

// {{ AURA-X: Modify - 更新为英文风险等级和模型名称 }}
// 辅助函数：获取风险等级对应的CSS类
function getRiskLevelClass(riskLevel) {
    switch (riskLevel) {
        case 'High Risk':
            return 'alert-danger';
        case 'Medium Risk':
            return 'alert-warning';
        case 'Low Risk':
            return 'alert-success';
        default:
            return 'alert-info';
    }
}

// 辅助函数：获取护理措施建议
function getNursingInterventions(riskLevel) {
    const interventions = {
        'Low Risk': {
            title: 'Low Risk - Nursing Interventions',
            measures: [
                {
                    title: '1. Assessment Frequency',
                    content: 'Assess pressure injury risk weekly; check skin condition every shift.'
                },
                {
                    title: '2. Nutrition',
                    content: 'Conduct nutritional assessment, develop personalized nutrition care plan, ensure adequate hydration and balanced diet.'
                },
                {
                    title: '3. Skin Care',
                    content: `
                        ① Perform comprehensive skin inspection and assessment on admission, especially at bony prominences, medical device contact sites, and catheter sites.<br>
                        ② Keep skin clean and dry, avoid damp and wrinkled bed linens.
                    `
                },
                {
                    title: '4. Position Changes',
                    content: 'Remind or assist patients to change positions and redistribute pressure.'
                },
                {
                    title: '5. Appropriate Support Surface',
                    content: 'Expand body support surface, avoid overly firm mattress.'
                },
                {
                    title: '6. Health Education',
                    content: `
                        Provide pressure injury prevention education to patients, families, or caregivers. Encourage patient mobility. 
                        Teach patients and families to recognize early signs of pressure injury and report immediately if:<br>
                        ① Skin redness (non-blanching)<br>
                        ② Skin warmth, swelling, or induration<br>
                        ③ Local pain or numbness
                    `
                }
            ]
        },
        'Medium Risk': {
            title: 'Medium Risk - Nursing Interventions',
            measures: [
                {
                    title: '1. Assessment Frequency',
                    content: 'Assess every three days; check skin condition every shift.'
                },
                {
                    title: '2. Nutrition',
                    content: 'Conduct nutritional assessment, develop personalized nutrition care plan, ensure adequate protein and calorie intake.'
                },
                {
                    title: '3. Skin Care',
                    content: `
                        ① Comprehensive skin inspection and assessment on admission, especially at bony prominences and device contact sites.<br>
                        ② Keep skin clean and dry, avoid damp and wrinkled bed linens.<br>
                        ③ Apply preventive dressings (silicone foam, polyurethane foam) to high-pressure areas (heels, ankles, sacrum, greater trochanter).
                    `
                },
                {
                    title: '4. Position Changes',
                    content: `
                        ① Reposition every 2 hours, recommend 30° lateral tilt position (soft pillow behind back, legs bent with pillow between knees), avoid pressure on hips and shoulders. For higher BMI patients, use 40° lateral tilt.<br>
                        ② Prevent dragging, pulling, or tugging when repositioning to avoid friction and shear forces.
                    `
                },
                {
                    title: '5. Appropriate Support Surface',
                    content: 'Avoid overly firm mattress, use air mattress if needed, place triangular support wedge behind back when side-lying.'
                },
                {
                    title: '6. Health Education',
                    content: `
                        ① Train caregivers on proper repositioning techniques and support tool usage, maintaining skin cleanliness, and reporting skin abnormalities.<br>
                        ② Encourage increased nutritional intake and active movement. Teach early signs recognition and report immediately if:<br>
                        ① Skin redness (non-blanching)<br>
                        ② Skin warmth, swelling, or induration<br>
                        ③ Local pain or numbness
                    `
                }
            ]
        },
        'High Risk': {
            title: 'High Risk - Nursing Interventions',
            measures: [
                {
                    title: '1. Assessment Frequency',
                    content: 'Assess pressure injury risk daily; check skin condition every shift.'
                },
                {
                    title: '2. Nutrition',
                    content: `
                        ① Conduct nutritional assessment, develop personalized plan: adults need 1.2-1.5g/kg protein daily, 30-35kcal/kg energy. 
                        Consult nutrition team if needed; consider enteral or parenteral nutrition support.<br>
                        ② Assess daily nutritional intake for severely malnourished patients.
                    `
                },
                {
                    title: '3. Skin Care',
                    content: `
                        ① Comprehensive skin assessment on admission for any signs of injury.<br>
                        ② Keep skin clean and dry, avoid damp clothing and bed linens.<br>
                        ③ For incontinent patients or those using diapers, cleanse skin promptly. Avoid frequent vigorous wiping with dry tissue. Use barrier products or liquid dressings.<br>
                        ④ Apply preventive dressings (silicone foam, polyurethane foam) to high-pressure areas (heels, ankles, sacrum, greater trochanter).
                    `
                },
                {
                    title: '4. Position Changes',
                    content: `
                        ① Reposition every 1-2 hours. Avoid dragging, pulling, or tugging to minimize friction and shear.<br>
                        ② Recommend 30° lateral tilt position; for higher BMI, use 40° lateral tilt.<br>
                        ③ Critically ill, poorly perfused, or malnourished patients need smaller, gradual, more frequent position changes.<br>
                        ④ Elevate head of bed no more than 30° unless medically necessary.
                    `
                },
                {
                    title: '5. Appropriate Support Surface',
                    content: `
                        ① Use air mattress, place triangular support wedge behind back when side-lying.<br>
                        ② Use elevation rings and soft pads around wrists and ankles to avoid joint contact with support surface. Place soft pillow between legs.
                    `
                },
                {
                    title: '6. Health Education',
                    content: `
                        ① Train caregivers on repositioning techniques, proper use of support tools, maintaining skin cleanliness; recognize and report skin abnormalities.<br>
                        ② Encourage increased nutritional intake and movement within capabilities. Teach early signs recognition and report immediately if:<br>
                        ① Skin redness (non-blanching)<br>
                        ② Skin warmth, swelling, or induration<br>
                        ③ Local pain or numbness
                    `
                }
            ]
        }
    };
    
    return interventions[riskLevel] || null;
}

// 辅助函数：获取模型显示名称
function getModelDisplayName(modelName) {
    const displayNames = {
        'xgboost': 'XGBoost Model',
        'random_forest': 'Random Forest Model',
        'logistic_regression': 'Logistic Regression Model',
        'naive_bayes': 'Naive Bayes Model'
    };
    return displayNames[modelName] || modelName;
}

// 辅助函数：验证数值输入
function validateNumericInput(input) {
    const value = parseFloat(input.value);
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    
    if (input.name === 'Age') {
        if (isNaN(value) || value < 0 || value > 120) {
            input.setCustomValidity('Please enter a valid age (0-120 years)');
        } else {
            input.setCustomValidity('');
        }
    } else if (input.name === 'Length of hospitalization') {
        if (isNaN(value) || value < 0) {
            input.setCustomValidity('Please enter a valid length of hospital stay');
        } else {
            input.setCustomValidity('');
        }
    } else if (['White blood cells', 'Serum potassium', 'Albumin'].includes(input.name)) {
        if (isNaN(value) || value < 0) {
            input.setCustomValidity('Please enter a valid verification value');
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

// {{ AURA-X: Modify - 完整的中文到英文特征名称映射，按照用户提供的格式 }}
// 添加特征名称显示转换函数
function getFeatureDisplayName(feature) {
    const displayNames = {
        // 中文特征名映射为英文（完整映射，覆盖所有可能的特征）
        '住院时长': 'Length of hospitalization',
        '吸烟史': 'Smoking history',
        '摩擦力/剪切力': 'Friction or shear',
        '移动能力': 'Mobility',
        '感知觉': 'Sensation',
        '身体活动度': 'Physical activity',
        '日常食物获取量': 'Daily food intake',
        '水肿': 'Edema',
        '皮肤潮湿': 'Moist skin',
        '意识障碍': 'Consciousness',
        '白细胞': 'White blood cells',
        '血钾': 'Serum potassium',
        '白蛋白': 'Albumin',
        '高血压': 'Hypertension',
        '糖尿病': 'Diabetes mellitus',
        '冠心病': 'Coronary heart disease',
        '下肢深静脉血栓': 'Deep vein thrombosis',
        // 英文特征名（保持一致性）
        'Length of hospitalization': 'Length of hospitalization',
        'Smoking history': 'Smoking history',
        'Friction or shear': 'Friction or shear',
        'Mobility': 'Mobility',
        'Sensation': 'Sensation',
        'Physical activity': 'Physical activity',
        'Daily food intake': 'Daily food intake',
        'Edema': 'Edema',
        'Moist skin': 'Moist skin',
        'Consciousness': 'Consciousness',
        'White blood cells': 'White blood cells',
        'Serum potassium': 'Serum potassium',
        'Albumin': 'Albumin',
        'Hypertension': 'Hypertension',
        'Diabetes mellitus': 'Diabetes mellitus',
        'Coronary heart disease': 'Coronary heart disease',
        'Deep vein thrombosis': 'Deep vein thrombosis'
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