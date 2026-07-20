/* ============================================================
   VanTripJapan Admin — Booking Management (Cloudflare)
   ============================================================ */

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

// --- Pricing (mirror of /book/ so the dashboard shows amounts for any booking) ---
const VEHICLE_BASE = { 'MAZDA BONGO': 22000, 'TOYOTA PROBOX': 22000, 'DAIHATSU POCKET LOFT': 25000 };
const DISCOUNT_TIERS = [
    { minDays: 21, rate: 0.20, label: '20% OFF' },
    { minDays: 14, rate: 0.15, label: '15% OFF' },
    { minDays: 7, rate: 0.10, label: '10% OFF' },
];
function estimateTotal(vehicleType, pickup, returns) {
    const base = VEHICLE_BASE[vehicleType];
    const p = new Date(pickup), r = new Date(returns);
    if (!base || isNaN(p) || isNaN(r)) return null;
    const days = Math.ceil((r - p) / (1000 * 60 * 60 * 24));
    if (!(days > 0)) return null;
    const weekendRate = Math.round(base * 1.5);
    const weekly = (5 * base) + (2 * weekendRate);
    const baseTotal = (Math.floor(days / 7) * weekly) + ((days % 7) * base);
    const tier = DISCOUNT_TIERS.find((t) => days >= t.minDays);
    return { total: Math.round(baseTotal * (1 - (tier ? tier.rate : 0))), label: tier ? tier.label : null, days };
}
function fmtYen(n) { return '¥' + Number(n).toLocaleString('ja-JP'); }
// 予約レコードの金額表示（保存済みestimated_totalを優先、無ければ車種+日付から算出）
function bookingPriceHtml(b) {
    let total = b.estimated_total, label = null;
    if (!total) { const e = estimateTotal(b.vehicle_type, b.pickup_datetime, b.return_datetime); if (e) { total = e.total; label = e.label; } }
    if (!total) return '<span style="color:var(--text-muted)">-</span>';
    return `<strong>${fmtYen(total)}</strong>` + (label ? ` <small style="color:#34d399">${label}</small>` : '');
}

// --- Customer origin (language + country) stored in notes JSON at booking time ---
const LANG_LABELS = { en: '🇬🇧 English', fr: '🇫🇷 Français', de: '🇩🇪 Deutsch', zh: '🇹🇼 中文', he: '🇮🇱 עברית' };
function parseBookingMeta(notes) {
    if (!notes) return {};
    try { const m = JSON.parse(notes); if (m && typeof m === 'object') return m; } catch (e) { /* not JSON */ }
    return {};
}
function langLabel(code) { return code ? (LANG_LABELS[code] || ('🌐 ' + code)) : null; }
function countryFlag(cc) {
    if (!cc || cc.length !== 2) return cc || null;
    const A = 0x1F1E6;
    return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65) + ' ' + cc;
}

// --- Modal helpers (robust close: X button, backdrop click, Escape) ---
function closeModal(id) { const m = $('#' + id); if (m) m.classList.remove('active'); }
function closeAllModals() { $$('.modal-overlay.active').forEach((m) => m.classList.remove('active')); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllModals(); });
document.addEventListener('click', (e) => {
    // クリックがオーバーレイ自身（＝モーダル外側の暗幕）なら閉じる
    if (e.target.classList && e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
});

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function showToast(message, type = 'success') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

async function api(path, options = {}) {
    try {
        const res = await fetch(path, options);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Error' }));
            throw new Error(err.error || err.detail || 'API Error');
        }
        return await res.json();
    } catch (e) {
        showToast(e.message, 'error');
        throw e;
    }
}

// --- Navigation ---
function initNav() {
    $$('.nav-item, .tab-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            switchPage(page);
        });
    });

    $('#mobileToggle')?.addEventListener('click', () => {
        $('#sidebar').classList.toggle('open');
    });
}

