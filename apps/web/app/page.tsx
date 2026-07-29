"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";
import SettingsModal from "./components/SettingsModal";
import {
  addPreset,
  addStyle,
  archiveFile,
  createFile,
  createFolder,
  deleteFile,
  deleteFolder,
  deletePreset,
  deleteStyle,
  filterFiles,
  getWorkspace,
  markGithubSynced,
  moveFileToFolder,
  relativeTime,
  renameFile,
  updateGithub,
  type FileFilter,
  type WorkspaceFile,
  type WorkspaceState,
  type WorkspaceView,
} from "./lib/workspaceStore";

const NAV: Array<{ id: WorkspaceView; label: string; hint?: string; badge?: string }> = [
  { id: "all", label: "All Files", hint: "A" },
  { id: "folders", label: "Team Folders", hint: "+" },
  { id: "bot", label: "DrawBot", hint: "B", badge: "BETA" },
  { id: "presets", label: "AI Presets", hint: "T" },
  { id: "styles", label: "Custom Styles", hint: "S" },
  { id: "github", label: "Github Sync", hint: "G", badge: "BETA" },
  { id: "private", label: "Private Files", hint: "P" },
  { id: "archive", label: "Archive", hint: "E" },
  { id: "mcp", label: "MCP Server", hint: "C" },
];

