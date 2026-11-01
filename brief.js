/* STACKUP. — client brief / spec builder
   Questions live in SECTIONS below: edit text there, the page renders itself.
   Each text is [ukrainian, english]. */
(() => {
'use strict';

/* ---------- settings ---------- */
const CONFIG = {
  email: 'hello@stackup.dev',      // where the client sends the brief
  endpoint: '',                    // optional: URL that accepts multipart FormData (form service / serverless). Empty = ZIP + email.
  maxFileMB: 25,                   // per file
  maxTotalMB: 100                  // all files together
};
const STORE = 'stackup-brief-v1';

/* ---------- ui strings ---------- */
const UI = {
  headerMid: ['БРИФ НА ПРОЄКТ', 'PROJECT BRIEF'],
  back: ['НА САЙТ ↗', 'BACK TO SITE ↗'],
  introEyebrow: ['00 / БРИФ', '00 / BRIEF'],
  introTitle1: ['Розкажіть про ідею.', 'Tell us about your idea.'],
  introTitle2: ['Решту зробимо разом.', 'We’ll shape the rest together.'],
  introLead: ['Відповіді допоможуть нам точно оцінити обсяг, терміни і вартість. Не знаєте відповіді — пропускайте, а там, де складно, ми запропонуємо варіанти.',
              'Your answers help us estimate scope, timing and cost precisely. Don’t know an answer? Skip it. Where it gets tricky, we’ll suggest options.'],
  fact1: ['ХВИЛИН', 'MINUTES'], fact2: ['КРОКІВ', 'STEPS'], fact3: ['АВТОЗБЕРЕЖЕННЯ', 'AUTOSAVE'],
  art1: ['Що, для кого і навіщо', 'What, for whom and why'],
  art2: ['Шрифти, логотип, приклади', 'Fonts, logo, references'],
  art3: ['Готове ТЗ', 'A ready spec'], art3b: ['за 15 хв', 'in 15 min'],
  pathsEyebrow: ['З ЧОГО ПОЧНЕМО?', 'WHERE DO WE START?'],
  pathHasTitle: ['У мене є ТЗ', 'I have a spec'],
  pathHasText: ['Завантажте готове технічне завдання, а ми поставимо кілька уточнювальних питань.', 'Upload your existing spec and we’ll ask a few clarifying questions.'],
  pathHasCta: ['ДОДАТИ ТЗ', 'ADD SPEC'],
  pathNoneTitle: ['ТЗ немає — створимо разом', 'No spec yet — let’s build one'],
  pathNoneText: ['Відповідайте на прості питання крок за кроком. На виході отримаєте готове ТЗ, а ми — все для точної оцінки.', 'Answer simple questions step by step. You get a ready spec, we get everything for an accurate estimate.'],
  pathNoneCta: ['ПОЧАТИ БРИФ', 'START BRIEF'],
  resumeText: ['У вас є незавершений бриф.', 'You have an unfinished brief.'],
  resumeBtn: ['ПРОДОВЖИТИ ↗', 'CONTINUE ↗'],
  prev: ['Назад', 'Back'], next: ['Далі', 'Next'], finish: ['Сформувати бриф', 'Build my brief'],
  modeHas: ['A / Є ТЗ', 'A / HAVE A SPEC'], modeNone: ['B / СТВОРЮЄМО ТЗ', 'B / BUILDING A SPEC'],
  switchToNone: ['↺ ТЗ НЕМАЄ? ПРОЙТИ ПОВНИЙ БРИФ', '↺ NO SPEC? TAKE THE FULL BRIEF'],
  switchToHas: ['↺ МАЄТЕ ТЗ? ДОДАТИ ФАЙЛ', '↺ HAVE A SPEC? UPLOAD IT'],
  required: ['Заповніть, будь ласка, поля з позначкою *', 'Please fill in the fields marked *'],
  optional: ['необов’язково', 'optional'],
  drop: ['Перетягніть файли сюди або', 'Drop files here or'],
  browse: ['оберіть на пристрої', 'browse your device'],
  remove: ['Видалити', 'Remove'],
  tooBig: ['Файл завеликий (макс. {n} МБ)', 'File too large (max {n} MB)'],
  totalBig: ['Разом файлів більше {n} МБ. Великі файли краще надіслати посиланням (Google Drive, Dropbox).', 'Files exceed {n} MB in total. Please share large files as a link (Google Drive, Dropbox).'],
  filesLost: ['Після перезавантаження сторінки файли треба додати ще раз (тексти збережено).', 'After a page reload, files need to be added again (your answers are saved).'],
  addLink: ['+ ДОДАТИ ЩЕ', '+ ADD ANOTHER'],
  linkPh: ['https://…', 'https://…'],
  likePh: ['Що саме подобається?', 'What exactly do you like?'],
  addColor: ['+ КОЛІР', '+ COLOUR'],
  other: ['Інше', 'Other'],
  resultEyebrow: ['ГОТОВО', 'DONE'],
  resultTitle1: ['Ваш бриф готовий.', 'Your brief is ready.'],
  resultTitle2: ['Перевірте й надішліть.', 'Review and send it.'],
  resultLead: ['Нижче — документ, який ми отримаємо. Якщо щось не так, поверніться до будь-якого кроку.', 'Below is the document we’ll receive. If something is off, go back to any step.'],
  send: ['Надіслати бриф', 'Send brief'], zip: ['Завантажити ZIP', 'Download ZIP'], print: ['Зберегти PDF', 'Save as PDF'], edit: ['← РЕДАГУВАТИ', '← EDIT'],
  sending: ['Надсилаємо…', 'Sending…'],
  sentOk: ['Дякуємо! Бриф отримано. Ми повернемося з оцінкою протягом 1–2 робочих днів.', 'Thank you! Brief received. We’ll come back with an estimate within 1–2 business days.'],
  sentFail: ['Не вдалося надіслати автоматично. Завантажте ZIP і надішліть його на {email}.', 'Couldn’t send automatically. Download the ZIP and email it to {email}.'],
  mailHint: ['Архів з брифом і файлами завантажено. У листі, що відкрився, прикріпіть його і натисніть «Надіслати». Адреса: {email}', 'The ZIP with your brief and files has been downloaded. Attach it to the email that just opened and press send. Address: {email}'],
  docTitleSpec: ['Технічне завдання', 'Project specification'],
  docTitleBrief: ['Бриф до ТЗ', 'Brief to the spec'],
  docClient: ['Замовник', 'Client'],
  docDate: ['Дата', 'Date'],
  docFiles: ['Матеріали', 'Materials'],
  docNoFiles: ['Файли не додано', 'No files attached'],
  docEmpty: ['—', '—'],
  docEstimate: ['Для оцінки Stackup', 'Stackup estimate notes'],
  estPages: ['Сторінок / екранів', 'Pages / screens'],
  estFeatures: ['Функцій', 'Features'],
  estCopy: ['Тексти', 'Copy'],
  estDesign: ['Дизайн-основа', 'Design base'],
  estDeadline: ['Терміни', 'Deadline'],
  estLangs: ['Мов', 'Languages'],
  estBudget: ['Бюджет', 'Budget'],
  footerMid: ['СТРАТЕГІЯ. ДИЗАЙН. РОЗРОБКА.', 'STRATEGY. DESIGN. DEVELOPMENT.'],
  footerBack: ['STACKUP.STUDIO ↗', 'STACKUP.STUDIO ↗'],
  mailSubject: ['Бриф на проєкт', 'Project brief']
};

/* ---------- questions ----------
   type: text | email | tel | url | textarea | radio | chips | files | links | colors | styles | pages
   show(a): condition on answers   req: required   accept: file types */
const YES_NO_IDK = [['yes', ['Так', 'Yes']], ['no', ['Ні', 'No']], ['idk', ['Не знаю', 'Not sure']]];

const SECTIONS = [
  {
    id: 'contacts', modes: ['has', 'none'],
    nav: ['Контакти', 'Contacts'],
    title: ['Давайте', 'Let’s get'], titleSerif: ['познайомимось.', 'acquainted.'],
    doc: ['Замовник', 'Client'],
    lead: ['Кому писати і як зручніше зв’язатися.', 'Who we talk to and how to reach you.'],
    fields: [
      { id: 'name', type: 'text', req: true, label: ['Ваше ім’я', 'Your name'], ph: ['Як до вас звертатися?', 'How should we call you?'], auto: 'name', half: true },
      { id: 'company', type: 'text', label: ['Компанія / бренд', 'Company / brand'], ph: ['Назва', 'Name'], auto: 'organization', half: true },
      { id: 'email', type: 'email', req: true, label: ['Email', 'Email'], ph: ['you@company.com', 'you@company.com'], auto: 'email', half: true },
      { id: 'phone', type: 'tel', label: ['Телефон / Telegram', 'Phone / Telegram'], ph: ['+380 … або @nick', '+44 … or @nick'], auto: 'tel', half: true },
      { id: 'channel', type: 'radio', label: ['Як зручніше спілкуватися?', 'Preferred way to talk'],
        options: [['tg', ['Telegram', 'Telegram']], ['email', ['Email', 'Email']], ['call', ['Дзвінок / відео', 'Call / video']], ['wa', ['WhatsApp / Viber', 'WhatsApp / Viber']]] },
      { id: 'role', type: 'radio', label: ['Хто приймає рішення по проєкту?', 'Who makes the final decisions?'],
        options: [['me', ['Я', 'Me']], ['team', ['Команда / кілька людей', 'A team / several people']], ['other', ['Інша людина', 'Someone else']]] }
    ]
  },
  {
    id: 'spec', modes: ['has'],
    nav: ['Ваше ТЗ', 'Your spec'],
    title: ['Додайте', 'Add your'], titleSerif: ['ваше ТЗ.', 'spec.'],
    doc: ['Технічне завдання клієнта', 'Client’s specification'],
    lead: ['Підійде будь-який формат: PDF, Word, Google Docs, Figma, Notion або просто посилання.', 'Any format works: PDF, Word, Google Docs, Figma, Notion or just a link.'],
    fields: [
      { id: 'specFiles', type: 'files', req: 'specOrLink', big: true, label: ['Файл ТЗ', 'Spec file'], accept: '.pdf,.doc,.docx,.txt,.md,.rtf,.odt,.pages,.xls,.xlsx,.ppt,.pptx,.key,.fig,.zip,image/*' },
      { id: 'specLink', type: 'url', label: ['…або посилання на ТЗ', '…or a link to the spec'], ph: ['Google Docs, Notion, Figma…', 'Google Docs, Notion, Figma…'] },
      { id: 'specStatus', type: 'radio', label: ['Наскільки ТЗ фінальне?', 'How final is the spec?'],
        options: [['final', ['Фінальне, можна оцінювати', 'Final, ready to estimate']], ['draft', ['Чернетка, можна доповнювати', 'A draft, open to changes']], ['ideas', ['Скоріше набір ідей', 'More of a set of ideas']]] },
      { id: 'specNotes', type: 'textarea', label: ['Що важливо, але не увійшло в ТЗ?', 'Anything important missing from the spec?'], ph: ['Пріоритети, побоювання, «обов’язково» і «точно ні»', 'Priorities, concerns, must-haves and definite no’s'] }
    ]
  },
  {
    id: 'business', modes: ['none'],
    nav: ['Про бізнес', 'Business'],
    title: ['Про ваш', 'About your'], titleSerif: ['бізнес.', 'business.'],
    doc: ['Про компанію і аудиторію', 'Company and audience'],
    lead: ['Кілька речень достатньо. Ми не шукаємо ідеальних формулювань.', 'A few sentences are enough. We’re not looking for perfect wording.'],
    fields: [
      { id: 'about', type: 'textarea', req: true, label: ['Чим займається компанія?', 'What does the company do?'], ph: ['Продукт або послуга, як давно на ринку', 'Product or service, how long on the market'] },
      { id: 'usp', type: 'textarea', label: ['Чим ви відрізняєтесь від конкурентів?', 'What makes you different from competitors?'], ph: ['Ціна, якість, сервіс, історія, підхід…', 'Price, quality, service, story, approach…'] },
      { id: 'audience', type: 'textarea', label: ['Хто ваші клієнти?', 'Who are your customers?'], ph: ['Вік, сфера, що для них важливо, чого бояться', 'Age, industry, what matters to them, what worries them'] },
      { id: 'geo', type: 'chips', label: ['Де ваші клієнти?', 'Where are your customers?'],
        options: [['ua', ['Україна', 'Ukraine']], ['eu', ['Європа', 'Europe']], ['us', ['США / Канада', 'US / Canada']], ['world', ['Весь світ', 'Worldwide']], ['local', ['Одне місто', 'One city']]] },
      { id: 'competitors', type: 'links', label: ['Конкуренти', 'Competitors'], hint: ['Посилання на сайти; можна коротко: що в них добре, а що погано.', 'Website links; optionally what’s good or bad about them.'] }
    ]
  },
  {
    id: 'project', modes: ['none'],
    nav: ['Проєкт', 'Project'],
    title: ['Що будуємо', 'What we build'], titleSerif: ['і навіщо.', 'and why.'],
    doc: ['Мета і тип проєкту', 'Goals and project type'],
    lead: ['Тип проєкту і головна дія, яку має зробити відвідувач.', 'Project type and the one action a visitor should take.'],
    fields: [
      { id: 'type', type: 'radio', req: true, label: ['Що потрібно?', 'What do you need?'],
        options: [['landing', ['Лендинг', 'Landing page']], ['corporate', ['Корпоративний сайт', 'Corporate website']], ['shop', ['Інтернет-магазин', 'Online store']], ['redesign', ['Редизайн сайту', 'Website redesign']], ['figma', ['Дизайн / прототип у Figma', 'Figma design / prototype']], ['product', ['Вебсервіс / продукт', 'Web app / product']], ['other', ['Інше', 'Other']]] },
      { id: 'typeOther', type: 'text', label: ['Опишіть коротко', 'Describe briefly'], show: a => a.type === 'other' },
      { id: 'currentSite', type: 'url', label: ['Поточний сайт', 'Current website'], ph: ['https://', 'https://'], show: a => a.type === 'redesign' || a.hasSite === 'yes' },
      { id: 'currentPains', type: 'textarea', label: ['Що не подобається в поточному сайті?', 'What don’t you like about the current site?'], show: a => a.type === 'redesign' },
      { id: 'goals', type: 'chips', req: true, label: ['Головна мета сайту', 'Main goal of the site'],
        options: [['leads', ['Заявки', 'Leads']], ['sales', ['Продажі онлайн', 'Online sales']], ['brand', ['Імідж / довіра', 'Brand / trust']], ['info', ['Інформувати', 'Inform']], ['portfolio', ['Показати роботи', 'Showcase work']], ['hire', ['Найм', 'Hiring']], ['launch', ['Запуск продукту', 'Product launch']]] },
      { id: 'action', type: 'text', label: ['Яку одну дію має зробити відвідувач?', 'The one action a visitor should take'], ph: ['Залишити заявку, купити, записатися, подзвонити…', 'Send a request, buy, book, call…'] },
      { id: 'success', type: 'textarea', label: ['Як зрозуміємо, що проєкт вдався?', 'How will we know the project worked?'], ph: ['Наприклад: 30 заявок на місяць, менше дзвінків з тими самими питаннями', 'E.g. 30 leads a month, fewer repetitive calls'] }
    ]
  },
  {
    id: 'structure', modes: ['none'],
    nav: ['Структура', 'Structure'],
    title: ['Сторінки', 'Pages'], titleSerif: ['і функції.', 'and features.'],
    doc: ['Структура і функціонал', 'Structure and features'],
    lead: ['Відмітьте, що знадобиться. Не впевнені — ми запропонуємо структуру самі.', 'Tick what you need. Not sure? We’ll propose a structure.'],
    fields: [
      { id: 'pages', type: 'pages', label: ['Сторінки / блоки', 'Pages / sections'],
        options: [['home', ['Головна', 'Home']], ['about', ['Про нас', 'About']], ['services', ['Послуги', 'Services']], ['service1', ['Окрема сторінка кожної послуги', 'Page per service']], ['catalog', ['Каталог / товари', 'Catalogue / products']], ['cases', ['Кейси / портфоліо', 'Cases / portfolio']], ['prices', ['Ціни', 'Pricing']], ['reviews', ['Відгуки', 'Reviews']], ['team', ['Команда', 'Team']], ['blog', ['Блог / новини', 'Blog / news']], ['faq', ['FAQ', 'FAQ']], ['contacts', ['Контакти', 'Contacts']], ['careers', ['Вакансії', 'Careers']], ['legal', ['Політика / оферта', 'Privacy / terms']]] },
      { id: 'pagesHelp', type: 'radio', label: ['Структура', 'Structure'],
        options: [['mine', ['Знаю, що потрібно', 'I know what I need']], ['help', ['Запропонуйте ви', 'Please suggest one']]] },
      { id: 'features', type: 'chips', label: ['Функції', 'Features'],
        options: [['form', ['Форма заявки', 'Contact form']], ['booking', ['Онлайн-запис', 'Online booking']], ['payments', ['Оплата онлайн', 'Online payments']], ['cart', ['Кошик / замовлення', 'Cart / checkout']], ['account', ['Особистий кабінет', 'User accounts']], ['multilang', ['Кілька мов', 'Multiple languages']], ['cms', ['Адмінка, щоб редагувати самим', 'CMS to edit content yourself']], ['crm', ['Інтеграція з CRM', 'CRM integration']], ['analytics', ['Аналітика / пікселі', 'Analytics / pixels']], ['chat', ['Чат / месенджери', 'Chat / messengers']], ['map', ['Карта', 'Map']], ['calc', ['Калькулятор', 'Calculator']], ['search', ['Пошук / фільтри', 'Search / filters']], ['anim', ['Виразна анімація', 'Expressive animation']], ['seo', ['SEO-основа', 'SEO foundation']]] },
      { id: 'languages', type: 'text', label: ['Які мови?', 'Which languages?'], ph: ['UA, EN, PL…', 'UA, EN, PL…'], show: a => (a.features || []).includes('multilang') },
      { id: 'integrations', type: 'textarea', label: ['Сервіси, з якими треба поєднати', 'Services to connect with'], ph: ['CRM, платіжка, пошта, Google Sheets, 1С, Telegram-бот…', 'CRM, payments, email, Google Sheets, Telegram bot…'], show: a => (a.features || []).some(f => ['crm', 'payments', 'booking', 'account'].includes(f)) }
    ]
  },
  {
    id: 'content', modes: ['none'],
    nav: ['Контент', 'Content'],
    title: ['Тексти, фото', 'Copy, photos'], titleSerif: ['і матеріали.', 'and materials.'],
    doc: ['Контент', 'Content'],
    lead: ['Якщо матеріали вже є, додайте їх тут. Великі папки можна дати посиланням.', 'If you already have materials, add them here. Large folders can be shared as a link.'],
    fields: [
      { id: 'texts', type: 'radio', label: ['Тексти для сайту', 'Website copy'],
        options: [['ready', ['Готові', 'Ready']], ['partly', ['Частково', 'Partly']], ['need', ['Потрібен копірайтинг', 'Need copywriting']]] },
      { id: 'textFiles', type: 'files', label: ['Тексти', 'Copy files'], accept: '.doc,.docx,.pdf,.txt,.md,.rtf,.odt,.pages', show: a => a.texts && a.texts !== 'need' },
      { id: 'media', type: 'radio', label: ['Фото і відео', 'Photos and video'],
        options: [['ready', ['Є власні', 'We have our own']], ['stock', ['Підібрати стокові', 'Use stock']], ['shoot', ['Потрібна зйомка', 'Need a shoot']], ['ai', ['Згенерувати / ілюстрації', 'Generate / illustrate']]] },
      { id: 'mediaFiles', type: 'files', label: ['Фото, відео, ілюстрації', 'Photos, video, illustrations'], accept: 'image/*,video/*,.zip', show: a => a.media === 'ready' },
      { id: 'materialsLink', type: 'url', label: ['Посилання на папку з матеріалами', 'Link to a materials folder'], ph: ['Google Drive, Dropbox…', 'Google Drive, Dropbox…'] }
    ]
  },
  {
    id: 'style', modes: ['has', 'none'],
    nav: ['Стиль', 'Style'],
    title: ['Як це має', 'How it should'], titleSerif: ['виглядати.', 'look and feel.'],
    doc: ['Дизайн і стиль', 'Design and style'],
    lead: ['Є брендбук — чудово. Немає — оберіть настрій і приклади, а ми запропонуємо напрям.', 'Have a brand book? Great. If not, pick a mood and some references and we’ll propose a direction.'],
    fields: [
      { id: 'brand', type: 'radio', label: ['Фірмовий стиль', 'Brand identity'],
        options: [['full', ['Є брендбук / гайд', 'Brand book / guide']], ['logo', ['Є лише логотип', 'Logo only']], ['none', ['Нічого немає', 'Nothing yet']], ['newlogo', ['Потрібен і логотип', 'Need a logo too']]] },
      { id: 'brandFiles', type: 'files', label: ['Брендбук, логотип (SVG, AI, PDF, PNG)', 'Brand book, logo (SVG, AI, PDF, PNG)'], accept: '.pdf,.svg,.ai,.eps,.png,.jpg,.jpeg,.webp,.fig,.sketch,.zip', show: a => a.brand === 'full' || a.brand === 'logo' },
      { id: 'fonts', type: 'radio', label: ['Фірмові шрифти', 'Brand fonts'], options: YES_NO_IDK },
      { id: 'fontNames', type: 'text', label: ['Назви шрифтів', 'Font names'], ph: ['Наприклад: Inter, Playfair Display', 'E.g. Inter, Playfair Display'], show: a => a.fonts === 'yes' },
      { id: 'fontFiles', type: 'files', label: ['Файли шрифтів або скріншот', 'Font files or a screenshot'], hint: ['TTF, OTF, WOFF або просто скріншот тексту цим шрифтом.', 'TTF, OTF, WOFF or just a screenshot of text set in it.'], accept: '.ttf,.otf,.woff,.woff2,.zip,image/*', show: a => a.fonts === 'yes' || a.fonts === 'idk' },
      { id: 'colorsHave', type: 'radio', label: ['Фірмові кольори', 'Brand colours'], options: YES_NO_IDK },
      { id: 'colors', type: 'colors', label: ['Оберіть кольори', 'Pick the colours'], show: a => a.colorsHave === 'yes' },
      { id: 'styleKnow', type: 'radio', label: ['Ви знаєте, який стиль хочете?', 'Do you know the style you want?'],
        options: [['yes', ['Так, покажу приклади', 'Yes, I’ll show references']], ['no', ['Ні, допоможіть обрати', 'No, help me choose']], ['trust', ['Довіряю вам', 'I trust you']]] },
      { id: 'styles', type: 'styles', label: ['Що ближче? Оберіть 1–2', 'What feels closer? Pick 1–2'], show: a => a.styleKnow === 'no' },
      { id: 'mood', type: 'chips', label: ['Яким має відчуватися бренд?', 'How should the brand feel?'], show: a => a.styleKnow !== 'trust',
        options: [['calm', ['Спокійним', 'Calm']], ['bold', ['Сміливим', 'Bold']], ['premium', ['Дорогим', 'Premium']], ['friendly', ['Дружнім', 'Friendly']], ['strict', ['Строгим', 'Strict']], ['playful', ['Грайливим', 'Playful']], ['tech', ['Технологічним', 'High-tech']], ['warm', ['Теплим', 'Warm']], ['minimal', ['Мінімалістичним', 'Minimal']], ['exp', ['Експериментальним', 'Experimental']]] },
      { id: 'likes', type: 'links', label: ['Сайти, які подобаються', 'Websites you like'], hint: ['Не обов’язково з вашої ніші. Напишіть, що саме подобається: кольори, шрифти, анімація, подача.', 'Not necessarily from your niche. Note what you like: colours, type, motion, tone.'], withNote: true },
      { id: 'likeShots', type: 'files', label: ['Скріншоти прикладів', 'Reference screenshots'], accept: 'image/*,.pdf' },
      { id: 'dislikes', type: 'textarea', label: ['Чого точно не хочете?', 'What do you definitely not want?'], ph: ['Кольори, прийоми, сайти-антиприклади', 'Colours, patterns, anti-examples'] }
    ]
  },
  {
    id: 'scope', modes: ['has', 'none'],
    nav: ['Терміни і бюджет', 'Timing & budget'],
    title: ['Терміни', 'Timing'], titleSerif: ['і бюджет.', 'and budget.'],
    doc: ['Терміни, бюджет, підтримка', 'Timing, budget, support'],
    lead: ['Орієнтир допомагає запропонувати рішення, яке вкладеться в рамки.', 'A ballpark helps us propose a solution that fits.'],
    fields: [
      { id: 'deadline', type: 'radio', req: true, label: ['Коли потрібен запуск?', 'When do you need to launch?'],
        options: [['asap', ['Якнайшвидше', 'ASAP']], ['1m', ['До 1 місяця', 'Within 1 month']], ['2m', ['1–2 місяці', '1–2 months']], ['3m', ['2–3 місяці', '2–3 months']], ['flex', ['Гнучко', 'Flexible']]] },
      { id: 'deadlineWhy', type: 'text', label: ['Є конкретна дата або подія?', 'A specific date or event?'], ph: ['Наприклад: виставка 15 березня', 'E.g. trade show on 15 March'] },
      { id: 'budget', type: 'radio', label: ['Орієнтовний бюджет', 'Approximate budget'],
        options: [['s', ['до $1 000', 'under $1,000']], ['m', ['$1 000–3 000', '$1,000–3,000']], ['l', ['$3 000–7 000', '$3,000–7,000']], ['xl', ['$7 000+', '$7,000+']], ['idk', ['Потрібна оцінка', 'Need an estimate']]] },
      { id: 'domain', type: 'radio', label: ['Домен і хостинг', 'Domain and hosting'],
        options: [['have', ['Вже є', 'Already have']], ['help', ['Допоможіть налаштувати', 'Please set them up']], ['idk', ['Не знаю', 'Not sure']]] },
      { id: 'support', type: 'radio', label: ['Підтримка після запуску', 'Support after launch'],
        options: [['yes', ['Потрібна', 'Needed']], ['no', ['Не потрібна', 'Not needed']], ['later', ['Вирішимо пізніше', 'Decide later']]] }
    ]
  },
  {
    id: 'extra', modes: ['has', 'none'],
    nav: ['Наостанок', 'Finally'],
    title: ['Ще щось', 'Anything'], titleSerif: ['важливе?', 'else?'],
    doc: ['Додатково', 'Additional notes'],
    lead: ['Усе, що не влізло в питання: ідеї, побоювання, натхнення.', 'Everything that didn’t fit: ideas, concerns, inspiration.'],
    fields: [
      { id: 'notes', type: 'textarea', label: ['Коментар', 'Comment'], ph: ['Пишіть як є', 'Write it as it is'], rows: 5 },
      { id: 'extraFiles', type: 'files', label: ['Будь-які інші файли', 'Any other files'], accept: '' },
      { id: 'source', type: 'chips', label: ['Як ви про нас дізналися?', 'How did you find us?'],
        options: [['ref', ['Рекомендація', 'Referral']], ['ig', ['Instagram', 'Instagram']], ['search', ['Пошук', 'Search']], ['tg', ['Telegram', 'Telegram']], ['other', ['Інше', 'Other']]] }
    ]
  }
];

/* style cards for “help me choose” */
const STYLE_CARDS = [
  { id: 'minimal', name: ['Мінімалізм', 'Minimal'], text: ['Багато повітря, чисті сітки, тиша.', 'Lots of air, clean grids, quiet.'], bg: '#f4f4ec', fg: '#131412', acc: '#c9d1d9', font: "'DM Sans',sans-serif", w: 500, sample: 'Aa' },
  { id: 'bold', name: ['Сміливий', 'Bold'], text: ['Великий шрифт, контраст, енергія.', 'Huge type, contrast, energy.'], bg: '#c5ff27', fg: '#131412', acc: '#131412', font: "'DM Sans',sans-serif", w: 800, sample: 'Aa!' },
  { id: 'editorial', name: ['Редакційний', 'Editorial'], text: ['Як журнал: серифи, колонки, історії.', 'Like a magazine: serifs, columns, stories.'], bg: '#e2e1d6', fg: '#1f291a', acc: '#90b336', font: "Georgia,serif", w: 400, italic: true, sample: 'Aa' },
  { id: 'premium', name: ['Преміум', 'Premium'], text: ['Темний фон, стримано, дорого.', 'Dark, restrained, expensive.'], bg: '#131412', fg: '#e2e1d6', acc: '#c5b27a', font: "Georgia,serif", w: 400, sample: 'Aa' },
  { id: 'tech', name: ['Технологічний', 'Tech'], text: ['Інтерфейси, моно-шрифти, точність.', 'Interfaces, mono type, precision.'], bg: '#1f291a', fg: '#c5ff27', acc: '#99daaf', font: "'IBM Plex Mono',monospace", w: 500, sample: '</>' },
  { id: 'friendly', name: ['Дружній', 'Friendly'], text: ['Теплі кольори, заокруглення, ілюстрації.', 'Warm colours, round shapes, illustrations.'], bg: '#fdaa7e', fg: '#131412', acc: '#f4f4ec', font: "'DM Sans',sans-serif", w: 700, sample: 'Hi :)', round: true },
  { id: 'corporate', name: ['Корпоративний', 'Corporate'], text: ['Надійно, структуровано, без ризиків.', 'Reliable, structured, no risks.'], bg: '#acd2eb', fg: '#131412', acc: '#ffffff', font: "'DM Sans',sans-serif", w: 600, sample: 'Aa' },
  { id: 'playful', name: ['Експериментальний', 'Experimental'], text: ['Анімація, нестандартні сітки, вау.', 'Motion, unusual grids, wow.'], bg: '#d0c6e8', fg: '#131412', acc: '#c5ff27', font: "'DM Sans',sans-serif", w: 800, sample: 'Wow', tilt: true }
];

/* ---------- state ---------- */
let lang = 'ua';
let state = { mode: null, step: 0, a: {}, done: false };
const files = {};               // fieldId -> File[] (memory only)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const L = x => Array.isArray(x) ? (lang === 'en' ? x[1] : x[0]) : (x ?? '');
const T = (k, vars) => { let s = L(UI[k]); if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]); return s; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function save() { try { localStorage.setItem(STORE, JSON.stringify({ ...state, lang })); } catch (e) {} }
function load() { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; } }

