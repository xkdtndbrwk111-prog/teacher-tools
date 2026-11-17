# V1.66.3 R8 release candidate

Original three source overlays imported with exact SHA-256 verification; Git blobs:
- patch_coin.py 2ca197b52a30e1faf9aa0c86a791c3e43e850899
- share_pin.py 46a66aea907c4912342c634184b2c340d427428b
- change_pin.py f047b720647b7c1efc7ba8e12327ae504ccaf830

Base V1.66.2 install archive SHA256 88a8e546fee883480324a29637597870fa8ef46f40486ab60b60450fbe0fd4d7. Target V1.66.3 install archive SHA256 8a765f348f2b61c8f653d86c1a4591798a3054cc3435bbaaa6ce24e2f30d624f. No user ledger, roster, or settings files included. Full program inventory 39 entries with immutable bootstrap/public key unchanged across all candidate bases. Release.json SHA256 5e0ca2e428901c5681481d8b15629f5bd0e81116aa0667884ff97b1472ead08b.

Full unsigned release archive: R8_V1.66.3_UNSIGNED_RELEASE_CANDIDATE.zip.
Archive SHA256: 818c82c9e8a3ea7ed3cf9c8afef69c8b48ac5fcfe67848d5421ee36bb347235c
Payload SHA256: b6056da425b026ff50043cd933ca12d267b4b4b39514948567eeedd1488ec8a4

The generated archive resides in the review session. The GitHub connector cannot upload a local binary directly. The intake branch can accept the exact candidate ZIP at repository root and will validate it without signing or updating the existing feed. It publishes the required Actions candidate artifact and digest for the existing release workflow. Release must pass actual Windows install/update/rollback gates; do not mark a gate as passed simply because a source PR is merged. Do not copy the unsealed manifest to latest.json. No change to existing signed content channels. The minigame refund feature is not included in this candidate.