const FILTERS: Array<{ id: FileFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "recents", label: "Recents" },
  { id: "mine", label: "Created by Me" },
  { id: "folders", label: "Folders" },
  { id: "unsorted", label: "Unsorted" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [view, setView] = useState<WorkspaceView>("all");
  const [filter, setFilter] = useState<FileFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [menuFileId, setMenuFileId] = useState<string | null>(null);
  const [botInput, setBotInput] = useState("");
  const [botLog, setBotLog] = useState<string[]>([
    "DrawBot ready. Ask me to create a flowchart, ERD, or architecture starter.",
  ]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState("");
  const [settingsTab, setSettingsTab] = useState<
    | "members"
    | "billing"
    | "git"
    | "icons"
    | "tokens"
    | "team"
    | "profile"
    | "appearance"
    | "mcp"
  >("mcp");

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) {
      setFolderError("Enter a folder name.");
      return;
    }
    const exists = workspace?.folders.some(
      (folder) => folder.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      setFolderError("A folder with that name already exists.");
      return;
    }
    const folder = createFolder(name);
    setNewFolderName("");
    setFolderError("");
    setSelectedFolderId(folder.id);
    setView("folders");
    refresh();
  };

  const openSettings = (
    tab:
      | "members"
      | "billing"
      | "git"
      | "icons"
      | "tokens"
      | "team"
      | "profile"
      | "appearance"
      | "mcp" = "mcp",
  ) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const refresh = useCallback(() => {
    setWorkspace(getWorkspace());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("workspace-search")?.focus();
      }
      if (event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        const file = createFile({
          name: "Untitled File",
          isPrivate: view === "private",
          folderId: view === "folders" ? selectedFolderId : null,
        });
        refresh();
        router.push(`/board/${file.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, selectedFolderId, refresh, router]);

  const files = useMemo(() => {
    if (!workspace) return [];
    return filterFiles(workspace.files, {
      view,
      filter: view === "all" || view === "folders" || view === "private" || view === "archive" ? filter : "all",
      query,
      folderId: selectedFolderId,
    });
  }, [workspace, view, filter, query, selectedFolderId]);

  const openBlank = (isPrivate = false) => {
    const file = createFile({
      name: "Untitled File",
      isPrivate,
      folderId: view === "folders" ? selectedFolderId : null,
    });
    refresh();
    router.push(`/board/${file.id}`);
  };

  const openAi = () => {
    const file = createFile({ name: "AI Diagram" });
    refresh();
    router.push(`/board/${file.id}?ai=1`);
  };

  const openFile = (file: WorkspaceFile) => {
    router.push(`/board/${file.id}`);
  };

  if (!workspace) {
    return <div className={styles.loading}>Loading workspace…</div>;
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <button type="button" className={styles.teamButton} onClick={() => openSettings("team")}>
          <span className={styles.teamMark} aria-hidden />
          <span>{workspace.teamName}</span>
          <span className={styles.caret}>▾</span>
        </button>

        <nav className={styles.nav}>
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.navItem} ${view === item.id ? styles.navItemActive : ""}`}
              onClick={() => {
                if (item.id === "mcp") {
                  openSettings("mcp");
                  return;
                }
                if (item.id === "github") {
                  openSettings("git");
                  setView(item.id);
                  return;
                }
                setView(item.id);
                setMenuFileId(null);
                if (item.id !== "folders") setSelectedFolderId(null);
              }}
            >
              <span className={styles.navLabel}>
                {item.label}
                {item.badge ? <em className={styles.beta}>{item.badge}</em> : null}
              </span>
              <span className={styles.navHint}>{item.hint}</span>
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={styles.newFileButton}
            onClick={() => openBlank(view === "private")}
          >
            New File
            <span>Alt N</span>
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        {(view === "all" || view === "folders" || view === "private" || view === "archive") && (
          <>
            <header className={styles.topBar}>
              <div className={styles.filters}>
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.filterChip} ${filter === item.id ? styles.filterChipActive : ""}`}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <label className={styles.search}>
                <span aria-hidden>⌕</span>
                <input
                  id="workspace-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search files"
                />
                <kbd>Ctrl K</kbd>
              </label>
              <div className={styles.topRight}>
                <div className={styles.avatars} title={workspace.author}>
                  <span>{workspace.author.slice(0, 1).toUpperCase()}</span>
                </div>
                <button
                  type="button"
                  className={styles.inviteButton}
                  onClick={() => {
                    void navigator.clipboard.writeText(window.location.origin);
                    alert("Invite link copied (workspace URL).");
                  }}
                >
                  Invite
                </button>
              </div>
            </header>

            {view === "all" && (
              <section className={styles.quickActions}>
                <button type="button" className={styles.quickCard} onClick={() => openBlank()}>
                  <span className={styles.quickIcon}>+</span>
                  <strong>Create a Blank File</strong>
                </button>
                <button type="button" className={styles.quickCard} onClick={openAi}>
                  <span className={`${styles.quickIcon} ${styles.quickIconAi}`}>✦</span>
                  <strong>Generate an AI Diagram</strong>
                </button>
                <button
                  type="button"
                  className={styles.quickCard}
                  onClick={() => openSettings("mcp")}
                >
                  <span className={`${styles.quickIcon} ${styles.quickIconMcp}`}>{"</>"}</span>
                  <strong>Connect DrawApp MCP</strong>
                </button>
              </section>
            )}

            {view === "folders" && (
              <section className={styles.panelCard}>
                <div className={styles.panelHead}>
                  <h2>Team Folders</h2>
                </div>
                <form
                  className={styles.folderCreateRow}
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleCreateFolder();
                  }}
                >
                  <input
                    value={newFolderName}
                    onChange={(event) => {
                      setNewFolderName(event.target.value);
                      if (folderError) setFolderError("");
                    }}
                    placeholder="New folder name"
                    aria-label="New folder name"
                    autoComplete="off"
                  />
                  <button type="submit" className={styles.secondaryButton}>
                    + New folder
                  </button>
                </form>
                {folderError ? <p className={styles.folderError}>{folderError}</p> : null}
                <div className={styles.folderRow}>
                  {workspace.folders.length === 0 ? (
                    <p className={styles.empty}>No folders yet. Create one above.</p>
                  ) : (
                    workspace.folders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        className={`${styles.folderChip} ${
                          selectedFolderId === folder.id ? styles.folderChipActive : ""
                        }`}
                        onClick={() => setSelectedFolderId(folder.id)}
                      >
                        {folder.name}
                      </button>
                    ))
                  )}
                </div>
                {selectedFolderId ? (
                  <button
                    type="button"
                    className={styles.dangerLink}
                    onClick={() => {
                      if (!window.confirm("Delete this folder? Files become unsorted.")) return;
                      deleteFolder(selectedFolderId);
                      setSelectedFolderId(null);
                      refresh();
                    }}
                  >
                    Delete selected folder
                  </button>
                ) : null}
              </section>
            )}

            <section className={styles.tableWrap}>
              <div className={styles.tableHead}>
                <span>Name</span>
                <span>Location</span>
                <span>Created</span>
                <span>Edited</span>
                <span>Comments</span>
                <span>Author</span>
                <span />
              </div>
              {files.length === 0 ? (
                <p className={styles.empty}>No files here yet. Create a blank file to start drawing.</p>
              ) : (
                files.map((file) => {
                  const folder = workspace.folders.find((item) => item.id === file.folderId);
                  return (
                    <div key={file.id} className={styles.tableRow}>
                      <button type="button" className={styles.fileName} onClick={() => openFile(file)}>
                        <span className={styles.fileGlyph}>▦</span>
                        {file.name}
                      </button>
                      <span>{folder?.name ?? ""}</span>
                      <span>{relativeTime(file.createdAt)}</span>
                      <span>{relativeTime(file.editedAt)}</span>
                      <span>{file.comments}</span>
                      <span className={styles.authorCell}>
                        <i>{file.author.slice(0, 1).toUpperCase()}</i>
                      </span>
                      <div className={styles.rowMenu}>
                        <button
                          type="button"
                          aria-label="File actions"
                          onClick={() => setMenuFileId((prev) => (prev === file.id ? null : file.id))}
                        >
                          ⋯
                        </button>
                        {menuFileId === file.id ? (
                          <div className={styles.menuPop}>
                            <button type="button" onClick={() => openFile(file)}>
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const name = window.prompt("Rename file", file.name);
                                if (!name) return;
                                renameFile(file.id, name);
                                setMenuFileId(null);
                                refresh();
                              }}
                            >
                              Rename
                            </button>
                            <div className={styles.menuMoveGroup}>
                              <span className={styles.menuMoveLabel}>Move to</span>
                              <button
                                type="button"
                                onClick={() => {
                                  moveFileToFolder(file.id, null);
                                  setMenuFileId(null);
                                  refresh();
                                }}
                              >
                                Unsorted
                              </button>
                              {workspace.folders.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    moveFileToFolder(file.id, item.id);
                                    setMenuFileId(null);
                                    refresh();
                                  }}
                                >
                                  {item.name}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                archiveFile(file.id, !file.archived);
                                setMenuFileId(null);
                                refresh();
                              }}
                            >
                              {file.archived ? "Restore" : "Archive"}
                            </button>
                            <button
                              type="button"
                              className={styles.danger}
                              onClick={() => {
                                if (!window.confirm(`Delete "${file.name}"?`)) return;
                                deleteFile(file.id);
                                setMenuFileId(null);
                                refresh();
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </>
        )}

        {view === "bot" && (
          <section className={styles.panelCard}>
            <h2>DrawBot</h2>
            <p className={styles.muted}>Create a board from a short request using built-in templates.</p>
            <div className={styles.botLog}>
              {botLog.map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
            <div className={styles.botRow}>
              <input
                value={botInput}
                onChange={(event) => setBotInput(event.target.value)}
                placeholder="e.g. create an ERD for banking"
              />
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => {
                  const text = botInput.trim().toLowerCase();
                  if (!text) return;
                  setBotLog((prev) => [...prev, `You: ${botInput.trim()}`]);
                  let templateId = "flow-basic";
                  if (text.includes("erd") || text.includes("entity") || text.includes("database")) {
                    templateId = "erd-ecommerce";
                  } else if (text.includes("docker")) {
                    templateId = "docker-arch";
                  } else if (text.includes("aws") || text.includes("cloud")) {
                    templateId = "aws-cicd";
                  } else if (text.includes("sequence")) {
                    templateId = "seq-client-server";
                  } else if (text.includes("freeform") || text.includes("brainstorm")) {
                    templateId = "freeform-board";
                  }
                  const file = createFile({ name: `DrawBot · ${botInput.trim().slice(0, 32)}` });
                  // Store chosen template id in localStorage bridge for board to consume
                  window.localStorage.setItem(
                    `draw-app-pending-template:${file.id}`,
                    templateId,
                  );
                  setBotLog((prev) => [
                    ...prev,
                    `DrawBot: Opening "${file.name}" with template ${templateId}.`,
                  ]);
                  setBotInput("");
                  refresh();
                  router.push(`/board/${file.id}`);
                }}
              >
                Create
              </button>
            </div>
          </section>
        )}

        {view === "presets" && (
          <section className={styles.panelCard}>
            <div className={styles.panelHead}>
              <h2>AI Presets</h2>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  const name = window.prompt("Preset name");
                  const prompt = window.prompt("Prompt text");
                  if (!name || !prompt) return;
                  addPreset(name, prompt, "text");
                  refresh();
                }}
              >
                + Add preset
              </button>
            </div>
            <div className={styles.listCards}>
              {workspace.presets.map((preset) => (
                <article key={preset.id} className={styles.listCard}>
                  <div>
                    <strong>{preset.name}</strong>
                    <p>{preset.prompt}</p>
                  </div>
                  <div className={styles.listActions}>
                    <button
                      type="button"
                      onClick={() => {
                        const file = createFile({ name: preset.name });
                        refresh();
                        router.push(
                          `/board/${file.id}?ai=1&preset=${encodeURIComponent(preset.prompt)}`,
                        );
                      }}
                    >
                      Use
                    </button>
                    <button type="button" onClick={() => { deletePreset(preset.id); refresh(); }}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "styles" && (
          <section className={styles.panelCard}>
            <div className={styles.panelHead}>
              <h2>Custom Styles</h2>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  const name = window.prompt("Style name", "My style");
                  if (!name) return;
                  addStyle({
                    name,
                    strokeColor: "#1f1f2e",
                    backgroundColor: "#f7f7fb",
                    accent: "#6858f8",
                  });
                  refresh();
                }}
              >
                + Add style
              </button>
            </div>
            <div className={styles.listCards}>
              {workspace.styles.map((style) => (
                <article key={style.id} className={styles.listCard}>
                  <div className={styles.styleSwatches}>
                    <i style={{ background: style.strokeColor }} />
                    <i style={{ background: style.backgroundColor }} />
                    <i style={{ background: style.accent }} />
                  </div>
                  <div>
                    <strong>{style.name}</strong>
                    <p>
                      Stroke {style.strokeColor} · Bg {style.backgroundColor}
                    </p>
                  </div>
                  <div className={styles.listActions}>
                    <button
                      type="button"
                      onClick={() => {
                        window.localStorage.setItem(
                          "draw-app-active-style",
                          JSON.stringify(style),
                        );
                        const file = createFile({ name: `${style.name} board` });
                        refresh();
                        router.push(`/board/${file.id}`);
                      }}
                    >
                      Apply on new board
                    </button>
                    <button type="button" onClick={() => { deleteStyle(style.id); refresh(); }}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "github" && (
          <section className={styles.panelCard}>
            <h2>Github Sync</h2>
            <p className={styles.muted}>
              Store a sync target for diagram exports. Sync marks a timestamp and keeps your settings.
            </p>
            <div className={styles.formGrid}>
              <label>
                Repository
                <input
                  value={workspace.github.repo}
                  placeholder="org/repo"
                  onChange={(event) => {
                    updateGithub({ repo: event.target.value });
                    refresh();
                  }}
                />
              </label>
              <label>
                Branch
                <input
                  value={workspace.github.branch}
                  onChange={(event) => {
                    updateGithub({ branch: event.target.value });
                    refresh();
                  }}
                />
              </label>
              <label>
                Path
                <input
                  value={workspace.github.path}
                  onChange={(event) => {
                    updateGithub({ path: event.target.value });
                    refresh();
                  }}
                />
              </label>
            </div>
            <div className={styles.listActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => {
                  if (!workspace.github.repo.trim()) {
                    alert("Enter a repository like org/repo first.");
                    return;
                  }
                  markGithubSynced();
                  refresh();
                  alert(`Synced settings for ${workspace.github.repo}@${workspace.github.branch}`);
                }}
              >
                Sync now
              </button>
              <span className={styles.muted}>
                {workspace.github.lastSyncedAt
                  ? `Last synced ${relativeTime(workspace.github.lastSyncedAt)}`
                  : "Not synced yet"}
              </span>
            </div>
          </section>
        )}

        {view === "mcp" && (
          <section className={styles.panelCard}>
            <h2>DrawApp MCP</h2>
            <p className={styles.muted}>
              Connect Claude Code, Claude Desktop, Cursor, VS Code, Codex, or GitHub Copilot to the
              real <code>apps/mcp-server</code> using client-specific setup steps.
            </p>
            <div className={styles.mcpStatus}>
              <strong>Status:</strong>{" "}
              {workspace.mcp.connected ? "Marked connected" : "Not connected yet"}
              {workspace.mcp.lastCheckedAt
                ? ` · checked ${relativeTime(workspace.mcp.lastCheckedAt)}`
                : ""}
            </div>
            <button type="button" className={styles.primaryButton} onClick={() => openSettings("mcp")}>
              Open MCP settings
            </button>
          </section>
        )}
      </main>

      <SettingsModal
        open={settingsOpen}
        initialTab={settingsTab}
        workspace={workspace}
        onClose={() => setSettingsOpen(false)}
        onRefresh={refresh}
      />

      <button type="button" className={styles.helpFab} title="Shortcuts: Alt+N new file, Ctrl+K search">
        ?
      </button>
    </div>
  );
}
