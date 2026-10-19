import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from psycopg2.extras import RealDictCursor

from app.core.database import get_db
from app.core.config import settings

router = APIRouter()

SECRET_KEY = getattr(settings, "SECRET_KEY", "your_super_secret_jwt_key_change_in_production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    try:
        # ตัดช่องว่างส่วนเกินของรหัสผ่านและค่า Hash จาก DB
        clean_password = plain_password.strip().encode('utf-8')[:72]
        clean_hash = hashed_password.strip().encode('utf-8')
        return bcrypt.checkpw(clean_password, clean_hash)
    except Exception as e:
        print(f"Password verify error: {e}")
        return False

def get_password_hash(password: str) -> str:
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        email: str = payload.get("email")
        role: str = payload.get("role")
        
        if user_id is None or email is None:
            raise credentials_exception
            
        return {
            "id": user_id,
            "email": email,
            "role": role or "professor"
        }
    except jwt.PyJWTError:
        raise credentials_exception

# เพิ่มฟังก์ชันนี้ต่อจาก get_current_user ในไฟล์ backend/app/routers/auth.py

def require_roles(allowed_roles: List[str]):
    """
    ตัวตรวจสอบระดับสิทธิ์ (Role Checker Guard)
    """
    def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้"
            )
        return current_user
    return role_checker

@router.post("/login", response_model=TokenResponse, summary="เข้าสู่ระบบสำหรับอาจารย์และเจ้าหน้าที่")
def login(payload: LoginRequest, conn = Depends(get_db)):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        clean_email = payload.email.strip().lower()

        # ค้นหาอาจารย์ตาม Email
        query = """
            SELECT id, email, password_hash, role, title, first_name_th, last_name_th, department
            FROM professors
            WHERE LOWER(TRIM(email)) = %s;
        """
        cursor.execute(query, (clean_email,))
        user = cursor.fetchone()

        # 🔍 1. เช็กว่าเจอ User ใน Database หรือไม่
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"ไม่พบอีเมล '{clean_email}' ในระบบ"
            )

        # 🔍 2. เช็กว่าคอลัมน์ password_hash มีค่าหรือไม่
        if not user["password_hash"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="บัญชีนี้ยังไม่มีการตั้งรหัสผ่าน (password_hash เป็น NULL)"
            )

        # 🔍 3. เช็กความถูกต้องของรหัสผ่าน
        if not verify_password(payload.password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="รหัสผ่านไม่ถูกต้อง"
            )

        # สร้าง JWT Token
        token_data = {
            "sub": str(user["id"]),
            "email": user["email"],
            "role": user["role"]
        }
        access_token = create_access_token(data=token_data)
        full_name = f"{user['title'] or ''}{user['first_name_th'] or ''} {user['last_name_th'] or ''}".strip()

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": str(user["id"]),
                "email": user["email"],
                "name": full_name or user["email"],
                "role": user["role"],
                "department": user["department"]
            }
        }
    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
    finally:
        cursor.close()
