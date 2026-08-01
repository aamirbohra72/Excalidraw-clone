"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
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
import { beautifyMermaid, enhanceMermaidSvg, getSvgDimensions } from "../../lib/mermaidStyle";
import {
  DIAGRAM_COMPOSER_PLACEHOLDERS,
  DIAGRAM_FORMAT_HINTS,
  DIAGRAM_FORMAT_LABELS,
  getDiagramExamples,
} from "../../lib/diagramExamples";
import {
  buildErdFromMermaid,
  isCrowfootJunkText,
  sanitizeErdFields,
} from "../../lib/erdFromMermaid";

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
type ViewMode = "document" | "both" | "canvas";
type SidebarStep = "tools" | "insert" | "ai" | "search" | "share" | "file" | null;

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
type AiCreateFormat =
  | "architecture"
  | "flowchart"
  | "erd"
  | "sequence"
  | "bpmn"
  | "document";

type AiChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};

const isShapeTool = (tool: ToolId): tool is ShapeTool =>
  ["rectangle", "diamond", "ellipse", "line", "arrow", "frame"].includes(tool);

const getShapeBounds = (start: Point, end: Point) => {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
};

type Bounds = { x: number; y: number; width: number; height: number };

const DIAGRAM_GAP = 96;
const DIAGRAM_TARGET_WIDTH = 1040;
const DIAGRAM_MAX_WIDTH = 1280;
const DIAGRAM_FRAME_EXTRA_W = 56;
const DIAGRAM_FRAME_EXTRA_H = 92;
const FIT_PADDING = 48;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

const computeFitView = (
  bounds: Bounds,
  viewport: { width: number; height: number },
  padding = FIT_PADDING,
): { pan: Point; zoom: number } => {
  const availW = Math.max(120, viewport.width - padding * 2);
  const availH = Math.max(120, viewport.height - padding * 2);
  const zoom = Math.min(
    1,
    availW / Math.max(1, bounds.width),
    availH / Math.max(1, bounds.height),
  );
  const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  return {
    zoom: clampedZoom,
    pan: {
      x: viewport.width / 2 - (bounds.x + bounds.width / 2) * clampedZoom,
      y: viewport.height / 2 - (bounds.y + bounds.height / 2) * clampedZoom,
    },
  };
};

const getElementBounds = (element: CanvasElement): Bounds | null => {
  if (element.kind === "shape") {
    const bounds = getShapeBounds(element.start, element.end);
    return bounds.width > 0 || bounds.height > 0 ? bounds : null;
  }
  if (element.kind === "draw") {
    if (element.points.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of element.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }
  if (element.kind === "text") {
    const lines = element.value.split("\n").length;
    return {
      x: element.point.x,
      y: element.point.y,
      width: Math.min(420, Math.max(160, element.value.length * 7)),
      height: Math.max(28, lines * 20),
    };
  }
  if (element.kind === "image" || element.kind === "web" || element.kind === "note") {
    return {
      x: element.point.x,
      y: element.point.y,
      width: element.width,
      height: element.height,
    };
  }
  if (element.kind === "table") {
    return {
      x: element.point.x,
      y: element.point.y,
      width: element.width,
      height: 40 + element.fields.length * 28,
    };
  }
  return null;
};

const inflateBounds = (bounds: Bounds, gap: number): Bounds => ({
  x: bounds.x - gap,
  y: bounds.y - gap,
  width: bounds.width + gap * 2,
  height: bounds.height + gap * 2,
});

const boundsOverlap = (a: Bounds, b: Bounds) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const getElementsUnionBounds = (elements: CanvasElement[]): Bounds | null => {
  const boxes = elements
    .map(getElementBounds)
    .filter((item): item is Bounds => Boolean(item));
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const offsetCanvasElements = (elements: CanvasElement[], dx: number, dy: number): CanvasElement[] =>
  elements.map((element) => {
    if (element.kind === "shape") {
      return {
        ...element,
        start: { x: element.start.x + dx, y: element.start.y + dy },
        end: { x: element.end.x + dx, y: element.end.y + dy },
      };
    }
    if (element.kind === "draw") {
      return {
        ...element,
        points: element.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
      };
    }
    if (
      element.kind === "text" ||
      element.kind === "image" ||
      element.kind === "web" ||
      element.kind === "note" ||
      element.kind === "table"
    ) {
      return {
        ...element,
        point: { x: element.point.x + dx, y: element.point.y + dy },
      };
    }
    return element;
  });

const getDiagramBlockBounds = (elements: CanvasElement[]): Bounds[] => {
  const blocks: Bounds[] = [];
  for (const element of elements) {
    if (element.kind === "shape" && element.tool === "frame") {
      const bounds = getShapeBounds(element.start, element.end);
      if (bounds.width > 40 && bounds.height > 40) blocks.push(bounds);
      continue;
    }
    if (element.kind === "image") {
      blocks.push({
        x: element.point.x,
        y: element.point.y,
        width: element.width,
        height: element.height,
      });
    }
  }
  return blocks;
};

/** Ignore orphaned far-away frames from older bugs so new diagrams stay near the canvas. */
const CLUSTER_RADIUS = 3200;

const getIdsInsideFrameBounds = (elements: CanvasElement[], frameBounds: Bounds, frameId: string) => {
  const ids: string[] = [];
  for (const element of elements) {
    if (element.id === frameId) continue;
    const elBounds = getElementBounds(element);
    if (!elBounds) continue;
    const centerX = elBounds.x + elBounds.width / 2;
    const centerY = elBounds.y + elBounds.height / 2;
    if (
      centerX >= frameBounds.x &&
      centerX <= frameBounds.x + frameBounds.width &&
      centerY >= frameBounds.y &&
      centerY <= frameBounds.y + frameBounds.height
    ) {
      ids.push(element.id);
    }
  }
  return ids;
};

const findFreeDiagramPoint = (
  elements: CanvasElement[],
  width: number,
  height: number,
  preferred: Point = { x: 80, y: 100 },
  gap = DIAGRAM_GAP,
): Point => {
  const allBlocks = getDiagramBlockBounds(elements);
  const blocks = allBlocks
    .filter((box) => {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      return Math.hypot(cx - preferred.x, cy - preferred.y) <= CLUSTER_RADIUS;
    })
    .map((item) => inflateBounds(item, gap / 2));

  const fits = (point: Point) => {
    const rect = { x: point.x, y: point.y, width, height };
    return !blocks.some((box) => boundsOverlap(rect, box));
  };

  if (blocks.length === 0 || fits(preferred)) {
    return preferred;
  }

  let anchor = blocks[0]!;
  for (const box of blocks) {
    if (box.x + box.width > anchor.x + anchor.width) {
      anchor = box;
    }
  }

  const beside: Point = {
    x: Math.min(anchor.x + anchor.width + gap, preferred.x + 2800),
    y: anchor.y,
  };
  if (fits(beside) && beside.x < preferred.x + 3000) return beside;

  let minX = Infinity;
  let maxY = -Infinity;
  for (const box of blocks) {
    minX = Math.min(minX, box.x);
    maxY = Math.max(maxY, box.y + box.height);
  }

  const below: Point = {
    x: Number.isFinite(minX) ? minX : preferred.x,
    y: Math.min(maxY + gap, preferred.y + 2400),
  };
  if (fits(below)) return below;

  const stepX = Math.max(100, Math.floor(width * 0.4));
  const stepY = Math.max(100, Math.floor(height * 0.4));
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const stacked = {
        x: preferred.x + col * stepX,
        y: preferred.y + (row + 1) * stepY,
      };
      if (fits(stacked)) return stacked;
      const right = {
        x: preferred.x + (col + 1) * stepX,
        y: preferred.y + row * stepY,
      };
      if (fits(right)) return right;
    }
  }

  return { x: preferred.x, y: below.y };
};

/**
 * Pull far-off diagram frames back into a neat row near the origin
 * so the board stays usable after earlier placement bugs.
 */
const compactDiagramFrames = (elements: CanvasElement[]): CanvasElement[] => {
  const frames = elements.filter(
    (item): item is ShapeElement => item.kind === "shape" && item.tool === "frame",
  );
  if (frames.length === 0) return elements;

  let next = [...elements];
  let cursorX = 80;
  const baseY = 100;
  const gap = DIAGRAM_GAP;

  const sorted = [...frames].sort((a, b) => {
    const ba = getShapeBounds(a.start, a.end);
    const bb = getShapeBounds(b.start, b.end);
    return ba.x - bb.x || ba.y - bb.y;
  });

  for (const frame of sorted) {
    const live = next.find((item) => item.id === frame.id);
    if (!live || live.kind !== "shape") continue;
    const bounds = getShapeBounds(live.start, live.end);
    const targetX = cursorX;
    const targetY = baseY;
    const dx = targetX - bounds.x;
    const dy = targetY - bounds.y;
    const childIds = new Set(getIdsInsideFrameBounds(next, bounds, frame.id));
    childIds.add(frame.id);
    if (dx !== 0 || dy !== 0) {
      next = next.map((item) => {
        if (!childIds.has(item.id)) return item;
        if (item.kind === "shape") {
          return {
            ...item,
            start: { x: item.start.x + dx, y: item.start.y + dy },
            end: { x: item.end.x + dx, y: item.end.y + dy },
          };
        }
        if (item.kind === "draw") {
          return {
            ...item,
            points: item.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
          };
        }
        if (
          item.kind === "text" ||
          item.kind === "image" ||
          item.kind === "web" ||
          item.kind === "note" ||
          item.kind === "table"
        ) {
          return { ...item, point: { x: item.point.x + dx, y: item.point.y + dy } };
        }
        return item;
      });
    }
    cursorX += bounds.width + gap;
  }

  return next;
};

