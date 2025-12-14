"use client";

import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { Make32NodeData } from "@/types";

type Make32NodeType = Node<Make32NodeData, "make32Node">;

export function Make32Node({ id, data, selected }: NodeProps<Make32NodeType>) {
    const nodeData = data;

    return (
        <BaseNode
            id={id}
            title="Make 3:2"
            selected={selected}
            hasError={nodeData.status === "error"}
        >
            <div className="relative w-full h-[160px] bg-neutral-900 group flex flex-col items-center justify-center p-4">
                {/* 3:2 Icon */}
                <div className={`w-24 h-16 border-2 border-dashed ${nodeData.status === 'loading' ? 'border-blue-500 animate-pulse' : 'border-neutral-600'} rounded-lg flex items-center justify-center mb-2 relative`}>
                    <span className="text-neutral-500 font-bold text-sm">3:2</span>
                    {/* Arrows indicating expansion */}
                    <div className="absolute -left-3 top-1/2 -translate-y-1/2">
                        <svg className="w-4 h-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </div>
                    <div className="absolute -right-3 top-1/2 -translate-y-1/2 rotate-180">
                        <svg className="w-4 h-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </div>
                </div>

                {/* Status Text */}
                <div className="text-center">
                    {nodeData.status === "loading" ? (
                        <span className="text-blue-400 text-xs animate-pulse">Expanding...</span>
                    ) : nodeData.status === "complete" ? (
                        <span className="text-green-500 text-xs">Done</span>
                    ) : nodeData.status === "error" ? (
                        <span className="text-red-400 text-xs">Error</span>
                    ) : (
                        <span className="text-neutral-500 text-xs">Connect Images</span>
                    )}
                </div>

                {/* Error Overlay */}
                {nodeData.status === "error" && (
                    <div className="absolute inset-0 bg-red-900/80 flex items-center justify-center p-2 rounded">
                        <p className="text-white text-xs text-center">{nodeData.error || "Generation Failed"}</p>
                    </div>
                )}
            </div>

            <Handle
                type="target"
                position={Position.Left}
                id="image"
                data-handletype="image"
                className="!bg-green-500"
            />
            <Handle
                type="source"
                position={Position.Right}
                id="image"
                data-handletype="image"
                className="!bg-green-500"
            />
        </BaseNode>
    );
}
