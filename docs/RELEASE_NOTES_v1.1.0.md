# Slayply 1.1.0

A redesign of the side panel, with progress you can see while a model works. Tag `v1.1.0` and use this text for the release (`docs/DEPLOYMENT.md`).

## What changed

- **Look:** light, dark or follow-the-system themes with one accent, shared with the site. The three style presets are gone; an old saved preset is ignored.
- **Layout:** tabs are now Apply, Saved, You and Setup in a floating bar. The Apply tab shows one step at a time (Capture, Questions, Answers) and the main button sits above the tab bar. The job text, fit details and question options open on demand, and several answers collapse into cards.
- **Progress:** every answer and fit check shows its stage, elapsed time and a Cancel button, with a note after 30 seconds. The relay sends a keep-alive ping every 10 seconds while a model is quiet.
- **Model chip:** provider, model and effort change from the app bar without leaving the Apply tab. Setup keeps the API key.
- **Wording:** the relay warm-up message is plain text. Playful wording is kept for empty states only.
- **Fix:** the Gemini adapter asks for low thinking when no effort is chosen, the likely cause of the slow fit check (not yet confirmed with a live key).

## Known limits

- Everything above was checked by tests and by reading, not by eye in a real side panel; the look at 390 x 720 in both themes is a manual check.
- The keep-alive ping has not been observed through Render's proxy.
- Rewrite actions, click-to-fill and resume prefill are not in this release (they need SPEC changes).
- The limits listed in the 1.0.0 notes still apply, except the style presets.