const sections = () => SECTIONS.filter(s => s.modes.includes(state.mode));
const visible = f => !f.show || f.show(state.a);

/* ---------- i18n ---------- */
function applyLang() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'uk';
  $$('[data-i18n]').forEach(el => { if (UI[el.dataset.i18n]) el.textContent = T(el.dataset.i18n); });
  $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  document.title = lang === 'en' ? 'Project brief — STACKUP.' : 'Бриф на проєкт — STACKUP.';
  if (state.mode && !$('#wizard').hidden) renderStep();
  if (!$('#result').hidden) renderDoc();
}

/* ---------- field renderers ---------- */
function optionList(f, multi) {
  const val = state.a[f.id];
  return `<div class="opts${f.type === 'pages' ? ' opts-grid' : ''}">` + f.options.map(([v, lbl]) => {
    const on = multi ? (val || []).includes(v) : val === v;
    return `<label class="opt"><input type="${multi ? 'checkbox' : 'radio'}" name="${f.id}" value="${v}"${on ? ' checked' : ''}><span>${esc(L(lbl))}</span></label>`;
  }).join('') + `</div>`;
}

function fileBox(f) {
  const list = files[f.id] || [];
  const names = state.a[f.id + '__names'] || [];
  const lost = !list.length && names.length;
  return `<div class="drop${f.big ? ' big' : ''}" data-drop="${f.id}">
      <input type="file" id="in-${f.id}" multiple${f.accept ? ` accept="${f.accept}"` : ''}>
      <label for="in-${f.id}"><span class="drop-icon" aria-hidden="true">${f.big ? '＋' : '↑'}</span>
        <span>${f.big ? `<b>${esc(T('pathHasCta'))}</b><br>` : ''}${esc(T('drop'))} <u>${esc(T('browse'))}</u></span></label>
    </div>
    <ul class="file-list" data-list="${f.id}">${list.map((file, i) => `<li><span class="mono">${esc(ext(file.name))}</span><b>${esc(file.name)}</b><em>${size(file.size)}</em><button type="button" data-rm="${f.id}" data-i="${i}" aria-label="${esc(T('remove'))}">×</button></li>`).join('')}</ul>
    ${lost ? `<p class="hint warn">${esc(T('filesLost'))} (${esc(names.join(', '))})</p>` : ''}`;
}

