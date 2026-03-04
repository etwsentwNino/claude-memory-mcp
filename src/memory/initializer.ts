import fs from "fs/promises";
import path from "path";
import { writeEntry, getMemoryRoot, ensureDir } from "./store.js";

interface ProjectInfo {
  type: string;
  framework?: string;
  language: string;
  name?: string;
}

export async function detectProject(): Promise<ProjectInfo> {
  const cwd = process.cwd();

  try {
    const pkg = JSON.parse(await fs.readFile(path.join(cwd, "package.json"), "utf-8"));
    const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };

    let framework = "Node.js";
    if (deps["next"]) framework = "Next.js";
    else if (deps["react"]) framework = "React";
    else if (deps["vue"]) framework = "Vue";
    else if (deps["svelte"]) framework = "Svelte";
    else if (deps["express"] || deps["fastify"] || deps["hono"]) framework = "API Server";

    return { type: "javascript", framework, language: pkg.type === "module" ? "ESM" : "CJS", name: pkg.name };
  } catch {
    // not a JS project
  }

  try {
    await fs.access(path.join(cwd, "Cargo.toml"));
    return { type: "rust", language: "Rust" };
  } catch {
    // not a Rust project
  }

  try {
    await fs.access(path.join(cwd, "go.mod"));
    return { type: "go", language: "Go" };
  } catch {
    // not a Go project
  }

  try {
    await fs.access(path.join(cwd, "pyproject.toml"));
    return { type: "python", language: "Python" };
  } catch {
    // not a Python project
  }

  return { type: "unknown", language: "Unknown" };
}

export async function initMemory(): Promise<string[]> {
  const project = await detectProject();
  await ensureDir(getMemoryRoot());

  const created: string[] = [];

  await writeEntry(
    "architecture",
    `# Architecture\n\n**Project:** ${project.name ?? "Unknown"}\n**Type:** ${project.framework ?? project.type}\n**Language:** ${project.language}\n\n## Overview\n\n_Describe the high-level architecture here._\n\n## Key Components\n\n_List and describe main modules/components._\n\n## Data Flow\n\n_Describe how data flows through the system._`,
    ["architecture", "init"]
  );
  created.push("architecture");

  await writeEntry(
    "decisions",
    `# Architecture Decisions\n\n_Each decision: what was decided and why._\n\n## ${new Date().toLocaleDateString("de-DE")} — Initial Setup\n\n- Project initialized with claude-memory-mcp\n- Tech stack: ${project.framework ?? project.type} (${project.language})`,
    ["decisions", "init"]
  );
  created.push("decisions");

  await writeEntry(
    "current-task",
    `# Current Task\n\n_This file tracks the active work. Updated via checkpoint tool._\n\n## Status\n\nProject just initialized. No active task yet.`,
    ["session", "init"]
  );
  created.push("current-task");

  return created;
}
