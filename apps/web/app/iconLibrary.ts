export type IconCategoryId = "custom" | "general" | "tech" | "cloud" | "diagram";

export type LibraryIcon = {
  id: string;
  name: string;
  category: IconCategoryId;
  src: string;
  keywords: string[];
};

export const ICON_CATEGORIES: Array<{
  id: IconCategoryId;
  label: string;
  hint: string;
}> = [
  { id: "custom", label: "Custom Icons", hint: "Your uploads" },
  { id: "general", label: "General icons", hint: "UI & symbols" },
  { id: "diagram", label: "Diagram icons", hint: "Actors & nodes" },
  { id: "tech", label: "Tech logos", hint: "Popular tools" },
  { id: "cloud", label: "Cloud icons", hint: "AWS · Azure · GCP" },
];

const svgDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Soft pastel tile + crisp line glyph (Eraser-style). */
const softIcon = (paths: string, tint: string, stroke = "#2f3650") =>
  svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <defs>
    <linearGradient id="bg" x1="8" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
      <stop stop-color="${tint}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="${tint}" stop-opacity="0.14"/>
    </linearGradient>
  </defs>
  <rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="url(#bg)" stroke="${tint}" stroke-opacity="0.35" stroke-width="1.2"/>
  <g transform="translate(12 12)" stroke="${stroke}" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" fill="none">${paths}</g>
</svg>`);

/** Brand tile with soft shadow edge. */
const brandIcon = (inner: string, bg: string) =>
  svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="shine" x1="8" y1="2" x2="40" y2="46" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="48" height="48" rx="12" fill="${bg}"/>
  <rect width="48" height="48" rx="12" fill="url(#shine)"/>
  ${inner}
</svg>`);

