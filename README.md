# Fake Cash Slots

A polished, single-player **Vegas-style** 3-reel slot machine that uses **fictional play money only**.

> **Play money only — no real prizes.**  
> No deposits, withdrawals, payments, crypto, or real-money gambling of any kind.

## How to open / play

### Option A — Static server (recommended)

From this folder:

```bash
python3 -m http.server 8765
```

Then open: [http://127.0.0.1:8765/](http://127.0.0.1:8765/)

### Option B — Open the file

Open `index.html` directly in a modern browser (Chrome, Firefox, Safari, Edge).

## How to play

1. Starting balance: **$1,000** play money (persisted in `localStorage`).
2. Choose a bet: **$5 / $10 / $25 / $50 / $100** (within your balance).
3. Press **SPIN** — reels animate and land on the center payline.
4. **3 of a kind** on the center line pays according to the paytable.
5. Top up with **+ $500 PLAY MONEY** or **RESET TO $1,000**.
6. SPIN disables when balance is below the selected bet.

## Paytable (3 of a kind)

| Symbol   | Multiplier |
|----------|------------|
| Cherries | ×2         |
| Lemon    | ×3         |
| Orange   | ×4         |
| Grapes   | ×5         |
| Bell     | ×8         |
| BAR      | ×12        |
| Sevens   | ×25        |
| Diamond  | ×50        |

Payout = bet × multiplier.

## Features

- HD Vegas cabinet: neon pink / cyan / gold, chrome bezels, LED rails, attract-mode glow
- Canvas reels with motion blur, ease-in / cruise / ease-out overshoot, L→R stagger
- Win FX: cell pulse, coin/confetti burst, credit count-up, banner
- Procedural Web Audio: whir, clack, anticipation tick, win arpeggio
- Responsive layout; balance persisted across refresh

## Files

- `index.html` — structure
- `style.css` — cabinet / neon / chrome styling
- `game.js` — reels, paytable, audio, particles, persistence

## Disclaimer

This is a **toy / demo**. All credits are fake. Nothing here is real gambling.