function linksBox(f) {
  const rows = state.a[f.id] && state.a[f.id].length ? state.a[f.id] : [{ url: '', note: '' }];
  return `<div class="links" data-links="${f.id}">` + rows.map((r, i) => `<div class="link-row">
      <input type="url" data-link="${f.id}" data-i="${i}" data-k="url" value="${esc(r.url)}" placeholder="${esc(T('linkPh'))}">
      <input type="text" data-link="${f.id}" data-i="${i}" data-k="note" value="${esc(r.note)}" placeholder="${esc(T('likePh'))}">
    </div>`).join('') + `<button type="button" class="link mono" data-addlink="${f.id}">${esc(T('addLink'))}</button></div>`;
}

function colorsBox(f) {
  const cols = state.a[f.id] && state.a[f.id].length ? state.a[f.id] : ['#131412', '#c5ff27'];
  return `<div class="colors" data-colors="${f.id}">` + cols.map((c, i) => `<label class="swatch"><input type="color" data-color="${f.id}" data-i="${i}" value="${esc(c)}"><span class="mono">${esc(c.toUpperCase())}</span><button type="button" data-rmcolor="${f.id}" data-i="${i}" aria-label="${esc(T('remove'))}">×</button></label>`).join('') +
    `<button type="button" class="link mono" data-addcolor="${f.id}">${esc(T('addColor'))}</button></div>`;
}

