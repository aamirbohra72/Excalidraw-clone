/**
 * Eraser-style pastel palette — readable labels, no post-layout font blow-up.
 */
export const MERMAID_CLASS_DEFS = `
classDef start fill:#FFFFFF,stroke:#7C6FDB,stroke-width:2px,color:#1F2937
classDef process fill:#FFFFFF,stroke:#60A5FA,stroke-width:2px,color:#1F2937
classDef processAlt fill:#FFFFFF,stroke:#C084FC,stroke-width:2px,color:#1F2937
classDef decision fill:#FFFBEB,stroke:#F59E0B,stroke-width:2px,color:#1F2937
classDef success fill:#ECFDF5,stroke:#34D399,stroke-width:2px,color:#1F2937
classDef exit fill:#FEF2F2,stroke:#F87171,stroke-width:2px,color:#1F2937
classDef data fill:#F0FDFA,stroke:#2DD4BF,stroke-width:2px,color:#1F2937
classDef service fill:#FFF7ED,stroke:#FB923C,stroke-width:2px,color:#1F2937
classDef client fill:#EEF2FF,stroke:#818CF8,stroke-width:2px,color:#1F2937
classDef gateway fill:#FDF2F8,stroke:#F472B6,stroke-width:2px,color:#1F2937
`.trim();

export const MERMAID_INIT_FLOW = `%%{init: {
  "theme": "base",
  "themeVariables": {
    "fontFamily": "Segoe UI, system-ui, sans-serif",
    "fontSize": "14px",
    "primaryColor": "#FFFFFF",
    "primaryTextColor": "#1F2937",
    "primaryBorderColor": "#818CF8",
    "secondaryColor": "#EEF2FF",
    "secondaryTextColor": "#1F2937",
    "secondaryBorderColor": "#60A5FA",
    "tertiaryColor": "#FFFBEB",
    "tertiaryTextColor": "#1F2937",
    "tertiaryBorderColor": "#F59E0B",
    "lineColor": "#64748B",
    "textColor": "#1F2937",
    "mainBkg": "#FFFFFF",
    "nodeBorder": "#818CF8",
    "clusterBkg": "#F5F3FF",
    "clusterBorder": "#C4B5FD",
    "titleColor": "#312E81",
    "edgeLabelBackground": "#FFFFFF"
  },
  "flowchart": {
    "curve": "basis",
    "padding": 28,
    "nodeSpacing": 55,
    "rankSpacing": 65,
    "htmlLabels": false,
    "useMaxWidth": false,
    "wrappingWidth": 220
  }
}}%%`;

export const MERMAID_INIT_ER = `%%{init: {
  "theme": "base",
  "themeVariables": {
    "fontFamily": "Segoe UI, system-ui, sans-serif",
    "fontSize": "14px",
    "primaryColor": "#EEF2FF",
    "primaryTextColor": "#1F2937",
    "primaryBorderColor": "#818CF8",
    "lineColor": "#64748B",
    "tertiaryColor": "#ECFEFF",
    "attributeBackgroundColorOdd": "#FFFFFF",
    "attributeBackgroundColorEven": "#F8FAFC"
  }
}}%%`;

export const MERMAID_INIT_SEQUENCE = `%%{init: {
  "theme": "base",
  "themeVariables": {
    "fontFamily": "Segoe UI, system-ui, sans-serif",
    "fontSize": "14px",
    "actorBkg": "#EEF2FF",
    "actorBorder": "#818CF8",
    "actorTextColor": "#1F2937",
    "actorLineColor": "#C4B5FD",
    "signalColor": "#1F2937",
    "signalTextColor": "#1F2937",
    "labelBoxBkgColor": "#DBEAFE",
    "labelBoxBorderColor": "#60A5FA",
    "labelTextColor": "#1E3A8A",
    "loopTextColor": "#1F2937",
    "noteBkgColor": "#FEF3C7",
    "noteTextColor": "#78350F",
    "noteBorderColor": "#F59E0B",
    "activationBkgColor": "#D1FAE5",
    "activationBorderColor": "#34D399",
    "sequenceNumberColor": "#FFFFFF"
  },
  "sequence": {
    "actorMargin": 80,
    "messageMargin": 42,
    "boxMargin": 14,
    "mirrorActors": false,
    "useMaxWidth": false,
    "width": 200,
    "height": 58,
    "noteAlign": "center"
  }
}}%%`;

/**
 * Soft style tweaks only — never change font-size after Mermaid laid out nodes
 * (that is the main cause of clipped labels like "Order Servi").
 */
