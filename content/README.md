# content/ — контент для системи керування Stackup

Кабінет (`admin.html` → розділи «Контент» і «Матеріали») читає звідси два файли.

## manifest.json — публікації Instagram
```json
{ "items": [ {
  "id": "c01-hto-my",              // a-z 0-9 -, унікальний і незмінний (стан у таблиці прив'язаний до id)
  "kind": "carousel",               // carousel | post | stories | reel
  "title": "Хто ми такі?",
  "media": ["ig/01-hto-my/01.jpg"], // JPEG (Instagram не приймає PNG), 1080×1350 для стрічки, 1080×1920 для сторіс
  "thumbs": ["ig/01-hto-my/t01.jpg"],
  "video": "ig/reel-x/video.mp4",   // лише для reel (H.264 + AAC, 9:16)
  "caption": "Підпис + хештеги",    // до 2200 символів; для stories порожньо
  "note": "Що це і навіщо (бачить Лана)",
  "proposedAt": "2026-12-01T10:00:00+02:00", // пропонований час, Лана може змінити
  "pin": true, "highlight": "Про нас", "series": "Запуск · 9 постів"
} ] }
```
Нові публікації: додати файли в `ig/<id>/` і запис у `items`. Після злиття в `main` вони з'являються в кабінеті як «На затвердженні», а в Telegram приходить сповіщення. Затверджене публікує `publishDue()` у `backend/Code.gs`.

## library.json — матеріали компанії
Групи `{ id, title, note, items: [{ name, file, thumb, type: png|jpg|pdf|link, link }] }`. Файли в `library/`.

## insights.json і calendar.json

`insights.json` — розділ «Стратегія»: `trends[]` (новіші першими: `date`, `title`, `summary`, `items[{tag,title,what,use,source}]`), `weekly[]` (`title`, `range`, `summary`, `blocks[{title,items}]`, `plan[{day,what,why}]`, `questions[]`), `market{summary,facts,ourPluses,ourMinuses,competitors,gaps,positioning,sources}`, `lessons[{id,module,minutes,title,body[],task}]`. У тексті можна `**жирний**`.

`calendar.json` — `events[{date:'YYYY-MM-DD', title, kind: holiday|sale|opportunity|industry|content, idea, prep}]`.

Обидва файли Claude може оновлювати напряму в main (лише папка content/).
