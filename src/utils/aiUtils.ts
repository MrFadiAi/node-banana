/**
 * Expands an image to 3:2 aspect ratio using the Gemini API (nano-banana-pro).
 * Returns the generated image data URL or throws an error.
 */
export async function expandImage3x2(imageDataUrl: string): Promise<string> {
    const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "nano-banana-pro",
            prompt: "Expand this image to fill a 3:2 aspect ratio contextually. Keep the original subject intact but extend the background to fit the new wide format.",
            images: [imageDataUrl],
            aspectRatio: "3:2",
            resolution: "1K",
        }),
    });

    if (!response.ok) {
        throw new Error("Generation failed");
    }

    const result = await response.json();
    if (result.success && result.image) {
        return result.image;
    } else {
        throw new Error(result.error || "Unknown error");
    }
}