export function enhanceMermaidSvg(svg: string): string {
  const style = `<style type="text/css"><![CDATA[
    svg { overflow: visible !important; }
    .node, .nodeLabel, .edgeLabel, .label, .cluster, .actor, .activation0, .activation1, .activation2 {
      overflow: visible !important;
    }
    foreignObject { overflow: visible !important; }
    text, tspan {
      font-family: Segoe UI, system-ui, sans-serif !important;
      fill: #1F2937 !important;
    }
    .nodeLabel foreignObject div,
    .edgeLabel foreignObject div,
    .label foreignObject div {
      overflow: visible !important;
      white-space: nowrap !important;
      color: #1F2937 !important;
    }
    .cluster-label text, .titleText {
      fill: #312E81 !important;
      font-weight: 700 !important;
    }
    .messageLine0, .messageLine1, .flowchart-link, .edgePath path {
      stroke-width: 1.75px !important;
    }
    .noteText { fill: #78350F !important; }
  ]]></style>`;

  let next = svg;
  // Drop clip-paths that slice node text
  next = next.replace(/\sclip-path="url\([^"]+\)"/gi, "");
  if (/<defs[\s>]/i.test(next)) {
    next = next.replace(/<defs([^>]*)>/i, `<defs$1>${style}`);
  } else {
    next = next.replace(/<svg([^>]*)>/i, `<svg$1>${style}`);
  }
  return next;
}

const stripInit = (code: string) =>
  code.replace(/%%\{init:[\s\S]*?\}%%\s*/gi, "").trim();

/** Soften long labels so Mermaid boxes don't overflow. */
const shortenLabel = (label: string, maxChars = 22) => {
  const clean = label.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  // Prefer cutting at a word boundary
  const sliced = clean.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace >= 10) return sliced.slice(0, lastSpace);
  return sliced;
};

/**
 * Fix shapes that commonly clip text in Mermaid:
 * - cylinders [(Label)] → rounded rects ["Label"]
 * - shorten very long node / edge labels
 */