function switchPage(pageName) {
    $$('.nav-item, .tab-item').forEach(n => n.classList.remove('active'));
    $(`.nav-item[data-page="${pageName}"]`)?.classList.add('active');
    $(`.tab-item[data-page="${pageName}"]`)?.classList.add('active');

    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${pageName}`)?.classList.add('active');

    const titles = {
        bookings: '予約',
        crm: 'メルマガ・CRM',
    };
    $('#pageTitle').textContent = titles[pageName] || pageName;

    if (pageName === 'bookings') loadBookings();
    if (pageName === 'crm') loadCRM();

    $('#sidebar').classList.remove('open');
}


// ============================================================
// Bookings Management
// ============================================================

// ── 「次にやること」ガイド(誰でも迷わない番号付き手順) ──
function waPhoneLink(phone, text) {
    if (!phone) return null;
    let d = String(phone).replace(/\D/g, '');
    if (!d) return null;
    if (d.startsWith('0')) d = '81' + d.slice(1);
    return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

function buildGuide(b, meta) {
    const first = (b.full_name || '').split(' ')[0] || 'there';
    const wa = (text) => waPhoneLink(b.phone, text);
    const steps = [];
    const day0 = (d) => { const x = new Date(d); if (isNaN(x)) return null; x.setHours(0,0,0,0); return x; };
    const today = new Date(); today.setHours(0,0,0,0);
    const pd = day0(b.pickup_datetime), rd = day0(b.return_datetime);
    const pdDiff = pd ? Math.round((pd - today) / 86400000) : null;
    const rdDiff = rd ? Math.round((rd - today) / 86400000) : null;

    if (b.status === 'form_submitted') {
        const msg = `Hi ${first}! Karen here from VAN TRIP JAPAN 🚐 Thank you for your booking request! I've checked the calendar and...`;
        steps.push({ n: 1, label: '空き状況をカレンダーで確認する', note: '同じ日程の他の予約がないか見てください' });
        steps.push({ n: 2, label: wa(msg) ? 'WhatsAppで返事を送る' : 'メールで返事を送る', href: wa(msg) || (b.email ? `mailto:${b.email}` : null), icon: '💬' });
        steps.push({ n: 3, label: '話がまとまったら下のボタン', btn: { text: '📋 書類待ちに進める', action: `changeBookingStatus(${b.id},'docs_requested')` }, note: '次は手続きリンクを送る段階になります' });
    } else if (b.status === 'docs_requested') {
        const msg = `Hi ${first}! Please complete your booking here (license upload + a few details) 👉 `;
        steps.push({ n: 1, label: '手続きリンクをコピーする', btn: { text: '📋 リンクをコピー', action: `copyCompleteLink('${(b.complete_url || '').replace(/'/g, '')}')` } });
        steps.push({ n: 2, label: wa(msg) ? 'WhatsAppを開いて貼り付けて送る' : 'メールに貼り付けて送る', href: wa(msg) || (b.email ? `mailto:${b.email}` : null), icon: '💬' });
        steps.push({ n: 3, label: 'あとは待つだけ', note: 'お客様が書類を上げると自動で「✅書類受領」に変わり、あなたにメールが届きます' });
    } else if (b.status === 'docs_received') {
        const msg = `Hi ${first}! Here is your secure payment link for your VAN TRIP JAPAN booking 👉 (リンクをここに貼ってください)`;
        steps.push({ n: 1, label: 'Stripeで決済リンクを作る', href: 'https://dashboard.stripe.com/payment-links/create', icon: '🔗', note: `金額: ${b.estimated_total ? '¥' + Number(b.estimated_total).toLocaleString() : '見積もりを確認'}` });
        steps.push({ n: 2, label: wa(msg) ? 'WhatsAppでリンクを送る' : 'メールでリンクを送る', href: wa(msg) || (b.email ? `mailto:${b.email}` : null), icon: '💬' });
        steps.push({ n: 3, label: '送り終えたら下のボタン', btn: { text: '💳 決済待ちにする', action: `changeBookingStatus(${b.id},'payment_sent')` } });
    } else if (b.status === 'payment_sent') {
        steps.push({ n: 1, label: 'Stripeで入金を確認する', href: 'https://dashboard.stripe.com/payments', icon: '💰' });
        steps.push({ n: 2, label: '入金が確認できたら下のボタン', btn: { text: '🎉 確定にする', action: `changeBookingStatus(${b.id},'confirmed')` }, note: '押すと確定メール(カレンダー・受取場所つき)が自動で届きます' });
    } else if (b.status === 'confirmed' && pdDiff === 1) {
        const msg = `Hi ${first}! Tomorrow is the day! 🎉 Here is how to unlock the van:`;
        steps.push({ n: 1, label: 'WhatsAppで鍵の開け方を送る(写真つき)', href: wa(msg), icon: '🔑' });
        steps.push({ n: 2, label: 'これで準備完了', note: 'この項目は明日の朝に自動で消えます' });
    } else if (b.status === 'confirmed' && pdDiff === 0) {
        steps.push({ n: 1, label: '受け渡し準備(清掃・満タン・寝具・ETCカード)', note: '' });
        steps.push({ n: 2, label: 'お客様が出発したら下のボタン', btn: { text: '🚐 利用中にする', action: `changeBookingStatus(${b.id},'active')` } });
    } else if (b.status === 'active' && rdDiff !== null && rdDiff <= 0) {
        steps.push({ n: 1, label: '車両チェック(傷・忘れ物・ETC利用額)', note: '' });
        steps.push({ n: 2, label: '返却が済んだら下のボタン', btn: { text: '✨ 完了にする', action: `changeBookingStatus(${b.id},'completed')` }, note: '翌日、お客様へお礼とレビューのお願いが自動で届きます' });
    }

    if (!steps.length) return '';
    const rows = steps.map(st => `
        <div class="gstep">
            <span class="gnum">${st.n}</span>
            <div class="gmain">
                ${st.href ? `<a class="btn btn-primary gbtn" href="${st.href}" target="_blank" rel="noopener">${st.icon || ''} ${st.label}</a>`
                  : st.btn ? `<div class="glabel">${st.label}</div><button class="btn btn-primary gbtn" onclick="${st.btn.action}">${st.btn.text}</button>`
                  : `<div class="glabel">${st.label}</div>`}
                ${st.note ? `<div class="gnote">${st.note}</div>` : ''}
            </div>
        </div>`).join('');
    return `
        <div class="guide">
            <div class="guide-title">👉 次にやること（上から順に押すだけ）</div>
            ${rows}
        </div>`;
}

