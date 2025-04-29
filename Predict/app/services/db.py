import os
import logging
import configparser
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from Predict.app.models import Base
import json

# 创建日志记录器
logger = logging.getLogger("db")

# 读取配置文件
config = configparser.ConfigParser()
config_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'appDatas', 'config.ini')

# 默认数据库配置
DB_USER = "dvlp"
DB_PASSWORD = "passwd"
DB_HOST = "localhost"
DB_PORT = "3306"
DB_NAME = "mission1_db"

# 如果存在配置文件，则从文件中读取数据库配置
if os.path.exists(config_file):
    config.read(config_file)
    if 'database' in config:
        DB_USER = config['database'].get('DB_USER', DB_USER)
        DB_PASSWORD = config['database'].get('DB_PASSWORD', DB_PASSWORD)
        DB_HOST = config['database'].get('DB_HOST', DB_HOST)
        DB_PORT = config['database'].get('DB_PORT', DB_PORT)
        DB_NAME = config['database'].get('DB_NAME', DB_NAME)

# 构建数据库URL
DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# 创建数据库引擎
try:
    engine = create_engine(DATABASE_URL)
    logger.info("数据库连接成功")
except Exception as e:
    logger.error(f"数据库连接错误: {e}")
    raise

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 获取数据库会话的依赖项
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 创建所有表
def create_tables():
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("数据库表创建成功")
    except Exception as e:
        logger.error(f"创建数据库表时出错: {e}")
        raise

# 添加预测历史相关的函数
async def create_prediction_history_table():
    """创建预测历史表"""
    db = SessionLocal()
    try:
        create_table_sql = text("""
            CREATE TABLE IF NOT EXISTS prediction_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(50),
                username VARCHAR(100),
                prediction_type VARCHAR(20) COMMENT '预测类型：single或batch',
                batch_id VARCHAR(50) NULL COMMENT '批量预测ID，仅批量预测时有值',
                input_data JSON COMMENT '输入数据',
                prediction_result JSON COMMENT '预测结果',
                risk_level VARCHAR(20) COMMENT '风险等级',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.execute(create_table_sql)
        db.commit()
    except Exception as e:
        logger.error(f"创建预测历史表时出错: {e}")
        db.rollback()
        raise
    finally:
        db.close()

async def save_prediction_history(user_id, username, prediction_type, input_data, prediction_result, risk_level, batch_id=None):
    """保存预测历史记录"""
    db = SessionLocal()
    try:
        insert_sql = text("""
            INSERT INTO prediction_history 
            (user_id, username, prediction_type, batch_id, input_data, prediction_result, risk_level) 
            VALUES (:user_id, :username, :prediction_type, :batch_id, :input_data, :prediction_result, :risk_level)
        """)
        params = {
            "user_id": user_id,
            "username": username,
            "prediction_type": prediction_type,
            "batch_id": batch_id,
            "input_data": json.dumps(input_data),
            "prediction_result": json.dumps(prediction_result),
            "risk_level": risk_level
        }
        result = db.execute(insert_sql, params)
        db.commit()
        return result.lastrowid
    except Exception as e:
        logger.error(f"保存预测历史记录时出错: {e}")
        db.rollback()
        raise
    finally:
        db.close()

async def get_prediction_history(user_id=None, limit=10):
    """获取预测历史记录"""
    db = SessionLocal()
    try:
        if user_id:
            select_sql = text("""
                SELECT * FROM prediction_history 
                WHERE user_id = :user_id 
                ORDER BY created_at DESC 
                LIMIT :limit
            """)
            results = db.execute(select_sql, {"user_id": user_id, "limit": limit}).fetchall()
        else:
            select_sql = text("""
                SELECT * FROM prediction_history 
                ORDER BY created_at DESC 
                LIMIT :limit
            """)
            results = db.execute(select_sql, {"limit": limit}).fetchall()
        return results
    except Exception as e:
        logger.error(f"获取预测历史记录时出错: {e}")
        raise
    finally:
        db.close()

async def get_prediction_trend(days=7):
    """获取过去几天的预测趋势数据"""
    db = SessionLocal()
    try:
        trend_sql = text("""
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as count,
                prediction_type
            FROM 
                prediction_history
            WHERE 
                created_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
            GROUP BY 
                DATE(created_at),
                prediction_type
            ORDER BY 
                date ASC
        """)
        results = db.execute(trend_sql, {"days": days}).fetchall()
        return results
    except Exception as e:
        logger.error(f"获取预测趋势数据时出错: {e}")
        raise
    finally:
        db.close()

async def get_prediction_count():
    """获取预测总次数"""
    db = SessionLocal()
    try:
        count_sql = text("SELECT COUNT(*) as count FROM prediction_history")
        result = db.execute(count_sql).fetchone()
        return result[0] if result else 0
    except Exception as e:
        logger.error(f"获取预测总次数时出错: {e}")
        raise
    finally:
        db.close() 