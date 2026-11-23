/* ===================================================
   oge-tariffs.js  —  ВАРИАНТ «Тарифы» (ОГЭ, задания 1.1–1.4)
 
   Подключается ПОСЛЕ oge-1-5-generator.js (движок).
   Урок: { "generator": "tariffs" } — см. описание записи в движке.
 
   Номера для "parts":
     1.1 — по таблице с гигабайтами найти номера месяцев
     1.2 — сколько абонент потратил на связь в одном из месяцев
     1.3 — сколько месяцев превышен лимит интернета
     1.4 — на сколько процентов вырос трафик по сравнению с прошлым месяцем
   Без "parts" берутся все четыре.
   Пример:  { "generator": "tariffs", "parts": [1.1, 1.3], "count": 4 }
 
   УСЛОВИЕ пишется полностью только в задании 1.1. В остальных — только график и вопрос.
 
   КАК УСТРОЕН ГРАФИК. Шаблон (TARIFF_GRAPH_BASE) не меняется. К нему в конец
   добавляются две строки с 12 точками (по одной на месяц):
       line.49bff7.width2.marked:   — минуты (сплошная)
       dashed_line.r.width2.marked: — гигабайты (пунктир)
   Точка записывается «месяц;Y». Шкалы:   минуты = Y · 25,   гигабайты = Y / 4.
   (Y = 2 это 50 мин. и 0,5 ГБ; Y = 16 это 400 мин. и 4 ГБ.)
   ПАКЕТ ТАРИФА И ЛИНИЯ ЛИМИТА. Минуты и гигабайты пакета всегда лежат на одной высоте графика
   (300 мин. и 3 ГБ, 250 мин. и 2,5 ГБ и т. д.: пакет минут = пакет ГБ · 100), поэтому тариф
   показывает одна горизонтальная линия:  line.c.width2: 0;Y 13;Y   (Y = пакет ГБ · 4 = пакет минут / 25).
   Она добавляется перед линиями данных, чтобы точки рисовались поверх неё.
   В одном ряду соседние точки никогда не стоят на одной высоте.
   ВАЖНО: ответы считаются из тех же двенадцати чисел Y (ymin и ygb), из которых
   строятся две строки графика. Поэтому график и ответ разойтись не могут.
   =================================================== */
 
