"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import styles from "./page.module.css";

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
  { id: "frame", icon: "#", label: "Frame tool", shortcut: "F" },
  { id: "webEmbed", icon: "<>", label: "Web Embed", shortcut: "" },
  { id: "laser", icon: "✣", label: "Laser pointer", shortcut: "K" },
  { id: "lasso", icon: "◌", label: "Lasso selection", shortcut: "" },
] as const;

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

type CanvasElement =
  | ShapeElement
  | DrawElement
  | TextElement
  | ImageElement
  | WebEmbedElement;

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

const toolIcon = (id: MainToolId | "eraser" | "more" | "lock"): ReactNode => {
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
  if (id === "select") return <span className={styles.iconGlyph}>↖</span>;
  if (id === "rectangle") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <rect x="4.5" y="6.5" width="15" height="11" rx="0.8" />
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
  if (id === "arrow") return <span className={styles.iconGlyph}>→</span>;
  if (id === "line") return <span className={styles.iconGlyph}>—</span>;
  if (id === "draw") return <span className={styles.iconGlyph}>✎</span>;
  if (id === "text") return <span className={styles.iconGlyph}>A</span>;
  if (id === "image") return <span className={styles.iconGlyph}>▣</span>;
  if (id === "eraser") {
    return (
      <svg viewBox="0 0 24 24" className={styles.toolSvg} aria-hidden>
        <path d="M4.7 13.8 11.6 6.9a2 2 0 0 1 2.8 0l4.9 4.9a2 2 0 0 1 0 2.8l-4.2 4.2a2 2 0 0 1-1.4.6H9.5a2 2 0 0 1-1.4-.6l-3.4-3.4a1.1 1.1 0 0 1 0-1.6Z" />
        <path d="M10.2 19.3h9.1" />
      </svg>
    );
  }
  return <span className={styles.iconGlyph}>△</span>;
};

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(true);
  const [activeTool, setActiveTool] = useState<ToolId>("select");
  const [showExtras, setShowExtras] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Canvas ready");
  const [canvasName, setCanvasName] = useState("Untitled canvas");
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [draftElement, setDraftElement] = useState<ShapeElement | DrawElement | null>(null);
  const [lassoDraft, setLassoDraft] = useState<Point[]>([]);
  const [laserDraft, setLaserDraft] = useState<Point[]>([]);
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
  const extrasPanelRef = useRef<HTMLElement | null>(null);
  const moreToolsButtonRef = useRef<HTMLButtonElement | null>(null);
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

  const handleMockAction = (action: string) => setStatusMessage(action);

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
      } else if (element.kind === "image") {
        if (
          point.x >= element.point.x &&
          point.x <= element.point.x + element.width &&
          point.y >= element.point.y &&
          point.y <= element.point.y + element.height
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

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (activeTool === "hand") {
      setHandStart(toScreenPoint(event));
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const point = getCanvasPoint(event);

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

    if (activeTool === "image") {
      setPendingImagePoint(point);
      const input = document.getElementById("canvas-open-image-input") as HTMLInputElement | null;
      input?.click();
      return;
    }

    if (activeTool === "webEmbed") {
      const url = window.prompt("Paste website URL");
      if (!url?.trim()) {
        setStatusMessage("Web embed cancelled");
        return;
      }
      setElements((previous) => [
        ...previous,
        {
          id: makeId(),
          kind: "web",
          point,
          width: 260,
          height: 90,
          url: url.trim(),
        },
      ]);
      setStatusMessage("Web embed created");
      return;
    }

    if (activeTool === "lasso") {
      setLassoDraft([point]);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (activeTool === "laser") {
      setLaserDraft([point]);
      event.currentTarget.setPointerCapture(event.pointerId);
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

    if (activeTool === "lasso" && lassoDraft.length > 0) {
      const point = getCanvasPoint(event);
      setLassoDraft((previous) => [...previous, point]);
      return;
    }

    if (activeTool === "laser" && laserDraft.length > 0) {
      const point = getCanvasPoint(event);
      setLaserDraft((previous) => [...previous, point]);
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

    if (activeTool === "lasso") {
      if (lassoDraft.length > 2) {
        setStatusMessage(`Lasso captured ${lassoDraft.length} points`);
      }
      setLassoDraft([]);
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }

    if (activeTool === "laser") {
      setStatusMessage("Laser pointer used");
      setTimeout(() => setLaserDraft([]), 260);
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

  return (
    <div className={`${styles.page} ${resolvedTheme === "dark" ? styles.pageDark : ""}`}>
      <aside className={styles.sideControl}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((previous) => !previous)}
        >
          ☰
        </button>
      </aside>

      {menuOpen && (
        <nav className={styles.menuPanel} aria-label="Main menu">
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              const element = document.getElementById(
                "canvas-open-file-input",
              ) as HTMLInputElement | null;
              element?.click();
            }}
          >
            <span>Open</span>
            <span className={styles.shortcut}>Ctrl+O</span>
          </button>
          <button type="button" className={styles.menuItem} onClick={handleSave}>
            <span>Save to...</span>
          </button>
          <button type="button" className={styles.menuItem} onClick={handleExportImage}>
            <span>Export image...</span>
            <span className={styles.shortcut}>Ctrl+Shift+E</span>
          </button>
          <button type="button" className={styles.menuItem} onClick={handleLiveCollaboration}>
            <span>Live collaboration...</span>
          </button>

          <div className={styles.separator} />

          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleMockAction("Command palette opened")}
          >
            <span>Command palette</span>
            <span className={styles.shortcut}>Ctrl+/</span>
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleMockAction("Search across canvases")}
          >
            <span>Find on canvas</span>
            <span className={styles.shortcut}>Ctrl+F</span>
          </button>

          <div className={styles.separator} />

          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              setElements([]);
              setDraftElement(null);
              handleMockAction("Canvas reset");
            }}
          >
            <span>Reset the canvas</span>
          </button>

          <div className={styles.separator} />

          <button type="button" className={styles.menuItem}>
            <span>Preferences</span>
            <span className={styles.shortcut}>›</span>
          </button>
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
          <button type="button" className={styles.languageButton}>
            <span>English</span>
            <span className={styles.languageCaret}>▲</span>
          </button>
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
        </nav>
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
          title="Eraser"
          onClick={() => {
            setActiveTool("eraser");
            setShowExtras(false);
            setStatusMessage("Eraser tool selected");
          }}
        >
          {toolIcon("eraser")}
          <span className={styles.keyHint}>0</span>
        </button>
      </header>

      {showExtras && (
        <section ref={extrasPanelRef} className={styles.extrasPanel}>
          {EXTRA_TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={styles.extrasItem}
              onClick={() => {
                setActiveTool(tool.id);
                setShowExtras(false);
                setStatusMessage(`${tool.label} selected`);
              }}
            >
              <span className={styles.extrasIcon}>{tool.icon}</span>
              <span>{tool.label}</span>
              <span className={styles.shortcut}>{tool.shortcut}</span>
            </button>
          ))}
          <p className={styles.extrasHeading}>Generate</p>
          <button
            type="button"
            className={styles.extrasItem}
            onClick={() => {
              openGenerateModal("text");
              setShowExtras(false);
            }}
          >
            <span className={styles.extrasIcon}>✾</span>
            <span>Text to diagram</span>
            <span className={styles.aiBadge}>AI</span>
          </button>
          <button
            type="button"
            className={styles.extrasItem}
            onClick={() => {
              openGenerateModal("mermaid");
              setShowExtras(false);
            }}
          >
            <span className={styles.extrasIcon}>🦋</span>
            <span>Mermaid to Excalidraw</span>
            <span className={styles.shortcut} />
          </button>
          <button
            type="button"
            className={styles.extrasItem}
            onClick={() => {
              setActiveTool("frame");
              setShowExtras(false);
              setStatusMessage("Wireframe mode uses Frame tool");
            }}
          >
            <span className={styles.extrasIcon}>✎</span>
            <span>Wireframe to code</span>
            <span className={styles.aiBadge}>AI</span>
          </button>
        </section>
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

      <button type="button" className={styles.shareButton}>
        Excalidraw+
      </button>
      <button type="button" className={styles.collabButton} aria-label="Share">
        ⤴
      </button>
      <button type="button" className={styles.layoutButton} aria-label="Layout options">
        ◫
      </button>

      <main className={styles.canvasArea}>
        {showStylePanel && (
          <aside className={styles.propertiesPanel}>
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
              <p className={styles.propertyLabel}>Background</p>
              <div className={styles.colorRow}>
                {["#f7f7fb", "#ffd4e0", "#d8f5dc", "#d0ebff", "#fff3bf"].map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`${styles.colorSwatch} ${
                      backgroundColor === color ? styles.swatchActive : ""
                    }`}
                    style={{ background: color }}
                    onClick={() => setBackgroundColor(color)}
                    aria-label={`Background color ${color}`}
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
          </aside>
        )}
        <svg
          className={`${styles.drawingSurface} ${
            activeTool === "eraser"
              ? styles.eraserCursor
              : activeTool === "text"
                ? styles.textCursor
                : activeTool === "image"
                  ? styles.imageCursor
                  : activeTool === "hand"
                    ? styles.handCursor
                  : ""
          }`}
          style={{ backgroundColor }}
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
          </defs>
          <g transform={`translate(${pan.x} ${pan.y})`}>
            {elements.map(renderElement)}
            {draftElement && renderElement({ ...draftElement, id: "draft-element" })}
            {lassoDraft.length > 1 ? (
              <polyline
                points={lassoDraft.map((point) => `${point.x},${point.y}`).join(" ")}
                className={styles.lassoStroke}
              />
            ) : null}
            {laserDraft.length > 1 ? (
              <polyline
                points={laserDraft.map((point) => `${point.x},${point.y}`).join(" ")}
                className={styles.laserStroke}
              />
            ) : null}
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

      <button type="button" className={styles.centerAction}>
        Scroll back to content
      </button>

      <div className={styles.bottomRightActions}>
        <button type="button" className={styles.iconButton} aria-label="Verified">
          ✓
        </button>
        <button type="button" className={styles.iconButton} aria-label="Help">
          ?
        </button>
      </div>
    </div>
  );
}