// ライトテーマ用の濃色（badge文字色。背景は色+'20'の淡色で自動生成される）
const STATUS_LABELS = {
    form_submitted: { label: '📩 新規', color: '#3E7BB6' },
    docs_requested: { label: '📋 書類待ち', color: '#C08A2D' },
    docs_received:  { label: '✅ 書類受領', color: '#2F7D4F' },
    payment_sent:   { label: '💳 決済待ち', color: '#A8762D' },
    confirmed:      { label: '🎉 確定', color: '#8A67AB' },
    active:         { label: '🚐 利用中', color: '#2E7FA3' },
    completed:      { label: '✨ 完了', color: '#5A8A6A' },
    cancelled:      { label: '❌ キャンセル', color: '#C25353' },
};

const STATUS_FLOW = [
    'form_submitted', 'docs_requested', 'docs_received',
    'payment_sent', 'confirmed', 'active', 'completed',
];

const DOC_LABELS = {
    license_front: '運転免許証（表）',
    license_back: '運転免許証（裏）',
    international_license: '国際免許証',
    translation: '翻訳文',
    passport: 'パスポート',
    d2_license_front: '追加ドライバー・免許証（表）',
    d2_license_back: '追加ドライバー・免許証（裏）',
    d2_international_license: '追加ドライバー・国際免許証',
    d2_translation: '追加ドライバー・翻訳文',
    d2_passport: '追加ドライバー・パスポート',
};

let currentBookingFilter = 'all';

window.gotoBookings = function() { switchPage('bookings'); };

function initBookings() {
    $$('.stat-tile').forEach(tile => {
        tile.addEventListener('click', () => {
            $$('.stat-tile').forEach(t => t.classList.remove('active'));
            tile.classList.add('active');
            currentBookingFilter = tile.dataset.filter;
            renderBookings(_allBookings);
        });
    });
}

let _allBookings = [];
async function loadBookings() {
    try {
        _allBookings = await api('/api/booking');
        renderBookings(_allBookings);
    } catch (e) {
        console.error('Bookings load error:', e);
    }
}

// その予約の「次のアクション」(受信箱の右側に出す一言)
function nextActionOf(b) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dd = (d) => { const x = new Date(d); if (isNaN(x)) return null; x.setHours(0,0,0,0); return Math.round((x - today) / 86400000); };
    const pd = dd(b.pickup_datetime), rd = dd(b.return_datetime);
    if (b.status === 'payment_sent') return { t: '💰 入金を確認する', urgent: true };
    if (b.status === 'docs_received') return { t: '💳 決済リンクを送る', urgent: true };
    if (b.status === 'form_submitted') return { t: '📩 返事をする', urgent: true };
    if (b.status === 'confirmed' && pd === 1) return { t: '🔑 鍵の案内を送る', urgent: true };
    if (b.status === 'confirmed' && pd === 0) return { t: '🚐 今日出発！', urgent: true };
    if ((b.status === 'active') && rd !== null && rd <= 0) return { t: '🧹 返却対応をする', urgent: true };
    if (b.status === 'docs_requested') return { t: '📋 お客様の記入待ち', urgent: false };
    if (b.status === 'confirmed') return { t: '🎉 出発待ち', urgent: false };
    if (b.status === 'active') return { t: '🚐 旅行中', urgent: false };
    if (b.status === 'completed') return { t: '✨ 終了', urgent: false, done: true };
    if (b.status === 'cancelled') return { t: '❌ キャンセル', urgent: false, done: true };
    return { t: b.status, urgent: false };
}

