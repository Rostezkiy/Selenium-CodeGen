document.addEventListener('DOMContentLoaded', () => {
    // --- ОБЪЯВЛЕНИЕ КОНСТАНТ ЭЛЕМЕНТОВ ---

    // Основные контролы
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const copyBtn = document.getElementById('copyBtn');
    const moreActionsBtn = document.getElementById('more-actions-btn');

    // Элементы в выпадающем меню
    const moreActionsDropdown = document.getElementById('more-actions-dropdown');
    const addAssertBtn = document.getElementById('addAssertBtn');
    const addIfBtn = document.getElementById('addIfBtn');
    const exportBtn = document.getElementById('exportBtn');
    const importInput = document.getElementById('importInput');
    const clearBtn = document.getElementById('clearBtn');

    // Контролы для условных блоков
    const conditionalControls = document.getElementById('conditional-controls');
    const conditionalContextLabel = document.getElementById('conditional-context-label');
    const addElseBtn = document.getElementById('addElseBtn');
    const endBlockBtn = document.getElementById('endBlockBtn');

    // Список шагов, заглушка и настройки
    const stepsList = document.getElementById('steps-list');
    const emptyState = document.getElementById('empty-state');
    const pageNameInput = document.getElementById('page-name-input');
    const generatePomCheckbox = document.getElementById('generate-pom-checkbox');
    const generateTestCheckbox = document.getElementById('generate-test-checkbox');
    const generateBasePageCheckbox = document.getElementById('generate-basepage-checkbox');
    const toast = document.getElementById('toast-notification');

    // Переменные
    const environmentSelect = document.getElementById('environment-select');
    const variablesList = document.getElementById('variables-list');
    const addVariableBtn = document.getElementById('add-variable-btn');
    const editVariableSelect = document.getElementById('edit-variable-select');

    // Модальное окно
    const modal = document.getElementById('edit-modal');
    const stepIdInput = document.getElementById('edit-step-id');
    const stepNameInput = document.getElementById('edit-step-name');
    const locatorsTextarea = document.getElementById('edit-locators');
    const reselectElementBtn = document.getElementById('reselect-element-btn');
    const variableInput = document.getElementById('edit-variable');
    const valueGroup = document.getElementById('edit-value-group');
    const valueInput = document.getElementById('edit-value');
    const cssClassGroup = document.getElementById('edit-css-class-group');
    const cssClassInput = document.getElementById('edit-css-class');
    const attributeGroup = document.getElementById('edit-attribute-group');
    const attributeNameInput = document.getElementById('edit-attribute-name');
    const attributeValueInput = document.getElementById('edit-attribute-value');
    const saveEditBtn = document.getElementById('save-edit-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    // НОВЫЕ ЭЛЕМЕНТЫ УПРАВЛЕНИЯ
    const collectionSelect = document.getElementById('collection-select');
    const renameCollectionBtn = document.getElementById('rename-collection-btn');
    const deleteCollectionBtn = document.getElementById('delete-collection-btn');
    const addNewCollectionBtn = document.getElementById('add-new-collection-btn');
    const testCaseSelect = document.getElementById('test-case-select');
    const renameTestCaseBtn = document.getElementById('rename-test-case-btn');
    const deleteTestCaseBtn = document.getElementById('delete-test-case-btn');
    const addNewTestCaseBtn = document.getElementById('add-new-test-case-btn');


    // Кэш и состояние
    let fullStateCache = {};
    let currentlyEditingStep = null;
    const settingsKey = 'autotestProCheckboxSettings';

    // --- ФУНКЦИИ-ПОМОЩНИКИ ---
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }

    function saveCheckboxStates() {
        const settings = {
            generatePom: generatePomCheckbox.checked,
            generateTest: generateTestCheckbox.checked,
            generateBasePage: generateBasePageCheckbox.checked,
        };
        chrome.storage.local.set({[settingsKey]: settings});
    }

    function loadCheckboxStates() {
        chrome.storage.local.get({
            [settingsKey]: {
                generatePom: true, generateTest: true, generateBasePage: true,
            }
        }, (result) => {
            const settings = result[settingsKey];
            generatePomCheckbox.checked = settings.generatePom;
            generateTestCheckbox.checked = settings.generateTest;
            generateBasePageCheckbox.checked = settings.generateBasePage;
        });
    }

    // --- ОБРАБОТЧИКИ СОБЫТИЙ ---

    // Управление коллекциями и тестами
    collectionSelect.addEventListener('change', (e) => chrome.runtime.sendMessage({
        command: 'switch_collection',
        id: e.target.value
    }));
    testCaseSelect.addEventListener('change', (e) => chrome.runtime.sendMessage({
        command: 'switch_test_case',
        id: e.target.value
    }));

    renameCollectionBtn.addEventListener('click', () => {
        const selectedId = collectionSelect.value;
        const currentName = collectionSelect.options[collectionSelect.selectedIndex].text;
        const newName = prompt('Введите новое имя для КОЛЛЕКЦИИ:', currentName);
        if (newName && newName.trim() && newName.trim() !== currentName) {
            chrome.runtime.sendMessage({command: 'rename_collection', id: selectedId, newName: newName.trim()});
        }
    });

    deleteCollectionBtn.addEventListener('click', () => {
        const selectedId = collectionSelect.value;
        if (confirm(`ВНИМАНИЕ! Вы уверены, что хотите удалить коллекцию "${collectionSelect.options[collectionSelect.selectedIndex].text}" и ВСЕ тесты в ней?`)) {
            chrome.runtime.sendMessage({command: 'delete_collection', id: selectedId});
        }
    });

    renameTestCaseBtn.addEventListener('click', () => {
        const selectedId = testCaseSelect.value;
        if (!selectedId || testCaseSelect.options[0]?.disabled) return;
        const currentName = testCaseSelect.options[testCaseSelect.selectedIndex].text;
        const newName = prompt('Введите новое имя для ТЕСТА:', currentName);
        if (newName && newName.trim() && newName.trim() !== currentName) {
            chrome.runtime.sendMessage({command: 'rename_test_case', id: selectedId, newName: newName.trim()});
        }
    });

    deleteTestCaseBtn.addEventListener('click', () => {
        const selectedId = testCaseSelect.value;
        if (!selectedId || testCaseSelect.options[0]?.disabled) return;
        if (confirm(`Вы уверены, что хотите удалить тест "${testCaseSelect.options[testCaseSelect.selectedIndex].text}"?`)) {
            chrome.runtime.sendMessage({command: 'delete_test_case', id: selectedId});
        }
    });

    // НОВАЯ ЛОГИКА ДЛЯ ДИНАМИЧЕСКОГО СОЗДАНИЯ
    function handleAddNew(e) {
        const type = e.target.dataset.type; // 'collection' или 'test-case'
        const parentRow = e.target.parentElement;
        const originalContent = Array.from(parentRow.children); // Сохраняем оригинальные кнопки

        // Очищаем ряд
        parentRow.innerHTML = '';

        // Создаем новые элементы
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = type === 'collection' ? 'Имя новой коллекции' : 'Имя нового теста';
        input.className = 'temp-input';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = '✔️';
        saveBtn.className = 'temp-btn save-btn';
        saveBtn.title = 'Сохранить';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '❌';
        cancelBtn.className = 'temp-btn cancel-btn';
        cancelBtn.title = 'Отмена';

        const restoreUI = () => {
            parentRow.innerHTML = '';
            originalContent.forEach(el => parentRow.appendChild(el));
        };

        saveBtn.addEventListener('click', () => {
            const name = input.value.trim();
            if (name) {
                const command = type === 'collection' ? 'create_collection' : 'create_test_case';
                chrome.runtime.sendMessage({command, name});
            }
            restoreUI();
        });

        cancelBtn.addEventListener('click', restoreUI);

        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') saveBtn.click();
            if (ev.key === 'Escape') cancelBtn.click();
        });

        parentRow.appendChild(input);
        parentRow.appendChild(saveBtn);
        parentRow.appendChild(cancelBtn);
        input.focus();
    }

    addNewCollectionBtn.addEventListener('click', handleAddNew);
    addNewTestCaseBtn.addEventListener('click', handleAddNew);

    pageNameInput.addEventListener('change', () => chrome.runtime.sendMessage({
        command: 'update_page_name',
        pageName: pageNameInput.value
    }));

    startBtn.addEventListener('click', () => {
        const pageName = pageNameInput.value.trim() || 'MyPage';
        chrome.runtime.sendMessage({command: 'start', pageName});
    });

    stopBtn.addEventListener('click', () => chrome.runtime.sendMessage({command: 'stop'}));

    copyBtn.addEventListener('click', () => {
        const generatePom = generatePomCheckbox.checked;
        const generateTest = generateTestCheckbox.checked;
        const generateBasePage = generateBasePageCheckbox.checked;
        chrome.runtime.sendMessage({
            command: 'generate_full_code',
            generatePom,
            generateTest,
            generateBasePage
        }, (response) => {
            if (response && response.code) {
                navigator.clipboard.writeText(response.code);
                showToast('✅ Код сгенерирован и скопирован!');
            } else if (response && response.error) {
                showToast(`⚠️ Ошибка: ${response.error}`);
            } else {
                showToast('⚠️ Нечего копировать или произошла неизвестная ошибка.');
            }
        });
    });

    moreActionsBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        moreActionsDropdown.classList.toggle('show');
    });

    window.addEventListener('click', (event) => {
        if (!moreActionsBtn.contains(event.target)) {
            moreActionsDropdown.classList.remove('show');
        }
    });

    addAssertBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({command: 'enter_assert_mode'});
        addAssertBtn.textContent = '...Выберите элемент';
        addAssertBtn.disabled = true;
        moreActionsDropdown.classList.remove('show');
    });

    addIfBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({command: 'start_if_block'});
        addIfBtn.textContent = '...Выберите условие';
        addIfBtn.disabled = true;
        moreActionsDropdown.classList.remove('show');
    });

    exportBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({command: 'get_full_state'}, (response) => {
            if (response && response.state) {
                const stateJson = JSON.stringify(response.state, null, 2);
                const blob = new Blob([stateJson], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const collectionName = response.state.collections[response.state.activeCollectionId]?.name || 'collection';
                const testCaseName = response.state.testCases[response.state.activeTestCaseId]?.name || 'test_case';
                chrome.downloads.download({
                    url: url,
                    filename: `${collectionName}_${testCaseName}.json`
                }, () => showToast('✅ Сценарий экспортирован'));
            }
        });
        moreActionsDropdown.classList.remove('show');
    });

    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedState = JSON.parse(event.target.result);
                // Простая проверка на наличие ключевого поля
                if (importedState && typeof importedState.collections !== 'undefined') {
                    chrome.runtime.sendMessage({command: 'import_state', state: importedState});
                    showToast('✅ Сценарий успешно импортирован');
                } else {
                    alert('Ошибка: Неверный формат файла JSON.');
                }
            } catch (error) {
                alert('Ошибка: Не удалось прочитать файл JSON.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
        moreActionsDropdown.classList.remove('show');
    });

    clearBtn.addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите удалить все шаги?')) {
            chrome.runtime.sendMessage({command: 'clear_steps'});
        }
        moreActionsDropdown.classList.remove('show');
    });

    addElseBtn.addEventListener('click', () => chrome.runtime.sendMessage({command: 'switch_to_else_block'}));
    endBlockBtn.addEventListener('click', () => chrome.runtime.sendMessage({command: 'end_if_block'}));

    // Обработчики переменных (без изменений)
    environmentSelect.addEventListener('change', (e) => {
        chrome.runtime.sendMessage({command: 'set_active_environment', env: e.target.value}, () => {
            chrome.runtime.sendMessage({command: 'get_current_state'});
        });
    });
    addVariableBtn.addEventListener('click', () => renderVariableItem({name: '', value: ''}));
    variablesList.addEventListener('change', (e) => {
        if (e.target.matches('.variable-name-input, .variable-value-input')) saveVariables();
    });
    variablesList.addEventListener('click', (e) => {
        const target = e.target.closest('.delete-variable-btn');
        if (target) {
            target.closest('.variable-item').remove();
            saveVariables();
        }
    });

    // --- ОБРАБОТЧИКИ СПИСКА ШАГОВ (КЛИКИ И ПОДСВЕТКА) ---
    stepsList.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const stepId = target.dataset.id;
        if (target.classList.contains('delete-btn')) {
            chrome.runtime.sendMessage({command: 'delete_step', id: stepId});
        }
        if (target.classList.contains('edit-btn')) {
            chrome.runtime.sendMessage({command: 'get_step_data', id: stepId}, (response) => {
                if (response && response.step) openEditModal(response.step);
            });
        }
    });

    stepsList.addEventListener('mouseover', (e) => {
        const target = e.target.closest('.step-item');
        if (!target) return;
        if (!fullStateCache?.testCases?.[fullStateCache.activeTestCaseId]) return;
        const activeTestCase = fullStateCache.testCases[fullStateCache.activeTestCaseId];
        if (!activeTestCase?.recordedSteps) return;

        const stepId = Number(target.dataset.id);

        // Рекурсивный поиск шага
        function findStep(steps, id) {
            for (const step of steps) {
                if (step.id === id) return step;
                if (step.type === 'conditional') {
                    const found = findStep(step.then_steps, id) || findStep(step.else_steps, id);
                    if (found) return found;
                }
            }
            return null;
        }

        const step = findStep(activeTestCase.recordedSteps, stepId);

        if (step && step.data && step.data.selectors) {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs[0] && tabs[0].id) {
                    chrome.tabs.sendMessage(tabs[0].id, {command: 'highlight_element', selectors: step.data.selectors});
                }
            });
        }
    });

    stepsList.addEventListener('mouseout', () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, {command: 'remove_highlight'});
            }
        });
    });

    // --- ФУНКЦИИ МОДАЛЬНОГО ОКНА ---
    function openEditModal(step) {
        currentlyEditingStep = step;
        stepIdInput.value = step.id;
        stepNameInput.value = step.allureStep;
        locatorsTextarea.value = step.locators.join(',\n');
        variableInput.value = step.variableName || '';

        valueGroup.style.display = 'none';
        cssClassGroup.style.display = 'none';
        attributeGroup.style.display = 'none';

        const activeEnvVariables = fullStateCache.environments[fullStateCache.activeEnvironment] || {};
        editVariableSelect.innerHTML = '<option value="">-- Использовать переменную --</option>';
        Object.keys(activeEnvVariables).forEach(varName => {
            const option = document.createElement('option');
            option.value = varName;
            option.textContent = varName;
            editVariableSelect.appendChild(option);
        });

        if (step.type === 'input' || step.subType === 'assertTextEquals' || step.subType === 'assertValueEquals') {
            valueGroup.style.display = 'block';
            if (step.variableForValue) {
                editVariableSelect.value = step.variableForValue;
                valueInput.value = `Используется: ${step.variableForValue}`;
                valueInput.disabled = true;
            } else {
                editVariableSelect.value = '';
                valueInput.value = (step.type === 'input' ? step.data.value : step.expectedText || step.expectedValue) || '';
                valueInput.disabled = false;
            }
        } else if (step.subType === 'assertHasCssClass') {
            cssClassInput.value = step.expectedCssClass || '';
            cssClassGroup.style.display = 'block';
        } else if (step.subType === 'assertAttribute') {
            attributeNameInput.value = step.expectedAttributeName || '';
            attributeValueInput.value = step.expectedAttributeValue || '';
            attributeGroup.style.display = 'block';
        }
        modal.style.display = 'block';
    }

    editVariableSelect.addEventListener('change', (e) => {
        valueInput.disabled = !!e.target.value;
        valueInput.value = e.target.value ? `Используется: ${e.target.value}` : '';
    });

    reselectElementBtn.addEventListener('click', () => {
        if (currentlyEditingStep) {
            chrome.runtime.sendMessage({command: 'reselect_element', stepId: currentlyEditingStep.id});
        }
    });

    function closeEditModal() {
        modal.style.display = 'none';
        currentlyEditingStep = null;
    }

    cancelEditBtn.addEventListener('click', closeEditModal);

    saveEditBtn.addEventListener('click', () => {
        if (!currentlyEditingStep) return;
        const updatedData = {
            id: stepIdInput.value,
            allureStep: stepNameInput.value,
            locators: locatorsTextarea.value.split(',\n').map(s => s.trim()).filter(Boolean),
            variableName: variableInput.value.trim() || null,
            variableForValue: editVariableSelect.value || null,
            value: null, expectedText: null, expectedValue: null,
            expectedCssClass: cssClassInput.value,
            expectedAttributeName: attributeNameInput.value,
            expectedAttributeValue: attributeValueInput.value
        };
        if (!updatedData.variableForValue) {
            if (currentlyEditingStep.type === 'input') updatedData.value = valueInput.value;
            else if (currentlyEditingStep.subType === 'assertTextEquals') updatedData.expectedText = valueInput.value;
            else if (currentlyEditingStep.subType === 'assertValueEquals') updatedData.expectedValue = valueInput.value;
        }
        chrome.runtime.sendMessage({command: 'update_step', data: updatedData});
        closeEditModal();
    });

    // --- ФУНКЦИИ РЕНДЕРИНГА И ВСПОМОГАТЕЛЬНЫЕ ---
    function saveVariables() {
        const variables = {};
        variablesList.querySelectorAll('.variable-item').forEach(item => {
            const nameInput = item.querySelector('.variable-name-input');
            const valueInput = item.querySelector('.variable-value-input');
            const name = nameInput.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
            nameInput.value = name;
            if (name) variables[name] = valueInput.value;
        });
        chrome.runtime.sendMessage({command: 'update_variables', variables});
    }

    function renderEnvironments(environments, activeEnv) {
        environmentSelect.innerHTML = '';
        for (const envName in environments) {
            const option = document.createElement('option');
            option.value = envName;
            option.textContent = envName;
            if (envName === activeEnv) option.selected = true;
            environmentSelect.appendChild(option);
        }
    }

    function renderVariables(variables) {
        variablesList.innerHTML = '';
        if (!variables) return;
        Object.entries(variables).forEach(([name, value]) => renderVariableItem({name, value}));
    }

    function renderVariableItem(variable) {
        const item = document.createElement('div');
        item.className = 'variable-item row';
        item.style.marginBottom = '5px';
        item.innerHTML = `
            <input type="text" class="variable-name-input" placeholder="Имя (BASE_URL)" value="${variable.name || ''}" style="flex-basis: 35%;">
            <input type="text" class="variable-value-input" placeholder="Значение" value="${variable.value || ''}" style="flex-basis: 65%;">
            <button class="delete-variable-btn" title="Удалить переменную" style="background: none; border: none; color: #dc3545; cursor: pointer; font-size: 18px; padding: 0 5px;">×</button>
        `;
        variablesList.appendChild(item);
    }

    // НОВАЯ ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ ИКОНКИ ШАГА
    function getIconForStep(step) {
        const iconMap = {
            'click': '🖱️', 'right_click': '🖱️', 'double_click': '🖱️',
            'input': '⌨️',
            'select': '👇',
            'hover': '👆',
            'getText': '📄',
            'waitVisible': '⏳', 'waitInvisible': '⌛', 'waitClickable': '⏳',
            'assertVisible': '✅', 'assertNotVisible': '❌', 'assertTextEquals': '🔤',
            'assertValueEquals': '🔢', 'assertHasCssClass': '🎨', 'assertAttribute': '📎',
            'assertIsClickable': '✅', 'assertIsNotClickable': '❌',
            'assertIsEnabled': '✅', 'assertIsDisabled': '❌',
            'switch_to_iframe': '🖼️',
            'switch_to_default_content': '🌍',
        };
        return `<span class="step-icon" title="${step.subType || step.type}">${iconMap[step.subType || step.type] || '▶️'}</span>`;
    }

    // ОБНОВЛЕННАЯ РЕКУРСИВНАЯ ФУНКЦИЯ РЕНДЕРИНГА
    function renderSteps(steps, container, indentLevel = 0) {
        if (indentLevel === 0) {
            container.innerHTML = '';
            if (!steps || steps.length === 0) {
                emptyState.style.display = 'flex';
                stepsList.style.display = 'none';
                return;
            }
            emptyState.style.display = 'none';
            stepsList.style.display = 'block';
        }

        steps.forEach(step => {
            if (step.type === 'conditional') {
                const ifItem = document.createElement('li');
                ifItem.className = 'step-item';
                ifItem.dataset.id = step.id;
                ifItem.style.paddingLeft = `${10 + indentLevel * 20}px`;
                ifItem.style.backgroundColor = '#e3f2fd';
                ifItem.innerHTML = `
                    <span class="step-icon">❓</span>
                    <span class="step-name"><b>IF:</b> <i>${step.condition.allureStep}</i></span>
                    <div class="step-actions">
                        <button class="delete-btn" data-id="${step.id}" title="Удалить блок">🗑️</button>
                    </div>`;
                container.appendChild(ifItem);

                renderSteps(step.then_steps, container, indentLevel + 1);

                if (step.else_steps && step.else_steps.length > 0) {
                    const elseItem = document.createElement('li');
                    elseItem.className = 'step-item';
                    elseItem.style.paddingLeft = `${10 + indentLevel * 20}px`;
                    elseItem.style.backgroundColor = '#fff3e0';
                    elseItem.innerHTML = `<span class="step-icon"></span><span class="step-name"><b>ELSE:</b></span>`;
                    container.appendChild(elseItem);
                    renderSteps(step.else_steps, container, indentLevel + 1);
                }
            } else {
                const item = document.createElement('li');
                item.className = 'step-item';
                item.dataset.id = step.id;
                item.style.paddingLeft = `${10 + indentLevel * 20}px`;

                let ddtMarker = step.variableName ? `<span style="color: #007bff; font-size: 12px; margin-left: 5px;">[stores as: <b>${step.variableName}</b>]</span>` : '';
                let stepText = step.allureStep || 'Без названия';
                stepText += ddtMarker;

                item.innerHTML = `
                    ${getIconForStep(step)}
                    <span class="step-name">${stepText}</span>
                    <div class="step-actions">
                        <button class="edit-btn" data-id="${step.id}" title="Редактировать">✏️</button>
                        <button class="delete-btn" data-id="${step.id}" title="Удалить">🗑️</button>
                    </div>`;
                container.appendChild(item);
            }
        });
    }

    function renderTestCases(allTestCases, activeCollectionId, activeTestCaseId) {
        testCaseSelect.innerHTML = '';
        const filteredTestCases = Object.values(allTestCases).filter(tc => tc.collectionId === activeCollectionId);
        if (filteredTestCases.length === 0) {
            testCaseSelect.innerHTML = '<option disabled>Нет тестов</option>';
            renameTestCaseBtn.disabled = true;
            deleteTestCaseBtn.disabled = true;
        } else {
            renameTestCaseBtn.disabled = false;
            deleteTestCaseBtn.disabled = false;
            filteredTestCases.forEach(tc => {
                const option = document.createElement('option');
                option.value = tc.id;
                option.textContent = tc.name;
                if (tc.id === activeTestCaseId) option.selected = true;
                testCaseSelect.appendChild(option);
            });
        }
    }

    function renderCollections(collections, activeId) {
        collectionSelect.innerHTML = '';
        const collectionIds = Object.keys(collections);
        if (collectionIds.length === 0) {
            collectionSelect.innerHTML = '<option disabled>Нет коллекций</option>';
            // Блокируем все управление
            [renameCollectionBtn, deleteCollectionBtn, addNewTestCaseBtn, testCaseSelect, renameTestCaseBtn, deleteTestCaseBtn].forEach(el => el.disabled = true);
        } else {
            [renameCollectionBtn, deleteCollectionBtn, addNewTestCaseBtn, testCaseSelect, renameTestCaseBtn, deleteTestCaseBtn].forEach(el => el.disabled = false);
            for (const id in collections) {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = collections[id].name;
                if (id === activeId) option.selected = true;
                collectionSelect.appendChild(option);
            }
        }
    }

    // --- ГЛАВНЫЙ СЛУШАТЕЛЬ СООБЩЕНИЙ ---
    chrome.runtime.onMessage.addListener((message) => {
        if (message.command === 'update_state') {
            const state = message.state;
            fullStateCache = state;

            const activeTestCase = state.testCases[state.activeTestCaseId];

            renderCollections(state.collections, state.activeCollectionId);
            renderTestCases(state.testCases, state.activeCollectionId, state.activeTestCaseId);
            renderSteps(activeTestCase ? activeTestCase.recordedSteps : [], stepsList);
            renderEnvironments(state.environments, state.activeEnvironment);
            renderVariables(state.environments[state.activeEnvironment]);

            pageNameInput.value = activeTestCase ? activeTestCase.pageClassName : 'MyPage';

            // --- НАЧАЛО ИЗМЕНЕННОГО БЛОКА ---
            // Эта логика теперь проверяет три состояния кнопки, а не два.

            if (state.isRecording) {
                // 1. Если запись активна
                startBtn.textContent = '...Запись';
                startBtn.style.backgroundColor = '#ffc107'; // Желтый
                startBtn.style.borderColor = '#e0a800';
            } else if (activeTestCase && activeTestCase.recordedSteps.length > 0) {
                // 2. Если запись остановлена, но шаги уже есть
                startBtn.textContent = '➕ Продолжить';
                startBtn.style.backgroundColor = '#17a2b8'; // Бирюзовый
                startBtn.style.borderColor = '#138496';
            } else {
                // 3. Если запись остановлена и шагов нет (чистый лист)
                startBtn.textContent = '▶️ Начать запись';
                startBtn.style.backgroundColor = '#28a745'; // Зеленый
                startBtn.style.borderColor = '#218838';
            }
            // --- КОНЕЦ ИЗМЕНЕННОГО БЛОКА ---

            if (!state.isAssertMode) {
                addAssertBtn.innerHTML = '🕵️ Добавить проверку';
                addAssertBtn.disabled = false;
            }
            if (!state.isRecordingIfCondition) {
                addIfBtn.innerHTML = '❓ Добавить IF';
                addIfBtn.disabled = !state.isRecording;
            }

            if (state.isRecordingInConditionalBlock) {
                conditionalControls.style.display = 'flex';
                conditionalContextLabel.textContent = state.conditionalRecordingContext.toUpperCase();
                addElseBtn.style.display = (state.conditionalRecordingContext === 'then') ? 'inline-flex' : 'none';
            } else {
                conditionalControls.style.display = 'none';
            }

            if (state.openModalForStepId) {
                // ВАЖНО: В оригинальном коде была небольшая ошибка. Поиск шага нужно делать
                // во вложенной структуре activeTestCase.recordedSteps, а не в state.recordedSteps.
                function findStepRecursive(steps, id) {
                    for (const step of steps) {
                        if (step.id === id) return step;
                        if (step.type === 'conditional') {
                            const found = findStepRecursive(step.then_steps, id) || findStepRecursive(step.else_steps, id);
                            if (found) return found;
                        }
                    }
                    return null;
                }

                const stepToEdit = activeTestCase ? findStepRecursive(activeTestCase.recordedSteps, state.openModalForStepId) : null;

                if (stepToEdit) openEditModal(stepToEdit);
                chrome.runtime.sendMessage({command: 'clear_modal_flag'});
            }
        }
    });

    // --- ИНИЦИАЛИЗАЦИЯ ---
    loadCheckboxStates();
    generatePomCheckbox.addEventListener('change', saveCheckboxStates);
    generateTestCheckbox.addEventListener('change', saveCheckboxStates);
    generateBasePageCheckbox.addEventListener('change', saveCheckboxStates);

    new Sortable(stepsList, {
        animation: 150,
        handle: '.step-item',
        onEnd: function (evt) {
            const newOrderIds = Array.from(evt.to.children).map(item => Number(item.dataset.id));
            chrome.runtime.sendMessage({command: 'reorder_steps', newOrder: newOrderIds});
        }
    });

    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.getAttribute('data-tab');
            tabLinks.forEach(item => item.classList.remove('active'));
            tabContents.forEach(item => item.classList.remove('active'));
            link.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    chrome.runtime.sendMessage({command: 'get_current_state'});
});