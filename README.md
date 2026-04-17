<div align="center">

# ⚡ CodeFlow

### Visualize Your Codebase Architecture in Seconds

**Zero setup. No build step. Analyze Forgejo repos or local folders interactively.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

[**Try it Now**](https://codeflow-five.vercel.app/) · [Report Bug](https://github.com/braedonsaunders/codeflow/issues) · [Request Feature](https://github.com/braedonsaunders/codeflow/issues)

<img src="./screenshot.png" alt="CodeFlow Screenshot" width="100%"/>

</div>

---

## Why CodeFlow?

Ever opened a new codebase and felt completely lost? **CodeFlow** turns any Forgejo repository or local codebase into an interactive architecture map in seconds.

- **No installation required** — runs entirely in your browser
- **No data collection** — your code never leaves your machine
- **No accounts** — just paste a URL or select local files and go
- **Works offline** — analyze local files without internet

```
⚡ Paste URL / Select Files → See Architecture → Make Better Decisions
```

---

## Features

### 🗺️ **Interactive Dependency Graph**
See how your files connect at a glance. Click any node to highlight its dependencies. Drag, zoom, and explore.

### 💥 **Blast Radius Analysis**
*"If I change this file, what breaks?"* — CodeFlow answers this instantly. Select any file and see exactly how many files would be affected by changes.

### 👥 **Code Ownership**
Know who owns what. See the top contributors for any file based on git history. Perfect for code reviews and knowing who to ask.

### 🔐 **Security Scanner**
Automatic detection of:
- Hardcoded secrets & API keys
- SQL injection vulnerabilities
- Dangerous `eval()` usage
- Debug statements in production code

### 🧩 **Pattern Detection**
Automatically identifies:
- Singleton patterns
- Factory patterns
- Observer/Event patterns
- React custom hooks
- Anti-patterns (God Objects, high coupling)

### 📊 **Health Score**
Get an instant A-F grade for your codebase based on:
- Dead code percentage
- Circular dependencies
- Coupling metrics
- Security issues

### 🔥 **Activity Heatmap**
Color files by commit frequency to see which parts of your codebase are most actively developed.

### 📋 **PR Impact Analysis**
Paste a PR URL to see exactly which files it affects and calculate the blast radius of proposed changes.

### 💻 **Local File Analysis**
Analyze code directly from your computer without uploading to Forgejo:
- **Privacy First:** Your code never leaves your machine
- **Offline Support:** Works without internet connection
- **Drag & Drop:** Simply drag files or folders to analyze
- **Folder Scanning:** Recursively analyze entire project structures
- **Git-aware Defaults:** Respects `.gitignore` entries automatically in the UI and CLI
- **Instant Results:** All processing happens in your browser

---

## Privacy First

**Your code stays on your machine.** CodeFlow:

- ✅ Runs 100% in the browser
- ✅ Makes API calls directly to Forgejo or through your own TrueNAS proxy
- ✅ Never sends code to a third-party backend
- ✅ Supports private repos with either a local token or server-side proxy auth
- ✅ No analytics or tracking

In standalone browser mode, your Forgejo token stays in browser memory only. In the TrueNAS deployment, nginx can inject a server-side Forgejo token so users do not need to paste credentials into the UI.

---

## Quick Start

### Option 1: Run It on TrueNAS SCALE

For private Forgejo repos on the same NAS, use the native TrueNAS custom app deployment:

```bash
./deploy/truenas/deploy_custom_app.sh
```

That deploys a single `nginx` app, serves CodeFlow on port `30146`, and proxies Forgejo API calls through `/forgejo-api` with optional server-side token injection.

See [deploy/truenas/README.md](deploy/truenas/README.md) for the deployment details.

### Option 2: Self-Host as Static Files
```bash
# Clone the repo
git clone https://github.com/braedonsaunders/codeflow.git

# That's it! Just open index.html in your browser
open index.html
```

No build process. No dependencies. No npm install. **It's just one HTML file.**

### Option 3: Analyze Local Files
You can now analyze code directly from your local machine without uploading to Forgejo:

1. Open CodeFlow in your browser
2. Click the "📁 Local Files" button
3. Select the folder or files you want to analyze
4. CodeFlow will process them entirely in your browser, skipping files matched by the repo's `.gitignore`

**Perfect for:**
- Private projects you don't want to upload
- Offline development
- Quick local analysis before committing
- Working with sensitive code

---

## Usage

### Forgejo Repositories
```
Paste a full Forgejo repo URL, or use owner/repo with your Forgejo base URL
Example: https://truenas.example.com/forgejo/team/project
```

Remote repo scans also respect `.gitignore` entries from the target repository by default.

### Private Repositories
1. Paste the repo URL, for example `http://192.168.1.134:30142/mmarinucci/TaxonoMate.git`
2. Choose one auth mode:
   - `Server Auth` when running behind the TrueNAS proxy
   - `Token` when using a Forgejo personal access token
3. Click `Analyze`

### TrueNAS App Flow
1. Deploy with `./deploy/truenas/deploy_custom_app.sh`
2. Open `http://<truenas-host>:30146/`
3. Paste a Forgejo repo URL
4. Leave auth on `Server Auth` if the app is configured with a server-side token
5. Analyze private repos without pasting credentials into the browser

### CLI Diagnostics For Codex Skills

CodeFlow now exposes its diagnostics through a local CLI so Codex skills can shell out and consume structured JSON instead of scraping the UI.

#### Analyze a local path
```bash
node scripts/codeflow-report.cjs path /absolute/path/to/project --json
```

Local path analysis skips files and directories matched by the target repo's `.gitignore` by default.

#### Keep the payload small for skills
```bash
node scripts/codeflow-report.cjs path /absolute/path/to/project \
  --json \
  --sections summary,securityIssues,suggestions
```

#### Analyze a Forgejo repo directly
```bash
node scripts/codeflow-report.cjs repo \
  http://192.168.1.134:30142/mmarinucci/TaxonoMate.git \
  --auth auto \
  --json \
  --sections summary,patterns,securityIssues,suggestions
```

Repo mode reads `.gitignore` files from the target repository and excludes matching paths automatically.

`--auth auto` will use a token from:
- `--token`
- `--token-env`
- `FORGEJO_TOKEN`
- `FJ_TOKEN`
- macOS Keychain service `TrueNAS-Forgejo-Token`

#### Use a server-side proxy instead of a local token
```bash
node scripts/codeflow-report.cjs repo \
  http://192.168.1.134:30142/mmarinucci/TaxonoMate.git \
  --auth server \
  --api-base-url http://192.168.1.134:30146/forgejo-api \
  --json \
  --sections summary,suggestions
```

That mode is useful when the TrueNAS app already injects the Forgejo token and you want the CLI to reuse the same proxy path.

#### Opt-in remote smoke test for pre-commit
```bash
node scripts/codeflow-smoke.cjs aichemist --json --sections summary > /dev/null
```

That target currently points at:

```text
http://192.168.1.134:30142/mmarinucci/AIchemist.git
```

It is intended as a real Forgejo smoke target for this environment, not as part of the default fast unit test path.

Example `.git/hooks/pre-commit` snippet:
```bash
#!/bin/sh
node scripts/codeflow-smoke.cjs aichemist --json --sections summary > /dev/null || exit 1
```

### Local Files
Click the "📁 Local Files" button to analyze code from your computer:
- **Folder Analysis:** Select a folder to analyze all supported files recursively
- **File Selection:** Choose specific files to analyze
- **Drag & Drop:** Drag files or folders directly onto the page

All processing happens locally in your browser - nothing is uploaded.

### Shareable Links
After analysis, click 🔗 to copy a shareable link. Anyone can re-run the same analysis.

### 📤 **Export Reports**
Export your analysis in multiple formats for further processing:

- **JSON Report** - Complete analysis data including:
  - Repository metadata and health score
  - All files with functions, dependencies, and churn data
  - Complete function statistics with callers and usage metrics
  - Security issues, patterns, and architecture issues
  - Duplicate code detection and layer violations
  - Suggestions and recommendations
  - Language breakdown and folder structure
  
  Perfect for programmatic analysis, CI/CD integration, or custom reporting tools.

- **Markdown Report** - Human-readable formatted report
- **Plain Text Report** - Simple text format
- **SVG Image** - Export the dependency graph visualization
- **Raw JSON** - Simplified data export

Click the 📤 Export button in the top bar after analysis to access all export options.

---

## Supported Languages

CodeFlow extracts functions and analyzes dependencies for:

| Language | Extensions |
|----------|------------|
| JavaScript | `.js`, `.jsx` |
| TypeScript | `.ts`, `.tsx` |
| Python | `.py` |
| Java | `.java` |
| Go | `.go` |
| Ruby | `.rb` |
| PHP | `.php` |
| Vue | `.vue` |
| Svelte | `.svelte` |
| Rust | `.rs` |
| C | `.c`, `.h` |
| C++ | `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, `.hxx` |
| C# | `.cs` |
| Swift | `.swift` |
| Kotlin | `.kt`, `.kts` |
| Scala | `.scala`, `.sc` |
| Groovy | `.groovy`, `.gvy` |
| Elixir | `.ex`, `.exs` |
| Erlang | `.erl`, `.hrl` |
| Haskell | `.hs`, `.lhs` |
| Lua | `.lua` |
| R | `.r`, `.R` |
| Julia | `.jl` |
| Dart | `.dart` |
| Perl | `.pl`, `.pm` |
| Shell | `.sh`, `.bash`, `.zsh`, `.fish` |
| PowerShell | `.ps1`, `.psm1`, `.psd1` |
| F# | `.fs`, `.fsi`, `.fsx` |
| OCaml | `.ml`, `.mli` |
| Clojure | `.clj`, `.cljs`, `.cljc` |
| Elm | `.elm` |
| VBA | `.vba`, `.bas`, `.cls`, `.xlsm`, `.xlsb`, `.xlam` |

---

## Visualization Modes

| Mode | Description |
|------|-------------|
| 📁 **Folder** | Color by directory structure |
| 🏗️ **Layer** | Color by architectural layer (UI, Services, Utils, etc.) |
| 🔥 **Churn** | Color by commit frequency (hot spots) |
| 💥 **Blast** | Color by impact when a file is selected |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Analyze repository |
| `+` / `-` | Zoom in/out |
| `Escape` | Close modal |

---

## API Access

CodeFlow supports two remote access modes:

- Direct browser-to-Forgejo API calls
- TrueNAS reverse-proxy access through `/forgejo-api`

### Authentication Methods

#### Server Auth
- Intended for the TrueNAS deployment in `deploy/truenas/`
- nginx injects the Forgejo token on proxied `/forgejo-api` requests
- The browser never sees the token

#### Forgejo Access Token
1. Create a Forgejo access token with repository read access
2. Paste it in the Token field
3. Analyze your private repos

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   CodeFlow                      │
├─────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Parser  │  │ Forgejo  │  │    D3    │       │
│  │  Module  │  │   API    │  │  Graph   │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│        │              │              │          │
│        └──────────────┼──────────────┘          │
│                       │                         │
│              ┌────────▼────────┐                │
│              │   React App     │                │
│              │  (Single File)  │                │
│              └─────────────────┘                │
└─────────────────────────────────────────────────┘
```

**Zero dependencies to install.** Everything runs from CDNs:
- React 18
- D3.js 7
- Babel (for JSX)

---

## Contributing

We love contributions! Here's how:

1. Fork the repo
2. Make your changes to `index.html`
3. Test locally (just open in browser)
4. Submit a PR

### Ideas for Contributions
- [ ] Add support for more languages
- [ ] Improve function extraction regex
- [ ] Add more design pattern detection
- [ ] Export to different formats (PNG, PDF)
- [ ] Add code complexity metrics

---

## FAQ

**Q: How does it work without a backend?**
> CodeFlow runs entirely in your browser. It calls the Forgejo API directly from your browser and processes everything client-side.

**Q: Is my code safe?**
> Yes. Your code is fetched directly from Forgejo to your browser. Nothing is sent to any server we control. Check the source — it's one file!

**Q: Can I use it offline?**
> Yes! With the new Local Files feature, you can analyze code from your computer without any internet connection. Just click the "📁 Local Files" button and select your files. All processing happens entirely in your browser.

**Q: Why is analysis slow?**
> We make individual API calls for each file to get content. With a token, you get higher rate limits and faster analysis.

**Q: How accurate is the dependency analysis?**
> It's based on function name matching, so it may miss some dynamic imports or renamed imports. It's designed for a quick overview, not 100% accuracy.

---

## Star History

If you find CodeFlow useful, please ⭐ the repo!

---

## License

MIT License — use it however you want.

---

<div align="center">

**Built with ⚡ by developers, for developers**

*Stop guessing. Start seeing.*

</div>
