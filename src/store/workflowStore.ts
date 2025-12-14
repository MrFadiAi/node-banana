import { create } from "zustand";
import {
  Connection,
  EdgeChange,
  NodeChange,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  XYPosition,
} from "@xyflow/react";
import {
  WorkflowNode,
  WorkflowEdge,
  NodeType,
  ImageInputNodeData,
  AnnotationNodeData,
  PromptNodeData,
  NanoBananaNodeData,
  LLMGenerateNodeData,
  OutputNodeData,
  WorkflowNodeData,
  ImageHistoryItem,
  SplitNodeData,
  Make32NodeData,
} from "@/types";
import { useToast } from "@/components/Toast";
import { detectAndSplitGrid } from "@/utils/gridSplitter";
import { expandImage3x2 } from "@/utils/aiUtils";

export type EdgeStyle = "angular" | "curved";

// Workflow file format
export interface WorkflowFile {
  version: 1;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  edgeStyle: EdgeStyle;
}

// Clipboard data structure for copy/paste
interface ClipboardData {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface WorkflowStore {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  edgeStyle: EdgeStyle;
  clipboard: ClipboardData | null;

  // Settings
  setEdgeStyle: (style: EdgeStyle) => void;

  // Node operations
  addNode: (type: NodeType, position: XYPosition) => string;
  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  removeNode: (nodeId: string) => void;
  onNodesChange: (changes: NodeChange<WorkflowNode>[]) => void;

  // Edge operations
  onEdgesChange: (changes: EdgeChange<WorkflowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  removeEdge: (edgeId: string) => void;
  toggleEdgePause: (edgeId: string) => void;

  // Copy/Paste operations
  copySelectedNodes: () => void;
  pasteNodes: (offset?: XYPosition) => void;

  // Execution
  isRunning: boolean;
  currentNodeId: string | null;
  pausedAtNodeId: string | null;
  executeWorkflow: (startFromNodeId?: string) => Promise<void>;
  regenerateNode: (nodeId: string) => Promise<void>;
  stopWorkflow: () => void;

  // Save/Load
  saveWorkflow: (name?: string) => void;
  loadWorkflow: (workflow: WorkflowFile) => void;
  clearWorkflow: () => void;

  // Helpers
  getNodeById: (id: string) => WorkflowNode | undefined;
  getConnectedInputs: (nodeId: string) => { images: string[]; text: string | null };
  validateWorkflow: () => { valid: boolean; errors: string[] };

  // Global Image History
  globalImageHistory: ImageHistoryItem[];
  addToGlobalHistory: (item: Omit<ImageHistoryItem, "id">) => void;
  clearGlobalHistory: () => void;
}

const createDefaultNodeData = (type: NodeType): WorkflowNodeData => {
  switch (type) {
    case "imageInput":
      return {
        image: null,
        filename: null,
        dimensions: null,
      } as ImageInputNodeData;
    case "annotation":
      return {
        sourceImage: null,
        annotations: [],
        outputImage: null,
      } as AnnotationNodeData;
    case "prompt":
      return {
        prompt: "",
      } as PromptNodeData;
    case "nanoBanana":
      return {
        inputImages: [],
        inputPrompt: null,
        outputImage: null,
        aspectRatio: "1:1",
        resolution: "1K",
        model: "nano-banana-pro",
        useGoogleSearch: false,
        status: "idle",
        error: null,
      } as NanoBananaNodeData;
    case "llmGenerate":
      return {
        inputPrompt: null,
        outputText: null,
        provider: "google",
        model: "gemini-2.5-flash",
        temperature: 0.7,
        maxTokens: 1024,
        status: "idle",
        error: null,
      } as LLMGenerateNodeData;
    case "output":
      return {
        image: null,
      } as OutputNodeData;
    case "splitNode":
      return {
        inputImage: null,
        status: "idle",
        error: null,
      } as SplitNodeData;
    case "make32Node":
      return {
        inputImage: null,
        outputImage: null,
        status: "idle",
        error: null,
      } as Make32NodeData;
  }
};

let nodeIdCounter = 0;

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: [],
  edges: [],
  edgeStyle: "curved" as EdgeStyle,
  clipboard: null,
  isRunning: false,
  currentNodeId: null,
  pausedAtNodeId: null,
  globalImageHistory: [],

  setEdgeStyle: (style: EdgeStyle) => {
    set({ edgeStyle: style });
  },

