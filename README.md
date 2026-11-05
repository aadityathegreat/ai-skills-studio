# AI Skills Studio projects

Projects built with ChatGPT Work for the UT Austin Handshake AI Skills Studio missions, then reviewed and deployed with Codex.

- [Tower Tactics multiplayer game](https://aadityathegreat.github.io/ai-skills-studio/game/)
- [Personal portfolio](https://aadityathegreat.github.io/ai-skills-studio/portfolio/)
- [Years of Life dashboard](https://aadityathegreat.github.io/ai-skills-studio/dashboard/)

The game uses PeerJS 1.5.5 and WebRTC. Keep the host tab open. Restrictive networks can block peer connections. Room codes are casual invitations. The game has no login, paid service or university affiliation.

The portfolio uses information already published at [aadityathegreat.github.io](https://aadityathegreat.github.io/). Its project guide contains the same public material. Private project repositories are linked through their public summaries.

The dashboard uses the World Bank’s SP.DYN.LE00.IN indicator, retrieved November 4, 2026 Central time. It preserves missing values and includes attribution, methods and data downloads.

Static files live in `docs/`. No build step is needed to serve them. GitHub Pages serves the `main` branch’s `docs/` directory. The game’s readable source and supplied engine/protocol tests are in `game-source/`; run `node --test game-source/tests/game.test.mjs` for those tests.
