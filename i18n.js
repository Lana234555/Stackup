/* STACKUP. — перемикач мови EN / UA.
   index.html написаний англійською, це джерело. Українську накладаємо тут,
   до app.js: кожен текстовий вузол і атрибут (aria-label, alt, placeholder)
   шукаємо в словнику UK за англійським текстом. Якщо англійський текст на
   сайті змінився, а словник ні, рядок просто лишиться англійським.
   Вибір мови зберігається в localStorage; адреса сторінки не змінюється.
   Посилання ?lang=uk або ?lang=en вмикає мову і прибирає параметр з адреси. */
(function () {
  'use strict';
  var KEY = 'stackup-lang';
  var lang = 'en';
  try { if (localStorage.getItem(KEY) === 'uk') lang = 'uk'; } catch (e) {}
  try {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'uk' || q === 'ua' || q === 'en') {
      lang = q === 'en' ? 'en' : 'uk';
      try { localStorage.setItem(KEY, lang); } catch (e) {}
      history.replaceState(null, '', location.pathname + location.hash);
    }
  } catch (e) {}

  var UK = {
    /* head */
    'STACKUP® — Ideas into impact.': 'STACKUP® — Ідеї, що працюють.',
    'STACKUP — independent digital product studio. Strategy, design and development, from first spark to launch.': 'STACKUP — незалежна студія цифрових продуктів. Стратегія, дизайн і розробка: від першої іскри до запуску.',

    /* header */
    'Stackup home': 'Stackup — на головну',
    'Main navigation': 'Головне меню',
    'Open menu': 'Відкрити меню',
    'Close menu': 'Закрити меню',
    'Choose the language': 'Оберіть мову',
    'Services': 'Послуги',
    'Work': 'Роботи',
    'About': 'Про нас',
    'Process': 'Процес',
    'LET’S BUILD': 'ПОЧНІМО',

    /* hero */
    'INDEPENDENT DIGITAL STUDIO': 'НЕЗАЛЕЖНА ДІДЖИТАЛ-СТУДІЯ',
    'IDEA → DESIGN → REALITY': 'ІДЕЯ → ДИЗАЙН → РЕАЛЬНІСТЬ',
    'A SMALL STUDIO. A BIG WAY OF THINKING.': 'МАЛЕНЬКА СТУДІЯ. ВЕЛИКЕ МИСЛЕННЯ.',
    'Ideas into': 'Ідеї, що',
    'impact': 'працюють',
    'We design & build digital products': 'Ми проєктуємо й створюємо цифрові продукти,',
    'that look different. And make a difference.': 'які виглядають інакше. І дають результат.',
    'Start a project': 'Почати проєкт',
    'Explore our work': 'Дивитися роботи',
    '01 / THE SPARK': '01 / ІСКРА',
    'Good things': 'Усе добре',
    'start with an idea.': 'починається з ідеї.',
    'what’s yours? ↗': 'а яка ваша? ↗',
    'YOUR NEXT BIG THING': 'ВАША НАСТУПНА ВЕЛИКА ІДЕЯ',
    'Make it matter': 'Зробімо вагомо',
    'READY TO LAUNCH': 'ГОТОВО ДО ЗАПУСКУ',
    '↗ Let’s make it happen.': '↗ Втілімо це.',
    'STRATEGY / DESIGN / DEVELOPMENT': 'СТРАТЕГІЯ / ДИЗАЙН / РОЗРОБКА',
    'SCROLL TO CONNECT THE DOTS': 'ГОРТАЙТЕ, ЩОБ З’ЄДНАТИ КРАПКИ',

    /* manifesto */
    'LESS DISTANCE. MORE IMPACT.': 'МЕНШЕ ДИСТАНЦІЇ. БІЛЬШЕ РЕЗУЛЬТАТУ.',
    'No sales department. No endless handovers. Just a direct line from your idea to something real.': 'Без відділу продажів. Без зіпсованого телефону. Лише пряма лінія від вашої ідеї до чогось справжнього.',
    'No sales department.': 'Без відділу продажів.',
    'No endless handovers.': 'Без зіпсованого телефону.',
    'Just a direct line': 'Лише пряма лінія',
    'from': 'від',
    'your idea': 'вашої ідеї',
    'to': 'до',
    'something real.': 'чогось справжнього.',
    'ONE PARTNER. THE WHOLE PICTURE.': 'ОДИН ПАРТНЕР. ПОВНА КАРТИНА.',

    /* 01 services */
    '01 / WHAT WE DO': '01 / ЩО МИ РОБИМО',
    'Built for your': 'Для вашого',
    'next chapter.': 'нового розділу.',
    'From a first impression to a full digital': 'Від першого враження до повноцінного',
    'experience. Thoughtful at every layer.': 'цифрового досвіду. Продумано до дрібниць.',
    '01 / MAKE AN ENTRANCE': '01 / ЕФЕКТНИЙ ВИХІД',
    'Landing /': 'Лендинг /',
    'sales page': 'сторінка продажів',
    'One clear goal. A compelling story. A page that turns interest into action.': 'Одна чітка мета. Переконлива історія. Сторінка, що перетворює інтерес на дію.',
    'EXPLORE THE POSSIBILITIES': 'ВІДКРИЙТЕ МОЖЛИВОСТІ',
    '02 / BUILD YOUR PRESENCE': '02 / ВАША ПРИСУТНІСТЬ',
    'Corporate': 'Корпоративний',
    'website': 'сайт',
    'A digital home with a strong foundation. Built around your business.': 'Цифровий дім на міцному фундаменті. Побудований довкола вашого бізнесу.',
    'STRUCTURE MEETS CHARACTER': 'СТРУКТУРА З ХАРАКТЕРОМ',
    '03 / MOVE FORWARD': '03 / РУХ УПЕРЕД',
    'Website': 'Редизайн',
    'redesign': 'сайту',
    'A fresh perspective on what comes next. Keep the good. Rethink the rest.': 'Свіжий погляд на наступний крок. Зберігаємо хороше. Переосмислюємо решту.',
    'A NEW POINT OF VIEW': 'НОВИЙ ПОГЛЯД',
    '04 / SEE IT BEFORE YOU BUILD': '04 / ПОБАЧТЕ ДО РОЗРОБКИ',
    'prototype': 'прототип',
    'From first wireframe to a clickable experience. Every interaction considered.': 'Від першого вайрфрейму до клікабельного прототипу. Кожна взаємодія продумана.',
    'IDEAS YOU CAN INTERACT WITH': 'ІДЕЇ, ЯКИХ МОЖНА ТОРКНУТИСЯ',
    '05 / GET DISCOVERED': '05 / ЩОБ ВАС ЗНАХОДИЛИ',
    'foundation': 'фундамент',
    'Technical essentials, thoughtful structure and performance from the start.': 'Технічна база, продумана структура і швидкодія з самого початку.',
    'BUILT TO BE FOUND': 'СТВОРЕНО, ЩОБ ЗНАХОДИЛИ',
    '06 / KEEP GETTING BETTER': '06 / СТАВАТИ КРАЩИМИ',
    'Support &': 'Підтримка',
    'maintenance': 'і супровід',
    'Updates, new ideas and ongoing care. Because launch is just the beginning.': 'Оновлення, нові ідеї та постійна турбота. Бо запуск — це лише початок.',
    'HERE FOR THE LONG RUN': 'ПОРУЧ НАДОВГО',

    /* 02 why */
    '02 / WHY STACKUP': '02 / ЧОМУ STACKUP',
    'Small by choice.': 'Малі свідомо.',
    'On your side.': 'На вашому боці.',
    'You bring the ambition.': 'Від вас — амбіції.',
    'We bring the thinking, craft and care': 'Від нас — мислення, майстерність і турбота,',
    'to take it all the way.': 'щоб довести все до кінця.',
    'Meet your next creative partner': 'Знайомтеся з вашим креативним партнером',
    'DIRECT': 'НАПРЯМУ',
    'BY DESIGN': 'ЗА ЗАДУМОМ',
    'A direct connection.': 'Прямий зв’язок.',
    'You work with the person making your product. Clear conversations, shared context, no details lost along the way.': 'Ви працюєте з людиною, яка створює ваш продукт. Зрозуміла комунікація, спільний контекст, жодна деталь не губиться дорогою.',
    'Business before pixels.': 'Бізнес понад пікселі.',
    'A beautiful interface is just the start. Every decision begins with your goals and the people you’re building for.': 'Гарний інтерфейс — лише початок. Кожне рішення починається з ваших цілей і людей, для яких ви створюєте продукт.',
    'Clarity at every step.': 'Ясність на кожному кроці.',
    'A shared plan, clear milestones and regular updates. You always know where we are and what comes next.': 'Спільний план, чіткі етапи й регулярні оновлення. Ви завжди знаєте, де ми зараз і що далі.',
    'Made for the real world.': 'Створено для реального світу.',
    'Responsive, considered and ready for real users. Craft that carries through from the first mockup to the final build.': 'Адаптивно, продумано й готово до справжніх користувачів. Якість від першого макета до фінальної версії.',

    /* 03 work */
    '03 / SELECTED WORK': '03 / ВИБРАНІ РОБОТИ',
    'Less talking.': 'Менше слів.',
    'More making.': 'Більше справ.',
    'A few things we’ve put into the world.': 'Кілька речей, які ми випустили у світ.',
    'Different challenges. The same care.': 'Різні задачі. Та сама турбота.',
    'HOVER OR TAP A STRIP TO OPEN IT →': 'НАВЕДІТЬ АБО ТОРКНІТЬСЯ СМУГИ, ЩОБ ВІДКРИТИ →',
    'View live site': 'Відкрити сайт',
    'Product design': 'Продуктовий дизайн',
    'Development': 'Розробка',
    'Registration': 'Реєстрація',
    'Web design': 'Вебдизайн',
    'Multilingual': 'Багатомовність',
    'Lead form': 'Форма заявки',
    'Course platform': 'Платформа курсу',
    'Sales page': 'Сторінка продажів',
    'Landing page': 'Лендинг',
    '01 / REAL ESTATE PLATFORM': '01 / ПЛАТФОРМА НЕРУХОМОСТІ',
    'Finding a new perspective on real estate.': 'Новий погляд на нерухомість.',
    '02 / WEBINAR LANDING': '02 / ЛЕНДИНГ ВЕБІНАРУ',
    'An invitation that feels like a ticket.': 'Запрошення, що відчувається як квиток.',
    '03 / MUSIC STUDIO WEBSITE': '03 / САЙТ МУЗИЧНОЇ СТУДІЇ',
    'A stage for every new voice.': 'Сцена для кожного нового голосу.',
    '04 / INVESTMENT REAL ESTATE': '04 / ІНВЕСТИЦІЙНА НЕРУХОМІСТЬ',
    'Property abroad, returns made clear.': 'Нерухомість за кордоном і зрозуміла дохідність.',
    '05 / ONLINE COURSE PLATFORM': '05 / ПЛАТФОРМА ОНЛАЙН-КУРСУ',
    'A softer, golden path to birth.': 'М’якший, золотий шлях до пологів.',
    '06 / REFERRAL PLATFORM': '06 / РЕФЕРАЛЬНА ПЛАТФОРМА',
    'Refer investors, track every step.': 'Рекомендуйте інвесторів і стежте за кожним кроком.',
    'Reelly — open the live site': 'Reelly — відкрити сайт',
    'Trustmont — open the live site': 'Trustmont — відкрити сайт',
    'Lina’s Studio — open the live site': 'Lina’s Studio — відкрити сайт',
    'Money24 — open the live site': 'Money24 — відкрити сайт',
    'Blissful Birthing — open the live site': 'Blissful Birthing — відкрити сайт',
    'Reelly Ambassadors — open the live site': 'Reelly Ambassadors — відкрити сайт',
    'Reelly AI website: AI ecosystem for real estate sellers with a mobile property search': 'Сайт Reelly AI: AI-екосистема для продавців нерухомості з мобільним пошуком об’єктів',
    'Reelly mentors from top UAE market players': 'Ментори Reelly — топові гравці ринку ОАЕ',
    'Reelly professional tools for off-plan agents': 'Професійні інструменти Reelly для агентів off-plan нерухомості',
    'Trustmont Capital webinar landing with a dark hero and a ticket-style card': 'Лендинг вебінару Trustmont Capital з темним першим екраном і карткою-квитком',
    'Trustmont webinar programme': 'Програма вебінару Trustmont',
    'Trustmont webinar registration form': 'Форма реєстрації на вебінар Trustmont',
    'Lina’s Music Studio website with a concert photo and a trial lesson call to action': 'Сайт Lina’s Music Studio з концертним фото і записом на пробний урок',
    'Lina’s Studio founder Lina Poverga': 'Засновниця Lina’s Studio Ліна Поверга',
    'Lina’s Studio rehearsal halls for rent': 'Репетиційні зали Lina’s Studio в оренду',
    'Money24 Estate website: dark hero with an orange headline and a sea-view bedroom photo': 'Сайт Money24 Estate: темний перший екран з помаранчевим заголовком і фото спальні з видом на море',
    'Money24 Estate investment projects': 'Інвестиційні проєкти Money24 Estate',
    'Money24 Estate catalogue request form': 'Форма запиту каталогу Money24 Estate',
    'Blissful Birthing course website with a golden script headline over a warm photo': 'Сайт курсу Blissful Birthing із золотим рукописним заголовком на теплому фото',
    'Blissful Birthing course phases: The Initiation and The Awakening': 'Етапи курсу Blissful Birthing: The Initiation і The Awakening',
    'Blissful Birthing founder: birth alchemy coach and mother of six': 'Засновниця Blissful Birthing: коуч з підготовки до пологів і мама шістьох дітей',
    'Reelly referral landing: hero with a Dubai skyline line drawing': 'Реферальний лендинг Reelly: перший екран з лінійним малюнком Дубая',
    'Reelly referral process in six steps': 'Реферальний процес Reelly у шість кроків',
    'Reelly ambassador cabinet tools': 'Інструменти кабінету амбасадора Reelly',

    /* 04 about */
    '04 / WHO WE ARE': '04 / ХТО МИ',
    'The studio': 'Студія',
    'behind the work.': 'за кожною роботою.',
    'Stackup is an independent digital studio. We turn ideas into websites, online stores and products people remember, from the first strategy call to the day it goes live. Strategy, design and development under one roof, with one person you talk to the whole way.': 'Stackup — незалежна діджитал-студія. Ми перетворюємо ідеї на сайти, онлайн-магазини та продукти, які запам’ятовуються, від першого стратегічного дзвінка до дня запуску. Стратегія, дизайн і розробка під одним дахом і одна людина, з якою ви на зв’язку весь шлях.',
    'websites and': 'сайтів та',
    'online stores built': 'онлайн-магазинів',
    'years building an MVP': 'роки розробки MVP-',
    'platform at Reelly': 'платформи в Reelly',
    'point of contact,': 'контактна особа',
    'start to finish': 'від початку до кінця',
    'STACKUP® / STUDIO ID': 'STACKUP® / ID СТУДІЇ',
    'No. 001': '№ 001',
    'LANA / FOUNDER': 'ЛАНА / ЗАСНОВНИЦЯ',
    'Lana, founder of Stackup': 'Лана, засновниця Stackup',
    'WHAT WE DO': 'ЩО РОБИМО',
    'Strategy · Design · Development': 'Стратегія · Дизайн · Розробка',
    'BACKGROUND': 'ДОСВІД',
    '3 years on the Reelly MVP platform': '3 роки на MVP-платформі Reelly',
    'WE WORK WITH': 'ПРАЦЮЄМО З',
    'Startups, brands & founders': 'Стартапами, брендами й засновниками',
    'WHERE': 'ДЕ',
    'Remote, worldwide': 'Віддалено, по всьому світу',
    'STATUS': 'СТАТУС',
    'Booking new projects': 'Беремо нові проєкти',
    'FROM IDEA TO IMPACT': 'ВІД ІДЕЇ ДО РЕЗУЛЬТАТУ',

    /* 05 process */
    '05 / HOW WE GET THERE': '05 / ЯК МИ ЦЬОГО ДОСЯГАЄМО',
    'One idea.': 'Одна ідея.',
    'Four steps forward.': 'Чотири кроки вперед.',
    'A clear path, with room to explore.': 'Чіткий шлях і простір для пошуку.',
    'Here’s how we make it happen.': 'Ось як ми це втілюємо.',
    'Brief': 'Бриф',
    'Design': 'Дизайн',
    'Develop': 'Розробка',
    'Launch': 'Запуск',
    'We ask questions, connect the dots and define what success looks like. A shared direction before the first pixel.': 'Ставимо питання, з’єднуємо крапки й визначаємо, яким має бути успіх. Спільний напрям ще до першого пікселя.',
    'Structure, user flows and a visual direction with character. A clickable prototype lets you feel the product before we build.': 'Структура, сценарії користувачів і візуальний напрям із характером. Клікабельний прототип дає відчути продукт ще до розробки.',
    'We bring the design to life. Responsive layouts, thoughtful interactions and careful testing across screens.': 'Втілюємо дизайн у життя. Адаптивна верстка, продумані взаємодії та ретельне тестування на всіх екранах.',
    'Final checks, a smooth handover and your product out in the world. Then we keep an eye on what comes next.': 'Фінальні перевірки, плавна передача — і ваш продукт у світі. А далі ми стежимо за тим, що буде потім.',
    'AUTO PLAY': 'АВТОПОКАЗ',
    'PLAY SEQUENCE': 'ПОКАЗАТИ ЕТАПИ',
    'Pause automatic process slides': 'Призупинити автоматичний показ етапів',
    'Play automatic process slides': 'Запустити автоматичний показ етапів',
    '01 / FIND THE FOCUS': '01 / ЗНАЙТИ ФОКУС',
    'Every great thing starts here.': 'Усе велике починається тут.',
    '02 / GIVE IT CHARACTER': '02 / ДОДАТИ ХАРАКТЕРУ',
    'A little structure. A lot of possibility.': 'Трохи структури. Безліч можливостей.',
    '03 / BRING IT TO LIFE': '03 / ВТІЛИТИ В ЖИТТЯ',
    'Where the idea becomes real.': 'Тут ідея стає реальністю.',
    '04 / OUT INTO THE WORLD': '04 / У СВІТ',
    'This is just the beginning. ↗': 'Це лише початок. ↗',
    'STACKUP / DISCOVERY': 'STACKUP / ДОСЛІДЖЕННЯ',
    'A little': 'Трохи',
    'clarity.': 'ясності.',
    'A big idea.': 'Велика ідея.',
    'Your goals': 'Ваші цілі',
    'Your people': 'Ваші люди',
    'Our direction': 'Наш напрям',
    'DESIGN / EXPLORATION': 'ДИЗАЙН / ПОШУК',
    'YOUR NEXT CHAPTER': 'ВАШ НОВИЙ РОЗДІЛ',
    'Build': 'Створімо',
    'what’s': 'те, що',
    'next.': 'далі.',
    'BUILD / IN PROGRESS': 'РОЗРОБКА / У ПРОЦЕСІ',
    '// Good things take shape.': '// Добре набуває форми.',
    '✓ COMPILED WITH CARE': '✓ ЗІБРАНО З ТУРБОТОЮ',
    'STACKUP / DEPLOY': 'STACKUP / ЗАПУСК',
    'Hello,': 'Привіт,',
    'world.': 'світе.',
    'From a spark to something real.': 'Від іскри до чогось справжнього.',
    '● YOUR NEXT CHAPTER IS LIVE': '● ВАШ НОВИЙ РОЗДІЛ УЖЕ ОНЛАЙН',
    'THE BIG IDEA': 'ВЕЛИКА ІДЕЯ',
    'MAKE IT MATTER': 'ЗРОБИТИ ВАГОМО',
    'BUILDING…': 'ЗБИРАЄМО…',
    'WE ARE LIVE': 'МИ ОНЛАЙН',
    'CONNECT THE DOTS': 'З’ЄДНАТИ КРАПКИ',
    'DESIGN IN MOTION': 'ДИЗАЙН У РУСІ',
    'PIXELS → PRODUCT': 'ПІКСЕЛІ → ПРОДУКТ',
    'HELLO, WORLD': 'ПРИВІТ, СВІТЕ',

    /* 06 contact */
    '06 / YOUR NEXT CHAPTER': '06 / ВАШ НОВИЙ РОЗДІЛ',
    'Got a spark?': 'Маєте іскру?',
    'Let’s make': 'Втілімо',
    'it happen.': 'її разом.',
    'Tell us what’s on your mind.': 'Розкажіть, що задумали.',
    'We’ll find the right way forward, together.': 'Разом знайдемо правильний шлях.',
    'EMAIL ADDRESS FROM THE ORIGINAL CONCEPT': 'ЕЛЕКТРОННА АДРЕСА З ПОЧАТКОВОГО КОНЦЕПТУ',
    'Your name': 'Ваше ім’я',
    'How should we call you?': 'Як до вас звертатися?',
    'Phone': 'Телефон',
    'Let’s build it': 'Почнімо',
    'We’ll get back to you as soon as possible.': 'Ми зв’яжемося з вами якнайшвидше.',
    'Sending…': 'Надсилаємо…',
    'Thank you! Your request is in. We’ll get back to you very soon.': 'Дякуємо! Заявку отримано. Ми зв’яжемося з вами зовсім скоро.',
    'Your email draft is ready. Press send in your mail app and we’ll be in touch.': 'Чернетку листа готово. Натисніть «Надіслати» у поштовій програмі, і ми з вами зв’яжемося.',

    /* footer */
    'Your next big thing': 'Ваш наступний великий проєкт',
    'starts with a conversation.': 'починається з розмови.',
    'Services ↗': 'Послуги ↗',
    'Work ↗': 'Роботи ↗',
    'About ↗': 'Про нас ↗',
    'Process ↗': 'Процес ↗',
    'Contact ↗': 'Контакти ↗',
    'Project brief ↗': 'Бриф проєкту ↗',
    'BACK TO THE SPARK ↑': 'НАЗАД ДО ІСКРИ ↑',
    'MOTION EXPLORATIONS': 'АНІМАЦІЙНІ ЕКСПЕРИМЕНТИ',
    'Choose the motion accent': 'Оберіть анімаційний акцент',
    '01 / SPARKS ✧': '01 / ІСКРИ ✧',
    '02 / ORBIT ◎': '02 / ОРБІТА ◎',
    'STRATEGY. DESIGN. DEVELOPMENT.': 'СТРАТЕГІЯ. ДИЗАЙН. РОЗРОБКА.',
    'FROM IDEA TO IMPACT ↗': 'ВІД ІДЕЇ ДО РЕЗУЛЬТАТУ ↗',
    'CLOSE ×': 'ЗАКРИТИ ×',
    'Close project': 'Закрити проєкт'
  };

  /* ключі порівнюємо без зайвих пробілів і без селекторів варіантів (︎/️) */
  var norm = function (s) { return String(s).replace(/[︎️]/g, '').replace(/\s+/g, ' ').trim(); };
  /* стрілки ↗ ↖ ↘ повертаємо в текстовий вигляд, щоб iPhone не малював їх емодзі */
  var arrows = function (s) { return s.replace(/([↖-↙])(?![︎️])/g, '$1︎'); };
  var lookup = function (s) { var v = UK[norm(s)]; return v === undefined ? null : arrows(v); };
  var t = function (s) { if (lang !== 'uk') return s; var v = lookup(s); return v === null ? s : v; };

  var ATTRS = ['aria-label', 'alt', 'placeholder', 'title'];
  function apply(root) {
    if (lang !== 'uk' || !root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode && n.parentNode.nodeName;
        if (p === 'SCRIPT' || p === 'STYLE' || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var v = lookup(node.nodeValue);
      if (v === null) return;
      var m = node.nodeValue.match(/^(\s*)[\s\S]*?(\s*)$/);
      node.nodeValue = m[1] + v + m[2];
    });
    var els = root.querySelectorAll ? root.querySelectorAll('[' + ATTRS.join('],[') + ']') : [];
    Array.prototype.forEach.call(els, function (el) {
      ATTRS.forEach(function (a) {
        if (!el.hasAttribute(a)) return;
        var v = lookup(el.getAttribute(a));
        if (v !== null) el.setAttribute(a, v);
      });
    });
  }

  function set(next) {
    if (next === lang) return;
    try { localStorage.setItem(KEY, next); } catch (e) {}
    location.reload();
  }

  document.documentElement.lang = lang === 'uk' ? 'uk' : 'en';
  if (lang === 'uk') {
    apply(document.body);
    document.title = t(document.title);
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t(desc.getAttribute('content')));
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-lang]'), function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    b.addEventListener('click', function () { set(b.dataset.lang); });
  });

  window.STACKUP_I18N = { lang: lang, t: t, apply: apply, set: set };
})();
