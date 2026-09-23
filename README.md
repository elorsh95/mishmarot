# משמרות – ניהול סידור עבודה שבועי

מערכת web לניהול סידור עבודה שבועי לנציגי מכירות במוקד טלפוני. ממשק בעברית מלאה (RTL), מותאם למובייל.

- **מנהלי צוותים** משבצים את הנציגים שלהם לפי שבוע: משמרת (בוקר / ערב / כפולה), מיקום עבודה, או היעדרות.
- **חוק החריגים:** מעבר למכסה החודשית (ברירת מחדל: 2 ימים בחודש קלנדרי) לעבודה ממיקום שדורש מכסה (למשל "בית"), כל שיבוץ נוסף ממתין לאישור.
- **מנהלת המוקד** מאשרת או דוחה (עם הערה) במסך "בקשות לאישור", צופה ועורכת את כל הצוותים.
- **מנהל המערכת** מנהל משתמשים, תפקידים והרשאות, צוותים והגדרות.
- נציגים אינם משתמשים במערכת.

## טכנולוגיה

| שכבה | בחירה |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| DB | Cloud Firestore (דרך Firebase Admin SDK, בצד השרת בלבד) |
| התחברות | Firebase Authentication (שם משתמש + סיסמה, סיסמאות מנוהלות ומוצפנות ע״י Firebase), session cookie מסוג httpOnly |
| UI | Tailwind CSS v4, רכיבים משלנו ב-`src/components/ui`, אייקונים lucide |
| ולידציה | Zod |
| בדיקות | Vitest (יחידה) + Firebase Emulator (אינטגרציה) |
| אחסון | Firebase App Hosting |

## הרצה מקומית

דרישות: **Node.js 22**, **Java 21** (לאמולטור של Firebase).

```bash
npm install
cp .env.example .env.local     # מפנה את האפליקציה לאמולטור

# טרמינל 1: אמולטורים של Firestore ו-Auth (הנתונים נשמרים בין הרצות ב-.emulator-data)
npm run emulators

# טרמינל 2: נתוני דמו, ואז שרת הפיתוח
npm run seed                   # פעם אחת. להתחלה מחדש: npm run seed -- --reset
npm run dev
```

פותחים את http://localhost:3000. ממשק האמולטור (צפייה בנתונים) זמין ב-http://localhost:4000.

### משתמשי דמו

| שם משתמש | סיסמה | תפקיד |
|---|---|---|
| `admin` | `Admin1234` | מנהל מערכת |
| `center` | `Center1234` | מנהלת מוקד |
| `yossi` | `Team1234` | מנהל צוות רנו |
| `michal` | `Team1234` | מנהלת צוותים ניסאן ודאצ׳יה |

ה-seed יוצר גם 9 צוותים, 17 נציגים, משמרות, מיקומים וסידור לשבוע הנוכחי ולשבוע הבא, כולל בקשות שממתינות לאישור.

## פקודות

| פקודה | מה היא עושה |
|---|---|
| `npm run dev` | שרת פיתוח |
| `npm run build` | בניית production |
| `npm run lint` | ESLint, וגם בדיקה שקומפוננטות צד לקוח לא מייבאות קוד שרת |
| `npm run typecheck` | TypeScript |
| `npm test` | בדיקות יחידה (חוק המכסה, הרשאות) |
| `npm run test:integration` | בדיקות אינטגרציה מול אמולטור שמופעל אוטומטית (שיבוץ, אישורים, נעילות, העברות) |
| `npm run bootstrap` | הקמה ראשונית של פרויקט Firebase אמיתי (ראו למטה) |

## מבנה הפרויקט

```
src/
  app/
    (auth)/login/          התחברות
    (app)/                 כל המסכים אחרי התחברות (layout עם תפריט לפי הרשאות)
      schedule/  approvals/  agents/  transfers/
      teams/  users/  roles/  settings/  audit/  account/
  components/
    ui/                    רכיבי UI משותפים (Button, Dialog, Field…)
    layout/                מעטפת האפליקציה ורשימת התפריט (nav-items.ts)
  lib/                     תשתית: firebase, תאריכים, שגיאות, runAction, events
  modules/                 הלוגיקה העסקית, מודול לכל תחום
    permissions/           קטלוג ההרשאות ובדיקות (can / canForTeam / teamScope)
    schedule/              engine.ts (כל שינוי בסידור), quota.ts (חוק המכסה), service.ts
    approvals/  agents/  transfers/  teams/  users/  roles/  catalog/  settings/  audit/  auth/
scripts/                   seed, bootstrap
firestore.rules            חסימת גישה ישירה מהדפדפן (כל הגישה דרך השרת)
firestore.indexes.json     אינדקסים מורכבים
```

