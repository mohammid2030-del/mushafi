# Reader search transition 3.1.3

Reader IME uses ADJUST_NOTHING. Native insets no longer pad/resize the reader for the keyboard. Keyboard height moves only the search overlay; the Quran viewport stays unchanged. Search close only dismisses the IME: it does not reapply system bars, change cutout mode or request another insets pass. Window focus changes do not reconfigure fullscreen while reading; entering reader/resuming activity still applies its chrome.

Disable transformed/backdrop-filter search layers. Prepare target page fonts before navigation; retain the picker until the new reader DOM is ready. Canceling a pending selection invalidates it, so a late font response cannot navigate.

Regression validation includes a delayed-font selection test, unchanged reader bounds during native IME notifications, cancellation, native keyboard-only dismissal, ordinary page/slider handling, and existing reader modes. Physical OEM device reproduction remains unavailable.
