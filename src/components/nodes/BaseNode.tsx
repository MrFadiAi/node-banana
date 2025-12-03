"use client";

import { ReactNode } from "react";
import { NodeResizer } from "@xyflow/react";
import { useWorkflowStore } from "@/store/workflowStore";

interface BaseNodeProps {
  id: string;
  title: string;
  children: ReactNode;
  selected?: boolean;
  isExecuting?: boolean;
  hasError?: boolean;
  className?: string;
  minWidth?: number;
  minHeight?: number;
}

export function BaseNode({
  id,
  title,
  children,
  selected = false,
  isExecuting = false,
  hasError = false,
  className = "",
  minWidth = 180,
  minHeight = 100,
}: BaseNodeProps) {
  const currentNodeId = useWorkflowStore((state) => state.currentNodeId);
  const isCurrentlyExecuting = currentNodeId === id;

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={minWidth}
        minHeight={minHeight}
        lineClassName="!border-transparent"
        handleClassName="!w-0 !h-0 !opacity-0"
      />
      <div
        className={`
          bg-neutral-800 rounded-md shadow-lg border h-full w-full
          ${isCurrentlyExecuting || isExecuting ? "border-blue-500 ring-1 ring-blue-500/20" : "border-neutral-700"}
          ${hasError ? "border-red-500" : ""}
          ${selected ? "border-neutral-400 ring-1 ring-neutral-400/30" : ""}
          ${className}
        `}
      >
        <div className="px-3 pt-2 pb-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</span>
        </div>
        <div className="px-3 pb-4 h-[calc(100%-28px)] overflow-hidden flex flex-col">{children}</div>
      </div>
    </>
  );
}
