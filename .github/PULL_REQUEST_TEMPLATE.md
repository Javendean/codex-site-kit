## What this changes

<!-- One or two sentences. -->

## How it was verified

<!--
This project's whole premise is that measured beats asserted, so please say what
you actually ran, not what you expect to be true.
-->

- [ ] `npm test` passes
- [ ] If a tool changed: a test covers both its happy path and its failure path
- [ ] If the install path changed (`package.json` bin/files/engines, `bin/`, `scripts/`):
      `npm pack --dry-run` still contains the bin, the server and the doctor
- [ ] If the server surface changed: `node scripts/handshake.js` still completes

## Notes for a beginner

<!--
If this changes anything a first-time user types or sees, quote the new output
here and update the README to match. A README that disagrees with the terminal
is worse than no README.
-->