(function (global) {
    'use strict';
 
    const OGE_GENERATORS = global.OGE_GENERATORS = global.OGE_GENERATORS || {};
    const U = global.OGE_UTILS;
    if (!U) { console.error('oge-tariffs.js: сначала подключи oge-1-5-generator.js (движок)'); return; }
    const listAnd = U.listAnd, ruNum = U.ruNum;
 
    // Шаблон графика: не меняется. Две строки с данными дописываются в конец.
    const TARIFF_GRAPH_BASE = [
        'crop: -2.5;-2 15.5;21',
        'line.cccccc.width2: 0;18 0;0 13;0 13;18',
        'line.c3c3c3.width2: -0.4;17.5 0;18 0.4;17.5',
        'line.c3c3c3.width2: 12.6;17.5 13;18 13.4;17.5',
        'text.-1.4;19.5: мин.',
        'text.14.6;19.5: гб.',
        'line.49bff7: -2.2;18.5 -0.8;18.5',
        'dashed_line.r: 13.8;18.5 15.2;18.5',
        'tick_mark_horizontal.c 50: 0;2',
        'tick_mark_horizontal.c 100: 0;4',
        'tick_mark_horizontal.c 150: 0;6',
        'tick_mark_horizontal.c 200: 0;8',
        'tick_mark_horizontal.c 250: 0;10',
        'tick_mark_horizontal.c 300: 0;12',
        'tick_mark_horizontal.c 350: 0;14',
        'tick_mark_horizontal.c 400: 0;16',
        'tick_mark_horizontal.right.c 0,5: 13;2',
        'tick_mark_horizontal.right.c 1: 13;4',
        'tick_mark_horizontal.right.c 1,5: 13;6',
        'tick_mark_horizontal.right.c 2: 13;8',
        'tick_mark_horizontal.right.c 2,5: 13;10',
        'tick_mark_horizontal.right.c 3: 13;12',
        'tick_mark_horizontal.right.c 3,5: 13;14',
        'tick_mark_horizontal.right.c 4: 13;16',
        'tick_mark.gray 1: 1;0',
        'tick_mark.gray 2: 2;0',
        'tick_mark.gray 3: 3;0',
        'tick_mark.gray 4: 4;0',
        'tick_mark.gray 5: 5;0',
        'tick_mark.gray 6: 6;0',
        'tick_mark.gray 7: 7;0',
        'tick_mark.gray 8: 8;0',
        'tick_mark.gray 9: 9;0',
        'tick_mark.gray 10: 10;0',
        'tick_mark.gray 11: 11;0',
        'tick_mark.gray 12: 12;0'
    ];
 
    const Y_MIN = 3, Y_MAX = 16;          // в каких пределах гуляют точки
 
    const MONTH_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
    const MONTH_INSTR = ['январем', 'февралем', 'мартом', 'апрелем', 'маем', 'июнем', 'июлем', 'августом', 'сентябрем', 'октябрем', 'ноябрем', 'декабрем'];
    const TARIFF_NAMES = ['Стандартный', 'Базовый', 'Оптимальный', 'Комфортный', 'Активный', 'Удобный'];
 
    const minutesOf = function (y) { return y * 25; };           // Y -> минуты
    const gbOf = function (y) { return y / 4; };                  // Y -> гигабайты
    const gbText = function (y) { return ruNum(gbOf(y)); };      // 13 -> «3,25»
 
    /* ---------------------------------------------------
       Один «удобный» ряд из 12 точек (значения Y по месяцам).
       Линия идёт кусками: пару-тройку месяцев вверх, потом вниз, и так далее.
       Шаги в основном чётные (2, 4), потом в 2–4 месяцах добавляется ±1, чтобы были и нечётные Y.
       --------------------------------------------------- */
    function makeSeries(rnd, lim) {
        for (let t = 0; t < 60; t++) {
            const y = [Math.max(4, Math.min(Y_MAX, lim + rnd.pick([-4, -2, 0, 2])))];   // старт рядом с линией лимита (чётное число)
            let dir = rnd.pick([-1, 1]);
            while (y.length < 12) {
                const len = rnd.int(2, 4);                   // сколько месяцев тянем в одну сторону
                for (let j = 0; j < len && y.length < 12; j++) {
                    const last = y[y.length - 1];
                    const step = dir * rnd.pick([2, 2, 2, 4]);
                    let next = last + step;
                    if (next < Y_MIN || next > Y_MAX) next = last - step;   // уткнулись в край — разворачиваем
                    y.push(next);
                }
                dir = -dir;
            }
            // немножко нечётных значений
            rnd.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).slice(0, rnd.int(2, 4)).forEach(function (i) {
                const nv = y[i] + rnd.pick([-1, 1]);
                if (nv >= Y_MIN && nv <= Y_MAX) y[i] = nv;
            });
            if (isNiceSeries(y)) return y;
        }
        return null;
    }
 
    function isNiceSeries(y) {
        const odd = y.filter(function (v) { return v % 2 === 1; }).length;
        if (odd < 2 || odd > 4) return false;
        if (Math.max.apply(null, y) - Math.min.apply(null, y) < 6) return false;      // не слишком плоская
        let turns = 0, prev = 0;
        for (let i = 1; i < y.length; i++) {
            const d = y[i] - y[i - 1];
            if (d === 0) return false;                                                  // соседние точки на разной высоте
            if (Math.abs(d) > 5) return false;                                          // без резких скачков
            const s = Math.sign(d);
            if (s !== 0) { if (prev !== 0 && s !== prev) turns++; prev = s; }
        }
        return turns <= 5;                                                              // без «зигзагов»
    }
 
    /* ---------------------------------------------------
       Один полный набор данных: тариф + два ряда.
       Возвращает null, если из этого набора не выходят нормальные задания.
       sep — на сколько клеток минимум должны отличаться две точки одного месяца
       (чтобы кружки сплошной и пунктирной линий не лежали друг на друге).
       --------------------------------------------------- */
    function drawData(rnd, sep, pg) {
        const d = {
            name: rnd.pick(TARIFF_NAMES),
            year: rnd.int(2019, 2024),
            fee: rnd.pick([300, 350, 400, 450, 500]),
            pg: pg,                                       // ГБ в пакете (выбран заранее, чтобы пакеты выпадали поровну)
            sms: rnd.pick([100, 120, 150]),
            priceMin: rnd.pick([2, 3, 4]),
            priceGb: rnd.pick([60, 80, 90, 100, 120]),    // за каждые 0,5 ГБ
            priceSms: rnd.pick([1, 2, 3])
        };
        d.pm = d.pg * 100;                                // минут в пакете: на графике это та же высота, что и пакет ГБ
        d.smsSent = d.sms - 5 * rnd.int(1, 4);            // за ВСЁ время меньше пакета в месяц, доплаты за СМС нет
        d.ymin = makeSeries(rnd, pg * 4);
        d.ygb = makeSeries(rnd, pg * 4);
        if (!d.ymin || !d.ygb) return null;
 
        const limMin = d.pm / 25, limGb = d.pg * 4;       // лимиты в клетках графика (всегда равны)
        d.limMin = limMin; d.limGb = limGb;
        for (let i = 0; i < 12; i++) {
            if (Math.abs(d.ymin[i] - d.ygb[i]) < sep) return null;
        }
 
        // 1.3: сколько месяцев выше лимита интернета (хотим от 3 до 8)
        d.over = []; d.equal = [];
        d.ygb.forEach(function (y, i) {
            if (y > limGb) d.over.push(i + 1);
            else if (y === limGb) d.equal.push(i + 1);
        });
        // у высокого лимита (3,5 ГБ) над линией мало места, поэтому достаточно двух месяцев
        if (d.over.length < (limGb >= 14 ? 2 : 3) || d.over.length > 8) return null;
        // минуты тоже должны пересекать линию лимита (и не всё время сидеть выше или ниже неё)
        const minOver = d.ymin.filter(function (y) { return y > limMin; }).length;
        if (minOver < 2 || minOver > 10) return null;
 
        // 1.1: нужны хотя бы 4 месяца, у которых значение гигабайтов встречается в году только один раз
        d.uniq = [];
        d.ygb.forEach(function (y, i) {
            if (d.ygb.filter(function (z) { return z === y; }).length === 1) d.uniq.push(i);
        });
        if (d.uniq.length < 4) return null;
 
        // 1.2: месяц с доплатой; лишние гигабайты должны делиться на 0,5 (тогда доплата считается ровно)
        d.cand2 = [];
        for (let i = 0; i < 12; i++) {
            const anyOver = d.ymin[i] > limMin || d.ygb[i] > limGb;
            const gbOk = d.ygb[i] <= limGb || d.ygb[i] % 2 === 0;
            if (anyOver && gbOk) d.cand2.push(i);
        }
        if (d.cand2.length < 1) return null;
 
        // 1.4: рост по сравнению с прошлым месяцем, процент получается целым
        d.cand4 = [];
        for (let i = 1; i < 12; i++) {
            const a = d.ygb[i - 1], b = d.ygb[i];
            if (b > a && (100 * (b - a)) % a === 0) d.cand4.push(i);
        }
        if (d.cand4.length < 1) return null;
        return d;
    }
 
    OGE_GENERATORS.tariffs = {
        title: 'Тарифы, 1.1–1.4 задания',
 
        scenario: function (rnd) {
            // Подбираем данные, пока не получится набор, из которого выходят все четыре задания.
            const pg = rnd.pick([2, 2.5, 3, 3.5]);                   // пакет выбираем один раз: так все четыре тарифа выпадают поровну
            let d = null;
            for (let attempt = 0; attempt < 4000 && !d; attempt++) {
                d = drawData(rnd, attempt < 2000 ? 2 : 0, pg);
            }
            if (!d) throw new Error('OGE tariffs: не удалось подобрать данные');
 
            const v = {};
            const pgText = ruNum(d.pg);
 
            // ---- график: шаблон + две строки по 12 точек ----
            const pts = function (ys) { return ys.map(function (y, i) { return (i + 1) + ';' + y; }).join(' '); };
            v.limY = d.limGb;
            v.graph = TARIFF_GRAPH_BASE.concat([
                'line.c.width2: 0;' + d.limGb + ' 13;' + d.limGb,            // линия тарифа: пакет минут и пакет ГБ
                'line.49bff7.width2.marked: ' + pts(d.ymin),
                'dashed_line.r.width2.marked: ' + pts(d.ygb)
            ]);
            v.ymin = d.ymin; v.ygb = d.ygb;                  // для проверок и отладки
 
            // ---- условие (показывается только в 1.1) ----
            v.statement =
                'На рисунке точками показано количество минут исходящих вызовов и трафик мобильного интернета в гигабайтах, ' +
                'израсходованных абонентом в процессе пользования смартфоном, за каждый месяц ' + d.year + ' года. ' +
                'Для удобства точки, соответствующие минутам и гигабайтам, соединены сплошными и пунктирными линиями соответственно.' +
                '<br>В течение года абонент пользовался тарифом «' + d.name + '», абонентская плата по которому составляла ' + d.fee + ' рублей в месяц. ' +
                'В абонентскую плату тарифа «' + d.name + '» входит:' +
                '<br>• пакет минут, включающий ' + d.pm + ' минут исходящих вызовов на номера;' +
                '<br>• пакет интернета, включающий ' + pgText + ' гигабайта мобильного интернета;' +
                '<br>• пакет СМС, включающий ' + d.sms + ' СМС в месяц;' +
                '<br>• безлимитные бесплатные входящие вызовы.' +
                '<br>Стоимость минут, интернета и СМС сверх пакета тарифа указана в таблице.';
            v.ratesTable = {
                rows: [
                    ['Исходящие звонки', d.priceMin + ' руб./мин.'],
                    ['Мобильный интернет', d.priceGb + ' руб. за 0,5 ГБ'],
                    ['СМС', d.priceSms + ' руб./шт.']
                ]
            };
            v.smsSent = d.smsSent;
            v.year = d.year;
 
            // ---- 1.1: какие месяцы соответствуют гигабайтам из таблицы ----
            let pool = rnd.shuffle(d.uniq);
            const oddUniq = d.uniq.filter(function (i) { return d.ygb[i] % 2 === 1; });
            if (oddUniq.length) {                            // хотя бы одно значение «между делениями», как 3,25 в образце
                const o = rnd.pick(oddUniq);
                pool = [o].concat(pool.filter(function (i) { return i !== o; }));
            }
            const chosen = pool.slice(0, 4);
            let order;
            do { order = rnd.shuffle(chosen); }
            while (order.every(function (m, i) { return i === 0 || order[i - 1] < m; }));   // не отдаём 1, 2, 3, 4 по возрастанию
 
            v.matchTable = {
                header: ['Мобильный интернет'].concat(order.map(function (i) { return gbText(d.ygb[i]) + ' Гб'; })),
                rows: [['Номер месяца', '', '', '', '']]
            };
            v.answer1 = order.map(function (i) { return i + 1; }).join('');
            v.explain1 = [
                '1. Гигабайты показывает пунктирная линия. Читаем её по правой шкале.',
                '2. Для каждого значения из таблицы находим точку на пунктире и смотрим, над каким номером месяца она стоит:<br>' +
                order.map(function (i) {
                    const y = d.ygb[i];
                    const between = y % 2 === 1
                        ? ' (точка посередине между делениями ' + gbText(y - 1) + ' и ' + gbText(y + 1) + ')'
                        : '';
                    return gbText(y) + ' Гб' + between + ' $\\rightarrow$ месяц ' + (i + 1);
                }).join('<br>'),
                '3. Записываем номера месяцев в том порядке, в каком идёт таблица, без пробелов: ' +
                order.map(function (i) { return i + 1; }).join(', ') + ' $\\rightarrow$ ' + v.answer1 + '.'
            ];
 
            // ---- 1.2: сколько потратил в выбранном месяце ----
            const m2 = rnd.pick(d.cand2);
            const mins = minutesOf(d.ymin[m2]), gb = gbOf(d.ygb[m2]);
            const overMin = Math.max(0, mins - d.pm);
            const overGb = Math.max(0, gb - d.pg);
            const costMin = overMin * d.priceMin;
            const k = overGb * 2;                            // сколько раз по 0,5 ГБ
            const costGb = k * d.priceGb;
            const total = d.fee + costMin + costGb;
            v.month2 = MONTH_PREP[m2];
            v.answer2 = total;
            v.explain2 = [
                'Горизонтальная линия на графике — пакет тарифа: ' + d.pm + ' мин. и ' + pgText + ' ГБ.',
                'Смотрим на график над номером месяца ' + (m2 + 1) + ': сплошная линия (левая шкала) показывает ' + mins + ' мин., ' +
                'пунктир (правая шкала) показывает ' + ruNum(gb) + ' ГБ.',
                overMin > 0
                    ? 'Минут ' + mins + ' больше пакета (' + d.pm + '). Лишних: ' + mins + ' − ' + d.pm + ' = ' + overMin + ' мин. ' +
                      'Платим ' + overMin + ' · ' + d.priceMin + ' = ' + costMin + ' руб.'
                    : 'Минут ' + mins + ' — не больше пакета (' + d.pm + '), доплаты за минуты нет.',
                overGb > 0
                    ? 'Интернета ' + ruNum(gb) + ' ГБ больше пакета (' + pgText + ' ГБ). Лишних: ' + ruNum(gb) + ' − ' + pgText + ' = ' + ruNum(overGb) + ' ГБ. ' +
                      (k === 1
                          ? 'Это как раз 0,5 ГБ, платим ' + d.priceGb + ' руб.'
                          : 'Это ' + k + ' раза по 0,5 ГБ, платим ' + k + ' · ' + d.priceGb + ' = ' + costGb + ' руб.')
                    : 'Интернета ' + ruNum(gb) + ' ГБ — не больше пакета (' + pgText + ' ГБ), доплаты за интернет нет.',
                'СМС за весь год отправлено ' + d.smsSent + ', а в пакете ' + d.sms + ' в месяц, поэтому доплаты за СМС нет.',
                'Складываем абонентскую плату и доплаты: ' + d.fee + ' + ' + costMin + ' + ' + costGb + ' = ' + total + ' руб.'
            ];
 
            // ---- 1.3: сколько месяцев превышен лимит интернета ----
            v.answer3 = d.over.length;
            v.explain3 = [
                'В пакет входит ' + pgText + ' ГБ интернета. На графике это горизонтальная линия. Интернет показывает пунктирная линия (правая шкала).',
                'Считаем точки пунктира, которые лежат выше горизонтальной линии. Это месяцы: ' + listAnd(d.over.map(String)) + '.'
            ].concat(d.equal.length
                ? ['Точки ровно на горизонтальной линии (' + (d.equal.length === 1 ? 'месяц ' : 'месяцы ') +
                   listAnd(d.equal.map(String)) + ') не считаем: это не превышение.']
                : []
            ).concat(['Всего таких месяцев: ' + d.over.length + '.']);
 
            // ---- 1.4: на сколько процентов вырос трафик ----
            const m4 = rnd.pick(d.cand4);
            const a = d.ygb[m4 - 1], b = d.ygb[m4];
            const percent = (100 * (b - a)) / a;
            v.month4 = MONTH_PREP[m4];
            v.prev4 = MONTH_INSTR[m4 - 1];
            v.answer4 = percent;
            v.explain4 = [
                'Читаем пунктирную линию (правая шкала): в ' + MONTH_PREP[m4 - 1] + ' было ' + gbText(a) + ' ГБ, в ' + MONTH_PREP[m4] + ' стало ' + gbText(b) + ' ГБ.',
                'Трафик вырос на ' + gbText(b) + ' − ' + gbText(a) + ' = ' + ruNum(gbOf(b - a)) + ' ГБ.',
                'Сравниваем с тем, что было раньше: ' + ruNum(gbOf(b - a)) + ' : ' + gbText(a) + ' = ' + ruNum(percent / 100) + '.',
                'Переводим в проценты: ' + ruNum(percent / 100) + ' · 100% = ' + percent + '%.'
            ];
 
            return v;
        },
 
        // Шаблоны заданий. Условие (statement, таблица цен, число СМС) — только в 1.1.
        // В остальных заданиях — график и вопрос.
        tasks: [
            { // ---------- 1.1 ----------
                type: 'input',
                isOge: true,
                graph1: '{{graph}}',
                text1: '{{statement}}',
                table1: '{{ratesTable}}',
                text2: 'Абонент не пользовался услугами связи в роуминге. За весь год абонент отправил {{smsSent}} СМС.',
                text3: '<b>1.1</b> Определите, какие месяцы соответствуют указанному в таблице трафику мобильного интернета.',
                table2: '{{matchTable}}',
                text4: 'В ответ запишите последовательность цифр без пробелов и запятых.',
                correctAnswer: '{{answer1}}',
                explanationFields: '{{explain1}}'
            },
            { // ---------- 1.2 ----------
                type: 'input',
                isOge: true,
                graph1: '{{graph}}',
                text1: '<b>1.2</b> Сколько потратил абонент на услуги связи в {{month2}}?',
                correctAnswer: '{{answer2}}',
                explanationFields: '{{explain2}}'
            },
            { // ---------- 1.3 ----------
                type: 'input',
                isOge: true,
                graph1: '{{graph}}',
                text1: '<b>1.3</b> Сколько месяцев в {{year}} году абонент превысил лимит по пакету мобильного интернета?',
                correctAnswer: '{{answer3}}',
                explanationFields: '{{explain3}}'
            },
            { // ---------- 1.4 ----------
                type: 'input',
                isOge: true,
                graph1: '{{graph}}',
                text1: '<b>1.4</b> На сколько процентов увеличился трафик мобильного интернета в {{month4}} по сравнению с {{prev4}} {{year}} года?',
                correctAnswer: '{{answer4}}',
                explanationFields: '{{explain4}}'
            }
        ],
 
        taskIds: ['1.1', '1.2', '1.3', '1.4'],
        defaultParts: ['1.1', '1.2', '1.3', '1.4']
    };
 
})(window);
 
