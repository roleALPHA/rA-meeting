<!--
The commit message carries the reasoning in this project; a pull request body that repeats it adds nothing.
What belongs here is what a reviewer cannot read off the diff.
-->

## What this changes, and why

## What you would have done differently

<!-- The alternative you considered and rejected, and why. If there was none, say so -- that is information too. -->

## How it was verified

<!-- Not "tests pass". Which test, run how, and what it would have caught. Anything that only a real tenant can
     show (Teams theme, app catalog, API approval) says whether it was checked there or not. -->

- [ ] The architecture constraints in `CLAUDE.md` still hold: no backend, no proxy, no credentials in browser code
- [ ] Text a person reads is a message ID in `shared/locales` (de, en, fr, es)
- [ ] `npm run build` passes if a runtime dependency changed
- [ ] Checked in SharePoint and in Teams, if it is something you can see
