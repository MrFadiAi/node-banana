/**
 * Grid Splitter Utility
 *
 * Detects and splits contact sheet grids into component images.
 *
 * Uses a regularity-first approach that assumes grids are uniform,
 * scoring candidates based on how well the image dimensions divide
 * into cells with common photo aspect ratios.
 */

export interface GridCell {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GridDetectionResult {
  rows: number;
  cols: number;
  cells: GridCell[];
  confidence: number;
}

export interface GridCandidate {
  rows: number;
  cols: number;
  cellWidth: number;
  cellHeight: number;
  cellAspectRatio: number;
  score: number;
}

// Common photo/video aspect ratios (width:height)
// Ordered by likelihood in contact sheets
const COMMON_ASPECT_RATIOS = [
  16 / 9,   // 1.778 - Widescreen video (very common for storyboards)
  4 / 3,    // 1.333 - Standard photo/video
  3 / 2,    // 1.5 - DSLR photos
  1.85,     // 1.85:1 - Cinema flat
  2.39,     // 2.39:1 - Cinema scope
  1,        // 1:1 - Square
  9 / 16,   // 0.5625 - Portrait video
  3 / 4,    // 0.75 - Portrait photo
  2 / 3,    // 0.667 - Portrait DSLR
];

/**
 * Analyzes an image and detects grid boundaries.
 */
export async function detectGrid(imageDataUrl: string): Promise<GridDetectionResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = analyzeGridFromImageData(imageData);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    img.src = imageDataUrl;
  });
}

/**
 * Creates a grid result for a specific rows x cols configuration
 */
export function createGridForDimensions(
  width: number,
  height: number,
  rows: number,
  cols: number
): GridDetectionResult {
  const cellWidth = width / cols;
  const cellHeight = height / rows;

  const cells: GridCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        x: Math.round(col * cellWidth),
        y: Math.round(row * cellHeight),
        width: Math.round(cellWidth),
        height: Math.round(cellHeight),
      });
    }
  }

  return {
    rows,
    cols,
    cells,
    confidence: 1,
  };
}

/**
 * Detects grid with user-specified dimensions (most reliable)
 */
export async function detectGridWithDimensions(
  imageDataUrl: string,
  rows: number,
  cols: number
): Promise<GridDetectionResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const result = createGridForDimensions(img.width, img.height, rows, cols);
      resolve(result);
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    img.src = imageDataUrl;
  });
}

/**
 * Calculate how well an aspect ratio matches common ratios
 * Returns a score from 0 to 1 (1 = perfect match)
 */
function aspectRatioScore(aspectRatio: number): number {
  let bestMatch = Infinity;

  for (const commonAR of COMMON_ASPECT_RATIOS) {
    // Use ratio of ratios for symmetric comparison
    const ratio = aspectRatio > commonAR ? aspectRatio / commonAR : commonAR / aspectRatio;
    const distance = ratio - 1; // 0 = perfect match
    bestMatch = Math.min(bestMatch, distance);
  }

  // Convert to 0-1 score (exponential decay)
  // A 10% mismatch gives ~0.9 score, 50% gives ~0.6
  return Math.exp(-bestMatch * 3);
}

/**
 * Gets ranked grid candidates based on geometric analysis
 */
