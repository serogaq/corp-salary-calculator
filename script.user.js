// ==UserScript==
// @name             QSOFT Corp salary calculator
// @namespace        https://github.com/serogaq/corp-salary-calculator
// @version          0.1
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

    const win = (unsafeWindow || window);

    const
        _Document = Object.getPrototypeOf(HTMLDocument.prototype),
        _Element = Object.getPrototypeOf(HTMLElement.prototype),
        _Node = Object.getPrototypeOf(_Element);

    const
        isChrome = !!window.chrome && !!window.chrome.webstore,
        isSafari =
        Object.prototype.toString.call(window.HTMLElement).indexOf('Constructor') > 0 ||
        (function (p) {
            return p.toString() === "[object SafariRemoteNotification]";
        })(!window.safari || window.safari.pushNotification),
        isFirefox = 'InstallTrigger' in win;

    const
        _bindCall = fun => Function.prototype.call.bind(fun),
        _getAttribute = _bindCall(_Element.getAttribute),
        _setAttribute = _bindCall(_Element.setAttribute),
        _removeAttribute = _bindCall(_Element.removeAttribute),
        _hasOwnProperty = _bindCall(Object.prototype.hasOwnProperty),
        _toString = _bindCall(Function.prototype.toString),
        _document = win.document,
        _de = _document.documentElement,
        _appendChild = _Document.appendChild.bind(_de),
        _appendChildById = (id, element) => _Document.appendChild.bind(_document.getElementById(id))(element),
        _appendChildByClassName = (className, element, index = 0) => _Document.appendChild.bind(_document.getElementsByClassName(className)[index])(element),
        _removeChild = _Document.removeChild.bind(_de),
        _createElement = _Document.createElement.bind(_document),
        _querySelector = _Document.querySelector.bind(_document),
        _querySelectorAll = _Document.querySelectorAll.bind(_document),
        _apply = Reflect.apply,
        _construct = Reflect.construct,
        _alert = alert;

    let skipLander = true;
    try {
        skipLander = !(isFirefox && 'StopIteration' in win);
    } catch (ignore) {}

    const jsf = (function () {
        const opts = {};
        let getValue = (a, b) => b,
            setValue = () => null,
            listValues = () => [];
        try {
            [getValue, setValue, listValues] = [GM_getValue, GM_setValue, GM_listValues];
        } catch (ignore) {}
        // defaults
        opts.salary = 0;
        opts.overtime = '{"first":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0},"second":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0}}';
        opts.overtimeRate = 2;
        opts.currencybeacon_apikey = '';
        opts.currencybeacon_updatedAt = 0;
        opts.usdToRubRate = 0;
        // load actual values
        for (let name of listValues()) {
            opts[name] = getValue(name, opts[name]);
        }
        const checkName = name => {
            if (!_hasOwnProperty(opts, name)) {
                throw new Error('Attempt to access missing option value.');
            }
            return true;
        };
        return new Proxy(opts, {
            get(opts, name) {
                if (name === 'toString') {
                    return () => JSON.stringify(opts);
                }
                if (checkName(name)) {
                    return opts[name];
                }
            },
            set(opts, name, value) {
                if (checkName(name)) {
                    opts[name] = value;
                    setValue(name, value);
                }
                return true;
            }
        });
    })();

    // Wrapper to run scripts designed to override objects available to other scripts
    // Required in old versions of Firefox (<58) or when running with Greasemonkey
    const
        batchLand = [],
        batchPrepend = new Set(),
        _APIString = `const win = window, _document = win.document, _de = _document.documentElement, isFirefox = ${isFirefox},
        _Document = Object.getPrototypeOf(HTMLDocument.prototype), _Element = Object.getPrototypeOf(HTMLElement.prototype), _Node = Object.getPrototypeOf(_Element),
        _appendChild = _Document.appendChild.bind(_de), _appendChildById = (id, element) => _Document.appendChild.bind(_document.getElementById(id))(element),
        _appendChildByClassName = (className, element, index = 0) => _Document.appendChild.bind(_document.getElementsByClassName(className)[index])(element),
        _removeChild = _Document.removeChild.bind(_de),
        skipLander = ${skipLander}, _createElement = _Document.createElement.bind(_document), _querySelector = _Document.querySelector.bind(_document),
        _querySelectorAll = _Document.querySelectorAll.bind(_document), _bindCall = fun => Function.prototype.call.bind(fun),
        _getAttribute = _bindCall(_Element.getAttribute), _setAttribute = _bindCall(_Element.setAttribute),
        _removeAttribute = _bindCall(_Element.removeAttribute), _hasOwnProperty = _bindCall(Object.prototype.hasOwnProperty),
        _toString = _bindCall(Function.prototype.toString), _apply = Reflect.apply, _construct = Reflect.construct, _alert = alert;
        const GM = { info: { version: '0.0', scriptHandler: null } };
        const jsf = ${jsf.toString()}`,
        landScript = (f, pre) => {
            const script = _createElement('script');
            script.textContent = `(()=>{${_APIString}${[...pre].join(';')};(${f.join(')();(')})();})();`;
            _appendChild(script);
            _removeChild(script);
        };
    let scriptLander = f => f();
    if (!skipLander) {
        scriptLander = (func, ...prepend) => {
            prepend.forEach(x => batchPrepend.add(x));
            batchLand.push(func);
        };
        _document.addEventListener(
            'DOMContentLoaded', () => void(scriptLander = (f, ...prep) => landScript([f], prep)), false
        );
    }

    // =======================

    const urlRegexp = /^https:\/\/www\.corp\.qsoft\.ru\/bitrix\/admin\/myhours\.php/;

    if (urlRegexp.test(win.location.href)) {
        const months1 = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
        const months2 = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
        const months3 = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        const currentMonth = (new Date()).getMonth();
        const selectedMonth = parseInt(document.getElementById('month').selectedIndex)-1;
        const currentMonthName1 = months1[currentMonth];
        const currentMonthName2 = months2[currentMonth];
        const currentMonthName3 = months3[currentMonth];
        const selectedMonthName1 = months1[selectedMonth];
        const selectedMonthName2 = months2[selectedMonth];
        const selectedMonthName3 = months3[selectedMonth];
        const currentDate = (new Date()).getDate();
        const reloadPage = () => _document.getElementsByClassName('qsoft_tmpl_top_menu_tab_box')[3].children[0].click();
        const getOvertime = (part, month) => {
            let obj = JSON.parse(jsf.overtime);
            return obj[part][month];
        };
        const setOvertime = (part, month, hours) => {
            let obj = JSON.parse(jsf.overtime);
            obj[part][month] = hours;
            jsf.overtime = JSON.stringify(obj);
        };

        /**/
        const corpTableContainer1 = _document.getElementById('qsoft_base_table_right');
        let corpTotalHours = corpTableContainer1.children[0].children[0].children[1].children;
        const corpTotalHoursTd = corpTotalHours[corpTotalHours.length-1];
        let h = parseInt(corpTotalHoursTd.textContent.split(':')[0]);
        let m = parseInt(corpTotalHoursTd.textContent.split(':')[1]);
        /*Всего часов отработано за месяц, без переработок*/
        let totalHours = parseInt((h+(m/60)))-(getOvertime('first', selectedMonth)+getOvertime('second', selectedMonth));
        const corpTableContainer2 = _document.getElementsByClassName('qsoft_base_table')[1];
        const corpExpectedTotalHoursTd = corpTableContainer2.children[1].children[3].children[selectedMonth];
        /*Количество плановых рабочих часов для месяца, учитывая официальные нерабочие дни*/
        const expectedTotalHours = parseInt(corpExpectedTotalHoursTd.textContent);
        /*Ставка в час*/
        const paidRate = (jsf.salary/expectedTotalHours).toFixed(2);
        /*Сумма за переработки*/
        const overtimeAmount = parseInt((getOvertime('first', selectedMonth)+getOvertime('second', selectedMonth))*paidRate*jsf.overtimeRate);
        /*Общая сумма за отработанные часы (без переработок)*/
        const earned = parseInt(paidRate*totalHours);
        /**/
        const currencybeaconUpdateRate = async () => {
            let response = await fetch(`https://api.currencybeacon.com/v1/latest?api_key=${jsf.currencybeacon_apikey}`, {"headers": {"accept": "application/json"}, "method": "GET"});
            if (response.ok) {
                let data = await response.json();
                let rate = data.rates.RUB;
                jsf.usdToRubRate = parseFloat(rate);
                jsf.currencybeacon_updatedAt = (new Date()).getTime();
            }
        };
        if (jsf.currencybeacon_apikey !== '' && ((new Date()).getTime()-jsf.currencybeacon_updatedAt)/100 > 28800) { // 8ч
            currencybeaconUpdateRate();
        }

        _appendChildByClassName('qsoft_tmpl_work_area', _createElement('br'));
        _appendChildByClassName('qsoft_tmpl_work_area', _createElement('br'));

        const salaryCalcContainer = _createElement('div');
        salaryCalcContainer.id = 'salarycalc-container';

        const salarySpan = _createElement('span');
        salarySpan.textContent = 'Ваша зп: ';
        salaryCalcContainer.appendChild(salarySpan);

        const salaryInput = _createElement('input');
        salaryInput.id = 'salarycalc-salaryinput';
        salaryInput.type = 'number';
        salaryInput.min = 10000;
        salaryInput.max = 600000;
        salaryInput.value = jsf.salary;
        salaryCalcContainer.appendChild(salaryInput);

        const salarySpanCurrency = _createElement('span');
        salarySpanCurrency.textContent = ' руб.';
        salaryCalcContainer.appendChild(salarySpanCurrency);

        salaryCalcContainer.appendChild(_createElement('br'));

        const overtimeInFirstHalfOfMonthSpan = _createElement('span');
        overtimeInFirstHalfOfMonthSpan.textContent = `Переработок в первой половине ${selectedMonthName3}: `;
        salaryCalcContainer.appendChild(overtimeInFirstHalfOfMonthSpan);

        const overtimeInFirstHalfOfMonthInput = _createElement('input');
        overtimeInFirstHalfOfMonthInput.id = 'salarycalc-overtime-in-first-half-of-month-input';
        overtimeInFirstHalfOfMonthInput.type = 'number';
        overtimeInFirstHalfOfMonthInput.min = 0;
        overtimeInFirstHalfOfMonthInput.max = 75;
        overtimeInFirstHalfOfMonthInput.value = getOvertime('first', selectedMonth);
        salaryCalcContainer.appendChild(overtimeInFirstHalfOfMonthInput);

        const overtimeInFirstHalfOfMonthSpanHour = _createElement('span');
        overtimeInFirstHalfOfMonthSpanHour.textContent = ' ч.';
        salaryCalcContainer.appendChild(overtimeInFirstHalfOfMonthSpanHour);

        salaryCalcContainer.appendChild(_createElement('br'));

        const overtimeInSecondHalfOfMonthSpan = _createElement('span');
        overtimeInSecondHalfOfMonthSpan.textContent = `Переработок во второй половине ${selectedMonthName3}: `;
        salaryCalcContainer.appendChild(overtimeInSecondHalfOfMonthSpan);

        const overtimeInSecondHalfOfMonthInput = _createElement('input');
        overtimeInSecondHalfOfMonthInput.id = 'salarycalc-overtime-in-second-half-of-month-input';
        overtimeInSecondHalfOfMonthInput.type = 'number';
        overtimeInSecondHalfOfMonthInput.min = 0;
        overtimeInSecondHalfOfMonthInput.max = 75;
        overtimeInSecondHalfOfMonthInput.value = getOvertime('second', selectedMonth);
        salaryCalcContainer.appendChild(overtimeInSecondHalfOfMonthInput);

        const overtimeInSecondHalfOfMonthSpanHour = _createElement('span');
        overtimeInSecondHalfOfMonthSpanHour.textContent = ' ч.';
        salaryCalcContainer.appendChild(overtimeInSecondHalfOfMonthSpanHour);

        salaryCalcContainer.appendChild(_createElement('br'));

        const overtimeRateSpan = _createElement('span');
        overtimeRateSpan.textContent = 'Коэффициент за переработки: ';
        if (getOvertime('first', selectedMonth) !== 0 || getOvertime('second', selectedMonth) !== 0) salaryCalcContainer.appendChild(overtimeRateSpan);

        const overtimeRateInput = _createElement('input');
        overtimeRateInput.id = 'salarycalc-overtimerateinput';
        overtimeRateInput.type = 'number';
        overtimeRateInput.min = 10000;
        overtimeRateInput.max = 600000;
        overtimeRateInput.value = jsf.overtimeRate;
        if (getOvertime('first', selectedMonth) !== 0 || getOvertime('second', selectedMonth) !== 0) {
            salaryCalcContainer.appendChild(overtimeRateInput);
            salaryCalcContainer.appendChild(_createElement('br'));
        }

        const usdToRubRateSpan = _createElement('span');
        usdToRubRateSpan.textContent = 'Курс доллара к рублю: ';
        salaryCalcContainer.appendChild(usdToRubRateSpan);

        const usdToRubRateInput = _createElement('input');
        usdToRubRateInput.id = 'salarycalc-usdtorubrateinput';
        usdToRubRateInput.style.width = '49px';
        usdToRubRateInput.type = 'number';
        usdToRubRateInput.min = 0;
        usdToRubRateInput.max = 200;
        usdToRubRateInput.value = jsf.usdToRubRate;
        salaryCalcContainer.appendChild(usdToRubRateInput);

        const usdToRubRateLastUpdateSpan = _createElement('span');
        let date = new Date(jsf.currencybeacon_updatedAt);
        let minutes = '0' + date.getMinutes();
        let formattedTime = date.getHours() + ':' + minutes.substr(-2);
        usdToRubRateLastUpdateSpan.textContent = ` (последнее обновление ${date.getDate()} ${months3[date.getMonth()]} в ${formattedTime})`;
        if (jsf.currencybeacon_apikey !== '' && jsf.currencybeacon_updatedAt !== 0) {
            salaryCalcContainer.appendChild(usdToRubRateLastUpdateSpan);
        }

        salaryCalcContainer.appendChild(_createElement('br'));

        const currencybeaconApiKeySpan = _createElement('span');
        currencybeaconApiKeySpan.innerHTML = '<a href="https://currencybeacon.com" target="_blank">Currencybeacon</a> ApiKey: ';
        salaryCalcContainer.appendChild(currencybeaconApiKeySpan);

        const currencybeaconApiKeyInput = _createElement('input');
        currencybeaconApiKeyInput.id = 'salarycalc-currencybeaconapikeyinput';
        currencybeaconApiKeyInput.type = 'text';
        currencybeaconApiKeyInput.maxlength = 32;
        currencybeaconApiKeyInput.value = jsf.currencybeacon_apikey;
        salaryCalcContainer.appendChild(currencybeaconApiKeyInput);

        salaryCalcContainer.appendChild(_createElement('br'));

        const saveButton = _createElement('button');
        saveButton.style.marginTop = '4px';
        saveButton.textContent = 'Сохранить';
        saveButton.onclick = () => {
            jsf.salary = parseInt(_document.getElementById(salaryInput.id).value);
            setOvertime('first', selectedMonth, parseInt(_document.getElementById(overtimeInFirstHalfOfMonthInput.id).value));
            setOvertime('second', selectedMonth, parseInt(_document.getElementById(overtimeInSecondHalfOfMonthInput.id).value));
            if (_document.getElementById(overtimeRateInput.id) !== null) {
                jsf.overtimeRate = parseFloat(_document.getElementById(overtimeRateInput.id).value);
            }
            let usdToRubRateVal = parseFloat(_document.getElementById(usdToRubRateInput.id).value);
            if (jsf.usdToRubRate !== usdToRubRateVal) jsf.currencybeacon_updatedAt = (new Date()).getTime();
            jsf.usdToRubRate = usdToRubRateVal;
            jsf.currencybeacon_apikey = _document.getElementById(currencybeaconApiKeyInput.id).value;
            //_alert('Saved');
            reloadPage();
        };
        salaryCalcContainer.appendChild(saveButton);

        salaryCalcContainer.appendChild(_createElement('br'));
        salaryCalcContainer.appendChild(_createElement('br'));

        const totalHoursContainer = _createElement('div');
        const totalHoursPercent = parseInt((totalHours/expectedTotalHours)*100);
        totalHoursContainer.textContent = `Общее количество часов за ${selectedMonthName1}: ${totalHours} / ${expectedTotalHours} [${totalHoursPercent}%]`;
        salaryCalcContainer.appendChild(totalHoursContainer);

        const paidRateContainer = _createElement('div');
        paidRateContainer.textContent = `Ставка за час в ${selectedMonthName2}: ${paidRate} руб.`;
        if (jsf.usdToRubRate !== 0) paidRateContainer.textContent += ` | ~${parseInt(paidRate/jsf.usdToRubRate)} usd`;
        salaryCalcContainer.appendChild(paidRateContainer);

        const earnedContainer = _createElement('div');
        earnedContainer.textContent = `Заработано в ${selectedMonthName2}: ${earned} руб.`;
        if (overtimeAmount > 0) {
            earnedContainer.textContent += ` + ${overtimeAmount} руб. за переработки | Всего ${(earned+overtimeAmount)} руб.`;
        }
        if (jsf.usdToRubRate !== 0) earnedContainer.textContent += ` | ~${parseInt((earned+overtimeAmount)/jsf.usdToRubRate)} usd`;
        salaryCalcContainer.appendChild(earnedContainer);

        /**/
        const hoursContainer = _document.getElementById('qsoft_base_table_right');
        const daysTdHTMLCollection = hoursContainer.children[0].children[0].children[0].children;
        const hoursTdHTMLCollection = hoursContainer.children[0].children[0].children[1].children;
        let time = [];
        for (let i = 0; i < hoursTdHTMLCollection.length; i++) {
            let dayTdEl = daysTdHTMLCollection[i];
            let hourTdEl = hoursTdHTMLCollection[i];
            //let isDayOff = (hourTdEl.style.backgroundColor !== ''); if (isDayOff) continue;
            if (isNaN(parseInt(dayTdEl.textContent)) || isNaN(parseInt(hourTdEl.textContent.split(':')[0]))) continue;
            time.push({
                day: parseInt(dayTdEl.textContent),
                hour: parseInt(hourTdEl.textContent.split(':')[0]),
                minute: parseInt(hourTdEl.textContent.split(':')[1])
            });
        }
        /*К выплате 25го числа*/
        let payableOn25 = 0;
        /*К выплате 10го числа, без учета согласованных переработок по повышенному рейту*/
        let payableOn10 = 0;
        let firstPartOfWeek_Hours = 0;
        let firstPartOfWeek_Minutes = 0;
        let secondPartOfWeek_Hours = 0;
        let secondPartOfWeek_Minutes = 0;
        let overHours = 0;
        let overMinutes = 0;
        time.forEach(data => {
            let day = data.day, hour = data.hour, minute = data.minute;
            if (day <= 15) {
                if (hour > 8) {
                    firstPartOfWeek_Hours += 8;
                    overHours += hour-8;
                    overMinutes += minute;
                } else if (hour === 8) {
                    firstPartOfWeek_Hours += hour;
                    overMinutes += minute;
                } else {
                    firstPartOfWeek_Hours += hour;
                    firstPartOfWeek_Minutes += minute;
                }
            } else {
                if (hour > 8) {
                    secondPartOfWeek_Hours += 8;
                    overHours += hour-8;
                    overMinutes += minute;
                } else if (hour === 8) {
                    secondPartOfWeek_Hours += hour;
                    overMinutes += minute;
                } else {
                    secondPartOfWeek_Hours += hour;
                    secondPartOfWeek_Minutes += minute;
                }
            }
        });
        overHours += parseInt(overMinutes/60);
        firstPartOfWeek_Hours += parseInt(firstPartOfWeek_Minutes/60) - getOvertime('first', selectedMonth);
        secondPartOfWeek_Hours += parseInt(secondPartOfWeek_Minutes/60) + overHours - getOvertime('second', selectedMonth);
        payableOn25 = parseInt(firstPartOfWeek_Hours*paidRate)+1;
        payableOn10 = parseInt(secondPartOfWeek_Hours*paidRate);
        /**/

        const payableOn25Container = _createElement('div');
        if (currentMonth === selectedMonth && currentDate <= 25) {
            payableOn25Container.textContent += `К выплате 25-го ${selectedMonthName3}: ~${payableOn25} руб.`;
        } else {
            payableOn25Container.textContent += `Выплачено 25-го ${selectedMonthName3}: ~${payableOn25} руб.`;
        }
        salaryCalcContainer.appendChild(payableOn25Container);

        const payableOn10Container = _createElement('div');
        if (currentMonth > selectedMonth+1) {
            payableOn10Container.textContent += `Выплачено 10-го ${months3[selectedMonth+1]}: ~${payableOn10+overtimeAmount} руб.`;
        } else if (currentMonth === selectedMonth+1 && currentDate >= 10) {
            payableOn10Container.textContent += `Выплачено 10-го ${months3[selectedMonth+1]}: ~${payableOn10+overtimeAmount} руб.`;
        } else {
            payableOn10Container.textContent += `К выплате 10-го ${months3[selectedMonth+1]}: ~${payableOn10+overtimeAmount} руб.`;
        }
        salaryCalcContainer.appendChild(payableOn10Container);

        _appendChildByClassName('qsoft_tmpl_work_area', salaryCalcContainer);
    }
})();