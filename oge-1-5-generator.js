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

            return v;
        },

        // Шаблоны пяти заданий. Всё, что в {{...}}, подставляется из scenario.
        // graph1 — пустой блок: сюда вставляется картинка с листами.
        tasks: [
            { // ---------- 1.1 ----------
                type: 'input',
                isOge: true,
                graph1: [],
                text1: '{{intro}}',
                text2: '<b>1.1</b> В таблице даны размеры (с точностью до мм) четырёх листов, имеющих форматы {{formatsText}}.',
                table1: '{{table11}}',
                text3: 'Установите соответствие между форматами и номерами листов. В ответ запишите последовательность четырёх цифр, соответствующих номерам листов, без пробелов, запятых и дополнительных символов.',
                table2: '{{matchTable}}',
                correctAnswer: '{{answer1}}',
                explanationFields: [
                    'Каждый следующий формат получается разрезанием пополам, поэтому чем больше число в названии формата, тем меньше лист.',
                    'Расположим листы из таблицы от самого большого к самому маленькому (по длине): {{sizesText1}}.',
                    'Форматы {{formatsText}} тоже идут от большего листа к меньшему, поэтому им по порядку соответствуют листы {{numbersText1}}.'
                ]
            },
            { // ---------- 1.2 ----------
                type: 'input',
                isOge: true,
                text1: '{{reminder}}',
                text2: '<b>1.2</b> Сколько листов формата {{fk}} получится из одного листа формата {{fm}}?',
                correctAnswer: '{{answer2}}',
                explanationFields: [
                    '{{explain2}}',
                    'Всего листов: {{product2}}.'
                ]
            },
            { // ---------- 1.3 ----------
                type: 'input',
                isOge: true,
                text1: '{{reminder}}',
                text2: 'Известны размеры (с точностью до мм) листов нескольких форматов:',
                table1: '{{table13}}',
                text3: '<b>1.3</b> Найдите {{sideAcc}} листа бумаги формата {{fn3}}. Ответ дайте в миллиметрах и округлите до ближайшего целого числа, кратного 10.',
                correctAnswer: '{{answer3}}',
                explanationFields: [
                    'Самый большой лист в таблице — формат {{biggest3}}.',
                    'Лист предыдущего (большего) формата можно сложить из двух таких листов по большей стороне. Поэтому его меньшая сторона равна большей стороне исходного листа, а большая сторона вдвое больше меньшей стороны исходного листа.',
                    '{{steps3}}',
                    '{{final3}}'
                ]
            },
            { // ---------- 1.4 ----------
                type: 'input',
                isOge: true,
                text1: '{{reminder}}',
                text2: '<b>1.4</b> Найдите площадь листа формата {{fn4}}. Ответ дайте в квадратных сантиметрах.',
                correctAnswer: '{{answer4}}',
                explanationFields: [
                    'Площадь листа формата А0 равна 1 кв. м. Так как 1 м = 100 см, то 1 кв. м = 100 · 100 = 10000 кв. см.',
                    'При каждом разрезании пополам площадь листа уменьшается вдвое:',
                    '{{areaSteps4}}'
                ]
            },
            { // ---------- 1.5 ----------
                type: 'input',
                isOge: true,
                text1: '{{reminder}}',
                text2: '<b>1.5</b> Бумагу формата {{fn5}} упаковали в пачки по {{sheets5}} листов. Найдите массу пачки, если масса бумаги площадью 1 кв. м равна {{weight5}} г. Ответ дайте в граммах.',
                correctAnswer: '{{answer5}}',
                explanationFields: [
                    'Площадь листа формата А0 равна 1 кв. м, а при каждом разрезании пополам площадь уменьшается вдвое. Поэтому площадь одного листа формата {{fn5}} равна 1/{{den5}} кв. м.',
                    'Масса пачки: {{sheets5}} · (1/{{den5}}) · {{weight5}} = {{sheets5}} · {{weight5}} : {{den5}} = {{answer5}} г.'
                ]
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
