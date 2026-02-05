const useLlmCheckbox = document.getElementById('useLlm');
const ollamaUrlInput = document.getElementById('ollamaUrl');
const llmModelInput = document.getElementById('llmModel');
const customTestIdInput = document.getElementById('customTestId');
const locatorStrategySelect = document.getElementById('locatorStrategy');
const excludeXpathCheckbox = document.getElementById('excludeXpath');
const licenseKeyInput = document.getElementById('licenseKey');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');

function saveOptions() {
    const settings = {
        useLlm: useLlmCheckbox.checked,
        ollamaUrl: ollamaUrlInput.value,
        llmModel: llmModelInput.value,
        customTestId: customTestIdInput.value,
        locatorStrategy: locatorStrategySelect.value,
        excludeXpath: excludeXpathCheckbox.checked,
        licenseKey: licenseKeyInput.value.trim()

    };

    chrome.storage.sync.set(settings, () => {
        statusDiv.textContent = 'Настройки сохранены.';
        setTimeout(() => {
            statusDiv.textContent = '';
        }, 1500);
    });
}

function restoreOptions() {
    const defaults = {
        useLlm: false,
        ollamaUrl: 'http://localhost:11434',
        llmModel: 'llama3',
        customTestId: 'data-testid',
        locatorStrategy: 'smart',
        excludeXpath: false,
        licenseKey: ''
    };

    chrome.storage.sync.get(defaults, (items) => {
        useLlmCheckbox.checked = items.useLlm;
        ollamaUrlInput.value = items.ollamaUrl;
        llmModelInput.value = items.llmModel;
        customTestIdInput.value = items.customTestId;
        locatorStrategySelect.value = items.locatorStrategy;
        excludeXpathCheckbox.checked = items.excludeXpath;
        licenseKeyInput.value = items.licenseKey;
    });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
saveButton.addEventListener('click', saveOptions);