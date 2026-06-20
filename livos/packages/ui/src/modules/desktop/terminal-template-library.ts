// Phase 290 R3 (REQ4) — professional terminal-command template library.
//
// Powers the Add Shortcut → Terminal tab's "More templates" library: a
// searchable, category-grouped, A-Z-sortable grid of ready-to-run terminal
// commands. Clicking a row pre-fills the command/name editor (clearing any
// server `templateId`) → "Add" creates a plain terminal shortcut.
//
// Pure data — NO React, NO side effects. A LATER agent imports
// `TERMINAL_TEMPLATE_LIBRARY` into add-shortcut-dialog.tsx.
//
// ⛔ SAFETY (REQ4 / M5): every `command` is COMPLETE, SAFE and runnable. For
// interactive tools it's the BARE launch (no flags). NEVER a destructive or
// guard-off command — no `rm -rf`, no `--dangerously-skip-permissions`, no
// `--yolo`, no `--force` deletes. The Terminal runs in the user's own PTY with
// no privilege escalation; these are convenience launchers, not a shell.
//
// ⛔ ICONS (REQ4 / M4): `iconSlug` is a homarr-labs/dashboard-icons slug,
// rendered via the jsDelivr CDN
// (https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/<iconSlug>.svg) —
// the SAME CDN the working v44.52 web-app grid uses (proven CSP-allowed). Do NOT
// use cdn.simpleicons.org (CSP-blocked). Slugs were verified against the
// dashboard-icons tree; tools without a dedicated icon fall back to the nearest
// present slug (`terminal`, `linux`, `git`, `gnu`, …) and the dialog's
// `<img onError>` swaps in the bundled `/figma-exports/dock-terminal.svg`.

export type TerminalTemplateCategory =
	| 'AI'
	| 'Dev'
	| 'Git'
	| 'System'
	| 'Network'
	| 'Files'
	| 'Monitoring'
	| 'Docker'
	| 'Database'
	| 'Editor'
	| 'Cloud'
	| 'Fun'

export type TerminalTemplateLibraryEntry = {
	/** Human label shown on the card (unique; the list is A-Z sortable by this). */
	name: string
	/** COMPLETE, SAFE, runnable command pre-filled into the editor (bare launch for interactive tools). */
	command: string
	/** Grouping for the library's category chips. */
	category: TerminalTemplateCategory
	/** One-line description shown under the command. */
	description: string
	/** dashboard-icons slug → https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/<iconSlug>.svg */
	iconSlug: string
}

const CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg'

/** Build the icon URL for a library entry's `iconSlug`. */
export function terminalTemplateIconUrl(entry: {iconSlug: string}): string {
	return `${CDN}/${entry.iconSlug}.svg`
}

export const TERMINAL_TEMPLATE_CATEGORIES: ReadonlyArray<TerminalTemplateCategory> = [
	'AI',
	'Dev',
	'Git',
	'System',
	'Network',
	'Files',
	'Monitoring',
	'Docker',
	'Database',
	'Editor',
	'Cloud',
	'Fun',
]

