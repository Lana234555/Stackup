# event-kit — готові сторіс і пости до свят і подій

Генерує кадри Instagram у затвердженому стилі Stackup (темний преміум, пастельний градієнт
peach → lavender → sky, скло, стікери Лани, Montserrat + Newsreader italic, без лайму як головного кольору).

```bash
node tools/event-kit/make.js tools/event-kit/specs/<id>.json
```

Скрипт пише `content/ig/<id>/01.jpg …` (1080×1920 для сторіс, 1080×1350 для поста) і мініатюри `t01.jpg …`,
а в консоль друкує готовий запис для `content/manifest.json`. Потім:
1. додати цей запис у `manifest.json` (`items`);
2. у `content/calendar.json` в подію додати `"example": ["<id>"]`, і в CRM («Стратегія → Свята і можливості») зʼявиться прев'ю з кнопкою затвердження.

## Spec
```jsonc
{
  "id": "bf-2026-stories",        // a-z 0-9 -, папка в content/ig
  "format": "stories",            // stories | post
  "title": "Сторіс: …", "event": "2026-11-27", "foot": "Підпис внизу сторіс",
  "proposedAt": "2026-11-30T10:00:00+02:00", "note": "Що це (бачить Лана)", "caption": "Підпис для поста",
  "frames": [{
    "eyebrow": "Black Friday", "h1": "Усі дають", "h2": "знижки.", "size": 116,
    "body": "Текст, **акцент** курсивом", "bodyWidth": 760,
    "big":  { "text": "−50%", "cross": true, "gradient": false, "font": 150, "size": 420, "x": 250 },
    "card": { "title": "Заголовок", "check": true, "items": [["Пункт", "пояснення"]] },
    "button": "Напишіть «АУДИТ»", "note": "дрібний текст", "pill": { "text": "До 3 грудня", "color": "lav" },
    "stickers": [["06-humor/11", 700, 1300, 320, 8]],   // папка/номер, x, y, ширина, поворот
    "colors": ["peach", "lav"], "x": 0, "y": 0
  }]
}
```
Стікери: `stickers/01-type-en … 06-humor`, по 12 у кожній (`sticker-01.png …`). Українські написи в `02-type-uk`.
Кольори: peach, lav, sky, mint, rose, stone або hex.
