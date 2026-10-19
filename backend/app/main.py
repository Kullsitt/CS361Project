import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles  # <-- เพิ่มการ import StaticFiles

from app.core.config import settings
from app.routers import professors, publications, workloads, auth

app = FastAPI(
    title="Faculty Workload Management System API",
    description="API สำหรับระบบบริหารจัดการภาระงานอาจารย์ และรวบรวมผลงานวิชาการ (FRWS)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# รวม API Routers
app.include_router(professors.router, prefix="/api")
app.include_router(publications.router, prefix="/api")
app.include_router(workloads.router, prefix="/api")
app.include_router(auth.router, prefix="/api")

@app.get("/api/health", tags=["Health Check"])
def root_check():
    return {
        "status": "online",
        "system": "Faculty Workload Management API",
        "version": "1.0.0",
        "documentation": "/docs"
    }

# app.mount("/", StaticFiles(directory="public", html=True), name="public")

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )