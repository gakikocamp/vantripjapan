/* ============================================================
   VanTripJapan Admin — Booking Management (Cloudflare)
   ============================================================ */

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

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
    $$('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            switchPage(page);
        });
    });

    $('#mobileToggle').addEventListener('click', () => {
        $('#sidebar').classList.toggle('open');
    });
    $('#mainContent').addEventListener('click', () => {
        $('#sidebar').classList.remove('open');
    });
}

function switchPage(pageName) {
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    $(`.nav-item[data-page="${pageName}"]`)?.classList.add('active');

    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${pageName}`)?.classList.add('active');

    const titles = {
        dashboard: 'ダッシュボード',
        bookings: '予約管理',
        crm: 'メルマガ・CRM',
    };
    $('#pageTitle').textContent = titles[pageName] || pageName;

    if (pageName === 'dashboard') loadDashboard();
    if (pageName === 'bookings') loadBookings();
    if (pageName === 'crm') loadCRM();

    $('#sidebar').classList.remove('open');
}

// --- Dashboard ---
async function loadDashboard() {
    try {
        const data = await api('/api/admin-dashboard');
        $('#statBookings').textContent = data.total_bookings || 0;
        $('#statDocs').textContent = data.total_docs || 0;
        $('#statUnverified').textContent = data.unverified_docs || 0;

        // Status breakdown
        const byStatus = data.bookings_by_status || {};
        const statusEl = $('#statusBreakdown');
        const statusLabels = {
            form_submitted: '📩 新規',
            docs_requested: '📋 書類待ち',
            docs_received: '✅ 書類受領',
            payment_sent: '💳 決済待ち',
            confirmed: '🎉 確定',
            active: '🚐 利用中',
            completed: '✨ 完了',
            cancelled: '❌ キャンセル',
        };
        statusEl.innerHTML = Object.entries(statusLabels)
            .filter(([k]) => byStatus[k])
            .map(([k, label]) => `
                <div class="country-rank-item">
                    <span class="country-rank-name">${label}</span>
                    <span class="country-rank-count">${byStatus[k]}件</span>
                </div>
            `).join('') || '<p class="empty-state">まだ予約データがありません</p>';

        // Recent bookings
        const recent = data.recent_bookings || [];
        const rrEl = $('#recentBookings');
        if (recent.length > 0) {
            rrEl.innerHTML = recent.map(r => `
                <div class="rental-item" style="cursor:pointer" onclick="switchPage('bookings')">
                    <div class="rental-info">
                        <span class="rental-customer">${r.full_name}</span>
                        <span class="rental-dates">${r.vehicle_type || '-'} • ${formatDate(r.pickup_datetime)}</span>
                    </div>
                    <span class="status-badge" style="font-size:0.75rem">${statusLabels[r.status] || r.status}</span>
                </div>
            `).join('');
        } else {
            rrEl.innerHTML = '<p class="empty-state">まだ予約データがありません</p>';
        }
    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}

// ============================================================
// Bookings Management
// ============================================================

const STATUS_LABELS = {
    form_submitted: { label: '📩 新規', color: '#4f8cff' },
    docs_requested: { label: '📋 書類待ち', color: '#fb923c' },
    docs_received:  { label: '✅ 書類受領', color: '#34d399' },
    payment_sent:   { label: '💳 決済待ち', color: '#fbbf24' },
    confirmed:      { label: '🎉 確定', color: '#a78bfa' },
    active:         { label: '🚐 利用中', color: '#38bdf8' },
    completed:      { label: '✨ 完了', color: '#6ee7b7' },
    cancelled:      { label: '❌ キャンセル', color: '#f87171' },
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
};

let currentBookingFilter = 'all';

function initBookings() {
    const tabs = $$('#statusTabs .status-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentBookingFilter = tab.dataset.status;
            loadBookings();
        });
    });
}

async function loadBookings() {
    try {
        const status = currentBookingFilter === 'all' ? null : currentBookingFilter;
        const url = status ? `/api/booking?status=${status}` : '/api/booking';
        const bookings = await api(url);
        renderBookings(bookings);
    } catch (e) {
        console.error('Bookings load error:', e);
    }
}

function renderBookings(list) {
    const tbody = $('#bookingsBody');
    const empty = $('#bookingsEmpty');

    if (list.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = list.map(b => {
        const st = STATUS_LABELS[b.status] || { label: b.status, color: '#888' };
        return `
        <tr>
            <td>
                <strong>${b.full_name}</strong>
                <br><small style="color:var(--text-muted)">${b.email || ''}</small>
            </td>
            <td>${b.vehicle_type || '-'}</td>
            <td>${formatDate(b.pickup_datetime)}</td>
            <td>${formatDate(b.return_datetime)}</td>
            <td><span class="status-badge" style="background:${st.color}20;color:${st.color};border:1px solid ${st.color}40">${st.label}</span></td>
            <td>${b.translation_needed ? '📝 翻訳あり' : '-'}</td>
            <td>
                <div class="action-btns">
                    <button class="btn btn-sm btn-secondary" onclick="openBookingDetail(${b.id})">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
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
                <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:6px;">
                    <span>${DOC_LABELS[d.doc_type] || d.doc_type}</span>
                    <span style="margin-left:auto;font-size:0.8rem;color:var(--text-muted)">${d.original_filename || ''}</span>
                    ${d.verified
                        ? '<span style="color:#34d399"><i class="fas fa-check-circle"></i> 確認済</span>'
                        : `<button class="btn btn-sm btn-primary" onclick="verifyDoc(${d.id}, ${id})"><i class="fas fa-check"></i> 確認</button>`
                    }
                    <a href="/api/documents?id=${d.id}" target="_blank" class="btn btn-sm btn-secondary"><i class="fas fa-eye"></i></a>
                </div>
            `).join('');

        const body = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                <div><label style="color:var(--text-muted);font-size:0.8rem">名前</label><p><strong>${b.full_name}</strong></p></div>
                <div><label style="color:var(--text-muted);font-size:0.8rem">メール</label><p>${b.email || '-'}</p></div>
                <div><label style="color:var(--text-muted);font-size:0.8rem">電話</label><p>${b.phone || '-'}</p></div>
                <div><label style="color:var(--text-muted);font-size:0.8rem">住所</label><p>${b.address || '-'}</p></div>
                <div><label style="color:var(--text-muted);font-size:0.8rem">車種</label><p>${b.vehicle_type || '-'}</p></div>
                <div><label style="color:var(--text-muted);font-size:0.8rem">ドライバー数</label><p>${b.num_drivers}</p></div>
                <div><label style="color:var(--text-muted);font-size:0.8rem">ピックアップ</label><p>${b.pickup_datetime || '-'}</p></div>
                <div><label style="color:var(--text-muted);font-size:0.8rem">返却</label><p>${b.return_datetime || '-'}</p></div>
                <div><label style="color:var(--text-muted);font-size:0.8rem">紹介元</label><p>${b.referral_source || '-'}</p></div>
                <div><label style="color:var(--text-muted);font-size:0.8rem">翻訳</label><p>${b.translation_needed ? '✅ 必要' : '不要'}</p></div>
            </div>
            <div style="margin-bottom:20px;">
                <label style="color:var(--text-muted);font-size:0.8rem">ステータス</label>
                <div style="display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap;">
                    <span class="status-badge" style="background:${st.color}20;color:${st.color};border:1px solid ${st.color}40;font-size:1rem;padding:6px 14px;">${st.label}</span>
                    ${nextStatus ? `<button class="btn btn-primary" onclick="changeBookingStatus(${b.id},'${nextStatus}')">
                        <i class="fas fa-arrow-right"></i> ${STATUS_LABELS[nextStatus].label} に進める
                    </button>` : ''}
                    ${b.status !== 'cancelled' ? `<button class="btn btn-danger" onclick="changeBookingStatus(${b.id},'cancelled')">
                        <i class="fas fa-times"></i> キャンセル
                    </button>` : ''}
                </div>
            </div>
            <div>
                <label style="color:var(--text-muted);font-size:0.8rem;margin-bottom:8px;display:block;">📄 書類</label>
                ${docsHtml}
            </div>
        `;

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
    loadDashboard();
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
        referral_source: 'WhatsApp/Manual'
    };

    try {
        const res = await api('/api/booking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.status === 'ok') {
            showToast('新規予約を登録しました');
            $('#createBookingModal').classList.remove('active');
            loadBookings();
            loadDashboard();
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
