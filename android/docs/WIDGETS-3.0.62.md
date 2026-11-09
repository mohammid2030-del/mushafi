# 3.0.62 (112): raised prayer heading and countdown before times

Prayer widget content is aligned to the top inset. The header contains the prayer name, date, and next-prayer time. The native Western-digit countdown follows the next-prayer line directly, then the five daily times and the existing footer. The prayer row is rendered separately so the ticking Chronometer can sit between heading and times. Both header and row use weighted bounded artwork, preserving resize behavior. Short widgets retain the existing compact mode.

Fresh top_general/top_prayer layout IDs force existing 3.0.61 hosts to inflate the updated hierarchy; legacy resource names are retained to avoid ID collisions with the previous cached layout. Non-prayer widget appearance, preferences, source texts, clocks, digit face and audio/tafsir synchronization are preserved.

QA retains the native host suite, with assertions for top alignment, countdown-before-row order, bounded header/row during resize, and replacement of the actual 3.0.61 hierarchy in an existing prayer host. Source data gates and prior signing identity required. Native prayer preview inspected before packaging.
