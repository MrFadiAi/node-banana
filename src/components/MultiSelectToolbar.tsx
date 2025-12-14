"use client";

import { useReactFlow } from "@xyflow/react";
import { useWorkflowStore } from "@/store/workflowStore";
import { useMemo, useState } from "react";
import { expandImage3x2 } from "@/utils/aiUtils";

const STACK_GAP = 20;

export function MultiSelectToolbar() {
  const { nodes, onNodesChange } = useWorkflowStore();
  const { getViewport } = useReactFlow();

  const selectedNodes = useMemo(
    () => nodes.filter((node) => node.selected),
    [nodes]
  );

  // Calculate toolbar position (centered above selected nodes)
  const toolbarPosition = useMemo(() => {
    if (selectedNodes.length < 2) return null;

    const viewport = getViewport();

    // Find bounding box of selected nodes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;

    selectedNodes.forEach((node) => {
      const nodeWidth = (node.style?.width as number) || node.measured?.width || 220;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + nodeWidth);
    });

    // Convert flow coordinates to screen coordinates
    const centerX = (minX + maxX) / 2;
    const screenX = centerX * viewport.zoom + viewport.x;
    const screenY = minY * viewport.zoom + viewport.y - 50; // 50px above the top

    return { x: screenX, y: screenY };
  }, [selectedNodes, getViewport]);

  const handleStackHorizontally = () => {
    if (selectedNodes.length < 2) return;

    // Sort by current x position to maintain relative order
    const sortedNodes = [...selectedNodes].sort((a, b) => a.position.x - b.position.x);

    // Use the topmost y position as the alignment point
    const alignY = Math.min(...sortedNodes.map((n) => n.position.y));

    let currentX = sortedNodes[0].position.x;

    sortedNodes.forEach((node) => {
      const nodeWidth = (node.style?.width as number) || node.measured?.width || 220;

      onNodesChange([
        {
          type: "position",
          id: node.id,
          position: { x: currentX, y: alignY },
        },
      ]);

      currentX += nodeWidth + STACK_GAP;
    });
  };

  const handleStackVertically = () => {
    if (selectedNodes.length < 2) return;

    // Sort by current y position to maintain relative order
    const sortedNodes = [...selectedNodes].sort((a, b) => a.position.y - b.position.y);

    // Use the leftmost x position as the alignment point
    const alignX = Math.min(...sortedNodes.map((n) => n.position.x));

    let currentY = sortedNodes[0].position.y;

    sortedNodes.forEach((node) => {
      const nodeHeight = (node.style?.height as number) || node.measured?.height || 200;

      onNodesChange([
        {
          type: "position",
          id: node.id,
          position: { x: alignX, y: currentY },
        },
      ]);

      currentY += nodeHeight + STACK_GAP;
    });
  };

  const handleArrangeAsGrid = () => {
    if (selectedNodes.length < 2) return;

    // Calculate optimal grid dimensions (as square as possible)
    const count = selectedNodes.length;
    const cols = Math.ceil(Math.sqrt(count));

    // Sort nodes by their current position (top-to-bottom, left-to-right)
    const sortedNodes = [...selectedNodes].sort((a, b) => {
      const rowA = Math.floor(a.position.y / 100);
      const rowB = Math.floor(b.position.y / 100);
      if (rowA !== rowB) return rowA - rowB;
      return a.position.x - b.position.x;
    });

    // Find the starting position (top-left of bounding box)
    const startX = Math.min(...sortedNodes.map((n) => n.position.x));
    const startY = Math.min(...sortedNodes.map((n) => n.position.y));

    // Get max node dimensions for consistent spacing
    const maxWidth = Math.max(
      ...sortedNodes.map((n) => (n.style?.width as number) || n.measured?.width || 220)
    );
    const maxHeight = Math.max(
      ...sortedNodes.map((n) => (n.style?.height as number) || n.measured?.height || 200)
    );

    // Position each node in the grid
    sortedNodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      onNodesChange([
        {
          type: "position",
          id: node.id,
          position: {
            x: startX + col * (maxWidth + STACK_GAP),
            y: startY + row * (maxHeight + STACK_GAP),
          },
        },
      ]);
    });
  };

  // ...

  const [isExpanding, setIsExpanding] = useState(false);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const handleExpandAll = async () => {
    if (isExpanding || selectedNodes.length === 0) return;

    // Filter for image input nodes that have an image
    const imageNodes = selectedNodes.filter(
      n => (n.type === 'imageInput') && (n.data as any).image
    );

    if (imageNodes.length === 0) return;

    setIsExpanding(true);
    let successCount = 0;

    // Process one by one to avoid rate limits
    for (const node of imageNodes) {
      try {
        const imageData = (node.data as any).image;
        // Optimistically update status if we had one, but we don't have a status field on generic image nodes.
        // Just await the result.
        const newImage = await expandImage3x2(imageData);

        // Get dimensions
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.src = newImage;
        });

        updateNodeData(node.id, {
          image: newImage,
          dimensions: { width: img.width, height: img.height }
        });
        successCount++;

      } catch (error) {
        console.error(`Failed to expand node ${node.id}`, error);
      }
    }

    setIsExpanding(false);
    console.log(`Batch expansion finished. Success: ${successCount}/${imageNodes.length}`);
  };

  if (!toolbarPosition || selectedNodes.length < 2) return null;

  return (
    <div
      className="fixed z-[100] flex items-center gap-1 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl p-1"
      style={{
        left: toolbarPosition.x,
        top: toolbarPosition.y,
        transform: "translateX(-50%)",
      }}
    >
      <button
        onClick={handleExpandAll}
        disabled={isExpanding}
        className="px-2 py-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors text-[10px] font-medium flex items-center gap-1 border-r border-neutral-700 mr-0.5"
        title="Expand all selected images to 3:2"
      >
        {isExpanding ? (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        )}
        Make 3:2
      </button>
      <button
        onClick={handleStackHorizontally}
        className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-100 transition-colors"
        title="Stack horizontally (H)"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h4v16H6zM14 4h4v16h-4z" />
        </svg>
      </button>
      <button
        onClick={handleStackVertically}
        className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-100 transition-colors"
        title="Stack vertically (V)"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v4H4zM4 14h16v4H4z" />
        </svg>
      </button>
      <button
        onClick={handleArrangeAsGrid}
        className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-100 transition-colors"
        title="Arrange as grid (G)"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      </button>
    </div>
  );
}
