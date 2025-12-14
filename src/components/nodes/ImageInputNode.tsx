"use client";

import { useCallback, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { ImageInputNodeData } from "@/types";
import { expandImage3x2 } from "@/utils/aiUtils";

type ImageInputNodeType = Node<ImageInputNodeData, "imageInput">;

export function ImageInputNode({ id, data, selected }: NodeProps<ImageInputNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isGenerating, setIsGenerating] = useState(false);

  const handleExpandImage = useCallback(async () => {
    if (!nodeData.image || isGenerating) return;

    setIsGenerating(true);
    try {
      const newImage = await expandImage3x2(nodeData.image);

      // Load image to get dimensions
      const img = new Image();
      img.onload = () => {
        updateNodeData(id, {
          image: newImage,
          dimensions: { width: img.width, height: img.height },
        });
        setIsGenerating(false);
      };
      img.src = newImage;

    } catch (error) {
      console.error("Expansion error:", error);
      alert("Failed to expand image: " + (error instanceof Error ? error.message : "Unknown error"));
      setIsGenerating(false);
    }
  }, [nodeData.image, isGenerating, id, updateNodeData]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
        alert("Unsupported format. Use PNG, JPG, or WebP.");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        alert("Image too large. Maximum size is 10MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          updateNodeData(id, {
            image: base64,
            filename: file.name,
            dimensions: { width: img.width, height: img.height },
          });
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    },
    [id, updateNodeData]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
        fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleRemove = useCallback(() => {
    updateNodeData(id, {
      image: null,
      filename: null,
      dimensions: null,
    });
  }, [id, updateNodeData]);

  return (
    <BaseNode id={id} title="Image" selected={selected}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {nodeData.image ? (
        <div className="relative group flex-1 flex flex-col min-h-0">
          <img
            src={nodeData.image}
            alt={nodeData.filename || "Uploaded image"}
            className="w-full flex-1 min-h-0 object-contain rounded"
          />

          {/* Action Buttons */}
          <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Expand Button */}
            <button
              onClick={handleExpandImage}
              disabled={isGenerating}
              className="px-2 h-5 bg-blue-600/90 hover:bg-blue-500 text-white rounded text-[10px] font-medium flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-sm backdrop-blur-sm"
              title="Expand to 3:2"
            >
              {isGenerating ? (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                "Make 3:2"
              )}
            </button>

            {/* Remove Button */}
            <button
              onClick={handleRemove}
              disabled={isGenerating}
              className="w-5 h-5 bg-black/60 hover:bg-black/80 text-white rounded flex items-center justify-center shadow-sm backdrop-blur-sm"
              title="Remove image"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-1.5 flex items-center justify-between shrink-0">
            <span className="text-[10px] text-neutral-400 truncate max-w-[120px]">
              {nodeData.filename}
            </span>
            {nodeData.dimensions && (
              <span className="text-[10px] text-neutral-500">
                {nodeData.dimensions.width}x{nodeData.dimensions.height}
              </span>
            )}
          </div>

          {/* Global Loading Overlay (if generating) */}
          {isGenerating && (
            <div className="absolute inset-0 bg-neutral-900/50 flex items-center justify-center rounded backdrop-blur-[1px]">
            </div>
          )}
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="w-full flex-1 min-h-[112px] border border-dashed border-neutral-600 rounded flex flex-col items-center justify-center cursor-pointer hover:border-neutral-500 hover:bg-neutral-700/50 transition-colors"
        >
          <svg className="w-5 h-5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="text-[10px] text-neutral-400 mt-1">
            Drop or click
          </span>
        </div>
      )}

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