export function getGridCandidates(width: number, height: number): GridCandidate[] {
  const candidates: GridCandidate[] = [];
  const imageAspectRatio = width / height;

  // Test grid configurations from 1x2 to 6x6
  for (let rows = 1; rows <= 6; rows++) {
    for (let cols = 1; cols <= 6; cols++) {
      if (rows === 1 && cols === 1) continue; // Skip single cell

      const cellWidth = width / cols;
      const cellHeight = height / rows;
      const cellAspectRatio = cellWidth / cellHeight;

      // Score 1: How well does the cell aspect ratio match common ratios?
      const cellARScore = aspectRatioScore(cellAspectRatio);

      // Score 2: How well does the grid shape match the image shape?
      // A 3x2 grid in a 3:2 image is more likely than a 2x3 grid
      const gridAspectRatio = cols / rows;
      const layoutRatio = imageAspectRatio > gridAspectRatio
        ? imageAspectRatio / gridAspectRatio
        : gridAspectRatio / imageAspectRatio;
      const layoutScore = Math.exp(-(layoutRatio - 1) * 2);

      // Score 3: Prefer SIMPLER grids (fewer cells) - this prevents over-splitting
      // Images with internal details (like text labels) shouldn't cause extra splits
      // Sweet spot is 4-9 cells, penalize both extremes
      const cellCount = rows * cols;
      // Peak at 4-6 cells, decay for higher counts to prevent over-splitting
      const cellCountScore = cellCount <= 6
        ? 1.0  // 2-6 cells are all equally good
        : Math.exp(-(cellCount - 6) * 0.15); // Penalize higher cell counts

      // Score 4: Prefer square-ish grids (NxN or close)
      const gridSymmetry = 1 - Math.abs(rows - cols) / Math.max(rows, cols);

      // Combined score (higher is better)
      // Strong preference for good cell aspect ratios, weak preference for cell count
      const score =
        cellARScore * 0.55 +      // Cell aspect ratio is most important
        layoutScore * 0.25 +      // Grid should match image shape
        cellCountScore * 0.10 +   // Slight preference for simpler grids
        gridSymmetry * 0.10;      // Prefer symmetric grids

      candidates.push({
        rows,
        cols,
        cellWidth,
        cellHeight,
        cellAspectRatio,
        score,
      });
    }
  }

  // Sort by score (higher = better)
  return candidates.sort((a, b) => b.score - a.score);
}

/**
 * Core grid detection using regularity-first approach
 */
function analyzeGridFromImageData(imageData: ImageData): GridDetectionResult {
  const { width, height, data } = imageData;

  // Get candidates ranked by geometric plausibility
  const candidates = getGridCandidates(width, height);

  // Calculate edge strength profiles for validation/tiebreaking
  const verticalEdgeStrength = calculateVerticalEdgeProfile(data, width, height);
  const horizontalEdgeStrength = calculateHorizontalEdgeProfile(data, width, height);

  // Find the best candidate, using edge detection to validate/boost scores
  let bestCandidate = candidates[0];
  let bestCombinedScore = -Infinity;

  // Check top candidates
  for (const candidate of candidates.slice(0, 8)) {
    const edgeScore = scoreGridByEdges(
      candidate.rows,
      candidate.cols,
      width,
      height,
      verticalEdgeStrength,
      horizontalEdgeStrength
    );

    // Edge score is normalized 0-1, combine with geometric score
    // Give less weight to edges since they may not exist in gapless grids
    // and internal details (like text labels) can create misleading edges
    const combinedScore = candidate.score * 0.8 + edgeScore * 0.2;

    if (combinedScore > bestCombinedScore) {
      bestCombinedScore = combinedScore;
      bestCandidate = candidate;
    }
  }

  console.log(`[GridSplitter] Best candidate: ${bestCandidate.rows}x${bestCandidate.cols}, ` +
    `cell AR: ${bestCandidate.cellAspectRatio.toFixed(2)}, score: ${bestCandidate.score.toFixed(3)}`);

  // Build the grid cells
  const result = createGridForDimensions(width, height, bestCandidate.rows, bestCandidate.cols);
  result.confidence = bestCombinedScore;
  return result;
}

/**
 * Calculate vertical edge strength profile (for detecting vertical seams)
 */
