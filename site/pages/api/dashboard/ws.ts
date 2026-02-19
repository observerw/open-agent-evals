import type { IncomingMessage, Server as HttpServer } from "node:http"
import type { Duplex } from "node:stream"

import type { NextApiRequest, NextApiResponse } from "next"
import * as nextCompiledWs from "next/dist/compiled/ws"

import { dashboardWsHub, type DashboardWsRole, type DashboardWsSocket } from "@/lib/dashboard/ws-hub"

type WsServer = {
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (socket: DashboardWsSocket, request: IncomingMessage) => void,
  ): void
}

type WsCtor = new (options: { noServer: boolean }) => WsServer

type HttpServerWithDashboardWs = HttpServer & {
  dashboardWsServer?: WsServer
  dashboardWsUpgradeHandlerAttached?: boolean
}

type ErrorResponse = {
  error: string
}

function firstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

function parseRole(raw: string | null | undefined): DashboardWsRole | null {
  if (raw === "producer" || raw === "viewer") {
    return raw
  }

  return null
}

function getOrCreateWsServer(server: HttpServerWithDashboardWs) {
  if (server.dashboardWsServer) {
    return server.dashboardWsServer
  }

  const wsModule = nextCompiledWs as {
    Server?: WsCtor
    WebSocketServer?: WsCtor
  }
  const WsServerCtor = wsModule.WebSocketServer ?? wsModule.Server
  if (!WsServerCtor) {
    throw new Error("WebSocket server constructor not found")
  }

  const wsServer = new WsServerCtor({ noServer: true })
  server.dashboardWsServer = wsServer
  return wsServer
}

function rejectUpgrade(socket: Duplex, statusCode: number, message: string) {
  if (socket.destroyed) {
    return
  }

  const reason = Buffer.byteLength(message)
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${reason}\r\n\r\n${message}`,
  )
  socket.destroy()
}

function ensureUpgradeHandler(server: HttpServerWithDashboardWs) {
  if (server.dashboardWsUpgradeHandlerAttached) {
    return
  }

  const wsServer = getOrCreateWsServer(server)
  server.on("upgrade", (request, socket, head) => {
    const host = request.headers.host ?? "localhost"
    const requestUrl = new URL(request.url ?? "/", `http://${host}`)

    if (requestUrl.pathname !== "/api/dashboard/ws") {
      return
    }

    const dashboardId = requestUrl.searchParams.get("dashboardId")?.trim() ?? ""
    const role = parseRole(requestUrl.searchParams.get("role"))

    if (!dashboardId || !role) {
      rejectUpgrade(socket, 400, "Invalid dashboardId or role")
      return
    }

    wsServer.handleUpgrade(request, socket, head, (client) => {
      dashboardWsHub.connect({ socket: client, dashboardId, role })
    })
  })

  server.dashboardWsUpgradeHandlerAttached = true
}

export const config = {
  api: {
    bodyParser: false,
  },
}

export default function handler(req: NextApiRequest, res: NextApiResponse<ErrorResponse>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"])
    res.status(405).json({ error: "Method Not Allowed" })
    return
  }

  const dashboardId = firstQueryValue(req.query.dashboardId)?.trim() ?? ""
  const role = parseRole(firstQueryValue(req.query.role))

  if (!dashboardId || !role) {
    res.status(400).json({ error: "dashboardId and role=producer|viewer are required" })
    return
  }

  const socket = res.socket as (typeof res.socket & { server?: HttpServerWithDashboardWs }) | null
  const server = socket?.server
  if (!server) {
    res.status(500).json({ error: "WebSocket server unavailable" })
    return
  }

  ensureUpgradeHandler(server)

  const isUpgradeRequest = req.headers.upgrade?.toLowerCase() === "websocket"
  if (isUpgradeRequest) {
    res.end()
    return
  }

  res.status(426).json({ error: "Upgrade Required" })
}
