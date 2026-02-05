# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware  # <-- 1. ИМПОРТИРУЙТЕ ЭТО
from .database import engine, Base
from .api.v1 import endpoints

# Создаем таблицы в БД при первом запуске
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Selenium CodeGen API")

# --- 2. ДОБАВЬТЕ ЭТОТ БЛОК ДЛЯ НАСТРОЙКИ CORS ---
origins = [
    # В идеале здесь должен быть ID вашего расширения для безопасности,
    # но для локальной разработки "*" - самый простой и надежный вариант.
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Разрешает все методы (GET, POST, etc.)
    allow_headers=["*"],  # Разрешает все заголовки
)
# --- КОНЕЦ БЛОКА CORS ---

app.include_router(endpoints.router, prefix="/api/v1", tags=["v1"])

@app.get("/")
def read_root():
    return {"message": "Welcome to Selenium CodeGen API"}