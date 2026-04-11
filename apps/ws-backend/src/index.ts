import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";
import { prismaClient } from "@repo/db/client";

// Render and other hosts set PORT; local dev uses WS_BACKEND_PORT (default 8082).
const WS_BACKEND_PORT = Number(process.env.PORT ?? process.env.WS_BACKEND_PORT ?? 8082);

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url?.startsWith("/health")) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[ws-backend] Port ${String(WS_BACKEND_PORT)} is already in use. Stop the other process using that port (or another ws-backend / turbo dev), or set WS_BACKEND_PORT and NEXT_PUBLIC_WS_PORT in the repo .env.`
    );
  } else {
    console.error("[ws-backend] WebSocketServer error:", err);
  }
  process.exit(1);
});

server.listen(WS_BACKEND_PORT, () => {
  console.log(`[ws-backend] HTTP + WebSocket listening on ${String(WS_BACKEND_PORT)}`);
});

type CanvasState = {
  canvasName: string;
  elements: unknown[];
  pan: { x: number; y: number };
  backgroundColor: string;
  updatedAt: string;
};

type User = {
  ws: WebSocket;
  rooms: string[];
  userId: string;
};

const users: User[] = [];
const roomStates = new Map<string, CanvasState>();

const DEFAULT_CANVAS_STATE: CanvasState = {
  canvasName: "Untitled canvas",
  elements: [],
  pan: { x: 0, y: 0 },
  backgroundColor: "#f7f7fb",
  updatedAt: new Date().toISOString(),
};

function checkUser(token: string): string | null {
  if (!token) {
    return null;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string" || !decoded || !decoded.userId) {
      return null;
    }
    return decoded.userId as string;
  } catch {
    return null;
  }
}

async function loadStateForRoom(roomId: string): Promise<CanvasState> {
  const inMemoryState = roomStates.get(roomId);
  if (inMemoryState) {
    return inMemoryState;
  }

  const persistedRows = await prismaClient.$queryRaw<
    Array<{
      canvasName: string;
      elements: unknown;
      pan: unknown;
      backgroundColor: string;
      updatedAt: Date;
    }>
  >`SELECT "canvasName", "elements", "pan", "backgroundColor", "updatedAt" FROM "CanvasState" WHERE "roomIdentifier" = ${roomId} LIMIT 1`;

  const persisted = persistedRows[0];

  if (!persisted) {
    return DEFAULT_CANVAS_STATE;
  }

  const state: CanvasState = {
    canvasName: persisted.canvasName,
    elements: Array.isArray(persisted.elements) ? persisted.elements : [],
    pan:
      typeof persisted.pan === "object" &&
      persisted.pan !== null &&
      "x" in persisted.pan &&
      "y" in persisted.pan
        ? {
            x: Number((persisted.pan as { x: unknown }).x ?? 0),
            y: Number((persisted.pan as { y: unknown }).y ?? 0),
          }
        : { x: 0, y: 0 },
    backgroundColor: persisted.backgroundColor,
    updatedAt: persisted.updatedAt.toISOString(),
  };

  roomStates.set(roomId, state);
  return state;
}

function broadcastToRoom(roomId: string, message: unknown, except?: WebSocket) {
  users.forEach((user) => {
    if (user.ws === except) {
      return;
    }
    if (!user.rooms.includes(roomId)) {
      return;
    }
    if (user.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    user.ws.send(JSON.stringify(message));
  });
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

wss.on("connection", function connection(ws, request) {
  const url = request.url;
  const queryParams = new URLSearchParams(url?.split("?")[1] ?? "");
  const token = queryParams.get("token") ?? "";
  const userId = checkUser(token) ?? `guest-${Math.random().toString(36).slice(2, 8)}`;

  users.push({
    userId,
    rooms: [],
    ws,
  });

  ws.on("message", async function message(data) {
    const raw = typeof data === "string" ? data : data.toString();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
      return;
    }
    const parsedData = parsed as Record<string, unknown>;
    const msgType = parsedData.type;
    if (typeof msgType !== "string") {
      return;
    }

    const currentUser = users.find((item) => item.ws === ws);
    if (!currentUser) {
      return;
    }

    if (msgType === "join_room") {
      const roomId = String(parsedData.roomId ?? "");
      if (!roomId) {
        return;
      }
      if (!currentUser.rooms.includes(roomId)) {
        currentUser.rooms.push(roomId);
      }
      let state: CanvasState;
      try {
        state = await loadStateForRoom(roomId);
      } catch (err) {
        console.error("[ws-backend] loadStateForRoom failed; sending default canvas state", err);
        state = { ...DEFAULT_CANVAS_STATE };
      }
      ws.send(JSON.stringify({ type: "canvas_state", roomId, state }));
      return;
    }

    if (msgType === "leave_room") {
      const roomId = String(parsedData.roomId ?? "");
      currentUser.rooms = currentUser.rooms.filter((item) => item !== roomId);
      return;
    }

    if (msgType === "canvas_update") {
      const roomId = String(parsedData.roomId ?? "");
      if (!roomId || !currentUser.rooms.includes(roomId)) {
        return;
      }

      const stateObj = asObject(parsedData.state);
      const panObj = stateObj ? asObject(stateObj.pan) : null;
      const state: CanvasState = {
        canvasName: String(stateObj?.canvasName ?? DEFAULT_CANVAS_STATE.canvasName),
        elements: Array.isArray(stateObj?.elements) ? stateObj.elements : [],
        pan: {
          x: Number(panObj?.x ?? 0),
          y: Number(panObj?.y ?? 0),
        },
        backgroundColor: String(
          stateObj?.backgroundColor ?? DEFAULT_CANVAS_STATE.backgroundColor,
        ),
        updatedAt: new Date().toISOString(),
      };

      roomStates.set(roomId, state);
      const elementsJson = JSON.stringify(state.elements);
      const panJson = JSON.stringify(state.pan);
      try {
        await prismaClient.$executeRaw`
          INSERT INTO "CanvasState" ("roomIdentifier", "canvasName", "elements", "pan", "backgroundColor", "updatedAt")
          VALUES (${roomId}, ${state.canvasName}, ${elementsJson}::jsonb, ${panJson}::jsonb, ${state.backgroundColor}, NOW())
          ON CONFLICT ("roomIdentifier")
          DO UPDATE SET
            "canvasName" = EXCLUDED."canvasName",
            "elements" = EXCLUDED."elements",
            "pan" = EXCLUDED."pan",
            "backgroundColor" = EXCLUDED."backgroundColor",
            "updatedAt" = NOW()
        `;
      } catch (err) {
        console.error("[ws-backend] canvas persist failed; realtime broadcast still sent", err);
      }
      broadcastToRoom(
        roomId,
        {
          type: "canvas_update",
          roomId,
          state,
          clientId: parsedData.clientId ?? null,
        },
        ws,
      );
      return;
    }

    if (msgType === "chat") {
      const roomId = String(parsedData.roomId ?? "");
      const chatBody = parsedData.message;
      if (!roomId || !currentUser.rooms.includes(roomId) || chatBody === undefined || chatBody === null) {
        return;
      }

      try {
        await prismaClient.chat.create({
          data: {
            roomId: Number(roomId),
            message: String(chatBody),
            userId: currentUser.userId,
          },
        });
      } catch (err) {
        console.error("[ws-backend] chat persist failed", err);
        return;
      }

      broadcastToRoom(roomId, {
        type: "chat",
        message: chatBody,
        roomId,
      });
    }
  });

  ws.on("close", () => {
    const index = users.findIndex((item) => item.ws === ws);
    if (index >= 0) {
      users.splice(index, 1);
    }
  });
});