// 100+ entries. Every `command` is a bare/safe launch (M5). `iconSlug` uses a
// real dashboard-icons slug where one exists, else the nearest present slug
// (terminal/linux/git/gnu/docker-compose) — the dialog's onError covers 404s.
export const TERMINAL_TEMPLATE_LIBRARY: ReadonlyArray<TerminalTemplateLibraryEntry> = [
	// ── AI CLIs ──────────────────────────────────────────────────────────────────
	{name: 'Claude Code', command: 'claude', category: 'AI', description: 'Anthropic Claude Code agentic CLI (interactive).', iconSlug: 'claude-ai'},
	{name: 'Codex', command: 'codex', category: 'AI', description: 'OpenAI Codex CLI — run `codex exec` for non-interactive tasks.', iconSlug: 'codex'},
	{name: 'OpenCode', command: 'opencode', category: 'AI', description: 'OpenCode terminal agent (interactive).', iconSlug: 'terminal'},
	{name: 'Gemini', command: 'gemini', category: 'AI', description: 'Google Gemini CLI — use -p "…" for a one-shot prompt.', iconSlug: 'google-gemini'},
	{name: 'aider', command: 'aider', category: 'AI', description: 'aider AI pair programmer (add files / models as needed).', iconSlug: 'terminal'},
	{name: 'Ollama Run', command: 'ollama run llama3', category: 'AI', description: 'Chat with a local Llama 3 model via Ollama.', iconSlug: 'ollama'},
	{name: 'Ollama List', command: 'ollama list', category: 'AI', description: 'List locally installed Ollama models.', iconSlug: 'ollama'},
	{name: 'Ollama Serve', command: 'ollama serve', category: 'AI', description: 'Start the Ollama model server in the foreground.', iconSlug: 'ollama'},

	// ── Dev / runtimes ───────────────────────────────────────────────────────────
	{name: 'Node REPL', command: 'node', category: 'Dev', description: 'Start an interactive Node.js REPL.', iconSlug: 'nodejs'},
	{name: 'Node Version', command: 'node --version', category: 'Dev', description: 'Print the installed Node.js version.', iconSlug: 'nodejs'},
	{name: 'npm Install', command: 'npm install', category: 'Dev', description: 'Install dependencies for the current project.', iconSlug: 'npm'},
	{name: 'npm Run Dev', command: 'npm run dev', category: 'Dev', description: 'Run the project\'s dev script.', iconSlug: 'npm'},
	{name: 'pnpm Install', command: 'pnpm install', category: 'Dev', description: 'Install dependencies with pnpm.', iconSlug: 'npm'},
	{name: 'Yarn Install', command: 'yarn install', category: 'Dev', description: 'Install dependencies with Yarn.', iconSlug: 'npm'},
	{name: 'Python REPL', command: 'python3', category: 'Dev', description: 'Start an interactive Python 3 interpreter.', iconSlug: 'python'},
	{name: 'Python Version', command: 'python3 --version', category: 'Dev', description: 'Print the installed Python 3 version.', iconSlug: 'python'},
	{name: 'pip List', command: 'pip3 list', category: 'Dev', description: 'List installed Python packages.', iconSlug: 'python'},
	{name: 'Deno REPL', command: 'deno', category: 'Dev', description: 'Start the Deno interactive REPL.', iconSlug: 'deno'},
	{name: 'Bun REPL', command: 'bun repl', category: 'Dev', description: 'Start the Bun JavaScript REPL.', iconSlug: 'bun'},
	{name: 'Cargo Build', command: 'cargo build', category: 'Dev', description: 'Compile the current Rust project.', iconSlug: 'rust'},
	{name: 'Cargo Run', command: 'cargo run', category: 'Dev', description: 'Build and run the current Rust project.', iconSlug: 'rust'},
	{name: 'Go Run', command: 'go run .', category: 'Dev', description: 'Compile and run the Go package in the current directory.', iconSlug: 'go'},
	{name: 'Go Version', command: 'go version', category: 'Dev', description: 'Print the installed Go toolchain version.', iconSlug: 'go'},
	{name: 'Ruby IRB', command: 'irb', category: 'Dev', description: 'Start the interactive Ruby shell.', iconSlug: 'ruby'},
	{name: 'PHP REPL', command: 'php -a', category: 'Dev', description: 'Start the interactive PHP shell.', iconSlug: 'php'},
	{name: 'TypeScript Init', command: 'tsc --init', category: 'Dev', description: 'Create a tsconfig.json in the current directory.', iconSlug: 'typescript'},
	{name: 'Make', command: 'make', category: 'Dev', description: 'Run the default target in the local Makefile.', iconSlug: 'gnu'},

	// ── Git ──────────────────────────────────────────────────────────────────────
	{name: 'Git Status', command: 'git status', category: 'Git', description: 'Show the working tree status.', iconSlug: 'git'},
	{name: 'Git Log Graph', command: 'git log --oneline --graph --decorate --all', category: 'Git', description: 'Compact, decorated commit graph of all branches.', iconSlug: 'git'},
	{name: 'Git Diff', command: 'git diff', category: 'Git', description: 'Show unstaged changes in the working tree.', iconSlug: 'git'},
	{name: 'Git Pull', command: 'git pull', category: 'Git', description: 'Fetch and integrate changes from the remote.', iconSlug: 'git'},
	{name: 'Git Branch', command: 'git branch -a', category: 'Git', description: 'List all local and remote branches.', iconSlug: 'git'},
	{name: 'lazygit', command: 'lazygit', category: 'Git', description: 'Full-screen terminal UI for Git.', iconSlug: 'git'},
	{name: 'tig', command: 'tig', category: 'Git', description: 'Text-mode interface for browsing Git history.', iconSlug: 'git'},

	// ── System ───────────────────────────────────────────────────────────────────
	{name: 'htop', command: 'htop', category: 'System', description: 'Interactive process viewer and system monitor.', iconSlug: 'linux'},
	{name: 'btop', command: 'btop', category: 'System', description: 'Modern resource monitor for processes, CPU, memory and disks.', iconSlug: 'btop'},
	{name: 'Disk Free', command: 'df -h', category: 'System', description: 'Show disk space usage in human-readable units.', iconSlug: 'linux'},
	{name: 'Directory Usage', command: 'du -sh *', category: 'System', description: 'Summarize the size of each item in the current directory.', iconSlug: 'linux'},
	{name: 'Free Memory', command: 'free -h', category: 'System', description: 'Show free and used memory in human-readable units.', iconSlug: 'linux'},
	{name: 'neofetch', command: 'neofetch', category: 'System', description: 'Display a system info summary with an ASCII logo.', iconSlug: 'linux'},
	{name: 'uptime', command: 'uptime', category: 'System', description: 'Show how long the system has been running and load averages.', iconSlug: 'linux'},
	{name: 'Process List', command: 'ps aux', category: 'System', description: 'List all running processes with detailed columns.', iconSlug: 'linux'},
	{name: 'Kernel Info', command: 'uname -a', category: 'System', description: 'Print kernel name, version and machine details.', iconSlug: 'linux'},
	{name: 'Environment', command: 'env', category: 'System', description: 'Print the current environment variables.', iconSlug: 'gnu'},
	{name: 'System Journal', command: 'journalctl -f', category: 'System', description: 'Follow the systemd journal live (Ctrl-C to stop).', iconSlug: 'linux'},
	{name: 'Kernel Messages', command: 'dmesg --human --color=always | less -R', category: 'System', description: 'Browse kernel ring-buffer messages with color.', iconSlug: 'linux'},
	{name: 'Watch Command', command: 'watch -n 2 date', category: 'System', description: 'Re-run a command every 2 seconds (example: date).', iconSlug: 'gnu'},

	// ── Network ──────────────────────────────────────────────────────────────────
	{name: 'Ping', command: 'ping 1.1.1.1', category: 'Network', description: 'Test reachability of a host (Ctrl-C to stop).', iconSlug: 'cloudflare'},
	{name: 'cURL Fetch', command: 'curl -fsSL https://example.com', category: 'Network', description: 'Fetch a URL and print the response body.', iconSlug: 'terminal'},
	{name: 'Socket Stats', command: 'ss -tulpn', category: 'Network', description: 'List listening TCP/UDP sockets with processes.', iconSlug: 'linux'},
	{name: 'IP Address', command: 'ip address show', category: 'Network', description: 'Show network interfaces and their IP addresses.', iconSlug: 'linux'},
	{name: 'IP Routes', command: 'ip route show', category: 'Network', description: 'Display the kernel routing table.', iconSlug: 'linux'},
	{name: 'nmap Scan', command: 'nmap -sV localhost', category: 'Network', description: 'Scan localhost and detect service versions.', iconSlug: 'terminal'},
	{name: 'DNS Lookup', command: 'dig example.com', category: 'Network', description: 'Query DNS records for a domain.', iconSlug: 'cloudflare'},
	{name: 'Traceroute', command: 'traceroute 1.1.1.1', category: 'Network', description: 'Trace the network path to a host.', iconSlug: 'terminal'},
	{name: 'Public IP', command: 'curl -fsSL https://ifconfig.me', category: 'Network', description: 'Print your current public IP address.', iconSlug: 'terminal'},
	{name: 'Wireshark TUI', command: 'tshark', category: 'Network', description: 'Capture and dump network packets in the terminal.', iconSlug: 'wireshark'},

	// ── Files ────────────────────────────────────────────────────────────────────
	{name: 'List Files', command: 'ls -alh', category: 'Files', description: 'List all files with sizes and permissions.', iconSlug: 'linux'},
	{name: 'Tree', command: 'tree -L 2', category: 'Files', description: 'Show a directory tree two levels deep.', iconSlug: 'tree'},
	{name: 'ncdu', command: 'ncdu', category: 'Files', description: 'Interactive disk-usage explorer.', iconSlug: 'linux'},
	{name: 'Find (fd)', command: 'fd .', category: 'Files', description: 'Fast, friendly alternative to find.', iconSlug: 'terminal'},
	{name: 'Ripgrep', command: 'rg --hidden --glob "!.git"', category: 'Files', description: 'Recursively search file contents with ripgrep.', iconSlug: 'terminal'},
	{name: 'bat', command: 'bat', category: 'Files', description: 'cat clone with syntax highlighting and paging.', iconSlug: 'bat'},
	{name: 'fzf', command: 'fzf', category: 'Files', description: 'Interactive fuzzy finder over stdin / files.', iconSlug: 'terminal'},
	{name: 'rsync', command: 'rsync -avh ./ ./backup/', category: 'Files', description: 'Mirror the current directory into ./backup (additive).', iconSlug: 'rclone'},
	{name: 'Tail File', command: 'tail -f /var/log/syslog', category: 'Files', description: 'Follow appended lines of a log file live.', iconSlug: 'linux'},

	// ── Monitoring ───────────────────────────────────────────────────────────────
	{name: 'glances', command: 'glances', category: 'Monitoring', description: 'Cross-platform all-in-one system monitor.', iconSlug: 'glances'},
	{name: 'CPU Watch', command: 'watch -n 1 "grep MHz /proc/cpuinfo"', category: 'Monitoring', description: 'Watch live per-core CPU frequencies.', iconSlug: 'linux'},
	{name: 'Memory Watch', command: 'watch -n 2 free -h', category: 'Monitoring', description: 'Refresh memory usage every 2 seconds.', iconSlug: 'linux'},
	{name: 'I/O Stats', command: 'iostat -x 2', category: 'Monitoring', description: 'Report extended disk I/O statistics every 2 seconds.', iconSlug: 'grafana'},
	{name: 'Network Watch', command: 'watch -n 2 "ss -s"', category: 'Monitoring', description: 'Watch live socket summary statistics.', iconSlug: 'prometheus'},
	{name: 'Sensors', command: 'watch -n 2 sensors', category: 'Monitoring', description: 'Monitor hardware temperatures and fan speeds.', iconSlug: 'netdata'},

	// ── Docker ───────────────────────────────────────────────────────────────────
	{name: 'Docker PS', command: 'docker ps', category: 'Docker', description: 'List running Docker containers.', iconSlug: 'docker'},
	{name: 'Docker PS All', command: 'docker ps -a', category: 'Docker', description: 'List all containers, including stopped ones.', iconSlug: 'docker'},
	{name: 'Docker Images', command: 'docker images', category: 'Docker', description: 'List local Docker images.', iconSlug: 'docker'},
	{name: 'Docker Stats', command: 'docker stats', category: 'Docker', description: 'Live resource usage of running containers.', iconSlug: 'docker'},
	{name: 'Docker Logs', command: 'docker logs -f --tail 100 <container>', category: 'Docker', description: 'Follow a container\'s logs (replace <container>).', iconSlug: 'docker'},
	{name: 'Compose Up', command: 'docker compose up -d', category: 'Docker', description: 'Start the compose project in the background.', iconSlug: 'docker-compose'},
	{name: 'Compose Logs', command: 'docker compose logs -f', category: 'Docker', description: 'Follow logs for the compose project.', iconSlug: 'docker-compose'},
	{name: 'Compose PS', command: 'docker compose ps', category: 'Docker', description: 'List services in the current compose project.', iconSlug: 'docker-compose'},
	{name: 'lazydocker', command: 'lazydocker', category: 'Docker', description: 'Full-screen terminal UI for Docker and compose.', iconSlug: 'docker'},
	{name: 'ctop', command: 'ctop', category: 'Docker', description: 'top-like interface for container metrics.', iconSlug: 'docker'},
	{name: 'dozzle', command: 'dozzle', category: 'Docker', description: 'Real-time log viewer for Docker containers.', iconSlug: 'dozzle'},

	// ── Database ─────────────────────────────────────────────────────────────────
	{name: 'psql', command: 'psql', category: 'Database', description: 'Open the PostgreSQL interactive terminal.', iconSlug: 'postgresql'},
	{name: 'redis-cli', command: 'redis-cli', category: 'Database', description: 'Connect to a Redis server interactively.', iconSlug: 'redis'},
	{name: 'sqlite3', command: 'sqlite3', category: 'Database', description: 'Open the SQLite interactive shell.', iconSlug: 'terminal'},
	{name: 'MySQL', command: 'mysql -u root -p', category: 'Database', description: 'Connect to MySQL as root (prompts for a password).', iconSlug: 'mysql'},
	{name: 'MariaDB', command: 'mariadb -u root -p', category: 'Database', description: 'Connect to MariaDB as root (prompts for a password).', iconSlug: 'mariadb'},
	{name: 'MongoDB Shell', command: 'mongosh', category: 'Database', description: 'Open the MongoDB shell (mongosh).', iconSlug: 'mongodb'},

	// ── Editor ───────────────────────────────────────────────────────────────────
	{name: 'Vim', command: 'vim', category: 'Editor', description: 'Open the Vim text editor.', iconSlug: 'terminal'},
	{name: 'Neovim', command: 'nvim', category: 'Editor', description: 'Open the Neovim text editor.', iconSlug: 'terminal'},
	{name: 'nano', command: 'nano', category: 'Editor', description: 'Open the GNU nano text editor.', iconSlug: 'gnu'},
	{name: 'micro', command: 'micro', category: 'Editor', description: 'Open the micro modern terminal editor.', iconSlug: 'terminal'},
	{name: 'Emacs (TUI)', command: 'emacs -nw', category: 'Editor', description: 'Open Emacs in the terminal (no window).', iconSlug: 'emacs'},

	// ── Cloud ────────────────────────────────────────────────────────────────────
	{name: 'AWS CLI', command: 'aws sts get-caller-identity', category: 'Cloud', description: 'Show the AWS identity for the current credentials.', iconSlug: 'amazon-web-services'},
	{name: 'gcloud Info', command: 'gcloud info', category: 'Cloud', description: 'Show the active gcloud configuration and account.', iconSlug: 'google-cloud-platform'},
	{name: 'kubectl Pods', command: 'kubectl get pods -A', category: 'Cloud', description: 'List pods across all namespaces.', iconSlug: 'kubernetes'},
	{name: 'kubectl Nodes', command: 'kubectl get nodes', category: 'Cloud', description: 'List cluster nodes and their status.', iconSlug: 'kubernetes'},
	{name: 'k9s', command: 'k9s', category: 'Cloud', description: 'Full-screen terminal UI for Kubernetes.', iconSlug: 'kubernetes'},
	{name: 'Terraform Plan', command: 'terraform plan', category: 'Cloud', description: 'Preview infrastructure changes (no apply).', iconSlug: 'terraform'},
	{name: 'Terraform Init', command: 'terraform init', category: 'Cloud', description: 'Initialize a Terraform working directory.', iconSlug: 'terraform'},
	{name: 'Helm List', command: 'helm list -A', category: 'Cloud', description: 'List Helm releases across all namespaces.', iconSlug: 'helm'},
	{name: 'Ansible Ping', command: 'ansible all -m ping', category: 'Cloud', description: 'Ping all hosts in the Ansible inventory.', iconSlug: 'ansible'},

	// ── Fun ──────────────────────────────────────────────────────────────────────
	{name: 'cmatrix', command: 'cmatrix', category: 'Fun', description: 'The Matrix digital-rain effect in your terminal.', iconSlug: 'terminal'},
	{name: 'Steam Locomotive', command: 'sl', category: 'Fun', description: 'A steam locomotive chugs across the screen.', iconSlug: 'terminal'},
	{name: 'cowsay', command: 'cowsay Hello from LivOS', category: 'Fun', description: 'An ASCII cow says your message.', iconSlug: 'terminal'},
	{name: 'fortune', command: 'fortune', category: 'Fun', description: 'Print a random witty fortune-cookie message.', iconSlug: 'terminal'},
	{name: 'Fortune Cow', command: 'fortune | cowsay', category: 'Fun', description: 'A random fortune, delivered by an ASCII cow.', iconSlug: 'terminal'},
]