const sizeDiagramForCanvas = (
  naturalWidth: number,
  naturalHeight: number,
  viewport?: { width: number; height: number },
) => {
  const safeW = Math.max(1, naturalWidth);
  const safeH = Math.max(1, naturalHeight);
  const maxW = viewport
    ? Math.max(360, viewport.width - FIT_PADDING * 2 - DIAGRAM_FRAME_EXTRA_W)
    : DIAGRAM_TARGET_WIDTH;
  const maxH = viewport
    ? Math.max(240, viewport.height - FIT_PADDING * 2 - DIAGRAM_FRAME_EXTRA_H)
    : 780;
  // Prefer filling the viewport for readable text; never upscale past 1.6× natural
  let scale = Math.min(maxW / safeW, maxH / safeH, 1.6);
  // Keep a readable floor when the viewport is large enough
  const minReadableW = Math.min(720, maxW);
  if (safeW * scale < minReadableW) {
    scale = Math.min(minReadableW / safeW, maxH / safeH, 1.6);
  }
  if (safeW * scale > DIAGRAM_MAX_WIDTH) {
    scale = DIAGRAM_MAX_WIDTH / safeW;
  }
  return {
    width: Math.round(safeW * scale),
    height: Math.round(safeH * scale),
    scale,
  };
};

const buildFramedDiagramElements = (
  src: string,
  label: string,
  existing: CanvasElement[],
  diagramWidth = 960,
  diagramHeight = 600,
): { elements: CanvasElement[]; origin: Point } => {
  const pad = 28;
  const titleSpace = 36;
  const frameWidth = diagramWidth + pad * 2;
  const frameHeight = diagramHeight + pad * 2 + titleSpace;
  const origin = findFreeDiagramPoint(existing, frameWidth, frameHeight);

  const frame: ShapeElement = {
    id: makeId(),
    kind: "shape",
    tool: "frame",
    start: { x: origin.x, y: origin.y },
    end: { x: origin.x + frameWidth, y: origin.y + frameHeight },
    color: "#818cf8",
    strokeWidth: 2,
    opacity: 1,
  };
  const title: TextElement = {
    id: makeId(),
    kind: "text",
    point: { x: origin.x + pad, y: origin.y + 12 },
    value: label,
    color: "#4338ca",
    opacity: 1,
  };
  const image: ImageElement = {
    id: makeId(),
    kind: "image",
    point: { x: origin.x + pad, y: origin.y + pad + titleSpace },
    width: diagramWidth,
    height: diagramHeight,
    src,
  };

  return { elements: [frame, title, image], origin };
};

