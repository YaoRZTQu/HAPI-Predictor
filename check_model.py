import joblib
import numpy as np
import pandas as pd

# 加载朴素贝叶斯模型
print("尝试加载朴素贝叶斯模型...")
model = joblib.load('Predict/app/models/hapi_predictor/Naive Bayes_model.pkl')
print(f"模型类型: {type(model)}")
print(f"模型详情: {model}")

# 检查模型的特征名称（如果有）
print("\n检查模型特征名称:")
feature_names = []
if hasattr(model, 'feature_names_in_'):
    feature_names = model.feature_names_in_
    print(f"模型特征名称: {feature_names}")
else:
    print("模型没有feature_names_in_属性")

# 创建一个测试数据（使用模型的特征名称，如果有）
print("\n创建测试数据...")
if len(feature_names) > 0:
    # 使用模型训练时的特征名称创建测试数据
    test_data = pd.DataFrame({
        name: [np.random.rand() for _ in range(3)] for name in feature_names
    })
    print(f"使用模型的特征名称创建测试数据: {test_data.columns.tolist()}")
else:
    # 使用一些通用特征名称
    print("使用默认特征名称")
    # 创建几组测试数据，使用不同的特征名称格式
    test_cases = [
        # 测试1：使用原始特征名
        {
            '住院第几天': [3, 7, 14],
            '白细胞计数': [8.5, 6.2, 10.3],
            '血钾浓度': [4.2, 3.8, 5.1],
            '白蛋白计数': [38, 42, 35],
            '吸烟史': [0, 1, 0],
            '摩擦力/剪切力': [1, 2, 3],
            '移动能力': [2, 1, 3],
            '感知觉': [1, 2, 3],
            '身体活动度': [2, 3, 4],
            '日常食物获取': [1, 2, 3],
            '水肿': [0, 1, 0],
            '皮肤潮湿': [1, 2, 3],
            '意识障碍': [0, 0, 1],
            '高血压': [1, 0, 1],
            '糖尿病': [0, 0, 1],
            '冠心病': [0, 0, 1],
            '下肢深静脉血栓': [0, 0, 0]
        },
        # 测试2：使用简化后的特征名
        {
            '住院天数': [3, 7, 14],
            '白细胞': [8.5, 6.2, 10.3],
            '血钾': [4.2, 3.8, 5.1],
            '白蛋白': [38, 42, 35],
            '吸烟': [0, 1, 0],
            '摩擦力': [1, 2, 3],
            '移动': [2, 1, 3],
            '感知': [1, 2, 3],
            '活动': [2, 3, 4],
            '饮食': [1, 2, 3],
            '水肿': [0, 1, 0],
            '皮肤': [1, 2, 3],
            '意识': [0, 0, 1],
            '高血压': [1, 0, 1],
            '糖尿病': [0, 0, 1],
            '冠心病': [0, 0, 1],
            '血栓': [0, 0, 0]
        },
        # 测试3：使用数字顺序的特征名
        {f'feature_{i}': [np.random.rand() for _ in range(3)] for i in range(17)}
    ]
    
    # 测试每组数据
    for i, test_dict in enumerate(test_cases):
        print(f"\n测试数据集 {i+1}:")
        test_data = pd.DataFrame(test_dict)
        print(f"特征名称: {test_data.columns.tolist()}")
        
        try:
            # 输出预测概率
            print("预测概率:")
            if hasattr(model, 'predict_proba'):
                probas = model.predict_proba(test_data)
                for j, proba in enumerate(probas):
                    # 检查结果是否都是100%
                    if proba[1] == 1.0:
                        print(f"警告: 样本 {j+1} 的正类概率为100%")
                    print(f"样本 {j+1}: 类别0概率={proba[0]:.4f}, 类别1概率={proba[1]:.4f}")
            else:
                print("模型没有predict_proba方法")
                
            # 输出预测结果
            print("预测结果:")
            if hasattr(model, 'predict'):
                preds = model.predict(test_data)
                for j, pred in enumerate(preds):
                    print(f"样本 {j+1}: 预测={pred}")
            else:
                print("模型没有predict方法")
        except Exception as e:
            print(f"测试数据集 {i+1} 失败: {str(e)}")
            continue

# 查看模型的属性和方法
print("\n模型的主要属性:")
for attr in dir(model):
    if not attr.startswith('_') and not callable(getattr(model, attr)):
        try:
            value = getattr(model, attr)
            if attr in ['classes_', 'class_count_', 'class_prior_']:
                print(f"{attr}: {value}")
            elif attr in ['theta_', 'sigma_', 'feature_names_in_']:
                if hasattr(value, 'shape'):
                    print(f"{attr}: 形状={value.shape}")
                else:
                    print(f"{attr}: {value}")
            else:
                print(f"{attr}")
        except:
            print(f"{attr}: 无法打印")

# 另一种测试方法：使用随机数据
print("\n使用随机数据测试:")
# 创建一个全为0和1的数据
zero_data = pd.DataFrame(np.zeros((1, 17)))
one_data = pd.DataFrame(np.ones((1, 17)))

if hasattr(model, 'predict_proba'):
    try:
        zero_proba = model.predict_proba(zero_data)
        print(f"全0数据预测概率: 类别0={zero_proba[0][0]:.4f}, 类别1={zero_proba[0][1]:.4f}")
        
        one_proba = model.predict_proba(one_data)
        print(f"全1数据预测概率: 类别0={one_proba[0][0]:.4f}, 类别1={one_proba[0][1]:.4f}")
    except Exception as e:
        print(f"随机数据测试失败: {str(e)}")
else:
    print("模型没有predict_proba方法") 