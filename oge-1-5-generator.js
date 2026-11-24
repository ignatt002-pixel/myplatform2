/* ===================================================
   oge-1-5-generator.js  —  ДВИЖОК генератора заданий ОГЭ 1–5
 
   Здесь лежит только общее: сид, случайные числа, подстановка {{...}},
   сборка заданий и правила записи в JSON урока. Сами варианты (листы,
   тарифы и т. д.) живут в отдельных файлах и подключаются ПОСЛЕ этого:
 
       <script src="oge-1-5-generator.js" defer></script>   <!-- движок: первым -->
       <script src="oge-sheets.js"        defer></script>   <!-- вариант «Листы» -->
       <script src="oge-tariffs.js"       defer></script>   <!-- вариант «Тарифы» (когда будет) -->
       <script src="script.js"            defer></script>
 
   Движок хранит шаблоны заданий, подставляет в них числа, считает ответ и объяснение и отдаёт
   платформе обычные задания — такие же, как из JSON-файла урока.
 
   КАК ПОДКЛЮЧАТЬ В УРОКЕ (JSON урока), имя после "generator" — это имя варианта:
     "tasks": [
       { "generator": "sheets" }                       // весь блок (какие задания — см. defaultParts варианта)
       { "generator": "sheets", "parts": [1, 3] }      // только задания 1 и 3
       // допустимые номера в parts описаны в файле варианта (у листов: 1, 2, 3, 4, 5.1, 5.2, 5)
       { "generator": "sheets", "parts": [5.2], "count": 4 }
       { "generator": "sheets", "seed": "TEST1" }      // зафиксированный вариант (для проверки)
 
       // сколько раз показать набор ("count"); набор из 1.1 и 1.3 покажется 6 раз: 1,3,1,3,...
       { "generator": "sheets", "parts": [1, 3], "count": 6 }
 
       // свои тексты: покажутся В НАЧАЛЕ первого сгенерированного задания (над графиком и условием).
       // Несколько блоков — через text, text1, text2... (одинаковые ключи в JSON писать нельзя)
       { "text": "Привет!", "text1": "А теперь попробуй сам!", "generator": "sheets", "count": 2 }
 
       // несколько наборов подряд: сначала 3 раза задание 1.1, потом 4 раза задание 1.3
       { "generator": "sheets", "sets": [
           { "parts": [1], "count": 3 },
           { "parts": [3], "count": 4 }
       ] }
     ]
 
   СИД. При каждом открытии урока числа выбираются случайно, но у урока есть
   свой сид — короткий код вроде K7F3A9QX (он записан в каждом задании как
   task.ogeSeed). Один и тот же сид ВСЕГДА даёт один и тот же урок целиком.
   (Если после жалобы ты поменял JSON урока — порядок или число наборов, —
   старый сид может дать другие задания.)
   Человек присылает сид в жалобе, а ты открываешь этот вариант так:
     • добавь к адресу сайта  ?oge_seed=K7F3A9QX
     • или в консоли браузера: ogeReplaySeed('K7F3A9QX')  (потом открой урок)
   Можно вставлять и полный код из жалобы, например oge-sheets-1-K7F3A9QX.
   Чтобы вернуться к случайным вариантам: ogeReplaySeed('')
 
   КАК ДОБАВИТЬ НОВЫЙ ВАРИАНТ: новый файл, в нём
       OGE_GENERATORS.имя = { title, scenario, tasks, taskIds, defaultParts, [selectTask] }
   (образец — oge-sheets.js). Движок трогать не нужно.
 
     scenario(rnd, utils)  — выбирает числа и считает всё; возвращает объект значений для меток {{...}}
     tasks                 — шаблоны заданий (в строках можно писать {{метка}})
     taskIds               — номера заданий по порядку шаблонов, например ['1','2','3','4','5']
     defaultParts          — какие номера брать, если в JSON нет "parts"
     selectTask(id, wanted, vars) — необязательно: свой отбор заданий (нужен, если есть
                              «случайный из двух типов», как задание 5 у листов).
                              Без неё берутся задания, номера которых перечислены в parts.
 
   Помощники, доступные в любом варианте через OGE_UTILS: plural, listAnd, ruNum.
   =================================================== */
 
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
 
 
    /* ---------------------------------------------------
       Помощники для текстов (общие для всех вариантов)
       --------------------------------------------------- */
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
    function ruNum(x) {                                  // 2.5 -> «2,5»
        return String(x).replace('.', ',');
    }
    global.OGE_UTILS = { plural: plural, listAnd: listAnd, ruNum: ruNum };
 
    // Реестр вариантов: файлы вариантов дописывают сюда свои OGE_GENERATORS.имя = {...}
    const OGE_GENERATORS = global.OGE_GENERATORS = global.OGE_GENERATORS || {};
 
    /* ---------------------------------------------------
       Публичные функции (их вызывает script.js)
       --------------------------------------------------- */
 
    // Собирает один блок: возвращает массив готовых заданий.
    //   opts.seed  — сид (если не указан — случайный)
    //   opts.parts — какие задания блока взять, например [1, 3, 5.2] (см. taskIds)
    //   opts.salt  — добавка к сиду, чтобы повторы одного блока отличались друг от друга
    // В каждом задании лежит task.ogeSeed — код варианта для жалоб.
    // Что брать из варианта, если в JSON нет "parts": defaultParts, а если его нет — все задания по порядку
    function defaultPartsOf(def) {
        return Array.isArray(def.defaultParts) ? def.defaultParts : def.taskIds.slice();
    }
 
    function generateOgeBlock(name, opts) {
        opts = opts || {};
        const def = OGE_GENERATORS[name];
        if (!def) throw new Error('нет генератора «' + name + '». Доступные: ' + Object.keys(OGE_GENERATORS).join(', '));
        const code = forcedSeed || (opts.seed === undefined ? newSeedCode() : normalizeSeed(opts.seed));
        const rngSeed = opts.salt === undefined ? code : code + ':' + opts.salt;
        const vars = def.scenario(makeRng(rngSeed), global.OGE_UTILS);
        const result = [];
        // Какие задания брать: parts вида [1, 3, 5.1]; без parts — def.defaultParts варианта
        const wanted = (Array.isArray(opts.parts) ? opts.parts : defaultPartsOf(def))
            .map(function (x) { return String(x).trim(); });
        def.tasks.forEach(function (template, i) {
            const id = def.taskIds[i];
            const picked = typeof def.selectTask === 'function'
                ? def.selectTask(id, wanted, vars)
                : wanted.indexOf(id) !== -1;
            if (!picked) return;
            const task = fill(template, vars);
            task.ogeSeed = code;
            result.push(task);
        });
        // Ни одно задание не подошло — почти всегда опечатка в "parts". Тихо ничего не показывать нельзя:
        // иначе урок молча заканчивается раньше времени.
        if (!result.length) {
            throw new Error('в генераторе «' + name + '» нет заданий с номерами ' + wanted.join(', ') +
                '. Допустимые номера в "parts": ' + def.taskIds.join(', '));
        }
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
 
    // Если рядом с "generator" написано что-то своё (text, graph, ...), оно добавляется
    // В НАЧАЛО первого сгенерированного задания этой записи — на тот же экран, выше
    // графика и условия. Служебные поля (generator, parts, count, sets, seed, type, isOge,
    // correctAnswer) не копируются: тип и ответ всегда берутся из генератора.
    const SERVICE_KEYS = ['generator', 'parts', 'count', 'sets', 'seed', 'type', 'isOge', 'correctAnswer', 'explanationFields'];
    function entryOwnFields(entry) {
        const own = {};
        Object.keys(entry).forEach(function (k) {
            if (SERVICE_KEYS.indexOf(k) === -1) own[k] = entry[k];
        });
        return Object.keys(own).length ? JSON.parse(JSON.stringify(own)) : null;
    }
 
    // Свои поля идут первыми (в том порядке, как написаны в JSON), дальше — поля задания из генератора.
    // Если ключ совпал (например, твой "text2" и "text2" генератора), ключ генератора получает
    // суффикс "_gen" — платформа всё равно узнаёт его по началу названия (text, table, graph, code).
    function mergeOwnFields(own, task) {
        const merged = Object.assign({}, own);
        Object.keys(task).forEach(function (k) {
            let key = k;
            while (Object.prototype.hasOwnProperty.call(merged, key)) key += '_gen';
            merged[key] = task[k];
        });
        return merged;
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
                const own = entryOwnFields(entry);
                let ownPlaced = false;
                entrySets(entry).forEach(function (set, setIdx) {
                    const times = repeatCount(set);
                    for (let r = 0; r < times; r++) {
                        generateOgeBlock(entry.generator, {
                            seed: code,
                            parts: set.parts,
                            salt: entryIdx + '.' + setIdx + '.' + r
                        }).forEach(function (t) {
                            if (own && !ownPlaced) {
                                t = mergeOwnFields(own, t);
                                ownPlaced = true;
                            }
                            out.push(t);
                        });
                    }
                });
            } catch (e) {
                console.error('Ошибка генератора ОГЭ:', e);
                // Ошибку в JSON урока видно сразу: вместо пустоты в урок попадает заметка с причиной
                out.push({ type: 'theory', text: '⚠️ Ошибка в уроке (generator): ' + (e && e.message ? e.message : e) });
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
                    const per = Array.isArray(set.parts) ? set.parts.length : defaultPartsOf(OGE_GENERATORS[entry.generator]).length;
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
 
 
 