export function normalizeMermaidLabels(code: string): string {
  let value = code;

  // Cylinders clip badly — use rounded rectangles instead
  value = value.replace(
    /\b([A-Za-z][\w]*)\s*\[\(([^)\]]*)\)\]/g,
    (_, id: string, label: string) => `${id}["${shortenLabel(label, 20)}"]`,
  );

  // Stadium / circle keep but shorten
  value = value.replace(
    /\b([A-Za-z][\w]*)\s*\(\[([^\]]*)\]\)/g,
    (_, id: string, label: string) => `${id}(["${shortenLabel(label, 18)}"])`,
  );

  // Standard rect labels [Label] or ["Label"]
  value = value.replace(
    /\b([A-Za-z][\w]*)\s*\["([^"]*)"\]/g,
    (_, id: string, label: string) => `${id}["${shortenLabel(label, 24)}"]`,
  );
  value = value.replace(
    /\b([A-Za-z][\w]*)\s*\[([^\]"\n]{1,80})\]/g,
    (_, id: string, label: string) => {
      if (label.startsWith("(") || label.startsWith("[")) return `${id}[${label}]`;
      return `${id}["${shortenLabel(label, 24)}"]`;
    },
  );

  // Edge labels |long text|
  value = value.replace(/\|([^|\n]{1,80})\|/g, (_, label: string) => {
    return `|${shortenLabel(label.trim(), 18)}|`;
  });

  // Sequence messages: A->>B: very long message
  value = value.replace(
    /^(\s*[^\n:]+(?:->>?|-->>?|--)[^\n:]*:\s*)(.+)$/gm,
    (_, prefix: string, msg: string) => `${prefix}${shortenLabel(msg.trim(), 36)}`,
  );

  return value;
}

const classifyNode = (id: string, label: string, shapeHint: string) => {
  const text = `${id} ${label}`.toLowerCase();
  if (shapeHint === "decision" || shapeHint === "{}") return "decision";
  if (
    /\b(start|begin|new |welcome|launch)\b/.test(text) ||
    shapeHint === "stadium"
  ) {
    return "start";
  }
  if (
    /\b(success|done|complete|well[- ]?trained|finish|approved|deployed)\b/.test(
      text,
    )
  ) {
    return "success";
  }
  if (
    /\b(exit|error|fail|reject|cancel|too young|refer|abort|deny)\b/.test(text)
  ) {
    return "exit";
  }
  if (
    /\b(db|database|postgres|redis|s3|storage|table|data|cache|queue|kafka)\b/.test(
      text,
    ) ||
    shapeHint === "cylinder"
  ) {
    return "data";
  }
  if (/\b(gateway|cdn|load.?balancer|proxy|ingress)\b/.test(text)) {
    return "gateway";
  }
  if (/\b(api|service|auth|worker|server|bff|backend)\b/.test(text)) {
    return "service";
  }
  if (/\b(user|client|web|mobile|browser|app|frontend)\b/.test(text)) {
    return "client";
  }
  const hash = Array.from(id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return hash % 2 === 0 ? "process" : "processAlt";
};

/**
 * Inject pastel classDefs + high-contrast theme for flowchart / ER / sequence.
 */
export function beautifyMermaid(code: string, format?: string): string {
  let value = normalizeMermaidLabels(stripInit(code.trim()));
  if (!value) return value;

  const lower = value.toLowerCase();
  const isEr = lower.includes("erdiagram") || format === "erd";
  const isSequence = lower.includes("sequencediagram") || format === "sequence";
  const isFlow =
    /\b(flowchart|graph)\b/i.test(value) ||
    format === "flowchart" ||
    format === "architecture" ||
    format === "bpmn";

  if (isEr) {
    return `${MERMAID_INIT_ER}\n${value}`;
  }
  if (isSequence) {
    return `${MERMAID_INIT_SEQUENCE}\n${value}`;
  }
  if (!isFlow) {
    return `${MERMAID_INIT_FLOW}\n${value}`;
  }

  const nodeMeta = new Map<string, { label: string; hint: string }>();
  const patterns: Array<{ re: RegExp; hint: string }> = [
    { re: /\b([A-Za-z][\w]*)\s*\{\{([^}]*)\}\}/g, hint: "hex" },
    { re: /\b([A-Za-z][\w]*)\s*\{([^}]*)\}/g, hint: "decision" },
    { re: /\b([A-Za-z][\w]*)\s*\(\[([^\]]*)\]\)/g, hint: "stadium" },
    { re: /\b([A-Za-z][\w]*)\s*\(\(([^)]*)\)\)/g, hint: "circle" },
    { re: /\b([A-Za-z][\w]*)\s*\[\(([^)]*)\)\]/g, hint: "cylinder" },
    { re: /\b([A-Za-z][\w]*)\s*\[\[([^\]]*)\]\]/g, hint: "subroutine" },
    { re: /\b([A-Za-z][\w]*)\s*\["([^"]*)"\]/g, hint: "rect" },
    { re: /\b([A-Za-z][\w]*)\s*\[([^\]]*)\]/g, hint: "rect" },
    { re: /\b([A-Za-z][\w]*)\s*\(([^)]*)\)/g, hint: "round" },
  ];

  for (const { re, hint } of patterns) {
    re.lastIndex = 0;
    let match = re.exec(value);
    while (match) {
      const id = match[1];
      const label = match[2] ?? "";
      if (id && !nodeMeta.has(id)) {
        nodeMeta.set(id, { label, hint });
      }
      match = re.exec(value);
    }
  }

  const edgeRe = /\b([A-Za-z][\w]*)\s*(?:-->|---|-\.-|==>|--|~~)/g;
  let edgeMatch = edgeRe.exec(value);
  while (edgeMatch) {
    const id = edgeMatch[1];
    if (id && !nodeMeta.has(id)) {
      nodeMeta.set(id, { label: id, hint: "rect" });
    }
    edgeMatch = edgeRe.exec(value);
  }

  if (nodeMeta.size === 0) {
    return `${MERMAID_INIT_FLOW}\n${value}\n\n${MERMAID_CLASS_DEFS}`;
  }

  value = value
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("classDef ") && !trimmed.startsWith("class ");
    })
    .join("\n")
    .trim();

  const byClass = new Map<string, string[]>();
  for (const [id, meta] of nodeMeta) {
    const cls = classifyNode(id, meta.label, meta.hint);
    const list = byClass.get(cls) ?? [];
    list.push(id);
    byClass.set(cls, list);
  }

  const classLines = [...byClass.entries()]
    .map(([cls, ids]) => `class ${[...new Set(ids)].join(",")} ${cls}`)
    .join("\n");

  return `${MERMAID_INIT_FLOW}\n${value}\n\n${MERMAID_CLASS_DEFS}\n${classLines}`;
}

export function getSvgDimensions(svg: string): { width: number; height: number } {
  const vb = svg.match(/viewBox=["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i);
  if (vb) {
    const width = Math.abs(Number(vb[3]));
    const height = Math.abs(Number(vb[4]));
    if (width > 0 && height > 0) return { width, height };
  }
  const w = svg.match(/\bwidth=["']([\d.]+)(?:px)?["']/i);
  const h = svg.match(/\bheight=["']([\d.]+)(?:px)?["']/i);
  return {
    width: w ? Number(w[1]) : 900,
    height: h ? Number(h[1]) : 600,
  };
}