function renderBookings(list) {
    const box = $('#bookingsBody');
    const empty = $('#bookingsEmpty');
    const VEH = { 'MAZDA BONGO': 'BONGO', 'TOYOTA PROBOX': 'PROBOX', 'DAIHATSU POCKET LOFT': 'LOFT' };
    const DAY = ['日','月','火','水','木','金','土'];
    const fdate = (d) => { const x = new Date(d); return isNaN(x) ? '-' : `${x.getMonth()+1}/${x.getDate()}(${DAY[x.getDay()]})`; };

    const items = list.map(b => ({ b, act: nextActionOf(b), meta: parseBookingMeta(b.notes) }));
    const urgent = items.filter(i => i.act.urgent);
    const upcoming = items.filter(i => !i.act.urgent && !i.act.done)
        .sort((a, z) => new Date(a.b.pickup_datetime) - new Date(z.b.pickup_datetime));
    const done = items.filter(i => i.act.done);

    // タイルの数字
    $('#tileAtt').textContent = urgent.length;
    $('#tileUp').textContent = upcoming.length;
    $('#tileAll').textContent = items.length;
    $('#tileAttBtn').classList.toggle('has-work', urgent.length > 0);

    let groups;
    if (currentBookingFilter === 'attention') groups = [['⚠️ やること', urgent]];
    else if (currentBookingFilter === 'upcoming') groups = [['🚐 出発待ち（日付順）', upcoming]];
    else groups = [['⚠️ やること', urgent], ['🚐 出発待ち（日付順）', upcoming], ['✔️ 終了・キャンセル', done]];

    const row = (i) => {
        const b = i.b, act = i.act;
        let nights = '';
        const pdt = new Date(b.pickup_datetime), rdt = new Date(b.return_datetime);
        if (!isNaN(pdt) && !isNaN(rdt)) { const n = Math.round((rdt - pdt) / 86400000); if (n > 0) nights = `・${n}泊`; }
        const flag = i.meta.country ? countryFlag(i.meta.country).split(' ')[0] : '';
        return `
        <div class="lrow ${act.urgent ? 'urgent' : ''}" onclick="openBookingDetail(${b.id})">
            <div class="lrow-l">
                <span class="lrow-name">${flag} ${b.full_name}</span>
                <span class="lrow-meta">${VEH[b.vehicle_type] || b.vehicle_type || ''} · ${fdate(b.pickup_datetime)} → ${fdate(b.return_datetime)}${nights}</span>
            </div>
            <span class="lrow-act ${act.urgent ? 'do' : 'wait'}">${act.t}${act.urgent ? ' <i class="fas fa-chevron-right"></i>' : ''}</span>
        </div>`;
    };

    const html = groups.filter(([, arr]) => arr.length > 0).map(([title, arr]) => `
        <div class="inbox-head">${title} <span class="inbox-count">${arr.length}</span></div>
        ${arr.map(row).join('')}
    `).join('');

    if (!html) {
        box.innerHTML = currentBookingFilter === 'attention'
            ? '<p class="todo-done">✅ やることはぜんぶ終わっています。おつかれさまです！</p>' : '';
        empty.style.display = currentBookingFilter === 'all' ? 'block' : 'none';
        return;
    }
    empty.style.display = 'none';
    box.innerHTML = html;
}

