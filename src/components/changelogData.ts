import { Database, GitBranch, History, TerminalSquare, Sliders, Shield, Sparkles, Keyboard, Layers, ListOrdered, FolderTree, Send, ScrollText } from 'lucide-react';
import React from 'react';

export interface ChangeEntry {
  type: 'feat' | 'fix' | 'improve' | 'core';
  text: string;
}

export interface ChangeGroup {
  label: string;
  icon: React.ComponentType<any>;
  color: string;
  items: ChangeEntry[];
}

export interface ChangelogVersion {
  version: string;
  codename: string;
  date: string;
  summary: string;
  groups: ChangeGroup[];
}

export const CHANGELOG: ChangelogVersion[] = [
  {
    version: '2.11.1',
    codename: 'Relay',
    date: '2026-10-23',
    summary:
      'Serop can now update itself. When a new version is out you get a box with Update now or Later, and Update now downloads and installs it, so there is no more going to GitHub to download. Mac downloads are now signed and notarized by Apple, so macOS no longer says the app is damaged.',
    groups: [
      {
        label: 'Updates',
        icon: Sparkles,
        color: '#7dd3fc',
        items: [
          { type: 'feat', text: 'Update from inside the app: when a new version is out, a box asks Update now or Later. Update now downloads it with a progress bar and restarts Serop in the new version. It works from 2.11.0 onward; older versions need one last manual download.' },
          { type: 'feat', text: 'Choose Later and a small "Update available" button stays in the top corner. Click it whenever you are ready.' },
          { type: 'improve', text: 'The update box shows what changed. Release notes now list the real changes, not just a commit number.' },
        ],
      },
      {
        label: 'Mac',
        icon: Shield,
        color: '#86efac',
        items: [
          { type: 'fix', text: 'Mac downloads are signed and notarized by Apple, so macOS opens Serop with a double-click and no "app is damaged" warning.' },
        ],
      },
    ],
  },
  {
    version: '2.10.0',
    codename: 'Chronicle',
    date: '2026-10-23',
    summary:
      'The API Tester now imports Postman collections and environments, runs their scripts and tests, and can run a whole collection in order. A new Logs tab tails containers, services and log files in one colour-coded stream, and you can click an ID to follow a request across all of them.',
    groups: [
      {
        label: 'API Tester',
        icon: Send,
        color: '#7dd3fc',
        items: [
          { type: 'feat', text: 'Import from Postman: paste a collection or environment JSON, or choose the files (several at once, or drop them on the list). Folders, inherited login and collection variables come across.' },
          { type: 'feat', text: 'Variables: pick an environment next to Send and use {{name}} in the URL, params, headers, body and login. A line under the URL shows the final address and warns about any variable that has no value. {{$timestamp}}, {{$guid}} and {{$randomInt}} work too.' },
          { type: 'feat', text: 'Postman scripts and tests run: pm.test, pm.expect, pm.response.json(), pm.environment.set and pm.collectionVariables.set. Results show in new Tests and Console tabs. Scripts run in a sandbox, so a collection cannot reach your servers or files.' },
          { type: 'feat', text: 'Run a whole collection or folder with the play button. Requests go in order, variables such as a login token pass to the next one, and you see pass or fail, status and time for each, with a Stop button.' },
          { type: 'feat', text: 'Make your own collections, add the open request to one, rename them, and export a collection or an environment as a Postman file. Deleting a collection, request or environment now asks first.' },
          { type: 'feat', text: 'Copy as curl: one button copies the request as a curl command with the variables filled in.' },
        ],
      },
      {
        label: 'Logs',
        icon: ScrollText,
        color: '#fbbf24',
        items: [
          { type: 'feat', text: 'New Logs tab. Tick containers, running services and log files such as nginx, or add any file path, and their lines stream into one view with a coloured label per source. It only reads: it never changes anything on the server.' },
          { type: 'feat', text: 'Colour and highlighting: errors in red, warnings in amber, debug dimmed. HTTP status codes get badges (5xx red, 4xx amber, 2xx green), timestamps are dimmed and your search words are highlighted.' },
          { type: 'feat', text: 'Search with an optional regex, hide noisy lines such as health checks, switch levels and sources on or off, pause, clear, and save what you see to a file.' },
          { type: 'feat', text: 'Click any request ID, order ID, UUID or IP address to follow it across every source at once.' },
          { type: 'improve', text: 'Stack traces fold under the line that started them, so one error is one row. Click the arrow to open it.' },
        ],
      },
    ],
  },
  {
    version: '2.9.0',
    codename: 'Courier',
    date: '2026-10-19',
    summary:
      'A new API Tester tab works like Postman: send a request to any URL, public or on your own computer, and read the response. Paste a curl command to fill it in, and let Serop find the web apps running on your server.',
    groups: [
      {
        label: 'API Tester',
        icon: Send,
        color: '#7dd3fc',
        items: [
          { type: 'feat', text: 'New API Tester tab. Pick GET, POST, PUT, PATCH, DELETE and more, type a URL (public, or localhost for an app on your computer) and see the status, time, size and a formatted response.' },
          { type: 'feat', text: 'Paste a curl command into the URL box and Serop fills in the method, URL, headers, body and login for you. Chrome\'s Copy as cURL works too.' },
          { type: 'feat', text: 'Add query params, headers, a JSON or text body, and a token or username and password. Save requests to the list on the left to run them again.' },
          { type: 'feat', text: 'Find APIs on your server: one button lists the web apps running on the connected server, named by Docker container or program and marked Public or Private. Click one to fill in its URL. Databases, mail and SSH ports are skipped.' },
          { type: 'improve', text: 'Errors are in plain words, such as nothing listening on that port or host not found. For a self-signed HTTPS certificate you can choose Allow untrusted certificate.' },
        ],
      },
    ],
  },
  {
    version: '2.8.0',
    codename: 'Countdown',
    date: '2026-10-15',
    summary:
      'Scheduled commands now show a live toast: a countdown to the start, then the job\'s output as it runs, then the result with its exit code. You can cancel a schedule before it starts or stop a running job. Multi-line shortcuts now schedule correctly, and the date and time picker is easier to use.',
    groups: [
      {
        label: 'Scheduled commands',
        icon: History,
        color: '#f0abfc',
        items: [
          { type: 'fix', text: 'Shortcuts with several lines, or with quotes or a % sign, broke the schedule, and Serop still said Scheduled. They now schedule correctly, and an install that fails shows its error.' },
          { type: 'feat', text: 'A toast counts down to the start of a scheduled command, then shows its output as it runs (refreshed every 2 seconds) and ends with finished or failed and the exit code.' },
          { type: 'feat', text: 'Stop a running scheduled command from the toast or the sidebar, or cancel a schedule from the toast before it starts.' },
          { type: 'feat', text: 'Started, finished and failed notifications arrive as a toast, a bell entry and a system notification, from whichever screen you are on. If a job is still waiting in cron two minutes after its time, you are told to check that cron is running.' },
          { type: 'fix', text: 'Cron fires on the server\'s clock, so on a server in another timezone a job ran hours late. The server now converts the time you picked, and times show in 12-hour form.' },
          { type: 'improve', text: 'The date and time picker has a solid background and typed hour and minute boxes with an AM/PM switch, so any minute can be chosen.' },
        ],
      },
    ],
  },
  {
    version: '2.7.2',
    codename: 'Clockwork',
    date: '2026-10-15',
    summary:
      'Scheduled commands now fire at the time you picked even when the server is in another timezone, and Serop shows the real error when the job could not be installed.',
    groups: [
      {
        label: 'Scheduled commands',
        icon: History,
        color: '#f0abfc',
        items: [
          { type: 'fix', text: 'Cron runs on the server\'s clock, so on a server in UTC a time picked in your timezone fired hours late. The server now converts the exact moment you picked into its own time. Cancel and schedule existing jobs again to get the fix.' },
          { type: 'fix', text: 'A failed crontab install still showed Scheduled. It now shows the error, for example when crontab is missing on the server.' },
        ],
      },
    ],
  },
  {
    version: '2.7.1',
    codename: 'Right on Time',
    date: '2026-10-15',
    summary:
      'Scheduled commands now really run: they start in your project folder with a full PATH, and the date and time picker matches the app theme. A single deploy shortcut runs in the deploy terminal.',
    groups: [
      {
        label: 'Scheduled commands',
        icon: History,
        color: '#f0abfc',
        items: [
          { type: 'fix', text: 'Scheduled commands ran from the home folder with a bare PATH, so project commands such as docker compose or ./deploy.sh failed without any message. They now start in your project folder with the usual tool folders on PATH, and a % in a command no longer cuts it short. Schedule existing jobs again to get the fix.' },
          { type: 'feat', text: 'A built-in date and time picker replaces the white browser one, with a calendar, hour and minute buttons and AM/PM, in the app theme.' },
        ],
      },
      {
        label: 'Deploy',
        icon: GitBranch,
        color: '#4ec9b0',
        items: [
          { type: 'improve', text: 'Running a single shortcut now shows in the deploy terminal. The deploy panel in the corner only appears when runs overlap.' },
        ],
      },
    ],
  },
  {
    version: '2.7.0',
    codename: 'Full Spectrum',
    date: '2026-10-14',
    summary:
      'Terminals come in full colour and gain search, clickable links and split view. Jump to any file with Cmd/Ctrl+P, drag files onto the file tree to upload them, and preview images and PDFs. A new Git tab shows what is on the server, the database editor keeps your query history, and a notification centre keeps deploy results.',
    groups: [
      {
        label: 'Terminal',
        icon: TerminalSquare,
        color: '#4ec9b0',
        items: [
          { type: 'fix', text: 'Terminals on servers had no colours, because Serop opened them as a plain vt100 terminal. They now open as a full 256-colour terminal, with a colour palette that follows your theme.' },
          { type: 'feat', text: 'When the server\'s prompt has no colours of its own, the session gets a coloured prompt and coloured ls and grep. Custom prompts such as Ubuntu\'s, oh-my-zsh or starship are left alone, and nothing on the server is changed.' },
          { type: 'fix', text: 'Resizing the terminal panel never reached the server, so long lines and full-screen tools wrapped at 80 columns. The server now always knows the real size.' },
          { type: 'feat', text: 'Search the terminal with Cmd/Ctrl+F, with a match count, next and previous, and a match-case toggle.' },
          { type: 'feat', text: 'Links in terminal output open in your browser. Icons from tools like eza and lsd show when a Nerd Font is installed.' },
          { type: 'feat', text: 'Split view shows two terminals side by side. Rename a terminal tab by double-clicking it or pressing F2.' },
        ],
      },
      {
        label: 'Files',
        icon: FolderTree,
        color: '#fbbf24',
        items: [
          { type: 'feat', text: 'Go to any file on the server with Cmd/Ctrl+P (File, Go to File). It matches as you type, skips folders like node_modules, and lists recent files.' },
          { type: 'feat', text: 'Drag files from Finder or Explorer onto the file tree to upload them into that folder. On a production server you confirm with its name first.' },
          { type: 'feat', text: 'Images and PDFs open as a preview. A path bar above the editor shows where the file is, reveals its folders in the tree and copies the full path.' },
          { type: 'fix', text: 'Binary files opened as base64 text, and saving them would have overwritten the real file. They now show a preview or a download button and cannot be saved as text.' },
        ],
      },
      {
        label: 'Git',
        icon: GitBranch,
        color: '#34d399',
        items: [
          { type: 'feat', text: 'A Git tab in Deploy shows the server\'s branch, how far it is ahead of or behind upstream, uncommitted changes with their diffs, and recent commits with their patches.' },
          { type: 'feat', text: 'Fetch, pull (fast-forward only), stash all changes, or discard the changes to one file. Risky actions ask first, and production servers ask for their name.' },
        ],
      },
      {
        label: 'Database',
        icon: Database,
        color: '#93c5fd',
        items: [
          { type: 'feat', text: 'Select part of the SQL to run only that part, and run with Cmd/Ctrl+Enter.' },
          { type: 'feat', text: 'Every query you run is kept in History for that server and database, with row counts, timings and failures. Save queries you use often by name.' },
        ],
      },
      {
        label: 'Notifications',
        icon: Sparkles,
        color: '#f0abfc',
        items: [
          { type: 'feat', text: 'A bell in the title bar keeps finished, failed and cancelled deploys and connection problems, even after a restart. Click a deploy to open its output again.' },
        ],
      },
    ],
  },
  {
    version: '2.6.0',
    codename: 'Red Ink',
    date: '2026-10-13',
    summary:
      'Mark your production servers so they show in red and ask you to type their name before anything risky runs. Deploys now really run in the background, with a live panel that follows them on every screen and a system notification when they finish. The editor keeps each file\'s undo history, highlights server files and gains a status bar, and copy and paste work on Mac again. The server sidebar is reworked too.',
    groups: [
      {
        label: 'Production mode',
        icon: Shield,
        color: '#f87171',
        items: [
          { type: 'feat', text: 'Mark any server as production from its settings, or with the shield button on its row in the sidebar. You turn it on and off yourself, and turning it off asks you to type the server name.' },
          { type: 'feat', text: 'On a production server, risky actions ask you to type its name before they run: deploy, rollback, Docker kill and remove, firewall changes, database wipe and import, deleting rows and files, stopping nginx, and removing the server.' },
          { type: 'improve', text: 'Production servers are marked in red: a line under the title bar with a Production badge, red server tabs, and red cards on the Servers page and in the deploy panel.' },
        ],
      },
      {
        label: 'Live deploys',
        icon: GitBranch,
        color: '#34d399',
        items: [
          { type: 'fix', text: 'Deploys started from a .serop shortcut still stopped when you switched servers, because the background part of 2.5.1 was not finished. They now run in the background and keep going whatever screen or server you are on.' },
          { type: 'feat', text: 'A deploy panel in the bottom-right corner shows every running deploy with its server, a timer and live output, on every screen. Expand it to read the last 300 lines, or cancel a shortcut deploy.' },
          { type: 'feat', text: 'The Git deploy shows in the panel too, so its output is no longer lost when the terminal closes.' },
          { type: 'feat', text: 'When a deploy ends while Serop is in the background, you get a system notification. Click it to open that deploy\'s output.' },
          { type: 'fix', text: 'A long deploy no longer loses its SSH connection to the 5-minute idle timeout.' },
        ],
      },
      {
        label: 'Editor',
        icon: Keyboard,
        color: '#fbbf24',
        items: [
          { type: 'fix', text: 'Switching tabs reset the editor, so undo history, the cursor and the scroll position were lost. Each file now keeps them, and undo still works after you leave the Files view and come back.' },
          { type: 'feat', text: 'Highlighting for the files you edit on servers: nginx configs (including sites-available files with no extension), .env files, systemd units, INI and TOML, Dockerfiles, shell dotfiles and many more languages.' },
          { type: 'feat', text: 'Log files are highlighted too: timestamps, errors, warnings and IP addresses each get their own colour.' },
          { type: 'improve', text: 'The editor uses your Serop theme\'s colours, including custom themes, instead of a fixed dark or light theme.' },
          { type: 'feat', text: 'A status bar under the editor shows the line and column, indentation, line endings and language, with word wrap and minimap toggles. Change any of them from there.' },
          { type: 'feat', text: 'Shell scripts, .env files and similar files with Windows (CRLF) line endings get a warning, because they can break on a Linux server, and a one-click Convert to LF.' },
          { type: 'fix', text: 'On macOS, paste did not work anywhere, and copy, cut, undo and select all were unreliable in the editor and the terminal. They now work in the editor, the terminal and text fields, from the keyboard and from the Edit menu.' },
        ],
      },
      {
        label: 'Server sidebar',
        icon: Layers,
        color: '#93c5fd',
        items: [
          { type: 'improve', text: 'Production servers are grouped at the top. Each server shows its connection type, whether it is open in a tab, and a Deploying indicator while a deploy runs on it.' },
          { type: 'improve', text: 'A search box appears once you have more than five servers, and the row buttons can be reached with the keyboard.' },
          { type: 'fix', text: 'Removing a server from the sidebar deleted it straight away. It now asks first.' },
        ],
      },
    ],
  },
  {
    version: '2.5.1',
    codename: 'Background deploys',
    date: '2026-10-13',
    summary:
      'Deploys and .serop shortcuts now run in the background, so they keep going when you switch screens. A new Background jobs list and pop-up notices show what is running and how it ended.',
    groups: [
      {
        label: 'Background deploys',
        icon: GitBranch,
        color: '#34d399',
        items: [
          { type: 'fix', text: 'Deploys started from a .serop shortcut now run as background jobs instead of inside the terminal, so navigating to another screen no longer stops them.' },
          { type: 'improve', text: 'If a background job cannot start, Serop falls back to running the command in the terminal.' },
        ],
      },
      {
        label: 'Background jobs',
        icon: ListOrdered,
        color: '#93c5fd',
        items: [
          { type: 'feat', text: 'The Deploy view lists your background jobs, refreshes them automatically, and lets you cancel a running job.' },
          { type: 'feat', text: 'Open the log of any job to read its output, loading more as it grows.' },
        ],
      },
      {
        label: 'Notifications',
        icon: Sparkles,
        color: '#f0abfc',
        items: [
          { type: 'feat', text: 'Pop-up notices appear anywhere in the app when a background deploy starts, finishes, fails or is cancelled.' },
          { type: 'improve', text: 'Finished and failed notices have a button that opens the job log.' },
        ],
      },
    ],
  },
  {
    version: '2.5.0',
    codename: 'Fresh Coat',
    date: '2026-10-09',
    summary:
      'A clean-up of how Serop looks and reads, plus fixes for Docker and Logs on local folder projects. You can now choose which Groq model powers the AI helpers, and the riskiest database buttons ask before they run.',
    groups: [
      {
        label: 'Docker and Logs',
        icon: TerminalSquare,
        color: '#4ec9b0',
        items: [
          { type: 'fix', text: 'The Actions menu on containers and services opened but stayed invisible. It now appears where you click, and so do the other drop-down menus that share it.' },
          { type: 'fix', text: 'A folder you add as a project now shows up in Docker and Logs. Serop checks the folder for a compose file and adds it for you. The Logs panel also has a Use project folder button.' },
          { type: 'improve', text: 'Containers and services are rows with Start, Stop, Restart and Logs on the row itself. Pause, Kill, Remove and the shell and database clients are in the more-actions menu.' },
          { type: 'improve', text: 'Kill, Remove and Restart all now ask you to confirm. Log views have a filter box and a Copy button, and the Logs panel can clear a tab.' },
          { type: 'improve', text: 'The Docker sidebar lists the containers on your server with a running, paused or stopped dot. Docker and Deploy no longer repeat your server list once you are connected.' },
        ],
      },
      {
        label: 'Look and feel',
        icon: Layers,
        color: '#93c5fd',
        items: [
          { type: 'improve', text: 'The app uses a clean system font for menus and labels. Code, paths, logs and the terminal stay monospace. Keyboard focus is clearly visible, scrollbars are softer, and animations calm down if your system asks for reduced motion.' },
          { type: 'improve', text: 'Title bar menus open on hover once one is open, close with Escape, and show the right shortcuts for your system. Menus and drawers are solid instead of see-through. The About box shows the real version.' },
          { type: 'improve', text: 'Server tabs show the connection type. The sidebar shows each server host or folder, and a green dot for the one you are connected to. The Overview page shows memory and disk as cards and explains why local projects have no stats.' },
          { type: 'improve', text: 'Small all-caps labels, tiny text and pulsing badges were replaced across the app with readable, sentence-case wording. Empty states now say what to do next.' },
          { type: 'improve', text: 'Settings lists the always-on core modules as a quiet list instead of eight greyed-out switches. Section titles are plain text, long theme names wrap instead of being cut off, and a custom theme\'s Edit and Remove buttons can be reached with the keyboard.' },
          { type: 'improve', text: 'Confirmations and notices are now Serop dialogs instead of the plain system pop-ups. They match your theme, put the safe choice (Cancel) in focus for risky actions, close with Escape, and name the action on the button, like Delete or Turn off.' },
          { type: 'feat', text: 'The Files sidebar has a new look when you are not connected: a terminal that cannot find your files, and a joke.' },
        ],
      },
      {
        label: 'Files and editor',
        icon: Keyboard,
        color: '#fbbf24',
        items: [
          { type: 'feat', text: 'Press Cmd or Ctrl + S to save the open file.' },
          { type: 'improve', text: 'Tabs show a dot when a file has unsaved changes. The file open in the editor is highlighted in the file tree. The toolbar no longer repeats the File menu, and the minimap is off.' },
        ],
      },
      {
        label: 'Deploy',
        icon: GitBranch,
        color: '#34d399',
        items: [
          { type: 'fix', text: 'Deploy and Rollback now ask you to confirm. Deploy resets the server folder to the remote branch, and Rollback checks out an older commit. Stopping, disabling or restarting nginx in Server admin asks too.' },
          { type: 'improve', text: 'Tabs are Terminal, Git deploy, Config creators and Server admin. The Git deploy form uses plain wording, the Deploy button matches the rest of the app, and Deploy history shows Succeeded or Failed with a Show output button.' },
          { type: 'improve', text: 'The AI chat asks for your Groq key once and then shows Groq key saved with a Change link. Its empty state offers example prompts you can click. The suggested command button now says Run in terminal.' },
        ],
      },
      {
        label: 'Firewall',
        icon: Shield,
        color: '#fb923c',
        items: [
          { type: 'fix', text: 'Turning the firewall on without an Allow rule for SSH could lock you out of the server. Serop now warns first. Deleting the SSH rule, blocking port 22, or turning the firewall off also asks you to confirm, and presets list the rules they will add.' },
          { type: 'fix', text: 'Deleting a firewall rule uses its number in UFW. Serop now checks that the number still points at the rule you clicked before deleting, and asks you to refresh if the list changed.' },
          { type: 'improve', text: 'Ports, source addresses and subnets are checked before they are used in a command on the server. The tabs are Open ports, Firewall rules, Presets and Port scanner, with plain wording and no all-caps labels.' },
        ],
      },
      {
        label: 'AI helpers',
        icon: Sparkles,
        color: '#f0abfc',
        items: [
          { type: 'feat', text: 'Choose the Groq model for Deploy chat and Config Creators from a drop-down next to your API key. Serop remembers your choice and loads the models available to your key. Deploy chat still falls back to other models if you hit a rate limit.' },
        ],
      },
      {
        label: 'Database safety',
        icon: Shield,
        color: '#f87171',
        items: [
          { type: 'fix', text: 'Import Full SQL deletes everything in the database before importing, with no warning. It is now called Wipe and import, and asks you to confirm. Restoring a Cloudinary backup also asks first.' },
          { type: 'improve', text: 'Connection buttons and messages use plain words, such as Connect, Disconnect and Connected via local port. Input fields show a focus outline for keyboard users.' },
        ],
      },
    ],
  },
  {
    version: '2.4.0',
    codename: 'Open Canvas',
    date: '2026-10-06',
    summary:
      'A redesign of Settings and the Servers page, plus a theme editor so you can build your own look inside Serop. Screens that need a server now explain themselves and let you connect right there.',
    groups: [
      {
        label: 'Theme Editor',
        icon: Sliders,
        color: '#c084fc',
        items: [
          { type: 'feat', text: 'Create theme in Settings opens a drawer with colour pickers for 14 colours. The whole app recolours live as you edit. Save it, edit it later, or export it as a JSON file.' },
          { type: 'improve', text: 'Settings is reorganised into Appearance, General and Feature Modules. Themes are shown as cards with a live preview, and the modules header stays visible while you scroll.' },
          { type: 'fix', text: 'Window opacity now works on Linux. It fades the background layer only, so text stays sharp. Background blur now applies to Tokyo Night and custom themes, not only Glassy.' },
        ],
      },
      {
        label: 'Servers',
        icon: Layers,
        color: '#93c5fd',
        items: [
          { type: 'improve', text: 'Servers are now cards with a Connect button instead of a table, and the page uses the full window width.' },
          { type: 'improve', text: 'Adding and editing share one drawer with connection-type cards, fields that match the type, and clear messages under any field that needs fixing. Edits are saved only when you press Save changes.' },
          { type: 'improve', text: 'Files, Docker, Database, Firewall, Deploy and Notes each show what they do and a list of servers to connect to when you are not connected. The Deploy panel no longer shows tools that need a server.' },
          { type: 'fix', text: 'The button that opens General Notes in the editor now works, including with no server connected.' },
        ],
      },
    ],
  },
  {
    version: '2.3.0',
    codename: 'Iron Palette',
    date: '2026-10-04',
    summary:
      'Tightens security and adds custom themes. Serop now checks SSH server fingerprints, encrypts saved passwords with your system keychain, and keeps secrets out of its log file. Themes can be loaded from JSON files, including files shipped by an installer.',
    groups: [
      {
        label: 'Security',
        icon: Shield,
        color: '#f87171',
        items: [
          { type: 'feat', text: 'SSH host key check. The first time you connect to a server, Serop shows its fingerprint and asks you to trust it. Later connections are silent if it matches.' },
          { type: 'feat', text: 'If a server fingerprint changes, Serop stops and shows the old and new fingerprints before you decide. Fingerprints are saved in known_hosts.json in the app data folder.' },
          { type: 'feat', text: 'Saved server passwords and the Cloudinary secret are encrypted with the system keychain (Keychain, Credential Manager, or the Linux keyring). Passwords saved by older versions are encrypted the next time the app saves.' },
          { type: 'improve', text: 'Passwords stay plain text only on Linux systems with no keyring, because Electron has no real protection there.' },
          { type: 'fix', text: 'The log file no longer records passwords, tokens or keys. Password-like text is scrubbed, long command output and SQL are cut to 200 characters, and failed SQL imports no longer log the statement. Old log entries stay until you clear the log.' },
        ],
      },
      {
        label: 'Custom Themes',
        icon: Sliders,
        color: '#c084fc',
        items: [
          { type: 'feat', text: 'Import a theme from a JSON file in Settings (name, light or dark base, and colors). Any color you leave out comes from the base theme. A Template button downloads an example file.' },
          { type: 'feat', text: 'Themes can also come from folders: the installer themes folder, the folder in the SEROP_THEMES_DIR environment variable, and a themes folder in the app data folder. Settings has Themes folder and Reload buttons.' },
          { type: 'improve', text: 'Theme files are checked before use. Invalid colors, values like url(...), files over 20 KB, and more than 20 imported themes are refused with a clear message.' },
          { type: 'improve', text: 'The terminal and editor follow custom theme colors.' },
        ],
      },
      {
        label: 'Housekeeping',
        icon: Layers,
        color: '#93c5fd',
        items: [
          { type: 'fix', text: 'Removed a stray vite config timestamp file that was committed by mistake and ignored it in git.' },
        ],
      },
    ],
  },
  {
    version: '2.2.0',
    codename: 'Steady Slate',
    date: '2026-09-23',
    summary:
      'Improves the Serop Commands dropdown with most-recently-used ordering and a way to hide recipe files without touching your server, and lays the first foundation-primitives phase of a broader UI/UX modernization pass — shared Button, Input, Textarea, SectionLabel, Card, and EmptyState components now back several existing screens with no behavior change.',
    groups: [
      {
        label: 'Serop Commands Dropdown',
        icon: ListOrdered,
        color: '#fbbf24',
        items: [
          { type: 'feat', text: 'Selecting a .serop recipe file now promotes it to the top of the dropdown, so the one you used most recently is always closest at hand.' },
          { type: 'feat', text: 'Added a hide/restore control on each recipe file in the dropdown — hiding is stored locally per project and never touches the .serop files on your server.' },
        ],
      },
      {
        label: 'UI Foundation & Consistency',
        icon: Layers,
        color: '#93c5fd',
        items: [
          { type: 'core', text: 'Introduced shared Button, Input, Textarea, SectionLabel, Card, and EmptyState components to replace hand-rolled, drifted styling across the app.' },
          { type: 'improve', text: 'Standardized corner-radius usage app-wide: small controls now use a tighter radius, containers and text fields a slightly larger one, applied consistently everywhere the new components land.' },
          { type: 'fix', text: 'Fixed a missing hover state on the "Run edited" deploy shortcut button so it matches every other primary action button in the app.' },
        ],
      },
    ],
  },
  {
    version: '2.1.0',
    codename: 'Prism Break',
    date: '2026-08-07',
    summary:
      'Adds Light and Tokyo Night themes with a visual theme picker, keeps terminals and the built-in editor in sync with the active theme, removes the native macOS menu in favor of title-bar shortcuts, surfaces terminal connection status, and makes file and folder creation inline in the file trees.',
    groups: [
      {
        label: 'Theming & Appearance',
        icon: Sliders,
        color: '#93c5fd',
        items: [
          { type: 'feat', text: 'Added Light and Tokyo Night themes alongside Default and Glassy Terminal, with a visual swatch-based theme picker in Settings.' },
          { type: 'improve', text: 'Terminals and the built-in editor now follow the active theme background and accent colors.' },
        ],
      },
      {
        label: 'Title Bar & Shortcuts',
        icon: Keyboard,
        color: '#f0abfc',
        items: [
          { type: 'feat', text: 'Removed the native macOS application menu and moved core actions into the app\'s custom title bar.' },
          { type: 'feat', text: 'Added keyboard shortcuts (Cmd/Ctrl+Q/R/B/O for quit, reload, browser refresh, and open, plus Cmd/Ctrl+C/V/X/A/Z/Y for editing actions) with input-aware handling.' },
        ],
      },
      {
        label: 'Terminal Reliability',
        icon: TerminalSquare,
        color: '#6ee7b7',
        items: [
          { type: 'improve', text: 'Terminal tabs and project terminals now show live connection status with status dots and a "Session ended - Reconnect" banner when a shell drops.' },
        ],
      },
      {
        label: 'File Trees',
        icon: GitBranch,
        color: '#fbbf24',
        items: [
          { type: 'feat', text: 'New File / New Folder inputs now appear inline inside the target folder in both the file and project trees, and the target folder auto-expands so the input is visible.' },
        ],
      },
    ],
  },
  {
    version: '2.0.1',
    codename: 'Glass Harbor',
    date: '2026-06-12',
    summary:
      'This release adds real local workspace support, the new `serop` folder launcher, inline SQL row editing, a glassy terminal-style appearance option, and a much more capable deploy assistant with cleaner chat rendering and project-aware command suggestions.',
    groups: [
      {
        label: 'Local Workspace Mode',
        icon: TerminalSquare,
        color: '#93c5fd',
        items: [
          { type: 'feat', text: 'Added a Local Workspace connection type so you can open a folder from your own machine inside Server Operator without SSH.' },
          { type: 'feat', text: 'Local workspaces now support file browsing, terminal access, Docker inspection, compose logs, database tooling, deploy commands, and `.serop` shortcuts.' },
          { type: 'feat', text: 'Added startup folder handoff so launching the app with a folder automatically opens it as a local workspace profile.' },
          { type: 'feat', text: 'Added the new `serop` launcher flow so `serop .` opens Server Operator directly in the current directory.' },
        ],
      },
      {
        label: 'Deploy Assistant & Shortcuts',
        icon: Sparkles,
        color: '#f0abfc',
        items: [
          { type: 'improve', text: 'Deploy AI chat now returns real answers plus optional runnable commands instead of command-only output.' },
          { type: 'improve', text: 'Added response parsing, malformed-tag recovery, model fallback on Groq rate limits, and cleaner command presentation cards.' },
          { type: 'fix', text: 'Normalized deploy project paths to absolute remote paths so project switching no longer breaks with relative `cd` commands.' },
          { type: 'feat', text: 'Moved deploy project chips, context, and `.serop` shortcuts into the main sidebar with accordion-based command editing and direct run actions.' },
        ],
      },
      {
        label: 'Database Editing & Appearance',
        icon: Database,
        color: '#6ee7b7',
        items: [
          { type: 'feat', text: 'Added first-pass inline table editing for SQL databases, including row update, insert, and delete actions for table browse views.' },
          { type: 'improve', text: 'Table metadata is now used to detect primary keys and build safer row predicates for edits and deletes.' },
          { type: 'feat', text: 'Added a new Glassy Terminal appearance mode for a transparent, blurred, Linux-terminal-inspired desktop theme.' },
        ],
      },
    ],
  },
  {
    version: '1.0.1',
    codename: 'Amber Anchor',
    date: '2026-06-02',
    summary:
      'This release introduces critical SSH stability improvements, a connection queuing manager to prevent session exhaustion, custom toggles, password visibility eye toggles, multi-architecture macOS build support, Tailwind CSS v4 styling migration, and significant CPU optimization by removing redundant periodic uptime monitoring loops.',
    groups: [
      {
        label: 'SSH Stability & Queuing',
        icon: Shield,
        color: '#a7f3d0',
        items: [
          { type: 'feat', text: 'Implemented a sequential FIFO Promise queue (connectionQueues) to serialize remote execution requests and prevent MaxSessions channel open failures.' },
          { type: 'feat', text: 'Added SSH keepalive heartbeats (keepaliveInterval: 10000, keepaliveCountMax: 3) to automatically teardown dead or timed-out connection sockets.' },
          { type: 'fix', text: 'Cleared connection queue state upon socket closure, errors, or idle timeout evictions to prevent reference memory leaks.' },
          { type: 'improve', text: 'Completely removed the 60-second periodic background uptime monitoring checks to eliminate unnecessary SSH load on servers.' },
        ],
      },
      {
        label: 'Visual Refinements & Controls',
        icon: Sliders,
        color: '#f0abfc',
        items: [
          { type: 'feat', text: 'Integrated an interactive eye icon visibility toggle for masked server passwords under the Authentication table column.' },
          { type: 'feat', text: 'Replaced native browser checkboxes across server configuration forms, Docker views, and settings with sleek custom React buttons.' },
          { type: 'fix', text: 'Fixed bottom terminal active checks to prevent active SSH stream sessions from unmounting and disconnecting during drawer toggles.' },
          { type: 'improve', text: 'Migrated custom UI styling and theme colors to Tailwind CSS v4 design specifications.' },
        ],
      },
      {
        label: 'Deployment & Core Infrastructure',
        icon: Sparkles,
        color: '#fb923c',
        items: [
          { type: 'feat', text: 'Configured explicit multi-arch macOS targets supporting both Apple Silicon (ARM64) and Intel (x64) architectures.' },
          { type: 'improve', text: 'Refined Certbot automatic SSL detection and status verification logic for server domains.' },
          { type: 'improve', text: 'Optimized Tor SOCKS5 proxy toggle defaults for SSH connections.' },
        ],
      },
    ],
  },
  {
    version: '1.0.0',
    codename: 'Cobalt Catalyst',
    date: '2026-05-27',
    summary:
      'The first full release of Serop — a desktop server management suite built on Electron, React, and SSH. Cobalt Catalyst introduces an auto-updating notification system, a custom app logo icon, and a default-disabled feature toggling mechanism.',
    groups: [
      {
        label: 'Auto-Update System',
        icon: Sparkles,
        color: '#a7f3d0',
        items: [
          { type: 'feat', text: 'GitHub Releases API silent check to automatically check for new versions on launch' },
          { type: 'feat', text: 'Non-intrusive floating toast alerts for new release tags with an expandable changelog body' },
          { type: 'feat', text: 'Persistent version dismissals stored in local storage to prevent duplicate alerts' },
          { type: 'feat', text: 'Check for Updates option inside the application Help menu' },
        ],
      },
      {
        label: 'Visual Identity & Custom Icon',
        icon: Sliders,
        color: '#f0abfc',
        items: [
          { type: 'feat', text: 'New custom-designed squircle brand logo mark deployed at all standard system icon sizes' },
          { type: 'feat', text: 'Support for dynamic Dock icon loading at runtime during macOS development' },
        ],
      },
      {
        label: 'Disabled-by-Default Feature Suite',
        icon: Sliders,
        color: '#fb923c',
        items: [
          { type: 'feat', text: 'All optional server and deployment modules disabled by default on clean installations' },
          { type: 'feat', text: 'On-demand opt-in control panel allowing users to only turn on features they require' },
        ],
      },
      {
        label: 'SQL Query Runner',
        icon: Database,
        color: '#6ee7b7',
        items: [
          { type: 'feat', text: 'Monaco Editor input with SQL syntax highlighting for MySQL and PostgreSQL' },
          { type: 'feat', text: 'Run button that executes queries over the SSH-tunneled database connection' },
          { type: 'feat', text: 'Paginated results table with row count and execution time display' },
          { type: 'feat', text: 'Inline error reporting for database and connection failures' },
          { type: 'feat', text: 'Autocomplete for table names pulled from the live schema' },
        ],
      },
      {
        label: 'Git Deployment Pipeline',
        icon: GitBranch,
        color: '#93c5fd',
        items: [
          { type: 'feat', text: 'Server + project directory selector with one-click Deploy action' },
          { type: 'feat', text: 'SSHes in and runs git pull, npm install / pip install, migrations, and service restart' },
          { type: 'feat', text: 'Supports pm2 restart and systemctl restart as service managers' },
          { type: 'feat', text: 'Real-time output streamed into the integrated terminal during deployment' },
          { type: 'feat', text: 'Terminal input is locked while a deployment is in progress' },
        ],
      },
      {
        label: 'Deployment History & Rollbacks',
        icon: History,
        color: '#fbbf24',
        items: [
          { type: 'feat', text: 'All deploys logged to a local SQLite table (timestamp, branch, commit hash, status, output)' },
          { type: 'feat', text: 'Per-server/project deploy history list with colored success/failure badges' },
          { type: 'feat', text: 'Visual log viewer with expandable terminal output per deploy entry' },
          { type: 'feat', text: 'Rollback button — SSHes in, runs git checkout <commit>, and restarts the service' },
        ],
      },
      {
        label: 'Terminal Snippet Library',
        icon: TerminalSquare,
        color: '#d8b4fe',
        items: [
          { type: 'feat', text: 'Save commands with a title, description, and body to a persistent local library' },
          { type: 'feat', text: 'Searchable side panel with instant fuzzy filtering across all snippets' },
          { type: 'feat', text: 'Click a snippet to paste it directly into the active terminal' },
          { type: 'feat', text: 'Variable placeholder support: {{domain}}, {{port}}, etc. — prompts for values before pasting' },
          { type: 'feat', text: 'Copy-to-clipboard button on every snippet card' },
          { type: 'feat', text: 'Seed snippets included out of the box (nginx reload, pm2 status, docker prune, etc.)' },
        ],
      },
      {
        label: 'Core Infrastructure',
        icon: Shield,
        color: '#34d399',
        items: [
          { type: 'core', text: 'Electron + React + TypeScript foundation with Vite bundler' },
          { type: 'core', text: 'SSH connection manager with EC2 key-pair, password, and Cloudflare Tunnel modes' },
          { type: 'core', text: 'Tor SOCKS5 proxy support for anonymous SSH connections' },
          { type: 'core', text: 'Remote file explorer with Monaco editor, uploads, downloads, and search' },
          { type: 'core', text: 'Docker container monitor — logs, rebuilds, and service status management' },
          { type: 'core', text: 'Server admin panel with OS info, service controller, and performance charts' },
          { type: 'core', text: 'Config creator wizards for systemd units and Nginx reverse-proxy blocks' },
          { type: 'core', text: 'AI assistant integration for shell diagnostics and query optimization' },
          { type: 'core', text: 'Persistent markdown notes synced with the Monaco editor workspace' },
        ],
      },
    ],
  },
];
