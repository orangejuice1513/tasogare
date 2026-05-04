# tasogare

A native desktop focus tracker for engineers. Log sessions, track projects, and build an interview-ready portfolio of your work — all stored locally on your machine, no account required.

Built with **Tauri v2** (Rust backend) + **React + Vite** (frontend) + **SQLite** (local database).

---

> **Platform note:** These instructions are written for **macOS (Apple Silicon — M1/M2/M3/M4)**,
> which is what this app was developed and tested on. It will also run on macOS Intel, and
> can be adapted for Linux and Windows, but those platforms are not officially supported yet.

---

## What the app does

| Tab | Purpose |
|---|---|
| **Daily Log** | Start a timed focus session. Set an intent before you begin, then log what actually happened when you stop. Add multiline debrief notes or bug logs. |
| **Projects** | Create long-running engineering projects with a short summary and full architecture description. Link sessions to them. |
| **Interview Deck** | See all your engineering sessions grouped by project — including total hours logged and expandable notes. Built to help you recall stories for interviews or retros. |

---

## Prerequisites

You need to install four things before you can run the app. Each step below is a one-time setup — once installed, you won't need to repeat it.

### 1 · Xcode Command Line Tools

These are Apple's developer tools that provide compilers and build utilities that Rust depends on.

Open Terminal and run:

```bash
xcode-select --install
```

A dialog will appear asking you to install. Click **Install** and wait for it to finish (about 5–10 minutes). If you see `"command line tools are already installed"`, skip this step.

---

### 2 · Rust

Rust is the language the Tauri backend is written in. The installer also installs **Cargo**, Rust's package manager.

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

When prompted, press **Enter** to accept the default installation. When it finishes, run:

```bash
source "$HOME/.cargo/env"
```

Verify it worked:

```bash
rustc --version
# should print: rustc 1.xx.x (...)
```

---

### 3 · Node.js (via nvm)

Node.js runs the Vite frontend build system. We install it through **nvm** (Node Version Manager) so you can easily switch Node versions if you ever need to.

**Step 3a — Install nvm:**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
```

**Step 3b — Make nvm available in every terminal window** (this is the step most people miss):

```bash
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
```

**Step 3c — Install Node.js 24:**

```bash
nvm install 24
nvm use 24
```

Verify it worked:

```bash
node --version   # should print: v24.x.x
npm --version    # should print: 11.x.x
```

> **Why this step matters:** Without the lines added to `~/.zshrc`, npm and node will disappear
> every time you open a new terminal window. The lines above make sure they load automatically.

---

### 4 · Tauri CLI

The Tauri CLI is what the `npm run tauri dev` command talks to when launching the app.

```bash
npm install -g @tauri-apps/cli@next
```

Verify:

```bash
tauri --version
# should print: tauri-cli x.x.x
```

---

## Running the app

### Step 1 — Clone the repository

```bash
cd ~/Documents
git clone <your-repo-url> tasogare
cd tasogare
```

### Step 2 — Install JavaScript dependencies

```bash
npm install
```

This installs React, Vite, Tailwind, and the Tauri JS plugins. It reads from `package.json` and takes about 30 seconds.

### Step 3 — Fetch Rust dependencies

```bash
cd src-tauri
cargo fetch
cd ..
```

This downloads the Rust crates (tauri, tauri-plugin-sql, SQLite, etc.) from crates.io into your local Cargo cache. Takes 1–3 minutes the first time.

### Step 4 — Launch the app

```bash
npm run tauri dev
```

**What happens when you run this:**

1. Vite starts a local dev server on port 1420 for the React frontend
2. Cargo compiles the Rust backend — **this takes 3–5 minutes the first time, which is normal**
3. The tasogare window opens

Every run after the first is much faster (under 30 seconds) because Rust caches compiled output.

---

## Project structure

```
tasogare/
├── src/                        # React frontend
│   ├── App.jsx                 # All UI: Daily Log, Projects, Interview Deck
│   ├── db.js                   # SQLite query layer
│   ├── index.css               # Tailwind v4 + Rosé Pine Moon design tokens
│   └── main.jsx                # React entry point
│
├── src-tauri/                  # Rust / Tauri backend
│   ├── src/
│   │   ├── lib.rs              # App setup: registers SQL plugin, ensures DB directory exists
│   │   └── main.rs             # Cargo binary entry point — just calls lib.rs
│   ├── capabilities/
│   │   └── default.json        # Tauri v2 permission grants for the SQL plugin
│   ├── Cargo.toml              # Rust dependencies
│   ├── build.rs                # Tauri build script
│   └── tauri.conf.json         # App name, window size, CSP, bundle settings
│
├── index.html                  # Root HTML — loads Google Fonts and React
├── vite.config.js              # Vite + Tailwind plugin config
└── package.json                # Node dependencies and npm scripts
```

---

## Where your data lives

All data is stored in a local SQLite database. Nothing is sent to any server.

| Platform | Database location |
|---|---|
| **macOS** | `~/Library/Application Support/com.tasogare.app/whitespace.db` |
| Linux | `~/.local/share/com.tasogare.app/whitespace.db` |
| Windows | `C:\Users\<you>\AppData\Roaming\com.tasogare.app\whitespace.db` |

**To back up your data:** copy that `.db` file somewhere safe.
**To reset all data:** delete that `.db` file and relaunch the app — the schema will be recreated automatically.

The database has two tables:

- `projects` — name, short description, long description, created date
- `sessions` — type (Routine / Engineering), linked project, intent, reality, notes, duration, timestamp

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌥ 1` | Switch to Daily Log |
| `⌥ 2` | Switch to Projects |
| `⌥ 3` | Switch to Interview Deck |
| `⌘ ⇧ N` | Open Quick Note modal |
| `⌘ ↵` | Save (inside Quick Note modal) |
| `Esc` | Close modal |

