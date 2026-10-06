# Shared classroom assets

Moved from Seating V6.24-step1b on main `a2d0952`, with all 173 PNG files unchanged.

- `playback/`: 7 classroom, furniture and teacher sheet images.
- `students/`: 60 student sheets + student character metadata.
- `teacher/`: 106 avatar layer images + teacher avatar metadata.
- JSON asset references resolve relative to the containing JSON file (e.g. `new URL(src, metadataUrl)`).
- `docs/SHARED_ASSETS_MANIFEST.json` records all 175 old/new paths and source/current hashes. The earlier Seating source manifest is preserved as a historical baseline.

No audio files existed in the source assets. Hanja plays short locally synthesized success/failure tones and has no BGM.
