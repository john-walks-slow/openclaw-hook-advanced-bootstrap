/**
 * Advanced Bootstrap Hook Handler
 *
 * Configurable bootstrap content injection with per-agent filtering.
 *
 * Features:
 * - Include syntax: {{include:path}}
 * - Config-driven sources from hooks.internal.entries["advanced-bootstrap"]
 * - Per-agent requires.yaml for include/exclude/prompts declarations
 * - ignore_defaults to skip global sources
 * - Per-item mode control (prepend/append)
 * - Inline prompts support
 * - Date templates: {date}, {yesterday}, {tomorrow}, {date-N}, {date+N}, {date:format}
 */

import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";

const SHARED_BASE = path.join(process.env.HOME || "~", ".openclaw", "shared");

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type SourceMode = "prepend" | "append";

interface SourceConfig {
  path: string;
  mode: SourceMode;
  exclude?: string[];
  include?: string[];
}

interface IncludeItem {
  path: string;
  mode?: SourceMode;  // default: append
}

interface PromptItem {
  text: string;
  mode?: SourceMode;  // default: append
}

interface LocalBootstrapConfig {
  ignore_defaults?: boolean;
  include?: (string | IncludeItem)[];
  exclude?: string[];
  prompts?: (string | PromptItem)[];
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

function shouldApplySource(
  source: SourceConfig,
  agentId: string | null,
  localConfig: LocalBootstrapConfig | null
): boolean {
  // 本地 exclude 优先
  if (localConfig?.exclude?.some(pattern => matchesPattern(source.path, pattern))) {
    return false;
  }

  // 全局 exclude/include
  if (!agentId) return true;
  if (source.exclude?.includes(agentId)) return false;
  if (source.include && !source.include.includes(agentId)) return false;
  return true;
}

function matchesPattern(sourcePath: string, pattern: string): boolean {
  if (pattern.includes("*") || pattern.includes("?")) {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
    return regex.test(sourcePath);
  }
  return sourcePath.includes(pattern);
}

// -----------------------------------------------------------------------------
// requires.yaml (Agent Local Config)
// -----------------------------------------------------------------------------

function loadLocalBootstrapConfig(workspaceDir: string | null): LocalBootstrapConfig | null {
  if (!workspaceDir) return null;

  const yamlPath = path.join(workspaceDir, "requires.yaml");
  const ymlPath = path.join(workspaceDir, "requires.yml");
  const configPath = fs.existsSync(yamlPath) ? yamlPath : (fs.existsSync(ymlPath) ? ymlPath : null);

  if (!configPath) return null;

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return parseBootstrapYaml(content);
  } catch (e: any) {
    console.error(`[advanced-bootstrap] Failed to parse ${configPath}:`, e.message);
    return null;
  }
}

