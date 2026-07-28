import { getIconSrc } from "./iconLibrary";

export type TemplateCategory =
  | "flowchart"
  | "cloud"
  | "erd"
  | "sequence"
  | "architecture"
  | "freeform";

type Point = { x: number; y: number };

type ShapeElement = {
  id: string;
  kind: "shape";
  tool: "rectangle" | "diamond" | "ellipse" | "line" | "arrow" | "frame";
  start: Point;
  end: Point;
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

export type TemplateCanvasElement =
  | ShapeElement
  | TextElement
  | ImageElement
  | NoteElement
  | TableElement;

export type DiagramTemplate = {
  id: string;
  title: string;
  description: string;
  category: TemplateCategory;
  badge: string;
  previewAccent: string;
  build: (origin: Point) => TemplateCanvasElement[];
};

const id = () => `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const text = (point: Point, value: string, color = "#2f2f3d"): TextElement => ({
  id: id(),
  kind: "text",
  point,
  value,
  color,
  opacity: 100,
});

const note = (
  point: Point,
  value: string,
  color: string,
  width = 150,
  height = 72,
): NoteElement => ({
  id: id(),
  kind: "note",
  point,
  width,
  height,
  value,
  color,
});

const frame = (
  start: Point,
  end: Point,
  color = "#5861ea",
): ShapeElement => ({
  id: id(),
  kind: "shape",
  tool: "frame",
  start,
  end,
  color,
  strokeWidth: 2,
  opacity: 100,
});

const arrow = (start: Point, end: Point, color = "#2f3650"): ShapeElement => ({
  id: id(),
  kind: "shape",
  tool: "arrow",
  start,
  end,
  color,
  strokeWidth: 2,
  opacity: 100,
});

const line = (start: Point, end: Point, color = "#8b8ba3"): ShapeElement => ({
  id: id(),
  kind: "shape",
  tool: "line",
  start,
  end,
  color,
  strokeWidth: 1.5,
  opacity: 100,
});

const iconAt = (
  iconId: string,
  point: Point,
  size = 44,
  fallbackLabel?: string,
): TemplateCanvasElement[] => {
  const src = getIconSrc(iconId);
  if (!src) {
    return [note(point, fallbackLabel ?? iconId, "#f2f2fa", size + 40, size + 20)];
  }
  return [
    {
      id: id(),
      kind: "image",
      point,
      width: size,
      height: size,
      src,
    },
  ];
};

const labeledIcon = (
  iconId: string,
  point: Point,
  label: string,
  size = 44,
): TemplateCanvasElement[] => [
  ...iconAt(iconId, point, size, label),
  text({ x: point.x - 8, y: point.y + size + 18 }, label, "#4a4a5b"),
];

const table = (
  point: Point,
  title: string,
  headerColor: string,
  fields: TableField[],
  iconId?: string,
  width = 210,
): TableElement => ({
  id: id(),
  kind: "table",
  point,
  width,
  title,
  headerColor,
  iconSrc: iconId ? getIconSrc(iconId) : undefined,
  fields,
});

const buildApprovalFlow = (o: Point): TemplateCanvasElement[] => [
  note({ x: o.x + 200, y: o.y }, "Request submitted", "#d4f5d8", 170, 60),
  note({ x: o.x + 200, y: o.y + 100 }, "Manager review", "#d6e8ff", 170, 60),
  note({ x: o.x + 200, y: o.y + 200 }, "Approved?", "#fff3a3", 170, 60),
  note({ x: o.x + 20, y: o.y + 310 }, "Send back\nwith comments", "#ffd6e7", 150, 70),
  note({ x: o.x + 220, y: o.y + 310 }, "Finance check", "#f3e8ff", 150, 70),
  note({ x: o.x + 420, y: o.y + 310 }, "Completed", "#d4f5d8", 140, 70),
  arrow({ x: o.x + 285, y: o.y + 60 }, { x: o.x + 285, y: o.y + 100 }),
  arrow({ x: o.x + 285, y: o.y + 160 }, { x: o.x + 285, y: o.y + 200 }),
  arrow({ x: o.x + 200, y: o.y + 230 }, { x: o.x + 95, y: o.y + 310 }),
  arrow({ x: o.x + 370, y: o.y + 230 }, { x: o.x + 295, y: o.y + 310 }),
  arrow({ x: o.x + 370, y: o.y + 345 }, { x: o.x + 420, y: o.y + 345 }),
  text({ x: o.x + 110, y: o.y + 280 }, "No", "#9a3b5d"),
  text({ x: o.x + 360, y: o.y + 280 }, "Yes", "#2f6b3a"),
];

const buildSwimlaneFlow = (o: Point): TemplateCanvasElement[] => [
  frame({ x: o.x, y: o.y }, { x: o.x + 700, y: o.y + 110 }, "#74c0fc"),
  text({ x: o.x + 14, y: o.y + 28 }, "Customer", "#1c7ed6"),
  frame({ x: o.x, y: o.y + 120 }, { x: o.x + 700, y: o.y + 230 }, "#b197fc"),
  text({ x: o.x + 14, y: o.y + 148 }, "Support", "#5f3dc4"),
  frame({ x: o.x, y: o.y + 240 }, { x: o.x + 700, y: o.y + 350 }, "#69db7c"),
  text({ x: o.x + 14, y: o.y + 268 }, "Engineering", "#2b8a3e"),
  note({ x: o.x + 140, y: o.y + 30 }, "Open ticket", "#e7f5ff", 130, 55),
  note({ x: o.x + 320, y: o.y + 145 }, "Triage & assign", "#f3f0ff", 140, 55),
  note({ x: o.x + 500, y: o.y + 265 }, "Fix & deploy", "#ebfbee", 140, 55),
  arrow({ x: o.x + 270, y: o.y + 55 }, { x: o.x + 320, y: o.y + 160 }),
  arrow({ x: o.x + 460, y: o.y + 175 }, { x: o.x + 500, y: o.y + 280 }),
];

const buildFreeformBoard = (o: Point): TemplateCanvasElement[] => [
  text({ x: o.x, y: o.y }, "Product brainstorm", "#2f2f3d"),
  note({ x: o.x, y: o.y + 40 }, "Problem\nSlow onboarding", "#ffd6e7", 160, 90),
  note({ x: o.x + 180, y: o.y + 40 }, "Insight\nUsers skip setup", "#fff3a3", 160, 90),
  note({ x: o.x + 360, y: o.y + 40 }, "Idea\nGuided checklist", "#d6e8ff", 160, 90),
  note({ x: o.x + 540, y: o.y + 40 }, "Metric\nActivation +20%", "#d4f5d8", 160, 90),
  note({ x: o.x + 90, y: o.y + 170 }, "Risks", "#f3e8ff", 140, 70),
  note({ x: o.x + 260, y: o.y + 170 }, "Owners", "#ffe8cc", 140, 70),
  note({ x: o.x + 430, y: o.y + 170 }, "Next sprint", "#e7f5ff", 150, 70),
  ...iconAt("star", { x: o.x + 620, y: o.y + 180 }, 40),
  ...iconAt("zap", { x: o.x + 20, y: o.y + 260 }, 36),
  ...iconAt("heart", { x: o.x + 90, y: o.y + 260 }, 36),
  ...iconAt("message", { x: o.x + 160, y: o.y + 260 }, 36),
  arrow({ x: o.x + 160, y: o.y + 85 }, { x: o.x + 180, y: o.y + 85 }),
  arrow({ x: o.x + 340, y: o.y + 85 }, { x: o.x + 360, y: o.y + 85 }),
  arrow({ x: o.x + 520, y: o.y + 85 }, { x: o.x + 540, y: o.y + 85 }),
];

const buildFreeformMindmap = (o: Point): TemplateCanvasElement[] => [
  note({ x: o.x + 260, y: o.y + 140 }, "Core idea\nRealtime canvas", "#e8e7ff", 170, 80),
  note({ x: o.x + 40, y: o.y }, "Collab\nRooms + WS", "#d6e8ff", 140, 70),
  note({ x: o.x + 480, y: o.y }, "AI\nText → diagram", "#f3e8ff", 150, 70),
  note({ x: o.x + 40, y: o.y + 260 }, "Library\nIcons + templates", "#d4f5d8", 160, 70),
  note({ x: o.x + 480, y: o.y + 260 }, "Export\nPNG + JSON", "#fff3a3", 140, 70),
  arrow({ x: o.x + 180, y: o.y + 50 }, { x: o.x + 260, y: o.y + 150 }),
  arrow({ x: o.x + 480, y: o.y + 50 }, { x: o.x + 400, y: o.y + 150 }),
  arrow({ x: o.x + 180, y: o.y + 280 }, { x: o.x + 270, y: o.y + 210 }),
  arrow({ x: o.x + 480, y: o.y + 280 }, { x: o.x + 400, y: o.y + 210 }),
  ...iconAt("react", { x: o.x + 310, y: o.y + 80 }, 36),
];

const buildSequenceClientServer = (o: Point): TemplateCanvasElement[] => [
  note({ x: o.x, y: o.y }, "Client", "#e9ecef", 130, 56),
  note({ x: o.x + 220, y: o.y }, "Server", "#d0ebff", 130, 56),
  note({ x: o.x + 440, y: o.y }, "Service", "#d3f9d8", 130, 56),
  ...iconAt("monitor", { x: o.x + 90, y: o.y + 10 }, 28),
  ...iconAt("server", { x: o.x + 310, y: o.y + 10 }, 28),
  ...iconAt("tool", { x: o.x + 530, y: o.y + 10 }, 28),
  line({ x: o.x + 65, y: o.y + 56 }, { x: o.x + 65, y: o.y + 340 }, "#adb5bd"),
  line({ x: o.x + 285, y: o.y + 56 }, { x: o.x + 285, y: o.y + 340 }, "#74c0fc"),
  line({ x: o.x + 505, y: o.y + 56 }, { x: o.x + 505, y: o.y + 340 }, "#69db7c"),
  arrow({ x: o.x + 65, y: o.y + 100 }, { x: o.x + 285, y: o.y + 100 }),
  text({ x: o.x + 110, y: o.y + 92 }, "1  Data request", "#495057"),
  arrow({ x: o.x + 285, y: o.y + 150 }, { x: o.x + 505, y: o.y + 150 }),
  text({ x: o.x + 320, y: o.y + 142 }, "2  Service request", "#495057"),
  arrow({ x: o.x + 505, y: o.y + 200 }, { x: o.x + 285, y: o.y + 200 }),
  text({ x: o.x + 320, y: o.y + 192 }, "3  Data processing", "#495057"),
  frame({ x: o.x + 460, y: o.y + 230 }, { x: o.x + 580, y: o.y + 300 }, "#51cf66"),
  text({ x: o.x + 470, y: o.y + 250 }, "until success", "#2b8a3e"),
  text({ x: o.x + 470, y: o.y + 278 }, "Check availability", "#495057"),
  arrow({ x: o.x + 285, y: o.y + 320 }, { x: o.x + 65, y: o.y + 320 }),
  text({ x: o.x + 110, y: o.y + 312 }, "5  Data response", "#495057"),
];

const buildEcommerceErd = (o: Point): TemplateCanvasElement[] => [
  table(
    { x: o.x, y: o.y },
    "customers",
    "#4dabf7",
    [
      { name: "id", type: "string", pk: true },
      { name: "email", type: "string" },
      { name: "name", type: "string" },
    ],
    "user",
  ),
  table(
    { x: o.x + 260, y: o.y },
    "orders",
    "#845ef7",
    [
      { name: "id", type: "string", pk: true },
      { name: "customerId", type: "string" },
      { name: "total", type: "number" },
      { name: "status", type: "string" },
    ],
    "folder",
  ),
  table(
    { x: o.x + 540, y: o.y },
    "products",
    "#51cf66",
    [
      { name: "id", type: "string", pk: true },
      { name: "sku", type: "string" },
      { name: "price", type: "number" },
      { name: "stock", type: "number" },
    ],
    "archive",
  ),
  table(
    { x: o.x + 260, y: o.y + 260 },
    "order_items",
    "#ff922b",
    [
      { name: "id", type: "string", pk: true },
      { name: "orderId", type: "string" },
      { name: "productId", type: "string" },
      { name: "qty", type: "number" },
    ],
    "file",
  ),
  arrow({ x: o.x + 210, y: o.y + 80 }, { x: o.x + 260, y: o.y + 80 }),
  arrow({ x: o.x + 365, y: o.y + 180 }, { x: o.x + 365, y: o.y + 260 }),
  arrow({ x: o.x + 540, y: o.y + 120 }, { x: o.x + 430, y: o.y + 260 }),
  text({ x: o.x + 220, y: o.y + 70 }, "1 — *", "#868e96"),
];

const buildHelpdeskErd = (o: Point): TemplateCanvasElement[] => [
  table(
    { x: o.x, y: o.y },
    "tickets",
    "#fa5252",
    [
      { name: "id", type: "string", pk: true },
      { name: "subject", type: "string" },
      { name: "priority", type: "string" },
      { name: "status", type: "string" },
    ],
    "message",
  ),
  table(
    { x: o.x + 280, y: o.y },
    "agents",
    "#4dabf7",
    [
      { name: "id", type: "string", pk: true },
      { name: "name", type: "string" },
      { name: "team", type: "string" },
    ],
    "users",
  ),
  table(
    { x: o.x + 140, y: o.y + 240 },
    "comments",
    "#fcc419",
    [
      { name: "id", type: "string", pk: true },
      { name: "ticketId", type: "string" },
      { name: "body", type: "string" },
      { name: "createdAt", type: "timestamp" },
    ],
    "mail",
  ),
  arrow({ x: o.x + 210, y: o.y + 70 }, { x: o.x + 280, y: o.y + 70 }),
  arrow({ x: o.x + 105, y: o.y + 180 }, { x: o.x + 200, y: o.y + 240 }),
];

const buildFlowchart = (o: Point): TemplateCanvasElement[] => [
  note({ x: o.x + 160, y: o.y }, "Start", "#d4f5d8", 150, 64),
  note({ x: o.x + 160, y: o.y + 110 }, "Collect input", "#d6e8ff", 150, 64),
  note({ x: o.x + 160, y: o.y + 220 }, "Valid?", "#fff3a3", 150, 64),
  note({ x: o.x + 20, y: o.y + 330 }, "Retry / Fix", "#ffd6e7", 140, 64),
  note({ x: o.x + 300, y: o.y + 330 }, "Complete", "#d4f5d8", 140, 64),
  arrow({ x: o.x + 235, y: o.y + 64 }, { x: o.x + 235, y: o.y + 110 }),
  arrow({ x: o.x + 235, y: o.y + 174 }, { x: o.x + 235, y: o.y + 220 }),
  arrow({ x: o.x + 160, y: o.y + 252 }, { x: o.x + 90, y: o.y + 330 }),
  arrow({ x: o.x + 310, y: o.y + 252 }, { x: o.x + 370, y: o.y + 330 }),
  text({ x: o.x + 70, y: o.y + 300 }, "No", "#9a3b5d"),
  text({ x: o.x + 330, y: o.y + 300 }, "Yes", "#2f6b3a"),
];

const buildDocker = (o: Point): TemplateCanvasElement[] => {
  const elements: TemplateCanvasElement[] = [
    frame({ x: o.x, y: o.y }, { x: o.x + 180, y: o.y + 360 }, "#b08968"),
    text({ x: o.x + 18, y: o.y + 28 }, "CLIENT", "#7a5a3a"),
    frame({ x: o.x + 210, y: o.y }, { x: o.x + 520, y: o.y + 360 }, "#8b7cf7"),
    text({ x: o.x + 228, y: o.y + 28 }, "DOCKER", "#4d41d8"),
    frame({ x: o.x + 550, y: o.y }, { x: o.x + 900, y: o.y + 360 }, "#5b8def"),
    text({ x: o.x + 568, y: o.y + 28 }, "REGISTRY", "#2f5fbf"),

    frame({ x: o.x + 240, y: o.y + 110 }, { x: o.x + 490, y: o.y + 200 }, "#c9b6ff"),
    text({ x: o.x + 252, y: o.y + 132 }, "IMAGE", "#5b4cc4"),
    frame({ x: o.x + 240, y: o.y + 230 }, { x: o.x + 490, y: o.y + 320 }, "#c9b6ff"),
    text({ x: o.x + 252, y: o.y + 252 }, "CONTAINER", "#5b4cc4"),

    frame({ x: o.x + 580, y: o.y + 60 }, { x: o.x + 870, y: o.y + 150 }, "#7eb6ff"),
    text({ x: o.x + 592, y: o.y + 82 }, "IMAGE", "#2f5fbf"),
    frame({ x: o.x + 580, y: o.y + 180 }, { x: o.x + 870, y: o.y + 250 }, "#ff8f9d"),
    text({ x: o.x + 592, y: o.y + 202 }, "EXTENSION", "#b23b4a"),
    frame({ x: o.x + 580, y: o.y + 275 }, { x: o.x + 870, y: o.y + 340 }, "#ff8f9d"),
    text({ x: o.x + 592, y: o.y + 297 }, "PLUGIN", "#b23b4a"),

    ...labeledIcon("docker", { x: o.x + 60, y: o.y + 70 }, "docker pull", 40),
    ...labeledIcon("docker", { x: o.x + 60, y: o.y + 160 }, "docker run", 40),
    ...labeledIcon("docker", { x: o.x + 60, y: o.y + 250 }, "docker build", 40),
    ...labeledIcon("docker", { x: o.x + 330, y: o.y + 50 }, "Docker daemon", 48),
    ...iconAt("linux", { x: o.x + 270, y: o.y + 145 }, 36),
    ...iconAt("python", { x: o.x + 330, y: o.y + 145 }, 36),
    ...iconAt("redis", { x: o.x + 390, y: o.y + 145 }, 36),
    ...iconAt("container", { x: o.x + 300, y: o.y + 265 }, 36),
    ...iconAt("container", { x: o.x + 370, y: o.y + 265 }, 36),
    ...iconAt("nginx", { x: o.x + 610, y: o.y + 95 }, 32),
    ...iconAt("ubuntu", { x: o.x + 670, y: o.y + 95 }, 32),
    ...iconAt("postgres", { x: o.x + 730, y: o.y + 95 }, 32),
    ...iconAt("linux", { x: o.x + 790, y: o.y + 95 }, 32),
    ...iconAt("server", { x: o.x + 640, y: o.y + 205 }, 32),
    ...iconAt("globe", { x: o.x + 710, y: o.y + 205 }, 32),
    ...iconAt("database", { x: o.x + 780, y: o.y + 205 }, 32),
    ...iconAt("docker", { x: o.x + 640, y: o.y + 300 }, 32),
    ...iconAt("grafana", { x: o.x + 710, y: o.y + 300 }, 32),
    ...iconAt("server", { x: o.x + 780, y: o.y + 300 }, 32),

    arrow({ x: o.x + 145, y: o.y + 90 }, { x: o.x + 330, y: o.y + 70 }),
    arrow({ x: o.x + 145, y: o.y + 180 }, { x: o.x + 330, y: o.y + 90 }),
    arrow({ x: o.x + 145, y: o.y + 270 }, { x: o.x + 330, y: o.y + 100 }),
    arrow({ x: o.x + 365, y: o.y + 200 }, { x: o.x + 365, y: o.y + 230 }),
    line({ x: o.x + 100, y: o.y + 90 }, { x: o.x + 580, y: o.y + 105 }, "#8b8ba3"),
    line({ x: o.x + 100, y: o.y + 270 }, { x: o.x + 580, y: o.y + 120 }, "#8b8ba3"),
  ];
  return elements;
};

const buildAwsCicd = (o: Point): TemplateCanvasElement[] => [
  frame({ x: o.x + 200, y: o.y }, { x: o.x + 820, y: o.y + 420 }, "#d4a017"),
  text({ x: o.x + 220, y: o.y + 28 }, "AWS Cloud", "#8a6a10"),
  frame({ x: o.x + 230, y: o.y + 50 }, { x: o.x + 790, y: o.y + 390 }, "#8b7cf7"),
  text({ x: o.x + 248, y: o.y + 74 }, "Region", "#4d41d8"),
  frame({ x: o.x + 260, y: o.y + 95 }, { x: o.x + 760, y: o.y + 360 }, "#5b8def"),
  text({ x: o.x + 278, y: o.y + 120 }, "VPC", "#2f5fbf"),
  frame({ x: o.x + 290, y: o.y + 145 }, { x: o.x + 560, y: o.y + 330 }, "#e05a6a"),
  text({ x: o.x + 308, y: o.y + 170 }, "PRIVATE", "#9b2c3a"),

  ...labeledIcon("user", { x: o.x, y: o.y + 160 }, "Git users", 40),
  ...labeledIcon("git", { x: o.x + 90, y: o.y + 160 }, "Git repo", 40),
  ...labeledIcon("api-gateway", { x: o.x + 320, y: o.y + 200 }, "API Gateway", 44),
  ...labeledIcon("lambda", { x: o.x + 420, y: o.y + 200 }, "Lambda", 44),
  ...labeledIcon("codebuild", { x: o.x + 420, y: o.y + 280 }, "CodeBuild", 44),
  ...labeledIcon("kms", { x: o.x + 600, y: o.y + 180 }, "KMS key", 44),
  ...labeledIcon("s3", { x: o.x + 600, y: o.y + 260 }, "S3 bucket", 44),
  ...labeledIcon("s3", { x: o.x + 680, y: o.y + 260 }, "S3 logs", 44),

  arrow({ x: o.x + 44, y: o.y + 180 }, { x: o.x + 90, y: o.y + 180 }),
  arrow({ x: o.x + 150, y: o.y + 180 }, { x: o.x + 320, y: o.y + 220 }),
  arrow({ x: o.x + 364, y: o.y + 222 }, { x: o.x + 420, y: o.y + 222 }),
  arrow({ x: o.x + 442, y: o.y + 244 }, { x: o.x + 442, y: o.y + 280 }),
  arrow({ x: o.x + 464, y: o.y + 300 }, { x: o.x + 600, y: o.y + 280 }),
  arrow({ x: o.x + 464, y: o.y + 290 }, { x: o.x + 600, y: o.y + 210 }),
];

const buildErd = (o: Point): TemplateCanvasElement[] => [
  table(
    { x: o.x, y: o.y },
    "users",
    "#4dabf7",
    [
      { name: "id", type: "string", pk: true },
      { name: "displayName", type: "string" },
      { name: "team_role", type: "string" },
      { name: "teams", type: "string" },
    ],
    "user",
  ),
  table(
    { x: o.x + 280, y: o.y },
    "workspaces",
    "#51cf66",
    [
      { name: "id", type: "string", pk: true },
      { name: "createdAt", type: "timestamp" },
      { name: "name", type: "string" },
      { name: "ownerId", type: "string" },
    ],
    "server",
  ),
  table(
    { x: o.x + 560, y: o.y },
    "chat",
    "#845ef7",
    [
      { name: "duration", type: "number" },
      { name: "startedAt", type: "timestamp" },
      { name: "endedAt", type: "timestamp" },
      { name: "workspaceId", type: "string" },
    ],
    "bell",
  ),
  table(
    { x: o.x + 140, y: o.y + 260 },
    "invite",
    "#ff922b",
    [
      { name: "inviteId", type: "string", pk: true },
      { name: "workspaceId", type: "string" },
      { name: "type", type: "string" },
      { name: "inviterId", type: "string" },
    ],
    "bookmark",
  ),
  arrow({ x: o.x + 210, y: o.y + 90 }, { x: o.x + 280, y: o.y + 90 }),
  arrow({ x: o.x + 490, y: o.y + 90 }, { x: o.x + 560, y: o.y + 90 }),
  arrow({ x: o.x + 105, y: o.y + 180 }, { x: o.x + 200, y: o.y + 260 }),
  arrow({ x: o.x + 350, y: o.y + 180 }, { x: o.x + 280, y: o.y + 260 }),
  text({ x: o.x + 230, y: o.y + 80 }, "1 — *", "#8f8fa3"),
  text({ x: o.x + 510, y: o.y + 80 }, "1 — *", "#8f8fa3"),
];

const buildSequence = (o: Point): TemplateCanvasElement[] => [
  note({ x: o.x, y: o.y }, "User", "#d6e8ff", 120, 56),
  note({ x: o.x + 200, y: o.y }, "Web App", "#f3e8ff", 120, 56),
  note({ x: o.x + 400, y: o.y }, "API", "#d4f5d8", 120, 56),
  note({ x: o.x + 600, y: o.y }, "Database", "#ffd6e7", 120, 56),
  line({ x: o.x + 60, y: o.y + 56 }, { x: o.x + 60, y: o.y + 320 }, "#b0b0c4"),
  line({ x: o.x + 260, y: o.y + 56 }, { x: o.x + 260, y: o.y + 320 }, "#b0b0c4"),
  line({ x: o.x + 460, y: o.y + 56 }, { x: o.x + 460, y: o.y + 320 }, "#b0b0c4"),
  line({ x: o.x + 660, y: o.y + 56 }, { x: o.x + 660, y: o.y + 320 }, "#b0b0c4"),
  arrow({ x: o.x + 60, y: o.y + 100 }, { x: o.x + 260, y: o.y + 100 }),
  text({ x: o.x + 100, y: o.y + 92 }, "open canvas", "#55556b"),
  arrow({ x: o.x + 260, y: o.y + 150 }, { x: o.x + 460, y: o.y + 150 }),
  text({ x: o.x + 300, y: o.y + 142 }, "save state", "#55556b"),
  arrow({ x: o.x + 460, y: o.y + 200 }, { x: o.x + 660, y: o.y + 200 }),
  text({ x: o.x + 500, y: o.y + 192 }, "persist", "#55556b"),
  arrow({ x: o.x + 660, y: o.y + 250 }, { x: o.x + 460, y: o.y + 250 }),
  text({ x: o.x + 500, y: o.y + 242 }, "ack", "#55556b"),
  arrow({ x: o.x + 460, y: o.y + 300 }, { x: o.x + 60, y: o.y + 300 }),
  text({ x: o.x + 200, y: o.y + 292 }, "synced", "#55556b"),
];

const buildMicroservices = (o: Point): TemplateCanvasElement[] => [
  frame({ x: o.x, y: o.y }, { x: o.x + 720, y: o.y + 340 }, "#8b7cf7"),
  text({ x: o.x + 18, y: o.y + 28 }, "Microservices platform", "#4d41d8"),
  ...labeledIcon("user", { x: o.x + 40, y: o.y + 80 }, "Clients", 40),
  ...labeledIcon("api-gateway", { x: o.x + 180, y: o.y + 80 }, "Gateway", 44),
  note({ x: o.x + 300, y: o.y + 70 }, "Auth service", "#d6e8ff", 130, 64),
  note({ x: o.x + 450, y: o.y + 70 }, "Orders", "#d4f5d8", 120, 64),
  note({ x: o.x + 590, y: o.y + 70 }, "Payments", "#ffd6e7", 120, 64),
  ...labeledIcon("redis", { x: o.x + 320, y: o.y + 200 }, "Cache", 40),
  ...labeledIcon("postgres", { x: o.x + 450, y: o.y + 200 }, "Postgres", 40),
  ...labeledIcon("server", { x: o.x + 580, y: o.y + 200 }, "Queue", 40),
  arrow({ x: o.x + 84, y: o.y + 100 }, { x: o.x + 180, y: o.y + 100 }),
  arrow({ x: o.x + 224, y: o.y + 100 }, { x: o.x + 300, y: o.y + 100 }),
  arrow({ x: o.x + 224, y: o.y + 110 }, { x: o.x + 450, y: o.y + 100 }),
  arrow({ x: o.x + 224, y: o.y + 120 }, { x: o.x + 590, y: o.y + 100 }),
  arrow({ x: o.x + 510, y: o.y + 134 }, { x: o.x + 470, y: o.y + 200 }),
  arrow({ x: o.x + 365, y: o.y + 134 }, { x: o.x + 340, y: o.y + 200 }),
];

export const DIAGRAM_CATEGORIES: Array<{ id: TemplateCategory | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "flowchart", label: "Flow Chart" },
  { id: "freeform", label: "Freeform" },
  { id: "erd", label: "Entity Relationship" },
  { id: "sequence", label: "Sequence" },
  { id: "cloud", label: "Cloud Architecture" },
  { id: "architecture", label: "Architecture" },
];

export const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
  {
    id: "flow-basic",
    title: "Decision flowchart",
    description: "Start → process → decision with Yes/No paths",
    category: "flowchart",
    badge: "Flow",
    previewAccent: "#51cf66",
    build: buildFlowchart,
  },
  {
    id: "flow-approval",
    title: "Approval workflow",
    description: "Manager review with reject / finance / complete paths",
    category: "flowchart",
    badge: "Flow",
    previewAccent: "#845ef7",
    build: buildApprovalFlow,
  },
  {
    id: "flow-swimlane",
    title: "Swimlane flowchart",
    description: "Customer · Support · Engineering lanes",
    category: "flowchart",
    badge: "Lane",
    previewAccent: "#4dabf7",
    build: buildSwimlaneFlow,
  },
  {
    id: "freeform-board",
    title: "Brainstorm board",
    description: "Sticky notes for problem → insight → idea → metric",
    category: "freeform",
    badge: "Board",
    previewAccent: "#ff922b",
    build: buildFreeformBoard,
  },
  {
    id: "freeform-mindmap",
    title: "Product mind map",
    description: "Central idea with collab, AI, library & export branches",
    category: "freeform",
    badge: "Map",
    previewAccent: "#6858f8",
    build: buildFreeformMindmap,
  },
  {
    id: "seq-client-server",
    title: "Client · Server · Service",
    description: "Numbered sequence with loop block (Eraser-style)",
    category: "sequence",
    badge: "Seq",
    previewAccent: "#15aabf",
    build: buildSequenceClientServer,
  },
  {
    id: "docker-arch",
    title: "Docker architecture",
    description: "Client, Docker daemon, images, containers & registry",
    category: "architecture",
    badge: "Docker",
    previewAccent: "#2496ed",
    build: buildDocker,
  },
  {
    id: "aws-cicd",
    title: "AWS CI/CD pipeline",
    description: "Git → API Gateway → Lambda → CodeBuild → S3/KMS",
    category: "cloud",
    badge: "AWS",
    previewAccent: "#ff9900",
    build: buildAwsCicd,
  },
  {
    id: "erd-workspace",
    title: "Workspace data model",
    description: "Users, workspaces, chat & invites ER diagram",
    category: "erd",
    badge: "ERD",
    previewAccent: "#845ef7",
    build: buildErd,
  },
  {
    id: "erd-ecommerce",
    title: "eCommerce data model",
    description: "Customers, orders, products & order items",
    category: "erd",
    badge: "ERD",
    previewAccent: "#20c997",
    build: buildEcommerceErd,
  },
  {
    id: "erd-helpdesk",
    title: "IT help desk model",
    description: "Tickets, agents & comments",
    category: "erd",
    badge: "ERD",
    previewAccent: "#fa5252",
    build: buildHelpdeskErd,
  },
  {
    id: "sequence-save",
    title: "Save & sync sequence",
    description: "User → Web → API → Database interaction flow",
    category: "sequence",
    badge: "Seq",
    previewAccent: "#4dabf7",
    build: buildSequence,
  },
  {
    id: "microservices",
    title: "Microservices platform",
    description: "Gateway, auth, orders, payments with cache & DB",
    category: "architecture",
    badge: "Svc",
    previewAccent: "#6858f8",
    build: buildMicroservices,
  },
  {
    id: "azure-baseline",
    title: "Azure baseline",
    description: "Users, Azure front door style gateway, app & DB",
    category: "cloud",
    badge: "Azure",
    previewAccent: "#0078d4",
    build: (o) => [
      frame({ x: o.x + 160, y: o.y }, { x: o.x + 700, y: o.y + 300 }, "#0078d4"),
      text({ x: o.x + 180, y: o.y + 28 }, "Azure", "#0078d4"),
      ...labeledIcon("user", { x: o.x, y: o.y + 110 }, "Users", 40),
      ...labeledIcon("azure", { x: o.x + 220, y: o.y + 100 }, "App Service", 48),
      ...labeledIcon("server", { x: o.x + 360, y: o.y + 100 }, "Functions", 44),
      ...labeledIcon("postgres", { x: o.x + 520, y: o.y + 100 }, "Azure SQL", 44),
      ...labeledIcon("lock", { x: o.x + 360, y: o.y + 200 }, "Key Vault", 40),
      arrow({ x: o.x + 44, y: o.y + 130 }, { x: o.x + 220, y: o.y + 124 }),
      arrow({ x: o.x + 268, y: o.y + 124 }, { x: o.x + 360, y: o.y + 124 }),
      arrow({ x: o.x + 404, y: o.y + 124 }, { x: o.x + 520, y: o.y + 124 }),
      arrow({ x: o.x + 382, y: o.y + 148 }, { x: o.x + 382, y: o.y + 200 }),
    ],
  },
  {
    id: "banking-erd",
    title: "Banking data model",
    description: "Accounts, transactions & customers ER starter",
    category: "erd",
    badge: "ERD",
    previewAccent: "#20c997",
    build: (o) => [
      table(
        { x: o.x, y: o.y },
        "customers",
        "#20c997",
        [
          { name: "id", type: "string", pk: true },
          { name: "name", type: "string" },
          { name: "email", type: "string" },
        ],
        "user",
      ),
      table(
        { x: o.x + 260, y: o.y },
        "accounts",
        "#339af0",
        [
          { name: "id", type: "string", pk: true },
          { name: "customerId", type: "string" },
          { name: "balance", type: "number" },
        ],
        "database",
      ),
      table(
        { x: o.x + 130, y: o.y + 230 },
        "transactions",
        "#ff6b6b",
        [
          { name: "id", type: "string", pk: true },
          { name: "accountId", type: "string" },
          { name: "amount", type: "number" },
          { name: "createdAt", type: "timestamp" },
        ],
        "activity",
      ),
      arrow({ x: o.x + 210, y: o.y + 80 }, { x: o.x + 260, y: o.y + 80 }),
      arrow({ x: o.x + 330, y: o.y + 160 }, { x: o.x + 250, y: o.y + 230 }),
    ],
  },
];

export function filterTemplates(
  templates: DiagramTemplate[],
  category: TemplateCategory | "all",
  query: string,
) {
  const q = query.trim().toLowerCase();
  return templates.filter((template) => {
    const categoryOk = category === "all" || template.category === category;
    if (!categoryOk) {
      return false;
    }
    if (!q) {
      return true;
    }
    return (
      template.title.toLowerCase().includes(q) ||
      template.description.toLowerCase().includes(q) ||
      template.badge.toLowerCase().includes(q) ||
      template.category.includes(q)
    );
  });
}