**עקרונות:**
- **שכבת ה-services היא מקור האמת.** כל service מקבל את המשתמש המבצע (`actor`) ובודק הרשאה בעצמו. דפים ו-actions הם שכבה דקה מעליו. דוחות, ייצוא וממשקי API עתידיים יקראו לאותם services.
- **הרשאות:** הקוד בודק מפתח הרשאה (למשל `schedule.edit`). איזה תפקיד מחזיק איזו הרשאה, ובאיזה היקף ("כל הצוותים" או "הצוותים שלו בלבד"), נשמר ב-DB וניתן לעריכה במסך "תפקידים והרשאות".
- **כל שינוי בסידור** עובר דרך `applyChanges` ב-`modules/schedule/engine.ts`, בטרנזקציה אחת: בדיקת הרשאה ונעילות, כתיבה, חישוב מחדש של חוק המכסה לכל נציג וחודש שהושפעו, פתיחה או ביטול של בקשות אישור, ורישום בלוג.
- **לוג פעולות** נכתב באותה טרנזקציה של השינוי (`auditInTx`).
- **אירועים** (`lib/events.ts`): למשל `approval.requested` או `week.published`. זו נקודת החיבור להתראות עתידיות, בלי לגעת בלוגיקה.

### חוק המכסה (עבודה מהבית)

- לכל מיקום עבודה יש סימון "דורש מכסה" (כברירת מחדל רק "בית").
- הספירה נעשית לכל נציג, בחודש קלנדרי (מה-1 עד סוף החודש), לפי **סדר התאריכים** ולא לפי סדר ההזנה.
- המכסה של נציג היא המכסה האישית שלו, אם הוגדרה, ואחרת ברירת המחדל מההגדרות (2).
- ימים 1 עד N נספרים "במסגרת המכסה". מהיום ה-N+1 והלאה השיבוץ "ממתין לאישור" ונפתחת בקשה.
- יום שנדחה לא נספר, ונשאר בסידור מסומן באדום עד שמנהל הצוות משנה אותו. יום שאושר נשאר מאושר.
- אם מוחקים או משנים יום מוקדם יותר, בקשה שנכנסת בחזרה למכסה נסגרת אוטומטית. כל זה נרשם בלוג.
- שינוי מכסה של נציג מחשב מחדש את החודש הנוכחי ואת החודשים הבאים.

### נעילות ופרסום

- שבוע שעבר נעול לעריכה. רק מי שמחזיק בהרשאה `schedule.editLocked` (מנהל מערכת ומנהלת מוקד) יכול לערוך אותו.
- סידור שפורסם נעול למנהל הצוות עד שהוא מחזיר אותו ל"טיוטה". מנהלת המוקד יכולה לערוך גם סידור שפורסם.

### העברת נציג בין צוותים

מנהל הצוות המקבל שולח בקשה ממסך "העברות נציגים", ומנהל הצוות הנוכחי של הנציג מאשר. באישור, השיבוצים מהיום והלאה עוברים עם הנציג, וההיסטוריה נשארת בצוות הקודם. מנהל מערכת ומנהלת מוקד יכולים גם להעביר ישירות ממסך הנציגים.

### יצירת משתמשים (הזמנה במייל)

מנהל המערכת יוצר משתמש עם שם משתמש, שם מלא, מייל, תפקיד וצוותים, בלי סיסמה. Firebase שולח למשתמש מייל עם קישור לדף `/auth/action` במערכת. שם המשתמש בוחר סיסמה ונכנס אוטומטית. עד אז הוא מסומן ברשימה כ"ממתין להפעלה".

- הקישור תקף לשעה אחת. אפשר לשלוח אותו שוב מרשימת המשתמשים (אייקון המעטפה), והמשתמש יכול גם לבקש קישור חדש בעצמו מ"שכחתי סיסמה".
- אותו מנגנון משמש גם ל"שכחתי סיסמה" בדף ההתחברות, לפי שם משתמש או מייל. התשובה זהה בכל מקרה, כדי שאי אפשר יהיה לגלות אילו משתמשים קיימים.
- עדיין אפשר להגדיר סיסמה ידנית (אייקון המפתח), למשל למשתמש בלי מייל.

**הגדרה חד-פעמית בקונסולת Firebase** (Authentication ← Templates):
1. **Template language:** עברית.
2. **Password reset** ← עריכה (עיפרון) ← **Customize action URL** ← `https://<כתובת-האתר>/auth/action`. בלי ההגדרה הזו הקישור יפתח את הדף הכללי של Firebase, שגם הוא עובד.
3. אפשר לערוך את הנושא ואת הטקסט של המייל, למשל "הגדרת סיסמה למערכת משמרות". המייל נשלח גם בהזמנה וגם באיפוס סיסמה, ולכן כדאי לנסח אותו כך שיתאים לשני המקרים.

## סביבות ופריסה

| Branch | סביבה | פרויקט Firebase |
|---|---|---|
| `dev` | פיתוח ובדיקות | `mishmarot-dev-cea4a` |
| `main` | production | `mishmarot-prod` |

