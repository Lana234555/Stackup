/**
 * STACKUP. — тестові заявки для CRM. Окремий файл у тому ж проєкті Apps Script, що й Code.gs.
 */
/* =====================================================================
   ТЕСТОВІ ЗАЯВКИ
   seedTestBriefs()   → додає 10 різних тестових заявок (без листів)
   removeTestBriefs() → видаляє їх з таблиці та Drive (у кошик)
   Тестові заявки мають номер із «TEST», справжні не зачіпаються.
   ===================================================================== */
function seedTestBriefs() {
  if (!props().getProperty('SHEET_ID')) throw new Error('Спершу запустіть setup()');
  const valid = validStatuses();
  const sec = (title, rows) => ({ title, rows: rows.map(r => ({ label: r[0], type: r[2] || 'text', value: r[1] })) });
  const B = [
    { h: 300, st: 'done', n: 'Анна Руденко', co: 'Rudenko Law', em: 'anna@rudenko.example', ph: '+380 67 410 22 18', mode: 'none', type: 'Лендинг', dl: 'До 1 місяця', bg: '$1 000–3 000', note: 'Здано 25.10. Клієнтка задоволена, просить SEO-супровід.',
      est: [['Сторінок / екранів', '1'], ['Функцій', '3'], ['Тексти', 'Готові'], ['Дизайн-основа', 'Є логотип'], ['Терміни', 'До 1 місяця'], ['Бюджет', '$1 000–3 000']],
      secs: [sec('Про компанію і аудиторію', [['Чим займається компанія?', 'Адвокатське бюро: сімейне та корпоративне право, Львів.', 'textarea'], ['Хто ваші клієнти?', 'Підприємці 30–55 років і родини, яким потрібна консультація.', 'textarea']]),
             sec('Мета і тип проєкту', [['Що потрібно?', 'Лендинг', 'radio'], ['Головна мета сайту', 'Заявки, Довіра до бренду', 'chips']])],
      files: [['brandFiles', 'Брендбук, логотип', 'rudenko-logo.txt']] },
    { h: 220, st: 'work', n: 'Ігор Бондар', co: 'Lume Studio', em: 'igor@lume.example', ph: '@igor_lume', mode: 'none', type: 'Корпоративний сайт', dl: '2–3 місяці', bg: '$7 000+', note: 'Дизайн погоджено 28.10. Розробка до 20.11.',
      est: [['Сторінок / екранів', '9'], ['Функцій', '6'], ['Тексти', 'Частково'], ['Мов', 'UA, EN'], ['Дизайн-основа', 'Є брендбук / гайд'], ['Терміни', '2–3 місяці'], ['Бюджет', '$7 000+']],
      secs: [sec('Про компанію і аудиторію', [['Чим займається компанія?', 'Студія світлодизайну: проєктуємо і виготовляємо світильники для HoReCa.', 'textarea']]),
             sec('Структура і функціонал', [['Сторінки / блоки', 'Головна, Про нас, Проєкти, Каталог, Блог, Контакти', 'pages'], ['Функції', 'Кілька мов, Адмінка, Фільтри каталогу, Форма заявки', 'chips']]),
             sec('Дизайн і стиль', [['Фірмові кольори', ['#111111', '#f3efe6', '#ffb547'], 'colors'], ['Приклади, що подобаються', [{ url: 'https://example.com/lighting', note: 'Чисто, багато повітря' }], 'links']])],
      files: [['brandFiles', 'Брендбук, логотип', 'lume-brandbook.txt'], ['materialsFiles', 'Файли з матеріалами', 'projects-photos.txt']] },
    { h: 170, st: 'quoted', n: 'Олег Ярема', co: 'Yarema Wines', em: 'oleh@yarema.example', ph: '', mode: 'has', type: 'Власне ТЗ', dl: 'Гнучко', bg: '$3 000–7 000', note: 'КП $4 200, чекаю відповіді до п’ятниці.',
      est: [['Дизайн-основа', 'Є брендбук / гайд'], ['Терміни', 'Гнучко'], ['Бюджет', '$3 000–7 000']],
      secs: [sec('Технічне завдання клієнта', [['Наскільки ТЗ фінальне?', 'Фінальне', 'radio'], ['Посилання на ТЗ', 'https://example.com/yarema-tz', 'url'], ['Що важливо, але не увійшло в ТЗ?', 'Перевірка віку 18+ на вході та доставка лише по Україні.', 'textarea']])],
      files: [['specFiles', 'Файл ТЗ', 'TZ-Yarema-Wines.txt']] },
    { h: 120, st: 'quoted', n: 'Марія Лис', co: '', em: 'maria.lys@example.com', ph: '', mode: 'none', type: 'Лендинг', dl: 'Якнайшвидше', bg: 'до $1 000', note: 'КП: $900, 2 тижні.',
      est: [['Сторінок / екранів', '1'], ['Функцій', '2'], ['Тексти', 'Потрібен копірайтинг'], ['Дизайн-основа', 'Довіряю вам'], ['Терміни', 'Якнайшвидше'], ['Бюджет', 'до $1 000']],
      secs: [sec('Про компанію і аудиторію', [['Чим займається компанія?', 'Психологиня, онлайн-консультації та курс для батьків.', 'textarea']]),
             sec('Терміни, бюджет, підтримка', [['Коли потрібен запуск?', 'Якнайшвидше', 'radio'], ['Підтримка після запуску', 'Не потрібна', 'radio']])], files: [] },
    { h: 70, st: 'review', n: 'Ірина Савчук', co: 'Savchuk Dental', em: 'clinic@savchuk.example', ph: '+380 50 222 33 44', mode: 'none', type: 'Корпоративний сайт', dl: 'До 1 місяця', bg: '$1 000–3 000', note: 'Потрібен онлайн-запис, перевірити інтеграцію з їхньою CRM.',
      est: [['Сторінок / екранів', '7'], ['Функцій', '5'], ['Тексти', 'Готові'], ['Дизайн-основа', 'Є лише логотип'], ['Терміни', 'До 1 місяця'], ['Бюджет', '$1 000–3 000']],
      secs: [sec('Мета і тип проєкту', [['Що потрібно?', 'Новий сайт', 'radio'], ['Яку одну дію має зробити відвідувач?', 'Записатися на прийом', 'text']]),
             sec('Структура і функціонал', [['Сторінки / блоки', 'Головна, Послуги, Лікарі, Ціни, Відгуки, Контакти', 'pages'], ['Функції', 'Онлайн-запис, Інтеграція з CRM, Карта', 'chips']])],
      files: [['materialsFiles', 'Файли з матеріалами', 'price-list.txt'], ['brandFiles', 'Брендбук, логотип', 'savchuk-logo.txt']] },
    { h: 44, st: 'review', n: 'Андрій Мельник', co: 'Nexa Logistics', em: 'a.melnyk@nexa.example', ph: '+380 67 123 45 67', mode: 'has', type: 'Власне ТЗ', dl: 'До 1 місяця', bg: 'Потрібна оцінка', note: '~60 год дизайн + 80 год розробка. Уточнити інтеграцію з 1С.',
      est: [['Дизайн-основа', 'Є брендбук / гайд'], ['Терміни', 'До 1 місяця'], ['Бюджет', 'Потрібна оцінка']],
      secs: [sec('Технічне завдання клієнта', [['Наскільки ТЗ фінальне?', 'Чернетка, можна доповнювати', 'radio'], ['Що важливо, але не увійшло в ТЗ?', 'Калькулятор вартості доставки та англійська версія.', 'textarea']])],
      files: [['specFiles', 'Файл ТЗ', 'TZ-Nexa-website-v3.txt'], ['brandFiles', 'Брендбук, логотип', 'nexa-brandbook.txt']] },
    { h: 26, st: 'new', n: 'Тарас Гнатюк', co: 'Reelly Dubai', em: 'taras@reelly.example', ph: '@taras_g', mode: 'none', type: 'Вебсервіс / продукт', dl: '2–3 місяці', bg: '$7 000+', note: '',
      est: [['Сторінок / екранів', '14'], ['Функцій', '9'], ['Тексти', 'Готові'], ['Мов', 'EN, AR'], ['Дизайн-основа', 'Є брендбук / гайд'], ['Терміни', '2–3 місяці'], ['Бюджет', '$7 000+']],
      secs: [sec('Про компанію і аудиторію', [['Чим займається компанія?', 'Платформа для агентів нерухомості в Дубаї: каталог новобудов і підбірки для клієнтів.', 'textarea']]),
             sec('Структура і функціонал', [['Функції', 'Особистий кабінет, Пошук і фільтри, Інтеграція з API, Кілька мов, Аналітика', 'chips']])],
      files: [['materialsFiles', 'Файли з матеріалами', 'reelly-api-docs.txt'], ['likeShots', 'Скріншоти прикладів', 'ref-dashboard.txt']] },
    { h: 9, st: 'new', n: 'Олена Коваль', co: 'Coffee Lab', em: 'olena@coffeelab.example', ph: '@olena_coffee', mode: 'none', type: 'Редизайн сайту', dl: '1–2 місяці', bg: '$3 000–7 000', note: '',
      est: [['Сторінок / екранів', '6'], ['Функцій', '4'], ['Тексти', 'Частково'], ['Мов', 'UA, EN'], ['Дизайн-основа', 'Є лише логотип'], ['Терміни', '1–2 місяці'], ['Бюджет', '$3 000–7 000']],
      secs: [sec('Про компанію і аудиторію', [['Чим займається компанія?', 'Кав’ярня і обсмажка specialty-кави в Києві, 6 років на ринку.', 'textarea'], ['Хто ваші клієнти?', '25–40 років, працюють в IT і креативі, купують зерно додому.', 'textarea']]),
             sec('Мета і тип проєкту', [['Що потрібно?', 'Редизайн сайту', 'radio'], ['Поточний сайт', 'https://coffeelab.example', 'url'], ['Головна мета сайту', 'Продажі онлайн, Заявки', 'chips']]),
             sec('Дизайн і стиль', [['Оберіть кольори', ['#2b1d14', '#f2e6d0', '#c5ff27'], 'colors']])],
      files: [['brandFiles', 'Брендбук, логотип', 'coffeelab-logo.txt'], ['materialsFiles', 'Файли з матеріалами', 'menu-and-photos.txt']] },
    { h: 3, st: 'new', n: 'Дмитро Кравець', co: 'FitBox', em: 'dmytro@fitbox.example', ph: '+380 93 555 01 02', mode: 'none', type: 'Інтернет-магазин', dl: '1–2 місяці', bg: '$3 000–7 000', note: '',
      est: [['Сторінок / екранів', '8'], ['Функцій', '7'], ['Тексти', 'Потрібен копірайтинг'], ['Дизайн-основа', 'Довіряю вам'], ['Терміни', '1–2 місяці'], ['Бюджет', '$3 000–7 000']],
      secs: [sec('Про компанію і аудиторію', [['Чим займається компанія?', 'Спортивне харчування і боксерська екіпіровка, власний бренд.', 'textarea']]),
             sec('Структура і функціонал', [['Функції', 'Кошик / замовлення, Оплата онлайн, Нова пошта, Промокоди, Відгуки', 'chips']])], files: [] },
    { h: 0.5, st: 'new', n: 'Sophie Laurent', co: 'Atelier Laurent', em: 'sophie@laurent.example', ph: '+33 6 12 34 56 78', mode: 'has', type: 'Own spec', dl: 'Flexible', bg: '$3 000–7 000', note: '',
      est: [['Design base', 'Brand book'], ['Timeline', 'Flexible'], ['Budget', '$3 000–7 000']],
      secs: [sec('Client brief', [['How final is the spec?', 'Final', 'radio'], ['Anything important not in the spec?', 'Portfolio must load fast on mobile; French and English.', 'textarea']])],
      files: [['specFiles', 'Spec file', 'Atelier-Laurent-brief.txt']] }
  ];
  const sh = sheet(), base = root();
  let added = 0;
  B.forEach((b, i) => {
    const t = new Date(Date.now() - b.h * 3600000);
    const id = Utilities.formatDate(t, 'Etc/GMT', 'yyMMdd') + '-TEST' + String(i + 1).padStart(2, '0');
    if (findRow(id)) return;
    const client = { name: b.n, email: b.em, company: b.co, phone: b.ph };
    const folder = base.createFolder(clean(['ТЕСТ', client.company || client.name, id].join(' · ')));
    const record = { id, created: t.toISOString(), mode: b.mode, lang: b.mode === 'has' && /^[A-Za-z]/.test(b.type) ? 'en' : 'uk', client,
      summary: { type: b.type, deadline: b.dl, budget: b.bg }, estimate: b.est, sections: b.secs, answers: {} };
    folder.createFile('brief.json', JSON.stringify(record, null, 2), MimeType.PLAIN_TEXT);
    b.files.forEach(f => {
      const sub = folder.createFolder(f[0]);
      sub.createFile(f[2], 'Тестовий файл для заявки ' + id, MimeType.PLAIN_TEXT).setDescription(f[1]);
    });
    const row = { id, created: record.created, status: valid.indexOf(b.st) >= 0 ? b.st : 'new', name: b.n, company: b.co, email: b.em, phone: b.ph,
      mode: b.mode, type: b.type, deadline: b.dl, budget: b.bg, files: b.files.length, folderId: folder.getId(),
      notes: b.note ? 'ТЕСТ. ' + b.note : 'ТЕСТ', token: sha(randomToken()), updated: record.created };
    sh.appendRow(COLS.map(k => cell(row[k])));
    added++;
  });
  Logger.log('Додано тестових заявок: ' + added + '. Оновіть CRM. Видалити їх: removeTestBriefs');
}

function removeTestBriefs() {
  const sh = sheet(), vals = sh.getDataRange().getValues(), head = vals[0];
  const ci = head.indexOf('id'), fi = head.indexOf('folderId');
  let n = 0;
  for (let i = vals.length - 1; i > 0; i--) {
    if (!/-TEST\d+$/.test(String(vals[i][ci]))) continue;
    try { DriveApp.getFolderById(String(vals[i][fi])).setTrashed(true); } catch (e) {}
    sh.deleteRow(i + 1); n++;
  }
  Logger.log('Видалено тестових заявок: ' + n);
}
