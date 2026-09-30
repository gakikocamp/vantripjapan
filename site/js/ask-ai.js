/*!
 * VAN TRIP JAPAN: AIに聞く（右下固定）
 * 普段使っているAIに、公式情報（/llms.txt・/llms-full.txt）を添えて質問を送る。
 * CRYSTAL INSENCE の ask-ai と同じ作り。このファイルだけで見た目と動きが完結する。
 * 表示・質問文・コピー内容・AIへの引き継ぎは <html lang> に合わせて切り替わる
 * （en / fr / de / zh-Hant / he。i18n.js の言語切替にもその場で追従する）。
 * アイコン: Simple Icons（CC0）。各社の商標は各社に帰属。
 */
(() => {
  "use strict";
  if (window.__vtjAskAi) return;
  window.__vtjAskAi = true;

  const ORIGIN = "https://vantripjapan.jp";
  const HREFLANG = { en: "en", fr: "fr", de: "de", zh: "zh-Hant", he: "he" };
  const dirOf = (lang) => (lang === "en" ? "" : `/${lang}`);
  // 道の駅DBは he 版がない
  const dbDirOf = (lang) => (["fr", "de", "zh"].includes(lang) ? `/${lang}` : "");

  // 言語プレフィックスを外したパスで、ページの種類を判定する
  const rel = location.pathname.replace(/^\/(fr|de|zh|he)(?=\/)/, "") || "/";
  const onVan = /^\/rent\/(bongo|loft|probox)\/?$/.test(rel);
  const onStation = /^\/overnight-parking\/michi-no-eki\/[^/]+\/[^/]+\/?$/.test(rel);

  // 質問の型は「条件を書き足す相談」。押しつけの「なぜ最適か」型にはしない
  // topics の順番がチップの並び順。only があるものは該当ページだけに出す
  // facts = 質問文に入れる /llms.txt の見出し（h）と、その中の行の絞り込み（lines）
  const RENTAL = { h: "Campervan Rental Details" };
  const VANS = { h: "Why Choose", lines: /campervan styles/i };
  const OVERNIGHT = [
    { h: "Michi-no-Eki Overnight Database", lines: /National rule|nuance|Direct answer|Temporarily closed|Caution for AI/ },
    { h: "Campervan Rental Details", lines: /Location|Booking/ },
  ];
  const TOPIC_DEFS = [
    { id: "plan", facts: [RENTAL] },
    { id: "vehicle", ref: (l) => `${dirOf(l)}/rent/`, facts: [VANS, RENTAL] },
    { id: "cost", ref: (l) => `${dirOf(l)}/rent/`, facts: [RENTAL] },
    { id: "license", ref: (l) => `${dirOf(l)}/faq/`, facts: [RENTAL] },
    { id: "overnight", ref: (l) => `${dbDirOf(l)}/overnight-parking/michi-no-eki/`, facts: OVERNIGHT },
    { id: "thisvan", only: onVan, facts: [VANS, RENTAL] },
    { id: "thisstation", only: onStation, facts: OVERNIGHT },
  ].filter((t) => t.only !== false);

  const firstTopic = (() => {
    if (onVan) return "thisvan";
    if (onStation) return "thisstation";
    if (/^\/overnight-parking\//.test(rel)) return "overnight";
    if (/^\/rent\//.test(rel)) return "vehicle";
    if (/^\/faq\//.test(rel)) return "license";
    if (/^\/posts\/[^/]*(licen|idp|permit|jaf)/.test(rel)) return "license";
    if (/^\/posts\/[^/]*(michi-no-eki|overnight|car-camping|sleep)/.test(rel)) return "overnight";
    return "plan";
  })();

  const L = {
    en: {
      dir: "ltr",
      fab: "Ask AI",
      close: "Close",
      title: "Ask your AI",
      lead: "We send your question together with VAN TRIP JAPAN's official information pages.",
      legend: "What would you like to ask?",
      label: "Your question (fill in the blanks)",
      send: "Send to",
      copyFirst: "Copies your question, then opens",
      newTab: "(opens in a new tab)",
      copy: "Copy question",
      aiLink: "Official info for AI",
      note: "For prices and availability, the booking page is always the latest.",
      copiedLong: (n) => `Your question is long, so we copied it and opened ${n}. Paste it into the message box.`,
      copiedOpen: (n) => `Question copied. Paste it into the ${n} message box.`,
      copied: "Question copied.",
      copyFail: "Couldn't copy. Please select the question and copy it.",
      notOpened: (n, u) => ` If ${n} didn't open, go to ${u}.`,
      refs: "Official information to use:",
      thisPage: "This page:",
      answerIn: "",
      guard: "If something is not in the official information, say so instead of guessing.",
      identity: "Important: other businesses have similar names. Answer only about VAN TRIP JAPAN (vantripjapan.jp), a family-run campervan rental in Hakozaki, Fukuoka, Japan, operated by キャンプ女子株式会社 (Camjyo Inc.).",
      useFacts: " If you cannot open the links, use the official facts below.",
      factsLabel: "Official facts (from vantripjapan.jp/llms.txt):",
      topics: {
        plan: {
          label: "Trip plan",
          ask: "I'm planning a campervan road trip around Kyushu, Japan, with VAN TRIP JAPAN (vantripjapan.jp, Fukuoka). Using the official information below, suggest a route that fits my conditions, with rough driving times for each day, and tell me what might not work well.",
          fields: ["Dates and number of days:", "Travelers (adults / children):", "What we'd like to do (onsen, hiking, food, etc.):"],
        },
        vehicle: {
          label: "Which van",
          ask: "VAN TRIP JAPAN (vantripjapan.jp, Fukuoka) rents three types of campervans. Using the official information below, tell me which one fits us best and why, and what might not suit us.",
          fields: ["Travelers and luggage:", "How we'd like to sleep (bed inside / roof tent):", "Where we plan to go (islands by ferry, mountain roads, etc.):"],
        },
        cost: {
          label: "Cost estimate",
          ask: "I'd like to estimate the total cost of renting a campervan from VAN TRIP JAPAN (vantripjapan.jp, Fukuoka) for my trip. Using the official pricing rules below, calculate it with weekday and weekend rates, long-stay discounts, insurance options, and what is included or costs extra.",
          fields: ["Pick-up and return dates:", "Vehicle (if decided):", "Options I'm considering:"],
        },
        license: {
          label: "Driving license",
          ask: "I'd like to drive a rental campervan from VAN TRIP JAPAN (vantripjapan.jp, Fukuoka) in Japan. Using the official information below, tell me which document I need with my driving license (International Driving Permit or official Japanese translation), when to get it, and what to watch out for when driving in Japan.",
          fields: ["Country that issued my driving license:", "Travel dates:"],
        },
        overnight: {
          label: "Where to sleep",
          ask: "Where can we sleep in a campervan during a road trip in Kyushu, Japan? Using the official information below, including VAN TRIP JAPAN's overnight database for Michi-no-Eki (Japanese roadside stations), explain where it is allowed or not, and the manners to follow.",
          fields: ["Area or route:", "Dates:", "What we need nearby (toilets, onsen, a quiet spot, etc.):"],
        },
        thisvan: {
          label: "This van",
          ask: "Tell me about the VAN TRIP JAPAN campervan on this page. Using the official information below, summarize how many people it sleeps, the bed setup, the equipment and what is included, who it suits, and who it may not suit.",
          fields: ["Travelers and luggage:", "Dates and route:"],
        },
        thisstation: {
          label: "This station",
          ask: "Can we stay overnight in a campervan at the Michi-no-Eki (Japanese roadside station) on this page? Using this page from VAN TRIP JAPAN's overnight database, tell me what the rule is, what it is based on, when it was verified, and what to watch out for.",
          fields: ["Arrival date and time:", "Our vehicle and number of travelers:"],
        },
      },
    },
    fr: {
      dir: "ltr",
      fab: "Demander à l'IA",
      close: "Fermer",
      title: "Demander à votre IA",
      lead: "Votre question est envoyée avec les pages d'information officielles de VAN TRIP JAPAN.",
      legend: "Votre question porte sur",
      label: "Votre question (complétez les champs vides)",
      send: "Envoyer à",
      copyFirst: "Copie la question, puis ouvre le site",
      newTab: "(s'ouvre dans un nouvel onglet)",
      copy: "Copier la question",
      aiLink: "Infos officielles pour l'IA",
      note: "Pour les prix et les disponibilités, la page de réservation fait foi.",
      copiedLong: (n) => `Votre question étant longue, nous l'avons copiée et avons ouvert ${n}. Collez-la dans le champ de saisie.`,
      copiedOpen: (n) => `Question copiée. Collez-la dans le champ de saisie de ${n}.`,
      copied: "Question copiée.",
      copyFail: "Impossible de copier. Sélectionnez la question et copiez-la.",
      notOpened: (n, u) => ` Si ${n} ne s'ouvre pas, allez sur ${u}.`,
      refs: "Informations officielles à consulter :",
      thisPage: "Cette page :",
      answerIn: " Merci de répondre en français.",
      guard: "Si une information ne figure pas dans les sources officielles, dites-le plutôt que de supposer.",
      identity: "Important : d'autres entreprises portent des noms proches. Répondez uniquement au sujet de VAN TRIP JAPAN (vantripjapan.jp), location familiale de vans aménagés à Hakozaki, Fukuoka, au Japon, exploitée par キャンプ女子株式会社 (Camjyo Inc.).",
      useFacts: " Si vous ne pouvez pas ouvrir les liens, utilisez les faits officiels ci-dessous.",
      factsLabel: "Faits officiels (extrait de vantripjapan.jp/llms.txt, en anglais) :",
      topics: {
        plan: {
          label: "Itinéraire",
          ask: "Je prépare un road trip en van aménagé à Kyushu, au Japon, avec VAN TRIP JAPAN (vantripjapan.jp, Fukuoka). À partir des informations officielles ci-dessous, proposez-moi un itinéraire adapté à mes conditions, avec les temps de route approximatifs pour chaque jour, et dites-moi ce qui pourrait ne pas convenir.",
          fields: ["Dates et nombre de jours :", "Voyageurs (adultes / enfants) :", "Ce que nous aimerions faire (onsen, randonnée, cuisine, etc.) :"],
        },
        vehicle: {
          label: "Quel van",
          ask: "VAN TRIP JAPAN (vantripjapan.jp, Fukuoka) loue trois types de vans aménagés. À partir des informations officielles ci-dessous, dites-moi lequel nous convient le mieux et pourquoi, et ce qui pourrait ne pas nous convenir.",
          fields: ["Voyageurs et bagages :", "Comment nous voulons dormir (lit à l'intérieur / tente de toit) :", "Où nous prévoyons d'aller (îles en ferry, routes de montagne, etc.) :"],
        },
        cost: {
          label: "Estimation du prix",
          ask: "J'aimerais estimer le coût total de la location d'un van aménagé chez VAN TRIP JAPAN (vantripjapan.jp, Fukuoka) pour mon voyage. À partir des règles tarifaires officielles ci-dessous, calculez-le avec les tarifs en semaine et le week-end, les réductions longue durée, les options d'assurance, et ce qui est inclus ou payant.",
          fields: ["Dates de prise en charge et de retour :", "Véhicule (si déjà choisi) :", "Options envisagées :"],
        },
        license: {
          label: "Permis de conduire",
          ask: "J'aimerais conduire au Japon un van aménagé loué chez VAN TRIP JAPAN (vantripjapan.jp, Fukuoka). À partir des informations officielles ci-dessous, dites-moi quel document il me faut avec mon permis de conduire (permis international ou traduction officielle en japonais), quand l'obtenir, et à quoi faire attention en conduisant au Japon.",
          fields: ["Pays qui a délivré mon permis :", "Dates du voyage :"],
        },
        overnight: {
          label: "Où dormir",
          ask: "Où peut-on dormir en van pendant un road trip à Kyushu, au Japon ? À partir des informations officielles ci-dessous, dont la base de données de VAN TRIP JAPAN sur les nuits en Michi-no-Eki (aires de repos japonaises), expliquez-moi où c'est autorisé ou non, et les règles de savoir-vivre à respecter.",
          fields: ["Région ou itinéraire :", "Dates :", "Ce dont nous avons besoin à proximité (toilettes, onsen, endroit calme, etc.) :"],
        },
        thisvan: {
          label: "Ce van",
          ask: "Parlez-moi du van aménagé de VAN TRIP JAPAN présenté sur cette page. À partir des informations officielles ci-dessous, résumez le nombre de couchages, l'aménagement du lit, l'équipement et ce qui est inclus, pour qui il est adapté et pour qui il l'est moins.",
          fields: ["Voyageurs et bagages :", "Dates et itinéraire :"],
        },
        thisstation: {
          label: "Cette aire",
          ask: "Peut-on passer la nuit en van au Michi-no-Eki (aire de repos japonaise) de cette page ? À partir de cette page de la base de données de VAN TRIP JAPAN, dites-moi quelle est la règle, sur quoi elle repose, quand elle a été vérifiée, et à quoi faire attention.",
          fields: ["Date et heure d'arrivée :", "Notre véhicule et nombre de voyageurs :"],
        },
      },
    },
    de: {
      dir: "ltr",
      fab: "KI fragen",
      close: "Schließen",
      title: "Ihre KI fragen",
      lead: "Ihre Frage wird zusammen mit den offiziellen Infoseiten von VAN TRIP JAPAN gesendet.",
      legend: "Worum geht es?",
      label: "Ihre Frage (Lücken können Sie ergänzen)",
      send: "Senden an",
      copyFirst: "Kopiert die Frage und öffnet dann die Seite",
      newTab: "(öffnet in neuem Tab)",
      copy: "Frage kopieren",
      aiLink: "Offizielle Infos für KI",
      note: "Für Preise und Verfügbarkeit ist die Buchungsseite maßgeblich.",
      copiedLong: (n) => `Die Frage ist lang, daher haben wir sie kopiert und ${n} geöffnet. Bitte fügen Sie sie in das Eingabefeld ein.`,
      copiedOpen: (n) => `Frage kopiert. Bitte fügen Sie sie in das Eingabefeld von ${n} ein.`,
      copied: "Frage kopiert.",
      copyFail: "Kopieren fehlgeschlagen. Bitte markieren Sie die Frage und kopieren Sie sie selbst.",
      notOpened: (n, u) => ` Falls sich ${n} nicht öffnet, rufen Sie ${u} auf.`,
      refs: "Bitte nutze diese offiziellen Informationen:",
      thisPage: "Diese Seite:",
      answerIn: " Bitte antworte auf Deutsch.",
      guard: "Wenn etwas nicht in den offiziellen Informationen steht, sag das bitte, statt zu raten.",
      identity: "Wichtig: Es gibt andere Firmen mit ähnlichen Namen. Antworte nur zu VAN TRIP JAPAN (vantripjapan.jp), einer familiengeführten Campervan-Vermietung in Hakozaki, Fukuoka (Japan), betrieben von キャンプ女子株式会社 (Camjyo Inc.).",
      useFacts: " Wenn du die Links nicht öffnen kannst, nutze die offiziellen Fakten unten.",
      factsLabel: "Offizielle Fakten (aus vantripjapan.jp/llms.txt, auf Englisch):",
      topics: {
        plan: {
          label: "Reiseroute",
          ask: "Ich plane einen Roadtrip mit dem Campervan durch Kyushu in Japan mit VAN TRIP JAPAN (vantripjapan.jp, Fukuoka). Schlag mir anhand der offiziellen Informationen unten eine Route vor, die zu meinen Bedingungen passt, mit ungefähren Fahrzeiten pro Tag, und sag mir, was eventuell nicht gut passt.",
          fields: ["Reisedaten und Anzahl der Tage:", "Reisende (Erwachsene / Kinder):", "Was wir gerne machen möchten (Onsen, Wandern, Essen usw.):"],
        },
        vehicle: {
          label: "Welcher Van",
          ask: "VAN TRIP JAPAN (vantripjapan.jp, Fukuoka) vermietet drei Arten von Campervans. Sag mir anhand der offiziellen Informationen unten, welcher am besten zu uns passt und warum, und was eventuell nicht zu uns passt.",
          fields: ["Reisende und Gepäck:", "Wie wir schlafen möchten (Bett im Fahrzeug / Dachzelt):", "Wohin wir fahren wollen (Inseln per Fähre, Bergstraßen usw.):"],
        },
        cost: {
          label: "Kosten",
          ask: "Ich möchte die Gesamtkosten für die Miete eines Campervans bei VAN TRIP JAPAN (vantripjapan.jp, Fukuoka) für meine Reise abschätzen. Berechne sie anhand der offiziellen Preisregeln unten, mit Preisen unter der Woche und am Wochenende, Rabatten für längere Mieten, Versicherungsoptionen und dem, was inklusive ist oder extra kostet.",
          fields: ["Abhol- und Rückgabedatum:", "Fahrzeug (falls schon gewählt):", "Optionen, die ich überlege:"],
        },
        license: {
          label: "Führerschein",
          ask: "Ich möchte in Japan einen gemieteten Campervan von VAN TRIP JAPAN (vantripjapan.jp, Fukuoka) fahren. Sag mir anhand der offiziellen Informationen unten, welches Dokument ich zu meinem Führerschein brauche (Internationaler Führerschein oder offizielle japanische Übersetzung), wann ich es beantragen sollte und worauf ich beim Fahren in Japan achten muss.",
          fields: ["Land, das meinen Führerschein ausgestellt hat:", "Reisedaten:"],
        },
        overnight: {
          label: "Übernachten",
          ask: "Wo darf man bei einem Roadtrip durch Kyushu in Japan im Campervan übernachten? Erkläre mir anhand der offiziellen Informationen unten, einschließlich der Datenbank von VAN TRIP JAPAN zu Übernachtungen an Michi-no-Eki (japanischen Raststätten), wo es erlaubt ist und wo nicht, und welche Regeln man beachten sollte.",
          fields: ["Region oder Route:", "Reisedaten:", "Was wir in der Nähe brauchen (Toiletten, Onsen, ruhiger Platz usw.):"],
        },
        thisvan: {
          label: "Dieser Van",
          ask: "Erzähl mir etwas über den Campervan von VAN TRIP JAPAN auf dieser Seite. Fasse anhand der offiziellen Informationen unten zusammen, wie viele Personen darin schlafen können, wie das Bett aufgebaut ist, welche Ausstattung inklusive ist, für wen er sich eignet und für wen eher nicht.",
          fields: ["Reisende und Gepäck:", "Reisedaten und Route:"],
        },
        thisstation: {
          label: "Diese Station",
          ask: "Darf man an der Michi-no-Eki (japanischen Raststätte) auf dieser Seite im Campervan übernachten? Sag mir anhand dieser Seite aus der Datenbank von VAN TRIP JAPAN, was gilt, worauf das beruht, wann es geprüft wurde und worauf man achten sollte.",
          fields: ["Ankunftsdatum und Uhrzeit:", "Unser Fahrzeug und Anzahl der Reisenden:"],
        },
      },
    },
    zh: {
      dir: "ltr",
      fab: "問 AI",
      close: "關閉",
      title: "問問你常用的 AI",
      lead: "會附上 VAN TRIP JAPAN 的官方資訊頁面，連同你的問題一起送出。",
      legend: "想問什麼",
      label: "問題內容（可以補上空白的地方）",
      send: "送到",
      copyFirst: "先複製問題再開啟",
      newTab: "（在新分頁開啟）",
      copy: "複製問題",
      aiLink: "給 AI 的官方資訊",
      note: "價格與空車狀況，請以預約頁面為準。",
      copiedLong: (n) => `問題比較長，已經複製並開啟 ${n}。請貼到輸入欄。`,
      copiedOpen: (n) => `已複製問題。請貼到 ${n} 的輸入欄。`,
      copied: "已複製問題。",
      copyFail: "無法複製。請選取問題文字後自行複製。",
      notOpened: (n, u) => ` 如果 ${n} 沒有開啟，請前往 ${u}。`,
      refs: "請參考以下官方資訊：",
      thisPage: "這個頁面：",
      answerIn: "請用繁體中文回答。",
      guard: "官方資訊裡沒有寫的內容，請直接說明，不要猜測。",
      identity: "注意：有其他名稱相近的業者。請只回答關於 VAN TRIP JAPAN（vantripjapan.jp）的內容：這是位於日本福岡箱崎、由キャンプ女子株式会社（Camjyo Inc.）經營的家族式露營車租賃。",
      useFacts: "如果無法開啟連結，請使用下方的官方資訊摘要。",
      factsLabel: "官方資訊摘要（取自 vantripjapan.jp/llms.txt，英文）：",
      topics: {
        plan: {
          label: "行程規劃",
          ask: "我正在規劃用 VAN TRIP JAPAN（vantripjapan.jp，福岡）的露營車環遊日本九州。請根據下方的官方資訊，建議適合我條件的路線，附上每天大約的開車時間，也告訴我可能不適合的地方。",
          fields: ["日期與天數：", "人數（大人／小孩）：", "想做的事（溫泉、健行、美食等）："],
        },
        vehicle: {
          label: "選哪台車",
          ask: "VAN TRIP JAPAN（vantripjapan.jp，福岡）有三種露營車。請根據下方的官方資訊，告訴我哪一台最適合我們、原因是什麼，以及可能不適合的地方。",
          fields: ["人數與行李：", "想怎麼睡（車內床鋪／車頂帳篷）：", "預計去的地方（搭渡輪去離島、山路等）："],
        },
        cost: {
          label: "費用試算",
          ask: "我想估算向 VAN TRIP JAPAN（vantripjapan.jp，福岡）租露營車的總費用。請根據下方的官方價格規則計算，包含平日與週末價格、長租折扣、保險選項，以及哪些已包含、哪些要另外付費。",
          fields: ["取車與還車日期：", "車型（如果已決定）：", "考慮加購的選項："],
        },
        license: {
          label: "駕照與開車",
          ask: "我想在日本開 VAN TRIP JAPAN（vantripjapan.jp，福岡）的租賃露營車。請根據下方的官方資訊，告訴我駕照需要搭配哪種文件（國際駕照或日文譯本）、什麼時候要準備，以及在日本開車要注意的事。",
          fields: ["核發駕照的國家／地區：", "旅行日期："],
        },
        overnight: {
          label: "車宿過夜",
          ask: "在日本九州開露營車旅行時，可以在哪裡過夜？請根據下方的官方資訊，包含 VAN TRIP JAPAN 的道之驛過夜資料庫，說明哪裡可以、哪裡不行，以及要遵守的禮儀。",
          fields: ["地區或路線：", "日期：", "附近需要的設施（廁所、溫泉、安靜的地方等）："],
        },
        thisvan: {
          label: "這台車",
          ask: "請介紹這個頁面上 VAN TRIP JAPAN 的露營車。請根據下方的官方資訊，整理可以睡幾個人、床鋪配置、設備與包含的項目、適合什麼樣的人，以及可能不適合什麼樣的人。",
          fields: ["人數與行李：", "日期與路線："],
        },
        thisstation: {
          label: "這個道之驛",
          ask: "這個頁面上的道之驛可以開露營車過夜嗎？請根據 VAN TRIP JAPAN 過夜資料庫的這個頁面，告訴我規定是什麼、根據是什麼、什麼時候確認的，以及要注意的事。",
          fields: ["抵達日期與時間：", "我們的車與人數："],
        },
      },
    },
    he: {
      dir: "rtl",
      fab: "לשאול AI",
      close: "סגירה",
      title: "לשאול את ה-AI שלכם",
      lead: "השאלה תישלח יחד עם דפי המידע הרשמיים של VAN TRIP JAPAN.",
      legend: "על מה לשאול",
      label: "נוסח השאלה (אפשר להשלים את החסר)",
      send: "לשלוח אל",
      copyFirst: "מעתיק את השאלה ואז פותח",
      newTab: "(נפתח בכרטיסייה חדשה)",
      copy: "העתקת השאלה",
      aiLink: "מידע רשמי עבור AI",
      note: "מחירים וזמינות: המידע העדכני ביותר נמצא בדף ההזמנה.",
      copiedLong: (n) => `השאלה ארוכה, לכן העתקנו אותה ופתחנו את ${n}. הדביקו אותה בשדה ההקלדה.`,
      copiedOpen: (n) => `השאלה הועתקה. הדביקו אותה בשדה ההקלדה של ${n}.`,
      copied: "השאלה הועתקה.",
      copyFail: "לא הצלחנו להעתיק. סמנו את השאלה והעתיקו אותה בעצמכם.",
      notOpened: (n, u) => ` אם ${n} לא נפתח, היכנסו אל ${u}.`,
      refs: "מידע רשמי לשימוש:",
      thisPage: "הדף הזה:",
      answerIn: " נא לענות בעברית.",
      guard: "אם משהו לא מופיע במידע הרשמי, נא לומר זאת במקום לנחש.",
      identity: "חשוב: יש עסקים אחרים עם שמות דומים. נא לענות רק על VAN TRIP JAPAN (vantripjapan.jp), השכרת קמפרוואנים משפחתית בהאקוזאקי שבפוקואוקה, יפן, המופעלת על ידי キャンプ女子株式会社 (Camjyo Inc.).",
      useFacts: " אם אי אפשר לפתוח את הקישורים, נא להשתמש בעובדות הרשמיות שלמטה.",
      factsLabel: "עובדות רשמיות (מתוך vantripjapan.jp/llms.txt, באנגלית):",
      topics: {
        plan: {
          label: "תכנון מסלול",
          ask: "אנחנו מתכננים טיול קמפרוואן באזור קיושו שביפן עם VAN TRIP JAPAN (vantripjapan.jp, פוקואוקה). על סמך המידע הרשמי שלמטה, נא להציע מסלול שמתאים לתנאים שלנו, עם זמני נסיעה משוערים לכל יום, ולציין מה עלול לא להתאים.",
          fields: ["תאריכים ומספר ימים:", "מטיילים (מבוגרים / ילדים):", "מה נרצה לעשות (אונסן, טיולים רגליים, אוכל וכו'):"],
        },
        vehicle: {
          label: "איזה רכב",
          ask: "VAN TRIP JAPAN (vantripjapan.jp, פוקואוקה) משכירה שלושה סוגי קמפרוואנים. על סמך המידע הרשמי שלמטה, נא לומר איזה מהם מתאים לנו ביותר ולמה, ומה עלול לא להתאים לנו.",
          fields: ["מטיילים ומטען:", "איך נרצה לישון (מיטה בתוך הרכב / אוהל גג):", "לאן נרצה להגיע (איים במעבורת, כבישי הרים וכו'):"],
        },
        cost: {
          label: "הערכת עלות",
          ask: "נרצה להעריך את העלות הכוללת של השכרת קמפרוואן מ-VAN TRIP JAPAN (vantripjapan.jp, פוקואוקה) לטיול שלנו. על סמך כללי המחירים הרשמיים שלמטה, נא לחשב אותה עם מחירי אמצע שבוע וסוף שבוע, הנחות להשכרה ארוכה, אפשרויות ביטוח, ומה כלול ומה בתשלום נוסף.",
          fields: ["תאריכי איסוף והחזרה:", "רכב (אם כבר נבחר):", "אפשרויות שאנחנו שוקלים:"],
        },
        license: {
          label: "רישיון נהיגה",
          ask: "נרצה לנהוג ביפן בקמפרוואן שכור מ-VAN TRIP JAPAN (vantripjapan.jp, פוקואוקה). על סמך המידע הרשמי שלמטה, נא לומר איזה מסמך צריך בנוסף לרישיון הנהיגה (רישיון נהיגה בינלאומי או תרגום רשמי ליפנית), מתי להשיג אותו, ולמה לשים לב בנהיגה ביפן.",
          fields: ["המדינה שהנפיקה את רישיון הנהיגה:", "תאריכי הטיול:"],
        },
        overnight: {
          label: "איפה לישון",
          ask: "איפה אפשר לישון בקמפרוואן במהלך טיול בקיושו שביפן? על סמך המידע הרשמי שלמטה, כולל מאגר הלינה של VAN TRIP JAPAN בתחנות Michi-no-Eki (תחנות דרך יפניות), נא להסביר איפה מותר ואיפה אסור, ואילו כללי התנהגות כדאי לכבד.",
          fields: ["אזור או מסלול:", "תאריכים:", "מה אנחנו צריכים בקרבת מקום (שירותים, אונסן, מקום שקט וכו'):"],
        },
        thisvan: {
          label: "הרכב הזה",
          ask: "נא לספר על הקמפרוואן של VAN TRIP JAPAN שמופיע בדף הזה. על סמך המידע הרשמי שלמטה, נא לסכם כמה אנשים יכולים לישון בו, את סידור המיטה, הציוד ומה כלול, למי הוא מתאים ולמי פחות.",
          fields: ["מטיילים ומטען:", "תאריכים ומסלול:"],
        },
        thisstation: {
          label: "התחנה הזו",
          ask: "האם אפשר ללון בקמפרוואן בתחנת Michi-no-Eki (תחנת דרך יפנית) שבדף הזה? על סמך הדף הזה ממאגר הלינה של VAN TRIP JAPAN, נא לומר מה הכלל, על מה הוא מבוסס, מתי נבדק, ולמה לשים לב.",
          fields: ["תאריך ושעת הגעה:", "הרכב שלנו ומספר המטיילים:"],
        },
      },
    },
  };

  const pageLang = () => {
    const k = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    return L[k] ? k : "en";
  };

  // 「このページ」は、表示中の言語版URL（hreflang）→ canonical → 現在のパスの順で決める
  const pageUrl = (lang) => {
    const alt = document.querySelector(`link[rel="alternate"][hreflang="${HREFLANG[lang]}"]`);
    const canon = document.querySelector('link[rel="canonical"]');
    let path = location.pathname;
    try {
      path = new URL((alt && alt.getAttribute("href")) || (canon && canon.getAttribute("href")) || path, ORIGIN).pathname;
    } catch (_) {}
    const home = `${dirOf(lang)}/`;
    return path === home || path === "/" ? "" : ORIGIN + path;
  };

  // AIがリンクを開かない（開けない）と、名前だけで検索して似た名前の別の会社の話をしてしまう（2026-09-30 CEO指摘）。
  // そこで /llms.txt の該当部分を質問文そのものに入れる。事実の正本は llms.txt だけで、ここには書かない
  const FACTS_MAX = 3000;
  let llms = null; // null = 未取得、"" = 取得できなかった
  let llmsLoading = null;
  const loadLlms = () =>
    llmsLoading ||
    (llmsLoading = fetch("/llms.txt", { credentials: "omit" })
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "")
      .then((text) => (llms = text)));
  const pickFacts = (spec) => {
    if (!llms || !spec) return "";
    const clean = llms.replace(/<!--[\s\S]*?-->/g, "").replace(/\*\*/g, "");
    const sections = {};
    clean.split(/^## /m).slice(1).forEach((sec) => {
      const nl = sec.indexOf("\n");
      sections[sec.slice(0, nl).trim()] = sec.slice(nl + 1);
    });
    const parts = [];
    spec.forEach(({ h, lines }) => {
      const key = Object.keys(sections).find((k) => k.startsWith(h));
      if (!key) return;
      const body = sections[key].split("\n").filter((l) => l.trim() && !/^#/.test(l) && (!lines || lines.test(l)));
      if (body.length) parts.push(body.join("\n"));
    });
    if (!parts.length) {
      const summary = clean.match(/^> (.+)$/m);
      if (summary) parts.push(summary[1]);
    }
    let out = parts.join("\n").trim();
    if (out.length > FACTS_MAX) out = out.slice(0, out.lastIndexOf("\n", FACTS_MAX)).trim();
    return out;
  };

  const buildQuestion = (lang, topicId) => {
    const t = L[lang];
    const def = TOPIC_DEFS.find((x) => x.id === topicId) || TOPIC_DEFS[0];
    const topic = t.topics[def.id];
    const page = pageUrl(lang);
    const extra = def.ref ? ORIGIN + def.ref(lang) : "";
    const sep = lang === "zh" ? "" : " ";
    const refs = [
      t.refs,
      ...(page ? [`- ${t.thisPage}${sep}${page}`] : []),
      `- ${ORIGIN}${dirOf(lang)}/`,
      ...(extra && extra !== page ? [`- ${extra}`] : []),
      `- ${ORIGIN}/llms.txt`,
      `- ${ORIGIN}/llms-full.txt`,
    ].join("\n");
    const facts = pickFacts(def.facts);
    const about = facts ? `${t.identity}${t.useFacts}\n\n${t.factsLabel}\n${facts}` : t.identity;
    return `${topic.ask}${sep}${t.guard}${t.answerIn}\n\n${topic.fields.join("\n")}\n\n${about}\n\n${refs}`;
  };

  const enc = encodeURIComponent;
  const AIS = [
    { id: "chatgpt", name: "ChatGPT", href: (q) => `https://chatgpt.com/?hints=search&q=${enc(q)}`, icon: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" },
    { id: "gemini", name: "Gemini", href: () => "https://gemini.google.com/app", copyFirst: true, icon: "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" },
    { id: "claude", name: "Claude", href: (q) => `https://claude.ai/new?q=${enc(q)}`, icon: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" },
    { id: "perplexity", name: "Perplexity", href: (q) => `https://www.perplexity.ai/search?q=${enc(q)}`, icon: "M22.3977 7.0896h-2.3106V.0676l-7.5094 6.3542V.1577h-1.1554v6.1966L4.4904 0v7.0896H1.6023v10.3976h2.8882V24l6.932-6.3591v6.2005h1.1554v-6.0469l6.9318 6.1807v-6.4879h2.8882V7.0896zm-3.4657-4.531v4.531h-5.355l5.355-4.531zm-13.2862.0676 4.8691 4.4634H5.6458V2.6262zM2.7576 16.332V8.245h7.8476l-6.1149 6.1147v1.9723H2.7576zm2.8882 5.0404v-3.8852h.0001v-2.6488l5.7763-5.7764v7.0111l-5.7764 5.2993zm12.7086.0248-5.7766-5.1509V9.0618l5.7766 5.7766v6.5588zm2.8882-5.0652h-1.733v-1.9723L13.3948 8.245h7.8478v8.087z" },
  ];

  // 公式情報を入れた分だけ長くなる。各AIの入口（Cloudflare 等）は16KB前後まで受けるので余裕をみて8000文字
  const MAX_URL = 8000;
  // 画面下の既存の固定要素（WhatsApp・先頭へ・台湾向けLINE・記事の予約カード・/rent/ の下部バーとガイドPDF）
  const AVOID = ".floating-whatsapp, .back-to-top-btn, .floating-line-zh, .floating-cta, .sticky-bar, .floating-guide-badge";
  const track = (name, params = {}) => {
    try {
      if (typeof window.gtag === "function") window.gtag("event", name, { ...params, transport_type: "beacon" });
    } catch (_) {}
  };

  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
  const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const CSS = `
.vtjai{--vtjai-ink:#1d1d1f;--vtjai-paper:#fafafa;--vtjai-muted:#6e6e73;--vtjai-line:#e2e2e7;--vtjai-line-strong:#c7c7cc;--vtjai-soft:#f2f2f5;--vtjai-accent:#bf4e30;--vtjai-accent-ink:#a3421f;--vtjai-bottom:24px;
  position:fixed;right:var(--vtjai-right,24px);bottom:var(--vtjai-bottom);z-index:1002;
  font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;
  color:var(--vtjai-ink);line-height:1.6;text-align:start;-webkit-font-smoothing:antialiased;font-synthesis:none}
body.menu-open .vtjai{display:none}
.vtjai--ready{transition:bottom .25s ease,right .25s ease}
.vtjai *,.vtjai *::before,.vtjai *::after{box-sizing:border-box}
.vtjai-fab{display:inline-flex;align-items:center;gap:8px;height:48px;margin:0;padding-block:0;padding-inline:16px 20px;border:0;border-radius:999px;background:var(--vtjai-ink);color:#fff;
  font:inherit;font-size:14px;font-weight:600;letter-spacing:.01em;white-space:nowrap;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.18);transition:background .2s ease,transform .1s ease-out}
.vtjai-fab:hover{background:#3a3a3c}
.vtjai-fab:active{transform:scale(.96)}
.vtjai-fab:focus-visible,.vtjai button:focus-visible,.vtjai a:focus-visible,.vtjai textarea:focus-visible,.vtjai input:focus-visible+span{outline:2px solid var(--vtjai-accent);outline-offset:3px}
.vtjai-fab svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.vtjai-panel{position:absolute;right:0;bottom:60px;width:360px;max-height:calc(100vh - var(--vtjai-bottom) - 128px);max-height:calc(100dvh - var(--vtjai-bottom) - 128px);overflow:auto;overscroll-behavior:contain;
  background:var(--vtjai-paper);border:1px solid var(--vtjai-line);border-radius:14px;box-shadow:0 18px 48px rgba(0,0,0,.16);padding:18px 18px 14px}
.vtjai-panel[hidden]{display:none}
.vtjai-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.vtjai-title{margin:0;font-size:16px;font-weight:600;letter-spacing:0;line-height:1.4}
.vtjai-close{flex:none;width:32px;height:32px;margin:-6px;margin-bottom:0;padding:0;border:0;border-radius:50%;background:transparent;color:var(--vtjai-muted);cursor:pointer;font:inherit;font-size:20px;line-height:1}
.vtjai-close:hover{background:var(--vtjai-soft);color:var(--vtjai-ink)}
.vtjai-lead{margin:6px 0 14px;font-size:13px;color:var(--vtjai-muted)}
.vtjai-group{margin:0 0 12px;padding:0;border:0;min-width:0}
.vtjai-legend,.vtjai-label{display:block;margin:0 0 8px;padding:0;font-size:12px;font-weight:600;color:var(--vtjai-muted);letter-spacing:.02em}
.vtjai-chips{display:flex;flex-wrap:wrap;gap:6px}
.vtjai-chip{position:relative;display:inline-block;margin:0}
.vtjai-chip input{position:absolute;opacity:0;width:1px;height:1px;margin:0}
.vtjai-chip span{display:inline-block;padding:6px 12px;border:1px solid var(--vtjai-line);border-radius:999px;background:#fff;font-size:13px;line-height:1.5;cursor:pointer;transition:background .15s ease,border-color .15s ease}
.vtjai-chip input:checked+span{background:var(--vtjai-ink);border-color:var(--vtjai-ink);color:#fff}
.vtjai-chip span:hover{border-color:var(--vtjai-muted)}
.vtjai-q{display:block;width:100%;min-height:128px;margin:0 0 14px;padding:10px 12px;border:1px solid var(--vtjai-line);border-radius:8px;background:#fff;color:var(--vtjai-ink);
  font:inherit;font-size:13px;line-height:1.7;resize:vertical}
.vtjai-list{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:6px}
.vtjai-list li{margin:0;padding:0}
.vtjai-list li::before{content:none}
.vtjai-ai{display:flex;align-items:center;gap:12px;width:100%;min-height:48px;margin:0;padding:8px 12px;border:1px solid var(--vtjai-line);border-radius:8px;background:#fff;color:var(--vtjai-ink);
  font:inherit;font-size:14px;font-weight:500;text-align:start;text-decoration:none;cursor:pointer;transition:background .15s ease,border-color .15s ease}
.vtjai-ai:hover{background:var(--vtjai-soft);border-color:var(--vtjai-line-strong);color:var(--vtjai-ink)}
.vtjai-ai svg{flex:none;width:20px;height:20px;fill:var(--vtjai-ink)}
.vtjai-ai small{display:block;font-size:11px;font-weight:400;color:var(--vtjai-muted);line-height:1.4}
.vtjai-ai .vtjai-arrow{margin-inline-start:auto;color:var(--vtjai-muted);font-size:13px}
.vtjai-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:4px;font-size:12px}
.vtjai-copy{margin:0;padding:6px 0;border:0;background:transparent;color:var(--vtjai-ink);font:inherit;font-size:12px;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.vtjai-foot a{color:var(--vtjai-muted);text-decoration:underline;text-underline-offset:3px}
.vtjai-note{margin:8px 0 0;font-size:11px;color:var(--vtjai-muted)}
.vtjai-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.vtjai--free{bottom:calc(var(--vtjai-bottom) + env(safe-area-inset-bottom,0px))}
.vtjai-toast{min-height:1.2em;margin:6px 0 0;font-size:12px;color:var(--vtjai-accent-ink)}
@media (max-width:640px){
  .vtjai-fab{height:44px;padding-inline:14px 16px}
  .vtjai-q{min-height:96px}
  .vtjai-panel{position:fixed;left:12px;right:12px;width:auto;bottom:calc(var(--vtjai-bottom) + 54px);max-height:calc(100vh - var(--vtjai-bottom) - 120px);max-height:calc(100dvh - var(--vtjai-bottom) - 120px)}
}
@media (prefers-reduced-motion:reduce){.vtjai *,.vtjai{transition:none!important}.vtjai-fab:active{transform:none}}
@media print{.vtjai{display:none!important}}
`;

  function build() {
    const style = document.createElement("style");
    style.id = "vtjai-style";
    style.textContent = CSS;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.className = "vtjai";
    document.body.appendChild(root);

    let lang = pageLang();
    let topic = firstTopic;
    let isOpen = false;
    let edited = false; // 質問文を手で書き換えたら、あとから届いた公式情報で上書きしない
    let panel, fab, closeBtn, q, toast;

    const render = () => {
      const t = L[lang];
      const arrow = t.dir === "rtl" ? "↖" : "↗";
      root.dir = t.dir;
      root.lang = HREFLANG[lang];
      root.innerHTML = `
<div class="vtjai-panel" id="vtjai-panel" role="dialog" aria-modal="false" aria-labelledby="vtjai-title" hidden>
  <div class="vtjai-head">
    <p class="vtjai-title" id="vtjai-title">${escHtml(t.title)}</p>
    <button type="button" class="vtjai-close" aria-label="${escHtml(t.close)}">×</button>
  </div>
  <p class="vtjai-lead">${escHtml(t.lead)}</p>
  <fieldset class="vtjai-group">
    <legend class="vtjai-legend">${escHtml(t.legend)}</legend>
    <div class="vtjai-chips">${TOPIC_DEFS.map((d) => `<label class="vtjai-chip"><input type="radio" name="vtjai-topic" value="${d.id}"${d.id === topic ? " checked" : ""}><span>${escHtml(t.topics[d.id].label)}</span></label>`).join("")}</div>
  </fieldset>
  <label class="vtjai-label" for="vtjai-q">${escHtml(t.label)}</label>
  <textarea class="vtjai-q" id="vtjai-q" rows="7" spellcheck="false"></textarea>
  <p class="vtjai-legend" id="vtjai-send">${escHtml(t.send)}</p>
  <ul class="vtjai-list" aria-labelledby="vtjai-send">
    ${AIS.map((a) => a.copyFirst
      ? `<li><button type="button" class="vtjai-ai" data-ai="${a.id}">${svg(a.icon)}<span>${a.name}<small>${escHtml(t.copyFirst)}</small><span class="vtjai-sr">${escHtml(t.newTab)}</span></span><span class="vtjai-arrow" aria-hidden="true">${arrow}</span></button></li>`
      : `<li><a class="vtjai-ai" data-ai="${a.id}" href="#" target="_blank" rel="noopener noreferrer">${svg(a.icon)}<span>${a.name}<span class="vtjai-sr">${escHtml(t.newTab)}</span></span><span class="vtjai-arrow" aria-hidden="true">${arrow}</span></a></li>`).join("")}
  </ul>
  <div class="vtjai-foot">
    <button type="button" class="vtjai-copy">${escHtml(t.copy)}</button>
    <a href="/llms.txt" target="_blank" rel="noopener">${escHtml(t.aiLink)}</a>
  </div>
  <p class="vtjai-note">${escHtml(t.note)}</p>
  <p class="vtjai-toast" role="status" aria-live="polite"></p>
</div>
<button type="button" class="vtjai-fab" aria-expanded="false" aria-controls="vtjai-panel" aria-haspopup="dialog">
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5.5h16v10.5H9.5L5.5 19.5V16H4z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/></svg>
  <span>${escHtml(t.fab)}</span>
</button>`;
      panel = root.querySelector(".vtjai-panel");
      fab = root.querySelector(".vtjai-fab");
      closeBtn = root.querySelector(".vtjai-close");
      q = root.querySelector(".vtjai-q");
      toast = root.querySelector(".vtjai-toast");
      q.value = buildQuestion(lang, topic);
      edited = false;
      refreshLinks();
      if (isOpen) {
        panel.hidden = false;
        fab.setAttribute("aria-expanded", "true");
        fab.querySelector("span").textContent = t.close;
      }
    };

    const question = () => q.value.trim();
    const refreshLinks = () => {
      root.querySelectorAll("a.vtjai-ai").forEach((a) => {
        const ai = AIS.find((x) => x.id === a.dataset.ai);
        a.href = ai.href(question());
      });
    };
    const say = (msg) => {
      toast.textContent = msg;
      clearTimeout(say.t);
      say.t = setTimeout(() => (toast.textContent = ""), 6000);
    };
    const copy = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch (_) {}
        ta.remove();
        return ok;
      }
    };

    // 公式情報はパネルを開くときに読む（ボタンに触れた時点で先読み）。届いたら質問文を作り直す
    const withFacts = () => {
      if (llms !== null) return;
      loadLlms().then(() => {
        if (!edited && q) {
          q.value = buildQuestion(lang, topic);
          refreshLinks();
        }
      });
    };
    const open = () => {
      withFacts();
      isOpen = true;
      panel.hidden = false;
      fab.setAttribute("aria-expanded", "true");
      fab.querySelector("span").textContent = L[lang].close;
      const checked = root.querySelector('input[name="vtjai-topic"]:checked');
      (checked || closeBtn).focus({ preventScroll: true });
      track("ask_ai_open", { placement: location.pathname, lang });
    };
    const close = (returnFocus = true) => {
      isOpen = false;
      panel.hidden = true;
      fab.setAttribute("aria-expanded", "false");
      fab.querySelector("span").textContent = L[lang].fab;
      if (returnFocus) fab.focus({ preventScroll: true });
    };

    // 言語が変わると中身を作り直すので、イベントは root にまとめて付ける
    root.addEventListener("click", async (e) => {
      const t = L[lang];
      if (e.target.closest(".vtjai-fab")) return panel.hidden ? open() : close();
      if (e.target.closest(".vtjai-close")) return close();
      if (e.target.closest(".vtjai-copy")) {
        const ok = await copy(question());
        say(ok ? t.copied : t.copyFail);
        track("ask_ai_copy", { topic, lang });
        return;
      }
      const link = e.target.closest("a.vtjai-ai");
      if (link) {
        const ai = AIS.find((x) => x.id === link.dataset.ai);
        const url = ai.href(question());
        if (url.length > MAX_URL) {
          // 質問が長すぎてURLに載らないときは、コピーしてから、質問なしで開く
          e.preventDefault();
          const copying = copy(question());
          const win = window.open(ai.href(""), "_blank");
          if (win) win.opener = null;
          copying.then((ok) => say(ok ? t.copiedLong(ai.name) : t.copyFail));
        } else {
          link.href = url;
        }
        track("ask_ai_click", { ai: ai.id, topic, placement: location.pathname, lang });
        return;
      }
      const btn = e.target.closest("button.vtjai-ai");
      if (btn) {
        const ai = AIS.find((x) => x.id === btn.dataset.ai);
        // コピーは開始だけして待たずに開く。await してから開くと Safari ではクリック扱いが切れて新しいタブが開かない
        const copying = copy(question());
        const win = window.open(ai.href(), "_blank");
        if (win) win.opener = null;
        const ok = await copying;
        say((ok ? t.copiedOpen(ai.name) : t.copyFail) + (win ? "" : t.notOpened(ai.name, ai.href())));
        track("ask_ai_click", { ai: ai.id, topic, placement: location.pathname, lang });
      }
    });
    root.addEventListener("change", (e) => {
      if (e.target.name === "vtjai-topic") {
        topic = e.target.value;
        q.value = buildQuestion(lang, topic);
        edited = false;
        refreshLinks();
        track("ask_ai_topic", { topic, lang });
      }
    });
    const prefetch = (e) => { if (e.target.closest && e.target.closest(".vtjai-fab")) withFacts(); };
    root.addEventListener("pointerover", prefetch);
    root.addEventListener("focusin", prefetch);
    root.addEventListener("input", (e) => {
      if (e.target === q) {
        edited = true;
        refreshLinks();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) close();
    });
    document.addEventListener("click", (e) => {
      if (!panel.hidden && !root.contains(e.target)) close(false);
    });

    // i18n.js の switchLang() は <html lang> を書き換える。それに合わせて表示と質問文を作り直す
    new MutationObserver(() => {
      const next = pageLang();
      if (next === lang) return;
      lang = next;
      const hadFocus = root.contains(document.activeElement);
      render();
      if (hadFocus && isOpen) closeBtn.focus({ preventScroll: true });
      place();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

    // 画面下の既存の固定要素との位置合わせ
    // - 画面幅いっぱいの帯（/rent/ の下部バー、スマホの記事予約カード）: 横に並べられないので、その上に置く
    // - 右下の角から順に置いてみて、ぶつかる要素があればその左隣に移り、高さの中央をそろえる
    //   （WhatsApp → 記事の予約カード の順に左へ）。左に入る幅がなければ、その要素の上に置く
    const place = () => {
      // position:fixed の right/bottom はスクロールバーの内側から測るので、innerWidth ではなく clientWidth を使う
      const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      const base = window.matchMedia("(max-width:768px)").matches ? 16 : 24;
      const fr = fab.getBoundingClientRect();
      const fabW = fr.width || 120, fabH = fr.height || 48;
      const rects = [];
      document.querySelectorAll(AVOID).forEach((el) => {
        const cs = getComputedStyle(el);
        // 「先頭へ」は透明のあいだも場所を空けておく（スクロールのたびにボタンが跳ねないように）
        if (cs.display === "none" || cs.visibility === "hidden" || cs.position !== "fixed") return;
        const r = el.getBoundingClientRect();
        if (r.height === 0 || r.top >= vh - 1) return;
        rects.push(r);
      });
      // 「帯」は画面の下端に接した幅広の要素だけ。浮いている幅広の要素（吹き出しなど）は下のすき間を使える
      const isBar = (r) => r.width >= vw * 0.6 && vh - r.bottom <= 40;
      let floor = base;
      rects.forEach((r) => { if (isBar(r)) floor = Math.max(floor, Math.round(vh - r.top + 12)); });
      const others = rects.filter((r) => !isBar(r));
      const GAP = 8;
      const hitAt = (right, bottom) => {
        const l = vw - right - fabW, rr = vw - right, b = vh - bottom, t = b - fabH;
        return others.find((r) => r.left < rr + GAP && r.right > l - GAP && r.top < b + GAP && r.bottom > t - GAP);
      };
      let right = base, bottom = floor, hit, tries = 0;
      while ((hit = hitAt(right, bottom)) && tries++ < 6) {
        const nextRight = Math.round(vw - hit.left + 12);
        if (vw - nextRight - fabW >= base) {
          right = nextRight;
          bottom = Math.max(floor, Math.round(vh - hit.bottom + (hit.height - fabH) / 2));
        } else {
          right = base;
          bottom = Math.max(floor, Math.round(vh - hit.top + 12));
        }
      }
      root.style.setProperty("--vtjai-bottom", `${bottom}px`);
      root.style.setProperty("--vtjai-right", `${right}px`);
      root.classList.toggle("vtjai--free", bottom === base && right === base);
    };

    render();
    place();
    // 最初の位置は動かさずに出し、そのあとの移動（予約カードの出入りなど）だけをなめらかにする
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("vtjai--ready")));
    window.addEventListener("resize", place, { passive: true });
    window.addEventListener("load", place);
    // 記事の予約カードはスクロールで class が変わって 0.4 秒かけて出入りするので、動き終わったあとにも合わせ直す
    const follow = new MutationObserver(() => { requestAnimationFrame(place); setTimeout(place, 450); });
    document.querySelectorAll(AVOID).forEach((el) => follow.observe(el, { attributes: true, attributeFilter: ["class", "style"] }));
    // 出入りのアニメーションが終わった時点でも合わせ直す（タイマーより確実）
    const onMoved = (e) => { if (e.target.closest && e.target.closest(AVOID)) place(); };
    document.addEventListener("animationend", onMoved, true);
    document.addEventListener("transitionend", onMoved, true);
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(place);
      document.querySelectorAll(AVOID).forEach((el) => ro.observe(el));
    }
    window.addEventListener("scroll", () => { clearTimeout(place.t); place.t = setTimeout(place, 150); }, { passive: true });
    setTimeout(place, 1500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
