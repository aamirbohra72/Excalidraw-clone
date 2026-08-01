"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../dashboard.module.css";
import {
  MCP_TOOLS,
  createApiToken,
  createFolder,
  deleteApiToken,
  deleteFolder,
  getAppearanceMode,
  getMcpClientSetups,
  getMcpProjectRoot,
  listApiTokens,
  markGithubSynced,
  relativeTime,
  setAppearanceMode,
  setMcpProjectRoot,
  updateGithub,
  updateMcp,
  updateProfile,
  setWorkspacePlan,
  type McpClientId,
  type WorkspaceApiToken,
  type WorkspaceState,
} from "../lib/workspaceStore";
import { loadCustomIcons, saveCustomIcons, type LibraryIcon } from "../lib/iconLibrary";

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
  prefill?: { name?: string; email?: string };
};

type SettingsTab =
  | "members"
  | "billing"
  | "git"
  | "icons"
  | "tokens"
  | "team"
  | "profile"
  | "appearance"
  | "mcp";

type SettingsModalProps = {
  open: boolean;
  initialTab?: SettingsTab;
  workspace: WorkspaceState;
  onClose: () => void;
  onRefresh: () => void;
};

const TEAM_TABS: Array<{ id: SettingsTab; label: string; icon: string }> = [
  { id: "members", label: "Team Members", icon: "👥" },
  { id: "billing", label: "Plans & Billing", icon: "▤" },
  { id: "git", label: "Git Connect", icon: "◇" },
  { id: "icons", label: "Custom Icons", icon: "★" },
  { id: "tokens", label: "API Tokens", icon: "🔑" },
  { id: "team", label: "Team Settings", icon: "⚙" },
];

const PERSONAL_TABS: Array<{ id: SettingsTab; label: string; icon: string }> = [
  { id: "profile", label: "Profile", icon: "☺" },
  { id: "appearance", label: "Appearance", icon: "👁" },
  { id: "mcp", label: "MCP", icon: "⏻" },
];

const CLIENT_ICONS: Record<McpClientId, string> = {
  "claude-code": "C",
  "claude-ai": "✱",
  codex: "◎",
  vscode: "</>",
  cursor: "◆",
  copilot: "⌘",
};

