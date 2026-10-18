import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import professors, publications, workloads, auth

# 1. สร้าง Instance ของ FastAPI พร้อมกำหนด Metadata
app = FastAPI(
    title="Faculty Workload Management System API",
    description="API สำหรับระบบบริหารจัดการภาระงานอาจารย์ และรวบรวมผลงานวิชาการ (FRWS)",
    version="1.0.0",
    docs_url="/docs",      # Swagger UI URL
    redoc_url="/redoc"     # ReDoc URL
)

# 2. ตั้งค่า CORS Middleware อนุญาตให้ Frontend (HTML/JS/React) เรียกใช้ API ได้
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Root / Health Check Endpoint (สำหรับเช็กว่า API ทำงานปกติหรือไม่)
@app.get("/", tags=["Health Check"])
def root_check():
    return {
        "status": "online",
        "system": "Faculty Workload Management API",
        "version": "1.0.0",
        "documentation": "/docs"
    }

# 4. รวม Routers แต่ละโมดูลเข้ามาในแอปพลิเคชันหลัก    
app.include_router(professors.router, prefix="/api")
app.include_router(publications.router, prefix="/api")
app.include_router(workloads.router, prefix="/api")
app.include_router(auth.router, prefix="/api")



# 5. บล็อกสำหรับสั่งรันเซิร์ฟเวอร์โดยตรงด้วย python app/main.py
if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True  # Auto-reload เมื่อมีการแก้ไขไฟล์โค้ด
    )