function calculateVerticalEdgeProfile(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Float32Array {
  const profile = new Float32Array(width);

  for (let x = 1; x < width - 1; x++) {
    let totalGradient = 0;
    for (let y = 0; y < height; y++) {
      const idxLeft = (y * width + (x - 1)) * 4;
      const idxRight = (y * width + (x + 1)) * 4;

      const gradR = Math.abs(data[idxRight] - data[idxLeft]);
      const gradG = Math.abs(data[idxRight + 1] - data[idxLeft + 1]);
      const gradB = Math.abs(data[idxRight + 2] - data[idxLeft + 2]);

      totalGradient += (gradR + gradG + gradB) / 3;
    }
    profile[x] = totalGradient / height;
  }

  return profile;
}

/**
 * Calculate horizontal edge strength profile (for detecting horizontal seams)
 */
function calculateHorizontalEdgeProfile(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Float32Array {
  const profile = new Float32Array(height);

  for (let y = 1; y < height - 1; y++) {
    let totalGradient = 0;
    for (let x = 0; x < width; x++) {
      const idxUp = ((y - 1) * width + x) * 4;
      const idxDown = ((y + 1) * width + x) * 4;

      const gradR = Math.abs(data[idxDown] - data[idxUp]);
      const gradG = Math.abs(data[idxDown + 1] - data[idxUp + 1]);
      const gradB = Math.abs(data[idxDown + 2] - data[idxUp + 2]);

      totalGradient += (gradR + gradG + gradB) / 3;
    }
    profile[y] = totalGradient / width;
  }

  return profile;
}

/**
 * Score a grid configuration by how well it aligns with detected edges
 * Returns normalized score 0-1
 */
function scoreGridByEdges(
  rows: number,
  cols: number,
  width: number,
  height: number,
  verticalProfile: Float32Array,
  horizontalProfile: Float32Array
): number {
  // Calculate baseline (average edge strength across the image)
  let verticalSum = 0;
  for (let i = 0; i < verticalProfile.length; i++) {
    verticalSum += verticalProfile[i];
  }
  const verticalBaseline = verticalSum / verticalProfile.length;

  let horizontalSum = 0;
  for (let i = 0; i < horizontalProfile.length; i++) {
    horizontalSum += horizontalProfile[i];
  }
  const horizontalBaseline = horizontalSum / horizontalProfile.length;

  let totalRatio = 0;
  let divisions = 0;
  const searchWindow = Math.max(3, Math.floor(Math.min(width / cols, height / rows) * 0.03));

  // Check vertical division points
  if (cols > 1) {
    const cellWidth = width / cols;
    for (let i = 1; i < cols; i++) {
      const expectedPos = Math.round(cellWidth * i);
      let maxStrength = 0;

      for (let offset = -searchWindow; offset <= searchWindow; offset++) {
        const pos = expectedPos + offset;
        if (pos > 0 && pos < width - 1) {
          maxStrength = Math.max(maxStrength, verticalProfile[pos]);
        }
      }

      // How much stronger is this edge compared to baseline?
      const ratio = verticalBaseline > 0 ? maxStrength / verticalBaseline : 1;
      totalRatio += Math.min(ratio, 3); // Cap at 3x baseline
      divisions++;
    }
  }

  // Check horizontal division points
  if (rows > 1) {
    const cellHeight = height / rows;
    for (let i = 1; i < rows; i++) {
      const expectedPos = Math.round(cellHeight * i);
      let maxStrength = 0;

      for (let offset = -searchWindow; offset <= searchWindow; offset++) {
        const pos = expectedPos + offset;
        if (pos > 0 && pos < height - 1) {
          maxStrength = Math.max(maxStrength, horizontalProfile[pos]);
        }
      }

      const ratio = horizontalBaseline > 0 ? maxStrength / horizontalBaseline : 1;
      totalRatio += Math.min(ratio, 3);
      divisions++;
    }
  }

  if (divisions === 0) return 0;

  // Average ratio, normalized to 0-1 range
  // Ratio of 1 = baseline (no edge), ratio of 2+ = strong edge
  const avgRatio = totalRatio / divisions;
  return Math.min((avgRatio - 1) / 2, 1); // 0 at ratio=1, 1 at ratio=3+
}

/**
 * Splits an image into grid cells and returns them as separate data URLs
 */
export async function splitImage(
  imageDataUrl: string,
  grid: GridDetectionResult
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const results: string[] = [];

        for (const cell of grid.cells) {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
          }

          canvas.width = cell.width;
          canvas.height = cell.height;

          ctx.drawImage(
            img,
            cell.x,
            cell.y,
            cell.width,
            cell.height,
            0,
            0,
            cell.width,
            cell.height
          );

          results.push(canvas.toDataURL("image/png"));
        }

        resolve(results);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    img.src = imageDataUrl;
  });
}

/**
 * Detect grid using Gap/Gutter Detection (Projection Profile)
 * Sums pixel brightness across rows/cols to find continuous black gaps.
 * Much more robust for images with dark content than simple thresholding.
 */
