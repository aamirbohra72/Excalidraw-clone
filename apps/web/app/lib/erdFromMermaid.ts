/**
 * Parse Mermaid erDiagram into native Eraser-style colored table cards + connectors.
 */

export type ErdTableField = { name: string; type: string; pk?: boolean };

export type ErdBuiltTable = {
  title: string;
  headerColor: string;
  fields: ErdTableField[];
  point: { x: number; y: number };
  width: number;
};

export type ErdBuiltArrow = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  label?: string;
};

export type ErdBuildResult = {
  tables: ErdBuiltTable[];
  arrows: ErdBuiltArrow[];
  bounds: { width: number; height: number };
};

const ERD_PALETTE = [
  "#e03131", // red
  "#2f9e44", // green
  "#0c8599", // teal
  "#e67700", // ochre
  "#1971c2", // blue
  "#5c7cfa", // indigo
  "#9c36b5", // purple
  "#f08c00", // amber
  "#087f5b", // emerald
  "#c2255c", // pink
];

const TABLE_WIDTH = 220;
const COL_GAP = 56;
const ROW_GAP = 48;
const HEADER_H = 40;
const ROW_H = 28;

const stripFences = (code: string) =>
  code
    .replace(/^```(?:mermaid)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/%%\{init:[\s\S]*?\}%%\s*/gi, "")
    .trim();

const normalizeType = (raw: string) => {
  const t = raw.trim().toLowerCase();
  if (!t) return "string";
  if (t === "int" || t === "integer" || t === "bigint" || t === "float" || t === "decimal") {
    return t === "float" || t === "decimal" ? "number" : "number";
  }
  if (t === "bool" || t === "boolean") return "boolean";
  if (t === "datetime" || t === "date" || t === "time") return "timestamp";
  if (t === "uuid" || t === "text" || t === "varchar" || t === "string") return "string";
  return raw.trim().slice(0, 16);
};

type ParsedEntity = { name: string; fields: ErdTableField[] };
type ParsedRel = { from: string; to: string; label: string };

function parseEntities(body: string): ParsedEntity[] {
  const entities: ParsedEntity[] = [];
  const blockRe = /([A-Za-z_][\w]*)\s*\{([^}]*)\}/g;
  let match = blockRe.exec(body);
  while (match) {
    const name = match[1] ?? "";
    const fieldBlock = match[2] ?? "";
    const fields: ErdTableField[] = [];
    for (const line of fieldBlock.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("%%")) continue;
      // string id PK  |  int age  |  string userId FK
      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;
      const type = normalizeType(parts[0] ?? "string");
      const fieldName = parts[1] ?? "field";
      const flags = parts.slice(2).join(" ").toUpperCase();
      const pk = /\bPK\b/.test(flags) || fieldName.toLowerCase() === "id";
      const fk = /\bFK\b/.test(flags);
      fields.push({
        name: fieldName,
        type: fk ? `${type} fk` : type,
        pk,
      });
    }
    if (name) {
      entities.push({
        name,
        fields:
          fields.length > 0
            ? fields
            : [
                { name: "id", type: "string", pk: true },
                { name: "createdAt", type: "timestamp" },
              ],
      });
    }
    match = blockRe.exec(body);
  }
  return entities;
}

function parseRelationships(body: string): ParsedRel[] {
  const rels: ParsedRel[] = [];
  // USER ||--o{ ORDER : places
  const relRe =
    /([A-Za-z_][\w]*)\s+[|}o*]{1,3}--[|{o*]{1,3}\s+([A-Za-z_][\w]*)\s*(?::\s*([^\n]+))?/g;
  let match = relRe.exec(body);
  while (match) {
    const from = match[1] ?? "";
    const to = match[2] ?? "";
    const label = (match[3] ?? "").trim().replace(/^"|"$/g, "");
    if (from && to) {
      rels.push({ from, to, label });
    }
    match = relRe.exec(body);
  }
  return rels;
}

function tableHeight(fieldCount: number) {
  return HEADER_H + Math.max(1, fieldCount) * ROW_H;
}

/**
 * Convert Mermaid erDiagram source into laid-out tables + arrows.
 */
export function buildErdFromMermaid(
  mermaidCode: string,
  origin: { x: number; y: number } = { x: 80, y: 100 },
): ErdBuildResult | null {
  const code = stripFences(mermaidCode);
  if (!/erdiagram/i.test(code)) {
    return null;
  }

  const body = code.replace(/^\s*erDiagram\s*/i, "");
  let entities = parseEntities(body);
  const rels = parseRelationships(body);

  // Entities mentioned only in relationships
  const known = new Set(entities.map((e) => e.name.toLowerCase()));
  for (const rel of rels) {
    for (const name of [rel.from, rel.to]) {
      if (!known.has(name.toLowerCase())) {
        known.add(name.toLowerCase());
        entities.push({
          name,
          fields: [
            { name: "id", type: "string", pk: true },
            { name: "createdAt", type: "timestamp" },
          ],
        });
      }
    }
  }

  if (entities.length === 0) {
    return null;
  }

  // Cap for readable canvas
  entities = entities.slice(0, 8);

  const cols = entities.length <= 4 ? 2 : 3;
  const tables: ErdBuiltTable[] = [];
  const colHeights: number[] = Array.from({ length: cols }, () => 0);
  const colWidths: number[] = Array.from({ length: cols }, () => TABLE_WIDTH);

  entities.forEach((entity, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    // stack by column using running heights
    void row;
    const x = origin.x + col * (TABLE_WIDTH + COL_GAP);
    const y = origin.y + colHeights[col]!;
    const h = tableHeight(entity.fields.length);
    tables.push({
      title: entity.name,
      headerColor: ERD_PALETTE[index % ERD_PALETTE.length]!,
      fields: entity.fields,
      point: { x, y },
      width: TABLE_WIDTH,
    });
    colHeights[col] = (colHeights[col] ?? 0) + h + ROW_GAP;
    colWidths[col] = TABLE_WIDTH;
  });

  const byName = new Map(tables.map((t) => [t.title.toLowerCase(), t]));

  const arrows: ErdBuiltArrow[] = [];
  for (const rel of rels) {
    const from = byName.get(rel.from.toLowerCase());
    const to = byName.get(rel.to.toLowerCase());
    if (!from || !to) continue;
    const fromH = tableHeight(from.fields.length);
    const toH = tableHeight(to.fields.length);
    const fromCx = from.point.x + from.width / 2;
    const fromCy = from.point.y + fromH / 2;
    const toCx = to.point.x + to.width / 2;
    const toCy = to.point.y + toH / 2;

    // Connect nearer edges
    let start = { x: from.point.x + from.width, y: fromCy };
    let end = { x: to.point.x, y: toCy };
    if (toCx < fromCx) {
      start = { x: from.point.x, y: fromCy };
      end = { x: to.point.x + to.width, y: toCy };
    }
    if (Math.abs(toCx - fromCx) < from.width * 0.6) {
      // mostly vertical
      if (toCy > fromCy) {
        start = { x: fromCx, y: from.point.y + fromH };
        end = { x: toCx, y: to.point.y };
      } else {
        start = { x: fromCx, y: from.point.y };
        end = { x: toCx, y: to.point.y + toH };
      }
    }

    arrows.push({
      start,
      end,
      label: rel.label || undefined,
    });
  }

  const maxX =
    Math.max(...tables.map((t) => t.point.x + t.width), origin.x) - origin.x + 40;
  const maxY =
    Math.max(
      ...tables.map((t) => t.point.y + tableHeight(t.fields.length)),
      origin.y,
    ) -
    origin.y +
    40;

  return { tables, arrows, bounds: { width: maxX, height: maxY } };
}
