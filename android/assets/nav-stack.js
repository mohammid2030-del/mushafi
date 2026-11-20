'use strict';
/* One back rule for the whole app: every page returns to the page it was opened from.
   Each page-opening function is wrapped so the app remembers how to reopen the page it produced
   (with the same arguments). system-back.js then records, for every new page, how to reopen its parent;
   the system back gesture and the back arrow in a page heading both use that record. */
const navEntries = Object.create(null);
let navEnterCount = 0, navDepth = 0;
const navEnterSection = enterSection; enterSection = function (...args) { navEnterCount++; return navEnterSection.apply(this, args) };
const navPageFunctions = ['home', 'moreHome', 'mushafHub', 'openQuran', 'globalSearch', 'duaHome', 'azkarHubMorningEvening', 'openDevotion', 'sebhaHome',
  'recitationHub', 'rhOpenReader', 'rhDownloads', 'surahReadersHome', 'surahIndex', 'fullSurahPlayerHome',
  'khatmaHome', 'wardHome', 'libraryHome', 'backupHome', 'prayerHome', 'openPrayerSettings', 'openQibla',
  'hajjHome', 'hajjTypePicker', 'hajjGuide', 'hajjTracker', 'hajjModels', 'hajjModel', 'hajjJourney', 'hajjVisitPage', 'hajjReport',
  'booksHome', 'bookOpen', 'openMuslimLibrary', 'openMuslimHadith', 'liveBroadcastHome', 'charityHome', 'challengeHome',
  'fajrHome', 'fajrGate', 'fajrHistory', 'fajrHowItWorks', 'fajrPeopleHome', 'fajrSummary',
  'learnHome', 'learnCourse', 'learnLesson', 'accountHome', 'about', 'devNoteOpen', 'languageHome', 'renderPrivacySummary', 'fridayGuideHome'];
for (const name of navPageFunctions) {
  const original = window[name];
  if (typeof original !== 'function' || original.navWrapped) continue;
  const wrapped = function (...args) {
    const outer = navDepth === 0, startView = view, startParent = outer && !systemBackRestoring ? systemBackRoute() : null;
    navDepth++;
    let result;
    const before = navEnterCount;
    try { result = original.apply(this, args) } finally { navDepth-- }
    // A page that opens another page straight away (khatma → its setup) is not a stop on the way back:
    // the page finally shown returns to where the user actually was.
    if (outer && !systemBackRestoring && view !== startView && navEnterCount !== before) { if (startParent) systemBackParents.set(view, startParent); else systemBackParents.delete(view) }
    // Only remember calls that actually opened a page (not sheets, native screens or calls that bailed out).
    if (navEnterCount !== before && typeof view === 'string' && view && view !== 'reader' && view !== 'onboarding') navEntries[view] = () => window[name](...args);
    return result;
  };
  wrapped.navWrapped = true;
  window[name] = wrapped;
}
// Pages with tabs step back through their first tab before leaving (prayer times: month or night → today → home).
function navTabBack() {
  if (view === 'prayer' && typeof prayerTab !== 'undefined' && prayerTab !== 'today' && typeof ppTab === 'function') { ppTab('today'); return true }
  if (view === 'quran' && typeof quranTab !== 'undefined' && quranTab !== 'surahs') { openQuran('surahs'); return true }
  return false;
}
const navNativeBack = window.handleNativeBack;
window.handleNativeBack = function (...args) {
  if (!activeSheet && !document.querySelector('.feature-sheet,.first-tour,.home-recitation-overlay') && navTabBack()) return true;
  return navNativeBack.apply(this, args);
};
document.addEventListener('click', e => {
  if (!e.target.closest?.('#app .screen-heading button[data-back], #app .screen-heading > button.round-action:first-child')) return;
  if (navTabBack()) { e.preventDefault(); e.stopImmediatePropagation() }
}, true);

// The back arrow in a page heading follows the same record as the system back, so the two never disagree.
document.addEventListener('click', e => {
  const button = e.target.closest?.('#app .screen-heading button[data-back], #app .screen-heading > button.round-action:first-child');
  if (!button || typeof systemBackParents === 'undefined') return;
  if (view === 'khatma-setup' && khatmaSetupStep > 0) return; // its arrow steps back through the setup
  const parent = systemBackParents.get(view);
  if (!parent) return;
  e.preventDefault(); e.stopImmediatePropagation();
  systemBackNavigate(parent);
}, true);