const separateOverlappingDiagrams = (elements: CanvasElement[]): CanvasElement[] => {
  const frames = elements.filter(
    (item): item is ShapeElement => item.kind === "shape" && item.tool === "frame",
  );
  if (frames.length < 2) {
    // Fallback: separate bare images.
    const images = elements.filter((item): item is ImageElement => item.kind === "image");
    if (images.length < 2) return elements;
    const nonImages = elements.filter((item) => item.kind !== "image");
    const relocated: ImageElement[] = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index]!;
      const context = [...nonImages, ...relocated];
      const current = {
        x: image.point.x,
        y: image.point.y,
        width: image.width,
        height: image.height,
      };
      const overlaps = getDiagramBlockBounds(context)
        .map((box) => inflateBounds(box, DIAGRAM_GAP / 2))
        .some((box) => boundsOverlap(current, box));
      if (!overlaps) {
        relocated.push(image);
        continue;
      }
      const point = findFreeDiagramPoint(
        context,
        image.width,
        image.height,
        index === 0 ? image.point : { x: 80, y: 100 },
      );
      relocated.push({ ...image, point });
    }
    let imageCursor = 0;
    return elements.map((item) => {
      if (item.kind !== "image") return item;
      return relocated[imageCursor++]!;
    });
  }

  let next = [...elements];
  const placedFrameIds: string[] = [];

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!;
    const liveFrame = next.find((item) => item.id === frame.id);
    if (!liveFrame || liveFrame.kind !== "shape") continue;

    const frameBounds = getShapeBounds(liveFrame.start, liveFrame.end);
    const others = next.filter((item) => {
      if (item.id === frame.id) return false;
      if (placedFrameIds.includes(item.id)) return true;
      // Ignore children of this frame when checking free space.
      const childIds = getIdsInsideFrameBounds(next, frameBounds, frame.id);
      return !childIds.includes(item.id);
    });

    const currentRect = {
      x: frameBounds.x,
      y: frameBounds.y,
      width: frameBounds.width,
      height: frameBounds.height,
    };
    const overlaps = getDiagramBlockBounds(others)
      .filter((box) => {
        // skip this frame's own previous bounds if listed
        return true;
      })
      .map((box) => inflateBounds(box, DIAGRAM_GAP / 2))
      .some((box) => boundsOverlap(currentRect, box));

    if (!overlaps && index === 0) {
      placedFrameIds.push(frame.id);
      continue;
    }
    if (!overlaps) {
      placedFrameIds.push(frame.id);
      continue;
    }

    const free = findFreeDiagramPoint(
      others,
      frameBounds.width,
      frameBounds.height,
      index === 0 ? { x: frameBounds.x, y: frameBounds.y } : { x: 80, y: 100 },
    );
    const dx = free.x - frameBounds.x;
    const dy = free.y - frameBounds.y;
    if (dx === 0 && dy === 0) {
      placedFrameIds.push(frame.id);
      continue;
    }

    const childIds = new Set(getIdsInsideFrameBounds(next, frameBounds, frame.id));
    childIds.add(frame.id);
    next = next.map((item) => {
      if (!childIds.has(item.id)) return item;
      if (item.kind === "shape") {
        return {
          ...item,
          start: { x: item.start.x + dx, y: item.start.y + dy },
          end: { x: item.end.x + dx, y: item.end.y + dy },
        };
      }
      if (item.kind === "draw") {
        return {
          ...item,
          points: item.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
        };
      }
      if (
        item.kind === "text" ||
        item.kind === "image" ||
        item.kind === "web" ||
        item.kind === "note" ||
        item.kind === "table"
      ) {
        return { ...item, point: { x: item.point.x + dx, y: item.point.y + dy } };
      }
      return item;
    });
    placedFrameIds.push(frame.id);
  }

  return next;
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const CROWFOOT_INLINE_RE = /[|}o*]{1,3}-{1,3}[|{o*]{1,3}/gi;

/** Drop crow-foot junk text and clean ER table fields (fixes older bad AI ERDs). */
const sanitizeCanvasElements = (items: CanvasElement[]): CanvasElement[] =>
  items
    .filter((element) => {
      if (element.kind === "text" && isCrowfootJunkText(element.value)) return false;
      return true;
    })
    .map((element) => {
      if (element.kind !== "table") return element;
      return {
        ...element,
        title: element.title.replace(CROWFOOT_INLINE_RE, "").trim() || "Entity",
        fields: sanitizeErdFields(element.fields),
      };
    });

const summarizeCanvasArchitecture = (elements: CanvasElement[], canvasName: string) => {
  const lines: string[] = [`Board: ${canvasName}`, `Element count: ${elements.length}`, ""];

  elements.forEach((element, index) => {
    const n = index + 1;
    if (element.kind === "text") {
      lines.push(`${n}. Text @(${Math.round(element.point.x)},${Math.round(element.point.y)}): ${element.value}`);
      return;
    }
    if (element.kind === "note") {
      lines.push(
        `${n}. Sticky note @(${Math.round(element.point.x)},${Math.round(element.point.y)}): ${element.value.replace(/\n/g, " | ")}`,
      );
      return;
    }
    if (element.kind === "table") {
      const fields = element.fields
        .map((field) => `${field.pk ? "PK " : ""}${field.name}:${field.type}`)
        .join(", ");
      lines.push(
        `${n}. ER table "${element.title}" @(${Math.round(element.point.x)},${Math.round(element.point.y)}) fields=[${fields}]`,
      );
      return;
    }
    if (element.kind === "shape") {
      lines.push(
        `${n}. ${element.tool} from (${Math.round(element.start.x)},${Math.round(element.start.y)}) to (${Math.round(element.end.x)},${Math.round(element.end.y)})`,
      );
      return;
    }
    if (element.kind === "image") {
      lines.push(
        `${n}. Image/icon @(${Math.round(element.point.x)},${Math.round(element.point.y)}) size=${Math.round(element.width)}x${Math.round(element.height)}`,
      );
      return;
    }
    if (element.kind === "web") {
      lines.push(`${n}. Web embed ${element.url} @(${Math.round(element.point.x)},${Math.round(element.point.y)})`);
      return;
    }
    if (element.kind === "draw") {
      lines.push(`${n}. Freehand path with ${element.points.length} points`);
    }
  });

  return lines.join("\n");
};

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

const renderMermaidToImageUrl = async (
  code: string,
  viewport?: { width: number; height: number },
) => {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "base",
    fontFamily: "Segoe UI, system-ui, sans-serif",
    flowchart: {
      htmlLabels: false,
      useMaxWidth: false,
      padding: 28,
      wrappingWidth: 220,
    },
    sequence: {
      useMaxWidth: false,
      width: 200,
      height: 58,
      actorMargin: 80,
      messageMargin: 42,
    },
    themeVariables: {
      fontSize: "14px",
      fontFamily: "Segoe UI, system-ui, sans-serif",
      textColor: "#1F2937",
      primaryTextColor: "#1F2937",
      lineColor: "#64748B",
    },
  });

  const tryRender = async (source: string) => {
    const id = `mmd-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const { svg } = await mermaid.render(id, source);
      return svg;
    } catch (error) {
      const container = document.getElementById(id);
      if (container) container.remove();
      document.querySelectorAll(`[id^="${id}"]`).forEach((node) => node.remove());
      throw error;
    }
  };

  // Retry without class lines if first render fails (common with swimlanes)
  let svg: string;
  try {
    svg = await tryRender(code);
  } catch (firstError) {
    const stripped = code
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith("class ") && !t.startsWith("classDef ");
      })
      .join("\n");
    try {
      svg = await tryRender(stripped);
    } catch {
      throw firstError instanceof Error ? firstError : new Error("Mermaid render failed");
    }
  }

  const enhanced = enhanceMermaidSvg(svg);
  const natural = getSvgDimensions(enhanced);
  const naturalW = Math.max(320, natural.width || 860);
  const naturalH = Math.max(200, natural.height || 480);
  const sized = sizeDiagramForCanvas(naturalW, naturalH, viewport);

  let scaledSvg = enhanced;
  if (
    Math.abs(sized.width - naturalW) > 1 ||
    Math.abs(sized.height - naturalH) > 1
  ) {
    if (/\bviewBox=/.test(scaledSvg)) {
      scaledSvg = scaledSvg
        .replace(/\bwidth=["'][^"']*["']/i, `width="${sized.width}"`)
        .replace(/\bheight=["'][^"']*["']/i, `height="${sized.height}"`);
      if (!/\bwidth=/.test(scaledSvg)) {
        scaledSvg = scaledSvg.replace(
          /<svg/i,
          `<svg width="${sized.width}" height="${sized.height}"`,
        );
      }
    } else {
      scaledSvg = scaledSvg.replace(
        /<svg/i,
        `<svg viewBox="0 0 ${naturalW} ${naturalH}" width="${sized.width}" height="${sized.height}"`,
      );
    }
  }

  return {
    src: toSvgDataUrl(scaledSvg),
    width: sized.width,
    height: sized.height,
  };
};

const canonicalizeFlowchart = (input: string) => {
  // Keep subgraphs / swimlanes intact (BPMN + architecture). Flattening them
  // produces invalid Mermaid and falls back to a sticky-note "render issue".
  if (/\bsubgraph\b/i.test(input)) {
    return input;
  }

  const headerMatch = input.match(/\b(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i);
  if (!headerMatch) {
    return input;
  }

  const nodeMap = new Map<string, string>();
  const nodeRegex = /([A-Za-z0-9_]+)\[([^\]]+)\]/g;
  let nodeMatch = nodeRegex.exec(input);
  while (nodeMatch) {
    const id = nodeMatch[1];
    const label = nodeMatch[2]?.trim().replace(/^"|"$/g, "");
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

const prepareMermaidForFormat = (raw: string, format?: string) => {
  const normalized = normalizeMermaidCode(raw);
  // Never flatten BPMN / architecture / anything with swimlanes
  const keepStructure =
    format === "bpmn" ||
    format === "architecture" ||
    format === "sequence" ||
    format === "erd" ||
    /\bsubgraph\b/i.test(normalized);
  const structured = keepStructure ? normalized : canonicalizeFlowchart(normalized);
  return beautifyMermaid(structured, format);
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

const sidebarGlyph = (
  kind: "tools" | "insert" | "ai" | "search" | "share" | "file" | "home" | "center" | "command",
) => {
  const cls = styles.sidebarSvg;
  if (kind === "tools") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4Z" />
        <path d="m13.5 7.5 3 3" />
      </svg>
    );
  }
  if (kind === "insert") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    );
  }
  if (kind === "ai") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <path d="M12 3 13.8 8.2 19 10 13.8 11.8 12 17 10.2 11.8 5 10 10.2 8.2Z" />
        <path d="M18 15 18.8 17.2 21 18 18.8 18.8 18 21 17.2 18.8 15 18 17.2 17.2Z" />
      </svg>
    );
  }
  if (kind === "search") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
    );
  }
  if (kind === "share") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <circle cx="18" cy="5" r="2.4" />
        <circle cx="6" cy="12" r="2.4" />
        <circle cx="18" cy="19" r="2.4" />
        <path d="M8.2 11 15.7 6.4M8.2 13 15.7 17.6" />
      </svg>
    );
  }
  if (kind === "file") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z" />
        <path d="M14 3.5V8h4.5" />
      </svg>
    );
  }
  if (kind === "home") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <path d="M4 11.5 12 5l8 6.5" />
        <path d="M7 10.5V19h10v-8.5" />
      </svg>
    );
  }
  if (kind === "center") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={cls} aria-hidden>
      <path d="M4 7h16M4 12h10M4 17h14" />
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
  const [viewMode, setViewMode] = useState<ViewMode>("canvas");
  const [sidebarStep, setSidebarStep] = useState<SidebarStep>("tools");
  const [documentNotes, setDocumentNotes] = useState("");
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
  const [zoom, setZoom] = useState(1);
  const [handStart, setHandStart] = useState<Point | null>(null);
  const [dragState, setDragState] = useState<{
    ids: string[];
    startPoint: Point;
    lastPoint: Point;
  } | null>(null);
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
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false);
  const [docsError, setDocsError] = useState("");
  const [showAiChat, setShowAiChat] = useState(false);
  const [aiFormat, setAiFormat] = useState<AiCreateFormat>("architecture");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiCreditsUsed, setAiCreditsUsed] = useState(0);
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([]);
  const [aiGitContext, setAiGitContext] = useState("");
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
  const [inlineEdit, setInlineEdit] = useState<{
    id: string;
    kind: "text" | "note";
    value: string;
  } | null>(null);
  const inlineEditRef = useRef<HTMLTextAreaElement | null>(null);
  const skipInlineBlurCommitRef = useRef(false);
  const extrasPanelRef = useRef<HTMLElement | null>(null);
  const moreToolsButtonRef = useRef<HTMLButtonElement | null>(null);
  const iconsPanelRef = useRef<HTMLElement | null>(null);
  const menuPanelRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const propertiesPanelRef = useRef<HTMLElement | null>(null);
  const canvasSvgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef(1);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const didInitialFitRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef(`client-${Math.random().toString(36).slice(2, 10)}`);
  const suppressSyncUntilRef = useRef(0);
  const elementsRef = useRef<CanvasElement[]>([]);
  const isRoomHydratedRef = useRef(false);

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
    setElements(
      sanitizeCanvasElements(
        Array.isArray(file.content.elements) ? (file.content.elements as CanvasElement[]) : [],
      ),
    );
    setPan(file.content.pan ?? { x: 0, y: 0 });
    setZoom(1);
    didInitialFitRef.current = false;
    setBackgroundColor(file.content.backgroundColor ?? "#f7f7fb");
    setDocumentNotes(
      typeof file.content.documentNotes === "string" ? file.content.documentNotes : "",
    );
    setRoomId(fileId);
    // Defer localStorage rewrite so first paint isn't blocked
    const touchTimer = window.setTimeout(() => touchFile(fileId), 800);
    if (searchParams.get("ai") === "1") {
      setShowAiChat(true);
      setAiFormat("architecture");
    }
    const preset = searchParams.get("preset");
    if (preset) {
      setAiPrompt(preset);
      setShowAiChat(true);
      setAiFormat("flowchart");
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
    return () => window.clearTimeout(touchTimer);
  }, [fileId, searchParams]);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    if (fileMissing) {
      return;
    }
    const svg = canvasSvgRef.current;
    if (!svg) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const prevZoom = zoomRef.current;
      const nextZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, prevZoom * (event.deltaY > 0 ? 1 / 1.08 : 1.08)),
      );
      if (nextZoom === prevZoom) {
        return;
      }
      const worldX = (cursorX - panRef.current.x) / prevZoom;
      const worldY = (cursorY - panRef.current.y) / prevZoom;
      setZoom(nextZoom);
      setPan({
        x: cursorX - worldX * nextZoom,
        y: cursorY - worldY * nextZoom,
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [fileMissing]);

  useEffect(() => {
    if (didInitialFitRef.current || fileMissing || elements.length === 0) {
      return;
    }
    const bounds = getElementsUnionBounds(elements);
    if (!bounds) {
      return;
    }
    const timer = window.setTimeout(() => {
      const el = canvasSvgRef.current;
      const viewport = el
        ? { width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }
        : {
            width: Math.max(320, window.innerWidth - 56),
            height: Math.max(240, window.innerHeight - 120),
          };
      if (
        bounds.width <= viewport.width - FIT_PADDING * 2 &&
        bounds.height <= viewport.height - FIT_PADDING * 2
      ) {
        didInitialFitRef.current = true;
        return;
      }
      const next = computeFitView(bounds, viewport);
      setZoom(next.zoom);
      setPan(next.pan);
      didInitialFitRef.current = true;
    }, 50);
    return () => window.clearTimeout(timer);
  }, [elements, fileMissing]);

  useEffect(() => {
    isRoomHydratedRef.current = isRoomHydrated;
  }, [isRoomHydrated]);

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
        documentNotes,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [fileId, fileMissing, elements, pan, backgroundColor, canvasName, documentNotes]);

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
    // Local files are ready immediately — don't block UI on WebSocket.
    setIsRoomHydrated(true);

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

    let socket: WebSocket | null = null;
    let cancelled = false;

    // Defer realtime so first paint / navigation feels instant
    const connectTimer = window.setTimeout(() => {
      if (cancelled) return;
      socket = new WebSocket(wsUrlString);
      socketRef.current = socket;

      socket.onopen = () => {
        socket?.send(
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

          const remoteElements = Array.isArray(state.elements)
            ? (state.elements as CanvasElement[])
            : [];

          if (
            data.type === "canvas_state" &&
            remoteElements.length === 0 &&
            elementsRef.current.length > 0
          ) {
            return;
          }

          if (
            data.type === "canvas_state" &&
            isRoomHydratedRef.current &&
            remoteElements.length === 0
          ) {
            return;
          }

          suppressSyncUntilRef.current = Date.now() + 600;
          if (typeof state.canvasName === "string") {
            setCanvasName(state.canvasName);
          }
          if (Array.isArray(state.elements)) {
            setElements(remoteElements);
          }
          if (typeof state.pan?.x === "number" && typeof state.pan?.y === "number") {
            setPan({ x: state.pan.x, y: state.pan.y });
          }
          if (typeof state.backgroundColor === "string") {
            setBackgroundColor(state.backgroundColor);
          }
        }
      };

      socket.onclose = () => {
        setStatusMessage("Realtime disconnected");
      };
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(connectTimer);
      socket?.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [roomId]);

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
      const remoteElements = Array.isArray(state.elements)
        ? (state.elements as CanvasElement[])
        : [];
      // Don't wipe richer local canvas with empty peer updates.
      if (remoteElements.length === 0 && elementsRef.current.length > 0) {
        return;
      }
      if (typeof state.canvasName === "string") {
        setCanvasName(state.canvasName);
      }
      if (Array.isArray(state.elements)) {
        setElements(remoteElements);
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
    if (sidebarStep !== "file") {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`.${styles.sidebarRail}`)) return;
      const inMenu = menuPanelRef.current?.contains(target);
      if (!inMenu) {
        setSidebarStep(null);
        setMenuOpen(false);
        setShowPreferences(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [sidebarStep]);

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
    setPan({ x: 120 - point.x * zoomRef.current, y: 140 - point.y * zoomRef.current });
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
        label: "Open AI New Chat",
        hint: "",
        run: () => {
          setShowAiChat(true);
          setSidebarStep(null);
        },
      },
      {
        id: "separate-diagrams",
        label: "Separate overlapping diagrams",
        hint: "",
        run: () => handleSeparateOverlappingDiagrams(),
      },
      {
        id: "docs",
        label: "Generate docs from canvas (Mistral)",
        hint: "",
        run: () => void handleGenerateDocsFromCanvas(),
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("draw-app-ai-credits-used");
    const used = raw ? Number(raw) : 0;
    setAiCreditsUsed(Number.isFinite(used) ? used : 0);
  }, []);

  const toggleSidebarStep = (step: Exclude<SidebarStep, null>) => {
    if (step === "ai") {
      setShowAiChat((previous) => !previous);
      setSidebarStep(null);
      setMenuOpen(false);
      setShowExtras(false);
      return;
    }
    setSidebarStep((previous) => (previous === step ? null : step));
    setMenuOpen(false);
    setShowExtras(false);
  };

  const panelOffsetLeft = sidebarStep ? 336 : 68;

  const commitInlineEdit = (nextValue?: string) => {
    if (!inlineEdit) {
      return;
    }
    if (skipInlineBlurCommitRef.current) {
      skipInlineBlurCommitRef.current = false;
      return;
    }
    const value = (nextValue ?? inlineEdit.value).trim();
    const editId = inlineEdit.id;
    const editKind = inlineEdit.kind;
    if (!value) {
      setElements((previous) => previous.filter((item) => item.id !== editId));
      setStatusMessage(editKind === "note" ? "Sticky note cancelled" : "Text cancelled");
    } else {
      setElements((previous) =>
        previous.map((item) =>
          item.id === editId && (item.kind === "text" || item.kind === "note")
            ? { ...item, value }
            : item,
        ),
      );
      setStatusMessage(editKind === "note" ? "Sticky note added" : "Text added");
    }
    setInlineEdit(null);
  };

  const cancelInlineEdit = () => {
    if (!inlineEdit) {
      return;
    }
    skipInlineBlurCommitRef.current = true;
    const editId = inlineEdit.id;
    setElements((previous) => previous.filter((item) => item.id !== editId));
    setInlineEdit(null);
    setStatusMessage("Cancelled");
  };

  useEffect(() => {
    if (!inlineEdit) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      inlineEditRef.current?.focus();
      inlineEditRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inlineEdit?.id]);

  const editingElement = inlineEdit
    ? elements.find((item) => item.id === inlineEdit.id)
    : null;
  const inlineEditStyle =
    editingElement && (editingElement.kind === "text" || editingElement.kind === "note")
      ? {
          left: editingElement.point.x * zoom + pan.x,
          top: editingElement.point.y * zoom + pan.y,
          width:
            editingElement.kind === "note" ? editingElement.width * zoom : 220,
          minHeight:
            editingElement.kind === "note" ? editingElement.height * zoom : 36,
          background:
            editingElement.kind === "note" ? editingElement.color : "rgba(255,255,255,0.96)",
        }
      : null;

  const getViewportSize = () => {
    const el = canvasSvgRef.current;
    if (!el) {
      return {
        width: Math.max(320, window.innerWidth - 56 - (showAiChat ? 380 : 0)),
        height: Math.max(240, window.innerHeight - 120),
      };
    }
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  const fitElementsInView = (targetElements: CanvasElement[]) => {
    const bounds = getElementsUnionBounds(targetElements);
    if (!bounds) {
      return;
    }
    const next = computeFitView(bounds, getViewportSize());
    setZoom(next.zoom);
    setPan(next.pan);
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

      const mermaidCode = prepareMermaidForFormat(data.mermaid, "flowchart");
      if (!mermaidCode) {
        setGenerateError("Generated Mermaid was empty.");
        setIsGenerating(false);
        return;
      }

      let rendered: { src: string; width: number; height: number };
      try {
        rendered = await renderMermaidToImageUrl(mermaidCode, getViewportSize());
      } catch {
        const compacted = compactDiagramFrames(elementsRef.current);
        const notePoint = findFreeDiagramPoint(compacted, 500, 200, { x: 80, y: 100 });
        setElements([
          ...compacted,
          {
            id: makeId(),
            kind: "note" as const,
            point: notePoint,
            width: 500,
            height: 200,
            value: `Diagram (raw Mermaid):\n\n${mermaidCode}`,
            color: "#fef3c7",
          },
        ]);
        setViewMode("canvas");
        setZoom(1);
        setPan({ x: 40, y: 40 });
        setShowGenerateModal(false);
        setStatusMessage("Diagram placed as note (Mermaid render failed)");
        setIsGenerating(false);
        return;
      }

      const compacted = compactDiagramFrames(elementsRef.current);
      const framed = buildFramedDiagramElements(
        rendered.src,
        "Generated diagram",
        compacted,
        rendered.width,
        rendered.height,
      );
      setElements([...compacted, ...framed.elements]);
      setViewMode("canvas");
      window.setTimeout(() => fitElementsInView(framed.elements), 0);
      suppressSyncUntilRef.current = Date.now() + 800;
      setShowGenerateModal(false);
      setStatusMessage("Diagram generated and rendered");
    } catch (error) {
      setGenerateError(`Generation failed: ${String(error)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateDocsFromCanvas = async () => {
    if (elements.length === 0) {
      setDocsError("Canvas is empty. Insert or draw an architecture first.");
      setStatusMessage("Add diagram content before generating docs");
      return;
    }

    setIsGeneratingDocs(true);
    setDocsError("");
    setStatusMessage("Generating architecture docs with Mistral…");

    try {
      const response = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasName,
          architectureSummary: summarizeCanvasArchitecture(elements, canvasName),
          existingNotes: documentNotes,
        }),
      });
      const data = (await response.json()) as {
        markdown?: string;
        error?: string;
        provider?: string;
      };

      if (!response.ok || !data.markdown) {
        setDocsError(data.error ?? "Could not generate documentation.");
        setStatusMessage(data.error ?? "Docs generation failed");
        return;
      }

      setDocumentNotes(data.markdown);
      setViewMode((previous) => (previous === "canvas" ? "both" : previous));
      setSidebarStep(null);
      setStatusMessage(
        `Architecture docs generated${data.provider ? ` via ${data.provider}` : ""}`,
      );
    } catch (error) {
      setDocsError(`Docs generation failed: ${String(error)}`);
      setStatusMessage("Docs generation failed");
    } finally {
      setIsGeneratingDocs(false);
    }
  };

  const consumeAiCredit = () => {
    const next = aiCreditsUsed + 1;
    setAiCreditsUsed(next);
    window.localStorage.setItem("draw-app-ai-credits-used", String(next));
  };

  const handleAiChatGenerate = async (overridePrompt?: string) => {
    const prompt = (overridePrompt ?? aiPrompt).trim();
    if (!prompt) {
      setAiError("Describe what to create first.");
      return;
    }
    if (aiCreditsUsed >= 3) {
      setAiError("AI credit limit reached (3/3). Reset credits from New Chat or upgrade later.");
      return;
    }

    setAiBusy(true);
    setAiError("");
    setAiMessages((previous) => [
      ...previous,
      { id: makeId(), role: "user", text: `[${aiFormat}] ${prompt}` },
    ]);
    setStatusMessage(`Generating ${aiFormat}…`);

    try {
      if (aiFormat === "document") {
        const response = await fetch("/api/docs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canvasName,
            prompt: aiGitContext
              ? `${prompt}\n\nGit context / repo notes:\n${aiGitContext}`
              : prompt,
            existingNotes: documentNotes,
            architectureSummary:
              elements.length > 0 ? summarizeCanvasArchitecture(elements, canvasName) : "",
            focus: "Document",
          }),
        });
        const data = (await response.json()) as { markdown?: string; error?: string };
        if (!response.ok || !data.markdown) {
          setAiError(data.error ?? "Could not generate document.");
          return;
        }
        setDocumentNotes(data.markdown);
        setViewMode((previous) => (previous === "canvas" ? "both" : previous));
        setAiMessages((previous) => [
          ...previous,
          {
            id: makeId(),
            role: "assistant",
            text: "Document written into the Document pane.",
          },
        ]);
        consumeAiCredit();
        setAiPrompt("");
        setStatusMessage("Document generated");
        return;
      }

      const response = await fetch("/api/diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "text",
          format: aiFormat,
          prompt: aiGitContext
            ? `${prompt}\n\nAdditional context from Git/repo notes:\n${aiGitContext}`
            : prompt,
        }),
      });
      const data = (await response.json()) as { mermaid?: string; error?: string };
      if (!response.ok || !data.mermaid) {
        setAiError(data.error ?? "Could not generate diagram.");
        return;
      }

      const mermaidCode = prepareMermaidForFormat(data.mermaid, aiFormat);
      if (!mermaidCode) {
        setAiError("Generated Mermaid was empty.");
        return;
      }

      // Entity Relationship → native Eraser-style colored table cards
      if (aiFormat === "erd") {
        const compacted = compactDiagramFrames(elementsRef.current);
        const origin = findFreeDiagramPoint(compacted, 720, 520, { x: 80, y: 100 });
        const erd = buildErdFromMermaid(mermaidCode, origin);
        if (erd && erd.tables.length > 0) {
          const placed: CanvasElement[] = [];
          for (const item of erd.tables) {
            placed.push({
              id: makeId(),
              kind: "table",
              point: item.point,
              width: item.width,
              title: item.title,
              headerColor: item.headerColor,
              fields: sanitizeErdFields(item.fields),
            });
          }
          for (const edge of erd.arrows) {
            placed.push({
              id: makeId(),
              kind: "shape",
              tool: "arrow",
              start: edge.start,
              end: edge.end,
              color: "#2f2f3d",
              strokeWidth: 1.5,
              opacity: 1,
            });
            if (edge.label) {
              placed.push({
                id: makeId(),
                kind: "text",
                point: {
                  x: (edge.start.x + edge.end.x) / 2 - 10,
                  y: (edge.start.y + edge.end.y) / 2 - 14,
                },
                value: edge.label,
                color: "#868e96",
                opacity: 1,
              });
            }
          }
          const framePad = 28;
          const frame: ShapeElement = {
            id: makeId(),
            kind: "shape",
            tool: "frame",
            start: { x: origin.x - framePad, y: origin.y - framePad - 28 },
            end: {
              x: origin.x + erd.bounds.width + framePad,
              y: origin.y + erd.bounds.height + framePad,
            },
            color: "#818cf8",
            strokeWidth: 2,
            opacity: 1,
          };
          const title: TextElement = {
            id: makeId(),
            kind: "text",
            point: { x: origin.x - framePad + 8, y: origin.y - framePad - 18 },
            value: "Entity relationship diagram",
            color: "#4338ca",
            opacity: 1,
          };
          const nextElements = [...compacted, frame, title, ...placed];
          setElements(nextElements);
          setViewMode("canvas");
          window.setTimeout(() => fitElementsInView([frame, title, ...placed]), 0);
          suppressSyncUntilRef.current = Date.now() + 800;
          setAiMessages((previous) => [
            ...previous,
            {
              id: makeId(),
              role: "assistant",
              text: "Entity relationship diagram added with Eraser-style colored tables. Drag tables with Select to rearrange.",
            },
          ]);
          consumeAiCredit();
          setAiPrompt("");
          setStatusMessage("ERD added with colored entity cards");
          return;
        }
      }

      let rendered: { src: string; width: number; height: number };
      try {
        rendered = await renderMermaidToImageUrl(mermaidCode, getViewportSize());
      } catch {
        const compacted = compactDiagramFrames(elementsRef.current);
        const notePoint = findFreeDiagramPoint(compacted, 500, 200, { x: 80, y: 100 });
        setElements([
          ...compacted,
          {
            id: makeId(),
            kind: "note" as const,
            point: notePoint,
            width: 500,
            height: 200,
            value: `${aiFormat} diagram (raw Mermaid):\n\n${mermaidCode}`,
            color: "#fef3c7",
          },
        ]);
        setViewMode("canvas");
        setZoom(1);
        setPan({ x: 40, y: 40 });
        setAiMessages((previous) => [
          ...previous,
          {
            id: makeId(),
            role: "assistant",
            text: `${aiFormat} diagram generated but Mermaid rendering failed. Raw code placed as a note.`,
          },
        ]);
        consumeAiCredit();
        setAiPrompt("");
        setStatusMessage(`${aiFormat} placed as note (render issue)`);
        return;
      }

      const compacted = compactDiagramFrames(elementsRef.current);
      const framed = buildFramedDiagramElements(
        rendered.src,
        `${aiFormat} diagram`,
        compacted,
        rendered.width,
        rendered.height,
      );
      setElements([...compacted, ...framed.elements]);
      setViewMode("canvas");
      window.setTimeout(() => fitElementsInView(framed.elements), 0);
      suppressSyncUntilRef.current = Date.now() + 800;
      setAiMessages((previous) => [
        ...previous,
        {
          id: makeId(),
          role: "assistant",
          text: `${aiFormat} diagram added beside existing ones with pastel multi-shade styling. Drag the frame with Select to move the whole group.`,
        },
      ]);
      consumeAiCredit();
      setAiPrompt("");
      setStatusMessage(`${aiFormat} diagram added beside previous`);
    } catch (error) {
      setAiError(`Generation failed: ${String(error)}`);
    } finally {
      setAiBusy(false);
    }
  };

  const getCanvasPoint = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    const currentZoom = zoomRef.current || 1;
    return {
      x: (event.clientX - rect.left - panRef.current.x) / currentZoom,
      y: (event.clientY - rect.top - panRef.current.y) / currentZoom,
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

  const getFrameChildIds = (frameElement: ShapeElement): string[] => {
    if (frameElement.tool !== "frame") return [];
    const frameBounds = getShapeBounds(frameElement.start, frameElement.end);
    const ids: string[] = [];
    for (const element of elements) {
      if (element.id === frameElement.id) continue;
      const elBounds = getElementBounds(element);
      if (!elBounds) continue;
      const centerX = elBounds.x + elBounds.width / 2;
      const centerY = elBounds.y + elBounds.height / 2;
      if (
        centerX >= frameBounds.x &&
        centerX <= frameBounds.x + frameBounds.width &&
        centerY >= frameBounds.y &&
        centerY <= frameBounds.y + frameBounds.height
      ) {
        ids.push(element.id);
      }
    }
    return ids;
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
    const built = template.build({ x: 0, y: 0 }) as CanvasElement[];
    const union = getElementsUnionBounds(built);
    const width = Math.max(280, union?.width ?? 480);
    const height = Math.max(200, union?.height ?? 320);
    let free = { x: 80, y: 100 };
    setElements((previous) => {
      free = findFreeDiagramPoint(previous, width + 48, height + 64, {
        x: 80,
        y: 100,
      });
      const dx = free.x - (union?.x ?? 0) + 24;
      const dy = free.y - (union?.y ?? 0) + 40;
      const placed = offsetCanvasElements(built, dx, dy);
      const placedUnion = getElementsUnionBounds(placed);
      const framePad = 20;
      const frame: ShapeElement | null = placedUnion
        ? {
            id: makeId(),
            kind: "shape",
            tool: "frame",
            start: {
              x: placedUnion.x - framePad,
              y: placedUnion.y - framePad - 28,
            },
            end: {
              x: placedUnion.x + placedUnion.width + framePad,
              y: placedUnion.y + placedUnion.height + framePad,
            },
            color: "#818cf8",
            strokeWidth: 2,
            opacity: 1,
          }
        : null;
      const title: TextElement = {
        id: makeId(),
        kind: "text",
        point: {
          x: (placedUnion?.x ?? free.x) - framePad + 8,
          y: (placedUnion?.y ?? free.y) - framePad - 22,
        },
        value: template.title,
        color: "#4338ca",
        opacity: 1,
      };
      return [...previous, ...(frame ? [frame, title] : [title]), ...placed];
    });
    window.setTimeout(() => {
      const next = computeFitView(
        {
          x: free.x - 20,
          y: free.y - 48,
          width: width + 48,
          height: height + 68,
        },
        getViewportSize(),
      );
      setZoom(next.zoom);
      setPan(next.pan);
    }, 0);
    setCanvasName((previous) =>
      previous === "Untitled canvas" ? template.title : previous,
    );
    setShowCatalogPanel(false);
    setShowExtras(false);
    setShowIconsPanel(false);
    setStatusMessage(`Inserted template: ${template.title} (auto-spaced)`);
  };

  const handleSeparateOverlappingDiagrams = () => {
    setElements((previous) => {
      const compacted = compactDiagramFrames(previous);
      const next = separateOverlappingDiagrams(compacted);
      const normalized = compactDiagramFrames(next);
      window.setTimeout(() => {
        fitElementsInView(normalized);
        setStatusMessage("Diagrams lined up side-by-side and fitted to view");
      }, 0);
      return normalized;
    });
  };

  const handleInsertStarter = (templateId: string) => {
    const template = DIAGRAM_TEMPLATES.find((item) => item.id === templateId);
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

    if (activeTool === "select") {
      const hitId = findElementAtPoint(point);
      if (hitId) {
        const hitElement = elements.find((item) => item.id === hitId);
        let ids = [hitId];
        if (hitElement && hitElement.kind === "shape" && hitElement.tool === "frame") {
          ids = [hitId, ...getFrameChildIds(hitElement)];
        } else {
          const parentFrame = elements.find(
            (item) =>
              item.kind === "shape" &&
              item.tool === "frame" &&
              getFrameChildIds(item as ShapeElement).includes(hitId),
          ) as ShapeElement | undefined;
          if (parentFrame) {
            ids = [parentFrame.id, ...getFrameChildIds(parentFrame)];
          }
        }
        setDragState({ ids, startPoint: point, lastPoint: point });
        event.currentTarget.setPointerCapture(event.pointerId);
        setStatusMessage(`Dragging ${ids.length} element${ids.length > 1 ? "s" : ""}`);
      }
      return;
    }

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
      const id = makeId();
      setElements((previous) => [
        ...previous,
        {
          id,
          kind: "text",
          point,
          value: "",
          color: strokeColor,
          opacity: strokeOpacity,
        },
      ]);
      setInlineEdit({ id, kind: "text", value: "" });
      setStatusMessage("Type text on the canvas");
      return;
    }

    if (activeTool === "note") {
      const id = makeId();
      setElements((previous) => [
        ...previous,
        {
          id,
          kind: "note",
          point,
          width: 168,
          height: 120,
          value: "",
          color: noteColor,
        },
      ]);
      setInlineEdit({ id, kind: "note", value: "" });
      setStatusMessage("Type sticky note on the canvas");
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
    if (activeTool === "select" && dragState) {
      const point = getCanvasPoint(event);
      const dx = point.x - dragState.lastPoint.x;
      const dy = point.y - dragState.lastPoint.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      setElements((previous) =>
        previous.map((element) => {
          if (!dragState.ids.includes(element.id)) return element;
          if (element.kind === "shape") {
            return {
              ...element,
              start: { x: element.start.x + dx, y: element.start.y + dy },
              end: { x: element.end.x + dx, y: element.end.y + dy },
            };
          }
          if (element.kind === "draw") {
            return {
              ...element,
              points: element.points.map((item) => ({ x: item.x + dx, y: item.y + dy })),
            };
          }
          if (
            element.kind === "text" ||
            element.kind === "image" ||
            element.kind === "web" ||
            element.kind === "note" ||
            element.kind === "table"
          ) {
            return {
              ...element,
              point: { x: element.point.x + dx, y: element.point.y + dy },
            };
          }
          return element;
        }),
      );
      setDragState((previous) => previous ? { ...previous, lastPoint: point } : null);
      return;
    }

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
    if (activeTool === "select" && dragState) {
      setDragState(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
      setStatusMessage("Element(s) moved");
      return;
    }

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
      if (isCrowfootJunkText(element.value)) {
        return null;
      }
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
      const fields = sanitizeErdFields(element.fields);
      const height = headerHeight + fields.length * rowHeight;
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
            style={{ stroke: element.headerColor }}
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
            {element.title.replace(CROWFOOT_INLINE_RE, "").trim() || "Entity"}
          </text>
          {fields.map((field, index) => {
            const y = element.point.y + headerHeight + index * rowHeight;
            return (
              <g key={`${element.id}-field-${index}-${field.name}`}>
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
                  {field.name}
                </text>
                <text
                  x={element.point.x + element.width - 14}
                  y={y + 19}
                  textAnchor="end"
                  className={styles.erdFieldType}
                >
                  {field.pk && !/\bpk\b/i.test(field.type)
                    ? `${field.type} pk`
                    : field.type}
                </text>
              </g>
            );
          })}
        </g>
      );
    }

    if (element.kind === "image") {
      return (
        <image
          key={element.id}
          href={element.src}
          xlinkHref={element.src}
          x={element.point.x}
          y={element.point.y}
          width={element.width}
          height={element.height}
          preserveAspectRatio="xMinYMin meet"
        />
      );
    }

    return null;
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
      <header className={styles.topNav} aria-label="Board navigation">
        <div className={styles.topNavBrand}>
          <button
            type="button"
            className={styles.topNavLogo}
            aria-label="Back to workspace"
            title="Back to workspace"
            onClick={() => router.push("/")}
          >
            <svg viewBox="0 0 24 24" className={styles.topNavLogoSvg} aria-hidden>
              <path d="M4 11.5 12 5l8 6.5" />
              <path d="M7 10.5V19h10v-8.5" />
            </svg>
          </button>
          <h1 className={styles.topNavTitle}>{canvasName}</h1>
        </div>
        <div className={styles.viewModeToggle} role="tablist" aria-label="View mode">
          {(
            [
              ["document", "Document"],
              ["both", "Both"],
              ["canvas", "Canvas"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={viewMode === mode}
              className={`${styles.viewModeButton} ${
                viewMode === mode ? styles.viewModeButtonActive : ""
              }`}
              onClick={() => setViewMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.topNavSpacer} aria-hidden />
        <div className={styles.topNavUser}>
          <UserButton
            appearance={{
              elements: {
                avatarBox: { width: 30, height: 30 },
              },
            }}
          />
        </div>
      </header>

      <aside className={styles.sidebarRail} aria-label="Feature sidebar">
        <div className={styles.sidebarRailGroup}>
          {(
            [
              ["tools", "Drawing tools", "tools"],
              ["insert", "Insert & libraries", "insert"],
              ["ai", "Generate with AI", "ai"],
              ["search", "Search & commands", "search"],
              ["share", "Share & view", "share"],
              ["file", "File & settings", "file"],
            ] as const
          ).map(([step, label, glyph]) => (
            <button
              key={step}
              type="button"
              className={`${styles.sidebarRailBtn} ${
                (step === "ai" ? showAiChat : sidebarStep === step)
                  ? styles.sidebarRailBtnActive
                  : ""
              } ${step === "ai" ? styles.sidebarRailBtnAccent : ""}`}
              aria-label={label}
              title={label}
              aria-pressed={sidebarStep === step}
              onClick={() => toggleSidebarStep(step)}
            >
              {sidebarGlyph(glyph)}
            </button>
          ))}
        </div>
        <div className={styles.sidebarRailSpacer} />
        <div className={styles.sidebarRailGroup}>
          <button
            type="button"
            className={styles.sidebarRailBtn}
            aria-label="Back to workspace"
            title="Back to workspace"
            onClick={() => router.push("/")}
          >
            {sidebarGlyph("home")}
          </button>
        </div>
      </aside>

      {sidebarStep === "tools" && (
        <aside className={styles.sidebarStepPanel} aria-label="Drawing tools">
          <div className={styles.sidebarStepHeader}>
            <div>
              <h3>Tools</h3>
              <p>Select a drawing tool</p>
            </div>
            <button
              type="button"
              className={styles.menuClose}
              onClick={() => setSidebarStep(null)}
              aria-label="Close tools"
            >
              ×
            </button>
          </div>
          <div className={styles.sidebarStepBody}>
            <div className={styles.sidebarToolGrid}>
              {MAIN_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className={`${styles.sidebarToolBtn} ${
                    activeTool === tool.id ? styles.sidebarToolBtnActive : ""
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
              <button
                type="button"
                className={`${styles.sidebarToolBtn} ${
                  activeTool === "eraser" ? styles.sidebarToolBtnActive : ""
                }`}
                title="Eraser — click objects, or click again to clear all"
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
            </div>
            <div className={styles.sidebarActionList}>
              {EXTRA_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className={`${styles.sidebarActionBtn} ${
                    activeTool === tool.id ? styles.sidebarActionBtnActive : ""
                  }`}
                  onClick={() => {
                    setActiveTool(tool.id);
                    setPendingLibraryIcon(null);
                    setStatusMessage(`${tool.label} selected`);
                  }}
                >
                  <span className={styles.sidebarActionIcon}>{toolIcon(tool.id)}</span>
                  <span className={styles.sidebarActionText}>
                    <strong>{tool.label}</strong>
                    <small>Shortcut {tool.shortcut}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      )}

      {sidebarStep === "insert" && (
        <aside className={styles.sidebarStepPanel} aria-label="Insert features">
          <div className={styles.sidebarStepHeader}>
            <div>
              <h3>Insert</h3>
              <p>Catalogs, icons & starters</p>
            </div>
            <button
              type="button"
              className={styles.menuClose}
              onClick={() => setSidebarStep(null)}
              aria-label="Close insert"
            >
              ×
            </button>
          </div>
          <div className={styles.sidebarStepBody}>
            <div className={styles.sidebarActionList}>
              <button
                type="button"
                className={`${styles.sidebarActionBtn} ${
                  showCatalogPanel ? styles.sidebarActionBtnActive : ""
                }`}
                onClick={() => {
                  setShowCatalogPanel((previous) => !previous);
                  setShowIconsPanel(false);
                }}
              >
                <span className={styles.sidebarActionIcon}>{menuGlyph("catalog")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>Diagram catalog</strong>
                  <small>Flow, ERD, cloud & more</small>
                </span>
              </button>
              <button
                type="button"
                className={`${styles.sidebarActionBtn} ${
                  showIconsPanel ? styles.sidebarActionBtnActive : ""
                }`}
                onClick={() => {
                  setShowIconsPanel((previous) => !previous);
                  setShowCatalogPanel(false);
                }}
              >
                <span className={styles.sidebarActionIcon}>{menuGlyph("icons")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>Icon library</strong>
                  <small>Tech, cloud & custom icons</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => handleInsertStarter("flow-cicd")}
              >
                <span className={styles.sidebarActionIcon}>{menuGlyph("flow")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>CI/CD flowchart</strong>
                  <small>Release gates &amp; rollback paths</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => handleInsertStarter("docker-compose")}
              >
                <span className={styles.sidebarActionIcon}>{menuGlyph("arch")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>Docker Compose</strong>
                  <small>Local multi-service stack</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => handleInsertStarter("terraform-modules")}
              >
                <span className={styles.sidebarActionIcon}>{menuGlyph("arch")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>Terraform modules</strong>
                  <small>Network · compute · data IaC</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => handleInsertStarter("jenkins-pipeline")}
              >
                <span className={styles.sidebarActionIcon}>{menuGlyph("flow")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>Jenkins pipeline</strong>
                  <small>Build · test · deploy stages</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => handleInsertStarter("prometheus-grafana")}
              >
                <span className={styles.sidebarActionIcon}>{menuGlyph("arch")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>Prometheus + Grafana</strong>
                  <small>Metrics, alerts &amp; dashboards</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => handleInsertStarter("aws-three-tier")}
              >
                <span className={styles.sidebarActionIcon}>{menuGlyph("arch")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>AWS three-tier</strong>
                  <small>CloudFront · EC2 · RDS</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => handleInsertStarter("gcp-gke")}
              >
                <span className={styles.sidebarActionIcon}>{menuGlyph("arch")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>GCP GKE</strong>
                  <small>Load balancer · cluster · SQL</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => handleInsertStarter("azure-aks")}
              >
                <span className={styles.sidebarActionIcon}>{menuGlyph("arch")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>Azure AKS</strong>
                  <small>Front Door · AKS · Key Vault</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => handleInsertStarter("flow-basic")}
              >
                <span className={styles.sidebarActionIcon}>{menuGlyph("flow")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>Flowchart starter</strong>
                  <small>Quick decision flow</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => handleInsertStarter("microservices")}
              >
                <span className={styles.sidebarActionIcon}>{menuGlyph("arch")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>Architecture starter</strong>
                  <small>Services &amp; data layout</small>
                </span>
              </button>
            </div>
          </div>
        </aside>
      )}

      {showAiChat && (
        <aside className={styles.aiChatPanel} aria-label="AI New Chat">
          <div className={styles.aiChatHeader}>
            <div>
              <h3>New Chat</h3>
              <p>Create diagrams or docs with Mistral</p>
            </div>
            <div className={styles.aiChatHeaderActions}>
              <button
                type="button"
                className={styles.iconButton}
                title="New chat"
                onClick={() => {
                  setAiMessages([]);
                  setAiPrompt("");
                  setAiError("");
                  setAiGitContext("");
                }}
              >
                +
              </button>
              <button
                type="button"
                className={styles.iconButton}
                title="Reset AI credits"
                onClick={() => {
                  setAiCreditsUsed(0);
                  window.localStorage.setItem("draw-app-ai-credits-used", "0");
                }}
              >
                ↺
              </button>
              <button
                type="button"
                className={styles.menuClose}
                onClick={() => setShowAiChat(false)}
                aria-label="Close AI chat"
              >
                ×
              </button>
            </div>
          </div>

          <div className={styles.aiChatBody}>
            <p className={styles.aiChatSectionLabel}>What would you like to create?</p>
            <div className={styles.aiCreateGrid}>
              {(
                [
                  ["architecture", "Architecture Diagram", "🏛"],
                  ["flowchart", "Flow Chart", "🔀"],
                  ["erd", "Entity Relationship", "🗄"],
                  ["sequence", "Sequence Diagram", "↕"],
                  ["bpmn", "BPMN Diagram", "⟳"],
                  ["document", "Document", "📄"],
                ] as const
              ).map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.aiCreateCard} ${
                    aiFormat === id ? styles.aiCreateCardActive : ""
                  }`}
                  onClick={() => {
                    setAiFormat(id);
                    setAiError("");
                    setAiPrompt("");
                  }}
                >
                  <span className={styles.aiCreateIcon}>{icon}</span>
                  <strong>{label}</strong>
                </button>
              ))}
            </div>

            {aiMessages.length === 0 ? (
              <div className={styles.aiExamplesBlock}>
                <p className={styles.aiChatSectionLabel}>
                  {DIAGRAM_FORMAT_LABELS[aiFormat]} examples
                </p>
                <p className={styles.eraserHint}>{DIAGRAM_FORMAT_HINTS[aiFormat]}</p>
                <div className={styles.aiExampleList}>
                  {getDiagramExamples(aiFormat).map((example) => (
                    <button
                      key={example.id}
                      type="button"
                      className={styles.aiExampleCard}
                      disabled={aiBusy || aiCreditsUsed >= 3}
                      onClick={() => {
                        setAiPrompt(example.prompt);
                        void handleAiChatGenerate(example.prompt);
                      }}
                    >
                      {example.prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <p className={styles.aiChatSectionLabel}>Already have something to start with?</p>
            <div className={styles.aiStartRow}>
              <button
                type="button"
                className={styles.aiStartChip}
                onClick={() => {
                  setShowCatalogPanel(true);
                  setShowIconsPanel(false);
                  setStatusMessage("Pick a catalog template to seed the canvas");
                }}
              >
                Template
              </button>
              <button
                type="button"
                className={styles.aiStartChip}
                onClick={() => document.getElementById("canvas-open-file-input")?.click()}
              >
                File
              </button>
              <button
                type="button"
                className={styles.aiStartChip}
                onClick={() => {
                  const repo = window.prompt(
                    "Git repo or notes to include as context (e.g. org/repo + branch)",
                    aiGitContext || "org/repo @ main",
                  );
                  if (repo === null) return;
                  setAiGitContext(repo.trim());
                  setStatusMessage(repo.trim() ? "Git context attached to AI chat" : "Git context cleared");
                }}
              >
                Git Repo
              </button>
            </div>
            <button
              type="button"
              className={styles.aiSeparateBtn}
              onClick={handleSeparateOverlappingDiagrams}
            >
              Separate / line up diagrams
            </button>
            {aiGitContext ? (
              <p className={styles.aiGitHint}>Git context: {aiGitContext}</p>
            ) : null}

            <div className={styles.aiCreditsBar}>
              <div className={styles.aiCreditsTrack}>
                <span style={{ width: `${Math.min(100, (aiCreditsUsed / 3) * 100)}%` }} />
              </div>
              <p>
                {Math.min(aiCreditsUsed, 3)} of 3 AI credits.{" "}
                <button
                  type="button"
                  className={styles.aiUpgradeLink}
                  onClick={() => {
                    setAiCreditsUsed(0);
                    window.localStorage.setItem("draw-app-ai-credits-used", "0");
                  }}
                >
                  Reset
                </button>
              </p>
            </div>

            {aiMessages.length > 0 ? (
              <div className={styles.aiMessageList}>
                {aiMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`${styles.aiMessage} ${
                      message.role === "user" ? styles.aiMessageUser : styles.aiMessageAssistant
                    }`}
                  >
                    {message.text}
                  </div>
                ))}
              </div>
            ) : null}

            {aiError ? <p className={styles.generateError}>{aiError}</p> : null}
          </div>

          <div className={styles.aiComposer}>
            <button
              type="button"
              className={styles.aiComposerPlus}
              title="Attach template / file / git"
              onClick={() => {
                setShowCatalogPanel(true);
              }}
            >
              +
            </button>
            <textarea
              className={styles.aiComposerInput}
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              placeholder={DIAGRAM_COMPOSER_PLACEHOLDERS[aiFormat]}
              rows={3}
              onKeyDown={(event) => {
                if (event.key === "/" && !aiPrompt) {
                  event.preventDefault();
                  setAiPrompt(`/${aiFormat} `);
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleAiChatGenerate();
                }
              }}
            />
            <button
              type="button"
              className={styles.aiComposerSend}
              disabled={aiBusy}
              onClick={() => void handleAiChatGenerate()}
              aria-label="Send"
            >
              {aiBusy ? "…" : "↑"}
            </button>
          </div>
        </aside>
      )}

      {sidebarStep === "search" && (
        <aside className={styles.sidebarStepPanel} aria-label="Search features">
          <div className={styles.sidebarStepHeader}>
            <div>
              <h3>Search</h3>
              <p>Find content & run commands</p>
            </div>
            <button
              type="button"
              className={styles.menuClose}
              onClick={() => setSidebarStep(null)}
              aria-label="Close search"
            >
              ×
            </button>
          </div>
          <div className={styles.sidebarStepBody}>
            <div className={styles.sidebarActionList}>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => {
                  setShowFindPanel(true);
                  setFindQuery("");
                  setSidebarStep(null);
                }}
              >
                <span className={styles.sidebarActionIcon}>{sidebarGlyph("search")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>Find on canvas</strong>
                  <small>Ctrl+F — search notes & labels</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => {
                  setShowCommandPalette(true);
                  setCommandQuery("");
                  setSidebarStep(null);
                }}
              >
                <span className={styles.sidebarActionIcon}>{sidebarGlyph("command")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>Command palette</strong>
                  <small>Ctrl+/ — jump to any action</small>
                </span>
              </button>
            </div>
          </div>
        </aside>
      )}

      {sidebarStep === "share" && (
        <aside className={styles.sidebarStepPanel} aria-label="Share features">
          <div className={styles.sidebarStepHeader}>
            <div>
              <h3>Share</h3>
              <p>Collaborate & reset view</p>
            </div>
            <button
              type="button"
              className={styles.menuClose}
              onClick={() => setSidebarStep(null)}
              aria-label="Close share"
            >
              ×
            </button>
          </div>
          <div className={styles.sidebarStepBody}>
            <div className={styles.sidebarActionList}>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => {
                  void handleLiveCollaboration();
                }}
              >
                <span className={styles.sidebarActionIcon}>{sidebarGlyph("share")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>Live collaboration</strong>
                  <small>Copy a shareable room link</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.sidebarActionBtn}
                onClick={() => {
                  if (elements.length === 0) {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                    setStatusMessage("View reset");
                    return;
                  }
                  fitElementsInView(elements);
                  setStatusMessage("View fitted to diagram");
                }}
              >
                <span className={styles.sidebarActionIcon}>{sidebarGlyph("center")}</span>
                <span className={styles.sidebarActionText}>
                  <strong>Fit to view</strong>
                  <small>Zoom and center content on the canvas</small>
                </span>
              </button>
            </div>
          </div>
        </aside>
      )}

      {sidebarStep === "file" && (
        <nav ref={menuPanelRef} className={styles.menuPanel} style={{ left: 56 }} aria-label="Main menu">
          <div className={styles.menuHeader}>
            <div>
              <h3>Board menu</h3>
              <p>{canvasName}</p>
            </div>
            <button
              type="button"
              className={styles.menuClose}
              onClick={() => {
                setSidebarStep(null);
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
              setSidebarStep(null);
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
              setSidebarStep(null);
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
              setSidebarStep(null);
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
              setSidebarStep(null);
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
              setSidebarStep(null);
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
              setSidebarStep(null);
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
              setSidebarStep(null);
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

      {showExtras && (
        <section ref={extrasPanelRef} className={styles.extrasPanel} style={{ left: panelOffsetLeft }}>
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
              onClick={() => handleInsertStarter("flow-basic")}
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
              onClick={() => handleInsertStarter("microservices")}
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
            right: showCatalogPanel ? 336 : 16,
            left: "auto",
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

      {(viewMode === "document" || viewMode === "both") && (
        <section
          className={`${styles.documentPane} ${
            viewMode === "document" ? styles.documentPaneFull : ""
          }`}
          aria-label="Document"
        >
          <div className={styles.documentPaneHeader}>
            <div className={styles.documentPaneHeaderTop}>
              <div>
                <h2>{canvasName}</h2>
                <p>Architecture docs synced with this board</p>
              </div>
              <button
                type="button"
                className={styles.docsGenerateButton}
                onClick={() => void handleGenerateDocsFromCanvas()}
                disabled={isGeneratingDocs}
                title="Generate documentation from canvas with Mistral"
              >
                {isGeneratingDocs ? "Generating…" : "Generate docs"}
              </button>
            </div>
            {docsError ? <p className={styles.generateError}>{docsError}</p> : null}
          </div>
          <textarea
            className={styles.documentEditor}
            value={documentNotes}
            onChange={(event) => setDocumentNotes(event.target.value)}
            placeholder="Write your architecture notes, one-liner summary, and decisions here…"
            spellCheck
          />
        </section>
      )}

      <main
        className={`${styles.canvasArea} ${showGrid ? "" : styles.canvasAreaNoGrid} ${
          viewMode === "both" ? styles.canvasAreaSplit : ""
        } ${viewMode === "document" ? styles.canvasAreaHidden : ""} ${
          showAiChat ? styles.canvasAreaWithAi : ""
        }`}
      >
        {showStylePanel && (
          <aside
            ref={propertiesPanelRef}
            className={styles.propertiesPanel}
            style={{ left: panelOffsetLeft }}
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
            style={{ left: panelOffsetLeft }}
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
            <p className={styles.propertyLabel}>Click the canvas, then type. Enter to save.</p>
          </aside>
        )}

        {activeTool === "eraser" && (
          <aside
            ref={propertiesPanelRef}
            className={styles.propertiesPanel}
            style={{ left: panelOffsetLeft }}
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
          ref={canvasSvgRef}
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
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {elements.map((element) =>
              inlineEdit?.id === element.id ? null : (
              <g
                key={`h-${element.id}`}
                filter={highlightedId === element.id ? "url(#find-glow)" : undefined}
              >
                {renderElement(element)}
              </g>
              ),
            )}
            {draftElement && renderElement({ ...draftElement, id: "draft-element" })}
          </g>
        </svg>
        {inlineEdit && inlineEditStyle ? (
          <textarea
            ref={inlineEditRef}
            className={`${styles.inlineTextEditor} ${
              inlineEdit.kind === "note" ? styles.inlineNoteEditor : ""
            }`}
            style={inlineEditStyle}
            value={inlineEdit.value}
            placeholder={inlineEdit.kind === "note" ? "Sticky note…" : "Type text…"}
            onChange={(event) =>
              setInlineEdit((previous) =>
                previous ? { ...previous, value: event.target.value } : previous,
              )
            }
            onBlur={() => commitInlineEdit()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelInlineEdit();
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : null}
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
          Elements: {elements.length} · Zoom: {Math.round(zoom * 100)}% · Pan: ({Math.round(pan.x)}, {Math.round(pan.y)})
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
