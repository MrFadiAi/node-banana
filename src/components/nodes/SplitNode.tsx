"use client";

import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { SplitNodeData } from "@/types";

type SplitNodeType = Node<SplitNodeData, "splitNode">;

export function SplitNode({ id, data, selected }: NodeProps<SplitNodeType>) {
    const nodeData = data;

    return (
        <BaseNode
            id={id}
            title="Auto Split Grid"
            selected={selected}
            hasError={nodeData.status === "error"}
        >
            <div className="p-4 flex flex-col items-center justify-center gap-2 min-h-[100px]">
                {nodeData.status === "loading" ? (
                    <div className="flex flex-col items-center gap-2 text-neutral-400">
                        <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-xs">Splitting Grid...</span>
                    </div>
                ) : nodeData.status === "complete" ? (
                    <div className="flex flex-col items-center gap-2 text-green-500">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-xs">Done!</span>
                    </div>
                ) : nodeData.status === "error" ? (
                    <div className="flex flex-col items-center gap-2 text-red-400">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                        <span className="text-[10px] text-center">{nodeData.error || "Failed"}</span>
                    </div>
                ) : (
                    <div className="text-neutral-500 text-xs text-center">
                        Connect Grid Image<br />& Run Workflow
                    </div>
                )}
            </div>

            <Handle
                type="target"
                position={Position.Left}
                id="image"
                data-handletype="image"
            />
            <Handle
                type="source"
                position={Position.Right}
                id="image"
                data-handletype="image"
            />
        </BaseNode>
    );
}
