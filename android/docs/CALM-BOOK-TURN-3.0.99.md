# Calm paper turning — 3.0.99 (149)

Fast pointer events now update a target position rather than directly moving the paper to that position. A coalesced animation-frame follower damps motion (140ms response, bounded velocity). The phone preview stays below the point where the leaf disappears; spread preview also stays below completion. Fonts that finish loading after a quick flick start the visible leaf at rest rather than jumping to the finger's last distant coordinate.

Release now uses a smooth quintic acceleration/deceleration profile with about980ms for a complete turn and at least620ms for the remaining movement. Cancelled gestures return over420ms. Animation time advances by at most34ms per rendered frame; a long initial raster or busy frame therefore cannot consume the entire movement and instantly commit the next page. A direction reversal first returns the existing leaf smoothly. Bare-page taps during completion are ignored; navigation controls and direct jumps retain their existing supersession behavior.

Reading position is still changed once, after completion. Curved paper geometry, original QCF fonts, next/previous RTL order, portrait/spreads, khatma/smart-reader bounds and reduced-motion preference remain. No additional settings, sounds, permissions or user-data fields were added. Single-system-icon notification behavior from3.0.98 remains.

Validation includes fast input with no immediate visual jump; a still-visible paper and unchanged cursor300ms after lift; minimum remaining movement; simulated1.5second frame stall without skipping to completion; smooth reversal cancellation; existing paper gesture/font-failure/navigation/reduced-motion tests and reader-mode regressions. No physical-device frame-rate claim.