window.openBookingDetail = async function(id) {
    try {
        const b = await api(`/api/booking?id=${id}`);
        const st = STATUS_LABELS[b.status] || { label: b.status, color: '#888' };
        const docs = b.documents || [];

        const currentIdx = STATUS_FLOW.indexOf(b.status);
        const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1
            ? STATUS_FLOW[currentIdx + 1] : null;

        let docsHtml = docs.length === 0
            ? '<p style="color:var(--text-muted)">まだ書類がアップロードされていません</p>'
            : docs.map(d => `
                <div class="doc-row">
                    <span>${DOC_LABELS[d.doc_type] || d.doc_type}</span>
                    <span style="margin-left:auto;font-size:0.8rem;color:var(--text-muted)">${d.original_filename || ''}</span>
                    ${d.verified
                        ? '<span style="color:#34d399"><i class="fas fa-check-circle"></i> 確認済</span>'
                        : `<button class="btn btn-sm btn-primary" onclick="verifyDoc(${d.id}, ${id})"><i class="fas fa-check"></i> 確認</button>`
                    }
                    <a href="/api/documents?id=${d.id}" target="_blank" class="btn btn-sm btn-secondary"><i class="fas fa-eye"></i></a>
                </div>
            `).join('');

        const meta = parseBookingMeta(b.notes);
        const originVal = [langLabel(meta.lang), countryFlag(meta.country)].filter(Boolean).join(' · ') || '-';
        const priceEst = estimateTotal(b.vehicle_type, b.pickup_datetime, b.return_datetime);
        const priceVal = b.estimated_total
            ? fmtYen(b.estimated_total) + (b.discount_info ? ` (${b.discount_info})` : '')
            : (priceEst ? `${fmtYen(priceEst.total)}${priceEst.label ? ` (${priceEst.label})` : ''} <small style="color:var(--text-muted)">概算</small>` : '-');

        const vehShort = { 'MAZDA BONGO': ['BONGO', 'veh-bongo'], 'TOYOTA PROBOX': ['PROBOX', 'veh-probox'], 'DAIHATSU POCKET LOFT': ['LOFT', 'veh-loft'] }[b.vehicle_type] || [b.vehicle_type || '-', 'veh-other'];
        let nightsStr = '';
        { const pd = new Date(b.pickup_datetime), rd = new Date(b.return_datetime);
          if (!isNaN(pd) && !isNaN(rd)) { const n = Math.round((rd - pd) / 86400000); if (n > 0) nightsStr = `・${n}泊`; } }
        const IDP_LABELS = { idp_1949: '国際免許(1949)', jdltc_translation: '翻訳文(持参)', jdltc_order: '🎫 JDLTC注文希望', unsure: '未定（要案内）' };
        const guideHtml = buildGuide(b, meta);
        const body = `
            ${guideHtml}
            <div class="dsec">
                <div class="dsec-title">👤 お客様</div>
                <div class="dgrid">
                    <div><span class="dt">名前</span><span class="dd"><strong>${b.full_name}</strong></span></div>
                    <div><span class="dt">言語 / 国</span><span class="dd">${originVal}</span></div>
                    <div><span class="dt">メール</span><span class="dd">${b.email ? `<a href="mailto:${b.email}" style="color:var(--accent-blue)">${b.email}</a>` : '-'}</span></div>
                    <div><span class="dt">電話</span><span class="dd">${b.phone || '-'}</span></div>
                    <div><span class="dt">紹介元</span><span class="dd">${b.referral_source || '-'}</span></div>
                    <div><span class="dt">翻訳文</span><span class="dd">${b.translation_needed ? '📝 必要' : '不要'}</span></div>
                </div>
            </div>
            <div class="dsec">
                <div class="dsec-title">🚐 旅程・金額</div>
                <div class="dtrip">
                    <span class="veh-chip ${vehShort[1]}">${vehShort[0]}</span>
                    <span class="dtrip-dates">${formatDate(b.pickup_datetime)} → ${formatDate(b.return_datetime)}${nightsStr}</span>
                    <span class="dtrip-price">${priceVal}</span>
                </div>
                <div class="dgrid" style="margin-top:10px;">
                    <div><span class="dt">ピックアップ</span><span class="dd">${(b.pickup_datetime || '-').replace('T', ' ')}</span></div>
                    <div><span class="dt">返却</span><span class="dd">${(b.return_datetime || '-').replace('T', ' ')}</span></div>
                    <div><span class="dt">ドライバー数</span><span class="dd">${b.num_drivers || 1}名</span></div>
                    <div><span class="dt">住所</span><span class="dd">${b.address || '-'}</span></div>
                </div>
            </div>
            <div class="dsec">
                <div class="dsec-title">🔄 ステータス</div>
                <div class="dstatus">
                    <span class="status-badge" style="background:${st.color}20;color:${st.color};border:1px solid ${st.color}40;font-size:0.95rem;padding:8px 16px;">${st.label}</span>
                    ${nextStatus ? `<button class="btn btn-primary" onclick="changeBookingStatus(${b.id},'${nextStatus}')">
                        <i class="fas fa-arrow-right"></i> ${STATUS_LABELS[nextStatus].label} に進める
                    </button>` : ''}
                    ${b.status !== 'cancelled' ? `<button class="btn btn-ghost-danger" onclick="changeBookingStatus(${b.id},'cancelled')">キャンセルにする</button>` : ''}
                </div>
                ${b.status === 'docs_received' ? '<p class="dhint">💡 書類を確認したら「決済待ちに進める」→ Stripeリンクを送ってください。</p>' : ''}
                ${b.status === 'payment_sent' ? '<p class="dhint">💡 入金を確認したら「確定に進める」→ 確定メール（カレンダー付き・5言語）が自動送信されます。</p>' : ''}
            </div>
            <div class="dsec">
                <div class="dsec-title">📋 お客様手続きページ（免許証アップ＋必要事項）</div>
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <button class="btn btn-primary" onclick="copyCompleteLink('${(b.complete_url || '').replace(/'/g, '')}')">
                        <i class="fas fa-copy"></i> 手続きリンクをコピー
                    </button>
                    ${meta.details ? '<span style="color:#34d399;font-weight:600;"><i class="fas fa-check-circle"></i> お客様記入済み</span>' : '<span style="color:var(--text-muted);font-size:0.85rem;">未記入（コピーしてWhatsAppに貼ってください）</span>'}
                </div>
                ${meta.details ? `
                <div class="dgrid" style="margin-top:12px;">
                    <div><span class="dt">免許発行国</span><span class="dd">${meta.details.license_country || '-'}</span></div>
                    <div><span class="dt">運転書類</span><span class="dd">${IDP_LABELS[meta.details.idp_type] || meta.details.idp_type || '-'}</span></div>
                    <div><span class="dt">到着便 / 時刻</span><span class="dd">${meta.details.flight_number || '-'} ${meta.details.arrival_time ? '/ ' + meta.details.arrival_time : ''}</span></div>
                    <div><span class="dt">追加ドライバー</span><span class="dd">${meta.details.has_additional_driver === 'yes' ? `${meta.details.additional_driver || '-'}（${meta.details.additional_driver_country || '国不明'}${meta.details.d2_jdltc_order === 'yes' ? '・🎫JDLTC注文' : ''}）` : (meta.details.additional_driver || 'なし')}</span></div>
                    <div><span class="dt">緊急連絡先</span><span class="dd">${meta.details.emergency_name || '-'} ${meta.details.emergency_phone || ''}</span></div>
                    <div><span class="dt">要望</span><span class="dd">${meta.details.special_requests || '-'}</span></div>
                </div>` : ''}
            </div>
            <div class="dsec">
                <div class="dsec-title">📄 書類</div>
                ${docsHtml}
            </div>
            <div class="dfooter">
                <button class="btn-text-danger" onclick="deleteBooking(${b.id})"><i class="fas fa-trash"></i> この予約を完全に削除</button>
            </div>
        `;

        _openBookingName = b.full_name || '';
        $('#bookingModalTitle').textContent = `予約 #${b.id} — ${b.full_name}`;
        $('#bookingModalBody').innerHTML = body;
        $('#bookingModal').classList.add('active');
    } catch (e) { /* shown by api() */ }
};

