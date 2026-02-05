// ======================================================
// 1. УПРАВЛЕНИЕ СОСТОЯНИЕМ И OFFSCREEN API
// ======================================================

const STATE_KEY = 'autotestProState';

async function getState() {
    const result = await chrome.storage.local.get(STATE_KEY);
    const loadedState = result[STATE_KEY] || {};

    const defaults = {
        isRecording: false,
        isAssertMode: false,
        reselectingStepId: null,
        // --- НОВЫЕ ФЛАГИ ДЛЯ УСЛОВНОЙ ЛОГИКИ ---
        isRecordingIfCondition: false, // true, когда ждем клик для условия IF
        isRecordingInConditionalBlock: false, // true, когда запись идет внутри IF/ELSE
        conditionalRecordingContext: 'then', // 'then' или 'else'
        // ------------------------------------------
        environments: {'dev': {}, 'prod': {}},
        activeEnvironment: 'dev',
        collections: {'default': {id: 'default', name: 'Default Collection'}},
        testCases: {
            'default_test': {
                id: 'default_test',
                name: 'Default Test',
                collectionId: 'default',
                recordedSteps: [],
                pageClassName: 'MyPage'
            }
        },
        activeCollectionId: 'default',
        activeTestCaseId: 'default_test'
    };

    // Миграция со структуры "только тест-кейсы" на "коллекции"
    if (loadedState.testCases && !loadedState.collections) {
        console.log("Autotest Pro: Migrating test cases to collections structure.");
        const migratedState = {...defaults, ...loadedState}; // Копируем глобальные настройки

        // Создаем одну коллекцию и помещаем в нее все существующие тест-кейсы
        const defaultCollectionId = 'default_migrated';
        migratedState.collections = {[defaultCollectionId]: {id: defaultCollectionId, name: 'Migrated Collection'}};

        Object.values(migratedState.testCases).forEach(testCase => {
            testCase.collectionId = defaultCollectionId;
        });

        migratedState.activeCollectionId = defaultCollectionId;
        return migratedState;
    }

    return {...defaults, ...loadedState};
}

async function setState(newState) {
    await chrome.storage.local.set({[STATE_KEY]: newState});
}

// ДОБАВЬТЕ ЭТУ ВСПОМОГАТЕЛЬНУЮ ФУНКЦИЮ ПЕРЕД ОБРАБОТЧИКОМ
// Она безопасно получает объект активного тест-кейса из состояния.
function getActiveTestCase(state) {
    if (state.testCases && state.testCases[state.activeTestCaseId]) {
        return state.testCases[state.activeTestCaseId];
    }
    // Fallback на случай, если что-то пошло не так (например, ID был удален)
    const firstKey = Object.keys(state.testCases)[0];
    if (firstKey) {
        state.activeTestCaseId = firstKey; // Исправляем ID в состоянии
        return state.testCases[firstKey];
    }
    return null; // Крайний случай, если нет вообще ни одного тест-кейса
}

// --- НОВАЯ ФУНКЦИЯ: Поиск и получение текущего массива для записи шагов ---
function getCurrentStepsArray(activeTestCase, state) {
    if (!state.isRecordingInConditionalBlock) {
        return activeTestCase.recordedSteps;
    }

    // Рекурсивная функция для поиска активного блока
    function findActiveArray(steps) {
        for (let i = steps.length - 1; i >= 0; i--) {
            const step = steps[i];
            if (step.type === 'conditional' && !step.isFinalized) {
                // Если мы нашли активный незавершенный блок, ищем дальше внутри него
                const innerArray = findActiveArray(step.else_steps) || findActiveArray(step.then_steps);
                if (innerArray) return innerArray;

                // Если внутри не нашли, значит это и есть наш блок
                return state.conditionalRecordingContext === 'then' ? step.then_steps : step.else_steps;
            }
        }
        return null;
    }

    return findActiveArray(activeTestCase.recordedSteps) || activeTestCase.recordedSteps;
}


// Управление Offscreen Document для обрезки скриншотов
let creatingOffscreenDocument;

async function hasOffscreenDocument(path) {
    if (chrome.runtime.getContexts) { // Manifest V3
        const contexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [chrome.runtime.getURL(path)]
        });
        return !!contexts.length;
    } else { // Fallback для старых версий
        const matchedClients = await clients.matchAll();
        for (const client of matchedClients) {
            if (client.url.endsWith(path)) return true;
        }
        return false;
    }
}


async function cropScreenshot(dataUrl, rect) {
    const path = '/offscreen.html';
    if (!await hasOffscreenDocument(path)) {
        if (creatingOffscreenDocument) {
            await creatingOffscreenDocument;
        } else {
            creatingOffscreenDocument = chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['DOM_PARSER'],
                justification: 'To crop screenshot images on a canvas',
            });
            await creatingOffscreenDocument;
            creatingOffscreenDocument = null;
        }
    }

    const croppedUrl = await chrome.runtime.sendMessage({
        command: 'crop_image', // Эта команда будет обработана в offscreen.js
        dataUrl,
        rect
    });
    return croppedUrl;
}

