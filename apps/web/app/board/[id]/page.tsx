"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import styles from "../board.module.css";
import {
  BUILTIN_ICONS,
  ICON_CATEGORIES,
  filterIcons,
  loadCustomIcons,
  saveCustomIcons,
  type IconCategoryId,
  type LibraryIcon,
} from "../../lib/iconLibrary";
import {
  DIAGRAM_CATEGORIES,
  DIAGRAM_TEMPLATES,
  filterTemplates,
  type DiagramTemplate,
  type TemplateCategory,
} from "../../lib/diagramTemplates";
import {
  getFile,
  touchFile,
  updateFileContent,
} from "../../lib/workspaceStore";

const MAIN_TOOLS = [
  { id: "hand", label: "Hand", keyHint: "" },
  { id: "select", label: "Select", keyHint: "1" },
  { id: "rectangle", label: "Rectangle", keyHint: "2" },
  { id: "diamond", label: "Diamond", keyHint: "3" },
  { id: "ellipse", label: "Ellipse", keyHint: "4" },
  { id: "arrow", label: "Arrow", keyHint: "5" },
  { id: "line", label: "Line", keyHint: "6" },
  { id: "draw", label: "Draw", keyHint: "7" },
  { id: "text", label: "Text", keyHint: "8" },
  { id: "image", label: "Image", keyHint: "9" },
] as const;

const EXTRA_TOOLS = [
  { id: "frame", label: "Frame tool", shortcut: "F" },
  { id: "note", label: "Sticky note", shortcut: "N" },
] as const;

const NOTE_COLORS = ["#fff3a3", "#ffd6e7", "#d4f5d8", "#d6e8ff", "#f3e8ff"] as const;
const ICON_PLACE_SIZE = 64;

type MainToolId = (typeof MAIN_TOOLS)[number]["id"];
type ExtraToolId = (typeof EXTRA_TOOLS)[number]["id"];
type ToolId = MainToolId | ExtraToolId | "eraser";
type ShapeTool = "rectangle" | "diamond" | "ellipse" | "line" | "arrow" | "frame";

type Point = { x: number; y: number };

type ShapeElement = {
  id: string;
  kind: "shape";
  tool: ShapeTool;
  start: Point;
  end: Point;
  color: string;
  strokeWidth: number;
  opacity: number;
};

type DrawElement = {
  id: string;
  kind: "draw";
  points: Point[];
  color: string;
  strokeWidth: number;
  opacity: number;
};

type TextElement = {
  id: string;
  kind: "text";
  point: Point;
  value: string;
  color: string;
  opacity: number;
};

type ImageElement = {
  id: string;
  kind: "image";
  point: Point;
  width: number;
  height: number;
  src: string;
};

type WebEmbedElement = {
  id: string;
  kind: "web";
  point: Point;
  width: number;
  height: number;
  url: string;
};

type NoteElement = {
  id: string;
  kind: "note";
  point: Point;
  width: number;
  height: number;
  value: string;
  color: string;
};

type TableField = { name: string; type: string; pk?: boolean };

type TableElement = {
  id: string;
  kind: "table";
  point: Point;
  width: number;
  title: string;
  headerColor: string;
  iconSrc?: string;
  fields: TableField[];
};

type CanvasElement =
  | ShapeElement
  | DrawElement
  | TextElement
  | ImageElement
  | WebEmbedElement
  | NoteElement
  | TableElement;

type RoomCanvasState = {
  canvasName: string;
  elements: CanvasElement[];
  pan: Point;
  backgroundColor: string;
};

type GenerateTab = "text" | "mermaid";

const isShapeTool = (tool: ToolId): tool is ShapeTool =>
  ["rectangle", "diamond", "ellipse", "line", "arrow", "frame"].includes(tool);

const getShapeBounds = (start: Point, end: Point) => {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DEFAULT_STROKE_COLOR = "#1f1f2e";
const DEFAULT_STROKE_WIDTH = 2;
const DEFAULT_OPACITY = 100;
const STYLE_TOOLS: ToolId[] = ["draw", "rectangle", "diamond", "ellipse", "arrow", "line", "text"];
const CANVAS_BACKGROUNDS = ["#f7f7fb", "#f2f4f8", "#ecf1f8", "#efeedf", "#ece9e7", "#ffffff"];
const WS_PORT = process.env.NEXT_PUBLIC_WS_PORT ?? "8082";
const MERMAID_BLOCK_STARTERS = [
  "flowchart",
  "graph",
  "sequencediagram",
  "classdiagram",
  "statediagram",
  "erdiagram",
] as const;

const normalizeMermaidCode = (input: string) => {
  let value = input.trim();
  value = value.replace(/^```(?:mermaid)?\s*/i, "").replace(/\s*```$/, "").trim();
  value = value.replace(/^mermaid\s*/i, "");

  const lowered = value.toLowerCase();
  const startIndex = MERMAID_BLOCK_STARTERS.reduce<number>((index, starter) => {
    const nextIndex = lowered.indexOf(starter);
    if (nextIndex < 0) {
      return index;
    }
    if (index < 0 || nextIndex < index) {
      return nextIndex;
    }
    return index;
  }, -1);

  if (startIndex > 0) {
    value = value.slice(startIndex).trim();
  }

  return value;
};

const toSvgDataUrl = (svg: string) =>
  `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(svg)))}`;

const renderMermaidToImageUrl = async (code: string) => {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "default",
  });
  const id = `mmd-${Math.random().toString(36).slice(2, 10)}`;
  const { svg } = await mermaid.render(id, code);
  return toSvgDataUrl(svg);
};

const canonicalizeFlowchart = (input: string) => {
  const headerMatch = input.match(/\b(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i);
  if (!headerMatch) {
    return input;
  }

  const nodeMap = new Map<string, string>();
  const nodeRegex = /([A-Za-z0-9_]+)\[([^\]]+)\]/g;
  let nodeMatch = nodeRegex.exec(input);
  while (nodeMatch) {
    const id = nodeMatch[1];
    const label = nodeMatch[2]?.trim();
    if (id && label && !nodeMap.has(id)) {
      nodeMap.set(id, label);
    }
    nodeMatch = nodeRegex.exec(input);
  }

  const edges: string[] = [];
  const edgeRegex = /([A-Za-z0-9_]+)\s*-->\s*(?:\|([^|]+)\|)?\s*([A-Za-z0-9_]+)/g;
  let edgeMatch = edgeRegex.exec(input);
  while (edgeMatch) {
    const from = edgeMatch[1];
    const label = edgeMatch[2]?.trim();
    const to = edgeMatch[3];
    if (from && to) {
      edges.push(label ? `${from} -->|${label}| ${to}` : `${from} --> ${to}`);
    }
    edgeMatch = edgeRegex.exec(input);
  }

  if (edges.length === 0) {
    return input;
  }

  const header = `${headerMatch[1]} ${headerMatch[2]}`;
  const nodeLines = Array.from(nodeMap.entries()).map(([id, label]) => `${id}["${label}"]`);
  return [header, ...nodeLines, ...edges].join("\n");
};

const toolIcon = (id: MainToolId | "eraser" | "more" | "lock" | "frame" | "note"): ReactNode => {
  if (id === "lock") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <rect x="6.5" y="11" width="11" height="8" rx="2" />
        <path d="M9 11V8.8a3 3 0 0 1 6 0V11" />
      </svg>
    );
  }
  if (id === "hand") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <path d="M7.8 20V9.8c0-.8.6-1.4 1.4-1.4s1.4.6 1.4 1.4V14" />
        <path d="M10.6 19.9V7.8c0-.8.6-1.4 1.4-1.4s1.4.6 1.4 1.4V14" />
        <path d="M13.4 19.8V8.8c0-.8.6-1.4 1.4-1.4s1.4.6 1.4 1.4V14" />
        <path d="M16.2 19.7v-4.5c0-.8.6-1.4 1.4-1.4s1.4.6 1.4 1.4v1.7c0 1.9-1.5 3.4-3.4 3.4H11c-1.8 0-3.2-1.4-3.2-3.2" />
        <path d="M7.8 12.8H6.7c-.9 0-1.7.8-1.7 1.7v2" />
      </svg>
    );
  }
  if (id === "select") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <path d="M5 4.5 10.2 19l2.2-5.1L17.5 12z" />
      </svg>
    );
  }
  if (id === "rectangle") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <rect x="4.5" y="6.5" width="15" height="11" rx="1.5" />
      </svg>
    );
  }
  if (id === "diamond") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <path d="M12 4.5 19.5 12 12 19.5 4.5 12z" />
      </svg>
    );
  }
  if (id === "ellipse") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <ellipse cx="12" cy="12" rx="7.8" ry="5.8" />
      </svg>
    );
  }
  if (id === "arrow") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <path d="M4 12h14" />
        <path d="m13 6 6 6-6 6" />
      </svg>
    );
  }
  if (id === "line") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <path d="M5 19 19 5" />
      </svg>
    );
  }
  if (id === "draw") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <path d="M4 20c2-5 5-8 8-10" />
        <path d="M14.5 5.5 18.5 9.5" />
        <path d="M12.8 7.2 17 3a1.5 1.5 0 0 1 2.1 0l1.9 1.9a1.5 1.5 0 0 1 0 2.1l-4.2 4.2" />
      </svg>
    );
  }
  if (id === "text") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <path d="M5 6h14" />
        <path d="M12 6v13" />
        <path d="M8 19h8" />
      </svg>
    );
  }
  if (id === "image") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <rect x="3.5" y="5" width="17" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m7.5 16 3.2-3.5 2.6 2.4L16 12l3 4" />
      </svg>
    );
  }
  if (id === "frame") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <path d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" />
        <rect x="8" y="8" width="8" height="8" rx="1" />
      </svg>
    );
  }
  if (id === "note") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
        <path d="M14 4v5h5" />
        <path d="M8 13h8M8 17h5" />
      </svg>
    );
  }
  if (id === "eraser") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <path d="M4.7 13.8 11.6 6.9a2 2 0 0 1 2.8 0l4.9 4.9a2 2 0 0 1 0 2.8l-4.2 4.2a2 2 0 0 1-1.4.6H9.5a2 2 0 0 1-1.4-.6l-3.4-3.4a1.1 1.1 0 0 1 0-1.6Z" />
        <path d="M10.2 19.3h9.1" />
      </svg>
    );
  }
  if (id === "more") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <circle cx="6.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="17.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
};