window.changeBookingStatus = async function(id, newStatus) {
    const st = STATUS_LABELS[newStatus];
    if (!confirm(`ステータスを「${st.label}」に変更しますか？`)) return;
    try {
        await api(`/api/booking?id=${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
        });
        showToast(`ステータスを「${st.label}」に変更しました`);
        openBookingDetail(id);
        loadBookings();
    } catch (e) { /* shown by api() */ }
};

window.copyCompleteLink = async function(url) {
    if (!url) { showToast('リンクを取得できませんでした', 'error'); return; }
    try {
        await navigator.clipboard.writeText(url);
        showToast('手続きリンクをコピーしました。WhatsAppに貼り付けて送ってください', 'success');
    } catch {
        prompt('コピーできない場合は手動でコピーしてください:', url);
    }
};

let _openBookingName = '';
window.deleteBooking = async function(id) {
    const name = _openBookingName || '';
    if (!confirm(`予約 #${id}（${name}）を完全に削除します。\n関連書類も一緒に削除され、この操作は取り消せません。\n\n本当に削除しますか？`)) return;
    try {
        await api(`/api/booking?id=${id}`, { method: 'DELETE' });
        showToast(`予約 #${id} を削除しました`);
        closeModal('bookingModal');
        loadBookings();
    } catch (e) { /* shown by api() */ }
};

window.verifyDoc = async function(docId, bookingId) {
    try {
        await api(`/api/documents?id=${docId}`, { method: 'PUT' });
        showToast('書類を確認済みにしました');
        openBookingDetail(bookingId);
    } catch (e) { /* shown by api() */ }
};

// --- Date display ---
function updateDate() {
    const now = new Date();
    $('#currentDate').textContent = now.toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    updateDate();
    initNav();
    initBookings();
    initCRM();
    loadBookings();
});

// --- Manual Booking (WhatsApp / Offline) ---
window.openCreateBookingModal = function() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    
    $('#createBookingForm').reset();
    $('#createBookingForm').elements['pickup_datetime'].value = `${tomorrowStr}T10:00`;
    $('#createBookingForm').elements['return_datetime'].value = `${tomorrowStr}T18:00`;
    
    $('#createBookingModal').classList.add('active');
};

