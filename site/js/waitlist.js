/**
 * キャンセル待ち（waitlist）— 満車と表示されたお客様の登録フォーム
 *
 * 使う場所: /rent/ の検索結果（全車満車の箱・各車の「空いたら通知」）と /book/
 * 文言は5言語（en/fr/de/zh/he）をこのファイルに持つ（ask-ai.js と同じ方式。
 * i18n.js の ?v= を全ページで上げずに済む）。キーの一致は qa-i18n-smoke.js が検査する。
 * 送信先: POST /api/waitlist（functions/api/waitlist.js）
 */
(function () {
  'use strict';

  /* WAITLIST_I18N_START */
  var I18N = {
    en: {
      all_full_title: 'All vans are booked for these dates',
      all_full_body: "Cancellations do happen. Join the waitlist and we'll email you as soon as a van opens up for your dates. No payment, no commitment.",
      next_free_label: 'Next free dates:',
      next_free_one: 'Next free: {dates}',
      see_dates: 'See these dates',
      notify_one: 'Notify me if this van opens up',
      email_label: 'Email',
      email_ph: 'you@example.com',
      wa_label: 'WhatsApp (optional)',
      wa_ph: '+ country code and number',
      opt_sakura: 'Send me the cherry-blossom early-bird rate before it ends on {date}',
      opt_autumn: 'Give me first access when autumn {year} dates open',
      submit: 'Join the waitlist',
      sending: 'Sending…',
      privacy: 'We only use your email for these updates. Every email has a one-click stop link.',
      success: "You're on the waitlist. We've sent a confirmation to {email}.",
      error: 'Something went wrong. Please try again or message Karen on WhatsApp.',
      invalid_email: 'Please enter a valid email address.'
    },
    fr: {
      all_full_title: 'Tous les vans sont réservés à ces dates',
      all_full_body: "Des annulations arrivent. Inscrivez-vous sur la liste d'attente : nous vous écrivons dès qu'un van se libère à vos dates. Sans paiement, sans engagement.",
      next_free_label: 'Prochaines dates libres :',
      next_free_one: 'Prochaine disponibilité : {dates}',
      see_dates: 'Voir ces dates',
      notify_one: 'Me prévenir si ce van se libère',
      email_label: 'E-mail',
      email_ph: 'vous@exemple.fr',
      wa_label: 'WhatsApp (facultatif)',
      wa_ph: '+33 6 12 34 56 78',
      opt_sakura: "M'envoyer le tarif early-bird de la saison des cerisiers avant sa fin, le {date}",
      opt_autumn: "Me prévenir en premier à l'ouverture des dates d'automne {year}",
      submit: "Rejoindre la liste d'attente",
      sending: 'Envoi…',
      privacy: 'Votre e-mail sert uniquement à ces informations. Chaque e-mail contient un lien de désinscription en un clic.',
      success: "Vous êtes sur la liste d'attente. Une confirmation a été envoyée à {email}.",
      error: 'Une erreur s’est produite. Réessayez ou écrivez à Karen sur WhatsApp.',
      invalid_email: 'Veuillez saisir une adresse e-mail valide.'
    },
    de: {
      all_full_title: 'Alle Vans sind an diesen Daten ausgebucht',
      all_full_body: 'Stornierungen kommen vor. Tragen Sie sich in die Warteliste ein, dann schreiben wir Ihnen, sobald ein Van für Ihre Daten frei wird. Ohne Zahlung, ohne Verpflichtung.',
      next_free_label: 'Nächste freie Termine:',
      next_free_one: 'Nächster freier Termin: {dates}',
      see_dates: 'Diese Daten ansehen',
      notify_one: 'Benachrichtigen, wenn dieser Van frei wird',
      email_label: 'E-Mail',
      email_ph: 'sie@beispiel.de',
      wa_label: 'WhatsApp (optional)',
      wa_ph: '+49 151 12345678',
      opt_sakura: 'Frühbucher-Tarif für die Kirschblütenzeit senden, bevor er am {date} endet',
      opt_autumn: 'Zuerst informieren, sobald die Herbsttermine {year} buchbar sind',
      submit: 'Auf die Warteliste',
      sending: 'Wird gesendet…',
      privacy: 'Wir nutzen Ihre E-Mail nur für diese Hinweise. Jede E-Mail enthält einen Abmeldelink.',
      success: 'Sie stehen auf der Warteliste. Wir haben eine Bestätigung an {email} geschickt.',
      error: 'Etwas ist schiefgelaufen. Bitte erneut versuchen oder Karen auf WhatsApp schreiben.',
      invalid_email: 'Bitte eine gültige E-Mail-Adresse eingeben.'
    },
    zh: {
      all_full_title: '這段日期所有車都已預訂',
      all_full_body: '訂單偶爾會取消。加入候補名單，只要您的日期有車空出來，我們就會立刻寄信通知您。不需付款，也沒有任何約束。',
      next_free_label: '最近的空檔：',
      next_free_one: '最近空檔：{dates}',
      see_dates: '查看這些日期',
      notify_one: '這台車空出來時通知我',
      email_label: '電子郵件',
      email_ph: 'you@example.com',
      wa_label: 'WhatsApp（選填）',
      wa_ph: '+886 912 345 678',
      opt_sakura: '在 {date} 截止前，寄給我櫻花季早鳥價',
      opt_autumn: '{year} 年秋季日期開放時，第一時間通知我',
      submit: '加入候補名單',
      sending: '傳送中…',
      privacy: '您的電子郵件只用於這些通知。每封信都附有一鍵停止接收的連結。',
      success: '已加入候補名單。確認信已寄到 {email}。',
      error: '發生錯誤。請再試一次，或用 WhatsApp 聯絡 Karen。',
      invalid_email: '請輸入有效的電子郵件地址。'
    },
    he: {
      all_full_title: 'כל הוואנים תפוסים בתאריכים האלה',
      all_full_body: 'ביטולים קורים. הצטרפו לרשימת ההמתנה ונשלח לכם מייל ברגע שוואן יתפנה בתאריכים שלכם. בלי תשלום ובלי התחייבות.',
      next_free_label: 'התאריכים הפנויים הקרובים:',
      next_free_one: 'הפנוי הקרוב: {dates}',
      see_dates: 'לתאריכים האלה',
      notify_one: 'עדכנו אותי אם הוואן הזה מתפנה',
      email_label: 'אימייל',
      email_ph: 'you@example.com',
      wa_label: 'וואטסאפ (לא חובה)',
      wa_ph: '+972 50 123 4567',
      opt_sakura: 'שלחו לי את מחיר ההזמנה המוקדמת לעונת פריחת הדובדבן לפני שהוא מסתיים ב-{date}',
      opt_autumn: 'עדכנו אותי ראשונים כשייפתחו התאריכים לסתיו {year}',
      submit: 'הצטרפות לרשימת ההמתנה',
      sending: 'שולח…',
      privacy: 'נשתמש באימייל רק לעדכונים האלה. בכל מייל יש קישור להפסקה בלחיצה אחת.',
      success: 'נרשמתם לרשימת ההמתנה. שלחנו אישור אל {email}.',
      error: 'משהו השתבש. נסו שוב או כתבו לקארן בוואטסאפ.',
      invalid_email: 'נא להזין כתובת אימייל תקינה.'
    }
  };
  /* WAITLIST_I18N_END */

  var LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', zh: 'zh-TW', he: 'he-IL' };
  var VEHICLE_NAMES = { probox: 'Toyota Probox', bongo: 'Mazda Bongo', loft: 'Daihatsu Pocket Loft' };

  function lang() {
    var code = window.VTJ_FORCE_LANG;
    if (!code) { try { code = currentLang; } catch (e) { /* i18n.js 未読込 */ } }
    if (!code) code = (document.documentElement.lang || 'en');
    code = String(code).slice(0, 2).toLowerCase();
    return I18N[code] ? code : 'en';
  }
  function t(key, vars) {
    var dict = I18N[lang()] || I18N.en;
    var s = dict[key] || I18N.en[key] || key;
    return s.replace(/\{(\w+)\}/g, function (_, name) { return vars && vars[name] != null ? vars[name] : '{' + name + '}'; });
  }
  function todayIso() {
    var d = new Date(Date.now() + 9 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function fmt(iso, withYear) {
    try {
      var opts = { month: 'short', day: 'numeric', timeZone: 'UTC' };
      if (withYear) opts.year = 'numeric';
      return new Intl.DateTimeFormat(LOCALES[lang()], opts).format(new Date(iso + 'T00:00:00Z'));
    } catch (e) { return iso; }
  }
  function fmtRange(from, to) { return fmt(from) + ' – ' + fmt(to); }
  function overlaps(ranges, from, to) {
    for (var i = 0; i < (ranges || []).length; i++) {
      if (from < ranges[i].to && to > ranges[i].from) return true;
    }
    return false;
  }
  // 希望日の翌日以降で、同じ日数がまるごと空いている最初の日程（空き状況APIの範囲 約6ヶ月以内）
  function nextFree(ranges, from, days) {
    var horizon = addDays(todayIso(), 180);
    for (var i = 1; i <= 180; i++) {
      var s = addDays(from, i), e = addDays(s, days);
      if (e > horizon) return null;
      if (!overlaps(ranges, s, e)) return { from: s, to: e };
    }
    return null;
  }
  function sakuraUntil() {
    var data = window.VTJ_RATE_DATA || (typeof VTJ_RATE_DATA !== 'undefined' ? VTJ_RATE_DATA : null);
    if (!data) return null;
    for (var i = 0; i < data.length; i++) {
      if (data[i].key === 'sakura' && data[i].early && todayIso() <= data[i].early.until) return data[i].early.until;
    }
    return null;
  }
  function autumnYear() {
    var today = todayIso();
    var y = parseInt(today.slice(0, 4), 10);
    return parseInt(today.slice(5, 7), 10) >= 7 ? y + 1 : y;
  }
  function track(name, params) {
    try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) { /* 計測は画面を止めない */ }
  }

  function injectStyles() {
    if (document.getElementById('vtj-wl-style')) return;
    var css = '' +
      '.vtj-wl{text-align:start;background:var(--rent-surface,#fff);border:1.5px solid var(--rent-accent,#C4704B);border-radius:var(--rent-radius,16px);padding:18px 18px 14px;margin:14px 0 18px;box-shadow:0 6px 22px rgba(196,112,75,.10);color:var(--rent-text,#2D2A26)}' +
      '.vtj-wl.compact{border-width:1px;box-shadow:none;padding:12px;margin:10px 0 0}' +
      '.vtj-wl-title{font-weight:800;font-size:17px;margin:0 0 6px}' +
      '.vtj-wl-body{font-size:14px;line-height:1.6;margin:0 0 10px;color:var(--rent-text-secondary,#5C5446)}' +
      '.vtj-wl-next{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;margin:0 0 12px}' +
      '.vtj-wl-next span{font-weight:700}' +
      '.vtj-wl-chip{display:inline-block;padding:5px 10px;border-radius:var(--rent-radius-pill,100px);background:rgba(196,112,75,.10);color:var(--rent-accent-dark,#A85A38);font-weight:700;text-decoration:none}' +
      '.vtj-wl-chip:hover{background:rgba(196,112,75,.18)}' +
      '.vtj-wl-form{display:grid;gap:10px}' +
      '.vtj-wl-row{display:grid;gap:10px;grid-template-columns:1fr 1fr}' +
      '@media (max-width:560px){.vtj-wl-row{grid-template-columns:1fr}}' +
      '.vtj-wl-form label{display:grid;gap:4px;font-size:13px;font-weight:700;text-transform:none;letter-spacing:normal;color:inherit;margin:0}' +
      '.vtj-wl-form input[type=email],.vtj-wl-form input[type=tel]{width:100%;box-sizing:border-box;font:inherit;font-size:15px;font-weight:400;padding:10px 12px;border:1px solid var(--rent-border,#E8DFD1);border-radius:var(--rent-radius-sm,10px);background:#fff;color:inherit}' +
      '.vtj-wl-form input:focus{outline:2px solid var(--rent-accent,#C4704B);outline-offset:1px}' +
      '.vtj-wl-form .vtj-wl-check{display:flex;gap:8px;align-items:flex-start;font-weight:500;line-height:1.45}' +
      '.vtj-wl-check input{margin-top:3px;flex:none;width:16px;height:16px;accent-color:var(--rent-accent,#C4704B)}' +
      '.vtj-wl-submit{font:inherit;font-weight:800;font-size:15px;color:#fff;background:var(--rent-accent,#C4704B);border:0;border-radius:var(--rent-radius-pill,100px);padding:12px 18px;cursor:pointer}' +
      '.vtj-wl-submit[disabled]{opacity:.6;cursor:default}' +
      '.vtj-wl-privacy{font-size:11.5px;color:var(--rent-text-secondary,#5C5446);margin:0;line-height:1.5}' +
      '.vtj-wl-msg{font-size:14px;font-weight:700;margin:0}' +
      '.vtj-wl-msg.err{color:#B42318}' +
      '.vtj-wl-done{font-size:15px;font-weight:700;color:#1F7A4D;margin:0}' +
      '.vtj-wl-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}' +
      '.result-strip .rs-next{font-size:13px;font-weight:600;margin-top:6px;line-height:1.5}' +
      '.result-strip .rs-next a{color:var(--rent-accent-dark,#A85A38);font-weight:800}' +
      '.vtj-wl-open{font:inherit;font-size:13px;font-weight:700;color:var(--rent-accent-dark,#A85A38);background:none;border:1px dashed var(--rent-accent,#C4704B);border-radius:var(--rent-radius-pill,100px);padding:7px 12px;margin-top:8px;cursor:pointer}';
    var style = document.createElement('style');
    style.id = 'vtj-wl-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    for (var k in (attrs || {})) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * フォームを差し込む
   * opts: { from, to, guests, vehicles:[slug], compact:bool, nextFree:[{slug,from,to,href}], source }
   */
  function mount(container, opts) {
    if (!container || !opts || !opts.from || !opts.to) return null;
    injectStyles();
    var days = Math.round((Date.parse(opts.to) - Date.parse(opts.from)) / 86400000);
    var box = el('div', { 'class': 'vtj-wl' + (opts.compact ? ' compact' : '') });
    if (!opts.compact) {
      box.id = 'waitlist';
      box.appendChild(el('p', { 'class': 'vtj-wl-title' }, '🔔 ' + t('all_full_title')));
      box.appendChild(el('p', { 'class': 'vtj-wl-body' }, t('all_full_body')));
      if (opts.nextFree && opts.nextFree.length) {
        var next = el('div', { 'class': 'vtj-wl-next' });
        next.appendChild(el('span', null, t('next_free_label')));
        opts.nextFree.forEach(function (n) {
          var chip = el('a', { 'class': 'vtj-wl-chip', href: n.href }, (VEHICLE_NAMES[n.slug] || n.slug) + ' · ' + fmtRange(n.from, n.to));
          chip.addEventListener('click', function () { track('waitlist_next_free_click', { vehicle: n.slug }); });
          next.appendChild(chip);
        });
        box.appendChild(next);
      }
    }

    // <form> は使わない: /book/ では予約フォームの内側に入るため、入れ子や name の衝突
    // （予約側の email を上書き・required で予約送信を止める）を起こさない
    var form = el('div', { 'class': 'vtj-wl-form', role: 'form' });
    var hp = el('input', { type: 'text', tabindex: '-1', autocomplete: 'off', 'class': 'vtj-wl-hp', 'aria-hidden': 'true' });
    form.appendChild(hp);

    var row = el('div', { 'class': 'vtj-wl-row' });
    var emailLabel = el('label', null, t('email_label'));
    var email = el('input', { type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: t('email_ph') });
    emailLabel.appendChild(email);
    var waLabel = el('label', null, t('wa_label'));
    var wa = el('input', { type: 'tel', autocomplete: 'tel', placeholder: t('wa_ph') });
    waLabel.appendChild(wa);
    row.appendChild(emailLabel);
    row.appendChild(waLabel);
    form.appendChild(row);

    var sakuraDate = sakuraUntil();
    var sakura = null, autumn;
    if (sakuraDate) {
      var sl = el('label', { 'class': 'vtj-wl-check' });
      sakura = el('input', { type: 'checkbox' });
      sl.appendChild(sakura);
      sl.appendChild(el('span', null, t('opt_sakura', { date: fmt(sakuraDate, true) })));
      form.appendChild(sl);
    }
    var al = el('label', { 'class': 'vtj-wl-check' });
    autumn = el('input', { type: 'checkbox' });
    al.appendChild(autumn);
    al.appendChild(el('span', null, t('opt_autumn', { year: autumnYear() })));
    form.appendChild(al);

    var submit = el('button', { type: 'button', 'class': 'vtj-wl-submit' }, t('submit'));
    form.appendChild(submit);
    form.appendChild(el('p', { 'class': 'vtj-wl-privacy' }, t('privacy')));
    var msg = el('p', { 'class': 'vtj-wl-msg', role: 'status', 'aria-live': 'polite' });
    form.appendChild(msg);
    box.appendChild(form);

    function send(ev) {
      if (ev) ev.preventDefault();
      if (submit.disabled) return;
      msg.className = 'vtj-wl-msg';
      msg.textContent = '';
      var value = String(email.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        msg.className = 'vtj-wl-msg err';
        msg.textContent = t('invalid_email');
        email.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = t('sending');
      fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: value,
          whatsapp: wa.value,
          from: opts.from,
          to: opts.to,
          guests: opts.guests,
          vehicles: opts.vehicles || [],
          lang: lang(),
          sakura: !!(sakura && sakura.checked),
          autumn: !!autumn.checked,
          website: hp.value,
          path: location.pathname + location.search
        })
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function () {
        form.innerHTML = '';
        form.appendChild(el('p', { 'class': 'vtj-wl-done' }, '✅ ' + t('success', { email: value })));
        track('waitlist_join', {
          vehicles: (opts.vehicles || []).join(','),
          days: days,
          guests: opts.guests,
          scope: opts.compact ? 'one_vehicle' : 'all_full',
          source: opts.source || ''
        });
      }).catch(function () {
        submit.disabled = false;
        submit.textContent = t('submit');
        msg.className = 'vtj-wl-msg err';
        msg.textContent = t('error');
      });
    }
    submit.addEventListener('click', send);
    // Enter で外側の予約フォームが送信されないようにする
    [email, wa].forEach(function (input) {
      input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') send(ev); });
    });

    container.appendChild(box);
    if (!opts.compact) track('waitlist_view', { days: days, guests: opts.guests, source: opts.source || '' });
    return box;
  }

  if (document.head) injectStyles();

  window.VTJWaitlist = {
    t: t,
    lang: lang,
    fmtRange: fmtRange,
    overlaps: overlaps,
    nextFree: nextFree,
    mount: mount,
    injectStyles: injectStyles,
    _i18n: I18N
  };
})();
