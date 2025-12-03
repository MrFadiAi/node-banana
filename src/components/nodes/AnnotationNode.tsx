"use client";

import { useCallback } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useAnnotationStore } from "@/store/annotationStore";
import { AnnotationNodeData } from "@/types";

type AnnotationNodeType = Node<AnnotationNodeData, "annotation">;

export function AnnotationNode({ id, data, selected }: NodeProps<AnnotationNodeType>) {
  const nodeData = data;
  const openModal = useAnnotationStore((state) => state.openModal);

  const handleEdit = useCallback(() => {
    const imageToEdit = nodeData.sourceImage || nodeData.outputImage;
    if (!imageToEdit) {
      alert("No image connected. Connect an image input first.");
      return;
    }
    openModal(id, imageToEdit, nodeData.annotations);
  }, [id, nodeData, openModal]);

  const displayImage = nodeData.outputImage || nodeData.sourceImage;

  return (
    <BaseNode id={id} title="Annotate" selected={selected}>
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

      {displayImage ? (
        <div
          className="relative group cursor-pointer"
          onClick={handleEdit}
        >
          <img
            src={displayImage}
            alt="Annotated"
            className="w-full h-28 object-cover rounded"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded flex items-center justify-center">
            <span className="text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 px-2 py-1 rounded">
              {nodeData.annotations.length > 0 ? `Edit (${nodeData.annotations.length})` : "Add annotations"}
            </span>
          </div>
        </div>
      ) : (
        <div className="w-full h-28 border border-dashed border-neutral-600 rounded flex items-center justify-center">
          <span className="text-neutral-500 text-[10px] text-center px-2">
            Connect image
          </span>
        </div>
      )}
    </BaseNode>
  );
}