  addNode: (type: NodeType, position: XYPosition) => {
    const id = `${type}-${++nodeIdCounter}`;

    // Default dimensions based on node type
    const defaultDimensions: Record<NodeType, { width: number; height: number }> = {
      imageInput: { width: 300, height: 280 },
      annotation: { width: 300, height: 280 },
      prompt: { width: 320, height: 220 },
      nanoBanana: { width: 300, height: 300 },
      llmGenerate: { width: 320, height: 360 },
      output: { width: 320, height: 320 },
      splitNode: { width: 200, height: 160 },
      make32Node: { width: 300, height: 260 },
    };

    const { width, height } = defaultDimensions[type];

    const newNode: WorkflowNode = {
      id,
      type,
      position,
      data: createDefaultNodeData(type),
      style: { width, height },
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
    }));

    return id;
  },

  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } as WorkflowNodeData }
          : node
      ) as WorkflowNode[],
    }));
  },

  removeNode: (nodeId: string) => {
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== nodeId),
      edges: state.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      ),
    }));
  },

  onNodesChange: (changes: NodeChange<WorkflowNode>[]) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    }));
  },

  onEdgesChange: (changes: EdgeChange<WorkflowEdge>[]) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },

  onConnect: (connection: Connection) => {
    set((state) => ({
      edges: addEdge(
        {
          ...connection,
          id: `edge-${connection.source}-${connection.target}-${connection.sourceHandle || "default"}-${connection.targetHandle || "default"}`,
        },
        state.edges
      ),
    }));
  },

  removeEdge: (edgeId: string) => {
    set((state) => ({
      edges: state.edges.filter((edge) => edge.id !== edgeId),
    }));
  },

  toggleEdgePause: (edgeId: string) => {
    set((state) => ({
      edges: state.edges.map((edge) =>
        edge.id === edgeId
          ? { ...edge, data: { ...edge.data, hasPause: !edge.data?.hasPause } }
          : edge
      ),
    }));
  },

  copySelectedNodes: () => {
    const { nodes, edges } = get();
    const selectedNodes = nodes.filter((node) => node.selected);

    if (selectedNodes.length === 0) return;

    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));

    // Copy edges that connect selected nodes to each other
    const connectedEdges = edges.filter(
      (edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
    );

    // Deep clone the nodes and edges to avoid reference issues
    const clonedNodes = JSON.parse(JSON.stringify(selectedNodes)) as WorkflowNode[];
    const clonedEdges = JSON.parse(JSON.stringify(connectedEdges)) as WorkflowEdge[];

    set({ clipboard: { nodes: clonedNodes, edges: clonedEdges } });
  },

  pasteNodes: (offset: XYPosition = { x: 50, y: 50 }) => {
    const { clipboard, nodes, edges } = get();

    if (!clipboard || clipboard.nodes.length === 0) return;

    // Create a mapping from old node IDs to new node IDs
    const idMapping = new Map<string, string>();

    // Generate new IDs for all pasted nodes
    clipboard.nodes.forEach((node) => {
      const newId = `${node.type}-${++nodeIdCounter}`;
      idMapping.set(node.id, newId);
    });

    // Create new nodes with updated IDs and offset positions
    const newNodes: WorkflowNode[] = clipboard.nodes.map((node) => ({
      ...node,
      id: idMapping.get(node.id)!,
      position: {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      },
      selected: true, // Select newly pasted nodes
      data: { ...node.data }, // Deep copy data
    }));

    // Create new edges with updated source/target IDs
    const newEdges: WorkflowEdge[] = clipboard.edges.map((edge) => ({
      ...edge,
      id: `edge-${idMapping.get(edge.source)}-${idMapping.get(edge.target)}-${edge.sourceHandle || "default"}-${edge.targetHandle || "default"}`,
      source: idMapping.get(edge.source)!,
      target: idMapping.get(edge.target)!,
    }));

    // Deselect existing nodes and add new ones
    const updatedNodes = nodes.map((node) => ({
      ...node,
      selected: false,
    }));

    set({
      nodes: [...updatedNodes, ...newNodes] as WorkflowNode[],
      edges: [...edges, ...newEdges],
    });
  },

  getNodeById: (id: string) => {
    return get().nodes.find((node) => node.id === id);
  },

  getConnectedInputs: (nodeId: string) => {
    const { edges, nodes } = get();
    const images: string[] = [];
    let text: string | null = null;

    edges
      .filter((edge) => edge.target === nodeId)
      .forEach((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        if (!sourceNode) return;

        const handleId = edge.targetHandle;

        if (handleId === "image" || !handleId) {
          // Get image from source node - collect all connected images
          if (sourceNode.type === "imageInput") {
            const sourceImage = (sourceNode.data as ImageInputNodeData).image;
            if (sourceImage) images.push(sourceImage);
          } else if (sourceNode.type === "annotation") {
            const sourceImage = (sourceNode.data as AnnotationNodeData).outputImage;
            if (sourceImage) images.push(sourceImage);
          } else if (sourceNode.type === "nanoBanana") {
            const sourceImage = (sourceNode.data as NanoBananaNodeData).outputImage;
            if (sourceImage) images.push(sourceImage);
          }
        }

        if (handleId === "text") {
          if (sourceNode.type === "prompt") {
            text = (sourceNode.data as PromptNodeData).prompt;
          } else if (sourceNode.type === "llmGenerate") {
            text = (sourceNode.data as LLMGenerateNodeData).outputText;
          }
        }
      });

    return { images, text };
  },

  validateWorkflow: () => {
    const { nodes, edges } = get();
    const errors: string[] = [];

    // Check if there are any nodes
    if (nodes.length === 0) {
      errors.push("Workflow is empty");
      return { valid: false, errors };
    }

    // Check each Nano Banana node has required inputs
    nodes
      .filter((n) => n.type === "nanoBanana")
      .forEach((node) => {
        const imageConnected = edges.some(
          (e) => e.target === node.id && e.targetHandle === "image"
        );
        const textConnected = edges.some(
          (e) => e.target === node.id && e.targetHandle === "text"
        );

        if (!imageConnected) {
          errors.push(`Generate node "${node.id}" missing image input`);
        }
        if (!textConnected) {
          errors.push(`Generate node "${node.id}" missing text input`);
        }
      });

    // Check annotation nodes have image input (either connected or manually loaded)
    nodes
      .filter((n) => n.type === "annotation")
      .forEach((node) => {
        const imageConnected = edges.some((e) => e.target === node.id);
        const hasManualImage = (node.data as AnnotationNodeData).sourceImage !== null;
        if (!imageConnected && !hasManualImage) {
          errors.push(`Annotation node "${node.id}" missing image input`);
        }
      });

    // Check output nodes have image input
    nodes
      .filter((n) => n.type === "output")
      .forEach((node) => {
        const imageConnected = edges.some((e) => e.target === node.id);
        if (!imageConnected) {
          errors.push(`Output node "${node.id}" missing image input`);
        }
      });

    return { valid: errors.length === 0, errors };
  },

  executeWorkflow: async (startFromNodeId?: string) => {
    const { nodes, edges, updateNodeData, getConnectedInputs, isRunning } = get();

    if (isRunning) {
      return;
    }

    const isResuming = startFromNodeId === get().pausedAtNodeId;
    set({ isRunning: true, pausedAtNodeId: null });

    // Topological sort
    const sorted: WorkflowNode[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) {
        throw new Error("Cycle detected in workflow");
      }

      visiting.add(nodeId);

      // Visit all nodes that this node depends on
      edges
        .filter((e) => e.target === nodeId)
        .forEach((e) => visit(e.source));

      visiting.delete(nodeId);
      visited.add(nodeId);

      const node = nodes.find((n) => n.id === nodeId);
      if (node) sorted.push(node);
    };

    try {
      nodes.forEach((node) => visit(node.id));

      // If starting from a specific node, find its index and skip earlier nodes
      let startIndex = 0;
      if (startFromNodeId) {
        const nodeIndex = sorted.findIndex((n) => n.id === startFromNodeId);
        if (nodeIndex !== -1) {
          startIndex = nodeIndex;
        }
      }

      // Execute nodes in order, starting from startIndex
      for (let i = startIndex; i < sorted.length; i++) {
        const node = sorted[i];
        if (!get().isRunning) break;

        // Check for pause edges on incoming connections (skip if resuming from this exact node)
        const isResumingThisNode = isResuming && node.id === startFromNodeId;
        if (!isResumingThisNode) {
          const incomingEdges = edges.filter((e) => e.target === node.id);
          const pauseEdge = incomingEdges.find((e) => e.data?.hasPause);
          if (pauseEdge) {
            set({ pausedAtNodeId: node.id, isRunning: false, currentNodeId: null });
            useToast.getState().show("Workflow paused - click Run to continue", "warning");
            return;
          }
        }

        set({ currentNodeId: node.id });

        switch (node.type) {
          case "imageInput":
            // Nothing to execute, data is already set
            break;

          case "annotation": {
            // Get connected image and set as source (use first image)
            const { images } = getConnectedInputs(node.id);
            const image = images[0] || null;
            if (image) {
              updateNodeData(node.id, { sourceImage: image });
              // If no annotations, pass through the image
              const nodeData = node.data as AnnotationNodeData;
              if (!nodeData.outputImage) {
                updateNodeData(node.id, { outputImage: image });
              }
            }
            break;
          }

          case "prompt":
            // Nothing to execute, data is already set
            break;

          case "nanoBanana": {
            const { images, text } = getConnectedInputs(node.id);

            if (images.length === 0 || !text) {
              updateNodeData(node.id, {
                status: "error",
                error: "Missing image or text input",
              });
              set({ isRunning: false, currentNodeId: null });
              return;
            }

            updateNodeData(node.id, {
              inputImages: images,
              inputPrompt: text,
              status: "loading",
              error: null,
            });

            try {
              const nodeData = node.data as NanoBananaNodeData;

              const requestPayload = {
                images,
                prompt: text,
                aspectRatio: nodeData.aspectRatio,
                resolution: nodeData.resolution,
                model: nodeData.model,
                useGoogleSearch: nodeData.useGoogleSearch,
              };

              const response = await fetch("/api/generate", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(requestPayload),
              });

              if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                try {
                  const errorJson = JSON.parse(errorText);
                  errorMessage = errorJson.error || errorMessage;
                } catch {
                  if (errorText) errorMessage += ` - ${errorText.substring(0, 200)}`;
                }

                updateNodeData(node.id, {
                  status: "error",
                  error: errorMessage,
                });
                set({ isRunning: false, currentNodeId: null });
                return;
              }

              const result = await response.json();

              if (result.success && result.image) {
                // Save the newly generated image to global history
                get().addToGlobalHistory({
                  image: result.image,
                  timestamp: Date.now(),
                  prompt: text,
                  aspectRatio: nodeData.aspectRatio,
                  model: nodeData.model,
                });
                updateNodeData(node.id, {
                  outputImage: result.image,
                  status: "complete",
                  error: null,
                });
              } else {
                updateNodeData(node.id, {
                  status: "error",
                  error: result.error || "Generation failed",
                });
                set({ isRunning: false, currentNodeId: null });
                return;
              }
            } catch (error) {
              let errorMessage = "Generation failed";
              if (error instanceof DOMException && error.name === 'AbortError') {
                errorMessage = "Request timed out. Try reducing image sizes or using a simpler prompt.";
              } else if (error instanceof TypeError && error.message.includes('NetworkError')) {
                errorMessage = "Network error. Check your connection and try again.";
              } else if (error instanceof TypeError) {
                errorMessage = `Network error: ${error.message}`;
              } else if (error instanceof Error) {
                errorMessage = error.message;
              }

              updateNodeData(node.id, {
                status: "error",
                error: errorMessage,
              });
              set({ isRunning: false, currentNodeId: null });
              return;
            }
            break;
          }

          case "llmGenerate": {
            const { text } = getConnectedInputs(node.id);

            if (!text) {
              updateNodeData(node.id, {
                status: "error",
                error: "Missing text input",
              });
              set({ isRunning: false, currentNodeId: null });
              return;
            }

            updateNodeData(node.id, {
              inputPrompt: text,
              status: "loading",
              error: null,
            });

            try {
              const nodeData = node.data as LLMGenerateNodeData;
              const response = await fetch("/api/llm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  prompt: text,
                  provider: nodeData.provider,
                  model: nodeData.model,
                  temperature: nodeData.temperature,
                  maxTokens: nodeData.maxTokens,
                }),
              });

              if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `HTTP ${response.status}`;
                try {
                  const errorJson = JSON.parse(errorText);
                  errorMessage = errorJson.error || errorMessage;
                } catch {
                  if (errorText) errorMessage += ` - ${errorText.substring(0, 200)}`;
                }
                updateNodeData(node.id, {
                  status: "error",
                  error: errorMessage,
                });
                set({ isRunning: false, currentNodeId: null });
                return;
              }

              const result = await response.json();

              if (result.success && result.text) {
                updateNodeData(node.id, {
                  outputText: result.text,
                  status: "complete",
                  error: null,
                });
              } else {
                updateNodeData(node.id, {
                  status: "error",
                  error: result.error || "LLM generation failed",
                });
                set({ isRunning: false, currentNodeId: null });
                return;
              }
            } catch (error) {
              updateNodeData(node.id, {
                status: "error",
                error: error instanceof Error ? error.message : "LLM generation failed",
              });
              set({ isRunning: false, currentNodeId: null });
              return;
            }
            break;
          }

          case "output": {
            const { images } = getConnectedInputs(node.id);
            const image = images[0] || null;
            if (image) {
              updateNodeData(node.id, { image });
            }
            break;
          }

          case "splitNode": {
            const { images } = getConnectedInputs(node.id);
            const inputImage = images[0] || null;

            if (!inputImage) {
              updateNodeData(node.id, {
                status: "error",
                error: "Missing input image",
              });
              break;
            }

            updateNodeData(node.id, {
              status: "loading",
              error: null,
              inputImage: inputImage
            });

            try {
              // Perform grid splitting
              const { grid, images: splitImages } = await detectAndSplitGrid(inputImage);

              if (splitImages.length === 0) {
                updateNodeData(node.id, {
                  status: "error",
                  error: "No grid detected",
                });
                break;
              }

              // Create new nodes
              const nodeWidth = 300;
              const nodeHeight = 280;
              const gap = 20;

              // We need to calculate positions relative to the SplitNode
              // But we don't have the SplitNode's current position easily accessible here in the logic loop
              // except via `node` object which should have it if it was loaded from store
              const startX = node.position.x + 300; // Offset to the right
              const startY = node.position.y;

              // Add images to global history and create nodes
              // Find potential existing output nodes to reuse
              const { edges, nodes } = get();
              const connectedEdges = edges.filter(e => e.source === node.id && e.sourceHandle === "image");
              const connectedNodeIds = new Set(connectedEdges.map(e => e.target));
              const connectedNodes = nodes.filter(n => connectedNodeIds.has(n.id))
                .sort((a, b) => {
                  // Sort by Y then X to match grid order (approximate)
                  const yDiff = a.position.y - b.position.y;
                  if (Math.abs(yDiff) > 50) return yDiff; // Different rows
                  return a.position.x - b.position.x; // Same row
                });

              // Add split images to global history and create/update nodes
              splitImages.forEach((imageData: string, index: number) => {
                const row = Math.floor(index / grid.cols);
                const col = index % grid.cols;

                // Save to history
                const { addToGlobalHistory } = get();
                addToGlobalHistory({
                  image: imageData,
                  timestamp: Date.now() + index,
                  prompt: `Split ${row + 1}-${col + 1} from grid`,
                  aspectRatio: "1:1", // approximate
                  model: "nano-banana",
                });

                // Reuse existing node if available, otherwise create new
                if (index < connectedNodes.length) {
                  const existingNode = connectedNodes[index];
                  const img = new Image();
                  img.onload = () => {
                    get().updateNodeData(existingNode.id, {
                      image: imageData,
                      filename: `split-${row + 1}-${col + 1}.png`,
                      dimensions: { width: img.width, height: img.height },
                    });
                  };
                  img.src = imageData;
                } else {
                  // Create Node
                  const newNodeId = get().addNode("imageInput", {
                    x: startX + col * (nodeWidth + gap),
                    y: startY + row * (nodeHeight + gap),
                  });

                  // Create Edge from SplitNode to new Node
                  const connection = {
                    id: `edge-${node.id}-${newNodeId}`,
                    source: node.id,
                    target: newNodeId,
                    sourceHandle: "image",
                    targetHandle: "image",
                  };
                  set({ edges: addEdge(connection, get().edges as any) as WorkflowEdge[] });

                  // Load image for dimensions and update
                  const img = new Image();
                  img.onload = () => {
                    get().updateNodeData(newNodeId, {
                      image: imageData,
                      filename: `split-${row + 1}-${col + 1}.png`,
                      dimensions: { width: img.width, height: img.height },
                    });
                  };
                  img.src = imageData;
                }
              });

              updateNodeData(node.id, {
                status: "complete",
                error: null,
              });

            } catch (error) {
              updateNodeData(node.id, {
                status: "error",
                error: error instanceof Error ? error.message : "Split failed",
              });
            }
            break;
          }

          case "make32Node": {
            const { images } = getConnectedInputs(node.id);

            if (!images || images.length === 0) {
              updateNodeData(node.id, {
                status: "error",
                error: "Missing input images",
              });
              break;
            }

            updateNodeData(node.id, {
              status: "loading",
              error: null,
              inputImage: images[0] // Just show first one as preview if needed
            });

            try {
              const nodeWidth = 300;
              const nodeHeight = 280;
              const gap = 20;
              const startX = node.position.x + 350; // To the right
              const startY = node.position.y;

              let successCount = 0;

              // Find potential existing output nodes to reuse
              const { edges, nodes } = get();
              const connectedEdges = edges.filter(e => e.source === node.id && e.sourceHandle === "image");
              const connectedNodeIds = new Set(connectedEdges.map(e => e.target));
              const connectedNodes = nodes.filter(n => connectedNodeIds.has(n.id))
                .sort((a, b) => a.position.y - b.position.y); // Sort by Y position

              // Process ALL connected images
              for (let i = 0; i < images.length; i++) {
                const inputImage = images[i];
                try {
                  const outputImage = await expandImage3x2(inputImage);

                  // Add to history
                  const { addToGlobalHistory } = get();
                  addToGlobalHistory({
                    image: outputImage,
                    timestamp: Date.now() + i,
                    prompt: "Make 3:2 Expansion",
                    aspectRatio: "3:2",
                    model: "nano-banana-pro",
                  });

                  if (i < connectedNodes.length) {
                    // Reuse existing node
                    const existingNode = connectedNodes[i];
                    const img = new Image();
                    // Wait for load to set dimensions
                    await new Promise<void>((resolve) => {
                      img.onload = () => {
                        get().updateNodeData(existingNode.id, {
                          image: outputImage,
                          filename: `expanded-${Date.now()}-${i}.png`,
                          dimensions: { width: img.width, height: img.height },
                        });
                        resolve();
                      }
                      img.src = outputImage;
                    });
                  } else {
                    // Create NEW Node for output
                    const newNodeId = get().addNode("imageInput", {
                      x: startX,
                      y: startY + i * (nodeHeight + gap),
                    });

                    // Create Edge from Make32Node to new Node
                    const connection = {
                      id: `edge-${node.id}-${newNodeId}`,
                      source: node.id,
                      target: newNodeId,
                      sourceHandle: "image",
                      targetHandle: "image",
                    };
                    set({ edges: addEdge(connection, get().edges as any) as WorkflowEdge[] });

                    // Update new node data
                    const img = new Image();
                    // Wait for load to set dimensions
                    await new Promise<void>((resolve) => {
                      img.onload = () => {
                        get().updateNodeData(newNodeId, {
                          image: outputImage,
                          filename: `expanded-${Date.now()}-${i}.png`,
                          dimensions: { width: img.width, height: img.height },
                        });
                        resolve();
                      }
                      img.src = outputImage;
                    });
                  }

                  successCount++;

                } catch (err) {
                  console.error(`Failed to expand image ${i}`, err);
                }
              }

              if (successCount > 0) {
                updateNodeData(node.id, {
                  status: "complete",
                  error: null,
                  outputImage: null // We don't need to show output inside anymore
                });
              } else {
                throw new Error("All expansions failed");
              }

            } catch (error) {
              updateNodeData(node.id, {
                status: "error",
                error: error instanceof Error ? error.message : "Expansion failed",
              });
            }
            break;
          }
        }
      }

      set({ isRunning: false, currentNodeId: null });
    } catch {
      set({ isRunning: false, currentNodeId: null });
    }
  },

  stopWorkflow: () => {
    set({ isRunning: false, currentNodeId: null });
  },

  regenerateNode: async (nodeId: string) => {
    const { nodes, updateNodeData, getConnectedInputs, isRunning } = get();

    if (isRunning) {
      return;
    }

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) {
      return;
    }

    set({ isRunning: true, currentNodeId: nodeId });

    try {
      if (node.type === "nanoBanana") {
        const nodeData = node.data as NanoBananaNodeData;

        // Always get fresh connected inputs first, fall back to stored inputs only if not connected
        const inputs = getConnectedInputs(nodeId);
        let images = inputs.images.length > 0 ? inputs.images : nodeData.inputImages;
        let text = inputs.text ?? nodeData.inputPrompt;

        if (!images || images.length === 0 || !text) {
          updateNodeData(nodeId, {
            status: "error",
            error: "Missing image or text input",
          });
          set({ isRunning: false, currentNodeId: null });
          return;
        }

        updateNodeData(nodeId, {
          status: "loading",
          error: null,
        });

        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images,
            prompt: text,
            aspectRatio: nodeData.aspectRatio,
            resolution: nodeData.resolution,
            model: nodeData.model,
            useGoogleSearch: nodeData.useGoogleSearch,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `HTTP ${response.status}`;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorMessage;
          } catch {
            if (errorText) errorMessage += ` - ${errorText.substring(0, 200)}`;
          }
          updateNodeData(nodeId, { status: "error", error: errorMessage });
          set({ isRunning: false, currentNodeId: null });
          return;
        }

        const result = await response.json();
        if (result.success && result.image) {
          // Save the newly generated image to global history
          get().addToGlobalHistory({
            image: result.image,
            timestamp: Date.now(),
            prompt: text,
            aspectRatio: nodeData.aspectRatio,
            model: nodeData.model,
          });
          updateNodeData(nodeId, {
            outputImage: result.image,
            status: "complete",
            error: null,
          });
        } else {
          updateNodeData(nodeId, {
            status: "error",
            error: result.error || "Generation failed",
          });
        }
      } else if (node.type === "llmGenerate") {
        const nodeData = node.data as LLMGenerateNodeData;

        // Always get fresh connected input first, fall back to stored input only if not connected
        const inputs = getConnectedInputs(nodeId);
        const text = inputs.text ?? nodeData.inputPrompt;

        if (!text) {
          updateNodeData(nodeId, {
            status: "error",
            error: "Missing text input",
          });
          set({ isRunning: false, currentNodeId: null });
          return;
        }

        updateNodeData(nodeId, {
          status: "loading",
          error: null,
        });

        const response = await fetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: text,
            provider: nodeData.provider,
            model: nodeData.model,
            temperature: nodeData.temperature,
            maxTokens: nodeData.maxTokens,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `HTTP ${response.status}`;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorMessage;
          } catch {
            if (errorText) errorMessage += ` - ${errorText.substring(0, 200)}`;
          }
          updateNodeData(nodeId, { status: "error", error: errorMessage });
          set({ isRunning: false, currentNodeId: null });
          return;
        }

        const result = await response.json();
        if (result.success && result.text) {
          updateNodeData(nodeId, {
            outputText: result.text,
            status: "complete",
            error: null,
          });
        } else {
          updateNodeData(nodeId, {
            status: "error",
            error: result.error || "LLM generation failed",
          });
        }
      }

      set({ isRunning: false, currentNodeId: null });
    } catch (error) {
      updateNodeData(nodeId, {
        status: "error",
        error: error instanceof Error ? error.message : "Regeneration failed",
      });
      set({ isRunning: false, currentNodeId: null });
    }
  },

  saveWorkflow: (name?: string) => {
    const { nodes, edges, edgeStyle } = get();

    const workflow: WorkflowFile = {
      version: 1,
      name: name || `workflow-${new Date().toISOString().slice(0, 10)}`,
      nodes,
      edges,
      edgeStyle,
    };

    const json = JSON.stringify(workflow, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${workflow.name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  loadWorkflow: (workflow: WorkflowFile) => {
    // Update nodeIdCounter to avoid ID collisions
    const maxId = workflow.nodes.reduce((max, node) => {
      const match = node.id.match(/-(\d+)$/);
      if (match) {
        return Math.max(max, parseInt(match[1], 10));
      }
      return max;
    }, 0);
    nodeIdCounter = maxId;

    set({
      nodes: workflow.nodes,
      edges: workflow.edges,
      edgeStyle: workflow.edgeStyle || "angular",
      isRunning: false,
      currentNodeId: null,
    });
  },

  clearWorkflow: () => {
    set({
      nodes: [],
      edges: [],
      isRunning: false,
      currentNodeId: null,
    });
  },

  addToGlobalHistory: (item: Omit<ImageHistoryItem, "id">) => {
    const newItem: ImageHistoryItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    set((state) => ({
      globalImageHistory: [newItem, ...state.globalImageHistory],
    }));
  },

  clearGlobalHistory: () => {
    set({ globalImageHistory: [] });
  },
}));