function parseBootstrapYaml(content: string): LocalBootstrapConfig {
  const result: LocalBootstrapConfig = { ignore_defaults: false, include: [], exclude: [], prompts: [] };
  let currentSection: "include" | "exclude" | "prompts" | null = null;
  let currentItem: any = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (trimmed.startsWith("#") || !trimmed) {
      continue;
    }

    // Top-level keys
    if (trimmed === "ignore_defaults: true" || trimmed === "ignore_defaults:true") {
      result.ignore_defaults = true;
      continue;
    }
    if (trimmed === "ignore_defaults: false" || trimmed === "ignore_defaults:false") {
      result.ignore_defaults = false;
      continue;
    }

    // Section headers
    if (trimmed === "include:" || trimmed === "exclude:" || trimmed === "prompts:") {
      currentSection = trimmed.replace(":", "") as "include" | "exclude" | "prompts";
      currentItem = null;
      continue;
    }

    // Array items
    if (trimmed.startsWith("- ") && currentSection) {
      const value = trimmed.slice(2).trim();

      if (currentSection === "exclude") {
        result.exclude!.push(value.replace(/["']/g, ""));
      } else if (currentSection === "include") {
        // Could be string or object
        if (value.startsWith("path:")) {
          // Start of object
          currentItem = { path: value.slice(5).trim() };
        } else if (value.startsWith("mode:")) {
          // mode line in object
          if (currentItem) {
            currentItem.mode = value.slice(5).trim();
          }
        } else {
          // Plain string
          result.include!.push(value.replace(/["']/g, ""));
        }
      } else if (currentSection === "prompts") {
        // Could be string or object with text:/mode:
        if (value.startsWith("text:")) {
          currentItem = { text: value.slice(5).trim() };
        } else if (value.startsWith("mode:")) {
          if (currentItem) {
            currentItem.mode = value.slice(5).trim();
          }
        } else {
          // Plain string (inline text)
          result.prompts!.push(value);
        }
      }
      continue;
    }

    // Handle multiline text (prompts with |)
    if (currentSection === "prompts" && currentItem && line.startsWith("      ")) {
      currentItem.text += "\n" + line.trim();
    }
  }

  // Finalize last item
  // (handled inline now)

  return result;
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
      const files = glob.sync(expandedPattern, { nodir: true });
      return files.sort(); // 按文件名正序排序
    }

    const resolvedPath = pattern.replace(/^~\//, process.env.HOME + "/");
    return fs.existsSync(resolvedPath) ? [resolvedPath] : [];
  } catch {
    return [];
  }
}

// -----------------------------------------------------------------------------
// Helper: Normalize include item
// -----------------------------------------------------------------------------

function normalizeIncludeItem(item: string | IncludeItem): { path: string; mode: SourceMode } {
  if (typeof item === "string") {
    return { path: item, mode: "append" };
  }
  return { path: item.path, mode: item.mode || "append" };
}

function normalizePromptItem(item: string | PromptItem): { text: string; mode: SourceMode } {
  if (typeof item === "string") {
    return { text: item, mode: "append" };
  }
  return { text: item.text, mode: item.mode || "append" };
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

  const globalSources = config.sources || [];
  const agentId = extractAgentId(event.sessionKey);
  const workspaceDir = event.context.workspaceDir || null;

  // 加载本地 requires.yaml
  const localConfig = loadLocalBootstrapConfig(workspaceDir);

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

  // Phase 2: Build sources list
  let sources: SourceConfig[] = [];

  // 全局 sources（除非 ignore_defaults）
  if (!localConfig?.ignore_defaults) {
    sources = [...globalSources];
  }

  // 本地 include
  if (localConfig?.include?.length) {
    for (const item of localConfig.include) {
      const normalized = normalizeIncludeItem(item);
      sources.push({ path: normalized.path, mode: normalized.mode });
    }
  }

  // Phase 3: Inject sources with agent filtering
  for (const source of sources) {
    if (!shouldApplySource(source, agentId, localConfig || null)) {
      continue;
    }

    const resolvedPath = resolvePathTemplate(source.path, agentId, workspaceDir);
    const files = expandGlob(resolvedPath);

    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, "utf-8");
      const displayPath = filePath.replace(process.env.HOME || "", "~");
      const sourceType = source.path.startsWith("{workspace}") ? "local" : "global";

      loadedFiles.push(`${source.mode === "prepend" ? "↑" : "↓"} ${displayPath} (${sourceType})`);

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

  // Phase 4: Inject inline prompts
  if (localConfig?.prompts?.length) {
    for (const item of localConfig.prompts) {
      const normalized = normalizePromptItem(item);

      loadedFiles.push(`${normalized.mode === "prepend" ? "↑" : "↓"} [inline prompt]`);

      const virtualFile: BootstrapFile = {
        path: `advanced-bootstrap:inline-prompt`,
        content: normalized.text,
      };

      if (normalized.mode === "prepend") {
        event.context.bootstrapFiles.unshift(virtualFile);
      } else {
        event.context.bootstrapFiles.push(virtualFile);
      }
    }
  }

  // Log loaded files
  if (loadedFiles.length > 0) {
    console.log(`[advanced-bootstrap] Loaded ${loadedFiles.length} items for agent "${agentId || "unknown"}":`);
    for (const f of loadedFiles) {
      console.log(`  ${f}`);
    }
  }
};

export default handler;