function stylesBox(f) {
  const val = state.a[f.id] || [];
  return `<div class="style-cards">` + STYLE_CARDS.map(s => `<label class="style-card${val.includes(s.id) ? ' on' : ''}">
      <input type="checkbox" name="${f.id}" value="${s.id}"${val.includes(s.id) ? ' checked' : ''}>
      <span class="sc-prev${s.tilt ? ' tilt' : ''}" style="background:${s.bg};color:${s.fg};${s.round ? 'border-radius:22px;' : ''}">
        <i style="background:${s.acc}${s.round ? ';border-radius:50%' : ''}"></i>
        <b style="font-family:${s.font};font-weight:${s.w};${s.italic ? 'font-style:italic;' : ''}">${esc(s.sample)}</b>
        <u style="background:${s.fg}"></u><u style="background:${s.fg}"></u>
      </span>
      <span class="sc-name">${esc(L(s.name))}</span>
      <span class="sc-text">${esc(L(s.text))}</span>
    </label>`).join('') + `</div>`;
}

function fieldHTML(f) {
  const req = f.req === true ? ' <span class="req">*</span>' : '';
  const label = `<span class="f-label">${esc(L(f.label))}${req}</span>`;
  const hint = f.hint ? `<span class="hint">${esc(L(f.hint))}</span>` : '';
  const v = state.a[f.id] ?? '';
  let inner;
  switch (f.type) {
    case 'textarea': inner = `<textarea name="${f.id}" rows="${f.rows || 3}" placeholder="${esc(L(f.ph))}">${esc(v)}</textarea>`; break;
    case 'radio': inner = optionList(f, false); break;
    case 'chips': case 'pages': inner = optionList(f, true); break;
    case 'files': inner = fileBox(f); break;
    case 'links': inner = linksBox(f); break;
    case 'colors': inner = colorsBox(f); break;
    case 'styles': inner = stylesBox(f); break;
    default: inner = `<input type="${f.type}" name="${f.id}" value="${esc(v)}" placeholder="${esc(L(f.ph))}"${f.auto ? ` autocomplete="${f.auto}"` : ''}>`;
  }
  const group = ['radio', 'chips', 'pages', 'files', 'links', 'colors', 'styles'].includes(f.type);
  const tag = group ? 'div' : 'label';
  return `<${tag} class="field f-${f.type}${f.half ? ' half' : ''}" data-field="${f.id}"${group ? ` role="group" aria-label="${esc(L(f.label))}"` : ''}>${label}${hint}${inner}</${tag}>`;
}