export const BUILTIN_ICONS: LibraryIcon[] = [
  // —— General ——
  {
    id: "activity",
    name: "Activity",
    category: "general",
    keywords: ["chart", "pulse"],
    src: softIcon('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>', "#845ef7"),
  },
  {
    id: "alert",
    name: "Alert",
    category: "general",
    keywords: ["warning"],
    src: softIcon(
      '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      "#ffa94d",
    ),
  },
  {
    id: "archive",
    name: "Archive",
    category: "general",
    keywords: ["box", "storage"],
    src: softIcon(
      '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><line x1="10" y1="12" x2="14" y2="12"/>',
      "#748ffc",
    ),
  },
  {
    id: "award",
    name: "Award",
    category: "general",
    keywords: ["badge"],
    src: softIcon(
      '<circle cx="12" cy="8" r="6"/><path d="M8.2 13.2 7 22l5-3 5 3-1.2-8.8"/>',
      "#fcc419",
    ),
  },
  {
    id: "bar-chart",
    name: "Bar chart",
    category: "general",
    keywords: ["stats"],
    src: softIcon(
      '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      "#4dabf7",
    ),
  },
  {
    id: "bell",
    name: "Bell",
    category: "general",
    keywords: ["notify"],
    src: softIcon(
      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
      "#ff8787",
    ),
  },
  {
    id: "bookmark",
    name: "Bookmark",
    category: "general",
    keywords: ["save"],
    src: softIcon('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>', "#da77f2"),
  },
  {
    id: "calendar",
    name: "Calendar",
    category: "general",
    keywords: ["date"],
    src: softIcon(
      '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
      "#66d9e8",
    ),
  },
  {
    id: "camera",
    name: "Camera",
    category: "general",
    keywords: ["photo"],
    src: softIcon(
      '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
      "#91a7ff",
    ),
  },
  {
    id: "check-circle",
    name: "Check",
    category: "general",
    keywords: ["done", "success"],
    src: softIcon('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', "#51cf66"),
  },
  {
    id: "cloud",
    name: "Cloud",
    category: "general",
    keywords: ["weather", "storage"],
    src: softIcon('<path d="M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>', "#74c0fc"),
  },
  {
    id: "code",
    name: "Code",
    category: "general",
    keywords: ["dev"],
    src: softIcon(
      '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
      "#9775fa",
    ),
  },
  {
    id: "database",
    name: "Database",
    category: "general",
    keywords: ["db", "sql"],
    src: softIcon(
      '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
      "#339af0",
    ),
  },
  {
    id: "globe",
    name: "Globe",
    category: "general",
    keywords: ["world", "web"],
    src: softIcon(
      '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
      "#22b8cf",
    ),
  },
  {
    id: "lock",
    name: "Lock",
    category: "general",
    keywords: ["secure", "auth"],
    src: softIcon(
      '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
      "#ff922b",
    ),
  },
  {
    id: "users",
    name: "Users",
    category: "general",
    keywords: ["people", "team"],
    src: softIcon(
      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
      "#748ffc",
    ),
  },
  {
    id: "server",
    name: "Server",
    category: "general",
    keywords: ["host", "rack"],
    src: softIcon(
      '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
      "#4c6ef5",
    ),
  },
  {
    id: "zap",
    name: "Zap",
    category: "general",
    keywords: ["bolt", "fast"],
    src: softIcon('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', "#fcc419"),
  },
  {
    id: "container",
    name: "Container",
    category: "general",
    keywords: ["box", "cube", "docker"],
    src: softIcon(
      '<path d="M12 3 3 8v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
      "#15aabf",
    ),
  },
  {
    id: "user",
    name: "User",
    category: "general",
    keywords: ["person"],
    src: softIcon(
      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      "#748ffc",
    ),
  },
  {
    id: "heart",
    name: "Heart",
    category: "general",
    keywords: ["like", "love"],
    src: softIcon(
      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
      "#ff6b6b",
    ),
  },
  {
    id: "star",
    name: "Star",
    category: "general",
    keywords: ["favorite"],
    src: softIcon(
      '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
      "#fcc419",
    ),
  },
  {
    id: "mail",
    name: "Mail",
    category: "general",
    keywords: ["email", "invite"],
    src: softIcon(
      '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/>',
      "#ff8787",
    ),
  },
  {
    id: "message",
    name: "Message",
    category: "general",
    keywords: ["chat"],
    src: softIcon(
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
      "#69db7c",
    ),
  },
  {
    id: "home",
    name: "Home",
    category: "general",
    keywords: ["house", "workspace"],
    src: softIcon(
      '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>',
      "#63e6be",
    ),
  },
  {
    id: "settings",
    name: "Settings",
    category: "general",
    keywords: ["gear", "config"],
    src: softIcon(
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
      "#adb5bd",
    ),
  },
  {
    id: "file",
    name: "File",
    category: "general",
    keywords: ["document"],
    src: softIcon(
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
      "#a9e34b",
    ),
  },
  {
    id: "folder",
    name: "Folder",
    category: "general",
    keywords: ["directory"],
    src: softIcon(
      '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
      "#ffd43b",
    ),
  },
  {
    id: "link",
    name: "Link",
    category: "general",
    keywords: ["url", "connect"],
    src: softIcon(
      '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7.1-7.1l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7.1 7.1l1.5-1.5"/>',
      "#748ffc",
    ),
  },
  {
    id: "shield",
    name: "Shield",
    category: "general",
    keywords: ["security"],
    src: softIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', "#51cf66"),
  },

  // —— Diagram actors (sequence / freeform) ——
  {
    id: "monitor",
    name: "Monitor",
    category: "diagram",
    keywords: ["client", "desktop", "screen"],
    src: softIcon(
      '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
      "#ced4da",
    ),
  },
  {
    id: "tool",
    name: "Tool",
    category: "diagram",
    keywords: ["service", "wrench"],
    src: softIcon(
      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8z"/>',
      "#8ce99a",
    ),
  },
  {
    id: "mobile",
    name: "Mobile",
    category: "diagram",
    keywords: ["phone", "app"],
    src: softIcon(
      '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
      "#74c0fc",
    ),
  },
  {
    id: "browser",
    name: "Browser",
    category: "diagram",
    keywords: ["web", "window"],
    src: softIcon(
      '<rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><circle cx="6" cy="6" r="0.8" fill="#2f3650" stroke="none"/><circle cx="9" cy="6" r="0.8" fill="#2f3650" stroke="none"/>',
      "#a5d8ff",
    ),
  },
  {
    id: "api",
    name: "API",
    category: "diagram",
    keywords: ["endpoint", "rest"],
    src: softIcon(
      '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
      "#b197fc",
    ),
  },
  {
    id: "queue",
    name: "Queue",
    category: "diagram",
    keywords: ["message", "broker"],
    src: softIcon(
      '<rect x="2" y="5" width="20" height="4" rx="1"/><rect x="2" y="11" width="20" height="4" rx="1"/><rect x="2" y="17" width="14" height="4" rx="1"/>',
      "#ffa8a8",
    ),
  },
  {
    id: "decision",
    name: "Decision",
    category: "diagram",
    keywords: ["diamond", "flow"],
    src: softIcon('<path d="M12 2 22 12 12 22 2 12z"/>', "#ffe066"),
  },
  {
    id: "process",
    name: "Process",
    category: "diagram",
    keywords: ["box", "step"],
    src: softIcon('<rect x="3" y="5" width="18" height="14" rx="2"/>', "#a5d8ff"),
  },
  {
    id: "start-end",
    name: "Start / End",
    category: "diagram",
    keywords: ["terminator", "oval"],
    src: softIcon('<ellipse cx="12" cy="12" rx="10" ry="6"/>', "#b2f2bb"),
  },
  {
    id: "entity",
    name: "Entity",
    category: "diagram",
    keywords: ["erd", "table"],
    src: softIcon(
      '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>',
      "#d0bfff",
    ),
  },

  // —— Tech ——
  {
    id: "react",
    name: "React",
    category: "tech",
    keywords: ["js", "frontend"],
    src: brandIcon(
      '<circle cx="24" cy="24" r="3.2" fill="#61dafb"/><ellipse cx="24" cy="24" rx="14" ry="5.5" fill="none" stroke="#61dafb" stroke-width="1.7"/><ellipse cx="24" cy="24" rx="14" ry="5.5" fill="none" stroke="#61dafb" stroke-width="1.7" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="14" ry="5.5" fill="none" stroke="#61dafb" stroke-width="1.7" transform="rotate(120 24 24)"/>',
      "#0b1324",
    ),
  },
  {
    id: "nodejs",
    name: "Node.js",
    category: "tech",
    keywords: ["js", "backend"],
    src: brandIcon(
      '<path d="M24 9 35 15.5v13L24 35 13 28.5v-13z" fill="none" stroke="#8cc84b" stroke-width="2.2"/><text x="24" y="27" text-anchor="middle" fill="#8cc84b" font-size="10" font-family="Segoe UI,sans-serif" font-weight="700">JS</text>',
      "#1a1f16",
    ),
  },
  {
    id: "docker",
    name: "Docker",
    category: "tech",
    keywords: ["container"],
    src: brandIcon(
      '<rect x="11" y="22" width="5" height="4" rx="0.6" fill="#fff"/><rect x="17" y="22" width="5" height="4" rx="0.6" fill="#fff"/><rect x="23" y="22" width="5" height="4" rx="0.6" fill="#fff"/><rect x="17" y="17" width="5" height="4" rx="0.6" fill="#fff"/><rect x="23" y="17" width="5" height="4" rx="0.6" fill="#fff"/><rect x="23" y="12" width="5" height="4" rx="0.6" fill="#fff"/><path d="M10 28h26c1.2 3.8-1.5 7-7.5 7H18c-6 0-9.2-3-8-7z" fill="#fff" opacity=".92"/>',
      "#1d8fd6",
    ),
  },
  {
    id: "github",
    name: "GitHub",
    category: "tech",
    keywords: ["git"],
    src: brandIcon(
      '<path fill="#fff" d="M24 10c-7.2 0-13 5.8-13 13 0 5.7 3.7 10.6 8.9 12.3.7.1.9-.3.9-.6v-2.2c-3.6.8-4.4-1.5-4.4-1.5-.6-1.4-1.4-1.8-1.4-1.8-1.2-.8.1-.8.1-.8 1.3.1 2 1.3 2 1.3 1.2 2 3.1 1.4 3.8 1.1.1-.9.5-1.4.8-1.8-2.9-.3-5.9-1.4-5.9-6.4 0-1.4.5-2.6 1.3-3.5-.1-.3-.6-1.6.1-3.4 0 0 1.1-.3 3.6 1.3a12.5 12.5 0 0 1 6.6 0c2.5-1.6 3.6-1.3 3.6-1.3.7 1.8.2 3.1.1 3.4.8.9 1.3 2.1 1.3 3.5 0 5-3.1 6.1-6 6.4.5.4.9 1.2.9 2.4v3.5c0 .3.2.7.9.6A13 13 0 0 0 37 23c0-7.2-5.8-13-13-13z"/>',
      "#1b1f23",
    ),
  },
  {
    id: "typescript",
    name: "TypeScript",
    category: "tech",
    keywords: ["ts"],
    src: brandIcon(
      '<text x="24" y="29" text-anchor="middle" fill="#fff" font-size="15" font-family="Segoe UI,sans-serif" font-weight="700">TS</text>',
      "#3178c6",
    ),
  },
  {
    id: "postgres",
    name: "Postgres",
    category: "tech",
    keywords: ["sql", "database"],
    src: brandIcon(
      '<ellipse cx="24" cy="15" rx="10" ry="4" fill="none" stroke="#fff" stroke-width="1.9"/><path d="M14 15v11c0 2.2 4.5 4 10 4s10-1.8 10-4V15" fill="none" stroke="#fff" stroke-width="1.9"/><path d="M14 24c0 2.2 4.5 4 10 4s10-1.8 10-4" fill="none" stroke="#fff" stroke-width="1.9"/>',
      "#2f5e8a",
    ),
  },
  {
    id: "redis",
    name: "Redis",
    category: "tech",
    keywords: ["cache"],
    src: brandIcon(
      '<path d="M10 29 24 35l14-6-14-6z" fill="#fff"/><path d="M10 22 24 28l14-6-14-6z" fill="#fff" opacity=".88"/><path d="M10 15 24 21l14-6-14-6z" fill="#fff" opacity=".72"/>',
      "#c92a2a",
    ),
  },
  {
    id: "nextjs",
    name: "Next.js",
    category: "tech",
    keywords: ["react"],
    src: brandIcon(
      '<circle cx="24" cy="24" r="12" fill="none" stroke="#fff" stroke-width="2"/><path d="M19.5 16h3.4L28.8 32h-3.3l-1.3-4.4h-5.2L17.7 32h-3.3zm1.8 8.8h3.9L23.3 20z" fill="#fff"/>',
      "#111111",
    ),
  },
  {
    id: "python",
    name: "Python",
    category: "tech",
    keywords: ["lang"],
    src: brandIcon(
      '<path d="M24 10c-6 0-7 3-7 6v3h7v1H14c-4 0-7 2.5-7 7 0 4 3 7 7 7h3v-4c0-3 2-5 5-5h7c3 0 5-2 5-5v-3c0-4-3-7-7-7zm-3.5 3.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z" fill="#ffd43b"/><path d="M24 38c6 0 7-3 7-6v-3h-7v-1h10c4 0 7-2.5 7-7 0-4-3-7-7-7h-3v4c0 3-2 5-5 5h-7c-3 0-5 2-5 5v3c0 4 3 7 7 7zm3.5-3.5a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6z" fill="#4dabf7"/>',
      "#1c2333",
    ),
  },
  {
    id: "nginx",
    name: "NGINX",
    category: "tech",
    keywords: ["web", "proxy"],
    src: brandIcon(
      '<text x="24" y="28" text-anchor="middle" fill="#fff" font-size="11" font-family="Segoe UI,sans-serif" font-weight="700">nginx</text>',
      "#009639",
    ),
  },
  {
    id: "linux",
    name: "Linux",
    category: "tech",
    keywords: ["tux", "os"],
    src: brandIcon(
      '<ellipse cx="24" cy="18" rx="8" ry="9" fill="#fff"/><circle cx="21" cy="17" r="1.35" fill="#111"/><circle cx="27" cy="17" r="1.35" fill="#111"/><path d="M18.5 24c2 3.5 9 3.5 11 0" fill="none" stroke="#111" stroke-width="1.5"/><ellipse cx="24" cy="33" rx="7" ry="4" fill="#fcc419"/>',
      "#343a40",
    ),
  },
  {
    id: "ubuntu",
    name: "Ubuntu",
    category: "tech",
    keywords: ["linux"],
    src: brandIcon(
      '<circle cx="24" cy="24" r="10" fill="none" stroke="#fff" stroke-width="2"/><circle cx="24" cy="12.5" r="2.4" fill="#fff"/><circle cx="14.8" cy="30" r="2.4" fill="#fff"/><circle cx="33.2" cy="30" r="2.4" fill="#fff"/>',
      "#e95420",
    ),
  },
  {
    id: "grafana",
    name: "Grafana",
    category: "tech",
    keywords: ["monitor"],
    src: brandIcon(
      '<circle cx="24" cy="24" r="11" fill="#f46800"/><path d="M24 14v10l7.5 4" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/>',
      "#181b1f",
    ),
  },
  {
    id: "git",
    name: "Git",
    category: "tech",
    keywords: ["vcs"],
    src: brandIcon(
      '<path d="M30.5 17.5 17.5 30.5l-4-4 13-13z" fill="#fff"/><circle cx="15.5" cy="32.5" r="3" fill="#fff"/><circle cx="32.5" cy="15.5" r="3" fill="#fff"/><circle cx="24" cy="24" r="3" fill="#fff"/>',
      "#f05032",
    ),
  },
  {
    id: "kubernetes",
    name: "Kubernetes",
    category: "tech",
    keywords: ["k8s"],
    src: brandIcon(
      '<polygon points="24,10 34,15.5 34,26.5 24,32 14,26.5 14,15.5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="24" cy="21" r="3.2" fill="#fff"/>',
      "#326ce5",
    ),
  },
  {
    id: "mongodb",
    name: "MongoDB",
    category: "tech",
    keywords: ["nosql", "db"],
    src: brandIcon(
      '<path d="M24 10c2 6 6 10 6 16 0 4-2.5 7-6 12-3.5-5-6-8-6-12 0-6 4-10 6-16z" fill="#10aa50"/><path d="M24 14v22" stroke="#fff" stroke-width="1.5" opacity=".5"/>',
      "#0b1d12",
    ),
  },
  {
    id: "figma",
    name: "Figma",
    category: "tech",
    keywords: ["design"],
    src: brandIcon(
      '<circle cx="18" cy="14" r="5" fill="#f24e1e"/><circle cx="30" cy="14" r="5" fill="#ff7262"/><circle cx="18" cy="24" r="5" fill="#a259ff"/><circle cx="30" cy="24" r="5" fill="#1abcfe"/><circle cx="18" cy="34" r="5" fill="#0acf83"/>',
      "#1e1e1e",
    ),
  },

  // —— Cloud ——
  {
    id: "aws",
    name: "AWS",
    category: "cloud",
    keywords: ["amazon"],
    src: brandIcon(
      '<path d="M12 31c4.2 3.2 10.5 4.6 16.5 2.4 1.1-.4 2.1-.9 3-1.5" fill="none" stroke="#ff9900" stroke-width="2.3" stroke-linecap="round"/><text x="24" y="22" text-anchor="middle" fill="#fff" font-size="12" font-family="Segoe UI,sans-serif" font-weight="700">aws</text>',
      "#232f3e",
    ),
  },
  {
    id: "azure",
    name: "Azure",
    category: "cloud",
    keywords: ["microsoft"],
    src: brandIcon('<path d="M12 33 22.5 9h8.5L18.5 33zm11 0 6.5-15 8.5 15z" fill="#fff"/>', "#0078d4"),
  },
  {
    id: "gcp",
    name: "Google Cloud",
    category: "cloud",
    keywords: ["google"],
    src: brandIcon(
      '<circle cx="24" cy="17" r="6.2" fill="#ea4335"/><circle cx="16.5" cy="29" r="6.2" fill="#fbbc04"/><circle cx="31.5" cy="29" r="6.2" fill="#34a853"/><circle cx="24" cy="24" r="4.2" fill="#4285f4"/>',
      "#f1f3f4",
    ),
  },
  {
    id: "lambda",
    name: "Lambda",
    category: "cloud",
    keywords: ["aws", "serverless"],
    src: brandIcon(
      '<path d="M13 34 22 11h5.5l4.2 11L36 34h-5.5l-3.6-9.2L23.5 34z" fill="#f90"/>',
      "#232f3e",
    ),
  },
  {
    id: "s3",
    name: "S3",
    category: "cloud",
    keywords: ["aws", "bucket"],
    src: brandIcon(
      '<path d="M10 18 24 11l14 7v13L24 38 10 31z" fill="none" stroke="#69db7c" stroke-width="2"/><path d="M10 18 24 25l14-7M24 25v13" fill="none" stroke="#69db7c" stroke-width="2"/>',
      "#232f3e",
    ),
  },
  {
    id: "k8s",
    name: "Kubernetes",
    category: "cloud",
    keywords: ["k8s"],
    src: brandIcon(
      '<polygon points="24,10 34,15 34,25 24,30 14,25 14,15" fill="none" stroke="#fff" stroke-width="2"/><circle cx="24" cy="20" r="3" fill="#fff"/>',
      "#326ce5",
    ),
  },
  {
    id: "api-gateway",
    name: "API Gateway",
    category: "cloud",
    keywords: ["aws", "api"],
    src: brandIcon(
      '<rect x="11" y="13" width="26" height="22" rx="4" fill="#ff4f8b"/><path d="M17 22h14M17 28h9" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/>',
      "#232f3e",
    ),
  },
  {
    id: "codebuild",
    name: "CodeBuild",
    category: "cloud",
    keywords: ["aws", "ci"],
    src: brandIcon(
      '<path d="M13 32 24 12l11 20H13z" fill="#5c7cfa"/><path d="M24 18v9M20.5 23.5h7" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
      "#232f3e",
    ),
  },
  {
    id: "kms",
    name: "KMS",
    category: "cloud",
    keywords: ["aws", "key"],
    src: brandIcon(
      '<circle cx="19" cy="24" r="6.5" fill="none" stroke="#fa5252" stroke-width="2.2"/><path d="M24 24h11v4.2h-4.2V33H27V24z" fill="#fa5252"/>',
      "#232f3e",
    ),
  },
  {
    id: "cloudfront",
    name: "CloudFront",
    category: "cloud",
    keywords: ["aws", "cdn"],
    src: brandIcon(
      '<circle cx="24" cy="24" r="10" fill="none" stroke="#8ce99a" stroke-width="2"/><path d="M14 24h20M24 14c3 3 3 17 0 20M24 14c-3 3-3 17 0 20" fill="none" stroke="#8ce99a" stroke-width="1.6"/>',
      "#232f3e",
    ),
  },
  {
    id: "ec2",
    name: "EC2",
    category: "cloud",
    keywords: ["aws", "compute"],
    src: brandIcon(
      '<rect x="12" y="12" width="24" height="24" rx="3" fill="#f90"/><rect x="17" y="17" width="14" height="14" rx="1.5" fill="#232f3e"/>',
      "#232f3e",
    ),
  },
];

const CUSTOM_STORAGE_KEY = "draw-app-custom-icons-v1";

export function loadCustomIcons(): LibraryIcon[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as LibraryIcon[];
    return Array.isArray(parsed) ? parsed.filter((item) => item.category === "custom") : [];
  } catch {
    return [];
  }
}

export function saveCustomIcons(icons: LibraryIcon[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(icons));
}

export function filterIcons(icons: LibraryIcon[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return icons;
  }
  return icons.filter(
    (icon) =>
      icon.name.toLowerCase().includes(q) ||
      icon.keywords.some((keyword) => keyword.toLowerCase().includes(q)) ||
      icon.category.includes(q),
  );
}

export function getIconSrc(id: string): string | undefined {
  return BUILTIN_ICONS.find((icon) => icon.id === id)?.src;
}
