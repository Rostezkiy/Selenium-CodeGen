// --- START OF FILE content_script.js ---

let isAssertMode = false;
const assertModeCursor = 'crosshair';
let lastHighlightedElement = null;

// --- БЛОК ДЛЯ ПОДСВЕТКИ ЭЛЕМЕНТА ---
function findElementBySelectors(selectors) {
    if (!selectors) return null;
    if (selectors.id) {
        const el = document.getElementById(selectors.id);
        if (el) return el;
    }
    if (selectors.fullXpath) {
         try {
            const el = document.evaluate(selectors.fullXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (el) return el;
        } catch (e) { console.error("Invalid XPath:", selectors.fullXpath); }
    }
    return null;
}

function highlightElement(selectors) {
    removeHighlight();
    const element = findElementBySelectors(selectors);
    if (element) {
        element.style.outline = '2px dashed #007bff';
        element.style.outlineOffset = '2px';
        element.style.transition = 'outline 0.1s ease-in-out';
        lastHighlightedElement = element;
    }
}

function removeHighlight() {
    if (lastHighlightedElement) {
        lastHighlightedElement.style.outline = '';
        lastHighlightedElement.style.outlineOffset = '';
        lastHighlightedElement = null;
    }
}

// --- ГЛАВНЫЙ ОБРАБОТЧИК КЛИКОВ (С ИЗМЕНЕНИЯМИ) ---
document.addEventListener('click', (e) => {
    if (isAssertMode) {
        e.preventDefault();
        e.stopPropagation();
        // В режиме проверки мы также ищем интерактивный элемент
        const interactiveElement = e.target.closest('button, a, input, [role="button"], label, select, textarea, [id]') || e.target;
        chrome.runtime.sendMessage({ command: 'record_assert_action', data: getElementInfo(interactiveElement) });
        exitAssertMode();
        return;
    }

    // --- ГЛАВНОЕ ИЗМЕНЕНИЕ ЗДЕСЬ ---
    // Ищем ближайший интерактивный элемент. Мы добавили в список '[id]'.
    // Теперь, если стандартные теги не найдены, скрипт будет искать ближайшего родителя с ЛЮБЫМ ID.
    // Это значительно улучшает точность на сложных компонентах.
    const interactiveElement = e.target.closest(
        'button, a, input, [role="button"], label, select, textarea, [id]'
    ) || e.target;
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---

    chrome.runtime.sendMessage({ command: 'record_action', type: 'click', data: getElementInfo(interactiveElement) });
}, true);


// --- РЕЖИМ "ДОБАВИТЬ ПРОВЕРКУ" ---
function enterAssertMode() {
    isAssertMode = true;
    document.body.style.cursor = assertModeCursor;
}

function exitAssertMode() {
    isAssertMode = false;
    document.body.style.cursor = 'default';
}

// --- СЛУШАТЕЛЬ СООБЩЕНИЙ ОТ РАСШИРЕНИЯ ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === 'enter_assert_mode') {
        enterAssertMode();
    } else if (message.command === 'exit_assert_mode') {
        exitAssertMode();
    }
    else if (message.command === 'highlight_element') {
        highlightElement(message.selectors);
    } else if (message.command === 'remove_highlight') {
        removeHighlight();
    }
});

