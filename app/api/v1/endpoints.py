import bcrypt
from fastapi import APIRouter, Depends, HTTPException

from ... import schemas, models, dependencies
from ...code_generator import generate_full_code_on_server  # Наша будущая логика
from ...models import User, License

router = APIRouter()


@router.post("/generate", response_model=schemas.GenerationResponse)
async def generate_test_code(
        request: schemas.GenerationRequest,
        license: models.License = Depends(dependencies.get_valid_license)
):
    try:
        # Конвертируем Pydantic модели в обычные словари Python
        active_test_case_dict = request.activeTestCase.model_dump()
        all_test_cases_dicts = [tc.model_dump() for tc in request.allTestCasesForPage]

        generated_code = await generate_full_code_on_server(
            active_test_case=active_test_case_dict,  # <-- Передается словарь
            all_test_cases_for_page=all_test_cases_dicts,  # <-- Передается список словарей
            state_data=request.stateData,  # Это уже словарь, менять не нужно
            options=request.options  # Это тоже словарь
        )
        return {"code": generated_code}
    except Exception as e:
        import traceback
        print("Code generation failed:", e)
        traceback.print_exc()  # Добавляем для более детальной отладки
        raise HTTPException(status_code=500, detail="Failed to generate code on the server.")


@router.get("/validate")
async def validate_license(
        license: models.License = Depends(dependencies.get_valid_license)
):
    """
    Эндпоинт для проверки ключа из расширения.
    """
    return {"status": "valid", "expires_at": license.expires_at}


# --- ЗАГЛУШКИ ДЛЯ УПРАВЛЕНИЯ ПОДПИСКОЙ ---
# В реальном приложении здесь будет логика регистрации, оплаты через Stripe/Paddle и т.д.

@router.post("/dev/create-user-and-license")
async def create_user_and_license(email: str, db=Depends(dependencies.get_db)):
    # pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto") # --- УДАЛЕНО ---

    # Прямое использование bcrypt. Пароль должен быть в байтах (b"...")
    # gensalt() генерирует "соль" для безопасности
    hashed_password = bcrypt.hashpw(b"somepassword", bcrypt.gensalt())

    # Сохраняем хеш как строку в базу данных
    db_user = User(email=email, hashed_password=hashed_password.decode('utf-8'))
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    db_license = License(user_id=db_user.id)
    db.add(db_license)
    db.commit()
    db.refresh(db_license)

    return {"email": db_user.email, "license_key": db_license.key, "expires_at": db_license.expires_at}