export default function SettingsModal({
  open,
  initialTab = "mcp",
  workspace,
  onClose,
  onRefresh,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [clientId, setClientId] = useState<McpClientId>("cursor");
  const [projectRoot, setProjectRoot] = useState(getMcpProjectRoot());
  const [copied, setCopied] = useState(false);
  const [teamName, setTeamName] = useState(workspace.teamName);
  const [author, setAuthor] = useState(workspace.author);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invites, setInvites] = useState<string[]>([]);
  const [tokens, setTokens] = useState<WorkspaceApiToken[]>([]);
  const [tokenName, setTokenName] = useState("");
  const [customIcons, setCustomIcons] = useState<LibraryIcon[]>([]);
  const [appearance, setAppearance] = useState(getAppearanceMode());
  const [githubRepo, setGithubRepo] = useState(workspace.github.repo);
  const [githubBranch, setGithubBranch] = useState(workspace.github.branch);
  const [githubPath, setGithubPath] = useState(workspace.github.path);
  const [newFolderName, setNewFolderName] = useState("");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingMessage, setBillingMessage] = useState("");
  const [billingError, setBillingError] = useState("");

  const isTeamPlan = workspace.billing?.plan === "team";
  const isRazorpayTestMode = (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "").startsWith(
    "rzp_test_",
  );

  const loadRazorpayScript = () =>
    new Promise<boolean>((resolve) => {
      if (typeof window === "undefined") {
        resolve(false);
        return;
      }
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay="checkout"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(true));
        existing.addEventListener("error", () => resolve(false));
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.dataset.razorpay = "checkout";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const simulateTeamUpgrade = () => {
    if (!isRazorpayTestMode) return;
    setBillingError("");
    setWorkspacePlan("team", {
      paymentId: `pay_sim_${Date.now().toString(36)}`,
      orderId: `order_sim_${Date.now().toString(36)}`,
    });
    onRefresh();
    setBillingMessage("Simulated Team upgrade (test mode only). No Razorpay charge.");
  };

  const startTeamCheckout = async () => {
    setBillingBusy(true);
    setBillingError("");
    setBillingMessage("");
    try {
      const orderRes = await fetch("/api/razorpay/order", { method: "POST" });
      const orderData = (await orderRes.json()) as {
        error?: string;
        orderId?: string;
        amount?: number;
        currency?: string;
        keyId?: string;
        name?: string;
        description?: string;
      };
      if (!orderRes.ok || !orderData.orderId || !orderData.keyId) {
        throw new Error(orderData.error || "Could not create payment order");
      }

      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        throw new Error("Razorpay checkout failed to load. Check your network.");
      }

      const checkout = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount ?? 9900,
        currency: orderData.currency ?? "INR",
        name: orderData.name ?? "DrawApp",
        description: orderData.description ?? "Team plan",
        order_id: orderData.orderId,
        theme: { color: "#2563eb" },
        prefill: { name: workspace.author },
        modal: {
          ondismiss: () => {
            setBillingBusy(false);
            setBillingMessage("Checkout closed. No charge was made.");
          },
        },
        handler: async (response) => {
          try {
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            });
            const verifyData = (await verifyRes.json()) as { error?: string; ok?: boolean };
            if (!verifyRes.ok || !verifyData.ok) {
              throw new Error(verifyData.error || "Payment verification failed");
            }
            setWorkspacePlan("team", {
              paymentId: response.razorpay_payment_id,
              orderId: response.razorpay_order_id,
            });
            onRefresh();
            setBillingMessage("Payment successful. Team plan is now active.");
            setBillingError("");
          } catch (error) {
            setBillingError(error instanceof Error ? error.message : "Verification failed");
          } finally {
            setBillingBusy(false);
          }
        },
      });

      checkout.open();
    } catch (error) {
      setBillingBusy(false);
      setBillingError(error instanceof Error ? error.message : "Checkout failed");
    }
  };

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setBillingBusy(false);
    setBillingError("");
    setBillingMessage("");
    setProjectRoot(getMcpProjectRoot());
    setTeamName(workspace.teamName);
    setAuthor(workspace.author);
    setGithubRepo(workspace.github.repo);
    setGithubBranch(workspace.github.branch);
    setGithubPath(workspace.github.path);
    setTokens(listApiTokens());
    setCustomIcons(loadCustomIcons());
    setAppearance(getAppearanceMode());
    try {
      const raw = window.localStorage.getItem("draw-app-invites-v1");
      setInvites(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setInvites([]);
    }
  }, [open, initialTab, workspace]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const setups = useMemo(() => getMcpClientSetups(projectRoot), [projectRoot]);
  const activeSetup = setups.find((item) => item.id === clientId) ?? setups[0]!;

  if (!open) {
    return null;
  }

  if (!activeSetup) {
    return null;
  }

  const copyText = async (value: string, markConnected = false) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
    if (markConnected) {
      updateMcp({
        connected: true,
        notes: `Setup copied for ${activeSetup.name}`,
      });
      onRefresh();
    }
  };

  const saveInvites = (next: string[]) => {
    setInvites(next);
    window.localStorage.setItem("draw-app-invites-v1", JSON.stringify(next));
  };

  return (
    <div className={styles.settingsOverlay} onClick={onClose}>
      <div
        className={styles.settingsModal}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.settingsHeader}>
          <h2>Settings</h2>
          <button type="button" className={styles.settingsClose} onClick={onClose}>
            Close <span>Esc</span>
          </button>
        </header>

        <div className={styles.settingsBody}>
          <aside className={styles.settingsNav}>
            <p className={styles.settingsNavGroup}>Team</p>
            {TEAM_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.settingsNavItem} ${
                  tab === item.id ? styles.settingsNavItemActive : ""
                }`}
                onClick={() => setTab(item.id)}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </button>
            ))}
            <p className={styles.settingsNavGroup}>Personal</p>
            {PERSONAL_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.settingsNavItem} ${
                  tab === item.id ? styles.settingsNavItemActive : ""
                }`}
                onClick={() => setTab(item.id)}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </aside>

          <section className={styles.settingsContent}>
            {tab === "mcp" && (
              <>
                <p className={styles.settingsLead}>
                  Choose your client, then follow the steps to connect it to DrawApp. Or build the
                  server first with <code>pnpm --filter mcp-server build</code>.
                </p>

                <label className={styles.settingsField}>
                  <span>Repo root (MCP cwd)</span>
                  <div className={styles.settingsInlineRow}>
                    <input
                      value={projectRoot}
                      onChange={(event) => setProjectRoot(event.target.value)}
                      placeholder="D:/Excalidraw-DrawApp-practice-w-22"
                    />
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        setMcpProjectRoot(projectRoot);
                        onRefresh();
                      }}
                    >
                      Save path
                    </button>
                  </div>
                </label>

                <div className={styles.mcpClientGrid}>
                  {setups.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      className={`${styles.mcpClientCard} ${
                        clientId === client.id ? styles.mcpClientCardActive : ""
                      }`}
                      onClick={() => setClientId(client.id)}
                    >
                      {clientId === client.id ? (
                        <span className={styles.mcpClientCheck} aria-hidden>
                          ✓
                        </span>
                      ) : null}
                      <span className={styles.mcpClientLogo}>{CLIENT_ICONS[client.id]}</span>
                      <strong>{client.name}</strong>
                    </button>
                  ))}
                </div>

                <div className={styles.mcpSetupPanel}>
                  <div className={styles.mcpSetupHead}>
                    <span className={styles.mcpClientLogo}>{CLIENT_ICONS[activeSetup.id]}</span>
                    <div>
                      <h3>Set up {activeSetup.name}</h3>
                      <p>{activeSetup.subtitle}</p>
                    </div>
                  </div>

                  <ol className={styles.steps}>
                    {activeSetup.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>

                  {activeSetup.configPath ? (
                    <p className={styles.muted}>Config path: <code>{activeSetup.configPath}</code></p>
                  ) : null}

                  <p className={styles.mcpRunLabel}>{activeSetup.runLabel}</p>
                  <div className={styles.mcpCodeBox}>
                    <pre>
                      {activeSetup.command ?? activeSetup.configJson ?? ""}
                    </pre>
                    <button
                      type="button"
                      className={styles.mcpCopyButton}
                      onClick={() =>
                        void copyText(
                          activeSetup.command ?? activeSetup.configJson ?? "",
                          true,
                        )
                      }
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>

                  {activeSetup.command && activeSetup.configJson ? (
                    <>
                      <p className={styles.mcpRunLabel}>Or paste JSON config</p>
                      <div className={styles.mcpCodeBox}>
                        <pre>{activeSetup.configJson}</pre>
                        <button
                          type="button"
                          className={styles.mcpCopyButton}
                          onClick={() => void copyText(activeSetup.configJson ?? "", true)}
                        >
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </>
                  ) : null}

                  <div className={styles.mcpStatus}>
                    <strong>Status:</strong>{" "}
                    {workspace.mcp.connected ? "Marked connected" : "Not connected yet"}
                    {workspace.mcp.lastCheckedAt
                      ? ` · checked ${relativeTime(workspace.mcp.lastCheckedAt)}`
                      : ""}
                    {workspace.mcp.notes ? ` · ${workspace.mcp.notes}` : ""}
                  </div>

                  <div className={styles.listActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => {
                        updateMcp({
                          connected: true,
                          notes: `Connected via ${activeSetup.name}`,
                        });
                        onRefresh();
                      }}
                    >
                      Mark as connected
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        updateMcp({ connected: false, notes: "" });
                        onRefresh();
                      }}
                    >
                      Reset status
                    </button>
                  </div>

                  <h3 className={styles.subheading}>Available MCP tools</h3>
                  <ul className={styles.toolList}>
                    {MCP_TOOLS.map((tool) => (
                      <li key={tool.name}>
                        <code>{tool.name}</code> — {tool.description}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {tab === "members" && (
              <>
                <h3 className={styles.settingsPanelTitle}>Team Members</h3>
                <p className={styles.settingsLead}>
                  Invite people to <strong>{workspace.teamName}</strong>. Invites are stored in this
                  browser workspace and the invite link copies your DrawApp URL.
                </p>
                <div className={styles.settingsMemberCard}>
                  <div className={styles.settingsAvatar}>
                    {(workspace.author || "Y").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong>{workspace.author}</strong>
                    <p className={styles.muted}>Owner · local workspace</p>
                  </div>
                </div>
                {invites.map((email) => (
                  <div key={email} className={styles.settingsMemberCard}>
                    <div className={styles.settingsAvatar}>{email.slice(0, 1).toUpperCase()}</div>
                    <div>
                      <strong>{email}</strong>
                      <p className={styles.muted}>Invited · pending accept</p>
                    </div>
                    <button
                      type="button"
                      className={styles.dangerLink}
                      onClick={() => saveInvites(invites.filter((item) => item !== email))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className={styles.settingsInlineRow}>
                  <input
                    type="email"
                    placeholder="teammate@company.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => {
                      const email = inviteEmail.trim().toLowerCase();
                      if (!email || invites.includes(email)) return;
                      saveInvites([email, ...invites]);
                      setInviteEmail("");
                      void navigator.clipboard.writeText(window.location.origin);
                    }}
                  >
                    Invite
                  </button>
                </div>
              </>
            )}

            {tab === "billing" && (
              <>
                <h3 className={styles.settingsPanelTitle}>Plans & Billing</h3>
                <p className={styles.settingsLead}>
                  Upgrade with Razorpay test checkout. No real money is charged in test mode.
                </p>
                <div className={styles.planGrid}>
                  <article
                    className={`${styles.planCard}${!isTeamPlan ? ` ${styles.planCardActive}` : ""}`}
                  >
                    <h4>Practice</h4>
                    <p className={styles.planPrice}>Free</p>
                    <ul>
                      <li>Unlimited local boards</li>
                      <li>Diagram catalog + icon library</li>
                      <li>Mistral docs & diagram AI (env key)</li>
                      <li>stdio MCP server</li>
                    </ul>
                    <button type="button" className={styles.secondaryButton} disabled>
                      {!isTeamPlan ? "Current plan" : "Free tier"}
                    </button>
                  </article>
                  <article
                    className={`${styles.planCard}${isTeamPlan ? ` ${styles.planCardActive}` : ""}`}
                  >
                    <h4>Team</h4>
                    <p className={styles.planPrice}>₹99</p>
                    <ul>
                      <li>Shared folders & invites</li>
                      <li>GitHub sync settings</li>
                      <li>API tokens for integrations</li>
                      <li>MCP client setup guide</li>
                    </ul>
                    {isTeamPlan ? (
                      <button type="button" className={styles.secondaryButton} disabled>
                        Current plan
                      </button>
                    ) : (
                      <div className={styles.billingActions}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          disabled={billingBusy}
                          onClick={() => void startTeamCheckout()}
                        >
                          {billingBusy ? "Opening Razorpay…" : "Upgrade with Razorpay"}
                        </button>
                        {isRazorpayTestMode ? (
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            disabled={billingBusy}
                            onClick={simulateTeamUpgrade}
                          >
                            Simulate success (test)
                          </button>
                        ) : null}
                      </div>
                    )}
                  </article>
                </div>
                {billingError ? <p className={styles.billingError}>{billingError}</p> : null}
                {billingMessage ? <p className={styles.billingSuccess}>{billingMessage}</p> : null}
                {isTeamPlan && workspace.billing?.upgradedAt ? (
                  <p className={styles.billingMeta}>
                    Team since {relativeTime(workspace.billing.upgradedAt)}
                    {workspace.billing.razorpayPaymentId
                      ? ` · Payment ${workspace.billing.razorpayPaymentId}`
                      : ""}
                  </p>
                ) : (
                  <div className={styles.billingHelp}>
                    <p>
                      <strong>Why “International cards are not supported”?</strong> Your Razorpay
                      account only accepts domestic Indian cards right now. Don’t use a real /
                      foreign card.
                    </p>
                    <p>
                      In checkout, pick <strong>Netbanking</strong> → any bank → click{" "}
                      <strong>Success</strong> on the mock bank page.
                    </p>
                    <p>
                      Or Cards → domestic test Visa <code>4111 1111 1111 1111</code> · any future
                      expiry · any CVV · OTP any 4–10 digits (e.g. <code>1234</code>).
                    </p>
                  </div>
                )}
              </>
            )}

            {tab === "git" && (
              <>
                <h3 className={styles.settingsPanelTitle}>Git Connect</h3>
                <p className={styles.settingsLead}>
                  Store GitHub sync targets for exporting diagram JSON into your repository path.
                </p>
                <div className={styles.formGrid}>
                  <label>
                    Repository
                    <input
                      value={githubRepo}
                      onChange={(event) => setGithubRepo(event.target.value)}
                      placeholder="org/repo"
                    />
                  </label>
                  <label>
                    Branch
                    <input
                      value={githubBranch}
                      onChange={(event) => setGithubBranch(event.target.value)}
                      placeholder="main"
                    />
                  </label>
                  <label>
                    Path
                    <input
                      value={githubPath}
                      onChange={(event) => setGithubPath(event.target.value)}
                      placeholder="diagrams"
                    />
                  </label>
                </div>
                <div className={styles.listActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => {
                      updateGithub({
                        repo: githubRepo.trim(),
                        branch: githubBranch.trim() || "main",
                        path: githubPath.trim() || "diagrams",
                        enabled: Boolean(githubRepo.trim()),
                      });
                      onRefresh();
                    }}
                  >
                    Save Git settings
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (!githubRepo.trim()) return;
                      updateGithub({
                        repo: githubRepo.trim(),
                        branch: githubBranch.trim() || "main",
                        path: githubPath.trim() || "diagrams",
                        enabled: true,
                      });
                      markGithubSynced();
                      onRefresh();
                    }}
                  >
                    Sync now
                  </button>
                </div>
                <p className={styles.muted}>
                  {workspace.github.lastSyncedAt
                    ? `Last synced ${relativeTime(workspace.github.lastSyncedAt)}`
                    : "Not synced yet"}
                </p>
              </>
            )}

            {tab === "icons" && (
              <>
                <h3 className={styles.settingsPanelTitle}>Custom Icons</h3>
                <p className={styles.settingsLead}>
                  Icons uploaded from the board Icon Library are stored in this browser. Open any
                  board → Insert → Icon library → Custom Icons to upload SVG/PNG.
                </p>
                {customIcons.length === 0 ? (
                  <p className={styles.empty}>No custom icons yet.</p>
                ) : (
                  <div className={styles.settingsIconGrid}>
                    {customIcons.map((icon) => (
                      <div key={icon.id} className={styles.settingsIconCard}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={icon.src} alt={icon.name} />
                        <strong>{icon.name}</strong>
                        <button
                          type="button"
                          className={styles.dangerLink}
                          onClick={() => {
                            const next = customIcons.filter((item) => item.id !== icon.id);
                            saveCustomIcons(next);
                            setCustomIcons(next);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === "tokens" && (
              <>
                <h3 className={styles.settingsPanelTitle}>API Tokens</h3>
                <p className={styles.settingsLead}>
                  Create workspace tokens for local integrations. Server AI still uses{" "}
                  <code>MISTRAL_API_KEY</code> / <code>OPENAI_API_KEY</code> in{" "}
                  <code>apps/web/.env.local</code>.
                </p>
                <div className={styles.settingsInlineRow}>
                  <input
                    value={tokenName}
                    onChange={(event) => setTokenName(event.target.value)}
                    placeholder="Token name, e.g. CI bot"
                  />
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => {
                      const created = createApiToken(tokenName);
                      setTokenName("");
                      setTokens(listApiTokens());
                      void navigator.clipboard.writeText(created.token);
                    }}
                  >
                    Create & copy
                  </button>
                </div>
                {tokens.length === 0 ? (
                  <p className={styles.empty}>No API tokens yet.</p>
                ) : (
                  <div className={styles.settingsTokenList}>
                    {tokens.map((token) => (
                      <div key={token.id} className={styles.settingsTokenRow}>
                        <div>
                          <strong>{token.name}</strong>
                          <p className={styles.muted}>
                            <code>{token.token.slice(0, 10)}…</code> · created{" "}
                            {relativeTime(token.createdAt)}
                          </p>
                        </div>
                        <div className={styles.listActions}>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => void navigator.clipboard.writeText(token.token)}
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            className={styles.dangerLink}
                            onClick={() => {
                              deleteApiToken(token.id);
                              setTokens(listApiTokens());
                            }}
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === "team" && (
              <>
                <h3 className={styles.settingsPanelTitle}>Team Settings</h3>
                <label className={styles.settingsField}>
                  <span>Team name</span>
                  <input value={teamName} onChange={(event) => setTeamName(event.target.value)} />
                </label>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => {
                    updateProfile({ teamName });
                    onRefresh();
                  }}
                >
                  Save team
                </button>
                <h4 className={styles.subheading}>Folders</h4>
                <div className={styles.folderRow}>
                  {workspace.folders.map((folder) => (
                    <span key={folder.id} className={styles.folderChip}>
                      {folder.name}
                      <button
                        type="button"
                        className={styles.dangerLink}
                        onClick={() => {
                          deleteFolder(folder.id);
                          onRefresh();
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className={styles.settingsInlineRow}>
                  <input
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    placeholder="New folder name"
                  />
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (!newFolderName.trim()) return;
                      createFolder(newFolderName.trim());
                      setNewFolderName("");
                      onRefresh();
                    }}
                  >
                    Add folder
                  </button>
                </div>
              </>
            )}

            {tab === "profile" && (
              <>
                <h3 className={styles.settingsPanelTitle}>Profile</h3>
                <label className={styles.settingsField}>
                  <span>Display name</span>
                  <input value={author} onChange={(event) => setAuthor(event.target.value)} />
                </label>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => {
                    updateProfile({ author });
                    onRefresh();
                  }}
                >
                  Save profile
                </button>
              </>
            )}

            {tab === "appearance" && (
              <>
                <h3 className={styles.settingsPanelTitle}>Appearance</h3>
                <p className={styles.settingsLead}>Choose how DrawApp looks in this browser.</p>
                <div className={styles.appearanceRow}>
                  {(["system", "light", "dark"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`${styles.appearanceChip} ${
                        appearance === mode ? styles.appearanceChipActive : ""
                      }`}
                      onClick={() => {
                        setAppearance(mode);
                        setAppearanceMode(mode);
                      }}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