window.submitManualBooking = async function(event) {
    event.preventDefault();
    const form = event.target;
    const data = {
        vehicle_type: form.elements['vehicle_type'].value,
        pickup_datetime: form.elements['pickup_datetime'].value.replace('T', ' ') + ':00',
        return_datetime: form.elements['return_datetime'].value.replace('T', ' ') + ':00',
        full_name: form.elements['full_name'].value,
        email: form.elements['email'].value,
        phone: form.elements['phone'].value || null,
        num_drivers: parseInt(form.elements['num_drivers'].value, 10) || 1,
        status: form.elements['status'].value,
        camping_gear_notes: form.elements['camping_gear_notes'].value || null,
        translation_needed: false,
        referral_source: 'WhatsApp/Manual',
        lang: form.elements['lang'].value || 'en',
        agreed_total: form.elements['agreed_total'].value ? parseInt(form.elements['agreed_total'].value, 10) : null
    };

    try {
        const res = await api('/api/booking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.status === 'ok') {
            showToast('登録完了。お客様へ控えメール(手続きリンク付き)を送信しました');
            $('#createBookingModal').classList.remove('active');
            loadBookings();
        loadBookings();
            // 手続きリンクをすぐコピーできるよう、作成した予約の詳細を開く
            if (res.booking_id) openBookingDetail(res.booking_id);
        }
    } catch (e) {
        // shown by api() toast
    }
};

// ============================================================
// CRM & Drip Campaign Management
// ============================================================

let allSubscribers = [];
let allTemplates = [];
let currentStepId = 1;
let currentLanguageId = 'en';

window.initCRM = function() {
    // Setup tab switching
    const tabs = $$('#crmTabs .status-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const targetTab = tab.dataset.tab;
            $$('.crm-tab-content').forEach(c => c.style.display = 'none');
            $(`#crm-tab-${targetTab}`).style.display = 'block';
        });
    });

    // Setup language selector in editor
    const langSelect = $('#editorLanguageSelect');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            currentLanguageId = e.target.value;
            loadStepTemplate(currentStepId, currentLanguageId);
        });
    }
};

window.loadCRM = async function() {
    try {
        const data = await api('/api/admin/drip-campaign');
        allSubscribers = data.subscribers || [];
        allTemplates = data.templates || [];
        
        renderSubscribers();
        renderStepMenu();
        loadStepTemplate(currentStepId, currentLanguageId);
    } catch (e) {
        console.error('CRM load error:', e);
    }
};