const menuGlyph = (kind: "catalog" | "icons" | "flow" | "arch" | "ai" | "mermaid") => {
  if (kind === "catalog") {
    return (
      <svg viewBox="0 0 24 24" className={styles.menuGlyph} aria-hidden>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  if (kind === "icons") {
    return (
      <svg viewBox="0 0 24 24" className={styles.menuGlyph} aria-hidden>
        <circle cx="8" cy="8" r="3" />
        <rect x="13" y="5" width="6" height="6" rx="1.2" />
        <path d="M5 19 9 13l3 3 3-4 4 7H5z" />
      </svg>
    );
  }
  if (kind === "flow") {
    return (
      <svg viewBox="0 0 24 24" className={styles.menuGlyph} aria-hidden>
        <rect x="8" y="3" width="8" height="5" rx="1.2" />
        <path d="M12 8v3" />
        <path d="M12 11 7 15h10L12 11z" />
        <path d="M7 15v2M17 15v2" />
        <rect x="3" y="17" width="8" height="4" rx="1" />
        <rect x="13" y="17" width="8" height="4" rx="1" />
      </svg>
    );
  }
  if (kind === "arch") {
    return (
      <svg viewBox="0 0 24 24" className={styles.menuGlyph} aria-hidden>
        <rect x="3" y="14" width="6" height="6" rx="1.2" />
        <rect x="9" y="8" width="6" height="12" rx="1.2" />
        <rect x="15" y="4" width="6" height="16" rx="1.2" />
      </svg>
    );
  }
  if (kind === "ai") {
    return (
      <svg viewBox="0 0 24 24" className={styles.menuGlyph} aria-hidden>
        <path d="M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
        <path d="M18 15.5 18.8 17.7 21 18.5l-2.2.8L18 21.5l-.8-2.2L15 18.5l2.2-.8z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={styles.menuGlyph} aria-hidden>
      <path d="M4 7c4-4 8 4 12 0" />
      <path d="M4 12c4-4 8 4 12 0" />
      <path d="M4 17c4-4 8 4 12 0" />
    </svg>
  );
};

export default function BoardPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          <div className={styles.missingBoard}>
            <p>Loading board…</p>
          </div>
        </div>
      }
    >
      <BoardCanvas />
    </Suspense>
  );
}

