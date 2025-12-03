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
} from "@/types";

export type EdgeStyle = "angular" | "curved";

// Workflow file format
export interface WorkflowFile {
  version: 1;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  edgeStyle: EdgeStyle;
}

interface WorkflowStore {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  edgeStyle: EdgeStyle;

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

  // Execution
  isRunning: boolean;
  currentNodeId: string | null;
  executeWorkflow: () => Promise<void>;
  stopWorkflow: () => void;

  // Save/Load
  saveWorkflow: (name?: string) => void;
  loadWorkflow: (workflow: WorkflowFile) => void;
  clearWorkflow: () => void;

  // Helpers
  getNodeById: (id: string) => WorkflowNode | undefined;
  getConnectedInputs: (nodeId: string) => { images: string[]; text: string | null };
  validateWorkflow: () => { valid: boolean; errors: string[] };
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
  }
};

let nodeIdCounter = 0;

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: [],
  edges: [],
  edgeStyle: "angular" as EdgeStyle,
  isRunning: false,
  currentNodeId: null,

  setEdgeStyle: (style: EdgeStyle) => {
    set({ edgeStyle: style });
  },

  addNode: (type: NodeType, position: XYPosition) => {
    const id = `${type}-${++nodeIdCounter}`;

    // Default dimensions based on node type
    const defaultDimensions: Record<NodeType, { width: number; height: number }> = {
      imageInput: { width: 220, height: 200 },
      annotation: { width: 220, height: 200 },
      prompt: { width: 240, height: 160 },
      nanoBanana: { width: 220, height: 220 },
      llmGenerate: { width: 240, height: 280 },
      output: { width: 240, height: 240 },
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
          let sourceImage: string | null = null;
          if (sourceNode.type === "imageInput") {
            sourceImage = (sourceNode.data as ImageInputNodeData).image;
          } else if (sourceNode.type === "annotation") {
            sourceImage = (sourceNode.data as AnnotationNodeData).outputImage;
          } else if (sourceNode.type === "nanoBanana") {
            sourceImage = (sourceNode.data as NanoBananaNodeData).outputImage;
          }
          if (sourceImage) {
            images.push(sourceImage);
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

    // Check annotation nodes have image input
    nodes
      .filter((n) => n.type === "annotation")
      .forEach((node) => {
        const imageConnected = edges.some((e) => e.target === node.id);
        if (!imageConnected) {
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

  executeWorkflow: async () => {
    const { nodes, edges, updateNodeData, getConnectedInputs, isRunning } = get();

    if (isRunning) {
      console.warn(`[Workflow] ⚠️ Workflow is already running, ignoring duplicate execution request`);
      return;
    }

    console.log(`[Workflow] ========== STARTING WORKFLOW EXECUTION ==========`);
    set({ isRunning: true });

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

      // Execute nodes in order
      for (const node of sorted) {
        if (!get().isRunning) break;

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

              console.log(`[Generate] ===== STARTING IMAGE GENERATION =====`);
              console.log(`[Generate] Node ID: ${node.id}`);
              console.log(`[Generate] Model: ${nodeData.model}`);
              console.log(`[Generate] Aspect Ratio: ${nodeData.aspectRatio}`);
              console.log(`[Generate] Resolution: ${nodeData.resolution}`);
              console.log(`[Generate] Google Search: ${nodeData.useGoogleSearch}`);
              console.log(`[Generate] Prompt length: ${text.length} chars`);
              console.log(`[Generate] Prompt preview: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
              console.log(`[Generate] Number of images: ${images.length}`);

              // Analyze each image
              images.forEach((img, i) => {
                const imgSizeKB = (img.length / 1024).toFixed(2);
                const isBase64 = img.startsWith('data:');
                const mimeType = isBase64 ? img.match(/data:([^;]+)/)?.[1] : 'unknown';
                console.log(`[Generate] Image ${i + 1}: ${imgSizeKB}KB, MIME: ${mimeType}, Base64: ${isBase64}`);
              });

              const requestPayload = {
                images,
                prompt: text,
                aspectRatio: nodeData.aspectRatio,
                resolution: nodeData.resolution,
                model: nodeData.model,
                useGoogleSearch: nodeData.useGoogleSearch,
              };

              const requestBody = JSON.stringify(requestPayload);
              const payloadSizeMB = (requestBody.length / (1024 * 1024)).toFixed(2);
              console.log(`[Generate] Total request payload size: ${payloadSizeMB}MB`);

              console.log(`[Generate] Initiating fetch to /api/generate...`);
              console.log(`[Generate] Current timestamp: ${new Date().toISOString()}`);
              const fetchStartTime = Date.now();

              let response;
              try {
                response = await fetch("/api/generate", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: requestBody,
                });
                console.log(`[Generate] ✓ Fetch promise resolved successfully`);
              } catch (fetchError) {
                console.error(`[Generate] ❌ Fetch promise rejected`);
                console.error(`[Generate] Fetch error type:`, fetchError?.constructor?.name);
                console.error(`[Generate] Fetch error message:`, fetchError instanceof Error ? fetchError.message : String(fetchError));
                console.error(`[Generate] Fetch error name:`, fetchError instanceof Error ? fetchError.name : 'N/A');

                // Check if this might be caused by Next.js Fast Refresh
                if (fetchError instanceof TypeError && fetchError.message.includes('NetworkError')) {
                  console.warn(`[Generate] ⚠️ This error may be caused by Next.js Fast Refresh interrupting the request.`);
                  console.warn(`[Generate] ⚠️ The server may have completed successfully - check terminal logs.`);
                  console.warn(`[Generate] ⚠️ Try again, or avoid saving files while generation is in progress.`);
                }

                // Check if this is a Firefox-specific issue
                console.error(`[Generate] User agent:`, navigator.userAgent);

                throw fetchError; // Re-throw to be handled by outer catch
              }

              const fetchDuration = Date.now() - fetchStartTime;
              console.log(`[Generate] Fetch completed in ${fetchDuration}ms`);
              console.log(`[Generate] Response status: ${response.status} ${response.statusText}`);
              console.log(`[Generate] Response headers:`, Object.fromEntries(response.headers.entries()));

              if (!response.ok) {
                console.error(`[Generate] ❌ HTTP Error Response`);
                const errorText = await response.text();
                console.error(`[Generate] Error response body:`, errorText);
                console.error(`[Generate] Response Content-Type:`, response.headers.get('content-type'));

                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                try {
                  const errorJson = JSON.parse(errorText);
                  console.error(`[Generate] Parsed error JSON:`, errorJson);
                  errorMessage = errorJson.error || errorMessage;
                } catch (parseError) {
                  console.error(`[Generate] Could not parse error response as JSON:`, parseError);
                  if (errorText) errorMessage += ` - ${errorText.substring(0, 200)}`;
                }

                updateNodeData(node.id, {
                  status: "error",
                  error: errorMessage,
                });
                console.log(`[Generate] ===== GENERATION FAILED (HTTP ERROR) =====`);
                set({ isRunning: false, currentNodeId: null });
                return;
              }

              console.log(`[Generate] ✓ Response OK, parsing JSON...`);
              const result = await response.json();
              console.log(`[Generate] Result success: ${result.success}`);
              console.log(`[Generate] Result has image: ${!!result.image}`);

              if (result.image) {
                const resultImageSize = (result.image.length / 1024).toFixed(2);
                console.log(`[Generate] Result image size: ${resultImageSize}KB`);
              }

              if (result.success && result.image) {
                console.log(`[Generate] ✓✓✓ GENERATION SUCCESSFUL ✓✓✓`);
                updateNodeData(node.id, {
                  outputImage: result.image,
                  status: "complete",
                  error: null,
                });
              } else {
                console.error(`[Generate] ❌ Generation failed despite OK response`);
                console.error(`[Generate] Result error:`, result.error);
                updateNodeData(node.id, {
                  status: "error",
                  error: result.error || "Generation failed",
                });
                console.log(`[Generate] ===== GENERATION FAILED (API ERROR) =====`);
                set({ isRunning: false, currentNodeId: null });
                return;
              }
            } catch (error) {
              // Detailed error logging
              console.error(`[Generate] ❌❌❌ EXCEPTION CAUGHT ❌❌❌`);
              console.error(`[Generate] Error type:`, error?.constructor?.name);
              console.error(`[Generate] Error message:`, error instanceof Error ? error.message : String(error));
              console.error(`[Generate] Error stack:`, error instanceof Error ? error.stack : 'N/A');

              // Log all error properties
              if (error && typeof error === 'object') {
                console.error(`[Generate] Error properties:`, Object.keys(error));
                console.error(`[Generate] Full error object:`, error);
              }

              let errorMessage = "Generation failed";
              if (error instanceof DOMException && error.name === 'AbortError') {
                console.error(`[Generate] AbortError - Request was aborted (likely timeout)`);
                errorMessage = "Request timed out after 5 minutes. The Gemini API is taking too long to respond. Try reducing image sizes or using a simpler prompt.";
              } else if (error instanceof TypeError && error.message.includes('NetworkError')) {
                console.error(`[Generate] TypeError with NetworkError - likely Next.js Fast Refresh`);
                errorMessage = `Network error (likely caused by Next.js Fast Refresh during file save). The server may have completed successfully - check terminal logs. Avoid saving files during image generation.`;
              } else if (error instanceof TypeError) {
                console.error(`[Generate] TypeError detected - likely network/fetch issue`);
                errorMessage = `Network error: ${error.message}. This may indicate a connection issue or the response is too large.`;
              } else if (error instanceof Error) {
                errorMessage = error.message;
              }

              updateNodeData(node.id, {
                status: "error",
                error: errorMessage,
              });
              console.log(`[Generate] ===== GENERATION FAILED (EXCEPTION) =====`);
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
        }
      }

      set({ isRunning: false, currentNodeId: null });
    } catch (error) {
      console.error("Workflow execution error:", error);
      set({ isRunning: false, currentNodeId: null });
    }
  },

  stopWorkflow: () => {
    set({ isRunning: false, currentNodeId: null });
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
}));