**תהליך העבודה:** פיתוח ב-branch נפרד, ואז PR אל `dev`. אחרי merge, App Hosting פורס אוטומטית לסביבת dev ובודקים שם. אחרי אישור פותחים PR מ-`dev` אל `main`, ובסיום ה-merge הגרסה עולה ל-production.

GitHub Actions (`.github/workflows/ci.yml`) מריץ בכל PR את lint, typecheck, בדיקות יחידה, בדיקות אינטגרציה ו-build. ב-push ל-`dev` או ל-`main` הוא גם פורס את כללי האבטחה והאינדקסים של Firestore לפרויקט המתאים.

## מדריך הקמה ב-Firebase (פעם אחת לכל סביבה)

חוזרים על השלבים פעמיים: פעם ל-`mishmarot-dev` ופעם ל-`mishmarot-prod`.

1. **יצירת פרויקט:** ב-[Firebase Console](https://console.firebase.google.com) ← Add project. אם השם `mishmarot-dev` תפוס, Firebase יציע מזהה אחר. במקרה כזה עדכנו את המזהה בקובץ `.firebaserc`.
2. **תוכנית Blaze:** ⚙️ ← Usage and billing ← Blaze. App Hosting דורש חיבור כרטיס אשראי. בהיקף של מוקד העלות צפויה להיות אפסית או קרובה לאפס. מומלץ להגדיר תקציב והתראה ב-Google Cloud Billing.
3. **Firestore:** Build ← Firestore Database ← Create database. בוחרים מיקום (למשל `europe-west1` או `me-west1` תל אביב) ומצב **Production**.
4. **Authentication:** Build ← Authentication ← Get started ← Sign-in method ← מפעילים **Email/Password**. המערכת משתמשת בו מאחורי הקלעים עבור שם משתמש וסיסמה.
5. **Web API Key:** ⚙️ Project settings ← General ← מעתיקים את **Web API Key** ומדביקים בקובץ `apphosting.dev.yaml` (או `apphosting.prod.yaml`) במקום `REPLACE_WITH_...`. זה מזהה ציבורי, לא סוד.
6. **App Hosting:** Build ← App Hosting ← Create backend:
   - מחברים את GitHub ובוחרים את הריפו `elorsh95/mishmarot`.
   - Root directory: `/`. Live branch: `dev` בפרויקט ה-dev, או `main` בפרויקט ה-prod.
   - מפעילים **Automatic rollouts**.
   - אחרי היצירה: Backend ← Settings ← Environment ← **Environment name**: `dev` או `prod`, בהתאמה.
7. **Service account ל-GitHub Actions:** ⚙️ Project settings ← Service accounts ← Generate new private key. ב-GitHub: Settings ← Secrets and variables ← Actions ← New repository secret בשם `FIREBASE_SERVICE_ACCOUNT_DEV` (או `FIREBASE_SERVICE_ACCOUNT_PROD`), ומדביקים את כל תוכן קובץ ה-JSON. **אל תשמרו את הקובץ בריפו.**
8. **הקמת נתוני בסיס ומשתמש מנהל ראשון:** מתבצעת אוטומטית ב-GitHub Actions בכל push ל-`dev`/`main`, יחד עם פריסת הכללים והאינדקסים. כדי שייווצר משתמש מנהל, מוסיפים ב-GitHub את ה-secrets `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_NAME` ו-`BOOTSTRAP_ADMIN_PASSWORD`. אם המשתמש כבר קיים, השלב מדלג עליו. אפשר גם להריץ ידנית מהמחשב:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json FIREBASE_PROJECT_ID=mishmarot-dev-cea4a \
     npm run bootstrap -- --username admin --name "השם שלך" --password "סיסמה-חזקה1"
   ```
9. **Firestore indexes:** נפרסים אוטומטית ב-push הראשון ל-`dev`/`main` (שלב 7). אפשר גם ידנית: `npx firebase deploy --only firestore --project dev`.

## הוספת פיצ'רים בעתיד

- **מסך חדש:** תיקייה ב-`src/app/(app)/<route>` עם `page.tsx` ו-`actions.ts`, ופריט ב-`src/components/layout/nav-items.ts`.
- **הרשאה חדשה:** מוסיפים מפתח ב-`src/modules/permissions/catalog.ts`, בודקים אותו ב-service, ומעניקים אותה לתפקידים במסך "תפקידים והרשאות".
- **הגדרה חדשה:** שדה עם ברירת מחדל ב-`settingsSchema` (`src/modules/settings/service.ts`). בלי migration.
- **התראות:** מאזינים לאירועים ב-`src/lib/events.ts`.
- **דוחות וייצוא לאקסל:** קוראים ל-services הקיימים. הנתונים כבר מנורמלים לפי תאריך, חודש, צוות ונציג.
