/* ===================================================
   oge-sheets.js  —  ВАРИАНТ «Листы бумаги» (ОГЭ, задания 1–5)
 
   Подключается ПОСЛЕ oge-1-5-generator.js (движок).
   Урок: { "generator": "sheets" } — см. описание записи в движке.
 
   Номера для "parts": 1, 2, 3, 4, а у пятого задания два типа:
     5.1 — масса пачки,  5.2 — размер шрифта на другом формате,
     5   — любой из двух (выбирается случайно)
   Без "parts" берутся 1, 2, 3, 4 и один случайный тип пятого.
   =================================================== */
 
(function (global) {
    'use strict';
 
    const OGE_GENERATORS = global.OGE_GENERATORS = global.OGE_GENERATORS || {};
    const U = global.OGE_UTILS;
    if (!U) { console.error('oge-sheets.js: сначала подключи oge-1-5-generator.js (движок)'); return; }
    const plural = U.plural, listAnd = U.listAnd;
 
    const A = function (n) { return '\u0410' + n; };    // «А» кириллицей, как в условии ОГЭ: А0, А1, ...
 
 
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
 
    // График листов (из задания 1) — показывается во всех пяти заданиях
    const SHEETS_GRAPH = [
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
    ];
 
    OGE_GENERATORS.sheets = {
        title: 'Листы, 1–5 задания',
 
        // Выбор чисел и все расчёты. Возвращает значения для меток {{...}} в шаблонах.
        scenario: function (rnd) {
            const v = {};
            v.intro = SHEETS_INTRO;
 
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
 
            // ---- 1.5 (тип 2): размер шрифта на листе другого формата ----
            // Соседние форматы отличаются в 1,4 раза (1,4 = 7/5), через один формат — в 1,4·1,4 = 1,96.
            // Считаем дробью num/den, чтобы не было ошибок округления.
            const fontCombos = [];
            for (let from = 1; from <= 6; from++) {
                [-2, -1, 1, 2].forEach(function (shift) {
                    const to = from + shift;
                    if (to < 1 || to > 6) return;
                    [12, 14, 16, 18, 20, 22, 24, 28, 30, 32, 36, 40].forEach(function (size) {
                        const k = Math.abs(shift);
                        const bigger = to < from;          // меньшее число в названии = лист больше
                        const num = size * Math.pow(bigger ? 7 : 5, k);
                        const den = Math.pow(bigger ? 5 : 7, k);
                        if (Math.abs((num / den) % 1 - 0.5) < 0.06) return;   // без «почти .5»
                        fontCombos.push({ from: from, to: to, size: size, k: k, bigger: bigger, num: num, den: den });
                    });
                });
            }
            const fc = rnd.pick(fontCombos);
            fc.answer = Math.round(fc.num / fc.den);
            fc.exact = fc.num % fc.den === 0;
            v.fontFrom = A(fc.from);
            v.fontTo = A(fc.to);
            v.fontPt = fc.size;
            v.fontPtWord = plural(fc.size, 'пункт', 'пункта', 'пунктов');
            v.answer5b = fc.answer;
 
            // Какой тип пятого задания показывать, если в parts написано просто 5 (или parts нет)
            v.variant5 = rnd.pick(['5.1', '5.2']);
 
 
            /* ---------------------------------------------------
               Объяснения. Задания 1.1, 1.3, 1.4, 1.5 — одно объяснение, которое подстраивается
               под числа и условие (столбик «Длина»/«Ширина», что просят найти и т. д.).
               Задание 1.2 — три формулировки, одна выбирается случайно (от сида), после
               всех выборов чисел, поэтому сами числа на выбор не влияют.
               --------------------------------------------------- */
            const pickVariant = function (variants) { return variants[rnd.int(0, variants.length - 1)](); };
            const sidesNom = sideNom;
 
            // ---- 1.1 ----
            const ARROW = ' $\\rightarrow$ ';
            const col1 = rnd.pick(['Длина', 'Ширина']);   // по какому столбику таблицы объяснять
            const colVals = formats.map(function (n) { return col1 === 'Длина' ? big(n) : small(n); });
            v.explain1 = [
                '1. Смотрим в таблицу на столбик «' + col1 + '» и расставляем числа от большего к меньшему:<br>' + colVals.join(ARROW),
                '2. Выписываем форматы из условия так же — в порядке уменьшения:<br>' + formats.map(A).join(ARROW) + '.',
                '3. Сопоставляем форматы и номера листов:<br>' + formats.map(function (n, i) {
                    return A(n) + ARROW + colVals[i] + ARROW + 'номер ' + numbers[i];
                }).join('<br>')
            ];
 
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
            // Идём от ближайшего известного формата (самый большой лист таблицы) вверх:
            // на каждом шаге удваиваем меньшую сторону, большая остаётся. Порядок «длина×ширина» как в таблице.
            let pair3 = [big(j), small(j)];
            const grow3 = [];
            for (let f = j; f > n3; f--) {
                const idx = pair3[0] < pair3[1] ? 0 : 1;      // какая сторона меньшая
                pair3 = pair3.slice();
                pair3[idx] = pair3[idx] * 2;
                grow3.push('Умножаем меньшую сторону на 2:<br>' + A(f - 1) + ' — ' + pair3[0] + '×' + pair3[1] + ' мм.');
            }
            const lastLine3 = (value3 % 10 === 0)
                ? 'Нас просили найти ' + sideAcc + ', но она уже кратна 10, поэтому так и записываем её в ответ!'
                : 'Нас просили найти ' + sideAcc + '. Округляем её до десятков (' + value3 + ' ≈ ' + v.answer3 + ') и записываем в ответ!';
            v.explain3 = [
                'Если мы разрежем пополам один лист ' + A(0) + ', то выйдет два листа ' + A(1) + '. А если мы соединим два листа ' + A(1) + ', то выйдет один лист ' + A(0) + '.<br>Суть: 1 больший лист равен 2 меньшим.',
                'У форматов стороны повторяются, поэтому при переходе от меньшего формата к большему меньшая его сторона увеличивается в 2 раза, а большая остаётся неизменной.',
                'Зная это, возьмём ближайший известный нам формат к тому, который просят найти, и начнём по порядку увеличивать форматы:<br>' + A(j) + ' — ' + big(j) + '×' + small(j) + ' мм.'
            ].concat(grow3).concat([lastLine3]);
 
            // ---- 1.4 ----
            const areaVals = [10000];
            for (let f = 1; f <= n4; f++) areaVals.push(areaVals[f - 1] / 2);
            v.explain4 = [
                'Из условия первой задачи мы знаем, что площадь листа ' + A(0) + ' равна 1 кв. м, то есть 10000 кв. см.',
                'Если мы разделим эти 10000 пополам, то получившиеся ' + areaVals[1] + ' кв. см будут площадью листа ' + A(1) + '.'
            ];
            if (n4 === 1) {
                v.explain4.push('Это и есть нужный нам формат ' + A(1) + '. Записываем ' + areaVals[1] + ' в ответ!');
            } else {
                const areaRows = [];
                for (let f = 2; f <= n4; f++) areaRows.push(A(f) + ' = ' + areaVals[f - 1] + '÷2 = ' + areaVals[f] + ' кв. см.');
                v.explain4.push('Продолжаем делить площади форматов на 2, пока не дойдём до нужного ' + A(n4) + ':<br>' + areaRows.join('<br>'));
                v.explain4.push('Записываем ' + areaVals[n4] + ' в ответ!');
            }
 
            // ---- 1.5 ----
            const ruNum = function (x) { return String(x).replace('.', ','); };
            const massRows = [];
            let massLast = c.w;
            for (let i = 0; i <= c.n; i++) {
                massLast = c.w / Math.pow(2, i);
                massRows.push(ruNum(massLast) + ' г. — ' + A(i));
            }
            v.explain5 = [
                'Сначала найдём массу одного листа ' + A(c.n) + '. Самый лёгкий способ это сделать — просто делить форматы пополам, начиная с ' + A(0) + ', пока не дойдём до ' + A(c.n) + ':<br>' + massRows.join('<br>'),
                'Остаётся только умножить массу листа ' + A(c.n) + ' на количество этих листов в пачке:<br>' + ruNum(massLast) + ' × ' + c.N + ' = ' + v.answer5
            ];
 
            // ---- 1.5 (тип 2) ----
            const factorText = fc.k === 1 ? '1,4' : '1,96';
            const operation = fc.bigger ? '×' : '÷';
            const exactValue = fc.num / fc.den;
            const calcShown = fc.exact
                ? fc.size + operation + factorText + '=' + exactValue
                : fc.size + operation + factorText + '=' + ruNum(Math.floor(fc.num * 10 / fc.den) / 10) + '...';
            const ptWord = plural(fc.size, 'пункт', 'пункта', 'пунктов');
            v.explain5b = ['Соседние форматы отличаются друг от друга по длине и ширине в 1,4 раза.'];
            if (fc.k === 2) {
                v.explain5b.push('Форматы ' + A(fc.from) + ' и ' + A(fc.to) + ' разделяет ещё один формат (' + A((fc.from + fc.to) / 2) +
                    '), поэтому разница между ними — 1,4 · 1,4 = 1,96 раза.');
            }
            v.explain5b.push(fc.bigger
                ? 'Лист ' + A(fc.to) + ' больше листа ' + A(fc.from) + '.'
                : 'Лист ' + A(fc.to) + ' меньше листа ' + A(fc.from) + '.');
            v.explain5b.push('Чтобы найти, сколько пунктов будет текст на листе ' + A(fc.to) + ', если на ' + A(fc.from) + ' он ' +
                fc.size + ' ' + ptWord + ', нам нужно ' + (fc.bigger ? 'умножить ' : 'разделить ') + fc.size + ' на ' + factorText + ':<br>' + calcShown);
            v.explain5b.push(fc.exact
                ? 'Получилось целое число, поэтому округлять не нужно. Записываем ' + fc.answer + ' в ответ.'
                : 'Осталось только округлить ответ до целого. Получается ' + fc.answer + '.');
 
            return v;
        },
 
        // Шаблоны пяти заданий. Всё, что в {{...}}, подставляется из scenario.
        // graph1 — рисунок с листами (команды для рисовалки графиков).
        tasks: [
            { // ---------- 1.1 ----------
                type: 'input',
                isOge: true,
                graph1: SHEETS_GRAPH,
                text1: '{{intro}}',
                text2: '<b>1.</b> В таблице даны размеры (с точностью до мм) четырёх листов, имеющих форматы {{formatsText}}.',
                table1: '{{table11}}',
                text3: 'Установите соответствие между форматами и номерами листов. В ответ запишите последовательность четырёх цифр, соответствующих номерам листов, без пробелов, запятых и дополнительных символов.',
                table2: '{{matchTable}}',
                correctAnswer: '{{answer1}}',
                explanationFields: '{{explain1}}'
            },
            { // ---------- 1.2 ----------
                type: 'input',
                isOge: true,
                graph1: SHEETS_GRAPH,
                text2: '<b>2.</b> Сколько листов формата {{fk}} получится из одного листа формата {{fm}}?',
                correctAnswer: '{{answer2}}',
                explanationFields: '{{explain2}}'
            },
            { // ---------- 1.3 ----------
                type: 'input',
                isOge: true,
                graph1: SHEETS_GRAPH,
                text2: 'Известны размеры (с точностью до мм) листов нескольких форматов:',
                table1: '{{table13}}',
                text3: '<b>3.</b> Найдите {{sideAcc}} листа бумаги формата {{fn3}}. Ответ дайте в миллиметрах и округлите до ближайшего целого числа, кратного 10.',
                correctAnswer: '{{answer3}}',
                explanationFields: '{{explain3}}'
            },
            { // ---------- 1.4 ----------
                type: 'input',
                isOge: true,
                graph1: SHEETS_GRAPH,
                text2: '<b>4.</b> Найдите площадь листа формата {{fn4}}. Ответ дайте в квадратных сантиметрах.',
                correctAnswer: '{{answer4}}',
                explanationFields: '{{explain4}}'
            },
            { // ---------- 1.5 ----------
                type: 'input',
                isOge: true,
                graph1: SHEETS_GRAPH,
                text2: '<b>5.</b> Бумагу формата {{fn5}} упаковали в пачки по {{sheets5}} листов. Найдите массу пачки, если масса бумаги площадью 1 кв. м равна {{weight5}} г. Ответ дайте в граммах.',
                correctAnswer: '{{answer5}}',
                explanationFields: '{{explain5}}'
            },
            { // ---------- 1.5, тип 2 ----------
                type: 'input',
                isOge: true,
                graph1: SHEETS_GRAPH,
                text2: '<b>5.</b> Размер (высота) типографического шрифта измеряется в пунктах. Один пункт равен 1/72 дюйма, то есть 0,3528 мм. Какой высоты нужен шрифт (в пунктах), чтобы текст был расположен на листе формата {{fontTo}} так же, как этот же текст, напечатанный шрифтом высотой {{fontPt}} {{fontPtWord}} на листе формата {{fontFrom}}? Размер шрифта округляется до целого.',
                correctAnswer: '{{answer5b}}',
                explanationFields: '{{explain5b}}'
            }
        ],
 
        // Номера заданий (для "parts" в JSON), по порядку шаблонов выше.
        // Задание 5 бывает двух типов: 5.1 и 5.2; запись "5" означает «любой из двух».
        taskIds: ['1', '2', '3', '4', '5.1', '5.2'],
 
        // Что брать, если в JSON нет "parts"
        defaultParts: ['1', '2', '3', '4', '5'],
 
        // «5» в parts = один из двух типов пятого задания (тип выбрал scenario: vars.variant5)
        selectTask: function (id, wanted, vars) {
            if (wanted.indexOf(id) !== -1) return true;
            return wanted.indexOf('5') !== -1 && (id === '5.1' || id === '5.2') && id === vars.variant5;
        }
    };
 
 
})(window);
 
