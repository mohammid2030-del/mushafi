# Mushafi Challenge audit 3.1.4

## Scope and findings

Audited offline solo/daily/review checkpoints, XP, local-calendar streaks, browser lifecycle and hardware Back, room APIs, server scoring and tournaments, Firebase bridge, question-bank generation and backup validation.

Fixes: daily dates now follow the device calendar (with DST-safe prior-day arithmetic); future dates do not award XP. Strict history and active-round validation rejects malformed saved answers, duplicate questions, incomplete completions and unsafe result fields. Daily entry resumes an unfinished daily round. Repeated completion keeps XP/results intact.

Async screen generation guards prevent late loads/room creation from reopening screens. Account switches reject pending responses; old polling responses cannot replace accepted answers. Expired room pointers are cleared. Server revisions and midpoint clock estimates support room updates. Online record deletion has an explicit confirmation. Server settings, selected categories, wrong answers and forfeits are clearer, including narrow layouts and English numerals.

Server fixes: all unanswered/incorrect questions carry equal elapsed penalties, late tie-breakers receive a fresh countdown and unused questions, and waiting-host deletion transfers hosting. An appended schema-only migration adds short pending leases and confirmed active-room claims, preventing concurrent enrollment in multiple rooms. Room revisions are monotonic. Strict JSON/config/JWT handling, signing-key rotation refresh and one native auth refresh improve recovery; JWTs remain native-only.

Question review: checked all 288 stems/correct answers and reran canonical-reference generation against bundled Quran/Muslim source texts. Qualified hg-history-27 explicitly by the Anas narration in Sahih Muslim 1779 to distinguish differing historical narrations. This is a source consistency review, not independent scholarly certification.

## Validation

Core selection matrix (81 configurations), local Riyadh midnight and DST, malformed backup/history/checkpoints, replay XP, UI dark/light and narrow/landscape, offline review/timer/continuation, stale requests/polls, account changes, hardware Back, deletion cancel.

Server tests use real in-memory SQLite with signed RSA JWT fixtures, concurrent requests, exact server deadlines, missing answers, fresh tie-breakers, full 4/8/16-player brackets, one active room per account, host deletion, claims cleanup and key rotation.

Release checks also verify canonical bank identity across client/server, APK signing continuity, packaged assets and AAB/source. No physical multi-device competition or independent scholarly review was available.

End-to-end browser tests also completed every question in two-player duels and 4/8/16-player tournaments through a mocked native bridge into the real Worker and SQLite, with signed JWT fixtures, final brackets, answer reviews and profile awards checked.