export async function detectGridWithGutters(imageDataUrl: string): Promise<GridDetectionResult | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(null);
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const { width, height } = canvas;
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      // 1. Calculate Projection Profiles (Sum of brightness)
      const colSums = new Float32Array(width).fill(0);
      const rowSums = new Float32Array(height).fill(0);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          colSums[x] += brightness;
          rowSums[y] += brightness;
        }
      }

      // 2. Find Gaps (Valleys in the profile)
      // A "gap" is a continuous run of low-brightness columns/rows
      // We normalize by row/col length to look for average darkness
      const isColumnGap = (x: number) => (colSums[x] / height) < 30; // Avg brightness < 30 (very dark)
      const isRowGap = (y: number) => (rowSums[y] / width) < 30;

      // Helper to find intervals of CONTENT (non-gaps)
      function findIntervals(length: number, isGapFn: (i: number) => boolean) {
        const intervals: { start: number, end: number, size: number }[] = [];
        let inContent = false;
        let start = 0;

        for (let i = 0; i < length; i++) {
          if (!isGapFn(i)) {
            if (!inContent) {
              inContent = true;
              start = i;
            }
          } else {
            if (inContent) {
              inContent = false;
              intervals.push({ start, end: i - 1, size: i - start });
            }
          }
        }
        if (inContent) {
          intervals.push({ start, end: length - 1, size: length - start });
        }

        // Filter out tiny intervals (noise/lines) - must be > 5% of dimension
        return intervals.filter(iv => iv.size > length * 0.05);
      }

      const colIntervals = findIntervals(width, isColumnGap); // X ranges
      const rowIntervals = findIntervals(height, isRowGap);   // Y ranges

      console.log(`[GridSplitter] Gutter detection: ${rowIntervals.length} rows, ${colIntervals.length} cols`);

      if (rowIntervals.length === 0 || colIntervals.length === 0) {
        resolve(null);
        return;
      }

      // 3. Construct Grid Cells from Intersections
      const cells: GridCell[] = [];

      for (const rowIv of rowIntervals) {
        for (const colIv of colIntervals) {
          cells.push({
            x: colIv.start,
            y: rowIv.start,
            width: colIv.size,
            height: rowIv.size
          });
        }
      }

      // 4. Exclude Text Labels (Heuristic)
      // If we have "pairs" of rows where one is small and below a large one, it's likely a label
      // Actually, standard grid usually has equal sized main cells. 
      // Let's filter cells that are significantly smaller than the median cell size
      const areas = cells.map(c => c.width * c.height);
      areas.sort((a, b) => a - b);
      const medianArea = areas[Math.floor(areas.length / 2)];

      const validCells = cells.filter(c => {
        const area = c.width * c.height;
        return area > medianArea * 0.5; // Only keep checks > 50% of median size
      });

      console.log(`[GridSplitter] Final valid cells: ${validCells.length}`);

      resolve({
        rows: rowIntervals.length,  // Approximate, might include text rows initially
        cols: colIntervals.length,
        cells: validCells,
        confidence: 0.95
      });
    };

    img.onerror = () => resolve(null);
    img.src = imageDataUrl;
  });
}

/**
 * Convenience function that detects and splits in one call.
 * Uses Deterministic Contours detection (Computer Vision).
 */
export async function detectAndSplitGrid(imageDataUrl: string): Promise<{
  grid: GridDetectionResult;
  images: string[];
}> {
  // Use robust Gutter detection (no AI)
  console.log("[GridSplitter] Attempting Gutter/Gap detection...");
  let grid = await detectGridWithGutters(imageDataUrl);

  // Fall back to heuristic detection if computer vision fails completely
  if (!grid || grid.cells.length < 2) {
    console.log("[GridSplitter] Gutter detection failed, falling back to heuristic...");
    grid = await detectGrid(imageDataUrl);
  }

  const images = await splitImage(imageDataUrl, grid);
  return { grid, images };
}

/**
 * Split with user-specified dimensions (most reliable method)
 */
export async function splitWithDimensions(
  imageDataUrl: string,
  rows: number,
  cols: number
): Promise<{
  grid: GridDetectionResult;
  images: string[];
}> {
  const grid = await detectGridWithDimensions(imageDataUrl, rows, cols);
  const images = await splitImage(imageDataUrl, grid);
  return { grid, images };
}