function renderSubscribers() {
    const tbody = $('#subscribersBody');
    const empty = $('#subscribersEmpty');

    if (allSubscribers.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = allSubscribers.map(s => {
        // Step labels
        let stepText = '';
        if (s.current_step === -1) {
            stepText = '<span class="status-badge" style="background:#fee2e2; color:#ef4444;"><i class="fas fa-times-circle"></i> 配信解除</span>';
        } else if (s.current_step === 5) {
            stepText = '<span class="status-badge" style="background:#d1fae5; color:#10b981;"><i class="fas fa-check-circle"></i> 送信完了 (5/5)</span>';
        } else {
            stepText = `<span class="status-badge" style="background:var(--accent-blue-glow); color:var(--accent-blue);"><i class="fas fa-paper-plane"></i> ステップ ${s.current_step}/5</span>`;
        }

        // Survey labels
        const surveyLabels = {
            kyushu: '🌲 九州ロードトリップ',
            tokyo_kyoto: '🗼 東京・京都',
            others: '✈️ その他'
        };
        const surveyText = surveyLabels[s.survey] || s.survey || '未設定';

        // Action buttons
        let actionsHtml = '';
        if (s.current_step >= 0 && s.current_step < 5) {
            actionsHtml += `
                <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem; background:rgba(239,68,68,0.1); border-color:rgba(239,68,68,0.2); color:#ef4444;" onclick="optOutSubscriber(${s.id})">
                    <i class="fas fa-ban"></i> 配信停止
                </button>
            `;
        } else if (s.current_step === -1) {
            actionsHtml += `
                <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem; background:rgba(52,211,153,0.1); border-color:rgba(52,211,153,0.2); color:#34d399;" onclick="optInSubscriber(${s.id})">
                    <i class="fas fa-redo"></i> 配信再開
                </button>
            `;
        }
        actionsHtml += `
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem; background:rgba(239,68,68,0.05); border-color:transparent; color:var(--text-muted);" onclick="deleteSubscriber(${s.id})">
                <i class="fas fa-trash-alt"></i> 削除
            </button>
        `;

        return `
        <tr>
            <td>
                <strong>${s.name || 'Anonymous'}</strong>
                <br><small style="color:var(--text-muted)">${s.email}</small>
            </td>
            <td><span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-primary); font-size:0.75rem;">🌐 ${s.language.toUpperCase()}</span></td>
            <td><small>${surveyText}</small></td>
            <td>${stepText}</td>
            <td><small>${s.next_send_date || '-'}</small></td>
            <td><small style="color:var(--text-muted)">${formatDate(s.subscribed_at)}</small></td>
            <td>
                <div style="display:flex; gap:6px;">
                    ${actionsHtml}
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

const STEP_TITLES = {
    1: '1通目: ガイド送付・挨拶',
    2: '2通目: キャンバン vs 電車',
    3: '3通目: 日本での運転・割引',
    4: '4通目: 九州の極秘情報',
    5: '5通目: 残数警告・日程確保'
};

function renderStepMenu() {
    const listEl = $('#templateStepList');
    if (!listEl) return;

    listEl.innerHTML = [1, 2, 3, 4, 5].map(step => {
        const activeClass = step === currentStepId ? 'active' : '';
        return `
            <li class="step-menu-item ${activeClass}" onclick="selectStep(${step})">
                <span>${STEP_TITLES[step]}</span>
                <i class="fas fa-chevron-right" style="font-size:0.75rem; opacity:0.5;"></i>
            </li>
        `;
    }).join('');
}

window.selectStep = function(step) {
    currentStepId = step;
    renderStepMenu();
    loadStepTemplate(currentStepId, currentLanguageId);
};

function loadStepTemplate(step, lang) {
    $('#editStep').value = step;
    
    // Find template
    const template = allTemplates.find(t => t.step === step && t.language === lang);
    const titleEl = $('#editorTitle');
    if (titleEl) {
        titleEl.innerHTML = `<i class="fas fa-edit"></i> ${STEP_TITLES[step]} (${lang.toUpperCase()})`;
    }

    if (template) {
        $('#editSubject').value = template.subject;
        $('#editBody').value = template.body_html;
        $('#editDelayDays').value = template.delay_days;
    } else {
        // Form resets for new combinations
        $('#editSubject').value = '';
        $('#editBody').value = '';
        $('#editDelayDays').value = 3;
        showToast(`${lang.toUpperCase()}のテンプレートがまだ設定されていません。`, 'info');
    }
}

window.saveTemplate = async function(event) {
    event.preventDefault();
    const data = {
        action: 'save_template',
        step: parseInt($('#editStep').value, 10),
        language: $('#editorLanguageSelect').value,
        subject: $('#editSubject').value,
        body_html: $('#editBody').value,
        delay_days: parseInt($('#editDelayDays').value, 10)
    };

    try {
        const res = await api('/api/admin/drip-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            showToast('テンプレートを保存しました');
            loadCRM(); // Reload data
        }
    } catch (e) {
        console.error('Template save error:', e);
    }
};

window.triggerSendTestModal = function() {
    $('#testEmailForm').reset();
    $('#testEmailModal').classList.add('active');
};

window.submitSendTestEmail = async function(event) {
    event.preventDefault();
    const testEmail = $('#testTargetEmail').value;
    const data = {
        action: 'send_test',
        step: parseInt($('#editStep').value, 10),
        language: $('#editorLanguageSelect').value,
        test_email: testEmail
    };

    try {
        const res = await api('/api/admin/drip-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            showToast('テストメールを送信しました！メールボックスをご確認ください。');
            $('#testEmailModal').classList.remove('active');
        }
    } catch (e) {
        console.error('Send test error:', e);
    }
};

window.optOutSubscriber = async function(id) {
    if (!confirm('この読者への自動ステップメール配信を停止しますか？')) return;
    try {
        const res = await api('/api/admin/drip-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'unsubscribe', id })
        });
        if (res.ok) {
            showToast('配信を停止しました');
            loadCRM();
        }
    } catch (e) {
        console.error('Unsubscribe error:', e);
    }
};

window.optInSubscriber = async function(id) {
    if (!confirm('この読者の配信をステップ1から再開しますか？')) return;
    try {
        const res = await api('/api/admin/drip-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'resubscribe', id })
        });
        if (res.ok) {
            showToast('ステップ1（アクティブ）として配信を再開しました');
            loadCRM();
        }
    } catch (e) {
        console.error('Resubscribe error:', e);
    }
};

window.deleteSubscriber = async function(id) {
    if (!confirm('この読者をデータベースから完全に削除しますか？この操作は取り消せません。')) return;
    try {
        const res = await api('/api/admin/drip-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_subscriber', id })
        });
        if (res.ok) {
            showToast('読者データを削除しました');
            loadCRM();
        }
    } catch (e) {
        console.error('Delete subscriber error:', e);
    }
};
