# SeleniumCodeGen: AI-Powered UI Autotest Generator

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)](https://fastapi.tiangolo.com/)
[![Chrome Extension](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)

**SeleniumCodeGen** is a sophisticated tool designed to accelerate UI automation by transforming manual browser interactions into clean, maintainable Python code. By combining a **Chrome Extension (Manifest V3)** for recording and a **FastAPI backend** for code generation, it produces production-ready tests using the **Page Object Model (POM)**, **Allure reporting**, and **self-healing locator** logic.

---

## 📖 Description

Writing UI tests manually is often time-consuming and prone to selector brittleness. **SeleniumCodeGen** solves this by:
1.  **Capturing Actions:** Intelligently recording clicks, inputs, and navigations directly in the browser.
2.  **Generating Smart Code:** Using a dedicated backend to structure code into Page Objects, ensuring DRY (Don't Repeat Yourself) principles.
3.  **Resilience:** Implementing "healing locators" and automatic scrolling within a robust `BasePage` class to reduce test flakiness.
4.  **AI Enhancement:** Optional integration with local LLMs (via Ollama) to generate human-readable step names and optimized CSS selectors.

---

## ✨ Key Features

*   **Page Object Model (POM) Support:** Automatically generates separate files/classes for page elements and test logic.
*   **Self-Healing Locators:** The generated `BasePage` includes logic to find elements even if primary selectors change.
*   **Allure Integration:** Full support for `@allure.step`, `@allure.feature`, and `@allure.title` decorators for beautiful reporting.
*   **Data-Driven Testing (DDT):** Support for variables and environment-specific configurations.
*   **Conditional Logic:** Record `IF/ELSE` blocks directly from the browser extension.
*   **LLM-Powered:** Integration with **Ollama (Llama3)** for semantic step naming and smart element identification.
*   **Advanced Assertions:** Dedicated "Assert Mode" to visually select elements for validation.

---

## 🏗 Architecture

The project consists of two core modules:

### 1. Backend (Python/FastAPI)
The "brain" of the operation. It receives JSON-serialized recording data and outputs structured Python code.
*   **Core Logic:** `app/code_generator.py` handles the template-based generation.
*   **Database:** SQLite (via SQLAlchemy) manages user licenses and access control.
*   **Validation:** Pydantic schemas ensure data integrity between the extension and the server.

### 2. Frontend (Chrome Extension)
A high-performance recorder built on Manifest V3.
*   **Content Script:** Injected into pages to capture events and provide visual feedback (element highlighting).
*   **Side Panel:** A modern UI for managing test cases, collections, and generation settings.
*   **Offscreen Canvas:** Used for capturing and cropping element-specific screenshots.

---

## 🚀 Getting Started

### Prerequisites
*   Python 3.9+
*   Google Chrome (or Chromium-based browser)
*   [Optional] [Ollama](https://ollama.com/) for AI features.

### 1. Server Setup
```bash
# Clone the repository
git clone https://github.com/Rostezkiy/Selenium-CodeGen.git
cd SeleniumCodeGen

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn app.main:app --reload
```

### 2. Initializing License (Dev Mode)
To use the generator, you need a local license key:
```bash
curl -X POST "http://127.0.0.1:8000/api/v1/dev/create-user-and-license?email=admin@example.com"
```
*Copy the `license_key` from the response.*

### 3. Extension Installation
1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** (top right).
3.  Click **Load unpacked** and select the `client` folder from this project.
4.  Open the Extension Options and paste your **License Key**.

---

## 🛠 Usage

1.  **Record:** Open the Side Panel, enter a Page Class name, and hit `Start Recording`.
2.  **Interact:** Perform actions on any website. Use the right-click context menu to add specific assertions or waits.
3.  **Configure:** In the side panel, toggle POM generation or BasePage inclusion.
4.  **Generate:** Click `Generate Code`. The Python code is instantly copied to your clipboard.
5.  **Run:** 
    ```bash
    pytest my_generated_test.py --alluredir=./allure-results
    ```

---

## 📊 Technology Stack

*   **Backend:** FastAPI, SQLAlchemy, Pydantic, Jinja2.
*   **Frontend:** JavaScript (ES6+), Chrome Extension API (MV3), SortableJS.
*   **Testing Frameworks:** Selenium WebDriver, Pytest, Allure.
*   **AI/ML:** Ollama API integration.

---

## 🏷 Tags

`#selenium` `#autotest` `#fastapi` `#python` `#chrome-extension` `#automation` `#testing` `#allure` `#page-object-model` `#self-healing-tests` `#llm` `#ollama` `#test-automation-framework`

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

---

**Developed for QA Engineers who value their time.**
