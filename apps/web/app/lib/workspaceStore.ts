export type WorkspaceView =
  | "all"
  | "folders"
  | "bot"
  | "presets"
  | "styles"
  | "github"
  | "private"
  | "archive"
  | "mcp";

export type FileFilter = "all" | "recents" | "mine" | "folders" | "unsorted";

export type BoardSnapshot = {
  elements: unknown[];
  pan: { x: number; y: number };
  backgroundColor: string;
  canvasName?: string;
  documentNotes?: string;
};

export type WorkspaceFile = {
  id: string;
  name: string;
  folderId: string | null;
  createdAt: string;
  editedAt: string;
  author: string;
  comments: number;
  archived: boolean;
  isPrivate: boolean;
  content: BoardSnapshot;
};

export type WorkspaceFolder = {
  id: string;
  name: string;
  createdAt: string;
};

export type AiPreset = {
  id: string;
  name: string;
  prompt: string;
  mode: "text" | "mermaid";
  createdAt: string;
};

export type CustomStyle = {
  id: string;
  name: string;
  strokeColor: string;
  backgroundColor: string;
  accent: string;
  createdAt: string;
};

export type GithubSyncConfig = {
  enabled: boolean;
  repo: string;
  branch: string;
  path: string;
  lastSyncedAt: string | null;
};

export type McpConnectionState = {
  connected: boolean;
  lastCheckedAt: string | null;
  notes: string;
};

export type WorkspaceState = {
  teamName: string;
  author: string;
  files: WorkspaceFile[];
  folders: WorkspaceFolder[];
  presets: AiPreset[];
  styles: CustomStyle[];
  github: GithubSyncConfig;
  mcp: McpConnectionState;
};

const STORAGE_KEY = "draw-app-workspace-v1";

const nowIso = () => new Date().toISOString();

