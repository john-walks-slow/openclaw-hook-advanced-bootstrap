"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const glob_1 = require("glob");
const SHARED_BASE = path.join(process.env.HOME || "~", ".openclaw", "shared");
// -----------------------------------------------------------------------------
// Agent Filtering
// -----------------------------------------------------------------------------
function extractAgentId(sessionKey) {
    const match = sessionKey?.match(/^agent:([^:]+)/);
    return match ? match[1] : null;
}
function shouldApplySource(source, agentId) {
    if (!agentId)
        return true;
    if (source.exclude?.includes(agentId))
        return false;
    if (source.include && !source.include.includes(agentId))
        return false;
    return true;
}
// -----------------------------------------------------------------------------
// Date Templates
// -----------------------------------------------------------------------------
function formatDate(date, format) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return format
        .replace(/YYYY/gi, String(year))
        .replace(/MM/g, month)
        .replace(/DD/gi, day);
}
function resolveDateTemplates(pathTemplate) {
    const now = new Date();
    const getDateWithOffset = (offsetDays) => {
        const d = new Date(now);
        d.setDate(d.getDate() + offsetDays);
        return d;
    };
    return pathTemplate.replace(/\{(date|today|yesterday|tomorrow)([-+]?\d+)?(?::([^}]+))?\}/g, (match, base, offset, format) => {
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
    });
}
// -----------------------------------------------------------------------------
// Path Resolution & Includes
// -----------------------------------------------------------------------------
function resolvePathTemplate(pathTemplate, agentId, workspaceDir) {
    let resolved = pathTemplate;
    if (agentId)
        resolved = resolved.replace(/{agentId}/g, agentId);
    if (workspaceDir)
        resolved = resolved.replace(/{workspace}/g, workspaceDir);
    return resolveDateTemplates(resolved);
}
function resolveIncludePath(includePath) {
    let resolved = includePath.replace(/^~\//, "");
    resolved = resolveDateTemplates(resolved);
    return path.join(SHARED_BASE, resolved);
}
function processIncludes(content) {
    if (!content)
        return "";
    return content.replace(/\{\{include:([^}]+)\}\}/g, (match, includePath) => {
        const resolvedPath = resolveIncludePath(includePath.trim());
        if (fs.existsSync(resolvedPath)) {
            return fs.readFileSync(resolvedPath, "utf-8");
        }
        return `<!-- Include failed: ${includePath} (file not found) -->`;
    });
}
function expandGlob(pattern) {
    try {
        const expandedPattern = pattern.replace(/^~\//, process.env.HOME + "/");
        if (pattern.includes("*") || pattern.includes("?")) {
            return glob_1.glob.sync(expandedPattern, { nodir: true });
        }
        const resolvedPath = pattern.replace(/^~\//, process.env.HOME + "/");
        return fs.existsSync(resolvedPath) ? [resolvedPath] : [];
    }
    catch {
        return [];
    }
}
// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------
const handler = async (event) => {
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
    const loadedFiles = [];
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
            if (!fs.existsSync(filePath))
                continue;
            const content = fs.readFileSync(filePath, "utf-8");
            const displayPath = filePath.replace(process.env.HOME || "", "~");
            loadedFiles.push(`${source.mode === "prepend" ? "↑" : "↓"} ${displayPath}`);
            const virtualFile = {
                path: `advanced-bootstrap:${filePath}`,
                content: `<!-- Source: ${displayPath} -->\n${content}`,
            };
            if (source.mode === "prepend") {
                event.context.bootstrapFiles.unshift(virtualFile);
            }
            else {
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
exports.default = handler;
