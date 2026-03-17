/**
 * Advanced Bootstrap Hook Handler
 *
 * Configurable bootstrap content injection with per-agent filtering.
 *
 * Features:
 * - Include syntax: {{include:path}}
 * - Config-driven sources from hooks.internal.entries["advanced-bootstrap"]
 * - Per-source exclude/include filters for agent-specific content
 * - Date templates: {date}, {yesterday}, {tomorrow}, {date-N}, {date+N}, {date:format}
 */

import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";

const SHARED_BASE = path.join(process.env.HOME || "~", ".openclaw", "shared");

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface SourceConfig {
  path: string;
  mode: "prepend" | "append";
  exclude?: string[];
  include?: string[];
}

interface AdvancedBootstrapConfig {
  enabled: boolean;
  sources: SourceConfig[];
}

interface BootstrapFile {
  path: string;
  content: string;
}

interface HookEvent {
  type: string;
  action: string;
  sessionKey?: string;
  context: {
    bootstrapFiles?: BootstrapFile[];
    workspaceDir?: string;
    cfg?: {
      hooks?: {
        internal?: {
          entries?: {
            "advanced-bootstrap"?: AdvancedBootstrapConfig;
          };
        };
      };
    };
  };
}

type HookHandler = (event: HookEvent) => Promise<void> | void;

// -----------------------------------------------------------------------------
// Agent Filtering
// -----------------------------------------------------------------------------

function extractAgentId(sessionKey?: string): string | null {
  const match = sessionKey?.match(/^agent:([^:]+)/);
  return match ? match[1] : null;
}

function shouldApplySource(source: SourceConfig, agentId: string | null): boolean {
  if (!agentId) return true;
  if (source.exclude?.includes(agentId)) return false;
  if (source.include && !source.include.includes(agentId)) return false;
  return true;
}

// -----------------------------------------------------------------------------
// Date Templates
// -----------------------------------------------------------------------------

function formatDate(date: Date, format: string): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return format
    .replace(/YYYY/gi, String(year))
    .replace(/MM/g, month)
    .replace(/DD/gi, day);
}

function resolveDateTemplates(pathTemplate: string): string {
  const now = new Date();

  const getDateWithOffset = (offsetDays: number): Date => {
    const d = new Date(now);
    d.setDate(d.getDate() + offsetDays);
    return d;
  };

  return pathTemplate.replace(
    /\{(date|today|yesterday|tomorrow)([-+]?\d+)?(?::([^}]+))?\}/g,
    (match, base, offset, format) => {
      let baseOffset = 0;

      switch (base) {
        case "yesterday":
          baseOffset = -1;
          break;
        case "tomorrow":
          baseOffset = 1;
          break;
      }

      const offsetNum = offset ? parseInt(offset, 10) : 0;
      const targetDate = getDateWithOffset(baseOffset + offsetNum);

      return formatDate(targetDate, format || "yyyy-MM-dd");
    }
  );
}

// -----------------------------------------------------------------------------
// Path Resolution & Includes
// -----------------------------------------------------------------------------

function resolvePathTemplate(
  pathTemplate: string,
  agentId: string | null,
  workspaceDir: string | null
): string {
  let resolved = pathTemplate;

  if (agentId) resolved = resolved.replace(/{agentId}/g, agentId);
  if (workspaceDir) resolved = resolved.replace(/{workspace}/g, workspaceDir);

  return resolveDateTemplates(resolved);
}

function resolveIncludePath(includePath: string): string {
  let resolved = includePath.replace(/^~\//, "");
  resolved = resolveDateTemplates(resolved);
  return path.join(SHARED_BASE, resolved);
}

function processIncludes(content: string | undefined | null): string {
  if (!content) return "";

  return content.replace(/\{\{include:([^}]+)\}\}/g, (match, includePath) => {
    const resolvedPath = resolveIncludePath(includePath.trim());

    if (fs.existsSync(resolvedPath)) {
      return fs.readFileSync(resolvedPath, "utf-8");
    }
    return `<!-- Include failed: ${includePath} (file not found) -->`;
  });
}

function expandGlob(pattern: string): string[] {
  try {
    const expandedPattern = pattern.replace(/^~\//, process.env.HOME + "/");

    if (pattern.includes("*") || pattern.includes("?")) {
      return glob.sync(expandedPattern, { nodir: true });
    }

    const resolvedPath = pattern.replace(/^~\//, process.env.HOME + "/");
    return fs.existsSync(resolvedPath) ? [resolvedPath] : [];
  } catch {
    return [];
  }
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

const handler: HookHandler = async (event) => {
  if (event.type !== "agent" || event.action !== "bootstrap") {
    return;
  }

  const config = event.context.cfg?.hooks?.internal?.entries?.["advanced-bootstrap"];
  if (!config?.enabled) {
    return;
  }

  const sources = config.sources || [];
  const agentId = extractAgentId(event.sessionKey);
  const workspaceDir = event.context.workspaceDir || null;

  if (!event.context.bootstrapFiles) {
    event.context.bootstrapFiles = [];
  }

  const loadedFiles: string[] = [];

  // Phase 1: Process includes in existing bootstrap files
  for (const file of event.context.bootstrapFiles) {
    if (file.content !== undefined) {
      file.content = processIncludes(file.content);
    }
  }

  // Phase 2: Inject config-driven sources with agent filtering
  for (const source of sources) {
    if (!shouldApplySource(source, agentId)) {
      continue;
    }

    const resolvedPath = resolvePathTemplate(source.path, agentId, workspaceDir);
    const files = expandGlob(resolvedPath);

    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, "utf-8");
      const displayPath = filePath.replace(process.env.HOME || "", "~");

      loadedFiles.push(`${source.mode === "prepend" ? "↑" : "↓"} ${displayPath}`);

      const virtualFile: BootstrapFile = {
        path: `advanced-bootstrap:${filePath}`,
        content: `<!-- Source: ${displayPath} -->\n${content}`,
      };

      if (source.mode === "prepend") {
        event.context.bootstrapFiles.unshift(virtualFile);
      } else {
        event.context.bootstrapFiles.push(virtualFile);
      }
    }
  }

  // Log loaded files
  if (loadedFiles.length > 0) {
    console.log(`[advanced-bootstrap] Loaded ${loadedFiles.length} files for agent "${agentId || "unknown"}":`);
    for (const f of loadedFiles) {
      console.log(`  ${f}`);
    }
  }
};

export default handler;