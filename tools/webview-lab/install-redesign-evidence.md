# WebView2 installation redesign: initial evidence

Status: Phase 7A online-profile implementation. This is not an installer, a release, or a field pass.
Baseline: `1d1a1019d235228ac753d40a4c1485d49c4053f2` (PR #166).

## Artifacts examined

The earlier artifact is from [run 46080562586](https://github.com/xkdtndbrwk111-prog/teacher-tools/actions/runs/46080562586), commit `d7a862e44cbdad205a2a3369928416dd07a19615`. It is a plausible earlier field pilot, but it has **not** been identified as the exact file used in the successful field trial. The later artifact is from [run 46139645284](https://github.com/xkdtndbrwk111-prog/teacher-tools/actions/runs/46139645284), baseline commit above. Its identity as the file blocked on the user's machine also requires confirmation against that machine's event and file hashes.

SHA-256 of extracted binaries (Authenticode inspection returned `NotSigned` for each):

| Binary | Earlier | Later |
| --- | --- | --- |
| HOJA-Native-Launch-Lab.exe | `33ac07abf8376967d1b9684e0eabda6d68fb39046171a514ced96bca47a0c6e9` | `b79c4dae426882422e32957a40adb5e9ba5d317a38abee3aa32c3030f7ef9f36` |
| HOJA-Native-Server.exe | `3f9456770277b372962be2d206c4bd3888518dfcc6aa7344ca711443fee08c4d` | `36c9c1e1d2ebb3ef899768013db3b0900dbd16bb26810018a10763f08f125c26` |
| HOJA-Field-Static.exe | absent | `0bcb936a521d96c76424ff0d8f1ee60661df2bbae07536eb6c64c8ca362af49c` |

Both builds compile x64 .NET Framework executables with the Windows Framework `csc.exe` in the field build script. The later build adds a separate executable compiled from `field-static-server.cs`, introduced at `e94f9a7`; both package scripts use the same compiler family and no Authenticode signing step. The static server supplies the separate local manager and game origins. Different hashes alone do not establish why a policy allowed or blocked a binary; CI artifacts do not establish the identity of the field copies.

The reported 3033/3077 events support a code-integrity enforcement hypothesis, not a complete causal diagnosis. Record the full 3077 event, including file path, policy name/ID, SHA-256 and associated signer information, and compare it with both actual field files and the artifacts. [Microsoft's event documentation](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/operations/event-id-explanations) describes 3077 as an enforced block and 3033 as potentially occurring in other circumstances. Do not disable or bypass policy to test.

## Contracts that must survive the redesign

* The public manager sender currently targets `http://127.0.0.1:17439`; the isolated pilot uses 17451 and modifies packaged copies. The online game has the same fixed board origin according to the field build's source assertion. Simply deleting the local ZIPs and static server breaks the existing handshake. An online migration must account for exact origin, source, CORS, and CSP checks, and coexistence with the existing operational application.
* The pilot starts its host and server through `Start-Pilot.ps1`; `native-read-server.cs` invokes PowerShell for actual media download and playback. A native installer alone does not remove runtime PowerShell dependencies.
* The current pilot refuses occupied ports rather than killing an unknown process. A replacement must retain that fail-safe and only clean up a process after verifying durable ownership and process identity, including PID reuse and crash cases.
* The existing installer verifies a local hash inventory. A replacement updater must authenticate the manifest with a trusted key, verify file hashes, stage atomically, recover on failure, and leave user data outside the replaceable payload. A hash inventory stored beside an untrusted package is not by itself publisher authentication.

## Validation boundary

Run 46139645284 has five successful Windows CI jobs, including actual public provider requests from the runner. It is not evidence of execution under the field PC's security policy, nor of real user data, actual media downloads, physical display/audio, or the redesigned installer. No new installer or redesigned runtime was tested by this investigation.

For a release candidate, code-sign all relevant application binaries and the installer with a trusted Authenticode identity, timestamp signatures, and verify each signature in the build. [Microsoft](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/design/use-code-signing-to-simplify-application-control-for-classic-windows-applications) notes that signing an installer alone does not make all extracted files trusted; enterprise App Control policies can impose additional restrictions. Signing does not guarantee that a particular policy will allow the application. Certificate procurement and protected signing credentials remain outstanding.