/* ---------- wizard ---------- */
function renderNav() {
  const secs = sections();
  $('#modeLabel').textContent = T(state.mode === 'has' ? 'modeHas' : 'modeNone');
  $('#switchMode').textContent = T(state.mode === 'has' ? 'switchToNone' : 'switchToHas');
  $('#stepsList').innerHTML = secs.map((s, i) => `<li class="${i === state.step ? 'cur' : ''}${i < state.step ? ' past' : ''}"><button type="button" data-go="${i}"><span class="mono">${String(i + 1).padStart(2, '0')}</span>${esc(L(s.nav))}</button></li>`).join('');
  $('#progressBar').style.width = ((state.step + 1) / secs.length * 100) + '%';
}

function renderStep() {
  const secs = sections();
  state.step = Math.max(0, Math.min(state.step, secs.length - 1));
  const s = secs[state.step];
  s.fields.filter(f => f.type === 'colors' && visible(f) && !(state.a[f.id] || []).length).forEach(f => { state.a[f.id] = ['#131412', '#c5ff27']; save(); });
  $('#stepBody').innerHTML = `
    <p class="eyebrow"><i></i> ${String(state.step + 1).padStart(2, '0')} / ${esc(L(s.nav).toUpperCase())}</p>
    <h2>${esc(L(s.title))}<br><span class="serif">${esc(L(s.titleSerif))}</span></h2>
    <p class="lead">${esc(L(s.lead))}</p>
    <div class="fields">${s.fields.filter(visible).map(fieldHTML).join('')}</div>`;
  $('#prevBtn').style.visibility = state.step === 0 ? 'hidden' : 'visible';
  $('#nextBtn b').textContent = state.step === secs.length - 1 ? T('finish') : T('next');
  $('#stepError').textContent = '';
  renderNav();
}