function BoardCanvas() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileId = params?.id ?? "";
  const [fileMissing, setFileMissing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showFindPanel, setShowFindPanel] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [activeTool, setActiveTool] = useState<ToolId>("select");
  const [showExtras, setShowExtras] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Canvas ready");
  const [canvasName, setCanvasName] = useState("Untitled File");
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [draftElement, setDraftElement] = useState<ShapeElement | DrawElement | null>(null);
  const [pendingImagePoint, setPendingImagePoint] = useState<Point | null>(null);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [handStart, setHandStart] = useState<Point | null>(null);
  const [strokeColor, setStrokeColor] = useState("#1f1f2e");
  const [backgroundColor, setBackgroundColor] = useState("#f7f7fb");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokeOpacity, setStrokeOpacity] = useState(100);
  const [themeMode, setThemeMode] = useState<"light" | "dark" | "system">("system");
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const [roomId, setRoomId] = useState("demo-room");
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateTab, setGenerateTab] = useState<GenerateTab>("text");
  const [generateInput, setGenerateInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [isRoomHydrated, setIsRoomHydrated] = useState(false);
  const [showIconsPanel, setShowIconsPanel] = useState(false);
  const [showCatalogPanel, setShowCatalogPanel] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState<TemplateCategory | "all">("all");
  const [iconSearch, setIconSearch] = useState("");
  const [iconCategory, setIconCategory] = useState<IconCategoryId | "all">("all");
  const [customIcons, setCustomIcons] = useState<LibraryIcon[]>([]);
  const [pendingLibraryIcon, setPendingLibraryIcon] = useState<LibraryIcon | null>(null);
  const [noteColor, setNoteColor] = useState<(typeof NOTE_COLORS)[number]>(NOTE_COLORS[0]);
  const extrasPanelRef = useRef<HTMLElement | null>(null);
  const moreToolsButtonRef = useRef<HTMLButtonElement | null>(null);
  const iconsPanelRef = useRef<HTMLElement | null>(null);
  const menuPanelRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const propertiesPanelRef = useRef<HTMLElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef(`client-${Math.random().toString(36).slice(2, 10)}`);
  const suppressSyncUntilRef = useRef(0);

  const activeToolLabel = useMemo(
    () =>
      MAIN_TOOLS.find((tool) => tool.id === activeTool)?.label ??
      EXTRA_TOOLS.find((tool) => tool.id === activeTool)?.label ??
      "Eraser",
    [activeTool],
  );
  const showStylePanel = STYLE_TOOLS.includes(activeTool);
  const resolvedTheme =
    themeMode === "system" ? (systemPrefersDark ? "dark" : "light") : themeMode;

  const libraryIcons = useMemo(() => {
    const merged = [...customIcons, ...BUILTIN_ICONS];
    const byCategory =
      iconCategory === "all" ? merged : merged.filter((icon) => icon.category === iconCategory);
    return filterIcons(byCategory, iconSearch);
  }, [customIcons, iconCategory, iconSearch]);

  const iconsBySection = useMemo(() => {
    if (iconCategory !== "all") {
      return [{ id: iconCategory, icons: libraryIcons }] as const;
    }
    return ICON_CATEGORIES.map((category) => ({
      id: category.id,
      icons: libraryIcons.filter((icon) => icon.category === category.id),
    })).filter((section) => section.icons.length > 0);
  }, [iconCategory, libraryIcons]);

  const catalogTemplates = useMemo(
    () => filterTemplates(DIAGRAM_TEMPLATES, catalogCategory, catalogSearch),
    [catalogCategory, catalogSearch],
  );

  useEffect(() => {
    setCustomIcons(loadCustomIcons());
  }, []);

  useEffect(() => {
    if (!fileId) {
      setFileMissing(true);
      return;
    }
    const file = getFile(fileId);
    if (!file) {
      setFileMissing(true);
      return;
    }
    setFileMissing(false);
    setCanvasName(file.name);
    setElements(Array.isArray(file.content.elements) ? (file.content.elements as CanvasElement[]) : []);
    setPan(file.content.pan ?? { x: 0, y: 0 });
    setBackgroundColor(file.content.backgroundColor ?? "#f7f7fb");
    setRoomId(fileId);
    touchFile(fileId);
    if (searchParams.get("ai") === "1") {
      setShowGenerateModal(true);
      setGenerateTab("text");
    }
    const preset = searchParams.get("preset");
    if (preset) {
      setGenerateInput(preset);
      setShowGenerateModal(true);
    }
    const pendingTemplateKey = `draw-app-pending-template:${fileId}`;
    const pendingTemplate = window.localStorage.getItem(pendingTemplateKey);
    if (pendingTemplate) {
      window.localStorage.removeItem(pendingTemplateKey);
      const template = DIAGRAM_TEMPLATES.find((item) => item.id === pendingTemplate);
      if (template) {
        const built = template.build({ x: 80, y: 100 }) as CanvasElement[];
        setElements(built);
        setCanvasName(file.name || template.title);
        setStatusMessage(`Inserted template: ${template.title}`);
      }
    }
    const activeStyleRaw = window.localStorage.getItem("draw-app-active-style");
    if (activeStyleRaw) {
      try {
        const style = JSON.parse(activeStyleRaw) as {
          strokeColor?: string;
          backgroundColor?: string;
        };
        if (style.strokeColor) setStrokeColor(style.strokeColor);
        if (style.backgroundColor) setBackgroundColor(style.backgroundColor);
        window.localStorage.removeItem("draw-app-active-style");
      } catch {
        // ignore malformed style payload
      }
    }
  }, [fileId, searchParams]);

  useEffect(() => {
    if (!fileId || fileMissing) {
      return;
    }
    const timer = window.setTimeout(() => {
      updateFileContent(fileId, {
        elements,
        pan,
        backgroundColor,
        canvasName,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [fileId, fileMissing, elements, pan, backgroundColor, canvasName]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setSystemPrefersDark(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  // Apply ?room= before paint so the WebSocket effect (below) never connects with the wrong room.
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room?.trim()) {
      setRoomId(room.trim());
    }
  }, []);

  useEffect(() => {
    const publicWs = process.env.NEXT_PUBLIC_WS_URL?.trim();
    const wsUrlString = (() => {
      if (publicWs) {
        if (publicWs.startsWith("ws://") || publicWs.startsWith("wss://")) {
          return publicWs;
        }
        const host = publicWs.replace(/^https?:\/\//, "");
        return `wss://${host}`;
      }
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = new URL(`${protocol}://${window.location.hostname}`);
      wsUrl.port = WS_PORT;
      return wsUrl.toString();
    })();
    const socket = new WebSocket(wsUrlString);
    socketRef.current = socket;
    setIsRoomHydrated(false);

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: "join_room",
          roomId,
        }),
      );
      setStatusMessage(`Connected to room: ${roomId}`);
    };

    socket.onerror = () => {
      setStatusMessage(`WebSocket failed: ${wsUrlString}`);
    };

    socket.onmessage = (event) => {
      let message: unknown;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (typeof message !== "object" || message === null) {
        return;
      }

      const data = message as {
        type?: string;
        roomId?: string;
        clientId?: string;
        state?: Partial<RoomCanvasState>;
      };

      if ((data.type === "canvas_state" || data.type === "canvas_update") && data.roomId === roomId) {
        if (data.clientId && data.clientId === clientIdRef.current) {
          return;
        }
        const state = data.state;
        if (!state) {
          return;
        }
        suppressSyncUntilRef.current = Date.now() + 600;
        if (typeof state.canvasName === "string") {
          setCanvasName(state.canvasName);
        }
        if (Array.isArray(state.elements)) {
          setElements(state.elements as CanvasElement[]);
        }
        if (typeof state.pan?.x === "number" && typeof state.pan?.y === "number") {
          setPan({ x: state.pan.x, y: state.pan.y });
        }
        if (typeof state.backgroundColor === "string") {
          setBackgroundColor(state.backgroundColor);
        }
        if (data.type === "canvas_state") {
          setIsRoomHydrated(true);
        }
      }
    };

    socket.onclose = () => {
      setStatusMessage("Realtime disconnected");
      setIsRoomHydrated(false);
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [roomId]);

  // If the server never sends canvas_state (e.g. DB error), still allow BroadcastChannel + WS sends once connected.
  useEffect(() => {
    if (isRoomHydrated) {
      return;
    }
    const t = window.setTimeout(() => {
      setIsRoomHydrated(true);
    }, 4000);
    return () => window.clearTimeout(t);
  }, [roomId, isRoomHydrated]);

  useEffect(() => {
    const channel = new BroadcastChannel(`draw-app-room-${roomId}`);
    broadcastRef.current = channel;

    channel.onmessage = (event: MessageEvent) => {
      const message = event.data as {
        type?: string;
        clientId?: string;
        roomId?: string;
        state?: Partial<RoomCanvasState>;
      };

      if (message?.type !== "canvas_update") {
        return;
      }
      if (message.clientId === clientIdRef.current) {
        return;
      }
      if (message.roomId !== roomId || !message.state) {
        return;
      }

      suppressSyncUntilRef.current = Date.now() + 400;
      const state = message.state;
      if (typeof state.canvasName === "string") {
        setCanvasName(state.canvasName);
      }
      if (Array.isArray(state.elements)) {
        setElements(state.elements as CanvasElement[]);
      }
      if (typeof state.pan?.x === "number" && typeof state.pan?.y === "number") {
        setPan({ x: state.pan.x, y: state.pan.y });
      }
      if (typeof state.backgroundColor === "string") {
        setBackgroundColor(state.backgroundColor);
      }
    };

    return () => {
      channel.close();
      if (broadcastRef.current === channel) {
        broadcastRef.current = null;
      }
    };
  }, [roomId]);

  useEffect(() => {
    if (!isRoomHydrated) {
      return;
    }
    if (Date.now() < suppressSyncUntilRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const payload = {
        type: "canvas_update" as const,
        roomId,
        clientId: clientIdRef.current,
        state: {
          canvasName,
          elements,
          pan,
          backgroundColor,
        },
      };

      // Same-browser tabs: always use BroadcastChannel (works even if WebSocket/DB fail).
      broadcastRef.current?.postMessage(payload);

      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [backgroundColor, canvasName, elements, isRoomHydrated, pan, roomId]);

  useEffect(() => {
    if (!showExtras) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const clickedPanel = extrasPanelRef.current?.contains(target);
      const clickedMoreButton = moreToolsButtonRef.current?.contains(target);
      if (!clickedPanel && !clickedMoreButton) {
        setShowExtras(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [showExtras]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const inMenu = menuPanelRef.current?.contains(target);
      const inButton = menuButtonRef.current?.contains(target);
      if (!inMenu && !inButton) {
        setMenuOpen(false);
        setShowPreferences(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === "o") {
        event.preventDefault();
        document.getElementById("canvas-open-file-input")?.click();
      }
      if (meta && event.shiftKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        void handleExportImage();
      }
      if (meta && event.key === "/") {
        event.preventDefault();
        setShowCommandPalette(true);
        setCommandQuery("");
        setMenuOpen(false);
      }
      if (meta && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setShowFindPanel(true);
        setFindQuery("");
        setMenuOpen(false);
      }
      if (event.key === "Escape") {
        setShowCommandPalette(false);
        setShowFindPanel(false);
        setMenuOpen(false);
        setShowPreferences(false);
        setActiveTool((tool) =>
          STYLE_TOOLS.includes(tool) || tool === "note" || tool === "eraser"
            ? "select"
            : tool,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeStylePanel = () => {
    setActiveTool("select");
    setStatusMessage("Style panel closed — press a draw tool to reopen");
  };

  const runFindOnCanvas = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setStatusMessage("Enter text to find");
      return;
    }
    const match = elements.find((element) => {
      if (element.kind === "text" || element.kind === "note") {
        return element.value.toLowerCase().includes(q);
      }
      if (element.kind === "table") {
        return (
          element.title.toLowerCase().includes(q) ||
          element.fields.some(
            (field) =>
              field.name.toLowerCase().includes(q) || field.type.toLowerCase().includes(q),
          )
        );
      }
      return false;
    });
    if (!match) {
      setStatusMessage(`No match for "${query}"`);
      setHighlightedId(null);
      return;
    }
    const point =
      match.kind === "shape"
        ? match.start
        : "point" in match
          ? match.point
          : { x: 0, y: 0 };
    setPan({ x: 120 - point.x, y: 140 - point.y });
    setHighlightedId(match.id);
    setStatusMessage(`Found on canvas: "${query}"`);
    window.setTimeout(() => setHighlightedId(null), 2200);
  };

  const commandActions = useMemo(
    () => [
      {
        id: "open",
        label: "Open file",
        hint: "Ctrl+O",
        run: () => document.getElementById("canvas-open-file-input")?.click(),
      },
      { id: "save", label: "Save JSON", hint: "", run: () => handleSave() },
      { id: "export", label: "Export PNG", hint: "Ctrl+Shift+E", run: () => void handleExportImage() },
      {
        id: "collab",
        label: "Copy collaboration link",
        hint: "",
        run: () => void handleLiveCollaboration(),
      },
      {
        id: "clear",
        label: "Clear entire canvas",
        hint: "",
        run: () => clearEntireCanvas(),
      },
      {
        id: "find",
        label: "Find on canvas",
        hint: "Ctrl+F",
        run: () => {
          setShowFindPanel(true);
          setFindQuery("");
        },
      },
      {
        id: "ai",
        label: "Text to diagram (AI)",
        hint: "",
        run: () => openGenerateModal("text"),
      },
      {
        id: "catalog",
        label: "Open diagram catalog",
        hint: "",
        run: () => {
          setShowCatalogPanel(true);
          setShowIconsPanel(false);
        },
      },
      {
        id: "icons",
        label: "Open icon library",
        hint: "",
        run: () => {
          setShowIconsPanel(true);
          setShowCatalogPanel(false);
        },
      },
      {
        id: "home",
        label: "Back to workspace",
        hint: "",
        run: () => router.push("/"),
      },
      {
        id: "theme-light",
        label: "Theme: Light",
        hint: "",
        run: () => setThemeMode("light"),
      },
      {
        id: "theme-dark",
        label: "Theme: Dark",
        hint: "",
        run: () => setThemeMode("dark"),
      },
      {
        id: "grid",
        label: showGrid ? "Hide canvas grid" : "Show canvas grid",
        hint: "",
        run: () => setShowGrid((prev) => !prev),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actions close over latest handlers
    [showGrid, router],
  );

  const filteredCommands = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    if (!q) return commandActions;
    return commandActions.filter((action) => action.label.toLowerCase().includes(q));
  }, [commandActions, commandQuery]);

  const openGenerateModal = (tab: GenerateTab) => {
    setGenerateTab(tab);
    setShowGenerateModal(true);
    setGenerateError("");
    setGenerateInput("");
  };

  const handleGenerateDiagram = async () => {
    const prompt = generateInput.trim();
    if (!prompt) {
      setGenerateError("Please enter a prompt.");
      return;
    }

    setIsGenerating(true);
    setGenerateError("");

    try {
      const response = await fetch("/api/diagram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: generateTab,
          prompt,
        }),
      });

      const data = (await response.json()) as { mermaid?: string; error?: string };
      if (!response.ok || !data.mermaid) {
        setGenerateError(data.error ?? "Could not generate diagram.");
        setIsGenerating(false);
        return;
      }

      const mermaidCode = canonicalizeFlowchart(normalizeMermaidCode(data.mermaid));
      if (!mermaidCode) {
        setGenerateError("Generated Mermaid was empty.");
        setIsGenerating(false);
        return;
      }

      const diagramSrc = await renderMermaidToImageUrl(mermaidCode);
      const canRenderDiagram = await new Promise<boolean>((resolve) => {
        const image = new window.Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = diagramSrc;
      });

      if (canRenderDiagram) {
        const diagramImage: ImageElement = {
          id: makeId(),
          kind: "image",
          point: { x: 120, y: 160 },
          width: 860,
          height: 480,
          src: diagramSrc,
        };
        setElements((previous) => [...previous, diagramImage]);
      } else {
        const note: TextElement = {
          id: makeId(),
          kind: "text",
          point: { x: 120, y: 180 },
          value: `Mermaid render failed. Raw output:\n${mermaidCode}`,
          color: strokeColor,
          opacity: strokeOpacity,
        };
        setElements((previous) => [...previous, note]);
        setStatusMessage("Diagram text generated, but rendering failed");
        setShowGenerateModal(false);
        setIsGenerating(false);
        return;
      }
      setShowGenerateModal(false);
      setStatusMessage("Diagram generated and rendered");
    } catch (error) {
      setGenerateError(`Generation failed: ${String(error)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const getCanvasPoint = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - pan.x,
      y: event.clientY - rect.top - pan.y,
    };
  };

  const toScreenPoint = (event: React.PointerEvent<SVGSVGElement>): Point => ({
    x: event.clientX,
    y: event.clientY,
  });

  const findElementAtPoint = (point: Point) => {
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      const element = elements[index];
      if (!element) {
        continue;
      }
      if (element.kind === "shape") {
        const { x, y, width, height } = getShapeBounds(element.start, element.end);
        if (
          point.x >= x - 10 &&
          point.x <= x + width + 10 &&
          point.y >= y - 10 &&
          point.y <= y + height + 10
        ) {
          return element.id;
        }
      } else if (element.kind === "draw") {
        if (
          element.points.some(
            (item) => Math.abs(item.x - point.x) < 8 && Math.abs(item.y - point.y) < 8,
          )
        ) {
          return element.id;
        }
      } else if (element.kind === "text") {
        const width = element.value.length * 10;
        if (
          point.x >= element.point.x - 4 &&
          point.x <= element.point.x + width &&
          point.y >= element.point.y - 20 &&
          point.y <= element.point.y + 4
        ) {
          return element.id;
        }
      } else if (element.kind === "image" || element.kind === "note" || element.kind === "table") {
        const height =
          element.kind === "table" ? 44 + element.fields.length * 28 : element.height;
        if (
          point.x >= element.point.x &&
          point.x <= element.point.x + element.width &&
          point.y >= element.point.y &&
          point.y <= element.point.y + height
        ) {
          return element.id;
        }
      } else if (
        point.x >= element.point.x &&
        point.x <= element.point.x + element.width &&
        point.y >= element.point.y &&
        point.y <= element.point.y + element.height
      ) {
        return element.id;
      }
    }
    return null;
  };

  const handleOpenCanvas = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { name?: string; elements?: CanvasElement[] };
      setCanvasName(parsed.name ?? file.name.replace(".json", ""));
      setElements(Array.isArray(parsed.elements) ? parsed.elements : []);
      setStatusMessage(`Opened "${file.name}"`);
    } catch {
      setStatusMessage("Failed to open file (invalid JSON)");
    } finally {
      event.target.value = "";
    }
  };

  const handleOpenImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !pendingImagePoint) {
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const src = typeof reader.result === "string" ? reader.result : "";
        if (!src) {
          setStatusMessage("Failed to read image");
          return;
        }
        const image = new window.Image();
        image.onload = () => {
          const maxWidth = 260;
          const scale = Math.min(1, maxWidth / image.width);
          setElements((previous) => [
            ...previous,
            {
              id: makeId(),
              kind: "image",
              point: pendingImagePoint,
              width: image.width * scale,
              height: image.height * scale,
              src,
            },
          ]);
          setPendingImagePoint(null);
          setStatusMessage("Image placed");
        };
        image.src = src;
      };
      reader.readAsDataURL(file);
    } catch {
      setStatusMessage("Failed to place image");
    } finally {
      event.target.value = "";
    }
  };

  const placeLibraryIcon = (icon: LibraryIcon, point: Point) => {
    setElements((previous) => [
      ...previous,
      {
        id: makeId(),
        kind: "image",
        point: {
          x: point.x - ICON_PLACE_SIZE / 2,
          y: point.y - ICON_PLACE_SIZE / 2,
        },
        width: ICON_PLACE_SIZE,
        height: ICON_PLACE_SIZE,
        src: icon.src,
      },
    ]);
    setStatusMessage(`Placed icon: ${icon.name}`);
  };

  const handleSelectLibraryIcon = (icon: LibraryIcon) => {
    setPendingLibraryIcon(icon);
    setActiveTool("select");
    setShowExtras(false);
    setStatusMessage(`Click the canvas to place "${icon.name}"`);
  };

  const handleUploadCustomIcon = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!src) {
        setStatusMessage("Failed to read custom icon");
        return;
      }
      const nextIcon: LibraryIcon = {
        id: `custom-${makeId()}`,
        name: file.name.replace(/\.[^.]+$/, "") || "Custom icon",
        category: "custom",
        keywords: ["custom", "upload"],
        src,
      };
      setCustomIcons((previous) => {
        const next = [nextIcon, ...previous];
        saveCustomIcons(next);
        return next;
      });
      setIconCategory("custom");
      setStatusMessage(`Uploaded "${nextIcon.name}" — click it, then click the canvas`);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const insertDiagramTemplate = (template: DiagramTemplate) => {
    const origin = { x: 80 - pan.x, y: 100 - pan.y };
    const built = template.build(origin) as CanvasElement[];
    setElements((previous) => [...previous, ...built]);
    setCanvasName((previous) =>
      previous === "Untitled canvas" ? template.title : previous,
    );
    setShowCatalogPanel(false);
    setShowExtras(false);
    setShowIconsPanel(false);
    setStatusMessage(`Inserted template: ${template.title}`);
  };

  const handleInsertStarter = (kind: "flowchart" | "architecture") => {
    const template =
      kind === "flowchart"
        ? DIAGRAM_TEMPLATES.find((item) => item.id === "flow-basic")
        : DIAGRAM_TEMPLATES.find((item) => item.id === "microservices");
    if (template) {
      insertDiagramTemplate(template);
    }
  };

  const handleSave = () => {
    const payload = {
      name: canvasName,
      activeTool,
      elements,
      pan,
      updatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${canvasName.toLowerCase().replace(/\s+/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Canvas JSON downloaded");
  };

  const handleExportImage = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) {
      setStatusMessage("Export unavailable in this browser");
      return;
    }

    context.fillStyle = "#f5f5f9";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#626279";
    context.font = "28px Segoe UI";
    context.fillText(canvasName, 44, 62);
    context.font = "20px Segoe UI";
    context.fillText(`Active tool: ${activeToolLabel}`, 44, 96);
    context.strokeStyle = "#2f3650";
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve) => {
        const image = new window.Image();
        image.onload = () => resolve(image);
        image.src = src;
      });

    for (const element of elements) {
      if (element.kind === "shape") {
        context.strokeStyle = element.color ?? DEFAULT_STROKE_COLOR;
        context.globalAlpha = (element.opacity ?? DEFAULT_OPACITY) / 100;
        context.lineWidth = element.strokeWidth ?? DEFAULT_STROKE_WIDTH;
        const { x, y, width, height } = getShapeBounds(element.start, element.end);
        if (element.tool === "rectangle") {
          context.strokeRect(x, y, width, height);
        } else if (element.tool === "diamond") {
          const centerX = x + width / 2;
          const centerY = y + height / 2;
          context.beginPath();
          context.moveTo(centerX, y);
          context.lineTo(x + width, centerY);
          context.lineTo(centerX, y + height);
          context.lineTo(x, centerY);
          context.closePath();
          context.stroke();
        } else if (element.tool === "ellipse") {
          context.beginPath();
          context.ellipse(
            x + width / 2,
            y + height / 2,
            Math.max(width / 2, 1),
            Math.max(height / 2, 1),
            0,
            0,
            Math.PI * 2,
          );
          context.stroke();
        } else {
          context.beginPath();
          context.moveTo(element.start.x, element.start.y);
          context.lineTo(element.end.x, element.end.y);
          context.stroke();
          if (element.tool === "arrow") {
            const angle = Math.atan2(
              element.end.y - element.start.y,
              element.end.x - element.start.x,
            );
            const headLength = 12;
            context.beginPath();
            context.moveTo(element.end.x, element.end.y);
            context.lineTo(
              element.end.x - headLength * Math.cos(angle - Math.PI / 8),
              element.end.y - headLength * Math.sin(angle - Math.PI / 8),
            );
            context.lineTo(
              element.end.x - headLength * Math.cos(angle + Math.PI / 8),
              element.end.y - headLength * Math.sin(angle + Math.PI / 8),
            );
            context.closePath();
            context.fillStyle = "#2f3650";
            context.fill();
          }
        }
        context.globalAlpha = 1;
        context.strokeStyle = "#2f3650";
        context.lineWidth = 2;
      } else if (element.kind === "draw" && element.points.length > 1) {
        const firstPoint = element.points[0];
        if (!firstPoint) {
          continue;
        }
        context.strokeStyle = element.color;
        context.globalAlpha = element.opacity / 100;
        context.lineWidth = element.strokeWidth;
        context.beginPath();
        context.moveTo(firstPoint.x, firstPoint.y);
        for (let index = 1; index < element.points.length; index += 1) {
          const point = element.points[index];
          if (point) {
            context.lineTo(point.x, point.y);
          }
        }
        context.stroke();
        context.globalAlpha = 1;
        context.strokeStyle = "#2f3650";
        context.lineWidth = 2;
      } else if (element.kind === "text") {
        context.fillStyle = element.color ?? DEFAULT_STROKE_COLOR;
        context.globalAlpha = (element.opacity ?? DEFAULT_OPACITY) / 100;
        context.font = "20px Segoe UI";
        const lines = element.value.split("\n");
        lines.forEach((line, index) => {
          context.fillText(line, element.point.x, element.point.y + index * 22);
        });
        context.globalAlpha = 1;
      } else if (element.kind === "image") {
        const image = await loadImage(element.src);
        context.drawImage(image, element.point.x, element.point.y, element.width, element.height);
      } else if (element.kind === "note") {
        context.fillStyle = element.color;
        context.fillRect(element.point.x, element.point.y, element.width, element.height);
        context.fillStyle = "#3a3a4c";
        context.font = "15px Segoe UI";
        const lines = element.value.split("\n");
        lines.forEach((line, index) => {
          context.fillText(line, element.point.x + 14, element.point.y + 34 + index * 18);
        });
      } else if (element.kind === "table") {
        const rowHeight = 28;
        const headerHeight = 40;
        const height = headerHeight + element.fields.length * rowHeight;
        context.fillStyle = "#ffffff";
        context.strokeStyle = "#d8d8e8";
        context.fillRect(element.point.x, element.point.y, element.width, height);
        context.strokeRect(element.point.x, element.point.y, element.width, height);
        context.fillStyle = element.headerColor;
        context.fillRect(element.point.x, element.point.y, element.width, headerHeight);
        context.fillStyle = "#ffffff";
        context.font = "bold 14px Segoe UI";
        context.fillText(element.title, element.point.x + 14, element.point.y + 26);
        context.fillStyle = "#3a3a4c";
        context.font = "13px Segoe UI";
        element.fields.forEach((field, index) => {
          const y = element.point.y + headerHeight + index * rowHeight + 18;
          context.fillText(
            `${field.pk ? "PK " : ""}${field.name}`,
            element.point.x + 14,
            y,
          );
          context.fillStyle = "#8f8fa3";
          context.fillText(field.type, element.point.x + element.width - 70, y);
          context.fillStyle = "#3a3a4c";
        });
      } else if (element.kind === "web") {
        context.strokeStyle = "#5f6bff";
        context.strokeRect(element.point.x, element.point.y, element.width, element.height);
        context.fillStyle = "#5f6bff";
        context.font = "16px Segoe UI";
        context.fillText("Web Embed", element.point.x + 12, element.point.y + 24);
        context.fillStyle = "#2f3650";
        context.font = "14px Segoe UI";
        context.fillText(element.url, element.point.x + 12, element.point.y + 48);
      }
    }

    const imageUrl = canvas.toDataURL("image/png");
    const anchor = document.createElement("a");
    anchor.href = imageUrl;
    anchor.download = `${canvasName.toLowerCase().replace(/\s+/g, "-")}.png`;
    anchor.click();
    setStatusMessage("PNG export downloaded");
  };

  const handleLiveCollaboration = async () => {
    const liveUrl = `${window.location.origin}?room=${encodeURIComponent(roomId)}`;
    try {
      await navigator.clipboard.writeText(liveUrl);
      setStatusMessage("Collaboration link copied");
    } catch {
      setStatusMessage("Could not access clipboard");
    }
  };

  const clearEntireCanvas = () => {
    if (elements.length === 0) {
      setActiveTool("select");
      setStatusMessage("Canvas is already empty");
      return;
    }
    const confirmed = window.confirm(
      `Clear the entire canvas?\n\nThis will remove all ${elements.length} element${elements.length === 1 ? "" : "s"}.`,
    );
    if (!confirmed) {
      setStatusMessage("Clear cancelled");
      return;
    }
    setElements([]);
    setDraftElement(null);
    setPendingImagePoint(null);
    setPendingLibraryIcon(null);
    setActiveTool("select");
    setStatusMessage("Entire canvas cleared");
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (activeTool === "hand") {
      setHandStart(toScreenPoint(event));
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const point = getCanvasPoint(event);

    if (pendingLibraryIcon) {
      placeLibraryIcon(pendingLibraryIcon, point);
      setPendingLibraryIcon(null);
      return;
    }

    if (activeTool === "eraser") {
      const hitId = findElementAtPoint(point);
      if (hitId) {
        setElements((previous) => previous.filter((item) => item.id !== hitId));
        setStatusMessage("Element erased");
      }
      return;
    }

    if (activeTool === "text") {
      const value = window.prompt("Enter text");
      if (!value?.trim()) {
        setStatusMessage("Text cancelled");
        return;
      }
      setElements((previous) => [
        ...previous,
        {
          id: makeId(),
          kind: "text",
          point,
          value: value.trim(),
          color: strokeColor,
          opacity: strokeOpacity,
        },
      ]);
      setStatusMessage("Text added");
      return;
    }

    if (activeTool === "note") {
      const value = window.prompt("Sticky note text", "Note");
      if (value === null) {
        setStatusMessage("Sticky note cancelled");
        return;
      }
      setElements((previous) => [
        ...previous,
        {
          id: makeId(),
          kind: "note",
          point,
          width: 168,
          height: 120,
          value: value.trim() || "Note",
          color: noteColor,
        },
      ]);
      setStatusMessage("Sticky note added");
      return;
    }

    if (activeTool === "image") {
      setPendingImagePoint(point);
      const input = document.getElementById("canvas-open-image-input") as HTMLInputElement | null;
      input?.click();
      return;
    }

    if (activeTool === "draw") {
      setDraftElement({
        id: makeId(),
        kind: "draw",
        points: [point],
        color: strokeColor,
        strokeWidth,
        opacity: strokeOpacity,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (!isShapeTool(activeTool)) {
      return;
    }

    setDraftElement({
      id: makeId(),
      kind: "shape",
      tool: activeTool,
      start: point,
      end: point,
      color: strokeColor,
      strokeWidth,
      opacity: strokeOpacity,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (activeTool === "hand" && handStart) {
      const next = toScreenPoint(event);
      setPan((previous) => ({
        x: previous.x + (next.x - handStart.x),
        y: previous.y + (next.y - handStart.y),
      }));
      setHandStart(next);
      return;
    }

    if (!draftElement) {
      return;
    }
    const point = getCanvasPoint(event);
    setDraftElement((previous) => {
      if (!previous) {
        return previous;
      }
      if (previous.kind === "shape") {
        return { ...previous, end: point };
      }
      return { ...previous, points: [...previous.points, point] };
    });
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (activeTool === "hand") {
      setHandStart(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }

    if (!draftElement) {
      return;
    }

    if (draftElement.kind === "shape") {
      const point = getCanvasPoint(event);
      const completed = { ...draftElement, end: point };
      if (
        Math.abs(completed.end.x - completed.start.x) > 2 ||
        Math.abs(completed.end.y - completed.start.y) > 2
      ) {
        setElements((previous) => [...previous, completed]);
        setStatusMessage(`${completed.tool} created`);
      }
    } else if (draftElement.points.length > 1) {
      setElements((previous) => [...previous, draftElement]);
      setStatusMessage("Freehand stroke created");
    }

    setDraftElement(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const renderElement = (element: CanvasElement | ShapeElement | DrawElement) => {
    if (element.kind === "shape") {
      if (element.tool === "rectangle") {
        const { x, y, width, height } = getShapeBounds(element.start, element.end);
        return (
          <rect
            key={element.id}
            x={x}
            y={y}
            width={width}
            height={height}
            className={styles.canvasStroke}
            style={{
              stroke: element.color ?? DEFAULT_STROKE_COLOR,
              strokeWidth: element.strokeWidth ?? DEFAULT_STROKE_WIDTH,
              opacity: (element.opacity ?? DEFAULT_OPACITY) / 100,
            }}
          />
        );
      }
      if (element.tool === "diamond") {
        const { x, y, width, height } = getShapeBounds(element.start, element.end);
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        return (
          <polygon
            key={element.id}
            points={`${centerX},${y} ${x + width},${centerY} ${centerX},${y + height} ${x},${centerY}`}
            className={styles.canvasStroke}
            style={{
              stroke: element.color ?? DEFAULT_STROKE_COLOR,
              strokeWidth: element.strokeWidth ?? DEFAULT_STROKE_WIDTH,
              opacity: (element.opacity ?? DEFAULT_OPACITY) / 100,
            }}
          />
        );
      }
      if (element.tool === "ellipse") {
        const { x, y, width, height } = getShapeBounds(element.start, element.end);
        return (
          <ellipse
            key={element.id}
            cx={x + width / 2}
            cy={y + height / 2}
            rx={Math.max(width / 2, 1)}
            ry={Math.max(height / 2, 1)}
            className={styles.canvasStroke}
            style={{
              stroke: element.color ?? DEFAULT_STROKE_COLOR,
              strokeWidth: element.strokeWidth ?? DEFAULT_STROKE_WIDTH,
              opacity: (element.opacity ?? DEFAULT_OPACITY) / 100,
            }}
          />
        );
      }
      if (element.tool === "arrow") {
        return (
          <line
            key={element.id}
            x1={element.start.x}
            y1={element.start.y}
            x2={element.end.x}
            y2={element.end.y}
            markerEnd="url(#arrowhead)"
            className={styles.canvasStroke}
            style={{
              stroke: element.color ?? DEFAULT_STROKE_COLOR,
              strokeWidth: element.strokeWidth ?? DEFAULT_STROKE_WIDTH,
              opacity: (element.opacity ?? DEFAULT_OPACITY) / 100,
            }}
          />
        );
      }
      if (element.tool === "frame") {
        const { x, y, width, height } = getShapeBounds(element.start, element.end);
        return (
          <rect
            key={element.id}
            x={x}
            y={y}
            width={width}
            height={height}
            className={styles.frameStroke}
            style={{
              stroke: element.color ?? "#5861ea",
              opacity: (element.opacity ?? DEFAULT_OPACITY) / 100,
            }}
          />
        );
      }
      return (
        <line
          key={element.id}
          x1={element.start.x}
          y1={element.start.y}
          x2={element.end.x}
          y2={element.end.y}
          className={styles.canvasStroke}
          style={{
            stroke: element.color ?? DEFAULT_STROKE_COLOR,
            strokeWidth: element.strokeWidth ?? DEFAULT_STROKE_WIDTH,
            opacity: (element.opacity ?? DEFAULT_OPACITY) / 100,
          }}
        />
      );
    }

    if (element.kind === "draw") {
      if (element.points.length < 2) {
        return null;
      }
      const points = element.points.map((point) => `${point.x},${point.y}`).join(" ");
      return (
        <polyline
          key={element.id}
          points={points}
          className={styles.canvasStroke}
          style={{
            stroke: element.color,
            strokeWidth: element.strokeWidth,
            opacity: element.opacity / 100,
          }}
        />
      );
    }

    if (element.kind === "text") {
      const lines = element.value.split("\n");
      return (
        <text
          key={element.id}
          x={element.point.x}
          y={element.point.y}
          className={styles.canvasText}
          style={{
            fill: element.color ?? DEFAULT_STROKE_COLOR,
            opacity: (element.opacity ?? DEFAULT_OPACITY) / 100,
          }}
        >
          {lines.map((line, index) => (
            <tspan key={`${element.id}-${index}`} x={element.point.x} dy={index === 0 ? 0 : 22}>
              {line}
            </tspan>
          ))}
        </text>
      );
    }

    if (element.kind === "web") {
      return (
        <g key={element.id}>
          <rect
            x={element.point.x}
            y={element.point.y}
            width={element.width}
            height={element.height}
            className={styles.webEmbedStroke}
          />
          <text
            x={element.point.x + 12}
            y={element.point.y + 24}
            className={styles.webEmbedTitle}
          >
            Web Embed
          </text>
          <text x={element.point.x + 12} y={element.point.y + 48} className={styles.webEmbedText}>
            {element.url}
          </text>
        </g>
      );
    }

    if (element.kind === "note") {
      const lines = element.value.split("\n");
      return (
        <g key={element.id}>
          <rect
            x={element.point.x}
            y={element.point.y}
            width={element.width}
            height={element.height}
            rx={8}
            ry={8}
            className={styles.stickyNote}
            style={{ fill: element.color }}
          />
          <rect
            x={element.point.x}
            y={element.point.y}
            width={element.width}
            height={8}
            rx={8}
            ry={8}
            className={styles.stickyNoteFold}
            style={{ fill: element.color, filter: "brightness(0.92)" }}
          />
          <text
            x={element.point.x + 14}
            y={element.point.y + 34}
            className={styles.stickyNoteText}
          >
            {lines.map((line, index) => (
              <tspan
                key={`${element.id}-note-${index}`}
                x={element.point.x + 14}
                dy={index === 0 ? 0 : 18}
              >
                {line}
              </tspan>
            ))}
          </text>
        </g>
      );
    }

    if (element.kind === "table") {
      const rowHeight = 28;
      const headerHeight = 40;
      const height = headerHeight + element.fields.length * rowHeight;
      return (
        <g key={element.id}>
          <rect
            x={element.point.x}
            y={element.point.y}
            width={element.width}
            height={height}
            rx={10}
            ry={10}
            className={styles.erdTable}
          />
          <rect
            x={element.point.x}
            y={element.point.y}
            width={element.width}
            height={headerHeight}
            rx={10}
            ry={10}
            style={{ fill: element.headerColor }}
          />
          <rect
            x={element.point.x}
            y={element.point.y + 20}
            width={element.width}
            height={20}
            style={{ fill: element.headerColor }}
          />
          {element.iconSrc ? (
            <image
              href={element.iconSrc}
              x={element.point.x + 10}
              y={element.point.y + 8}
              width={24}
              height={24}
              preserveAspectRatio="xMidYMid meet"
            />
          ) : null}
          <text
            x={element.point.x + (element.iconSrc ? 42 : 14)}
            y={element.point.y + 26}
            className={styles.erdTableTitle}
          >
            {element.title}
          </text>
          {element.fields.map((field, index) => {
            const y = element.point.y + headerHeight + index * rowHeight;
            return (
              <g key={`${element.id}-field-${field.name}`}>
                {index > 0 ? (
                  <line
                    x1={element.point.x + 8}
                    y1={y}
                    x2={element.point.x + element.width - 8}
                    y2={y}
                    className={styles.erdRowDivider}
                  />
                ) : null}
                <text x={element.point.x + 14} y={y + 19} className={styles.erdFieldName}>
                  {field.pk ? "🔑 " : ""}
                  {field.name}
                </text>
                <text
                  x={element.point.x + element.width - 14}
                  y={y + 19}
                  textAnchor="end"
                  className={styles.erdFieldType}
                >
                  {field.type}
                  {field.pk ? " pk" : ""}
                </text>
              </g>
            );
          })}
        </g>
      );
    }

    return (
      <image
        key={element.id}
        href={element.src}
        x={element.point.x}
        y={element.point.y}
        width={element.width}
        height={element.height}
        preserveAspectRatio="xMinYMin meet"
      />
    );
  };

  if (fileMissing) {
    return (
      <div className={styles.page}>
        <div className={styles.missingBoard}>
          <h1>File not found</h1>
          <p>This board does not exist in your workspace.</p>
          <button type="button" className={styles.homeLinkButton} onClick={() => router.push("/")}>
            Back to workspace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.page} ${resolvedTheme === "dark" ? styles.pageDark : ""}`}>
      <aside className={styles.sideControl}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Back to workspace"
          title="Back to workspace"
          onClick={() => router.push("/")}
        >
          ←
        </button>
        <button
          type="button"
          ref={menuButtonRef}
          className={`${styles.iconButton} ${menuOpen ? styles.toolButtonActive : ""}`}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => {
            setMenuOpen((previous) => !previous);
            setShowPreferences(false);
          }}
        >
          ☰
        </button>
      </aside>

      {menuOpen && (
        <nav ref={menuPanelRef} className={styles.menuPanel} aria-label="Main menu">
          <div className={styles.menuHeader}>
            <div>
              <h3>Board menu</h3>
              <p>{canvasName}</p>
            </div>
            <button
              type="button"
              className={styles.menuClose}
              onClick={() => {
                setMenuOpen(false);
                setShowPreferences(false);
              }}
              aria-label="Close menu"
            >
              ×
            </button>
          </div>

          <p className={styles.menuSectionLabel}>File</p>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              document.getElementById("canvas-open-file-input")?.click();
              setMenuOpen(false);
            }}
          >
            <span className={styles.menuItemLeft}>Open</span>
            <span className={styles.shortcut}>Ctrl+O</span>
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              handleSave();
              setMenuOpen(false);
            }}
          >
            <span className={styles.menuItemLeft}>Save JSON</span>
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              void handleExportImage();
              setMenuOpen(false);
            }}
          >
            <span className={styles.menuItemLeft}>Export image</span>
            <span className={styles.shortcut}>Ctrl+⇧E</span>
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              void handleLiveCollaboration();
              setMenuOpen(false);
            }}
          >
            <span className={styles.menuItemLeft}>Live collaboration</span>
          </button>

          <p className={styles.menuSectionLabel}>Tools</p>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              setShowCommandPalette(true);
              setCommandQuery("");
              setMenuOpen(false);
            }}
          >
            <span className={styles.menuItemLeft}>Command palette</span>
            <span className={styles.shortcut}>Ctrl+/</span>
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              setShowFindPanel(true);
              setFindQuery("");
              setMenuOpen(false);
            }}
          >
            <span className={styles.menuItemLeft}>Find on canvas</span>
            <span className={styles.shortcut}>Ctrl+F</span>
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => {
              clearEntireCanvas();
              setMenuOpen(false);
            }}
          >
            <span className={styles.menuItemLeft}>Clear entire canvas</span>
          </button>

          <p className={styles.menuSectionLabel}>Settings</p>
          <button
            type="button"
            className={`${styles.menuItem} ${showPreferences ? styles.menuItemActive : ""}`}
            onClick={() => setShowPreferences((prev) => !prev)}
          >
            <span className={styles.menuItemLeft}>Preferences</span>
            <span className={styles.shortcut}>{showPreferences ? "▾" : "›"}</span>
          </button>

          {showPreferences && (
            <div className={styles.preferencesBox}>
              <label className={styles.prefRow}>
                <span>Show grid</span>
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(event) => setShowGrid(event.target.checked)}
                />
              </label>
              <label className={styles.prefRow}>
                <span>File name</span>
                <input
                  className={styles.prefInput}
                  value={canvasName}
                  onChange={(event) => setCanvasName(event.target.value)}
                />
              </label>
              <p className={styles.prefHint}>Theme & canvas background are below.</p>
            </div>
          )}

          <div className={styles.themeRow}>
            <span>Theme</span>
            <div className={styles.themeSwitcher} role="tablist" aria-label="Theme mode">
              <button
                type="button"
                className={`${styles.themeOption} ${
                  themeMode === "light" ? styles.themeOptionActive : ""
                }`}
                onClick={() => setThemeMode("light")}
                aria-label="Light theme"
              >
                ☀
              </button>
              <button
                type="button"
                className={`${styles.themeOption} ${
                  themeMode === "dark" ? styles.themeOptionActive : ""
                }`}
                onClick={() => setThemeMode("dark")}
                aria-label="Dark theme"
              >
                ☾
              </button>
              <button
                type="button"
                className={`${styles.themeOption} ${
                  themeMode === "system" ? styles.themeOptionActive : ""
                }`}
                onClick={() => setThemeMode("system")}
                aria-label="System theme"
              >
                ⊡
              </button>
            </div>
          </div>

          <div className={styles.canvasBackgroundSection}>
            <p className={styles.canvasBackgroundLabel}>Canvas background</p>
            <div className={styles.canvasBackgroundRow}>
              {CANVAS_BACKGROUNDS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.canvasBgSwatch} ${
                    backgroundColor === color ? styles.canvasBgSwatchActive : ""
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setBackgroundColor(color)}
                  aria-label={`Canvas background ${color}`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            className={styles.menuHomeButton}
            onClick={() => router.push("/")}
          >
            ← Back to workspace
          </button>
        </nav>
      )}

      {showCommandPalette && (
        <div
          className={styles.overlayPanel}
          onClick={() => setShowCommandPalette(false)}
        >
          <div
            className={styles.commandModal}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              autoFocus
              className={styles.commandInput}
              placeholder="Type a command…"
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && filteredCommands[0]) {
                  filteredCommands[0].run();
                  setShowCommandPalette(false);
                }
              }}
            />
            <div className={styles.commandList}>
              {filteredCommands.length === 0 ? (
                <p className={styles.commandEmpty}>No commands match</p>
              ) : (
                filteredCommands.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={styles.commandItem}
                    onClick={() => {
                      action.run();
                      setShowCommandPalette(false);
                    }}
                  >
                    <span>{action.label}</span>
                    <span className={styles.shortcut}>{action.hint}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showFindPanel && (
        <div className={styles.overlayPanel} onClick={() => setShowFindPanel(false)}>
          <div className={styles.findModal} onClick={(event) => event.stopPropagation()}>
            <h3>Find on canvas</h3>
            <p>Search text inside notes, labels, and ER tables.</p>
            <input
              autoFocus
              className={styles.commandInput}
              placeholder="Search text…"
              value={findQuery}
              onChange={(event) => setFindQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  runFindOnCanvas(findQuery);
                  setShowFindPanel(false);
                }
              }}
            />
            <div className={styles.findActions}>
              <button
                type="button"
                className={styles.findPrimary}
                onClick={() => {
                  runFindOnCanvas(findQuery);
                  setShowFindPanel(false);
                }}
              >
                Find
              </button>
              <button type="button" onClick={() => setShowFindPanel(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <header className={styles.topToolbar} aria-label="Tools">
        <button
          type="button"
          className={`${styles.iconButton} ${styles.lockButton} ${styles.lockActive}`}
        >
          {toolIcon("lock")}
        </button>
        {MAIN_TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`${styles.toolButton} ${
              activeTool === tool.id ? styles.toolButtonActive : ""
            }`}
            title={tool.label}
            onClick={() => {
              setActiveTool(tool.id);
              setShowExtras(false);
              setMenuOpen(false);
              setStatusMessage(`${tool.label} tool selected`);
            }}
          >
            {toolIcon(tool.id)}
            {tool.keyHint ? <span className={styles.keyHint}>{tool.keyHint}</span> : null}
          </button>
        ))}
        <div className={styles.toolbarDivider} />
        <button
          type="button"
          className={`${styles.toolButton} ${showCatalogPanel ? styles.toolButtonActive : ""}`}
          title="Diagram catalog"
          onClick={() => {
            setShowCatalogPanel((previous) => !previous);
            setShowIconsPanel(false);
            setShowExtras(false);
            setMenuOpen(false);
          }}
        >
          {menuGlyph("catalog")}
        </button>
        <button
          type="button"
          className={`${styles.toolButton} ${showIconsPanel ? styles.toolButtonActive : ""}`}
          title="Icon library"
          onClick={() => {
            setShowIconsPanel((previous) => !previous);
            setShowCatalogPanel(false);
            setShowExtras(false);
            setMenuOpen(false);
          }}
        >
          {menuGlyph("icons")}
        </button>
        <button
          type="button"
          ref={moreToolsButtonRef}
          className={`${styles.toolButton} ${showExtras ? styles.toolButtonActive : ""}`}
          title="More tools"
          onClick={() => setShowExtras((previous) => !previous)}
        >
          {toolIcon("more")}
        </button>
        <button
          type="button"
          className={`${styles.toolButton} ${activeTool === "eraser" ? styles.toolButtonActive : ""}`}
          title="Eraser — click objects, or open Clear all"
          onClick={() => {
            if (activeTool === "eraser") {
              clearEntireCanvas();
              return;
            }
            setActiveTool("eraser");
            setShowExtras(false);
            setPendingLibraryIcon(null);
            setStatusMessage("Eraser ready — click objects, or click Eraser again to clear all");
          }}
        >
          {toolIcon("eraser")}
          <span className={styles.keyHint}>0</span>
        </button>
      </header>

      {showExtras && (
        <section ref={extrasPanelRef} className={styles.extrasPanel}>
          <div className={styles.extrasHeader}>
            <h3>More tools</h3>
            <p>Frames, notes, libraries &amp; AI</p>
          </div>

          <div className={styles.extrasSection}>
            {EXTRA_TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={styles.extrasItem}
                onClick={() => {
                  setActiveTool(tool.id);
                  setShowExtras(false);
                  setPendingLibraryIcon(null);
                  setStatusMessage(`${tool.label} selected`);
                }}
              >
                <span className={styles.extrasIconWrap}>{toolIcon(tool.id)}</span>
                <span className={styles.extrasItemText}>
                  <strong>{tool.label}</strong>
                </span>
                <span className={styles.shortcut}>{tool.shortcut}</span>
              </button>
            ))}
          </div>

          <p className={styles.extrasHeading}>Library</p>
          <div className={styles.extrasSection}>
            <button
              type="button"
              className={styles.extrasItem}
              onClick={() => {
                setShowCatalogPanel(true);
                setShowIconsPanel(false);
                setShowExtras(false);
              }}
            >
              <span className={`${styles.extrasIconWrap} ${styles.extrasIconCatalog}`}>
                {menuGlyph("catalog")}
              </span>
              <span className={styles.extrasItemText}>
                <strong>Diagram catalog</strong>
                <small>Flow, ERD, cloud &amp; more</small>
              </span>
            </button>
            <button
              type="button"
              className={styles.extrasItem}
              onClick={() => {
                setShowIconsPanel(true);
                setShowCatalogPanel(false);
                setShowExtras(false);
              }}
            >
              <span className={`${styles.extrasIconWrap} ${styles.extrasIconLibrary}`}>
                {menuGlyph("icons")}
              </span>
              <span className={styles.extrasItemText}>
                <strong>Icon library</strong>
                <small>Tech, cloud &amp; custom icons</small>
              </span>
            </button>
            <button
              type="button"
              className={styles.extrasItem}
              onClick={() => handleInsertStarter("flowchart")}
            >
              <span className={`${styles.extrasIconWrap} ${styles.extrasIconFlow}`}>
                {menuGlyph("flow")}
              </span>
              <span className={styles.extrasItemText}>
                <strong>Flowchart starter</strong>
                <small>Quick decision flow</small>
              </span>
            </button>
            <button
              type="button"
              className={styles.extrasItem}
              onClick={() => handleInsertStarter("architecture")}
            >
              <span className={`${styles.extrasIconWrap} ${styles.extrasIconArch}`}>
                {menuGlyph("arch")}
              </span>
              <span className={styles.extrasItemText}>
                <strong>Architecture starter</strong>
                <small>Services &amp; data layout</small>
              </span>
            </button>
          </div>

          <p className={styles.extrasHeading}>Generate with AI</p>
          <div className={styles.aiCards}>
            <button
              type="button"
              className={styles.aiCard}
              onClick={() => {
                openGenerateModal("text");
                setShowExtras(false);
              }}
            >
              <span className={styles.aiCardIcon}>{menuGlyph("ai")}</span>
              <span className={styles.aiCardBody}>
                <strong>
                  Text to diagram <span className={styles.aiBadge}>AI</span>
                </strong>
                <small>Describe a flow and generate Mermaid on the canvas</small>
              </span>
            </button>
            <button
              type="button"
              className={styles.aiCard}
              onClick={() => {
                openGenerateModal("mermaid");
                setShowExtras(false);
              }}
            >
              <span className={`${styles.aiCardIcon} ${styles.aiCardIconAlt}`}>
                {menuGlyph("mermaid")}
              </span>
              <span className={styles.aiCardBody}>
                <strong>Mermaid to diagram</strong>
                <small>Paste Mermaid code and render it as an image</small>
              </span>
            </button>
          </div>
        </section>
      )}

      {showCatalogPanel && (
        <aside className={styles.catalogPanel} aria-label="Diagram catalog">
          <div className={styles.iconsPanelHeader}>
            <div>
              <h3 className={styles.iconsPanelTitle}>Diagram Catalog</h3>
              <p className={styles.iconsPanelHint}>Insert ready-made diagrams onto the canvas</p>
            </div>
            <button
              type="button"
              className={styles.iconsClose}
              onClick={() => setShowCatalogPanel(false)}
              aria-label="Close catalog"
            >
              ×
            </button>
          </div>

          <input
            type="search"
            className={styles.iconsSearch}
            placeholder="Insert item…"
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
          />

          <div className={styles.iconsCategoryRow}>
            {DIAGRAM_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`${styles.iconsCategoryChip} ${
                  catalogCategory === category.id ? styles.iconsCategoryChipActive : ""
                }`}
                onClick={() => setCatalogCategory(category.id)}
              >
                {category.label}
              </button>
            ))}
          </div>

          <div className={styles.catalogList}>
            {catalogTemplates.length === 0 ? (
              <p className={styles.iconsEmpty}>No templates match your search.</p>
            ) : (
              catalogTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={styles.catalogCard}
                  onClick={() => insertDiagramTemplate(template)}
                >
                  <span
                    className={styles.catalogThumb}
                    style={{ background: `${template.previewAccent}22`, color: template.previewAccent }}
                  >
                    {template.badge}
                  </span>
                  <span className={styles.catalogMeta}>
                    <strong>{template.title}</strong>
                    <small>{template.description}</small>
                  </span>
                  <span className={styles.catalogInsert}>Insert</span>
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      {showIconsPanel && (
        <aside
          ref={iconsPanelRef}
          className={styles.iconsPanel}
          style={{
            left:
              showCatalogPanel
                ? 330
                : showStylePanel || activeTool === "note"
                  ? 190
                  : 14,
          }}
          aria-label="Icon library"
        >
          <div className={styles.iconsPanelHeader}>
            <div>
              <h3 className={styles.iconsPanelTitle}>Icons</h3>
              <p className={styles.iconsPanelHint}>
                {pendingLibraryIcon
                  ? `Place "${pendingLibraryIcon.name}" — click canvas`
                  : "Pick an icon, then click the canvas"}
              </p>
            </div>
            <button
              type="button"
              className={styles.iconsClose}
              onClick={() => {
                setShowIconsPanel(false);
                setPendingLibraryIcon(null);
              }}
              aria-label="Close icons panel"
            >
              ×
            </button>
          </div>

          <input
            type="search"
            className={styles.iconsSearch}
            placeholder="Search icons…"
            value={iconSearch}
            onChange={(event) => setIconSearch(event.target.value)}
          />

          <div className={styles.iconsCategoryRow}>
            <button
              type="button"
              className={`${styles.iconsCategoryChip} ${
                iconCategory === "all" ? styles.iconsCategoryChipActive : ""
              }`}
              onClick={() => setIconCategory("all")}
            >
              All
            </button>
            {ICON_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`${styles.iconsCategoryChip} ${
                  iconCategory === category.id ? styles.iconsCategoryChipActive : ""
                }`}
                onClick={() => setIconCategory(category.id)}
              >
                {category.label}
              </button>
            ))}
          </div>

          <label className={styles.iconsUpload}>
            <input
              type="file"
              accept="image/*,.svg"
              className={styles.hiddenInput}
              onChange={handleUploadCustomIcon}
            />
            <span className={styles.iconsUploadIcon}>↑</span>
            <span>
              <strong>Custom Icons</strong>
              <small>Upload SVG or PNG for your board</small>
            </span>
          </label>

          <div className={styles.iconsScroll}>
            {iconsBySection.length === 0 ? (
              <p className={styles.iconsEmpty}>No icons match your search.</p>
            ) : (
              iconsBySection.map((section) => {
                const meta = ICON_CATEGORIES.find((item) => item.id === section.id);
                return (
                  <div key={section.id} className={styles.iconsSection}>
                    <div className={styles.iconsSectionHead}>
                      <span>{meta?.label ?? section.id}</span>
                      <span className={styles.iconsCount}>{section.icons.length}</span>
                    </div>
                    <div className={styles.iconsGrid}>
                      {section.icons.map((icon) => (
                        <button
                          key={icon.id}
                          type="button"
                          className={`${styles.iconTile} ${
                            pendingLibraryIcon?.id === icon.id ? styles.iconTileActive : ""
                          }`}
                          title={icon.name}
                          onClick={() => handleSelectLibraryIcon(icon)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={icon.src} alt="" className={styles.iconTileImg} />
                          <span className={styles.iconTileLabel}>{icon.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      {showGenerateModal && (
        <section
          className={styles.generateOverlay}
          onClick={() => {
            if (!isGenerating) {
              setShowGenerateModal(false);
            }
          }}
        >
          <div className={styles.generateModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.generateTabs}>
              <button
                type="button"
                className={`${styles.generateTab} ${
                  generateTab === "text" ? styles.generateTabActive : ""
                }`}
                onClick={() => setGenerateTab("text")}
              >
                Text to diagram
                <span className={styles.aiBadge}>AI Beta</span>
              </button>
              <button
                type="button"
                className={`${styles.generateTab} ${
                  generateTab === "mermaid" ? styles.generateTabActive : ""
                }`}
                onClick={() => setGenerateTab("mermaid")}
              >
                Mermaid
              </button>
            </div>

            <div className={styles.generateBody}>
              <h3>Let&apos;s design your diagram</h3>
              <p>
                {generateTab === "text"
                  ? (
                      <>
                        Describe the diagram you want to create, and we&apos;ll generate it for you.
                        <br />
                        <br />
                        At the moment we know Flowchart, Sequence, Class, State, and Entity Relationship
                        diagrams.
                      </>
                    )
                  : "Paste Mermaid and we will improve and validate it."}
              </p>
            </div>

            <div className={styles.generateInputArea}>
              <textarea
                value={generateInput}
                onChange={(event) => setGenerateInput(event.target.value)}
                placeholder={
                  generateTab === "text"
                    ? "Start typing your diagram idea here..."
                    : "Paste Mermaid code here..."
                }
                className={styles.generateTextarea}
                rows={4}
              />
              <button
                type="button"
                className={styles.generateSubmit}
                onClick={handleGenerateDiagram}
                disabled={isGenerating}
              >
                {isGenerating ? "..." : "↑"}
              </button>
            </div>
            {generateError ? <p className={styles.generateError}>{generateError}</p> : null}
          </div>
        </section>
      )}

      <button
        type="button"
        className={styles.collabButton}
        aria-label="Share collaboration link"
        onClick={handleLiveCollaboration}
      >
        <svg viewBox="0 0 24 24" className={styles.topRightSvg} aria-hidden>
          <circle cx="18" cy="5" r="2.4" />
          <circle cx="6" cy="12" r="2.4" />
          <circle cx="18" cy="19" r="2.4" />
          <path d="M8.2 11 15.7 6.4M8.2 13 15.7 17.6" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.layoutButton}
        aria-label="Reset pan to center"
        onClick={() => {
          setPan({ x: 0, y: 0 });
          setStatusMessage("View centered");
        }}
      >
        <svg viewBox="0 0 24 24" className={styles.topRightSvg} aria-hidden>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      </button>

      <main
        className={`${styles.canvasArea} ${showGrid ? "" : styles.canvasAreaNoGrid}`}
      >
        {showStylePanel && (
          <aside
            ref={propertiesPanelRef}
            className={styles.propertiesPanel}
            style={{ left: menuOpen ? 280 : 14 }}
          >
            <div className={styles.propertiesHeader}>
              <p className={styles.propertyLabel}>Style</p>
              <button
                type="button"
                className={styles.menuClose}
                onClick={closeStylePanel}
                aria-label="Close style panel"
              >
                ×
              </button>
            </div>
            <div className={styles.propertyGroup}>
              <p className={styles.propertyLabel}>Stroke</p>
              <div className={styles.colorRow}>
                {["#1f1f2e", "#e0314f", "#2fb344", "#228be6", "#f08c00"].map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`${styles.colorSwatch} ${
                      strokeColor === color ? styles.swatchActive : ""
                    }`}
                    style={{ background: color }}
                    onClick={() => setStrokeColor(color)}
                    aria-label={`Stroke color ${color}`}
                  />
                ))}
              </div>
            </div>

            <div className={styles.propertyGroup}>
              <p className={styles.propertyLabel}>Stroke width</p>
              <div className={styles.widthRow}>
                {[1, 2, 4].map((width) => (
                  <button
                    key={width}
                    type="button"
                    className={`${styles.widthButton} ${
                      strokeWidth === width ? styles.widthButtonActive : ""
                    }`}
                    onClick={() => setStrokeWidth(width)}
                  >
                    <span style={{ fontWeight: 700 }}>{width === 1 ? "−" : width === 2 ? "–" : "—"}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.propertyGroup}>
              <p className={styles.propertyLabel}>Opacity</p>
              <input
                type="range"
                min={0}
                max={100}
                value={strokeOpacity}
                onChange={(event) => setStrokeOpacity(Number(event.target.value))}
                className={styles.opacitySlider}
              />
              <div className={styles.opacityScale}>
                <span>0</span>
                <span>{strokeOpacity}</span>
              </div>
            </div>
            <p className={styles.panelCloseHint}>Press Esc or × to close</p>
          </aside>
        )}

        {activeTool === "note" && (
          <aside
            ref={propertiesPanelRef}
            className={styles.propertiesPanel}
            style={{ left: menuOpen ? 280 : 14 }}
          >
            <div className={styles.propertiesHeader}>
              <p className={styles.propertyLabel}>Sticky note</p>
              <button
                type="button"
                className={styles.menuClose}
                onClick={closeStylePanel}
                aria-label="Close note panel"
              >
                ×
              </button>
            </div>
            <div className={styles.propertyGroup}>
              <p className={styles.propertyLabel}>Note color</p>
              <div className={styles.colorRow}>
                {NOTE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`${styles.colorSwatch} ${
                      noteColor === color ? styles.swatchActive : ""
                    }`}
                    style={{ background: color }}
                    onClick={() => setNoteColor(color)}
                    aria-label={`Note color ${color}`}
                  />
                ))}
              </div>
            </div>
            <p className={styles.propertyLabel}>Click the canvas to place a sticky note.</p>
          </aside>
        )}

        {activeTool === "eraser" && (
          <aside
            ref={propertiesPanelRef}
            className={styles.propertiesPanel}
            style={{ left: menuOpen ? 280 : 14 }}
            aria-label="Eraser options"
          >
            <div className={styles.propertiesHeader}>
              <p className={styles.propertyLabel}>Eraser modes</p>
              <button
                type="button"
                className={styles.menuClose}
                onClick={closeStylePanel}
                aria-label="Close eraser panel"
              >
                ×
              </button>
            </div>
            <p className={styles.eraserHint}>
              Click any object on the canvas to erase it one by one.
            </p>
            <button
              type="button"
              className={styles.clearCanvasButton}
              onClick={clearEntireCanvas}
              disabled={elements.length === 0}
            >
              Clear entire canvas
            </button>
            <p className={styles.eraserHintMuted}>
              Tip: click the Eraser tool again to clear all.
            </p>
          </aside>
        )}

        <svg
          className={`${styles.drawingSurface} ${
            pendingLibraryIcon
              ? styles.imageCursor
              : activeTool === "eraser"
              ? styles.eraserCursor
              : activeTool === "text" || activeTool === "note"
                ? styles.textCursor
                : activeTool === "image"
                  ? styles.imageCursor
                  : activeTool === "hand"
                    ? styles.handCursor
                  : ""
          }`}
          style={{
            backgroundColor,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" className={styles.arrowHeadFill} />
            </marker>
            <filter id="find-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#6858f8" floodOpacity="0.95" />
            </filter>
          </defs>
          <g transform={`translate(${pan.x} ${pan.y})`}>
            {elements.map((element) => (
              <g
                key={`h-${element.id}`}
                filter={highlightedId === element.id ? "url(#find-glow)" : undefined}
              >
                {renderElement(element)}
              </g>
            ))}
            {draftElement && renderElement({ ...draftElement, id: "draft-element" })}
          </g>
        </svg>
        <input
          id="canvas-open-file-input"
          type="file"
          accept="application/json"
          className={styles.hiddenInput}
          onChange={handleOpenCanvas}
        />
        <input
          id="canvas-open-image-input"
          type="file"
          accept="image/*"
          className={styles.hiddenInput}
          onChange={handleOpenImage}
        />
        <p className={styles.toolHint}>
          To move canvas, hold <kbd>Space</kbd> while dragging, or use the hand tool.
        </p>
        <p className={styles.statusText}>
          {canvasName} · Active tool: <strong>{activeToolLabel}</strong> · {statusMessage} ·
          Elements: {elements.length} · Pan: ({Math.round(pan.x)}, {Math.round(pan.y)})
        </p>
      </main>

      <div className={styles.bottomRightActions}>
        <button type="button" className={styles.iconButton} aria-label="Help" title="Tips">
          ?
        </button>
      </div>
    </div>
  );
}
