(function () {
    'use strict';

    function loadVideo(button) {
        var shell = button.closest('.camjyo-video');
        if (!shell) return;

        var videoId = shell.getAttribute('data-video-id') || '';
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;

        var iframe = document.createElement('iframe');
        iframe.src = 'https://www.youtube-nocookie.com/embed/' + videoId + '?autoplay=1&rel=0';
        iframe.title = shell.getAttribute('data-video-title') || 'CAMJYO BAND video';
        iframe.loading = 'lazy';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.allowFullscreen = true;

        shell.replaceChildren(iframe);
        iframe.focus();

        if (typeof window.gtag === 'function') {
            window.gtag('event', 'camjyo_video_play', {
                video_id: videoId,
                video_title: 'Camp Party',
                page_path: window.location.pathname
            });
        }
    }

    document.addEventListener('click', function (event) {
        var button = event.target.closest('.camjyo-video__poster');
        if (button) loadVideo(button);
    });
})();