---

## Building a distributable app (optional)

If you want to create a `.dmg` installer to share or install permanently:

```bash
npm run tauri build
```

Output lands in `src-tauri/target/release/bundle/`. On macOS this produces:

- `tasogare.app` — drag to your Applications folder to install
- `tasogare_x.x.x_aarch64.dmg` — standard macOS disk image installer

> The first build takes 8–15 minutes. Subsequent builds are faster.

---

## Troubleshooting

**`zsh: command not found: npm`**
nvm isn't loading in your current shell. Run `source ~/.zshrc` and try again.
If that doesn't work, repeat Step 3b in the Prerequisites section above.

**`error[E0433]: cannot find module tauri_plugin_opener`**
The scaffold generated a `lib.rs` that references a plugin not in `Cargo.toml`.
Make sure `src-tauri/src/lib.rs` is the version from this repo, not the auto-generated one.

**Compile error mentioning invalid `identifier`**
`tauri.conf.json` has a bad identifier value. It must be in reverse-domain format
like `com.tasogare.app` — not a command like `cd tasogare`.

**First `npm run tauri dev` is taking forever**
This is expected. Rust is compiling ~200 crates from scratch on your machine.
It will print lines like `Compiling tokio v1.x.x` for several minutes — let it run.
Every run after this takes under 30 seconds.

**The app window opens but is completely white / unstyled**
`src/index.css` still has the default Vite scaffold styles instead of the Tailwind
v4 import. Replace it with the `index.css` from this repo.

**Data disappeared after changing the `identifier` in `tauri.conf.json`**
The database file path includes the identifier, so changing it makes SQLite open a
new empty file at the new path. Your old data is still at the old path — copy the
`.db` file from the old directory to the new one.

---

## Tech stack

| Layer | Technology |
|---|---|
| UI framework | React 18 |
| Build tool | Vite 7 |
| Styling | Tailwind CSS v4 (Vite plugin) |
| Design system | Rosé Pine Moon |
| Typography | Geist, Geist Mono, Fraunces (Google Fonts) |
| Desktop shell | Tauri v2 |
| Backend language | Rust 1.95+ |
| Database | SQLite via tauri-plugin-sql |