const makeId = () =>
  `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const emptyBoard = (name = "Untitled File"): BoardSnapshot => ({
  elements: [],
  pan: { x: 0, y: 0 },
  backgroundColor: "#f7f7fb",
  canvasName: name,
});

const defaultState = (): WorkspaceState => ({
  teamName: "Aamir's Team",
  author: "You",
  files: [],
  folders: [{ id: "folder-product", name: "Product", createdAt: nowIso() }],
  presets: [
    {
      id: "preset-flow",
      name: "User signup flow",
      prompt: "Create a flowchart for user signup with email verification and welcome email",
      mode: "text",
      createdAt: nowIso(),
    },
    {
      id: "preset-erd",
      name: "SaaS ERD",
      prompt: "Entity relationship diagram for users, workspaces, and invites",
      mode: "text",
      createdAt: nowIso(),
    },
  ],
  styles: [
    {
      id: "style-default",
      name: "Default violet",
      strokeColor: "#1f1f2e",
      backgroundColor: "#f7f7fb",
      accent: "#6858f8",
      createdAt: nowIso(),
    },
  ],
  github: {
    enabled: false,
    repo: "",
    branch: "main",
    path: "diagrams",
    lastSyncedAt: null,
  },
  mcp: {
    connected: false,
    lastCheckedAt: null,
    notes: "",
  },
});

function readState(): WorkspaceState {
  if (typeof window === "undefined") {
    return defaultState();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = defaultState();
      writeState(initial);
      return initial;
    }
    const parsed = JSON.parse(raw) as WorkspaceState;
    return {
      ...defaultState(),
      ...parsed,
      files: Array.isArray(parsed.files) ? parsed.files : [],
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      presets: Array.isArray(parsed.presets) ? parsed.presets : [],
      styles: Array.isArray(parsed.styles) ? parsed.styles : [],
    };
  } catch {
    return defaultState();
  }
}

function writeState(state: WorkspaceState) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getWorkspace(): WorkspaceState {
  return readState();
}

export function saveWorkspace(state: WorkspaceState) {
  writeState(state);
}

export function createFile(options?: {
  name?: string;
  folderId?: string | null;
  isPrivate?: boolean;
  content?: BoardSnapshot;
}): WorkspaceFile {
  const state = readState();
  const name = options?.name?.trim() || "Untitled File";
  const file: WorkspaceFile = {
    id: makeId(),
    name,
    folderId: options?.folderId ?? null,
    createdAt: nowIso(),
    editedAt: nowIso(),
    author: state.author,
    comments: 0,
    archived: false,
    isPrivate: Boolean(options?.isPrivate),
    content: options?.content ?? emptyBoard(name),
  };
  state.files = [file, ...state.files];
  writeState(state);
  return file;
}

export function getFile(id: string): WorkspaceFile | null {
  return readState().files.find((file) => file.id === id) ?? null;
}

export function renameFile(id: string, name: string) {
  const state = readState();
  state.files = state.files.map((file) =>
    file.id === id ? { ...file, name: name.trim() || file.name, editedAt: nowIso() } : file,
  );
  writeState(state);
}

export function archiveFile(id: string, archived = true) {
  const state = readState();
  state.files = state.files.map((file) =>
    file.id === id ? { ...file, archived, editedAt: nowIso() } : file,
  );
  writeState(state);
}

export function deleteFile(id: string) {
  const state = readState();
  state.files = state.files.filter((file) => file.id !== id);
  writeState(state);
}

export function moveFileToFolder(id: string, folderId: string | null) {
  const state = readState();
  state.files = state.files.map((file) =>
    file.id === id ? { ...file, folderId, editedAt: nowIso() } : file,
  );
  writeState(state);
}

export function updateFileContent(id: string, content: BoardSnapshot) {
  const state = readState();
  state.files = state.files.map((file) =>
    file.id === id
      ? {
          ...file,
          name: content.canvasName?.trim() || file.name,
          content,
          editedAt: nowIso(),
        }
      : file,
  );
  writeState(state);
}

export function touchFile(id: string) {
  const state = readState();
  state.files = state.files.map((file) =>
    file.id === id ? { ...file, editedAt: nowIso() } : file,
  );
  writeState(state);
}

export function createFolder(name: string) {
  const state = readState();
  const folder: WorkspaceFolder = {
    id: `folder-${Date.now().toString(36)}`,
    name: name.trim() || "New folder",
    createdAt: nowIso(),
  };
  state.folders = [...state.folders, folder];
  writeState(state);
  return folder;
}

export function deleteFolder(id: string) {
  const state = readState();
  state.folders = state.folders.filter((folder) => folder.id !== id);
  state.files = state.files.map((file) =>
    file.folderId === id ? { ...file, folderId: null } : file,
  );
  writeState(state);
}

export function addPreset(name: string, prompt: string, mode: "text" | "mermaid" = "text") {
  const state = readState();
  const preset: AiPreset = {
    id: `preset-${Date.now().toString(36)}`,
    name: name.trim() || "Untitled preset",
    prompt: prompt.trim(),
    mode,
    createdAt: nowIso(),
  };
  state.presets = [preset, ...state.presets];
  writeState(state);
  return preset;
}

export function deletePreset(id: string) {
  const state = readState();
  state.presets = state.presets.filter((preset) => preset.id !== id);
  writeState(state);
}

export function addStyle(input: Omit<CustomStyle, "id" | "createdAt">) {
  const state = readState();
  const style: CustomStyle = {
    ...input,
    id: `style-${Date.now().toString(36)}`,
    createdAt: nowIso(),
  };
  state.styles = [style, ...state.styles];
  writeState(state);
  return style;
}

export function deleteStyle(id: string) {
  const state = readState();
  state.styles = state.styles.filter((style) => style.id !== id);
  writeState(state);
}

export function updateGithub(config: Partial<GithubSyncConfig>) {
  const state = readState();
  state.github = { ...state.github, ...config };
  writeState(state);
  return state.github;
}

export function markGithubSynced() {
  return updateGithub({ lastSyncedAt: nowIso(), enabled: true });
}

export function updateMcp(config: Partial<McpConnectionState>) {
  const state = readState();
  state.mcp = { ...state.mcp, ...config, lastCheckedAt: nowIso() };
  writeState(state);
  return state.mcp;
}

export function updateProfile(config: Partial<{ teamName: string; author: string }>) {
  const state = readState();
  if (typeof config.teamName === "string" && config.teamName.trim()) {
    state.teamName = config.teamName.trim();
  }
  if (typeof config.author === "string" && config.author.trim()) {
    state.author = config.author.trim();
  }
  writeState(state);
  return { teamName: state.teamName, author: state.author };
}

export type McpClientId =
  | "claude-code"
  | "claude-ai"
  | "codex"
  | "vscode"
  | "cursor"
  | "copilot";

export type McpClientSetup = {
  id: McpClientId;
  name: string;
  subtitle: string;
  runLabel: string;
  command?: string;
  configJson?: string;
  configPath?: string;
  steps: string[];
};

export function getMcpProjectRoot() {
  if (typeof window === "undefined") {
    return "D:/Excalidraw-DrawApp-practice-w-22";
  }
  const stored = window.localStorage.getItem("draw-app-mcp-root");
  if (stored?.trim()) {
    return stored.trim().replace(/\\/g, "/");
  }
  return "D:/Excalidraw-DrawApp-practice-w-22";
}

export function setMcpProjectRoot(root: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem("draw-app-mcp-root", root.trim().replace(/\\/g, "/"));
}

export function getMcpCursorConfig(projectRootHint = getMcpProjectRoot()) {
  return {
    mcpServers: {
      "draw-app": {
        command: "pnpm",
        args: ["--filter", "mcp-server", "start"],
        cwd: projectRootHint.replace(/\\/g, "/"),
      },
    },
  };
}

export function getMcpClientSetups(projectRootHint = getMcpProjectRoot()): McpClientSetup[] {
  const root = projectRootHint.replace(/\\/g, "/");
  const cursorJson = JSON.stringify(getMcpCursorConfig(root), null, 2);
  const claudeDesktopJson = JSON.stringify(
    {
      mcpServers: {
        "draw-app": {
          command: "pnpm",
          args: ["--filter", "mcp-server", "start"],
          cwd: root,
        },
      },
    },
    null,
    2,
  );
  const vscodeJson = JSON.stringify(
    {
      servers: {
        "draw-app": {
          type: "stdio",
          command: "pnpm",
          args: ["--filter", "mcp-server", "start"],
          cwd: root,
        },
      },
    },
    null,
    2,
  );

  return [
    {
      id: "claude-code",
      name: "Claude Code",
      subtitle: "Anthropic's agentic CLI",
      runLabel: "Run in your terminal (from the DrawApp repo root)",
      command: `cd "${root}" && claude mcp add draw-app --transport stdio -- pnpm --filter mcp-server start`,
      steps: [
        "Install Claude Code CLI and open a terminal in your DrawApp repo.",
        "Run the command below to register the DrawApp MCP server.",
        "Restart Claude Code, then ask it to call list_templates.",
      ],
    },
    {
      id: "claude-ai",
      name: "Claude.ai",
      subtitle: "Claude Desktop app",
      runLabel: "Paste into Claude Desktop config",
      configPath: "%APPDATA%/Claude/claude_desktop_config.json",
      configJson: claudeDesktopJson,
      steps: [
        "Open Claude Desktop → Settings → Developer → Edit Config.",
        "Merge the JSON below into claude_desktop_config.json.",
        "Fully quit and reopen Claude Desktop, then verify DrawApp tools appear.",
      ],
    },
    {
      id: "codex",
      name: "Codex",
      subtitle: "OpenAI Codex / agent CLI",
      runLabel: "MCP stdio registration",
      command: `cd "${root}" && pnpm --filter mcp-server build && pnpm --filter mcp-server start`,
      configJson: cursorJson,
      steps: [
        "Build the MCP server once with pnpm --filter mcp-server build.",
        "Register DrawApp as a stdio MCP server using the JSON config below in your Codex MCP settings.",
        "Confirm tools: list_templates, get_template, create_board_stub, list_icon_categories.",
      ],
    },
    {
      id: "vscode",
      name: "VS Code",
      subtitle: "GitHub Copilot Chat MCP",
      runLabel: "Add to .vscode/mcp.json",
      configPath: ".vscode/mcp.json",
      configJson: vscodeJson,
      steps: [
        "In the DrawApp repo, create or edit .vscode/mcp.json.",
        "Paste the JSON below, then reload VS Code.",
        "Open Copilot Chat and enable the draw-app MCP tools.",
      ],
    },
    {
      id: "cursor",
      name: "Cursor",
      subtitle: "Cursor IDE MCP settings",
      runLabel: "Add to Cursor MCP config",
      configPath: "~/.cursor/mcp.json (or Cursor Settings → MCP)",
      configJson: cursorJson,
      steps: [
        "Open Cursor Settings → MCP → Add new global MCP server.",
        "Paste the JSON below (cwd must point at your DrawApp repo root).",
        "Click Refresh / restart Cursor agents and test list_templates.",
      ],
    },
    {
      id: "copilot",
      name: "GitHub Copilot",
      subtitle: "Copilot agent with MCP",
      runLabel: "VS Code Copilot MCP entry",
      configPath: ".vscode/mcp.json",
      configJson: vscodeJson,
      steps: [
        "Use the same VS Code MCP config shown below.",
        "Ensure GitHub Copilot Chat is enabled with agent/MCP support.",
        "Start a Copilot agent session and ask it to list DrawApp templates.",
      ],
    },
  ];
}

export const MCP_TOOLS = [
  {
    name: "list_templates",
    description: "List flowchart, freeform, ERD, sequence, cloud, and architecture templates",
  },
  {
    name: "get_template",
    description: "Fetch one catalog template by id with usage hints",
  },
  {
    name: "create_board_stub",
    description: "Generate a board JSON stub DrawApp can import or hydrate",
  },
  {
    name: "list_icon_categories",
    description: "List icon library categories (custom, general, diagram, tech, cloud)",
  },
] as const;

export type WorkspaceApiToken = {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const API_TOKEN_KEY = "draw-app-api-tokens-v1";

export function listApiTokens(): WorkspaceApiToken[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(API_TOKEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkspaceApiToken[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createApiToken(name: string) {
  const token: WorkspaceApiToken = {
    id: `tok-${Date.now().toString(36)}`,
    name: name.trim() || "Workspace token",
    token: `daw_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
    createdAt: nowIso(),
    lastUsedAt: null,
  };
  const next = [token, ...listApiTokens()];
  window.localStorage.setItem(API_TOKEN_KEY, JSON.stringify(next));
  return token;
}