function rerenderKeepFocus() {
  const active = document.activeElement;
  const key = active && (active.name || active.dataset.link) ? [active.name || active.dataset.link, active.value, active.dataset.i, active.dataset.k] : null;
  renderStep();
  if (key) {
    const el = $$('#stepBody input, #stepBody textarea').find(e => (e.name || e.dataset.link) === key[0] && (e.type === 'radio' || e.type === 'checkbox' ? e.value === key[1] : e.dataset.i === key[2] && e.dataset.k === key[3]));
    if (el) el.focus({ preventScroll: true });
  }
}

function collect(e) {
  const t = e.target;
  if (t.dataset.link) {
    const id = t.dataset.link, i = +t.dataset.i;
    const rows = state.a[id] && state.a[id].length ? state.a[id] : [{ url: '', note: '' }];
    rows[i] = { ...rows[i], [t.dataset.k]: t.value }; state.a[id] = rows; save(); return;
  }
  if (t.dataset.color) {
    const id = t.dataset.color; const cols = state.a[id] && state.a[id].length ? state.a[id] : ['#131412', '#c5ff27'];
    cols[+t.dataset.i] = t.value; state.a[id] = cols; t.nextElementSibling.textContent = t.value.toUpperCase(); save(); return;
  }
  if (!t.name || t.type === 'file') return;
  const f = SECTIONS.flatMap(s => s.fields).find(x => x.id === t.name);
  if (!f) return;
  if (t.type === 'checkbox') {
    let arr = $$(`input[name="${t.name}"]:checked`, $('#stepBody')).map(x => x.value);
    if (f.type === 'styles' && arr.length > 2) { t.checked = false; arr = arr.filter(x => x !== t.value); }
    state.a[t.name] = arr;
  } else state.a[t.name] = t.value;
  save();
  if (t.type === 'radio' || t.type === 'checkbox') rerenderKeepFocus(); // conditions may change
}

function addFiles(id, list) {
  const f = SECTIONS.flatMap(s => s.fields).find(x => x.id === id);
  const cur = files[id] || [];
  const total = () => Object.values(files).flat().reduce((n, x) => n + x.size, 0);
  let err = '';
  for (const file of list) {
    if (file.size > CONFIG.maxFileMB * 1048576) { err = T('tooBig', { n: CONFIG.maxFileMB }) + ': ' + file.name; continue; }
    if (total() + file.size > CONFIG.maxTotalMB * 1048576) { err = T('totalBig', { n: CONFIG.maxTotalMB }); break; }
    if (!cur.some(x => x.name === file.name && x.size === file.size)) cur.push(file);
    files[id] = cur;
  }
  files[id] = cur;
  state.a[id + '__names'] = cur.map(x => x.name);
  save(); rerenderKeepFocus();
  if (err) $('#stepError').textContent = err;
  void f;
}

