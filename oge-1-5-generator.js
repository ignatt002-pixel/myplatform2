/* ===================================================
   oge-1-5-generator.js

   Генератор заданий ОГЭ 1–5. Хранит шаблоны заданий, подставляет в них
   числа, считает ответ и объяснение и отдаёт платформе обычные задания —
   такие же, как из JSON-файла урока.

   КАК ПОДКЛЮЧАТЬ В УРОКЕ (JSON урока):
     "tasks": [
       { "generator": "sheets" }                       // все 5 заданий блока «Листы»
       { "generator": "sheets", "parts": [1, 3] }      // только задания 1.1 и 1.3
       { "generator": "sheets", "seed": "v2" }         // другие числа при том же коде урока
       { "generator": "sheets", "seed": "random" }     // новые числа при каждом открытии урока
     ]

   СИД = КОД УРОКА. Числа выбираются от кода урока: один и тот же урок
   всегда выдаёт один и тот же вариант, а другой код урока — другие числа.
   Поэтому «код урока» из окна жалобы однозначно определяет вариант.

   КАК ДОБАВИТЬ НОВЫЙ БЛОК: написать OGE_GENERATORS.имя = { scenario, tasks }
   (см. OGE_GENERATORS.sheets ниже) — движок трогать не нужно.
   =================================================== */

