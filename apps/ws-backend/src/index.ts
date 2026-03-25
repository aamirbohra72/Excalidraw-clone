import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";
import { prismaClient } from "@repo/db/client";

const WS_BACKEND_PORT = Number(process.env.WS_BACKEND_PORT ?? 8081);
const wss = new WebSocketServer({ port: WS_BACKEND_PORT });

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

function getStateForRoom(roomId: string): CanvasState {
  return roomStates.get(roomId) ?? DEFAULT_CANVAS_STATE;
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
    let parsedData: any;
    try {
      parsedData = JSON.parse(raw);
    } catch {
      return;
    }

    const currentUser = users.find((item) => item.ws === ws);
    if (!currentUser) {
      return;
    }

    if (parsedData.type === "join_room") {
      const roomId = String(parsedData.roomId ?? "");
      if (!roomId) {
        return;
      }
      if (!currentUser.rooms.includes(roomId)) {
        currentUser.rooms.push(roomId);
      }
      const state = await loadStateForRoom(roomId);
      ws.send(JSON.stringify({ type: "canvas_state", roomId, state }));
      return;
    }

    if (parsedData.type === "leave_room") {
      const roomId = String(parsedData.roomId ?? "");
      currentUser.rooms = currentUser.rooms.filter((item) => item !== roomId);
      return;
    }

    if (parsedData.type === "canvas_update") {
      const roomId = String(parsedData.roomId ?? "");
      if (!roomId || !currentUser.rooms.includes(roomId)) {
        return;
      }

      const state: CanvasState = {
        canvasName: String(parsedData.state?.canvasName ?? DEFAULT_CANVAS_STATE.canvasName),
        elements: Array.isArray(parsedData.state?.elements) ? parsedData.state.elements : [],
        pan: {
          x: Number(parsedData.state?.pan?.x ?? 0),
          y: Number(parsedData.state?.pan?.y ?? 0),
        },
        backgroundColor: String(
          parsedData.state?.backgroundColor ?? DEFAULT_CANVAS_STATE.backgroundColor,
        ),
        updatedAt: new Date().toISOString(),
      };

      roomStates.set(roomId, state);
      const elementsJson = JSON.stringify(state.elements);
      const panJson = JSON.stringify(state.pan);
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

    if (parsedData.type === "chat") {
      const roomId = parsedData.roomId;
      const message = parsedData.message;

      await prismaClient.chat.create({
        data: {
          roomId: Number(roomId),
          message,
          userId: currentUser.userId,
        },
      });

      users.forEach((user) => {
        if (user.rooms.includes(roomId)) {
          user.ws.send(
            JSON.stringify({
              type: "chat",
              message,
              roomId,
            }),
          );
        }
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