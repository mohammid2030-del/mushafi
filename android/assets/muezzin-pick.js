'use strict';
// Muezzin on the prayer-times page: who calls the adhan, changed in one tap.
const MUEZZIN_PHOTOS = { afasy: 'images/mishary-alafasy.png', nafees: 'images/ahmad-alnafees.png' };
function muezzinAvatar(voice, size = '') {
  if (voice === 'silent') return `<span class="mz-avatar mz-icon ${size}">${uiIcon('mute')}</span>`;
  const photo = MUEZZIN_PHOTOS[voice];
  return photo ? `<span class="mz-avatar ${size}"><img src="${photo}" alt="" loading="lazy"></span>` : `<span class="mz-avatar mz-icon ${size}">${uiIcon('mosque')}</span>`
}
function muezzinPickMarkup() {
  const voice = readPrayerData().settings?.voice || 'afasy';
  return `<button class="mz-pick" onclick="openMuezzinSheet()" aria-label="اختيار المؤذن">${muezzinAvatar(voice)}<span class="mz-text"><small>المؤذن</small><strong>${esc(prayerVoices[voice] || '')}</strong></span>${uiIcon('down')}</button>`
}
function openMuezzinSheet() {
  const current = readPrayerData().settings?.voice || 'afasy';
  const box = featureSheet('اختر المؤذن', 'muezzin');
  const canPreview = !!window.AndroidReader?.previewPrayerVoice;
  box.innerHTML = `<p class="mz-note">مقتطف قصير من الأذان يُرفع عند دخول وقت كل صلاة.</p><div class="mz-list">${Object.keys(prayerVoices).map(v => `<div class="mz-row${v === current ? ' on' : ''}">
      <button class="mz-choose" onclick="chooseMuezzin('${v}')">${muezzinAvatar(v, 'lg')}<span class="mz-name"><strong>${esc(prayerVoices[v])}</strong>${v === current ? '<small>المختار الآن</small>' : ''}</span>${v === current ? `<span class="mz-check">${uiIcon('check')}</span>` : ''}</button>
      ${canPreview && v !== 'silent' ? `<button class="mz-play" onclick="previewMuezzin('${v}',this)" aria-label="استماع">${uiIcon('play')}</button>` : ''}
    </div>`).join('')}</div>`;
  uiLocalize?.(box)
}
function previewMuezzin(voice, button) {
  const playing = button.classList.contains('on');
  document.querySelectorAll('.mz-play.on').forEach(b => { b.classList.remove('on'); b.innerHTML = uiIcon('play') });
  window.AndroidReader?.stopPrayerVoice?.();
  if (playing) return;
  button.classList.add('on'); button.innerHTML = uiIcon('stop');
  window.AndroidReader.previewPrayerVoice(voice)
}
window.onPrayerPreview = (function (previous) {
  return function (playing) { if (!playing) document.querySelectorAll('.mz-play.on').forEach(b => { b.classList.remove('on'); b.innerHTML = uiIcon('play') }); if (typeof previous === 'function') previous(playing) }
})(window.onPrayerPreview);
function chooseMuezzin(voice) {
  window.AndroidReader?.stopPrayerVoice?.();
  const settings = copyPrayerSettings();
  if (settings.voice !== voice) { settings.voice = voice; if (!savePrayerConfig(settings)) return; showSmallNotice(voice === 'silent' ? 'تصلك التنبيهات دون صوت الأذان' : 'المؤذن الآن: ' + prayerVoices[voice]) }
  closeFeatureSheet();
  if (view === 'prayer') renderPrayerPage()
}
const muezzinPreviousRender = renderPrayerPage;
renderPrayerPage = function (...args) {
  const r = muezzinPreviousRender.apply(this, args);
  if (view === 'prayer' && readPrayerData().settings?.confirmed) {
    const head = app.querySelector('.screen-heading');
    if (head && !head.querySelector('.mz-pick')) { head.classList.add('mz-heading'); head.insertAdjacentHTML('beforeend', muezzinPickMarkup()); uiLocalize?.(head) }
  }
  return r
};
