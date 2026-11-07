// 127.0.0.1 only. Routes:
//   GET  /ws?token=…&project=…  browser WebSocket (browser token); shows one project at a time
//   POST /hook/<agent>/<event>  Claude Code hooks (agent token, which also says which project)
//   GET  /api/health
//   GET  /*                     the built UI (dist/), when present

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import type { OfficeEvent } from "../src/data/source";
import { handleHook } from "./hooks";
import { handleMcp } from "./mcp";
import type { ProjectRuntime } from "./project";
import type { Projects } from "./projects";
import { log } from "./lib/log";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".json": "application/json",
};

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function readBody(req: IncomingMessage, limit = 256 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) reject(new Error("too large"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

interface Options {
  projects: Projects;
  port: number;
  browserToken: string;
  distDir: string | null;
  allowedOrigins: string[];
}

export function startHttp(o: Options) {
  const send = (res: ServerResponse, code: number, body: string, type = "text/plain") => {
    res.writeHead(code, { "Content-Type": type });
    res.end(body);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const auth = req.headers.authorization ?? "";
    const project = () => o.projects.byAgentToken((token) => safeEqual(auth, `Bearer ${token}`));

    if (req.method === "POST" && url.pathname.startsWith("/hook/")) {
      const rt = project();
      if (!rt) return send(res, 401, "unauthorized");
      const [, , agentId, event] = url.pathname.split("/");
      try {
        const body = await readBody(req);
        const r = handleHook(rt.hub, rt.inbox, decodeURIComponent(agentId ?? ""), event ?? "", body ? JSON.parse(body) : {});
        if (!r.ok) return send(res, 404, "");
        if (r.response) return send(res, 200, JSON.stringify(r.response), "application/json");
        res.writeHead(204);
        return void res.end();
      } catch {
        return send(res, 400, "bad request");
      }
    }

    // Team MCP: agent token + the agent's id (written into its MCP config by HQ).
    if (url.pathname === "/mcp") {
      const rt = project();
      const agentId = String(req.headers["x-hq-agent"] ?? "");
      if (!rt || !rt.hub.cfg(agentId)) return send(res, 401, "unauthorized");
      if (req.method === "GET" || req.method === "DELETE") return send(res, 405, "stateless server");
      try {
        const raw = await readBody(req, 1024 * 1024);
        return await handleMcp(rt.hub, rt.planner, agentId, req, res, raw ? JSON.parse(raw) : undefined);
      } catch {
        return res.headersSent ? void res.end() : send(res, 400, "bad request");
      }
    }

    // Lets a phone add HQ to its Home Screen: the icon opens HQ's link, token included.
    if (url.pathname === "/manifest.webmanifest") {
      const token = url.searchParams.get("token") ?? "";
      if (!safeEqual(token, o.browserToken)) return send(res, 401, "unauthorized");
      const manifest = {
        name: "Matt HQ",
        short_name: "Matt HQ",
        start_url: `/?token=${token}`,
        display: "standalone",
        background_color: "#1d2b53",
        theme_color: "#1d2b53",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      };
      return send(res, 200, JSON.stringify(manifest), "application/manifest+json");
    }

    if (url.pathname === "/api/health") return send(res, 200, JSON.stringify({ ok: true }), "application/json");

    if (req.method === "GET" && o.distDir) {
      const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
      let file = join(o.distDir, rel);
      if (!file.startsWith(o.distDir) || !existsSync(file) || statSync(file).isDirectory()) file = join(o.distDir, "index.html");
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      return void createReadStream(file).pipe(res);
    }
    send(res, 404, "not found");
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const origin = req.headers.origin ?? "";
    const token = url.searchParams.get("token") ?? "";
    // Token + origin: another website in your browser can't drive HQ.
    if (url.pathname !== "/ws" || !safeEqual(token, o.browserToken) || (origin && !o.allowedOrigins.includes(origin))) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => onClient(ws, url.searchParams.get("project")));
  });

  /** Each browser sees one project at a time; its commands go to that project. */
  function onClient(ws: WebSocket, wanted: string | null) {
    const sendEvent = (e: OfficeEvent) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(e));
    let current: ProjectRuntime | null = null;
    let unsub = () => {};
    const select = (id: string | null) => {
      unsub();
      current = (id && o.projects.runtimes.get(id)) || o.projects.runtimes.get(o.projects.summaries()[0]?.id ?? "") || null;
      unsub = current ? current.hub.subscribe(sendEvent) : () => {};
      sendEvent({ type: "project.selected", id: current?.id ?? null });
      if (current) sendEvent({ type: "snapshot", snapshot: current.hub.snap });
    };
    const fail = (err: unknown) => sendEvent({ type: "project.error", text: err instanceof Error ? err.message : String(err) });

    sendEvent(o.projects.event());
    select(wanted);
    const offProjects = o.projects.subscribe((e) => {
      sendEvent(e);
      // Its project was removed (maybe from another tab), or the first one was added.
      if (current ? !o.projects.runtimes.has(current.id) : o.projects.runtimes.size) select(null);
    });

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { cmd?: string; args?: unknown[] };
        const args = Array.isArray(msg.args) ? msg.args : [];
        const arg = typeof args[0] === "string" ? args[0].slice(0, 4096) : "";
        if (msg.cmd === "selectProject") return select(arg);
        if (msg.cmd === "addProject") {
          const rt = await o.projects.add(arg).catch(fail);
          if (rt) select(rt.id);
          return;
        }
        if (msg.cmd === "removeProject") {
          try {
            o.projects.remove(arg);
          } catch (err) {
            fail(err);
          }
          return;
        }
        const fn = msg.cmd ? current?.commands[msg.cmd] : undefined;
        if (!fn) return log.warn("unknown command", msg.cmd);
        await fn(...args);
      } catch (err) {
        log.warn("command failed:", err instanceof Error ? err.message : err);
      }
    });
    ws.on("close", () => {
      unsub();
      offProjects();
    });
  }

  return new Promise<typeof server>((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.port, "127.0.0.1", () => resolve(server));
  });
}
