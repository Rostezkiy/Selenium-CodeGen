from pydantic import BaseModel, Field
from typing import List, Any, Dict


# Схема для получения "сырых" шагов от расширения
class Step(BaseModel):
    id: float
    type: str
    subType: str | None = None
    data: Dict[str, Any]
    locators: List[str]
    allureStep: str
    # Добавьте другие поля шага, если они нужны для генерации


class GenerationRequest(BaseModel):
    steps: List[Step]
    pageClassName: str
    options: Dict[str, bool] = Field(default_factory=dict)  # e.g., {"generatePom": true}


# Схема для ответа с кодом
class GenerationResponse(BaseModel):
    code: str


class TestCaseData(BaseModel):
    """Схема для данных одного тест-кейса."""
    name: str
    recordedSteps: List[Dict[str, Any]] # Используем Dict, т.к. структура шага сложная
    pageClassName: str
    # Добавьте другие поля, если они понадобятся, например, переменные

class GenerationRequest(BaseModel):
    """Основная схема запроса на генерацию."""
    activeTestCase: TestCaseData
    allTestCasesForPage: List[TestCaseData]
    stateData: Dict[str, Any] # Для переменных окружения, имени коллекции и т.д.
    options: Dict[str, bool] = Field(default_factory=dict)