# Brickanoid — Team 5 AI Jam (April 8, 2026)

A provably fair brick-breaking casino game built during the Team 5 AI Jam.
Break bricks, avoid hidden deathblocks, and cash out before you lose it all.

**Live game:** [https://jamesbluckyvr.github.io/Team5_AIJam_8-04-2026/](https://jamesbluckyvr.github.io/Team5_AIJam_8-04-2026/)

---

## How to run locally

No install, no build step required. Just open the file in your browser:

1. Clone the repo
   ```bash
   git clone https://github.com/jamesbluckyvr/Team5_AIJam_8-04-2026.git
   cd Team5_AIJam_8-04-2026
   ```

2. Open `index.html` directly in your browser
   ```bash
   open index.html        # macOS
   start index.html       # Windows
   xdg-open index.html    # Linux
   ```

That's it — no npm, no server needed.

---

## How to deploy

The live site updates automatically when changes are pushed to the `deployment` branch.

```bash
git checkout deployment
git merge your-branch
git push origin deployment
```

GitHub Pages will pick up the changes within a minute or two and publish them to the live URL above.

---

## Project structure

```
settings/
  config.js         ← Game Settings team — tweak numbers, colors, balance

engine/
  state.js          ← shared game variables
  payout.js         ← payout curve and multiplier math
  brickGen.js       ← provably fair brick layout (seeded RNG)
  physics.js        ← game loop, ball, paddle, collision detection

art/
  draw.js           ← everything drawn on the canvas
  ui.js             ← sidebar, result cards, overlays

index.html          ← HTML structure
brickanoid_css.css  ← styles
```

### Team ownership

| Folder / File       | Team             | What to change here                          |
|---------------------|------------------|----------------------------------------------|
| `settings/config.js`| Game Settings    | Speeds, multipliers, brick counts, colors    |
| `engine/`           | Game Engine      | Physics, payout logic, brick generation      |
| `art/`              | Game Art         | Canvas visuals, sidebar layout, overlays     |
| `brickanoid_css.css`| Game Art         | Fonts, colors, spacing, responsive layout    |

---

## How to play

- Set your **wager** and choose a **ball speed** (higher = bigger multiplier)
- Choose how many **deathblocks** are hidden in the grid (more = bigger multiplier)
- Hit **BET** — control the paddle with your mouse or ← → arrow keys
- **Drop the ball** into the green cashout zone to collect your winnings
- Hit a **☠ deathblock** and lose your bet instantly
