# 3.0.65 (115): picker display and repetition

The inline panel CSS explicitly sets select display:block, overriding the UA hidden rule. The new reader trigger existed but its native select was also visible. Add a final scoped display:none!important rule only for enhanced selects. The backing select remains for the existing playback state and change handler.

Extend the existing themed picker to inline repeat and legacy audio repeat controls, without portraits for repetition. Labels, selected option, close/back/Escape/focus and Arabic/English localization retain the existing shared behavior. Choosing a repetition value uses the existing stop/reset/count/localStorage handler.

Verification now asserts actual visibility of both native selects, uses the custom repeat UI and checks saved count in both themes/languages, plus responsive/reduced-motion and existing page preservation. The inline playback suite programmatically addresses hidden backing controls with force:true; all nine readers still complete exactly three plays of 9:127 without advancing. Seven data gates and signed APK/AAB builds pass. Home animation, audio sources, native audio and full-surah synchronization are unchanged.
