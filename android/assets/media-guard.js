'use strict';
/* التلاوة لا تبدأ إلا بطلب من داخل التطبيق: يُمنع أي تشغيل تلقائي يأتي من سماعة أو سيارة أو بلوتوث أو شاشة القفل
   لعناصر الصوت داخل الواجهة (WebView)، حتى لو كان التطبيق في الخلفية. */
(function () {
  const proto = HTMLMediaElement.prototype, nativePlay = proto.play;
  proto.play = function () { this.__mushafiPlayAt = Date.now(); return nativePlay.apply(this, arguments) };
  document.addEventListener('play', e => {
    const el = e.target;
    if (!(el instanceof HTMLMediaElement)) return;
    if (!el.__mushafiPlayAt || Date.now() - el.__mushafiPlayAt > 2000) { try { el.pause() } catch (x) {} }
  }, true);
  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {});
      navigator.mediaSession.setActionHandler('pause', () => { document.querySelectorAll('audio,video').forEach(m => { try { m.pause() } catch (x) {} }); try { window.pauseAudio?.() } catch (x) {} try { window.pauseInlineVerse?.() } catch (x) {} });
    }
  } catch (e) {}
})();
