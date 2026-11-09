# Adhan voice portraits — 3.0.85

Use existing images/mishary-alafasy.png for afasy and the user's newly supplied images/ahmad-alnafees.png for nafees. The new PNG is copied byte-for-byte (SHA256 0a3a9bf9e543d27f364185474da77fc97358b63e8b20cb906a01830d9ee9c636). Both options and current selection show a circular portrait in Prayer settings and Welcome. Other voices retain their generic icons.

Images are decorative beside visible voice names, preserve transparency, and are framed through CSS without modifying source pixels. Picker changes retain hidden-select handlers, voice IDs, preview behavior and native persistence.

Validation: welcome settings suite passed both portrait paths, successful image decoding, selected Nafees portrait update and clearing when switching to an unpictured voice, plus AR/EN light/dark layouts, voice selection and silent preference regression. Dark screenshot visually inspected. Seven release gates and signing/asset parity checked. No audio file/source or recitation behavior changes.
