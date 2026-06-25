/**
 * VanTripJapan — Social Proof Tracker
 * Tracks anonymous active viewers and queries recent bookings.
 */

(function() {
    function getSessionId() {
        let id = sessionStorage.getItem('vtj_session_id');
        if (!id) {
            id = 'vtj_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            sessionStorage.setItem('vtj_session_id', id);
        }
        return id;
    }

    async function sendPing(vehicle, page) {
        const sessionId = getSessionId();
        try {
            await fetch('/api/social-proof', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vehicle, page, session_id: sessionId })
            });
        } catch (e) {
            console.warn('[Social Proof Ping Failed]', e);
        }
    }

    async function fetchStats(vehicle) {
        try {
            const res = await fetch('/api/social-proof?vehicle=' + encodeURIComponent(vehicle));
            if (res.ok) {
                return await res.json();
            }
        } catch (e) {
            console.warn('[Social Proof Stats Failed]', e);
        }
        return null;
    }

    function renderSocialProof(containerEl, stats) {
        if (!containerEl || !stats) return;
        
        containerEl.innerHTML = '';
        containerEl.style.display = 'none';

        const dict = (typeof translations !== 'undefined' && typeof currentLang !== 'undefined')
            ? (translations[currentLang] || translations.en)
            : {};

        const viewers = stats.active_viewers || 0;
        const bookings = stats.recent_bookings || 0;
        
        const elements = [];

        // Apply dynamic social proof only when thresholds are met (2+ viewers, 1+ bookings)
        if (viewers >= 2) {
            const template = dict['social.viewers_label'] || '👀 {n} travelers are looking at this van right now';
            const text = template.replace('{n}', viewers);
            elements.push(`<div class="sp-stat sp-stat--viewers" style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: #BF4E30;"><span class="sp-icon">👀</span> <span>${text}</span></div>`);
        }

        if (bookings >= 1) {
            const template = dict['social.bookings_label'] || '📝 {n} booking requests received in the last 7 days!';
            const text = template.replace('{n}', bookings);
            elements.push(`<div class="sp-stat sp-stat--bookings" style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: #2D5A3D;"><span class="sp-icon">⚡</span> <span>${text}</span></div>`);
        }

        if (elements.length > 0) {
            containerEl.innerHTML = elements.join('<div style="margin: 6px 0; border-top: 1px dashed rgba(0,0,0,0.06); padding-top: 6px;"></div>');
            containerEl.style.display = 'block';
            containerEl.style.background = 'rgba(250, 246, 240, 0.9)';
            containerEl.style.border = '1px dashed var(--rent-border, #E8DFD1)';
            containerEl.style.borderRadius = '12px';
            containerEl.style.padding = '12px 16px';
            containerEl.style.fontSize = '13.5px';
            containerEl.style.marginTop = '12px';
            containerEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)';
        }
    }

    // Expose globally
    window.VTJSocialProof = {
        init: async function(vehicle, page, containerSelector) {
            if (!vehicle) return;
            
            // 1) Send active view ping
            await sendPing(vehicle, page);

            // 2) Fetch and render stats if container is provided
            if (containerSelector) {
                const container = document.querySelector(containerSelector);
                if (container) {
                    const stats = await fetchStats(vehicle);
                    renderSocialProof(container, stats);
                }
            }
        },
        refresh: async function(vehicle, containerSelector) {
            if (!vehicle || !containerSelector) return;
            const container = document.querySelector(containerSelector);
            if (container) {
                const stats = await fetchStats(vehicle);
                renderSocialProof(container, stats);
            }
        }
    };
})();
