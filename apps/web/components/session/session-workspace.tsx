"use client";

import { useCallback, useState } from "react";
import {
  CaptionsIcon,
  LibraryIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { ContextPanel } from "./context-panel";
import { ControlBar } from "./control-bar";
import { ConversationPanel } from "./conversation-panel";
import { CopilotPanel } from "./copilot-panel";
import { SessionHeader } from "./session-header";
import { SessionStoreProvider, useSession } from "./session-store-provider";
import { SetupPanel } from "./setup-panel";

type WorkspacePanel = "conversation" | "copilot" | "context";

export function SessionWorkspace() {
  return (
    <SessionStoreProvider>
      <Workspace />
    </SessionStoreProvider>
  );
}

/**
 * Layout follows PRD §11: live conversation in the middle, document context
 * and the response copilot beside it, controls pinned to the bottom.
 * xl: three columns · lg: conversation + switchable side column · mobile: tabs.
 */
function Workspace() {
  const [panel, setPanel] = useState<WorkspacePanel>("conversation");
  const inSetup = useSession((state) => state.startedAt === null);
  const suggestionCount = useSession((state) => state.suggestionOrder.length);
  const documentCount = useSession((state) => state.documents.length);
  const selectSuggestion = useSession((state) => state.selectSuggestion);

  const showSuggestion = useCallback(
    (suggestionId: string) => {
      selectSuggestion(suggestionId);
      setPanel("copilot");
    },
    [selectSuggestion],
  );
  const openContext = useCallback(() => setPanel("context"), []);

  const tabs: PanelTab[] = [
    { value: "conversation", label: "Conversation", icon: CaptionsIcon },
    { value: "copilot", label: "Copilot", icon: SparklesIcon, count: suggestionCount },
    { value: "context", label: "Context", icon: LibraryIcon, count: documentCount },
  ];
  const sideTabs = tabs.slice(1);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <SessionHeader />
      <PanelTabs tabs={tabs} value={panel} onChange={setPanel} className="lg:hidden" />

      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[300px_minmax(0,1fr)_400px] 2xl:grid-cols-[340px_minmax(0,1fr)_460px]">
        <aside
          aria-label="Context documents"
          className={cn(
            "min-h-0 flex-col bg-muted/20 lg:col-start-2 lg:row-start-1 lg:border-l xl:col-start-1 xl:border-r xl:border-l-0",
            panel === "context" ? "flex lg:flex" : "hidden lg:hidden",
            "xl:flex",
          )}
        >
          <PanelTabs tabs={sideTabs} value="context" onChange={setPanel} className="hidden border-b lg:flex xl:hidden" />
          <ContextPanel />
        </aside>

        <section
          aria-label="Conversation"
          className={cn(
            "min-h-0 flex-col lg:col-start-1 lg:row-start-1 xl:col-start-2",
            panel === "conversation" ? "flex" : "hidden",
            "lg:flex",
          )}
        >
          {inSetup ? (
            <SetupPanel onOpenContext={openContext} />
          ) : (
            <ConversationPanel onShowSuggestion={showSuggestion} />
          )}
        </section>

        <aside
          aria-label="Response copilot"
          className={cn(
            "min-h-0 flex-col border-l bg-muted/20 lg:col-start-2 lg:row-start-1 xl:col-start-3",
            panel === "copilot" ? "flex" : "hidden",
            panel === "context" ? "lg:hidden" : "lg:flex",
            "xl:flex",
          )}
        >
          <PanelTabs tabs={sideTabs} value="copilot" onChange={setPanel} className="hidden border-b lg:flex xl:hidden" />
          <CopilotPanel />
        </aside>
      </main>

      {inSetup ? null : <ControlBar />}
    </div>
  );
}

interface PanelTab {
  value: WorkspacePanel;
  label: string;
  icon: LucideIcon;
  count?: number;
}

function PanelTabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: PanelTab[];
  value: WorkspacePanel;
  onChange: (panel: WorkspacePanel) => void;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label="Workspace panels" className={cn("flex shrink-0 gap-1 border-b bg-background px-2 py-1.5", className)}>
      {tabs.map(({ value: tabValue, label, icon: Icon, count }) => {
        const selected = value === tabValue;
        return (
          <button
            key={tabValue}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tabValue)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selected ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
            {count ? (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] leading-4 text-primary tabular-nums">
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