export function deleteApiToken(id: string) {
  const next = listApiTokens().filter((token) => token.id !== id);
  window.localStorage.setItem(API_TOKEN_KEY, JSON.stringify(next));
}

export function getAppearanceMode(): "system" | "light" | "dark" {
  if (typeof window === "undefined") return "system";
  const value = window.localStorage.getItem("draw-app-appearance");
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function setAppearanceMode(mode: "system" | "light" | "dark") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("draw-app-appearance", mode);
  const resolved =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
  document.documentElement.dataset.theme = resolved;
}

export function relativeTime(iso: string) {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

export function filterFiles(
  files: WorkspaceFile[],
  options: {
    view: WorkspaceView;
    filter: FileFilter;
    query: string;
    folderId?: string | null;
  },
) {
  const q = options.query.trim().toLowerCase();
  return files
    .filter((file) => {
      if (options.view === "archive") return file.archived;
      if (file.archived) return false;
      if (options.view === "private") return file.isPrivate;
      if (options.view === "folders") {
        if (options.folderId) return file.folderId === options.folderId;
        return Boolean(file.folderId);
      }
      return true;
    })
    .filter((file) => {
      if (options.filter === "unsorted") return !file.folderId;
      if (options.filter === "folders") return Boolean(file.folderId);
      if (options.filter === "mine") return true;
      if (options.filter === "recents") {
        const day = 1000 * 60 * 60 * 24 * 7;
        return Date.now() - new Date(file.editedAt).getTime() < day;
      }
      return true;
    })
    .filter((file) => !q || file.name.toLowerCase().includes(q))
    .sort((a, b) => +new Date(b.editedAt) - +new Date(a.editedAt));
}
