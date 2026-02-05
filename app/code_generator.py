# app/code_generator.py

import re
from typing import List, Dict, Any, Union

# Константа, перенесенная из base_page.js
BASE_PAGE_PYTHON_CODE = """
# =================================================================================
# BasePage
# =================================================================================
import allure
import logging
from allure_commons.types import AttachmentType
from selenium.common.exceptions import (
    NoSuchElementException,
    TimeoutException,
    StaleElementReferenceException,
    ElementNotInteractableException
)
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.common.action_chains import ActionChains

# Рекомендуется вынести в отдельный файл или настроить в conftest.py
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


class BasePage:
    def __init__(self, driver, timeout=10):
        self.driver = driver
        self.timeout = timeout

    def find_element_with_healing(self, locators: list, timeout: int = None) -> WebElement:
        \"\"\"
        Ищет элемент по списку локаторов. Если по одному не нашел, пробует следующий.
        \"\"\"
        if timeout is None:
            timeout = self.timeout
        last_exception = None
        for locator in locators:
            try:
                # Ожидаем просто присутствия элемента, чтобы можно было с ним работать
                return WebDriverWait(self.driver, timeout).until(EC.presence_of_element_located(locator))
            except TimeoutException as e:
                last_exception = e
                continue
        # Если ни один локатор не сработал, вызываем ошибку
        raise NoSuchElementException(f"Элемент не найден ни по одному из локаторов: {locators}. Последняя ошибка: {last_exception}")

    def take_screenshot(self, name: str):
        \"\"\"Делает скриншот и прикрепляет к Allure отчету.\"\"\"
        safe_name = "".join(x if x.isalnum() else "_" for x in name)
        allure.attach(self.driver.get_screenshot_as_png(), name=safe_name, attachment_type=AttachmentType.PNG)

    # --- НОВЫЙ ВСПОМОГАТЕЛЬНЫЙ МЕТОД ---
    def scroll_into_view(self, element: WebElement):
        \"\"\"
        Плавно прокручивает страницу, чтобы элемент оказался в центре видимой области.
        Это значительно повышает стабильность кликов и других взаимодействий.
        \"\"\"
        try:
            # JavaScript-команда для скролла. 'block: "center"' гарантирует,
            # что элемент будет по центру, что помогает избежать перекрытия плавающими хедерами/футерами.
            self.driver.execute_script("arguments[0].scrollIntoView({block: 'center', inline: 'nearest'});", element)
            # Небольшая пауза, чтобы скролл успел завершиться.
            WebDriverWait(self.driver, 2).until(lambda d: self.driver.execute_script('return document.readyState') == 'complete')
        except Exception as e:
            logging.warning(f"Не удалось выполнить скролл к элементу: {e}")


    # =================================================================================
    # НАДЕЖНЫЕ ДЕЙСТВИЯ - Эти методы вызываются из сгенерированного PageObject
    # =================================================================================

    def _execute_action_with_healing(self, action, locators, retries=3, **kwargs):
        \"\"\"
        Внутренний "движок" для выполнения любого действия с элементом.
        Перехватывает StaleElementReferenceException и повторяет поиск элемента.
        --- ИЗМЕНЕНИЕ: Добавлен автоматический скролл ---
        \"\"\"
        last_exception = None
        for i in range(retries):
            try:
                element = self.find_element_with_healing(locators)
                # --- ДОБАВЛЕНО: Скроллим к элементу перед действием ---
                self.scroll_into_view(element)
                # Выполняем переданное действие (lambda-функцию)
                return action(element, **kwargs)
            except (StaleElementReferenceException, ElementNotInteractableException) as e:
                logging.warning(f"Попытка {i + 1}/{retries} не удалась: {e.__class__.__name__}. Повторяем...")
                last_exception = e
                if i == retries - 1:
                    self.take_screenshot(f"action_failed_on_{locators[0]}")
                    raise last_exception

    def do_click_with_healing(self, locators: list):
        \"\"\"
        САМЫЙ НАДЕЖНЫЙ МЕТОД КЛИКА С АВТОСКРОЛЛОМ.
        Использует ActionChains для максимально точной имитации клика пользователя.
        \"\"\"
        element = self.find_element_with_healing(locators)
        self.scroll_into_view(element) # Сначала скроллим к элементу

        try:
            # 1. ОСНОВНАЯ ПОПЫТКА: Клик через ActionChains. Это самый надежный способ.
            logging.info(f"Выполняем клик через ActionChains по локатору: {locators[0]}")
            # Ждем, пока элемент станет кликабельным, перед действием
            WebDriverWait(self.driver, self.timeout).until(EC.element_to_be_clickable(element))
            ActionChains(self.driver).move_to_element(element).click().perform()

        except (TimeoutException, ElementNotInteractableException) as e:
            logging.warning(f"Клик через ActionChains не удался: {e.__class__.__name__}. Пробуем клик через JS как последний вариант.")
            try:
                # 2. ЗАПАСНОЙ ВАРИАНТ: Клик через JavaScript.
                self.driver.execute_script("arguments[0].click();", element)
            except Exception as js_e:
                self.take_screenshot(f"js_click_failed_on_{locators[0]}")
                logging.error(f"Клик через JS также не удался: {js_e}")
                # Перевыбрасываем исходную, более информативную ошибку
                raise e

    def do_right_click_with_healing(self, locators: list):
        \"\"\"Кликает правой кнопкой мыши.\"\"\"
        def right_click_action(element):
            ActionChains(self.driver).context_click(element).perform()
        self._execute_action_with_healing(right_click_action, locators)

    def do_double_click_with_healing(self, locators: list):
        \"\"\"Делает двойной клик.\"\"\"
        def double_click_action(element):
            ActionChains(self.driver).double_click(element).perform()
        self._execute_action_with_healing(double_click_action, locators)

    def do_hover_with_healing(self, locators: list):
        \"\"\"Наводит курсор на элемент.\"\"\"
        def hover_action(element):
            ActionChains(self.driver).move_to_element(element).perform()
        self._execute_action_with_healing(hover_action, locators)

    def do_clear_and_send_keys_with_healing(self, locators: list, value: str):
        \"\"\"Очищает поле и вводит текст.\"\"\"
        def clear_and_send_action(element):
            element.clear()
            element.send_keys(value)
        self._execute_action_with_healing(clear_and_send_action, locators)

    def select_option_by_visible_text(self, locators: list, text: str):
        \"\"\"Выбирает опцию из КЛАССИЧЕСКОГО <select> списка.\"\"\"
        def select_action(element):
            Select(element).select_by_visible_text(text)
        self._execute_action_with_healing(select_action, locators)

    def select_from_custom_dropdown(self, trigger_locators: list, option_text: str):
        \"\"\"
        Универсальный метод для работы с кастомными выпадающими списками (React, etc.).
        \"\"\"
        logging.info(f"Кликаем по триггеру выпадающего списка: {trigger_locators[0]}")
        self.do_click_with_healing(trigger_locators)

        option_locator = (By.XPATH, f"//*[text()='{option_text}']")

        try:
            logging.info(f"Ожидаем появления опции с текстом '{option_text}'")
            wait = WebDriverWait(self.driver, self.timeout)
            option_element = wait.until(EC.element_to_be_clickable(option_locator))

            logging.info(f"Кликаем по опции '{option_text}'")
            # --- ИЗМЕНЕНИЕ: Используем JS-клик для надежности ---
            self.driver.execute_script("arguments[0].click();", option_element)

        except TimeoutException:
            self.take_screenshot(f"option_not_found_{option_text}")
            error_message = f"Опция с текстом '{option_text}' не найдена или не стала кликабельной за {self.timeout} сек."
            logging.error(error_message)
            raise NoSuchElementException(error_message)

    # =================================================================================
    # МЕТОДЫ ПРОВЕРОК (Asserts) И ОЖИДАНИЙ (Waits)
    # =================================================================================

    def get_text_with_healing(self, locators: list) -> str:
        # Для получения текста скролл также важен
        return self._execute_action_with_healing(lambda el: el.text, locators)

    def get_attribute_with_healing(self, locators: list, attribute: str) -> str:
        # И для атрибутов
        return self._execute_action_with_healing(lambda el: el.get_attribute(attribute), locators)

    def is_visible_with_healing(self, locators: list, timeout: int = 5) -> bool:
        \"\"\"
        Проверяет видимость элемента. 
        --- ИЗМЕНЕНИЕ: Не скроллит, так как сама проверка подразумевает поиск в видимой области. ---
        \"\"\"
        try:
            WebDriverWait(self.driver, timeout).until(EC.visibility_of_element_located(locators[0]))
            return True
        except TimeoutException:
            return False

    def is_not_visible_with_healing(self, locators: list, timeout: int = 5) -> bool:
        try:
            WebDriverWait(self.driver, timeout).until(EC.invisibility_of_element_located(locators[0]))
            return True
        except TimeoutException:
            return False

    def is_clickable_with_healing(self, locators: list, timeout: int = 5) -> bool:
        \"\"\"
        Проверяет кликабельность.
        --- ИЗМЕНЕНИЕ: Перед проверкой скроллит к элементу. ---
        \"\"\"
        try:
            element = self.find_element_with_healing(locators, timeout)
            self.scroll_into_view(element) # Сначала скроллим
            WebDriverWait(self.driver, timeout).until(EC.element_to_be_clickable(locators[0])) # Потом проверяем
            return True
        except (TimeoutException, NoSuchElementException):
            return False

    def is_enabled_with_healing(self, locators: list) -> bool:
        return self._execute_action_with_healing(lambda el: el.is_enabled(), locators)

    # =================================================================================
    # МЕТОДЫ ДЛЯ РАБОТЫ С ФРЕЙМАМИ
    # =================================================================================

    def switch_to_iframe(self, locators: list):
        \"\"\"Переключается в iframe.\"\"\"
        iframe = self.find_element_with_healing(locators)
        # --- ДОБАВЛЕНО: Скроллим к фрейму перед переключением ---
        self.scroll_into_view(iframe)
        self.driver.switch_to.frame(iframe)

    def switch_to_default_content(self):
        \"\"\"Возвращается из iframe в основной контекст страницы.\"\"\"
        self.driver.switch_to.default_content()
"""


