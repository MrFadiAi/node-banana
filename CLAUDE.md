# Node Banana - Development Guide

## Model
The application uses these models for image generation. These models are very recently released and do exist. 
gemini-3-pro-image-preview
gemini-2.5-flash-preview-image-generation



## Node Connection System

### Handle Types

Nodes communicate through typed handles. Each handle has a **data type** that determines what connections are valid.

| Handle Type | Data Format | Description |
|-------------|-------------|-------------|
| `image` | Base64 data URL | Visual content (photos, generated images, annotated images) |
| `text` | String | Text content (user prompts, LLM outputs, transformed text) |

### Connection Rules

1. **Type Matching**: Handles can only connect to handles of the same type
   - `image` → `image` (valid)
   - `text` → `text` (valid)
   - `image` → `text` (invalid)

2. **Direction**: Connections flow from `source` (output) to `target` (input)

3. **Multiplicity**:
   - Image inputs on generation nodes accept multiple connections (for multi-image context)
   - Text inputs accept single connections (last connected wins)

### Data Flow in `getConnectedInputs`

When a node executes, it retrieves connected inputs via `getConnectedInputs(nodeId)` in `workflowStore.ts`. This function returns `{ images: string[], text: string | null }`.

**For `image` handles, extract from:**
- `imageInput` → `data.image`
- `annotation` → `data.outputImage`
- `nanoBanana` → `data.outputImage`

**For `text` handles, extract from:**
- `prompt` → `data.prompt`
- `llmGenerate` → `data.outputText`

### Adding New Node Types

When creating a new node type:

1. **Define the data interface** in `src/types/index.ts`
2. **Add to `NodeType` union** in `src/types/index.ts`
3. **Create default data** in `createDefaultNodeData()` in `workflowStore.ts`
4. **Add dimensions** to `defaultDimensions` in `workflowStore.ts`
5. **Create the component** in `src/components/nodes/`
6. **Export from** `src/components/nodes/index.ts`
7. **Register in nodeTypes** in `WorkflowCanvas.tsx`
8. **Add minimap color** in `WorkflowCanvas.tsx`
9. **Update `getConnectedInputs`** if the node produces output that other nodes consume
10. **Add execution logic** in `executeWorkflow()` if the node requires processing
11. **Update `ConnectionDropMenu.tsx`** to include the node in appropriate source/target lists

### Handle Naming Convention

Use descriptive handle IDs that match the data type:
- `id="image"` for image data
- `id="text"` for text data

Future handle types might include:
- `audio` - for audio data
- `video` - for video data
- `json` - for structured data
- `number` - for numeric values

### Validation

Connection validation happens in `isValidConnection()` in `WorkflowCanvas.tsx`. Update this function if adding new handle types with specific rules.

Workflow validation happens in `validateWorkflow()` in `workflowStore.ts`. Add checks for required inputs on new node types.
