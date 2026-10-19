import os
from pathlib import Path
from dotenv import load_dotenv

# โหลดไฟล์ .env จากไดเรกทอรี backend/
load_dotenv(Path(__file__).resolve().parents[2] / '.env')

class Settings:
    # Database Settings (AWS RDS PostgreSQL)
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: str = os.getenv("DB_PORT", "5432")
    DB_NAME: str = os.getenv("DB_NAME", "cs361_db")
    DB_USER: str = os.getenv("DB_USER", "postgres")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")

    # OpenAlex API Settings
    OPENALEX_MAILTO: str = os.getenv("OPENALEX_MAILTO", "admin@tu.ac.th")

    # Security & Auth Settings (สำหรับระบบ Login ในอนาคต)
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your_super_secret_key_change_in_production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 วัน

    # CORS Settings
    CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "*"  # สามารถปรับให้เฉพาะเจาะจงเมื่อขึ้น Production
    ]

# สร้าง Object instance ไว้เรียกใช้งานข้ามโมดูล
settings = Settings()