// --- ФУНКЦИИ СБОРА ИНФОРМАЦИИ ОБ ЭЛЕМЕНТЕ ---
function generateSelectors(element) {
    const selectors = {};
    // Улучшаем сбор текста: title и aria-label более приоритетны для кнопок-иконок
    const text = element.innerText?.trim().replace(/"/g, "'") || element.title || element.getAttribute('aria-label');

    if (element.id) selectors.id = element.id;
    if (element.name) selectors.name = element.name;
    if (element.placeholder) selectors.placeholder = element.placeholder;
    if (element.title) selectors.title = element.title;
    if (element.getAttribute('aria-label')) selectors.ariaLabel = element.getAttribute('aria-label');


    if (text && text.length > 0 && text.length < 80) {
        selectors.xpathText = `//${element.tagName.toLowerCase()}[.="${text}"]`;
    }

    let xpath = '';
    let el = element;
    while (el && el.nodeType === 1) {
        let siblingIndex = 1, sibling = el.previousSibling;
        while (sibling) { if (sibling.nodeType === 1 && sibling.tagName === el.tagName) siblingIndex++; sibling = sibling.previousSibling; }
        xpath = `/${el.tagName.toLowerCase()}[${siblingIndex}]` + xpath;
        el = el.parentNode;
    }
    selectors.fullXpath = xpath.startsWith('/html/body') ? '.' + xpath.substring(10) : xpath;
    return selectors;
}

function getElementInfo(element) {
    let iframeInfo = null;
    if (window.self !== window.top) {
        try {
            const frameElement = window.frameElement;
            if (frameElement) {
                iframeInfo = { id: frameElement.id || null, name: frameElement.name || null, xpath: generateSelectors(frameElement).fullXpath };
            }
        } catch (e) { /* Cross-origin */ }
    }

    const dataAttributes = {};
    for (const attr of element.attributes) {
        if (attr.name.startsWith('data-')) {
            dataAttributes[attr.name] = attr.value;
        }
    }

    return {
        selectors: generateSelectors(element),
        tag: element.tagName.toLowerCase(),
        text: element.innerText?.trim() || element.title || element.getAttribute('aria-label') || '',
        value: element.value,
        selectedText: element.options ? element.options[element.selectedIndex].text : null,
        isEnabled: !element.disabled,
        isVisible: !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
        attributes: { href: element.getAttribute('href'), placeholder: element.getAttribute('placeholder'), class: element.className, title: element.title, 'aria-label': element.getAttribute('aria-label') },
        dataAttributes,
        iframeInfo,
        htmlContext: element.parentElement ? element.parentElement.innerHTML.substring(0, 2000) : '',
        targetOuterHtml: element.outerHTML,
        rect: element.getBoundingClientRect().toJSON()
    };
}

// --- ОСТАЛЬНЫЕ ОБРАБОТЧИКИ ---
let inputDebounceTimer = null;
const DEBOUNCE_DELAY = 550; // Задержка в миллисекундах

// Обработчик для input и textarea с "умной" задержкой (debounce)
document.addEventListener('input', (e) => {
    const target = e.target;
    const tagName = target.tagName.toLowerCase();
    const inputType = target.type ? target.type.toLowerCase() : '';

    // Мы хотим записывать 'input' только для текстовых полей.
    // Клик по чекбоксам и радиокнопкам уже обрабатывается 'click' листенером.
    const isTextInput = tagName === 'textarea' || (tagName === 'input' && !['checkbox', 'radio'].includes(inputType));

    if (isTextInput) { // Запускаем логику только для текстового ввода
        // Очищаем предыдущий таймер, если он был
        clearTimeout(inputDebounceTimer);

        // Устанавливаем новый таймер
        inputDebounceTimer = setTimeout(() => {
            // Отправляем сообщение только когда пользователь перестал печатать
            chrome.runtime.sendMessage({ command: 'record_action', type: 'input', data: getElementInfo(target) });
        }, DEBOUNCE_DELAY);
    }
}, true);

// Отдельный обработчик для select, т.к. для него 'change' - правильное событие
document.addEventListener('change', (e) => {
    const target = e.target;
    const tagName = target.tagName.toLowerCase();
    if (tagName === 'select') {
        // Для select отправляем событие сразу
        chrome.runtime.sendMessage({ command: 'record_action', type: 'select', data: getElementInfo(target) });
    }
}, true);

document.addEventListener('dblclick', (e) => {
    if (isAssertMode) return; // Не записываем двойные клики в режиме проверки
    // Применяем ту же логику поиска интерактивного элемента
    const interactiveElement = e.target.closest('button, a, input, [role="button"], label') || e.target;
    chrome.runtime.sendMessage({ command: 'record_action', type: 'double_click', data: getElementInfo(interactiveElement) });
}, true);

document.addEventListener("contextmenu", (e) => {
    // Также применяем логику поиска интерактивного элемента для контекстного меню
    const interactiveElement = e.target.closest('button, a, input, [role="button"], label') || e.target;
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        chrome.runtime.sendMessage({ command: 'record_action', type: 'right_click', data: getElementInfo(interactiveElement) });
    } else {
        chrome.storage.local.set({ 'lastRightClickedElement': getElementInfo(interactiveElement) });
    }
}, true);

// --- END OF FILE content_script.js ---