chrome.action.onClicked.addListener(async (tab) => {
    // Включает/выключает боковую панель для текущей вкладки
    await chrome.sidePanel.open({tabId: tab.id});
});

// ======================================================
// 2. НАСТРОЙКА ПРИ УСТАНОВКЕ
// ======================================================
chrome.runtime.onInstalled.addListener(() => {
    // Устанавливаем начальное состояние
    getState().then(initialState => setState(initialState));

    // 1. Создаем главный пункт меню
    chrome.contextMenus.create({
        id: "autotest-pro-main",
        title: "Autotest Pro",
        contexts: ["all"]
    });

    // 2. Создаем категорию "Проверки"
    chrome.contextMenus.create({
        id: "assertions",
        parentId: "autotest-pro-main",
        title: "Проверки (Asserts)",
        contexts: ["all"]
    });
    const asserts = [
        {id: "assertVisible", title: "Проверить, что ВИДЕН"},
        {id: "assertNotVisible", title: "Проверить, что НЕ ВИДЕН"},
        {id: "assertTextEquals", title: "Проверить текст (на текущее значение)"},
        {id: "assertValueEquals", title: "Проверить значение (value)"},
        {id: "assertIsClickable", title: "Проверить, что КЛИКАБЕЛЕН"},
        {id: "assertIsNotClickable", title: "Проверить, что НЕ КЛИКАБЕЛЕН"},
        {id: "assertIsEnabled", title: "Проверить, что АКТИВЕН"},
        {id: "assertIsDisabled", title: "Проверить, что НЕАКТИВЕН"},
        {id: "assertHasCssClass", title: "Проверить CSS класс"},
        {id: "assertAttribute", title: "Проверить значение атрибута"},
    ];
    asserts.forEach(a => {
        chrome.contextMenus.create({
            id: a.id,
            parentId: "assertions",
            title: a.title,
            contexts: ["all"]
        });
    });

    // 3. Создаем категорию "Ожидания"
    chrome.contextMenus.create({
        id: "waits",
        parentId: "autotest-pro-main",
        title: "Ожидания (Waits)",
        contexts: ["all"]
    });
    const waits = [
        {id: "waitVisible", title: "Ждать, пока элемент ВИДЕН"},
        {id: "waitInvisible", title: "Ждать, пока элемент НЕ ВИДЕН"},
        {id: "waitClickable", title: "Ждать, пока элемент станет КЛИКАБЕЛЕН"},
    ];
    waits.forEach(wait => {
        chrome.contextMenus.create({
            id: wait.id,
            parentId: "waits",
            title: wait.title,
            contexts: ["all"]
        });
    });

    // 4. Создаем категорию "Действия"
    chrome.contextMenus.create({
        id: "actions",
        parentId: "autotest-pro-main",
        title: "Действия",
        contexts: ["all"]
    });
    const actions = [
        {id: "hover", title: "Записать Hover"},
        {id: "doubleClick", title: "Записать Двойной клик"},
        {id: "getText", title: "Сохранить текст в переменную"},
    ];
    actions.forEach(action => {
        chrome.contextMenus.create({
            id: action.id,
            parentId: "actions",
            title: action.title,
            contexts: ["all"]
        });
    });

});

