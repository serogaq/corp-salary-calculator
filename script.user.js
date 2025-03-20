// ==UserScript==
// @name             QSOFT Corp salary calculator
// @namespace        https://github.com/serogaq/corp-salary-calculator
// @version          1.0.0
// @description      Удобный помощник для расчета часов, ставки, переработок, ежемесячных выплат 10-го и 25-го числа каждого месяца
// @author           serogaq
// @match            *://www.corp.qsoft.ru/*
// @match            *://corp.qsoft.ru/*
// @grant            GM_getValue
// @grant            GM_setValue
// @grant            GM_listValues
// @updateURL        https://raw.githubusercontent.com/serogaq/corp-salary-calculator/master/script.user.js
// @downloadURL      https://raw.githubusercontent.com/serogaq/corp-salary-calculator/master/script.user.js
// @supportURL       https://github.com/serogaq/corp-salary-calculator/issues
// @homepageURL      https://github.com/serogaq/corp-salary-calculator
// @connect          api.currencybeacon.com
// ==/UserScript==

(function() {
    'use strict';

    const urlRegexp = /^http(s)?:\/\/(www\.corp|corp)\.qsoft\.ru\/bitrix\/admin\/myhours\.php/;
    if (!urlRegexp.test(window.location.href)) {
        return;
    }

    if (document.body.textContent === 'В работе портала обнаружены трудности. В ближайшее время работоспособность будет восстановлена. Обратитесь к менеджеру проектного офиса.') {
        window.location.href = '/bitrix/admin/myhours.php';
        return;
    }

    function loadVue() {
        return new Promise((resolve, reject) => {
            if (window.Vue) {
                resolve(window.Vue);
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://unpkg.com/vue@3/dist/vue.global.prod.js';
            script.async = true;
            script.crossOrigin = 'anonymous';

            script.setAttribute('fetchpriority', 'high');
            script.setAttribute('referrerpolicy', 'no-referrer');

            script.onload = () => resolve(window.Vue);
            script.onerror = () => reject(new Error('Failed to load Vue'));

            document.head.appendChild(script);
        });
    }

    function loadStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .salary-calculator {
                font-family: Arial, sans-serif;
                margin: 20px 0;
                padding: 15px;
                border-radius: 8px;
                background-color: #f9f9f9;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }

            .salary-calculator input {
                padding: 6px 8px;
                border: 1px solid #ccc;
                border-radius: 4px;
                margin: 0 5px;
            }

            .salary-calculator button {
                background-color: #4a76a8;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px 15px;
                cursor: pointer;
                transition: background-color 0.2s;
                margin-top: 10px;
            }

            .salary-calculator button:hover {
                background-color: #3a5c85;
            }

            .salary-calculator .info-block {
                margin: 15px 0;
                padding: 10px;
                background-color: #fff;
                border-radius: 4px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            }

            .salary-calculator .field-row {
                margin-bottom: 10px;
                display: flex;
                align-items: center;
            }

            .salary-calculator .field-label {
                min-width: 250px;
            }

            /* Modal styles */
            .modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
            }

            .modal-content {
                background-color: white;
                padding: 20px;
                border-radius: 8px;
                width: 500px;
                max-width: 90%;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            }

            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
                padding-bottom: 10px;
                border-bottom: 1px solid #eee;
            }

            .modal-close {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                color: #666;
            }

            .modal-footer {
                margin-top: 20px;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }

            .field-row {
                margin-top: 10px;
            }

            .fade-enter-active, .fade-leave-active {
                transition: opacity 0.3s;
            }
            .fade-enter-from, .fade-leave-to {
                opacity: 0;
            }
        `;
        document.head.appendChild(style);
    }

    const storage = {
        get(key, defaultValue) {
            try {
                return GM_getValue(key, defaultValue);
            } catch (e) {
                console.error('Error getting value:', e);
                return defaultValue;
            }
        },

        set(key, value) {
            try {
                GM_setValue(key, value);
            } catch (e) {
                console.error('Error setting value:', e);
            }
        },

        listKeys() {
            try {
                return GM_listValues();
            } catch (e) {
                console.error('Error listing values:', e);
                return [];
            }
        }
    };

    // Helper functions for date and time manipulation
    const helpers = {
        months: {
            nominative: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
            prepositional: ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'],
            genitive: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
        },

        formatTime(date) {
            const hours = date.getHours();
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        },

        formatDate(date) {
            return `${date.getDate()} ${this.months.genitive[date.getMonth()]}`;
        }
    };

    const dataParser = {
        getSelectedMonth() {
            const monthSelect = document.getElementById('month');
            return parseInt(monthSelect.selectedIndex) - 1;
        },

        getCurrentMonth() {
            return new Date().getMonth();
        },

        getCurrentDate() {
            return new Date().getDate();
        },

        getExpectedHours() {
            const corpTableContainer = document.getElementsByClassName('qsoft_base_table')[1];
            const corpExpectedTotalHoursTd = corpTableContainer.children[1].children[3].children[this.getSelectedMonth()];
            return parseInt(corpExpectedTotalHoursTd.textContent);
        },

        getTotalHours() {
            const corpTableContainer = document.getElementById('qsoft_base_table_right');
            const corpTotalHours = corpTableContainer.children[0].children[0].children[1].children;
            const corpTotalHoursTd = corpTotalHours[corpTotalHours.length - 1];

            const hoursParts = corpTotalHoursTd.textContent.split(':');
            const hours = parseInt(hoursParts[0]);
            const minutes = parseInt(hoursParts[1]);

            return hours + (minutes / 60);
        },

        getDailyHours() {
            const hoursContainer = document.getElementById('qsoft_base_table_right');
            const daysTdCollection = hoursContainer.children[0].children[0].children[0].children;
            const hoursTdCollection = hoursContainer.children[0].children[0].children[1].children;

            const timeData = [];

            for (let i = 0; i < hoursTdCollection.length; i++) {
                const dayTdEl = daysTdCollection[i];
                const hourTdEl = hoursTdCollection[i];

                if (isNaN(parseInt(dayTdEl.textContent)) || isNaN(parseInt(hourTdEl.textContent.split(':')[0]))) {
                    continue;
                }

                timeData.push({
                    day: parseInt(dayTdEl.textContent),
                    hour: parseInt(hourTdEl.textContent.split(':')[0]),
                    minute: parseInt(hourTdEl.textContent.split(':')[1])
                });
            }

            return timeData;
        }
    };

    async function initApp() {
        try {
            await loadVue();
            loadStyles();

            const { createApp, ref, computed, reactive, watch, onMounted } = Vue;

            const appTemplate = `
                <div class="salary-calculator">
                    <h3>Калькулятор зарплаты</h3>

                    <div class="info-block">
                        <div>Общее количество часов за {{ monthName.nominative }}: {{ totalWorkHours }} / {{ expectedHours }} [{{ hoursPercentage }}%]</div>
                        <div>Ставка за час в {{ monthName.prepositional }}: {{ hourlyRate }} руб.
                            <span v-if="settings.usdToRubRate > 0"> | ~{{ hourlyRateUsd }} USD</span>
                        </div>
                        <div>Заработано в {{ monthName.prepositional }}: {{ earnedAmount }} руб.
                            <span v-if="overtimeAmount > 0"> + {{ overtimeAmount }} руб. за переработки | Всего {{ totalEarned }} руб.</span>
                            <span v-if="settings.usdToRubRate > 0"> | ~{{ totalEarnedUsd }} USD</span>
                        </div>
                        <div>
                            {{ paymentText.first }}
                        </div>
                        <div>
                            {{ paymentText.second }}
                        </div>
                    </div>

                    <button @click="openSettings">Настройки</button>

                    <teleport to="body">
                        <transition name="fade">
                            <div v-if="showSettingsModal" class="modal-backdrop" @click.self="closeSettings">
                                <div class="modal-content">
                                    <div class="modal-header">
                                        <h3>Настройки калькулятора зарплаты</h3>
                                        <button class="modal-close" @click="closeSettings">×</button>
                                    </div>

                                    <div class="field-row">
                                        <div class="field-label">Ваша зарплата:</div>
                                        <input type="number" v-model="settings.salary" min="10000" max="600000" />
                                        <span> руб.</span>
                                    </div>

                                    <div class="field-row">
                                        <div class="field-label">Переработок в первой половине {{ monthName.genitive }}:</div>
                                        <input type="number" v-model="overtime.first" min="0" max="75" />
                                        <span> ч.</span>
                                    </div>

                                    <div class="field-row">
                                        <div class="field-label">Переработок во второй половине {{ monthName.genitive }}:</div>
                                        <input type="number" v-model="overtime.second" min="0" max="75" />
                                        <span> ч.</span>
                                    </div>

                                    <div class="field-row" v-if="overtime.first > 0 || overtime.second > 0">
                                        <div class="field-label">Коэффициент за переработки:</div>
                                        <input type="number" v-model="settings.overtimeRate" min="1" max="5" step="0.1" />
                                    </div>

                                    <div class="field-row">
                                        <div class="field-label">Курс доллара к рублю:</div>
                                        <input type="number" v-model="settings.usdToRubRate" min="0" max="200" step="0.01" style="width: 80px" />
                                        <span v-if="settings.currencybeacon_updatedAt > 0">
                                            (последнее обновление {{ lastUpdateDate }} в {{ lastUpdateTime }})
                                        </span>
                                    </div>

                                    <div class="field-row">
                                        <div class="field-label">
                                            <a href="https://currencybeacon.com" target="_blank">Currencybeacon</a> ApiKey:
                                        </div>
                                        <input type="text" v-model="settings.currencybeacon_apikey" maxlength="32" style="width: 240px" />
                                    </div>

                                    <div class="modal-footer">
                                        <button @click="updateCurrencyRate" v-if="settings.currencybeacon_apikey">Обновить курс валют</button>
                                        <button @click="saveSettings">Сохранить</button>
                                    </div>
                                </div>
                            </div>
                        </transition>
                    </teleport>
                </div>
            `;

            const app = createApp({
                template: appTemplate,

                setup() {
                    const currentMonth = dataParser.getCurrentMonth();
                    const selectedMonth = dataParser.getSelectedMonth();
                    const currentDate = dataParser.getCurrentDate();

                    const dailyHoursData = dataParser.getDailyHours();
                    const totalWorkedHours = dataParser.getTotalHours();
                    const expectedHours = dataParser.getExpectedHours();

                    const settings = reactive({
                        salary: storage.get('salary', 0),
                        overtimeRate: storage.get('overtimeRate', 2),
                        usdToRubRate: storage.get('usdToRubRate', 0),
                        currencybeacon_apikey: storage.get('currencybeacon_apikey', ''),
                        currencybeacon_updatedAt: storage.get('currencybeacon_updatedAt', 0)
                    });

                    const storedOvertime = JSON.parse(storage.get('overtime', '{"first":{},"second":{}}'));

                    const overtime = reactive({
                        first: storedOvertime.first[selectedMonth] || 0,
                        second: storedOvertime.second[selectedMonth] || 0
                    });

                    const showSettingsModal = ref(false);

                    const monthName = computed(() => {
                        return {
                            nominative: helpers.months.nominative[selectedMonth],
                            prepositional: helpers.months.prepositional[selectedMonth],
                            genitive: helpers.months.genitive[selectedMonth]
                        };
                    });

                    // Calculate total work hours (excluding overtime)
                    const totalWorkHours = computed(() => {
                        return Math.floor(totalWorkedHours - (overtime.first + overtime.second));
                    });

                    // Calculate percentage of worked hours
                    const hoursPercentage = computed(() => {
                        return Math.round((totalWorkHours.value / expectedHours) * 100);
                    });

                    // Calculate hourly rate
                    const hourlyRate = computed(() => {
                        return (settings.salary / expectedHours).toFixed(2);
                    });

                    // Calculate hourly rate in USD
                    const hourlyRateUsd = computed(() => {
                        if (settings.usdToRubRate <= 0) return 0;
                        return (hourlyRate.value / settings.usdToRubRate).toFixed(2);
                    });

                    // Calculate earned amount (without overtime)
                    const earnedAmount = computed(() => {
                        return Math.round(hourlyRate.value * totalWorkHours.value);
                    });

                    // Calculate overtime amount
                    const overtimeAmount = computed(() => {
                        const totalOvertimeHours = overtime.first + overtime.second;
                        if (totalOvertimeHours === 0) return 0;
                        return Math.round(totalOvertimeHours * hourlyRate.value * settings.overtimeRate);
                    });

                    // Calculate total earned amount (with overtime)
                    const totalEarned = computed(() => {
                        return earnedAmount.value + overtimeAmount.value;
                    });

                    // Calculate total earned in USD
                    const totalEarnedUsd = computed(() => {
                        if (settings.usdToRubRate <= 0) return 0;
                        return (totalEarned.value / settings.usdToRubRate).toFixed(2);
                    });

                    // Format the date of the last currency update
                    const lastUpdateDate = computed(() => {
                        if (settings.currencybeacon_updatedAt === 0) return '';
                        const date = new Date(settings.currencybeacon_updatedAt);
                        return helpers.formatDate(date);
                    });

                    // Format the time of the last currency update
                    const lastUpdateTime = computed(() => {
                        if (settings.currencybeacon_updatedAt === 0) return '';
                        const date = new Date(settings.currencybeacon_updatedAt);
                        return helpers.formatTime(date);
                    });

                    // Calculate payment dates and amounts text
                    const paymentText = computed(() => {
                        // Calculate payment amounts based on daily hours
                        let firstHalfHours = 0;
                        let firstHalfMinutes = 0;
                        let secondHalfHours = 0;
                        let secondHalfMinutes = 0;
                        let overHours = 0;
                        let overMinutes = 0;

                        dailyHoursData.forEach(data => {
                            const { day, hour, minute } = data;

                            if (day <= 15) {
                                if (hour > 8) {
                                    firstHalfHours += 8;
                                    overHours += hour - 8;
                                    overMinutes += minute;
                                } else if (hour === 8) {
                                    firstHalfHours += hour;
                                    overMinutes += minute;
                                } else {
                                    firstHalfHours += hour;
                                    firstHalfMinutes += minute;
                                }
                            } else {
                                if (hour > 8) {
                                    secondHalfHours += 8;
                                    overHours += hour - 8;
                                    overMinutes += minute;
                                } else if (hour === 8) {
                                    secondHalfHours += hour;
                                    overMinutes += minute;
                                } else {
                                    secondHalfHours += hour;
                                    secondHalfMinutes += minute;
                                }
                            }
                        });

                        overHours += Math.floor(overMinutes / 60);
                        firstHalfHours += Math.floor(firstHalfMinutes / 60) - overtime.first;
                        secondHalfHours += Math.floor(secondHalfMinutes / 60) + overHours - overtime.second;

                        let payableOn25 = Math.round(firstHalfHours * hourlyRate.value) + 1;
                        if (payableOn25 === 1) {
                            payableOn25 = 0;
                        }
                        const payableOn10 = Math.round(secondHalfHours * hourlyRate.value);

                        let firstPaymentText = '';
                        let secondPaymentText = '';
                        const nextMonth = (selectedMonth + 1) % 12;

                        if (currentMonth === selectedMonth && currentDate <= 25) {
                            firstPaymentText = `К выплате 25-го ${helpers.months.genitive[selectedMonth]}: ~${payableOn25} руб.`;
                        } else {
                            firstPaymentText = `Выплачено 25-го ${helpers.months.genitive[selectedMonth]}: ~${payableOn25} руб.`;
                        }

                        if (currentMonth > selectedMonth + 1 || (currentMonth === 0 && selectedMonth === 11)) {
                            secondPaymentText = `Выплачено 10-го ${helpers.months.genitive[nextMonth]}: ~${payableOn10 + overtimeAmount.value} руб.`;
                        } else if (currentMonth === selectedMonth + 1 && currentDate >= 10) {
                            secondPaymentText = `Выплачено 10-го ${helpers.months.genitive[nextMonth]}: ~${payableOn10 + overtimeAmount.value} руб.`;
                        } else {
                            secondPaymentText = `К выплате 10-го ${helpers.months.genitive[nextMonth]}: ~${payableOn10 + overtimeAmount.value} руб.`;
                        }

                        return {
                            first: firstPaymentText,
                            second: secondPaymentText
                        };
                    });

                    async function updateCurrencyRate() {
                        if (!settings.currencybeacon_apikey) {
                            alert('Необходимо ввести API ключ Currencybeacon');
                            return;
                        }

                        try {
                            const response = await fetch(
                                `https://api.currencybeacon.com/v1/latest?api_key=${settings.currencybeacon_apikey}`,
                                { headers: { accept: 'application/json' }, method: 'GET' }
                            );

                            if (response.ok) {
                                const data = await response.json();
                                const rate = data.rates.RUB;
                                settings.usdToRubRate = parseFloat(rate);
                                settings.currencybeacon_updatedAt = new Date().getTime();
                                saveSettings();
                            } else {
                                alert('Ошибка при получении курса валют. Проверьте API ключ.');
                            }
                        } catch (error) {
                            console.error('Currency update error:', error);
                            alert('Ошибка при обновлении курса валют');
                        }
                    }

                    function checkCurrencyRateAutoUpdate() {
                        const hoursMs = 8 * 60 * 60 * 1000; // 8h
                        const currentTime = new Date().getTime();

                        if (
                            settings.currencybeacon_apikey &&
                            (currentTime - settings.currencybeacon_updatedAt > hoursMs)
                        ) {
                            updateCurrencyRate();
                        }
                    }

                    function openSettings() {
                        showSettingsModal.value = true;
                    }

                    function closeSettings() {
                        showSettingsModal.value = false;
                    }

                    function saveSettings() {
                        storage.set('salary', settings.salary);
                        storage.set('overtimeRate', settings.overtimeRate);
                        storage.set('usdToRubRate', settings.usdToRubRate);
                        storage.set('currencybeacon_apikey', settings.currencybeacon_apikey);
                        storage.set('currencybeacon_updatedAt', settings.currencybeacon_updatedAt);

                        const storedOvertime = JSON.parse(storage.get('overtime', '{"first":{},"second":{}}'));
                        storedOvertime.first[selectedMonth] = parseInt(overtime.first);
                        storedOvertime.second[selectedMonth] = parseInt(overtime.second);
                        storage.set('overtime', JSON.stringify(storedOvertime));

                        closeSettings();
                    }

                    onMounted(() => {
                        checkCurrencyRateAutoUpdate();
                    });

                    return {
                        settings,
                        overtime,
                        showSettingsModal,
                        monthName,
                        expectedHours,
                        totalWorkHours,
                        hoursPercentage,
                        hourlyRate,
                        hourlyRateUsd,
                        earnedAmount,
                        overtimeAmount,
                        totalEarned,
                        totalEarnedUsd,
                        lastUpdateDate,
                        lastUpdateTime,
                        paymentText,
                        openSettings,
                        closeSettings,
                        saveSettings,
                        updateCurrencyRate
                    };
                }
            });

            const container = document.createElement('div');
            container.id = 'salary-calculator-app';

            const targetElement = document.querySelector('.qsoft_tmpl_work_area');
            if (targetElement) {
                targetElement.appendChild(document.createElement('br'));
                targetElement.appendChild(document.createElement('br'));
                targetElement.appendChild(container);

                app.mount('#salary-calculator-app');
            }
        } catch (error) {
            console.error('Error initializing app:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})();