import type { ToolDefinition } from "@opencode-ai/plugin";
import type { OhMyOpenCodeConfig } from "../config";
import type { Managers } from "../create-managers";
import type { PluginContext } from "./types";
import type { ToolRegistryFactories } from "./tool-registry-factories";

import { isTaskSystemEnabled } from "../shared";
import { createSecondBrainTools } from "../tools/second-brain";
import { createLocalWebSearchTool } from "../tools/web-search-local";
import { createWebCache, DEFAULT_WEB_CACHE_TTL_MINUTES } from "../tools/web-search-local/web-cache";

export function createTaskToolsRecord(args: {
  readonly taskSystemEnabled: boolean;
  readonly pluginConfig: OhMyOpenCodeConfig;
  readonly ctx: PluginContext;
  readonly factories: ToolRegistryFactories;
}): Record<string, ToolDefinition> {
  const { taskSystemEnabled, pluginConfig, ctx, factories } = args;
  if (!taskSystemEnabled) return {};

  return {
    task_create: factories.createTaskCreateTool(pluginConfig, ctx),
    task_get: factories.createTaskGetTool(pluginConfig),
    task_list: factories.createTaskList(pluginConfig),
    task_update: factories.createTaskUpdateTool(pluginConfig, ctx),
  };
}

export function createHashlineToolsRecord(args: {
  readonly pluginConfig: OhMyOpenCodeConfig;
  readonly ctx: PluginContext;
  readonly factories: ToolRegistryFactories;
}): Record<string, ToolDefinition> {
  const { pluginConfig, ctx, factories } = args;
  return pluginConfig.hashline_edit ? { edit: factories.createHashlineEditTool(ctx) } : {};
}

export function createMonitorToolsRecord(args: {
  readonly pluginConfig: OhMyOpenCodeConfig;
  readonly ctx: PluginContext;
  readonly managers: Pick<Managers, "monitorManager">;
  readonly factories: ToolRegistryFactories;
}): Record<string, ToolDefinition> {
  const { pluginConfig, ctx, managers, factories } = args;
  if (!pluginConfig.monitor?.enabled || !managers.monitorManager) return {};
  return factories.createMonitorTools(managers.monitorManager, Object.assign({}, ctx, { pluginConfig }));
}

export function getTaskSystemEnabled(pluginConfig: OhMyOpenCodeConfig): boolean {
  return isTaskSystemEnabled(pluginConfig);
}

export function createWebSearchToolsRecord(args: {
  readonly pluginConfig: OhMyOpenCodeConfig;
  readonly ctx: PluginContext;
}): Record<string, ToolDefinition> {
  const { pluginConfig, ctx } = args;
  if (pluginConfig.websearch?.prefer_local !== true) return {};
  const cacheConfig = pluginConfig.websearch?.local?.cache;
  const cache = cacheConfig?.enabled === true ? createWebCache(ctx.directory, cacheConfig.ttl_minutes ?? DEFAULT_WEB_CACHE_TTL_MINUTES) : undefined;
  return {
    web_search: createLocalWebSearchTool(ctx, {
      config: pluginConfig.websearch?.local,
      browser: pluginConfig.websearch?.local?.browser ?? "auto",
      cache,
      llmCall: async (_prompt: string) => {
        throw new Error("heuristic fallback");
      },
    }),
  };
}

export function createSecondBrainToolsRecord(args: {
  readonly pluginConfig: OhMyOpenCodeConfig;
  readonly ctx: PluginContext;
}): Record<string, ToolDefinition> {
  const { pluginConfig, ctx } = args;
  if (pluginConfig.second_brain?.enabled !== true) return {};
  return createSecondBrainTools(ctx, pluginConfig.second_brain);
}
