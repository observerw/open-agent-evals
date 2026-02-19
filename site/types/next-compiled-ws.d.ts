declare module "next/dist/compiled/ws" {
  import type { IncomingMessage } from "node:http"
  import type { Duplex } from "node:stream"

  export type WebSocket = {
    on(event: "message", listener: (data: unknown) => void): void
    on(event: "close", listener: () => void): void
    send(data: string): void
    close(code?: number, reason?: string): void
  }

  export class Server {
    constructor(options: { noServer: boolean })
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (socket: WebSocket, request: IncomingMessage) => void,
    ): void
  }

  export class WebSocketServer extends Server {}
}
