import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeEntry, readEntry, listTopics, getMemoryRoot, ensureDir } from "../memory/store.js";

export function registerSessionTools(server: McpServer): void {

  server.registerTool(
    "checkpoint",
    {
      title: "Checkpoint setzen",
      description:
        "Speichert den aktuellen Arbeitsstand. Rufe dies nach jedem bedeutenden Schritt auf " +
        "(Feature fertig, Refactoring abgeschlossen, Bug gefixt). " +
        "Wird unter 'current-task' gespeichert und bei der nächsten Session geladen.",
      inputSchema: z.object({
        summary: z.string().describe("Kurze Beschreibung was gemacht wurde"),
        nextSteps: z.array(z.string()).optional().describe("Geplante nächste Schritte"),
        blockers: z.array(z.string()).optional().describe("Aktuelle Blocker oder offene Fragen"),
      }),
    },
    async ({ summary, nextSteps, blockers }) => {
      await ensureDir(getMemoryRoot());
      const now = new Date().toISOString();

      const lines: string[] = [
        `## Checkpoint — ${now}`,
        "",
        `### Stand`,
        summary,
      ];

      if (nextSteps?.length) {
        lines.push("", "### Nächste Schritte");
        nextSteps.forEach((s) => lines.push(`- ${s}`));
      }

      if (blockers?.length) {
        lines.push("", "### Blocker / Offene Fragen");
        blockers.forEach((b) => lines.push(`- ${b}`));
      }

      // Checkpoint an bestehende current-task anhängen
      const existing = await readEntry("current-task");
      const newContent = existing
        ? `${existing.content}\n\n---\n\n${lines.join("\n")}`
        : lines.join("\n");

      await writeEntry("current-task", newContent, ["session", "checkpoint"]);

      return {
        content: [{ type: "text", text: `Checkpoint gespeichert (${now}).` }],
      };
    }
  );

  server.registerTool(
    "session_summary",
    {
      title: "Session zusammenfassen",
      description:
        "Erstellt eine komprimierte Zusammenfassung der Session und archiviert sie. " +
        "Rufe dies am Ende einer Arbeitssession auf, bevor der Context voll wird.",
      inputSchema: z.object({
        accomplishments: z.array(z.string()).describe("Was wurde erreicht"),
        decisions: z.array(z.string()).optional().describe("Getroffene Entscheidungen"),
        nextSession: z.string().optional().describe("Womit soll die nächste Session beginnen"),
      }),
    },
    async ({ accomplishments, decisions, nextSession }) => {
      await ensureDir(getMemoryRoot());
      const now = new Date().toISOString();
      const dateStr = new Date().toLocaleDateString("de-DE");

      const lines: string[] = [
        `## Session ${dateStr}`,
        "",
        "### Erreicht",
        ...accomplishments.map((a) => `- ${a}`),
      ];

      if (decisions?.length) {
        lines.push("", "### Entscheidungen");
        decisions.forEach((d) => lines.push(`- ${d}`));
      }

      if (nextSession) {
        lines.push("", "### Start nächste Session", nextSession);
      }

      const summaryContent = lines.join("\n");

      // In sessions/DATUM speichern
      const sessionKey = `sessions/${dateStr.replace(/\./g, "-")}`;
      await writeEntry(sessionKey, summaryContent, ["session", "summary"]);

      // current-task resetten auf nächsten Start
      if (nextSession) {
        await writeEntry("current-task", `## Nächster Start\n\n${nextSession}`, ["session", "next"]);
      }

      return {
        content: [
          {
            type: "text",
            text: `Session zusammengefasst und unter '${sessionKey}' gespeichert.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "memory_diff",
    {
      title: "Memory-Änderungen anzeigen",
      description:
        "Zeigt welche Memory-Einträge sich seit einem Zeitpunkt geändert haben. Standard: letzte 24 Stunden.",
      inputSchema: z.object({
        since: z.string().optional().describe("ISO-Datum als Startpunkt, z.B. '2025-01-15T00:00:00Z'. Standard: vor 24 Stunden."),
      }),
    },
    async ({ since }) => {
      await ensureDir(getMemoryRoot());
      const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const topics = await listTopics();

      const changed: { topic: string; updated: string }[] = [];

      for (const topic of topics) {
        const entry = await readEntry(topic);
        if (entry && new Date(entry.meta.updated) >= sinceDate) {
          changed.push({ topic, updated: entry.meta.updated });
        }
      }

      changed.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

      if (changed.length === 0) {
        return {
          content: [{ type: "text", text: `Keine Änderungen seit ${sinceDate.toISOString()}.` }],
        };
      }

      const lines = changed.map((c) => `- **${c.topic}** — ${c.updated}`);
      return {
        content: [
          {
            type: "text",
            text: `Geänderte Einträge seit ${sinceDate.toISOString()}:\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );
}