(function (global) {
    'use strict';

    /* ---------------------------------------------------
       Движок
       --------------------------------------------------- */

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
                    'Каждый раз, когда лист режут пополам, получается формат с большим числом в названии, а сам лист становится меньше. Значит, чем больше число в названии, тем меньше лист.',
                    'Выпишем листы из таблицы от самого длинного к самому короткому: ' + v.sizesText1 + '.',
                    'Форматы ' + v.formatsText + ' идут в том же порядке: от самого большого листа к самому маленькому. Поэтому им по порядку подходят листы ' + v.numbersText1 + '.'
                ]; },
                function () { return [
                    'Запомним простое правило: А2 больше, чем А3, А3 больше, чем А4, и так далее. Чем больше число после буквы, тем меньше лист.',
                    'Значит, нужно просто расставить листы по размеру. Смотрим на длину в таблице. Вот листы от самого большого к самому маленькому: ' + v.sizesText1 + '.',
                    'Теперь сопоставляем по порядку: ' + pairs1 + '. Остаётся записать номера листов подряд.'
                ]; },
                function () { return [
                    'Представьте, что вы режете лист пополам снова и снова. Каждый кусочек получается всё меньше. С форматами так же: ' + v.formatsText + ' — это листы от большего к меньшему.',
                    'Самый большой лист в таблице — тот, у которого длина больше всех. Он подходит под самое маленькое число в названии, то есть под ' + A(formats[0]) + '. Дальше идём по убыванию длины.',
                    'Получается: ' + pairs1 + '.'
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
                    const r = ['Когда лист режут пополам, получается два листа следующего формата.'];
                    if (d === 1) r.push('Значит, из одного листа ' + A(m) + ' получится 2 листа ' + A(k) + '.');
                    else {
                        r.push('Будем резать по одному разу и считать листы: ' + partsList.join(', затем ') + '.');
                        r.push('Каждое разрезание увеличивает число листов вдвое: ' + twos + '.');
                    }
                    return r;
                },
                function () {
                    const r = ['Каждое разрезание делит лист на две одинаковые половинки, и каждая половинка — это лист следующего формата.'];
                    r.push('Чтобы из ' + A(m) + ' получить ' + A(k) + ', нужно разрезать ' + times + '.');
                    r.push(d === 1 ? 'Значит, листов получится 2.'
                                   : 'После каждого разрезания листов становится вдвое больше: ' + twos + '.');
                    return r;
                },
                function () {
                    const r = ['Давайте просто посчитаем. Берём один лист ' + A(m) + '.'];
                    for (let i = 1; i <= d; i++) {
                        const cnt = Math.pow(2, i);
                        r.push('Разрезали ' + (i === 1 ? 'его' : 'каждый лист') + ' пополам — получилось ' + cnt + ' ' +
                            plural(cnt, 'лист', 'листа', 'листов') + ' ' + A(m + i) + '.');
                    }
                    if (d > 1) r.push('Дошли до ' + A(k) + ': это ' + v.answer2 + ' ' + plural(v.answer2, 'лист', 'листа', 'листов') + '.');
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
                ? 'Это число уже кратно 10, поэтому округлять не нужно.'
                : 'Округлим до десятков: ' + value3 + ' ≈ ' + v.answer3 + '.';
            v.explain3 = pickVariant([
                function () { return [
                    'В таблице есть лист ' + v.biggest3 + '. А нам нужен лист побольше. Поэтому пойдём «наоборот»: будем из маленького листа собирать большой.',
                    'Правило такое. Если два одинаковых листа приложить друг к другу длинными сторонами, получится лист следующего, большего формата. У него короткая сторона равна длинной стороне маленького листа, а длинная сторона — это две короткие стороны маленького.',
                    stepData.map(function (x) { return A(x.f - 1) + ': короткая сторона ' + x.ns + ' мм, длинная сторона 2 · ' + x.s + ' = ' + x.nl + ' мм.'; }).join('<br>'),
                    'Значит, у листа ' + A(n3) + ' ' + sidesNom + ' равна ' + value3 + ' мм. ' + roundLine
                ]; },
                function () { return [
                    'Размеры листа ' + A(j) + ' мы знаем из таблицы: ' + big(j) + ' × ' + small(j) + ' мм (длина × ширина). Будем идти от него к листу побольше.',
                    'Как это сделать? Положим два таких листа рядом так, чтобы они соприкасались длинными сторонами. Получится лист на один формат больше. Его короткая сторона — это длинная сторона маленького листа, а длинная — две короткие стороны маленького.',
                    stepData.map(function (x) { return A(x.f) + ' → ' + A(x.f - 1) + ': короткая сторона ' + x.ns + ' мм, длинная сторона 2 · ' + x.s + ' = ' + x.nl + ' мм.'; }).join('<br>'),
                    'Получили: ' + sidesNom + ' листа ' + A(n3) + ' — ' + value3 + ' мм. ' + roundLine
                ]; },
                function () { return [
                    'Вспомним: чтобы получить меньший формат, лист режут пополам. Значит, чтобы получить больший формат, нужно, наоборот, соединить два листа. Начнём с самого большого листа в таблице — ' + v.biggest3 + '.',
                    'При соединении двух листов одна сторона остаётся такой же, а другая становится вдвое длиннее. Поэтому у нового листа короткая сторона равна длинной стороне старого, а длинная сторона — это две короткие стороны старого.',
                    stepData.map(function (x) { return 'Лист ' + A(x.f - 1) + ': короткая сторона — ' + x.ns + ' мм, длинная — 2 · ' + x.s + ' = ' + x.nl + ' мм.'; }).join('<br>'),
                    'Вот и дошли до листа ' + A(n3) + ': ' + sidesNom + ' равна ' + value3 + ' мм. ' + roundLine
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
                    'Площадь листа А0 — 1 кв. м. Переведём в квадратные сантиметры: в 1 м лежит 100 см, значит в 1 кв. м лежит 100 · 100 = 10000 кв. см.',
                    'Каждый раз, когда лист режут пополам, его площадь делится на 2. Считаем по порядку:',
                    areaSteps
                ]; },
                function () { return [
                    'Сначала переведём площадь в сантиметры: 1 кв. м = 100 см · 100 см = 10000 кв. см.',
                    'Лист А0 разрезали пополам — площадь стала в 2 раза меньше. Ещё раз разрезали — снова в 2 раза меньше. Повторяем, пока не получим ' + A(n4) + ':',
                    areaSteps
                ]; },
                function () { return [
                    'Начнём с самого большого листа А0. Его площадь — 1 кв. м, а это 10000 кв. см (ведь 1 м = 100 см, и 100 · 100 = 10000).',
                    'Каждое разрезание пополам делит площадь на 2. Так и считаем, пока не дойдём до ' + A(n4) + ':',
                    areaSteps
                ]; }
            ]);

            // ---- 1.5 ----
            const den = Math.pow(2, c.n);
            const prod5 = new Array(c.n).fill('2').join(' · ') + ' = ' + den;
            const ans5 = v.answer5;
            v.explain5 = pickVariant([
                function () { return [
                    'Площадь листа А0 — 1 кв. м. Лист ' + A(c.n) + ' получается после ' + c.n + ' ' + plural(c.n, 'разрезания', 'разрезаний', 'разрезаний') + ' пополам, и каждый раз площадь уменьшается вдвое: ' + prod5 + '. Значит, площадь одного листа — 1/' + den + ' кв. м.',
                    'Бумага площадью 1 кв. м весит ' + c.w + ' г. А наш лист в ' + den + ' ' + plural(den, 'раз', 'раза', 'раз') + ' меньше.',
                    'В пачке ' + c.N + ' листов, поэтому её масса: ' + c.N + ' · ' + c.w + ' : ' + den + ' = ' + ans5 + ' г.'
                ]; },
                function () { return [
                    'Сначала узнаем, какую часть квадратного метра занимает один лист. Лист А0 разрезали ' + c.n + ' ' + plural(c.n, 'раз', 'раза', 'раз') + ', и каждый раз площадь уменьшалась вдвое: ' + prod5 + '.',
                    'Значит, один лист ' + A(c.n) + ' — это 1/' + den + ' кв. м. В пачке ' + c.N + ' листов, их общая площадь ' + c.N + '/' + den + ' кв. м.',
                    'Квадратный метр бумаги весит ' + c.w + ' г, поэтому пачка весит ' + c.N + ' · ' + c.w + ' : ' + den + ' = ' + ans5 + ' г.'
                ]; },
                function () { return [
                    'Масса бумаги зависит от её площади. Лист ' + A(c.n) + ' по площади в ' + den + ' ' + plural(den, 'раз', 'раза', 'раз') + ' меньше листа А0 (' + prod5 + '). То есть он занимает 1/' + den + ' кв. м.',
                    'Один квадратный метр весит ' + c.w + ' г. Значит, вся пачка из ' + c.N + ' листов весит ' + c.N + ' · (1/' + den + ') · ' + c.w + ' = ' + c.N + ' · ' + c.w + ' : ' + den + ' = ' + ans5 + ' г.'
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
    //   opts.seed  — число или строка (одинаковый сид = одинаковые числа)
    //   opts.parts — какие задания блока взять, например [1, 3] (нумерация с 1)
    function generateOgeBlock(name, opts) {
        opts = opts || {};
        const def = OGE_GENERATORS[name];
        if (!def) throw new Error('OGE: нет генератора «' + name + '»');
        const seed = opts.seed === undefined ? Math.floor(Math.random() * 4294967296) : opts.seed;
        const vars = def.scenario(makeRng(seed));
        const result = [];
        def.tasks.forEach(function (template, i) {
            if (Array.isArray(opts.parts) && opts.parts.indexOf(i + 1) === -1) return;
            result.push(fill(template, vars));
        });
        return result;
    }

    // Заменяет в списке заданий урока записи { "generator": "..." } на готовые задания.
    // lessonId нужен, чтобы числа зависели от кода урока.
    function expandOgeGenerators(tasks, lessonId) {
        const out = [];
        tasks.forEach(function (entry, idx) {
            if (!entry || typeof entry.generator !== 'string') { out.push(entry); return; }
            try {
                let seed;
                if (entry.seed === 'random') {
                    seed = Math.floor(Math.random() * 4294967296);
                } else {
                    seed = seedToInt(lessonId + '|' + entry.generator + '|' + idx + '|' +
                        (entry.seed === undefined ? '' : entry.seed));
                }
                generateOgeBlock(entry.generator, { seed: seed, parts: entry.parts })
                    .forEach(function (t) { out.push(t); });
            } catch (e) {
                console.error('Ошибка генератора ОГЭ:', e);
            }
        });
        return out;
    }

    // Сколько заданий будет в уроке после подстановки (для надписи «N заданий» до открытия урока)
    function countOgeTasks(tasks) {
        let n = 0;
        tasks.forEach(function (entry) {
            if (entry && typeof entry.generator === 'string' && OGE_GENERATORS[entry.generator]) {
                n += Array.isArray(entry.parts) ? entry.parts.length : OGE_GENERATORS[entry.generator].tasks.length;
            } else {
                n += 1;
            }
        });
        return n;
    }

    global.generateOgeBlock = generateOgeBlock;
    global.expandOgeGenerators = expandOgeGenerators;
    global.countOgeTasks = countOgeTasks;

})(window);