# --- Вспомогательные функции, портированные из JS ---

def _generate_element_name(data: Dict[str, Any]) -> str:
    """Генерирует имя переменной для элемента на основе его данных."""
    if not data:
        return "element"
    s = data.get("selectors", {})
    if not s:
        return "page_context"

    attributes = data.get("attributes", {})
    name_source = (
            attributes.get("data-testid")
            or s.get("id")
            or s.get("name")
            or s.get("placeholder")
            or data.get("text")
            or data.get("tag")
            or "element"
    )
    # Очистка имени
    clean_name = re.sub(r"[^a-zA-Z0-9\s]", "", str(name_source))
    snake_case_name = re.sub(r"\s+", "_", clean_name).lower()
    return snake_case_name[:40] if snake_case_name else "element"


def _sanitize_for_function_name(name: str) -> str:
    """Очищает имя тест-кейса для использования в качестве имени функции Python."""
    if not name:
        return "test_unnamed_scenario"

    sanitized = name.strip().lower()
    sanitized = re.sub(r"\s+|_", "_", sanitized)
    sanitized = re.sub(r"[^a-z0-9_]", "", sanitized)
    return f"test_{sanitized}"


# --- Основная функция генерации ---

async def generate_full_code_on_server(
        active_test_case: Dict,
        all_test_cases_for_page: List[Dict],
        state_data: Dict,
        options: Dict
) -> str:
    """
    Собирает финальный Python код на основе данных, полученных от расширения.
    """
    if not active_test_case:
        return "# Ошибка: Нет активного тест-кейса для генерации кода."

    code_parts = []
    locators_map = {}
    pom_methods = []

    def process_steps_for_pom(steps: List[Dict]):
        """Рекурсивно обходит дерево шагов для сбора локаторов и методов POM."""
        if not steps:
            return
        for step in steps:
            step_type = step.get("type")
            if step_type == "conditional":
                process_steps_for_pom([step.get("condition")])
                process_steps_for_pom(step.get("then_steps"))
                process_steps_for_pom(step.get("else_steps"))
            else:
                element_name = _generate_element_name(step.get("data"))
                if element_name and element_name not in locators_map and step.get("locators"):
                    locators_str = ",\n        ".join(step["locators"])
                    locators_map[element_name] = f"    {element_name}_locators = [\n        {locators_str}\n    ]"

                method_def = step.get("code", {}).get("methodDefinition")
                if method_def:
                    pom_methods.append(method_def)

    # --- Сборка POM ---
    if options.get("generatePom"):
        for test_case in all_test_cases_for_page:
            process_steps_for_pom(test_case.get("recordedSteps", []))
    else:
        # Если POM не нужен, все равно обработаем шаги для получения вызовов в тесте
        process_steps_for_pom(active_test_case.get("recordedSteps", []))

    if options.get("generatePom"):
        page_class_name = active_test_case.get("pageClassName", "MyPage")
        imports = "import allure\nfrom selenium.webdriver.common.by import By\n\nfrom pages.base_page import BasePage\n\n"
        class_header = f"class {page_class_name}(BasePage):\n"
        locator_definitions = "\n\n".join(locators_map.values())

        # Убираем дубликаты методов, сохраняя порядок
        unique_pom_methods = list(dict.fromkeys(pom_methods))

        pom_code = f"{imports}{class_header}{locator_definitions}\n\n" + "\n\n".join(unique_pom_methods)
        if not unique_pom_methods:
            pom_code += "    pass"

        code_parts.append(pom_code)

    # --- Сборка Теста ---
    if options.get("generateTest") and active_test_case.get("recordedSteps"):
        collection_name = state_data.get("collections", {}).get(state_data.get("activeCollectionId"), {}).get("name",
                                                                                                              "Default Feature")
        test_case_name = active_test_case.get("name", "Unnamed Test")
        function_name = _sanitize_for_function_name(test_case_name)

        allure_decorators = f'@allure.feature("{collection_name}")\n@allure.title("{test_case_name}")'
        test_header = f'# --- Тест для сценария: "{test_case_name}" ---\n{allure_decorators}\ndef {function_name}(driver):\n'

        page_instance = f'    page = {active_test_case.get("pageClassName", "MyPage")}(driver)\n'

        # Переменные окружения и DDT
        variable_definitions = []
        active_env_name = state_data.get("activeEnvironment", "dev")
        active_env_vars = state_data.get("environments", {}).get(active_env_name, {})

        if active_env_vars:
            variable_definitions.append(f'    # Переменные для окружения: {active_env_name}')
            for key, value in active_env_vars.items():
                variable_definitions.append(f'    {key} = "{value}"')

        ddt_variables = {}
        for step in active_test_case.get("recordedSteps", []):
            if step.get("variableName") and step.get("type") != "getText" and not step.get("variableForValue"):
                value = step.get("data", {}).get("value", step.get("expectedText", ""))
                ddt_variables[step["variableName"]] = value

        if ddt_variables:
            variable_definitions.append('    # Переменные для DDT')
            for key, value in ddt_variables.items():
                variable_definitions.append(f'    {key} = "{value}"')

        variable_section = "\n".join(variable_definitions) + "\n" if variable_definitions else ""

        def generate_method_calls(steps: List[Dict], indent_level: int) -> List[str]:
            """Рекурсивно генерирует вызовы методов для тела теста."""
            calls = []
            indent = "    " * indent_level
            for step in steps:
                if step.get("type") == "conditional":
                    condition = step.get("condition", {})
                    boolean_check = condition.get("booleanCheck")
                    if boolean_check:
                        method = boolean_check['methodName']
                        locators = boolean_check['locatorVarName']
                        calls.append(f"{indent}if page.{method}(page.{locators}):")
                        calls.extend(generate_method_calls(step.get("then_steps", []), indent_level + 1))

                        else_steps = step.get("else_steps", [])
                        if else_steps:
                            calls.append(f"{indent}else:")
                            calls.extend(generate_method_calls(else_steps, indent_level + 1))
                else:
                    method_call = step.get("code", {}).get("methodCall")
                    if method_call:
                        calls.append(f'{indent}{method_call}')
            return calls

        method_calls_str = "\n".join(generate_method_calls(active_test_case.get("recordedSteps", []), 1))
        test_code = f"{test_header}{page_instance}\n{variable_section}{method_calls_str}"
        code_parts.append(test_code)

    # --- Добавление BasePage ---
    if options.get("generateBasePage"):
        code_parts.append(BASE_PAGE_PYTHON_CODE)

    return "\n\n".join(code_parts)