function validate() {
  const s = sections()[state.step];
  const missing = [];
  for (const f of s.fields.filter(visible)) {
    if (f.req === 'specOrLink') { if (!(files.specFiles || []).length && !(state.a.specLink || '').trim()) missing.push(f.id); continue; }
    if (!f.req) continue;
    const v = state.a[f.id];
    if (v == null || (Array.isArray(v) ? !v.length : !String(v).trim())) missing.push(f.id);
    else if (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(v)) missing.push(f.id);
  }
  $$('.field.bad').forEach(x => x.classList.remove('bad'));
  missing.forEach(id => { const el = $(`[data-field="${id}"]`); el && el.classList.add('bad'); });
  if (missing.length) {
    $('#stepError').textContent = T('required');
    const first = $(`[data-field="${missing[0]}"]`); first && first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return !missing.length;
}

function startMode(mode, step = 0) {
  state.mode = mode; state.step = step; state.done = false; save();
  $('#intro').hidden = true; $('#paths').hidden = true; $('#result').hidden = true; $('#wizard').hidden = false;
  renderStep(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function go(i) { state.step = i; save(); renderStep(); $('#wizard').scrollIntoView({ behavior: 'smooth' }); }

/* ---------- document (the spec) ---------- */
function answerText(f) {
  const v = state.a[f.id];
  if (f.type === 'files') return (files[f.id] || []).map(x => x.name).concat(!(files[f.id] || []).length ? (state.a[f.id + '__names'] || []) : []);
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return null;
  if (f.type === 'radio') { const o = f.options.find(x => x[0] === v); return o ? L(o[1]) : v; }
  if (f.type === 'chips' || f.type === 'pages') return v.map(x => { const o = f.options.find(y => y[0] === x); return o ? L(o[1]) : x; }).join(', ');
  if (f.type === 'styles') return v.map(x => { const s = STYLE_CARDS.find(y => y.id === x); return s ? `${L(s.name)} (${L(s.text)})` : x; }).join('; ');
  if (f.type === 'links') { const r = v.filter(x => x.url || x.note); return r.length ? r : null; }
  if (f.type === 'colors') return v;
  return v;
}

function docHTML() {
  const secs = sections();
  const date = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });
  const title = state.mode === 'has' ? T('docTitleBrief') : T('docTitleSpec');
  const who = [state.a.name, state.a.company].filter(Boolean).join(' · ');
  let n = 0;
  const body = secs.map(s => {
    const rows = s.fields.filter(visible).map(f => {
      const val = answerText(f);
      if (f.type === 'files') return { f, html: val.length ? `<ul class="d-files">${val.map(x => `<li>📎 ${esc(x)}</li>`).join('')}</ul>` : null };
      if (val == null) return { f, html: null };
      if (f.type === 'links') return { f, html: `<ul>${val.map(r => `<li>${r.url ? `<a href="${esc(r.url)}">${esc(r.url)}</a>` : ''}${r.note ? ` — ${esc(r.note)}` : ''}</li>`).join('')}</ul>` };
      if (f.type === 'colors') return { f, html: `<span class="d-colors">${val.map(c => `<span><i style="background:${esc(c)}"></i>${esc(c.toUpperCase())}</span>`).join('')}</span>` };
      return { f, html: esc(val).replace(/\n/g, '<br>') };
    }).filter(r => r.html);
    if (!rows.length) return '';
    n++;
    return `<section class="d-sec"><h3><span class="mono">${String(n).padStart(2, '0')}</span>${esc(L(s.doc))}</h3>
      <dl>${rows.map(r => `<dt>${esc(L(r.f.label))}</dt><dd>${r.html}</dd>`).join('')}</dl></section>`;
  }).join('');

  const est = estimate();
  return `<header class="d-head">
      <div class="d-top mono"><span>STACKUP<i class="dot"></i></span><span>${esc(title.toUpperCase())}</span><span>${esc(date)}</span></div>
      <h1>${esc(title)}<br><span class="serif">${esc(who || '')}</span></h1>
    </header>
    ${body}
    <section class="d-sec d-est"><h3><span class="mono">✱</span>${esc(T('docEstimate'))}</h3>
      <div class="est">${est.map(([k, v]) => `<div><span class="mono">${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div></section>
    <footer class="d-foot mono"><span>© STACKUP.</span><span>${esc(state.a.email || '')}</span><span>stackup.studio</span></footer>`;
}

function estimate() {
  const a = state.a, out = [];
  const opt = (id, v) => { const f = SECTIONS.flatMap(s => s.fields).find(x => x.id === id); const o = f && f.options && f.options.find(x => x[0] === v); return o ? L(o[1]) : (v || T('docEmpty')); };
  if (state.mode === 'none') {
    out.push([T('estPages'), a.pagesHelp === 'help' ? (lang === 'en' ? 'to propose' : 'запропонувати') : String((a.pages || []).length || T('docEmpty'))]);
    out.push([T('estFeatures'), String((a.features || []).length)]);
    out.push([T('estCopy'), opt('texts', a.texts)]);
    out.push([T('estLangs'), (a.features || []).includes('multilang') ? (a.languages || '2+') : '1']);
  }
  const design = a.brand === 'full' ? opt('brand', 'full') : a.styleKnow === 'trust' ? opt('styleKnow', 'trust') : a.styleKnow === 'no' ? (lang === 'en' ? 'direction needed' : 'потрібен напрям') : opt('brand', a.brand);
  out.push([T('estDesign'), design]);
  out.push([T('estDeadline'), opt('deadline', a.deadline) + (a.deadlineWhy ? ` · ${a.deadlineWhy}` : '')]);
  out.push([T('estBudget'), opt('budget', a.budget)]);
  return out;
}

function renderDoc() { $('#doc').innerHTML = docHTML(); }

function showResult() {
  state.done = true; save();
  $('#wizard').hidden = true; $('#result').hidden = false;
  renderDoc(); applyStaticLang(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function applyStaticLang() { $$('#result [data-i18n]').forEach(el => el.textContent = T(el.dataset.i18n)); }

/* ---------- export ---------- */
function slug() { return ('brief-' + (state.a.company || state.a.name || 'client')).toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/gi, '-').replace(/^-|-$/g, '') + '-' + new Date().toISOString().slice(0, 10); }

function standaloneHTML() {
  const css = [...document.styleSheets].map(ss => { try { return [...ss.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n');
  return `<!doctype html><html lang="${lang === 'en' ? 'en' : 'uk'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(slug())}</title><style>${css}</style></head><body class="standalone"><article class="doc">${docHTML()}</article></body></html>`;
}

function answersJSON() {
  const out = { mode: state.mode, lang, date: new Date().toISOString(), answers: {} };
  for (const s of sections()) for (const f of s.fields.filter(visible)) {
    const v = f.type === 'files' ? (files[f.id] || []).map(x => x.name) : state.a[f.id];
    if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) out.answers[f.id] = v;
  }
  return JSON.stringify(out, null, 2);
}

async function buildZip() {
  if (!window.JSZip) throw new Error('JSZip not loaded');
  const zip = new JSZip(), name = slug();
  const root = zip.folder(name);
  root.file('brief.html', standaloneHTML());
  root.file('answers.json', answersJSON());
  for (const s of sections()) for (const f of s.fields) {
    const list = files[f.id] || [];
    if (!list.length) continue;
    const dir = root.folder('files/' + f.id);
    list.forEach(file => dir.file(file.name, file));
  }
  return { blob: await zip.generateAsync({ type: 'blob' }), name: name + '.zip' };
}

function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

function mailBody() {
  const lines = [];
  for (const s of sections()) {
    const rows = s.fields.filter(visible).map(f => {
      const v = answerText(f);
      if (v == null || (Array.isArray(v) && !v.length)) return null;
      const txt = f.type === 'links' ? v.map(r => [r.url, r.note].filter(Boolean).join(' — ')).join('; ') : Array.isArray(v) ? v.join(', ') : v;
      return `${L(f.label)}: ${txt}`;
    }).filter(Boolean);
    if (rows.length) lines.push(`— ${L(s.doc).toUpperCase()} —`, ...rows, '');
  }
  return lines.join('\n');
}

async function send() {
  const st = $('#sendStatus');
  st.textContent = T('sending');
  if (CONFIG.endpoint) {
    try {
      const fd = new FormData();
      fd.append('_subject', `${T('mailSubject')}: ${state.a.company || state.a.name || ''}`);
      fd.append('email', state.a.email || '');
      fd.append('brief', mailBody());
      fd.append('answers', answersJSON());
      fd.append('brief_html', new Blob([standaloneHTML()], { type: 'text/html' }), 'brief.html');
      Object.entries(files).forEach(([id, list]) => list.forEach(file => fd.append('attachment', file, `${id}__${file.name}`)));
      const res = await fetch(CONFIG.endpoint, { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(res.status);
      st.textContent = T('sentOk'); localStorage.removeItem(STORE); return;
    } catch (e) { st.textContent = T('sentFail', { email: CONFIG.email }); return; }
  }
  try { const z = await buildZip(); download(z.blob, z.name); } catch (e) { /* still open mail */ }
  const subject = `${T('mailSubject')}: ${state.a.company || state.a.name || ''}`;
  const body = mailBody().slice(0, 1500) + `\n\n(${lang === 'en' ? 'Full brief and files are in the attached ZIP' : 'Повний бриф і файли — у прикріпленому ZIP'})`;
  window.location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  st.textContent = T('mailHint', { email: CONFIG.email });
}

/* ---------- helpers ---------- */
function ext(n) { const m = n.match(/\.([a-z0-9]+)$/i); return m ? m[1].toUpperCase().slice(0, 4) : 'FILE'; }
function size(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }

/* ---------- events ---------- */
function bind() {
  $$('.lang button').forEach(b => b.addEventListener('click', () => { lang = b.dataset.lang; save(); applyLang(); }));
  $$('.path').forEach(b => b.addEventListener('click', () => startMode(b.dataset.mode)));
  $('#resumeBtn').addEventListener('click', () => { if (state.done) showResult(); else startMode(state.mode, state.step); });
  $('#switchMode').addEventListener('click', () => startMode(state.mode === 'has' ? 'none' : 'has'));
  $('#prevBtn').addEventListener('click', () => go(state.step - 1));
  $('#stepForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!validate()) return;
    if (state.step < sections().length - 1) go(state.step + 1); else showResult();
  });
  const body = $('#stepBody');
  body.addEventListener('input', e => { if (e.target.type !== 'radio' && e.target.type !== 'checkbox') collect(e); });
  body.addEventListener('change', e => {
    if (e.target.type === 'file') { addFiles(e.target.id.slice(3), [...e.target.files]); return; }
    if (e.target.type === 'radio' || e.target.type === 'checkbox') collect(e);
  });
  body.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.rm) { files[t.dataset.rm].splice(+t.dataset.i, 1); state.a[t.dataset.rm + '__names'] = files[t.dataset.rm].map(x => x.name); save(); rerenderKeepFocus(); }
    if (t.dataset.addlink) { const id = t.dataset.addlink; const rows = state.a[id] && state.a[id].length ? state.a[id] : [{ url: '', note: '' }]; rows.push({ url: '', note: '' }); state.a[id] = rows; save(); renderStep(); $$(`[data-link="${id}"][data-k="url"]`).pop().focus(); }
    if (t.dataset.addcolor) { const id = t.dataset.addcolor; const c = state.a[id] && state.a[id].length ? state.a[id] : ['#131412', '#c5ff27']; if (c.length < 8) c.push('#90b336'); state.a[id] = c; save(); renderStep(); }
    if (t.dataset.rmcolor) { e.preventDefault(); const id = t.dataset.rmcolor; const c = state.a[id] && state.a[id].length ? state.a[id] : ['#131412', '#c5ff27']; c.splice(+t.dataset.i, 1); state.a[id] = c; save(); renderStep(); }
  });
  ['dragenter', 'dragover'].forEach(ev => body.addEventListener(ev, e => { const d = e.target.closest('.drop'); if (d) { e.preventDefault(); d.classList.add('over'); } }));
  ['dragleave', 'drop'].forEach(ev => body.addEventListener(ev, e => { const d = e.target.closest('.drop'); if (d) { e.preventDefault(); d.classList.remove('over'); if (ev === 'drop') addFiles(d.dataset.drop, [...e.dataTransfer.files]); } }));
  $('#stepsList').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) go(+b.dataset.go); });
  $('#editBtn').addEventListener('click', () => { $('#result').hidden = true; startMode(state.mode, sections().length - 1); });
  $('#printBtn').addEventListener('click', () => window.print());
  $('#zipBtn').addEventListener('click', async () => { try { const z = await buildZip(); download(z.blob, z.name); } catch (e) { $('#sendStatus').textContent = e.message; } });
  $('#sendBtn').addEventListener('click', send);
}

/* ---------- init ---------- */
const saved = load();
const qp = new URLSearchParams(location.search);
lang = qp.get('lang') || (saved && saved.lang) || ((navigator.language || '').match(/^(uk|ru)/) ? 'ua' : (navigator.language || '').startsWith('en') ? 'en' : 'ua');
if (lang !== 'en') lang = 'ua';
if (saved && saved.mode) { state = { ...state, ...saved, a: saved.a || {} }; $('.resume').hidden = false; }
bind(); applyLang();
const m = qp.get('mode'); if (m === 'has' || m === 'none') startMode(m);
})();
