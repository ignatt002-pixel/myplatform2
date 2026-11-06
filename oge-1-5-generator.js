(function (global) {
    'use strict';

    /* ---------------------------------------------------
       Движок
       --------------------------------------------------- */

    // Короткий читаемый код варианта (без похожих символов: 0/O, 1/I)
    const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    function newSeedCode() {
        let out = '';
        const buf = new Uint32Array(8);
        if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(buf);
        else for (let i = 0; i < 8; i++) buf[i] = Math.floor(Math.random() * 4294967296);
        for (let i = 0; i < 8; i++) out += SEED_ALPHABET[buf[i] % SEED_ALPHABET.length];
        return out;
    }
    function normalizeSeed(seed) {
        return String(seed).trim().toUpperCase();
    }
    // Из «oge-sheets-1-88CTHNYJ» достаёт «88CTHNYJ»; голый сид оставляет как есть
    function seedFromCode(code) {
        const first = String(code).trim().split('+')[0];
        const m = first.match(/-([A-Za-z2-9]{8})$/);
        return normalizeSeed(m ? m[1] : first);
    }

    // Принудительный сид для проверки жалоб: ?oge_seed=КОД или ogeReplaySeed('КОД')
    let forcedSeed = null;
    try {
        const fromUrl = new URLSearchParams(global.location.search).get('oge_seed');
        if (fromUrl) forcedSeed = seedFromCode(fromUrl);
    } catch (e) { /* ничего */ }
    global.ogeReplaySeed = function (code) {
        forcedSeed = code ? seedFromCode(code) : null;
        return forcedSeed;
    };

    // Строка или число -> целое 32-битное (одинаковое при одинаковом входе)
    function seedToInt(seed) {
        if (typeof seed === 'number') return seed >>> 0;
        const str = String(seed);
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    // Генератор случайных чисел с сидом (mulberry32)
    function makeRng(seed) {
        let s = seedToInt(seed);
        function next() {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
        return {
            next: next,
            int: function (a, b) { return a + Math.floor(next() * (b - a + 1)); },   // целое от a до b включительно
            pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },    // случайный элемент
            shuffle: function (arr) {                                                 // перемешанная копия
                const a = arr.slice();
                for (let i = a.length - 1; i > 0; i--) {
                    const j = Math.floor(next() * (i + 1));
                    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
                }
                return a;
            }
        };
    }

    // Подстановка {{имя}} во все строки шаблона (в том числе во вложенные массивы и объекты).
    // Если вся строка — одна метка и значение не строка (массив, объект), вставляется само значение.
    const PLACEHOLDER = /\{\{\s*([\w]+)\s*\}\}/g;
    const WHOLE_PLACEHOLDER = /^\{\{\s*([\w]+)\s*\}\}$/;

    function fill(value, vars) {
        if (typeof value === 'string') {
            const whole = value.match(WHOLE_PLACEHOLDER);
            if (whole) {
                if (!(whole[1] in vars)) throw new Error('OGE: в сценарии нет значения «' + whole[1] + '»');
                const v = vars[whole[1]];
                return (v !== null && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : String(v);
            }
            return value.replace(PLACEHOLDER, function (m, name) {
                if (!(name in vars)) throw new Error('OGE: в сценарии нет значения «' + name + '»');
                return String(vars[name]);
            });
        }
        if (Array.isArray(value)) return value.map(function (v) { return fill(v, vars); });
        if (value && typeof value === 'object') {
            const out = {};
            Object.keys(value).forEach(function (k) { out[k] = fill(value[k], vars); });
            return out;
        }
        return value;
    }

    // Вспомогательное для текстов
    const A = function (n) { return '\u0410' + n; };    // «А» кириллицей, как в условии ОГЭ: А0, А1, ...
    function plural(n, one, few, many) {
        const a = n % 100, b = n % 10;
        if (a >= 11 && a <= 14) return many;
        if (b === 1) return one;
        if (b >= 2 && b <= 4) return few;
        return many;
    }
    function listAnd(arr) {                              // ["А2","А3","А5"] -> «А2, А3 и А5»
        if (arr.length <= 1) return arr.join('');
        return arr.slice(0, -1).join(', ') + ' и ' + arr[arr.length - 1];
    }

    /* ---------------------------------------------------
       Блок «Листы бумаги» (ОГЭ, задания 1–5)
       --------------------------------------------------- */

    // Размеры листов по ГОСТ, мм: [меньшая сторона, большая сторона]
    const SHEET = {
        0: [841, 1189], 1: [594, 841], 2: [420, 594], 3: [297, 420],
        4: [210, 297], 5: [148, 210], 6: [105, 148], 7: [74, 105]
    };
    const small = function (n) { return SHEET[n][0]; };
    const big = function (n) { return SHEET[n][1]; };

    const SHEETS_INTRO =
        'Общепринятые форматы листов бумаги обозначают буквой А и цифрой: А0, А1, А2 и так далее. ' +
        'Лист формата А0 имеет форму прямоугольника, площадь которого равна 1 кв. м. ' +
        'Если лист формата А0 разрезать пополам параллельно меньшей стороне, получается два равных листа формата А1. ' +
        'Если лист А1 разрезать так же пополам, получается два листа формата А2. И так далее.' +
        '<br><br>' +
        'Отношение большей стороны к меньшей стороне листа каждого формата одно и то же, поэтому листы всех форматов подобны. ' +
        'Это сделано специально для того, чтобы пропорции текста и его расположение на листе сохранялись ' +
        'при уменьшении или увеличении шрифта при изменении формата листа.';

    // Краткое напоминание условия — для заданий 1.2–1.5 (там полный текст уже не показывается)
    const SHEETS_REMINDER =
        'Напомним условие. Лист формата А0 — прямоугольник площадью 1 кв. м. ' +
        'Если лист разрезать пополам параллельно меньшей стороне, получаются два равных листа следующего формата: ' +
        'из А0 — два А1, из А1 — два А2 и так далее. Отношение большей стороны к меньшей у листов всех форматов одно и то же.';

    const OGE_GENERATORS = global.OGE_GENERATORS || {};

    OGE_GENERATORS.sheets = {
        title: 'Листы, 1–5 задания',

        // Выбор чисел и все расчёты. Возвращает значения для меток {{...}} в шаблонах.
        scenario: function (rnd) {
            const v = {};
            v.intro = SHEETS_INTRO;
            v.reminder = SHEETS_REMINDER;

            // ---- 1.1: соответствие форматов и номеров листов ----
            const formats = rnd.shuffle([2, 3, 4, 5, 6, 7]).slice(0, 4).sort(function (a, b) { return a - b; });
            let order;
            do { order = rnd.shuffle(formats); }
            while (order.every(function (n, i) { return n === formats[i]; }));   // не отдаём «1234»

            v.formatsText = listAnd(formats.map(A));
            v.table11 = {
                header: ['Порядковые номера', 'Длина (мм)', 'Ширина (мм)'],
                rows: order.map(function (n, i) { return [String(i + 1), String(big(n)), String(small(n))]; })
            };
            v.matchTable = {
                header: ['Форматы бумаги'].concat(formats.map(A)),
                rows: [['Порядковые номера', '', '', '', '']]
            };
            const numbers = formats.map(function (n) { return order.indexOf(n) + 1; });   // номер листа для А(formats[i])
            v.answer1 = numbers.join('');
            v.sizesText1 = numbers.map(function (num, i) {
                return '№' + num + ' (' + big(formats[i]) + ' мм)';
            }).join(', ');
            v.numbersText1 = listAnd(numbers.map(function (num) { return '№' + num; }));

            // ---- 1.2: сколько листов получится ----
            const m = rnd.int(1, 4);
            const d = rnd.int(1, 3);
            const k = m + d;
            v.fm = A(m);
            v.fk = A(k);
            v.answer2 = Math.pow(2, d);
            if (d === 1) {
                v.explain2 = 'Если лист формата ' + A(m) + ' разрезать пополам, получится 2 листа формата ' + A(k) + '.';
            } else {
                const parts = [];
                for (let i = 1; i <= d; i++) {
                    const cnt = Math.pow(2, i);
                    parts.push(cnt + ' ' + plural(cnt, 'лист', 'листа', 'листов') + ' ' + A(m + i));
                }
                v.explain2 = 'Каждое разрезание пополам удваивает количество листов. Из одного листа ' + A(m) +
                    ' получаем ' + parts.join(', затем ') + '.';
            }
            v.product2 = new Array(d).fill('2').join(' · ') + ' = ' + v.answer2;

            // ---- 1.3: размер листа по данным таблицы, округление до 10 ----
            const n3 = rnd.int(0, 1);
            const sideAcc = rnd.pick(['ширину', 'длину']);
            const sideNom = sideAcc === 'ширину' ? 'ширина' : 'длина';
            const j = formats[0];                       // самый большой лист в таблице 1.1
            let s = small(j), l = big(j);
            const stepLines = [];
            for (let f = j; f > n3; f--) {
                const ns = l, nl = 2 * s;
                stepLines.push(A(f - 1) + ': меньшая сторона равна большей стороне листа ' + A(f) + ', то есть ' + ns +
                    ' мм; большая сторона вдвое больше меньшей стороны листа ' + A(f) + ': 2 · ' + s + ' = ' + nl + ' мм.');
                s = ns; l = nl;
            }
            const value3 = sideAcc === 'ширину' ? s : l;
            v.fn3 = A(n3);
            v.sideAcc = sideAcc;
            v.answer3 = Math.round(value3 / 10) * 10;
            v.table13 = {
                header: ['Формат', 'Длина (мм)', 'Ширина (мм)'],
                rows: formats.map(function (n) { return [A(n), String(big(n)), String(small(n))]; })
            };
            v.biggest3 = A(j) + ', его размеры ' + big(j) + ' × ' + small(j) + ' мм';
            v.steps3 = stepLines.join('<br>');
            v.final3 = 'Значит, у листа ' + A(n3) + ' ' + sideNom + ' равна ' + value3 + ' мм. ' +
                (value3 % 10 === 0
                    ? 'Это число уже кратно 10, поэтому округлять не нужно.'
                    : 'Округляем до ближайшего целого числа, кратного 10: ' + v.answer3 + '.');

            // ---- 1.4: площадь листа в кв. см ----
            const n4 = rnd.int(1, 4);
            v.fn4 = A(n4);
            let area = 10000;
            const areaLines = [];
            for (let f = 1; f <= n4; f++) {
                areaLines.push(A(f) + ': ' + area + ' : 2 = ' + (area / 2) + ' кв. см');
                area = area / 2;
            }
            v.answer4 = area;
            v.areaSteps4 = areaLines.join('<br>');

            // ---- 1.5: масса пачки ----
            const combos = [];
            [3, 4, 5].forEach(function (n) {
                [100, 200, 250, 300, 400, 500, 600, 800, 1000].forEach(function (N) {
                    [60, 70, 80, 90, 100, 120].forEach(function (w) {
                        if ((N * w) % Math.pow(2, n) === 0) combos.push({ n: n, N: N, w: w });
                    });
                });
            });
            const c = rnd.pick(combos);
            v.fn5 = A(c.n);
            v.sheets5 = c.N;
            v.weight5 = c.w;
            v.den5 = Math.pow(2, c.n);
            v.answer5 = (c.N * c.w) / Math.pow(2, c.n);


            /* ---------------------------------------------------
               Объяснения: для каждого задания три формулировки одного и того же решения.
               Вариант выбирается случайно (от сида), и после всех выборов чисел —
               поэтому числа при том же коде урока не меняются.
               --------------------------------------------------- */
            const pickVariant = function (variants) { return variants[rnd.int(0, variants.length - 1)](); };
            const sidesNom = sideNom;

            // ---- 1.1 ----
            const pairs1 = formats.map(function (n, i) { return A(n) + ' — лист №' + numbers[i]; }).join(', ');
            v.explain1 = pickVariant([
                function () { return [
                    'Чем больше число в названии формата, тем меньше лист. Например, А3 меньше, чем А2.',
                    'Расставим листы из таблицы по длине — от самого длинного к самому короткому: ' + v.sizesText1 + '.',
                    'Форматы ' + v.formatsText + ' идут в том же порядке: от большого листа к маленькому. Значит, им подходят листы ' + v.numbersText1 + '. Это и есть ответ.'
                ]; },
                function () { return [
                    'Каждый раз, когда лист режут пополам, он становится меньше, а число в названии — больше. Значит, у самого большого листа в названии самое маленькое число.',
                    'Смотрим на длину в таблице. От самого длинного к самому короткому: ' + v.sizesText1 + '.',
                    'Сопоставляем по порядку: ' + pairs1 + '. Остаётся записать номера листов подряд.'
                ]; },
                function () { return [
                    'Сравним листы по длине: чем длиннее лист, тем меньше число в его названии.',
                    'Самый длинный лист — это ' + A(formats[0]) + ', дальше идём по убыванию длины.',
                    'Получается: ' + pairs1 + '. Записываем номера подряд.'
                ]; }
            ]);

            // ---- 1.2 ----
            const times = d + ' ' + plural(d, 'раз', 'раза', 'раз');
            const partsList = [];
            for (let i = 1; i <= d; i++) {
                const cnt = Math.pow(2, i);
                partsList.push(cnt + ' ' + plural(cnt, 'лист', 'листа', 'листов') + ' ' + A(m + i));
            }
            const twos = new Array(d).fill('2').join(' · ') + ' = ' + v.answer2;
            v.explain2 = pickVariant([
                function () {
                    const r = ['Когда лист режут пополам, получается 2 листа следующего формата.'];
                    if (d === 1) r.push('Значит, из одного листа ' + A(m) + ' получится 2 листа ' + A(k) + '.');
                    else {
                        r.push('Режем по шагам: ' + partsList.join(', затем ') + '.');
                        r.push('Каждый раз листов становится в 2 раза больше: ' + twos + '. Это и есть ответ.');
                    }
                    return r;
                },
                function () {
                    const r = ['Чтобы из ' + A(m) + ' получить ' + A(k) + ', нужно разрезать лист пополам ' + times + '.'];
                    r.push(d === 1 ? 'После одного разреза получается 2 листа. Это и есть ответ.'
                                   : 'После каждого разреза листов становится в 2 раза больше: ' + twos + '. Это и есть ответ.');
                    return r;
                },
                function () {
                    const r = ['Просто посчитаем. Берём один лист ' + A(m) + '.'];
                    for (let i = 1; i <= d; i++) {
                        const cnt = Math.pow(2, i);
                        r.push('Разрезали ' + (i === 1 ? 'его' : 'каждый лист') + ' пополам — стало ' + cnt + ' ' +
                            plural(cnt, 'лист', 'листа', 'листов') + ' ' + A(m + i) + '.');
                    }
                    r.push('Ответ: ' + v.answer2 + '.');
                    return r;
                }
            ]);

            // ---- 1.3 ----
            const stepData = [];
            (function () {
                let ss = small(j), ll = big(j);
                for (let f = j; f > n3; f--) { stepData.push({ f: f, s: ss, l: ll, ns: ll, nl: 2 * ss }); const t = ll; ll = 2 * ss; ss = t; }
            })();
            const roundLine = value3 % 10 === 0
                ? 'Это число уже делится на 10, округлять не нужно.'
                : 'Округляем до десятков: ' + value3 + ' ≈ ' + v.answer3 + '.';
            v.explain3 = pickVariant([
                function () { return [
                    'В таблице самый большой лист — ' + v.biggest3 + '. А нам нужен лист ещё больше, поэтому пойдём от него вверх.',
                    'Если приложить два одинаковых листа друг к другу длинными сторонами, получится лист на один формат больше. Его короткая сторона равна длинной стороне старого листа, а длинная сторона — это короткая сторона старого, умноженная на 2.',
                    stepData.map(function (x) { return A(x.f - 1) + ': короткая сторона ' + x.ns + ' мм, длинная сторона 2 · ' + x.s + ' = ' + x.nl + ' мм.'; }).join('<br>'),
                    'Значит, у листа ' + A(n3) + ' ' + sidesNom + ' равна ' + value3 + ' мм. ' + roundLine
                ]; },
                function () { return [
                    'Возьмём из таблицы лист ' + A(j) + ': ' + big(j) + ' × ' + small(j) + ' мм (длина × ширина). От него будем идти к листу побольше.',
                    'Приложим два таких листа друг к другу длинными сторонами — получится лист на один формат больше. Его короткая сторона — это длинная сторона старого листа, а длинная — это короткая сторона старого, умноженная на 2.',
                    stepData.map(function (x) { return A(x.f) + ' → ' + A(x.f - 1) + ': короткая сторона ' + x.ns + ' мм, длинная сторона 2 · ' + x.s + ' = ' + x.nl + ' мм.'; }).join('<br>'),
                    'Получили: ' + sidesNom + ' листа ' + A(n3) + ' — ' + value3 + ' мм. ' + roundLine
                ]; },
                function () { return [
                    'Меньший формат получается, если лист разрезать пополам. А больший — если, наоборот, соединить два листа. Начнём с самого большого листа из таблицы: ' + v.biggest3 + '.',
                    'Когда два листа соединяют, одна сторона остаётся такой же, а другая становится вдвое длиннее. У нового листа короткая сторона равна длинной стороне старого, а длинная — это короткая сторона старого, умноженная на 2.',
                    stepData.map(function (x) { return 'Лист ' + A(x.f - 1) + ': короткая сторона — ' + x.ns + ' мм, длинная — 2 · ' + x.s + ' = ' + x.nl + ' мм.'; }).join('<br>'),
                    'Дошли до листа ' + A(n3) + ': ' + sidesNom + ' равна ' + value3 + ' мм. ' + roundLine
                ]; }
            ]);

            // ---- 1.4 ----
            const areaLinesEx = [];
            (function () {
                let a = 10000;
                for (let f = 1; f <= n4; f++) { areaLinesEx.push(A(f) + ': ' + a + ' : 2 = ' + (a / 2) + ' кв. см'); a = a / 2; }
            })();
            const areaSteps = areaLinesEx.join('<br>');
            v.explain4 = pickVariant([
                function () { return [
                    'Площадь листа А0 — 1 кв. м. Переведём в кв. см: 1 м = 100 см, поэтому 1 кв. м = 100 · 100 = 10000 кв. см.',
                    'Каждый раз, когда лист режут пополам, его площадь делится на 2. Считаем по порядку:',
                    areaSteps,
                    'Ответ: ' + v.answer4 + ' кв. см.'
                ]; },
                function () { return [
                    'Сначала переведём площадь в сантиметры: 1 кв. м = 100 см · 100 см = 10000 кв. см.',
                    'Разрезали лист пополам — площадь стала в 2 раза меньше. Повторяем, пока не дойдём до ' + A(n4) + ':',
                    areaSteps,
                    'Ответ: ' + v.answer4 + ' кв. см.'
                ]; },
                function () { return [
                    'Начнём с листа А0. Его площадь — 1 кв. м, то есть 10000 кв. см (ведь 100 · 100 = 10000).',
                    'Каждый разрез пополам делит площадь на 2. Считаем, пока не получим ' + A(n4) + ':',
                    areaSteps,
                    'Ответ: ' + v.answer4 + ' кв. см.'
                ]; }
            ]);

            // ---- 1.5 ----
            const den = Math.pow(2, c.n);
            const timesN = c.n + ' ' + plural(c.n, 'раз', 'раза', 'раз');
            const prod5 = new Array(c.n).fill('2').join(' · ') + ' = ' + den;
            const ans5 = v.answer5;
            v.explain5 = pickVariant([
                function () { return [
                    'Площадь листа А0 — 1 кв. м. Чтобы получить ' + A(c.n) + ', лист режут пополам ' + timesN + '. Каждый раз площадь становится в 2 раза меньше: ' + prod5 + '.',
                    'Значит, один лист ' + A(c.n) + ' занимает 1/' + den + ' кв. м, и весит он в ' + den + ' ' + plural(den, 'раз', 'раза', 'раз') + ' меньше, чем 1 кв. м бумаги.',
                    'В пачке ' + c.N + ' листов, поэтому её масса: ' + c.N + ' · ' + c.w + ' : ' + den + ' = ' + ans5 + ' г.'
                ]; },
                function () { return [
                    'Сначала узнаем, какую часть квадратного метра занимает один лист. Лист А0 режем пополам ' + timesN + ', и каждый раз площадь уменьшается в 2 раза: ' + prod5 + '.',
                    'Значит, один лист ' + A(c.n) + ' — это 1/' + den + ' кв. м. Все ' + c.N + ' листов вместе занимают ' + c.N + '/' + den + ' кв. м.',
                    '1 кв. м бумаги весит ' + c.w + ' г, поэтому пачка весит ' + c.N + ' · ' + c.w + ' : ' + den + ' = ' + ans5 + ' г.'
                ]; },
                function () { return [
                    'Чем больше площадь бумаги, тем больше она весит. Лист ' + A(c.n) + ' меньше листа А0 по площади в ' + den + ' ' + plural(den, 'раз', 'раза', 'раз') + ' (' + prod5 + '), то есть занимает 1/' + den + ' кв. м.',
                    '1 кв. м весит ' + c.w + ' г. Значит, пачка из ' + c.N + ' листов весит ' + c.N + ' · ' + c.w + ' : ' + den + ' = ' + ans5 + ' г.'
                ]; }
            ]);

            return v;
        },

        // Шаблоны пяти заданий. Всё, что в {{...}}, подставляется из scenario.
        // graph1 — рисунок с листами (команды для рисовалки графиков).
        tasks: [
            { // ---------- 1.1 ----------
                type: 'input',
                isOge: true,
                graph1: [
                    'grid: false',
                    'line.gray: 0;0 0;4 6;4 6;0 0;0',
                    'dashed_line.gray: 3;0 3;4',
                    'dashed_line.gray: 0;2 3;2',
                    'dashed_line.gray: 1.5;2 1.5;4',
                    'dashed_line.gray: 0;3 1.5;3',
                    'dashed_line.gray: 0.75;3 0.75;4',
                    'text.3;-0.75.size40: A0',
                    'text.4.5;2.size40: A1',
                    'text.1.5;1.size35: A2',
                    'text.2.25;3.size30: A3',
                    'text.0.75;2.5.size20: A4',
                    'text.1.13;3.5.size17: A5'
                ],
                text1: '{{intro}}',
                text2: '<b>1.1</b> В таблице даны размеры (с точностью до мм) четырёх листов, имеющих форматы {{formatsText}}.',
                table1: '{{table11}}',
                text3: 'Установите соответствие между форматами и номерами листов. В ответ запишите последовательность четырёх цифр, соответствующих номерам листов, без пробелов, запятых и дополнительных символов.',
                table2: '{{matchTable}}',
                correctAnswer: '{{answer1}}',
                explanationFields: '{{explain1}}'
            },
            { // ---------- 1.2 ----------
                type: 'input',
                isOge: true,
                text1: '{{reminder}}',
                text2: '<b>1.2</b> Сколько листов формата {{fk}} получится из одного листа формата {{fm}}?',
                correctAnswer: '{{answer2}}',
                explanationFields: '{{explain2}}'
            },
            { // ---------- 1.3 ----------
                type: 'input',
                isOge: true,
                text1: '{{reminder}}',
                text2: 'Известны размеры (с точностью до мм) листов нескольких форматов:',
                table1: '{{table13}}',
                text3: '<b>1.3</b> Найдите {{sideAcc}} листа бумаги формата {{fn3}}. Ответ дайте в миллиметрах и округлите до ближайшего целого числа, кратного 10.',
                correctAnswer: '{{answer3}}',
                explanationFields: '{{explain3}}'
            },
            { // ---------- 1.4 ----------
                type: 'input',
                isOge: true,
                text1: '{{reminder}}',
                text2: '<b>1.4</b> Найдите площадь листа формата {{fn4}}. Ответ дайте в квадратных сантиметрах.',
                correctAnswer: '{{answer4}}',
                explanationFields: '{{explain4}}'
            },
            { // ---------- 1.5 ----------
                type: 'input',
                isOge: true,
                text1: '{{reminder}}',
                text2: '<b>1.5</b> Бумагу формата {{fn5}} упаковали в пачки по {{sheets5}} листов. Найдите массу пачки, если масса бумаги площадью 1 кв. м равна {{weight5}} г. Ответ дайте в граммах.',
                correctAnswer: '{{answer5}}',
                explanationFields: '{{explain5}}'
            }
        ]
    };

    global.OGE_GENERATORS = OGE_GENERATORS;

    /* ---------------------------------------------------
       Публичные функции (их вызывает script.js)
       --------------------------------------------------- */

    // Собирает один блок: возвращает массив готовых заданий.
    //   opts.seed  — сид (если не указан — случайный)
    //   opts.parts — какие задания блока взять, например [1, 3] (нумерация с 1)
    //   opts.salt  — добавка к сиду, чтобы повторы одного блока отличались друг от друга
    // В каждом задании лежит task.ogeSeed — код варианта для жалоб.
    function generateOgeBlock(name, opts) {
        opts = opts || {};
        const def = OGE_GENERATORS[name];
        if (!def) throw new Error('OGE: нет генератора «' + name + '»');
        const code = forcedSeed || (opts.seed === undefined ? newSeedCode() : normalizeSeed(opts.seed));
        const rngSeed = opts.salt === undefined ? code : code + ':' + opts.salt;
        const vars = def.scenario(makeRng(rngSeed));
        const result = [];
        def.tasks.forEach(function (template, i) {
            if (Array.isArray(opts.parts) && opts.parts.indexOf(i + 1) === -1) return;
            const task = fill(template, vars);
            task.ogeSeed = code;
            result.push(task);
        });
        return result;
    }

    // Сколько раз повторить набор: "count": 6 (целое от 1 до 50, по умолчанию 1)
    const MAX_REPEAT = 50;
    function repeatCount(set) {
        const n = Math.floor(Number(set && set.count));
        return n >= 1 ? Math.min(n, MAX_REPEAT) : 1;
    }

    // Наборы записи: либо "sets": [ {parts, count}, ... ], либо сама запись как один набор
    function entrySets(entry) {
        return (Array.isArray(entry.sets) && entry.sets.length) ? entry.sets : [entry];
    }

    // Заменяет в списке заданий урока записи { "generator": "..." } на готовые задания.
    // У всего урока один сид (виден в жалобе), а каждое повторение набора получает
    // из него своё отдельное число вариантов — поэтому по одному сиду урок восстанавливается целиком.
    function expandOgeGenerators(tasks, lessonId) {
        const master = forcedSeed || newSeedCode();
        const out = [];
        tasks.forEach(function (entry, entryIdx) {
            if (!entry || typeof entry.generator !== 'string') { out.push(entry); return; }
            try {
                const fixed = (entry.seed === undefined || entry.seed === 'random') ? undefined : entry.seed;
                const code = fixed === undefined ? master : fixed;
                entrySets(entry).forEach(function (set, setIdx) {
                    const times = repeatCount(set);
                    for (let r = 0; r < times; r++) {
                        generateOgeBlock(entry.generator, {
                            seed: code,
                            parts: set.parts,
                            salt: entryIdx + '.' + setIdx + '.' + r
                        }).forEach(function (t) { out.push(t); });
                    }
                });
            } catch (e) {
                console.error('Ошибка генератора ОГЭ:', e);
            }
        });
        return out;
    }

    // Добавка к коду урока для окна жалобы: код урока "oge-sheets-1" -> "oge-sheets-1-88CTHNYJ".
    // Если в уроке нет генератора — пустая строка.
    function ogeSeedLabel(lesson) {
        if (!lesson || !Array.isArray(lesson.tasks)) return '';
        const seen = [];
        lesson.tasks.forEach(function (t) {
            if (t && t.ogeSeed && seen.indexOf(t.ogeSeed) === -1) seen.push(t.ogeSeed);
        });
        return seen.length ? '-' + seen.join('+') : '';
    }

    // Сколько заданий будет в уроке после подстановки (для надписи «N заданий» до открытия урока)
    function countOgeTasks(tasks) {
        let n = 0;
        tasks.forEach(function (entry) {
            if (entry && typeof entry.generator === 'string' && OGE_GENERATORS[entry.generator]) {
                entrySets(entry).forEach(function (set) {
                    const per = Array.isArray(set.parts) ? set.parts.length : OGE_GENERATORS[entry.generator].tasks.length;
                    n += per * repeatCount(set);
                });
            } else {
                n += 1;
            }
        });
        return n;
    }

    global.generateOgeBlock = generateOgeBlock;
    global.expandOgeGenerators = expandOgeGenerators;
    global.countOgeTasks = countOgeTasks;
    global.ogeSeedLabel = ogeSeedLabel;

})(window);