// ======================================================
// 3. ОБРАБОТЧИКИ СООБЩЕНИЙ И СОБЫТИЙ
// ======================================================
chrome.contextMenus.onClicked.addListener(async (info) => {
    const state = await getState();
    const activeTestCase = getActiveTestCase(state);

    // Проверяем запись и наличие активного теста
    if (!state.isRecording || !activeTestCase) return;

    const {lastRightClickedElement} = await chrome.storage.local.get('lastRightClickedElement');
    if (lastRightClickedElement) {
        let type = 'assert';
        if (info.parentMenuItemId === 'waits') type = 'wait';
        else if (info.parentMenuItemId === 'actions') type = info.menuItemId;

        // Передаем activeTestCase в processAction
        await processAction(type, lastRightClickedElement, state, info.menuItemId, activeTestCase);
        await setState(state);
        await updatePopup();
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        let state = await getState();
        // Получаем активный тест-кейс в самом начале.
        // Все последующие операции будут работать с этим объектом.
        let activeTestCase = getActiveTestCase(state);

        switch (message.command) {
            // --- НОВЫЕ КОМАНДЫ ДЛЯ УПРАВЛЕНИЯ ТЕСТ-КЕЙСАМИ ---
            case 'create_collection': {
                const newCollId = `coll_${Date.now()}`;
                state.collections[newCollId] = {id: newCollId, name: message.name};
                state.activeCollectionId = newCollId;
                // Создаем сразу и первый пустой тест-кейс в новой коллекции
                const newTestCaseId = `test_${Date.now()}`;
                state.testCases[newTestCaseId] = {
                    id: newTestCaseId, name: 'Default Test', collectionId: newCollId,
                    recordedSteps: [], pageClassName: 'MyPage'
                };
                state.activeTestCaseId = newTestCaseId;
                break;
            }
            case 'switch_collection': {
                if (state.collections[message.id]) {
                    state.activeCollectionId = message.id;
                    // Активируем первый тест-кейс из этой коллекции
                    const firstTestCaseInCollection = Object.values(state.testCases).find(tc => tc.collectionId === message.id);
                    state.activeTestCaseId = firstTestCaseInCollection ? firstTestCaseInCollection.id : null;
                }
                break;
            }
            case 'rename_collection': {
                if (state.collections[message.id]) {
                    state.collections[message.id].name = message.newName;
                }
                break;
            }
            case 'delete_collection': {
                const collIdToDelete = message.id;
                if (state.collections[collIdToDelete]) {
                    // Удаляем коллекцию
                    delete state.collections[collIdToDelete];
                    // Удаляем все тест-кейсы, связанные с ней
                    state.testCases = Object.fromEntries(
                        Object.entries(state.testCases).filter(([id, tc]) => tc.collectionId !== collIdToDelete)
                    );

                    // Если коллекций не осталось, создаем новую по умолчанию
                    if (Object.keys(state.collections).length === 0) {
                        const newDefaultCollId = 'default';
                        state.collections[newDefaultCollId] = {id: newDefaultCollId, name: 'Default Collection'};
                        state.activeCollectionId = newDefaultCollId;
                        // И сразу создаем новый дефолтный тест-кейс
                        const newDefaultTestId = `test_default`;
                        state.testCases[newDefaultTestId] = {
                            id: newDefaultTestId, name: 'Default Test', collectionId: newDefaultCollId,
                            recordedSteps: [], pageClassName: 'MyPage'
                        };
                        state.activeTestCaseId = newDefaultTestId;
                    } else {
                        // Если удалили активную, но остались другие
                        if (state.activeCollectionId === collIdToDelete) {
                            const firstRemainingCollId = Object.keys(state.collections)[0];
                            state.activeCollectionId = firstRemainingCollId;
                            const firstTestCase = Object.values(state.testCases).find(tc => tc.collectionId === firstRemainingCollId);
                            state.activeTestCaseId = firstTestCase ? firstTestCase.id : null;
                        }
                    }
                }
                break;
            }
            case 'create_test_case': {
                // Убедимся, что есть активная коллекция, куда добавлять тест
                if (state.activeCollectionId) {
                    const newTestId = `test_${Date.now()}`;
                    state.testCases[newTestId] = {
                        id: newTestId,
                        name: message.name,
                        collectionId: state.activeCollectionId, // Связываем с активной коллекцией
                        recordedSteps: [],
                        pageClassName: 'MyPage'
                    };
                    state.activeTestCaseId = newTestId; // Сразу делаем новый тест-кейс активным
                }
                break;
            }
            case 'switch_test_case': {
                if (state.testCases[message.id]) {
                    state.activeTestCaseId = message.id;
                }
                break;
            }
            case 'delete_test_case': {
                const testIdToDelete = message.id;
                if (activeTestCase && activeTestCase.id === testIdToDelete) {
                    delete state.testCases[testIdToDelete];

                    const remainingTestCasesInCollection = Object.values(state.testCases).filter(tc => tc.collectionId === state.activeCollectionId);

                    // Если в коллекции не осталось тест-кейсов, создаем новый по умолчанию
                    if (remainingTestCasesInCollection.length === 0) {
                        const newDefaultTestId = `test_${Date.now()}`;
                        state.testCases[newDefaultTestId] = {
                            id: newDefaultTestId, name: 'Default Test', collectionId: state.activeCollectionId,
                            recordedSteps: [], pageClassName: 'MyPage'
                        };
                        state.activeTestCaseId = newDefaultTestId;
                    } else {
                        // Иначе просто делаем активным первый из оставшихся
                        state.activeTestCaseId = remainingTestCasesInCollection[0].id;
                    }
                }
                break;
            }
            case 'rename_test_case': {
                if (state.testCases[message.id]) {
                    state.testCases[message.id].name = message.newName;
                }
                break;
            }
            case 'update_page_name': {
                if (activeTestCase) {
                    activeTestCase.pageClassName = message.pageName;
                }
                break;
            }
            // --- ОБНОВЛЕННЫЕ СТАРЫЕ КОМАНДЫ ---
            case 'start': {
                state.isRecording = true;
                if (activeTestCase) {
                    activeTestCase.pageClassName = message.pageName;
                }
                state.currentFrameContext = null;
                // Сбрасываем флаги условной логики при новом старте
                state.isRecordingIfCondition = false;
                state.isRecordingInConditionalBlock = false;
                break;
            }
            case 'stop': {
                state.isRecording = false;
                // Сбрасываем все "режимные" флаги
                state.isAssertMode = false;
                state.reselectingStepId = null;
                state.isRecordingIfCondition = false;
                state.isRecordingInConditionalBlock = false;
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                if (tab) await chrome.tabs.sendMessage(tab.id, {command: 'exit_assert_mode'});
                break;
            }

            case 'record_action': {
                if (state.isRecording && activeTestCase) {
                    // --- ИЗМЕНЕНИЕ: Логика для IF блока ---
                    if (state.isRecordingIfCondition) {
                        // Создаем сам блок `conditional`
                        const conditionStep = await createStepObject('assert', message.data, 'assertVisible');

                        const conditionalBlock = {
                            id: Date.now(),
                            type: 'conditional',
                            condition: conditionStep,
                            then_steps: [],
                            else_steps: [],
                            isFinalized: false // Флаг, что мы еще внутри этого блока
                        };

                        const targetArray = getCurrentStepsArray(activeTestCase, state);
                        targetArray.push(conditionalBlock);

                        // Переключаем состояние на запись ВНУТРИ блока
                        state.isRecordingIfCondition = false;
                        state.isRecordingInConditionalBlock = true;
                        state.conditionalRecordingContext = 'then';

                        // Выходим из assert mode, так как условие выбрано
                        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                        if (tab) await chrome.tabs.sendMessage(tab.id, {command: 'exit_assert_mode'});

                    } else { // Обычная запись шага
                        if (message.type === 'input') {
                            const targetArray = getCurrentStepsArray(activeTestCase, state);
                            const existingStepIndex = targetArray.findLastIndex(step =>
                                step.type === 'input' &&
                                step.data.selectors.fullXpath === message.data.selectors.fullXpath
                            );
                            if (existingStepIndex > -1) {
                                const stepToUpdate = targetArray[existingStepIndex];
                                stepToUpdate.data.value = message.data.value;
                                stepToUpdate.allureStep = await generateAllureStepName(stepToUpdate);
                                stepToUpdate.code = await regenerateCodeForStep(stepToUpdate);
                                break;
                            }
                        }
                        await processAction(message.type, message.data, state, null, activeTestCase);
                    }
                }
                break;
            }
            // --- НОВЫЕ КОМАНДЫ ДЛЯ УСЛОВНЫХ БЛОКОВ ---
            case 'start_if_block': {
                state.isRecordingIfCondition = true;
                // Входим в режим выбора элемента, как для обычной проверки
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                if (tab) await chrome.tabs.sendMessage(tab.id, {command: 'enter_assert_mode'});
                break;
            }
            case 'switch_to_else_block': {
                if (state.isRecordingInConditionalBlock) {
                    state.conditionalRecordingContext = 'else';
                }
                break;
            }
            case 'end_if_block': {
                if (state.isRecordingInConditionalBlock && activeTestCase) {
                    // Рекурсивная функция для финализации последнего открытого блока
                    function finalizeLastBlock(steps) {
                        for (let i = steps.length - 1; i >= 0; i--) {
                            const step = steps[i];
                            if (step.type === 'conditional' && !step.isFinalized) {
                                // Пытаемся финализировать вложенные блоки первыми
                                const finalizedInElse = finalizeLastBlock(step.else_steps);
                                if (finalizedInElse) return true;
                                const finalizedInThen = finalizeLastBlock(step.then_steps);
                                if (finalizedInThen) return true;

                                // Если вложенных нет, финализируем текущий
                                step.isFinalized = true;
                                return true;
                            }
                        }
                        return false;
                    }

                    finalizeLastBlock(activeTestCase.recordedSteps);

                    // Проверяем, остались ли еще незавершенные блоки
                    function areThereOpenBlocks(steps) {
                        return steps.some(step => step.type === 'conditional' && !step.isFinalized ||
                            (step.type === 'conditional' && (areThereOpenBlocks(step.then_steps) || areThereOpenBlocks(step.else_steps))));
                    }

                    if (!areThereOpenBlocks(activeTestCase.recordedSteps)) {
                        state.isRecordingInConditionalBlock = false;
                    }
                }
                break;
            }

            case 'delete_step': {
                if (activeTestCase) {
                    // Рекурсивная функция для удаления шага из любого уровня вложенности
                    function findAndRemove(steps, id) {
                        const index = steps.findIndex(s => s.id == id);
                        if (index > -1) {
                            steps.splice(index, 1);
                            return true;
                        }
                        for (const step of steps) {
                            if (step.type === 'conditional') {
                                if (findAndRemove(step.then_steps, id) || findAndRemove(step.else_steps, id)) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    }

                    findAndRemove(activeTestCase.recordedSteps, message.id);
                }
                break;
            }
            case 'clear_steps': {
                if (activeTestCase) {
                    activeTestCase.recordedSteps = [];
                }
                break;
            }
            case 'reorder_steps': {
                if (activeTestCase) {
                    const stepsMap = new Map(activeTestCase.recordedSteps.map(step => [step.id, step]));
                    activeTestCase.recordedSteps = message.newOrder.map(id => stepsMap.get(id)).filter(Boolean);
                }
                break;
            }
            case 'get_current_state': {
                await updatePopup(state);
                return;
            }
            case 'generate_full_code': {
                if (!activeTestCase || activeTestCase.recordedSteps.length === 0) {
                    sendResponse({error: "Нет шагов для генерации."});
                    return;
                }

                // 1. Получаем ключ из хранилища
                chrome.storage.sync.get({licenseKey: ''}, async (settings) => {
                    if (!settings.licenseKey) {
                        sendResponse({error: "Лицензионный ключ не найден. Пожалуйста, введите его в настройках."});
                        return;
                    }

                    // 2. Формируем тело запроса
                    const allTestCasesForPage = Object.values(state.testCases).filter(
                        tc => tc.pageClassName === activeTestCase.pageClassName
                    );

                    const requestBody = {
                        activeTestCase: activeTestCase,
                        allTestCasesForPage: allTestCasesForPage,
                        stateData: { // Отправляем только нужные части state, а не весь
                            collections: state.collections,
                            activeCollectionId: state.activeCollectionId,
                            environments: state.environments,
                            activeEnvironment: state.activeEnvironment
                        },
                        options: {
                            generatePom: message.generatePom,
                            generateTest: message.generateTest,
                            generateBasePage: message.generateBasePage,
                        }
                    };

                    try {
                        // 3. Отправляем запрос на наш сервер
                        const response = await fetch('http://127.0.0.1:8000/api/v1/generate', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${settings.licenseKey}`
                            },
                            body: JSON.stringify(requestBody)
                        });

                        const data = await response.json();

                        if (!response.ok) {
                            // Если сервер вернул ошибку, показываем ее
                            sendResponse({error: data.detail || 'Ошибка сервера'});
                        } else {
                            // Если все хорошо, отправляем код обратно в popup
                            sendResponse({code: data.code});
                        }

                    } catch (e) {
                        console.error("API call failed:", e);
                        sendResponse({error: "Не удалось подключиться к серверу. Убедитесь, что он запущен."});
                    }
                });
                return true; // для асинхронного sendResponse
            }
            case 'get_step_data': {
                if (activeTestCase) {
                    // Рекурсивная функция для поиска шага
                    function findStep(steps, id) {
                        for (const step of steps) {
                            if (step.id == id) return step;
                            if (step.type === 'conditional') {
                                const found = findStep(step.then_steps, id) || findStep(step.else_steps, id);
                                if (found) return found;
                            }
                        }
                        return null;
                    }

                    sendResponse({step: findStep(activeTestCase.recordedSteps, message.id)});
                } else {
                    sendResponse({step: null});
                }
                return;
            }
            case 'update_step': {
                if (activeTestCase) {
                    // Рекурсивная функция для поиска и обновления шага
                    function findAndUpdate(steps, data) {
                        const index = steps.findIndex(s => s.id == data.id);
                        if (index > -1) {
                            const originalStep = steps[index];
                            const updatedStep = {...originalStep, ...data};

                            if (updatedStep.variableForValue) {
                                updatedStep.data.value = null;
                                updatedStep.expectedText = null;
                                updatedStep.expectedValue = null;
                            } else if (updatedStep.type === 'input' && data.value !== null) {
                                updatedStep.data.value = data.value;
                            }

                            regenerateCodeForStep(updatedStep).then(code => {
                                updatedStep.code = code;
                                steps[index] = updatedStep;
                            });
                            return true;
                        }
                        for (const step of steps) {
                            if (step.type === 'conditional') {
                                if (findAndUpdate(step.then_steps, data) || findAndUpdate(step.else_steps, data)) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    }

                    findAndUpdate(activeTestCase.recordedSteps, message.data);
                }
                break;
            }

            case 'enter_assert_mode': {
                state.isAssertMode = true;
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                if (tab) await chrome.tabs.sendMessage(tab.id, {command: 'enter_assert_mode'});
                await setState(state);
                return;
            }
            case 'reselect_element': {
                state.isAssertMode = true;
                state.reselectingStepId = message.stepId;
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                if (tab) await chrome.tabs.sendMessage(tab.id, {command: 'enter_assert_mode'});
                await setState(state);
                return;
            }
            case 'record_assert_action': {
                if (state.reselectingStepId && activeTestCase) {
                    const stepToUpdate = activeTestCase.recordedSteps.find(s => s.id == state.reselectingStepId);
                    if (stepToUpdate) {
                        stepToUpdate.data = message.data;
                        stepToUpdate.locators = await generateLocatorList(message.data);
                        stepToUpdate.screenshot = null;
                        if (message.data.rect && message.data.rect.width > 0 && message.data.rect.height > 0) {
                            try {
                                const fullScreenshot = await chrome.tabs.captureVisibleTab();
                                stepToUpdate.screenshot = await cropScreenshot(fullScreenshot, message.data.rect);
                            } catch (e) {
                                console.error("Screenshot failed:", e);
                            }
                        }
                        stepToUpdate.allureStep = await generateAllureStepName(stepToUpdate);
                        stepToUpdate.code = await regenerateCodeForStep(stepToUpdate);
                    }
                    state.reselectingStepId = null;
                } else if (activeTestCase) {
                    const newStep = await processAction('assert', message.data, state, 'assertVisible', activeTestCase);
                    state.openModalForStepId = newStep.id;
                }
                state.isAssertMode = false;
                break;
            }
            case 'clear_modal_flag': {
                delete state.openModalForStepId;
                break;
            }
            case 'get_full_state': {
                sendResponse({state});
                return;
            }
            case 'import_state': {
                state = {...state, ...message.state};
                break;
            }
            case 'set_active_environment': {
                state.activeEnvironment = message.env;
                break;
            }
            case 'update_variables': {
                if (!state.environments[state.activeEnvironment]) {
                    state.environments[state.activeEnvironment] = {};
                }
                state.environments[state.activeEnvironment] = message.variables;

                if (activeTestCase) {
                    for (let i = 0; i < activeTestCase.recordedSteps.length; i++) {
                        activeTestCase.recordedSteps[i].code = await regenerateCodeForStep(activeTestCase.recordedSteps[i]);
                    }
                }
                break;
            }
        }
        await setState(state);
        await updatePopup();
    })();
    return true;
});


// ======================================================
// 4. ОСНОВНАЯ ЛОГИКА
// ======================================================
// --- ИЗМЕНЕНИЕ: Создаем отдельную функцию для создания объекта шага ---
async function createStepObject(type, data, subType = null) {
    let screenshotDataUrl = null;
    if (data.rect && data.rect.width > 0 && data.rect.height > 0) {
        try {
            const fullScreenshot = await chrome.tabs.captureVisibleTab();
            if (fullScreenshot) {
                screenshotDataUrl = await cropScreenshot(fullScreenshot, data.rect);
            }
        } catch (e) {
            console.error("Не удалось сделать скриншот:", e);
        }
    }

    const stepObject = {
        id: Date.now() + Math.random(), // Добавляем Math.random для уникальности
        type,
        subType,
        data,
        screenshot: screenshotDataUrl,
        variableName: null,
        variableForValue: null,
        locators: await generateLocatorList(data),
        code: {}
    };

    if (subType === 'assertTextEquals' || subType === 'getText') stepObject.expectedText = data.text;
    else if (subType === 'assertValueEquals') stepObject.expectedValue = data.value;
    else if (subType === 'assertHasCssClass') stepObject.expectedCssClass = '';
    else if (subType === 'assertAttribute') {
        stepObject.expectedAttributeName = '';
        stepObject.expectedAttributeValue = '';
    }

    stepObject.allureStep = await generateAllureStepName(stepObject);
    stepObject.code = await regenerateCodeForStep(stepObject);

    return stepObject;
}


async function processAction(type, data, currentState, subType = null, activeTestCase) {
    if (!activeTestCase) {
        console.error("processAction called without activeTestCase. Cannot record step.");
        return null;
    }

    const targetArray = getCurrentStepsArray(activeTestCase, currentState);

    // `_handleFrameSwitch` также должен быть обновлен для работы с `targetArray`
    await _handleFrameSwitch(currentState, data.iframeInfo, targetArray);

    const newStep = await createStepObject(type, data, subType);
    targetArray.push(newStep);

    return newStep;
}


async function _handleFrameSwitch(state, newFrameInfo, targetArray) {
    const oldFrameXpath = state.currentFrameContext ? state.currentFrameContext.xpath : null;
    const newFrameXpath = newFrameInfo ? newFrameInfo.xpath : null;
    if (oldFrameXpath === newFrameXpath) return;

    if (oldFrameXpath && !newFrameXpath) {
        const switchStep = await createStepObject('switch_to_default_content', {});
        targetArray.push(switchStep);
    }

    if (newFrameXpath) {
        if (oldFrameXpath) {
            const exitStep = await createStepObject('switch_to_default_content', {});
            targetArray.push(exitStep);
        }
        const frameData = {selectors: {fullXpath: newFrameInfo.xpath}, tag: 'iframe'};
        const enterStep = await createStepObject('switch_to_iframe', frameData);
        targetArray.push(enterStep);
    }
    state.currentFrameContext = newFrameInfo;
}


async function regenerateCodeForStep(step) {
    const elementName = generateElementName(step.data);
    const locatorVarName = `self.${elementName}_locators`;
    let methodBody = '', allureStep = step.allureStep;
    let methodSignature = `(self)`, methodCallArgs = `()`;
    let methodName = `${(step.subType || step.type)}_${elementName}`;

    let argName = step.variableForValue || step.variableName;
    if (argName) {
        argName = argName.toLowerCase();
        methodSignature = `(self, ${argName})`;
        methodCallArgs = `(${step.variableForValue || step.variableName})`;
        allureStep = allureStep.replace(/'.*?'/, `{${argName}}`);
    }

    switch (step.type) {
        case 'click':
            methodBody = `self.do_click_with_healing(${locatorVarName})`;
            break;
        case 'right_click':
            methodBody = `self.do_right_click_with_healing(${locatorVarName})`;
            break;
        case 'hover':
            methodBody = `self.do_hover_with_healing(${locatorVarName})`;
            break;
        case 'double_click':
            methodBody = `self.do_double_click_with_healing(${locatorVarName})`;
            break; // НОВЫЙ ТИП
        case 'input':
            const valueForInput = argName ? argName : `"${step.data.value}"`;
            methodBody = `self.do_clear_and_send_keys_with_healing(${locatorVarName}, ${valueForInput})`;
            break;
        case 'select':
            methodBody = `self.select_option_by_visible_text(${locatorVarName}, "${step.data.selectedText}")`;
            break;
        case 'getText':
            methodName = `get_text_from_${elementName}`;
            methodBody = `return self.get_text_with_healing(${locatorVarName})`;
            break;
        case 'switch_to_iframe':
            methodBody = `self.switch_to_iframe(${locatorVarName})`;
            break;
        case 'switch_to_default_content':
            methodName = 'switch_to_default_content';
            methodBody = `self.switch_to_default_content()`;
            break;
        case 'wait':
            let waitMethod = '';
            if (step.subType === 'waitVisible') waitMethod = 'wait_for_element_visible';
            else if (step.subType === 'waitInvisible') waitMethod = 'wait_for_element_invisible';
            else if (step.subType === 'waitClickable') waitMethod = 'wait_for_element_to_be_clickable'; // НОВЫЙ ТИП
            if (waitMethod) methodBody = `self.${waitMethod}(${locatorVarName})`;
            break;
        case 'assert':
            // --- ИЗМЕНЕНИЕ: Для IF/ELSE нам нужен метод, возвращающий boolean, а не assert ---
            let isBooleanReturnMethod = false;
            let booleanMethodName = '';
            switch (step.subType) {
                case 'assertVisible':
                    methodBody = `assert self.is_visible_with_healing(${locatorVarName}), "Элемент не виден"`;
                    booleanMethodName = `is_visible_with_healing`;
                    isBooleanReturnMethod = true;
                    break;
                case 'assertNotVisible':
                    methodBody = `assert self.is_not_visible_with_healing(${locatorVarName}), "Элемент виден"`;
                    booleanMethodName = `is_not_visible_with_healing`;
                    isBooleanReturnMethod = true;
                    break;
                // НОВЫЕ ПРОВЕРКИ
                case 'assertIsClickable':
                    methodBody = `assert self.is_clickable_with_healing(${locatorVarName}), "Элемент не кликабелен"`;
                    booleanMethodName = `is_clickable_with_healing`;
                    isBooleanReturnMethod = true;
                    break;
                case 'assertIsNotClickable':
                    methodBody = `assert not self.is_clickable_with_healing(${locatorVarName}), "Элемент кликабелен"`;
                    booleanMethodName = `not self.is_clickable_with_healing`; // Немного костыль, но работает
                    isBooleanReturnMethod = true;
                    break;
                case 'assertIsEnabled':
                    methodBody = `assert self.is_enabled_with_healing(${locatorVarName}), "Элемент неактивен"`;
                    booleanMethodName = `is_enabled_with_healing`;
                    isBooleanReturnMethod = true;
                    break;
                case 'assertIsDisabled':
                    methodBody = `assert not self.is_enabled_with_healing(${locatorVarName}), "Элемент активен"`;
                    booleanMethodName = `not self.is_enabled_with_healing`;
                    isBooleanReturnMethod = true;
                    break;
                case 'assertTextEquals':
                    const textToCompare = argName ? argName : `"${step.expectedText}"`;
                    methodBody = `assert self.get_text_with_healing(${locatorVarName}) == ${textToCompare}`;
                    break;
                // НОВАЯ ПРОВЕРКА
                case 'assertValueEquals':
                    const valueToCompare = argName ? argName : `"${step.expectedValue}"`;
                    methodBody = `assert self.get_attribute_with_healing(${locatorVarName}, "value") == ${valueToCompare}`;
                    break;
                case 'assertHasCssClass':
                    methodBody = `assert "${step.expectedCssClass}" in self.get_attribute_with_healing(${locatorVarName}, "class")`;
                    break;
                case 'assertAttribute':
                    methodBody = `assert self.get_attribute_with_healing(${locatorVarName}, "${step.expectedAttributeName}") == "${step.expectedAttributeValue}"`;
                    break;
            }
            // Сохраняем информацию для генератора IF
            if (isBooleanReturnMethod) {
                step.booleanCheck = {
                    methodName: booleanMethodName,
                    locatorVarName: locatorVarName
                };
            }
            break;
    }

    if (!methodBody) return step.code || {methodDefinition: '', methodCall: ''};

    let methodCall = `page.${methodName}${methodCallArgs}`;
    if (step.type === 'getText' && step.variableName) {
        methodCall = `${step.variableName} = page.${methodName}${methodCallArgs}`;
    }

    const methodDefinition = `    @allure.step("${allureStep}")\n    def ${methodName}${methodSignature}:\n        ${methodBody}`;
    return {methodDefinition, methodCall};
}


// ======================================================
// 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (AI + Naming)
// ======================================================
async function updatePopup(currentState = null) {
    const state = currentState || await getState();
    try {
        await chrome.runtime.sendMessage({command: 'update_state', state});
    } catch (e) {
        // Игнорируем ошибку, если popup закрыт
    }
}

async function getLlmResponse(prompt) {
    const settings = await chrome.storage.sync.get({
        useLlm: false,
        ollamaUrl: 'http://localhost:11434',
        llmModel: 'llama3'
    });
    if (!settings.useLlm) return null;

    try {
        const response = await fetch(`${settings.ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({model: settings.llmModel, prompt, stream: false})
        });
        if (!response.ok) return null;
        const result = await response.json();
        return result.response.trim().replace(/['"`]/g, '');
    } catch (error) {
        console.error("LLM request failed:", error);
        return null;
    }
}

async function generateAllureStepName(step) {
    const elementName = generateElementName(step.data);
    const type = step.subType || step.type;
    const value = (step.data && step.data.value) || step.expectedText || '';

    const prompt = `Generate a short, human-readable Allure step name in Russian for a UI test.
    Action type: "${type}"
    Element name: "${elementName}"
    Value: "${value}"
    Generate only the final string, like "Кликаем по кнопке 'Войти'" or "Вводим '{login}' в поле 'Имя пользователя'". Use placeholders like {variable_name} if the value is parameterized.`;

    const llmName = await getLlmResponse(prompt);
    if (llmName) return llmName;

    // Fallback-логика
    let actionText = '';
    switch (type) {
        case 'click':
            actionText = `Кликаем по элементу`;
            break;
        case 'input':
            actionText = `Вводим значение '${value}' в`;
            break;
        case 'assertVisible':
            actionText = `Проверяем видимость элемента`;
            break;
        // ... другие типы ...
        default:
            actionText = `Выполняем '${type}' на элементе`;
    }

    if (type === 'wait') return `Ожидаем, пока элемент '${elementName}' станет ${step.subType === 'waitVisible' ? 'видимым' : 'невидимым'}`;
    return `${actionText} '${elementName}'`;
}

function generateElementName(data) {
    if (!data) return 'element';
    if (!data.selectors) return 'page_context';
    const s = data.selectors;
    let nameSource = (data.attributes && data.attributes['data-testid']) || s.id || s.name || s.placeholder || data.text || data.tag;
    return nameSource.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').toLowerCase().substring(0, 40) || 'element';
}

async function generateLocatorList(data) {
    if (!data || !data.selectors) return [];

    const settings = await chrome.storage.sync.get({
        customTestId: 'data-testid',
        locatorStrategy: 'smart',
        excludeXpath: false,
        useLlm: false
    });
    const s = data.selectors;
    let locatorList = [];

    const customTestIdValue = data.dataAttributes ? data.dataAttributes[settings.customTestId] : null;
    if (customTestIdValue) {
        locatorList.push(`(By.CSS_SELECTOR, '[${settings.customTestId}="${customTestIdValue}"]')`);
    }

    if (settings.useLlm && data.htmlContext && data.targetOuterHtml) {
        const prompt = `Analyze this HTML snippet. The target element is \`${data.targetOuterHtml}\`. Provide the most robust and unique CSS selector. Return ONLY the selector string.`;
        const llmSelector = await getLlmResponse(prompt);
        if (llmSelector) locatorList.push(`(By.CSS_SELECTOR, '${llmSelector}')`);
    }

    const cssLocators = [];
    if (s.id) cssLocators.push(`(By.ID, '${s.id}')`);
    if (s.name) cssLocators.push(`(By.NAME, '${s.name}')`);

    const xpathLocators = [];
    if (s.xpathText) xpathLocators.push(`(By.XPATH, '${s.xpathText}')`);
    if (s.fullXpath && !settings.excludeXpath) {
        xpathLocators.push(`(By.XPATH, '${s.fullXpath}')`);
    }

    if (settings.locatorStrategy === 'css') {
        locatorList.push(...cssLocators);
    } else if (settings.locatorStrategy === 'xpath') {
        locatorList.push(...xpathLocators);
    } else {
        locatorList.push(...cssLocators, ...xpathLocators);
    }

    return [...new Set(locatorList)];
}

function sanitizeForFunctionName(name) {
    if (!name) return 'test_unnamed_scenario';
    const sanitized = name
        .trim()
        .toLowerCase()
        // Заменяем пробелы и несколько подчеркиваний на одно
        .replace(/\s+|_/g, '_')
        // Удаляем все символы, которые не являются буквами, цифрами или _
        .replace(/[^a-z0-9_]/g, '');
    return `test_${sanitized}`;
}
