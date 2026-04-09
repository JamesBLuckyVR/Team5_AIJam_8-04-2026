# Brickanoid — Team 5 AI Jam (April 8, 2026)

A browser-based brick-breaking game built with React + TypeScript + Vite.

---

## Local Development

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Start dev server with hot reload
npm run dev
# → http://localhost:5173/Team5_AIJam_8-04-2026/

# Preview the production build locally
npm run build
npm run preview
# → http://localhost:4173/Team5_AIJam_8-04-2026/
```

---

## Deploying to GitHub Pages

The repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that
automatically builds and deploys to GitHub Pages on every push to `main`.

### One-time setup (repo admin required)

1. **Enable GitHub Pages via Actions**
   - Go to the repo on GitHub → **Settings** → **Pages**
   - Under **Source**, select **GitHub Actions**
   - Click **Save**

2. **Make sure Actions have write permissions**
   - Go to **Settings** → **Actions** → **General**
   - Scroll to **Workflow permissions**
   - Select **Read and write permissions**
   - Click **Save**

3. **Merge `elysio` branch into `main`**
   - Open a Pull Request from `elysio` → `main` on GitHub and merge it
   - The Actions workflow will trigger automatically on merge

4. **Watch the deployment**
   - Go to the **Actions** tab on GitHub
   - You should see a workflow run called **"Deploy to GitHub Pages"**
   - Wait for it to complete (usually ~1 minute)

5. **Visit the live site**
   ```
   https://jamesbluckyvr.github.io/Team5_AIJam_8-04-2026/
   ```

### Re-deploying

Every subsequent push to `main` will automatically trigger a new deployment.
No manual steps needed after the one-time setup above.

---

## Project Structure

```
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Actions CI/CD pipeline
├── src/
│   ├── main.tsx            # React entry point
│   ├── App.tsx             # Root component
│   ├── Brickanoid.tsx      # Main game component
│   ├── Sidebar.tsx         # Betting sidebar UI
│   ├── useGameEngine.ts    # Game loop & physics
│   ├── useRenderer.ts      # Canvas rendering
│   ├── config.ts           # Game constants & risk tiers
│   └── payout.ts           # Payout curve & multiplier logic
├── index.html              # HTML entry point
├── vite.config.ts          # Vite config (base path for GitHub Pages)
├── tsconfig.json           # TypeScript config
└── package.json
```
