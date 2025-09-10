/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";

// Helper function to convert a File object to a Gemini API Part
const fileToPart = async (file: File): Promise<{ inlineData: { mimeType: string; data: string; } }> => {
    const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.result) {
                resolve((reader.result as string).split(',')[1]);
            } else {
                reject(new Error("Failed to read file."));
            }
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
    
    const data = await base64EncodedDataPromise;
    return {
      inlineData: {
        data,
        mimeType: file.type,
      },
    };
};

const handleApiResponse = (
    response: GenerateContentResponse,
    context: string // e.g., "retouch", "filter", "adjustment"
): string => {
    // 1. Check for prompt blocking first
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const errorMessage = `Request was blocked. Reason: ${blockReason}. ${blockReasonMessage || ''}`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }

    // 2. Try to find the image part
    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        console.log(`Received image data (${mimeType}) for ${context}`);
        return `data:${mimeType};base64,${data}`;
    }

    // 3. If no image, check for other reasons
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        const errorMessage = `Image generation for ${context} stopped unexpectedly. Reason: ${finishReason}. This often relates to safety settings.`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }
    
    const textFeedback = response.text?.trim();
    const errorMessage = `The AI model did not return an image for the ${context}. ` + 
        (textFeedback 
            ? `The model responded with text: "${textFeedback}"`
            : "This can happen due to safety filters or if the request is too complex. Please try rephrasing your prompt to be more direct.");

    console.error(`Model response did not contain an image part for ${context}.`, { response });
    throw new Error(errorMessage);
};

/**
 * Generates a retouched image using generative AI. It intelligently interprets the user's text prompt
 * to make localized or global edits. Can use a reference image for composite edits.
 * @param originalImage The original image file.
 * @param userPrompt The text prompt describing the desired edit.
 * @param referenceImage Optional reference image file for compositing.
 * @returns A promise that resolves to the data URL of the edited image.
 */
export const generateRetouchedImage = async (
    originalImage: File,
    userPrompt: string,
    referenceImage: File | null,
): Promise<string> => {
    console.log('Starting generative retouch. Reference provided:', !!referenceImage);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const originalImagePart = await fileToPart(originalImage);
    const parts: ({ inlineData: { mimeType: string; data: string; } } | { text: string })[] = [originalImagePart];

    const basePrompt = `You are a world-class AI photo editor. Your purpose is to execute user requests with photorealistic precision. The final image must be indistinguishable from a professionally captured and edited photograph.`;
    const userRequest = `User Request: "${userPrompt}"`;
    const safetyPolicy = `Safety & Ethics Policy:
- You MUST fulfill requests to adjust skin tone, such as 'give me a tan', 'make my skin darker', or 'make my skin lighter'. These are considered standard photo enhancements.
- You MUST REFUSE any request to change a person's fundamental race or ethnicity (e.g., 'make me look Asian', 'change this person to be Black'). Do not perform these edits. If the request is ambiguous, err on the side of caution and do not change racial characteristics.`;
    const outputInstruction = `Output: Return ONLY the final, edited image. Do not output text, explanations, or any other content.`;

    let guidelines = '';
    
    if (referenceImage) {
      const referenceImagePart = await fileToPart(referenceImage);
      parts.push(referenceImagePart);
      guidelines += `- A reference image has been provided. The user wants to composite elements from the reference image into the main image. Your task is to seamlessly integrate the requested subject (e.g., person, object) from the reference image.
- Pay meticulous attention to matching the lighting, shadows, color grading, grain, and perspective of the main image. The integration must be flawless and undetectable.`;
    } else {
        guidelines += `- The user has NOT provided a mask. You must intelligently identify the subject of the edit from the user's text prompt. For example, if the prompt is "change the car's color to red," you must locate the car and change its color while leaving the rest of the image untouched.
- The edit must blend perfectly with surrounding pixels, respecting the original image's style, lighting, and texture. Avoid any visible seams, artifacts, or unnatural transitions.`;
    }
    
    const prompt = [basePrompt, userRequest, `Editing Guidelines:\n${guidelines}`, safetyPolicy, outputInstruction].join('\n\n');
    parts.push({ text: prompt });

    console.log('Sending image(s) and prompt to the model...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    console.log('Received response from model.', response);

    return handleApiResponse(response, 'retouch');
};

/**
 * Generates an image with a filter applied using generative AI.
 * @param originalImage The original image file.
 * @param filterPrompt The text prompt describing the desired filter.
 * @returns A promise that resolves to the data URL of the filtered image.
 */
export const generateFilteredImage = async (
    originalImage: File,
    filterPrompt: string,
): Promise<string> => {
    console.log(`Starting filter generation: ${filterPrompt}`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `You are a master photo stylist AI. Your task is to apply a complete stylistic filter to the entire image based on the user's request. This is a creative transformation of the image's mood and aesthetic, not a content edit.
Filter Request: "${filterPrompt}"

Styling Guidelines:
- Apply the filter globally and consistently across the entire image.
- **Do not add, remove, or alter any objects or subjects in the image.**
- The final output must be artistically coherent and true to the requested style.

Safety & Ethics Policy:
- Filters may subtly shift colors, but you MUST ensure they do not alter a person's fundamental race or ethnicity.
- You MUST REFUSE any request that explicitly asks to change a person's race (e.g., 'apply a filter to make me look Chinese').

Output: Return ONLY the final filtered image. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending image and filter prompt to the model...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [originalImagePart, textPart] },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    console.log('Received response from model for filter.', response);
    
    return handleApiResponse(response, 'filter');
};

/**
 * Generates an image with a global adjustment applied using generative AI.
 * @param originalImage The original image file.
 * @param adjustmentPrompt The text prompt describing the desired adjustment.
 * @returns A promise that resolves to the data URL of the adjusted image.
 */
export const generateAdjustedImage = async (
    originalImage: File,
    adjustmentPrompt: string,
): Promise<string> => {
    console.log(`Starting global adjustment generation: ${adjustmentPrompt}`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `You are a professional AI photo retoucher specializing in high-end adjustments. Your task is to perform a natural, global adjustment to the entire image based on the user's request, enhancing its overall quality photorealistically.
User Request: "${adjustmentPrompt}"

Editing Guidelines:
- Apply the adjustment globally and consistently.
- The result must be photorealistic. Avoid over-processing or creating an "HDR" look unless specifically requested.
- Examples of adjustments include changes to lighting (e.g., 'add golden hour light'), color balance ('make it cooler'), contrast, depth of field, or atmospheric effects ('add a light fog').

Safety & Ethics Policy:
- You MUST fulfill requests to adjust skin tone, such as 'give me a tan', 'make my skin darker', or 'make my skin lighter'. These are considered standard photo enhancements.
- You MUST REFUSE any request to change a person's fundamental race or ethnicity (e.g., 'make me look Asian', 'change this person to be Black'). Do not perform these edits. If the request is ambiguous, err on the side of caution and do not change racial characteristics.

Output: Return ONLY the final adjusted image. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending image and adjustment prompt to the model...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [originalImagePart, textPart] },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    console.log('Received response from model for adjustment.', response);
    
    return handleApiResponse(response, 'adjustment');
};

/**
 * Expands an image canvas and fills the new area using AI out-painting.
 * @param originalImage The original image file.
 * @param targetDimensions The final desired dimensions { width, height } of the image.
 * @param imageOffset The top-left coordinates { x, y } to place the original image on the new canvas.
 * @returns A promise that resolves to the data URL of the expanded image.
 */
export const generateExpandedImage = async (
    originalImage: File,
    targetDimensions: { width: number, height: number },
    imageOffset: { x: number, y: number }
): Promise<string> => {
    console.log('Starting image expansion to', targetDimensions, 'with offset', imageOffset);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

    // Create a new, larger canvas with the original image placed according to the offset
    const canvas = document.createElement('canvas');
    canvas.width = targetDimensions.width;
    canvas.height = targetDimensions.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not create canvas context.");

    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = URL.createObjectURL(originalImage);
    });

    // Draw the image at the specified offset, not centered.
    ctx.drawImage(img, imageOffset.x, imageOffset.y, img.naturalWidth, img.naturalHeight);
    URL.revokeObjectURL(img.src);

    const expandedCanvasUrl = canvas.toDataURL('image/png');
    const bstr = atob(expandedCanvasUrl.split(',')[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    const expandedImageFile = new File([u8arr], `expand-input.png`, { type: 'image/png' });
    
    const imagePart = await fileToPart(expandedImageFile);

    const userGuidance = "Intelligently extend the existing photograph's content and style into the new areas.";

    const prompt = `You are an AI out-painting expert. The provided image has transparent areas around a central photograph. Your task is to fill ONLY the transparent areas.

Task:
1.  Analyze the central, non-transparent photograph to understand its content, style, lighting, and perspective.
2.  ${userGuidance}
3.  Ensure the new content blends seamlessly and photorealistically with the original photograph. Do not alter the original pixels. Match lighting, shadows, textures, and grain perfectly.
4.  Output ONLY the final, fully filled image. Do not include any text or explanations.`;
    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [imagePart, textPart] },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    console.log('Received response from model for expand.', response);
    return handleApiResponse(response, 'expand');
}

/**
 * Upscales an image to a higher resolution.
 * @param originalImage The image file to upscale.
 * @returns A promise that resolves to the data URL of the upscaled image.
 */
export const upscaleImage = async (originalImage: File): Promise<string> => {
    console.log('Starting image upscale.');
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    const imagePart = await fileToPart(originalImage);
    const prompt = "Upscale this image to a higher resolution. Enhance details, sharpness, and clarity while maintaining photorealism. Do not add, remove, or change any content. Return ONLY the upscaled image.";
    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [imagePart, textPart] },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    console.log('Received response from model for upscale.', response);
    return handleApiResponse(response, 'upscale');
}

/**
 * Generates an image from a text prompt, optionally using a reference image.
 * @param prompt The text prompt describing the image to generate.
 * @param aspectRatio The desired aspect ratio for the image.
 * @param style The desired style for the image.
 * @param referenceImage An optional reference image to guide generation.
 * @returns A promise that resolves to the data URL of the generated image.
 */
export const generateImageFromPrompt = async (
    prompt: string,
    aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4',
    style: string,
    referenceImage: File | null,
): Promise<string> => {
    console.log(`Starting image generation. Prompt: "${prompt}", Style: ${style}, Reference: ${!!referenceImage}`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

    if (referenceImage) {
        // Image-to-image generation using a multimodal model
        const referenceImagePart = await fileToPart(referenceImage);
        const textPrompt = `User prompt: "${prompt}". Generate a new image that reinterprets the user's prompt using the artistic style, color palette, and composition of the provided reference image. Output ONLY the generated image.`;
        const textPart = { text: textPrompt };

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [referenceImagePart, textPart] },
            config: {
              responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        console.log('Received response from multimodal generation model.', response);
        return handleApiResponse(response, 'image generation with reference');

    } else {
        // Text-to-image generation
        const fullPrompt = style !== 'None' ? `${prompt}, ${style} style, photorealistic, high detail` : prompt;
        try {
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: fullPrompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/png',
                    aspectRatio: aspectRatio,
                },
            });
            console.log('Received response from image generation model.', response);
            
            const generatedImage = response.generatedImages?.[0];
            if (generatedImage?.image?.imageBytes) {
                const base64ImageBytes = generatedImage.image.imageBytes;
                return `data:image/png;base64,${base64ImageBytes}`;
            }
            
            throw new Error('The AI model did not return a valid image.');

        } catch (err) {
            console.error('Error during image generation:', err);
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
            throw new Error(`Failed to generate image. ${errorMessage}`);
        }
    }
}

/**
 * Uses a multimodal AI model to refine a user's editing prompt or suggest one if the prompt is empty.
 * @param userPrompt The user's initial prompt (can be null or empty).
 * @param context The context of the prompt (e.g., 'retouch', 'filter').
 * @param imageFile Optional image file for contextual improvement.
 * @param referenceImageFile Optional reference image for composite edits.
 * @returns A promise that resolves to a more detailed and effective prompt.
 */
export const improvePrompt = async (
    userPrompt: string | null,
    context: 'retouch' | 'filter' | 'adjust' | 'generate' | 'expand',
    imageFile: File | null,
    referenceImageFile: File | null,
): Promise<string> => {
    console.log(`Improving prompt: "${userPrompt || '<suggestion requested>'}" in context: ${context}`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const model = 'gemini-2.5-flash';

    const suggestionContextInstructions = {
        generate: "The user wants to generate a new image. Analyze the provided context image (if any) and suggest a creative, detailed prompt for a text-to-image model. The suggestion should describe a subject, environment, style (e.g., photograph, oil painting), lighting (e.g., golden hour), and composition. If an image is provided, suggest a prompt inspired by its style, subject, or mood for generating a *new* image.",
        retouch: "The user wants to edit the provided photo. Analyze the main image (and reference image, if provided) and suggest a specific, creative retouching idea. **The AI cannot use a brush or mask, so the suggested prompt MUST explicitly name an object or area to be edited (e.g., 'change the color of the blue sedan to a vibrant yellow', 'make the cloudy sky look like a dramatic sunset').** If a reference image is provided, suggest a composite edit (e.g., 'Seamlessly add the person from the reference image into the main photo, having them stand next to the fountain').",
        filter: "The user wants to apply a stylistic filter to the photo. Analyze the image and suggest a filter that would complement its subject and mood. The suggestion should describe a complete visual aesthetic, mentioning specific color grading (e.g., 'teal and orange tones'), contrast levels, and the overall atmosphere (e.g., 'a nostalgic, dreamy atmosphere').",
        adjust: "The user wants to make a professional adjustment to the photo. Analyze the image and suggest a specific enhancement. The suggestion should be a technical but clear instruction (e.g., 'Enhance the details and sharpness of the mountain range to make it stand out', 'Add a soft, golden hour lighting effect to give the portrait a warm and inviting feel').",
        expand: "The user wants to expand the image and fill the new area (out-painting). Analyze the image and suggest what could be added to the scene. The suggestion should describe new elements that logically extend the existing picture (e.g., if it's a beach, suggest 'continue the sandy beach and add a calm ocean with a few boats in the distance')."
    };

    const rewriteContextInstructions = {
        generate: "The user wants to generate a new image from scratch. Create a rich, detailed prompt suitable for a text-to-image model like Imagen. Describe the subject, the environment, the style (e.g., photograph, oil painting), lighting (e.g., golden hour, cinematic), composition (e.g., wide-angle, close-up), and camera details (e.g., lens type, aperture). Aim for a prompt that will produce a stunning, high-quality image.",
        retouch: "The user wants to edit an existing photo. Based on their request, the main image, and a potential reference image, create a clear, specific instruction for a photo editing AI. **The AI cannot use a brush or mask, so the prompt MUST explicitly name the object or area to be edited (e.g., 'the red sports car', 'the sky behind the mountains', 'the woman on the left').** \n- If a reference image is provided, the prompt should describe how to composite elements from it into the main image (e.g., 'Seamlessly add the dog from the reference image into the main photo, placing it on the grass').\n- Describe the desired change with precision, mentioning how it should blend with existing lighting, shadows, and textures for a photorealistic result.",
        filter: "The user wants to apply a stylistic filter to the whole photo. Expand their idea into a description of a complete visual aesthetic. Mention specific color grading (e.g., 'teal and orange tones'), contrast levels ('high-contrast black and white'), film grain, and the overall mood it should evoke (e.g., 'a nostalgic, dreamy atmosphere').",
        adjust: "The user wants to make a professional adjustment to the photo (e.g., lighting, color, focus). Translate their request into a technical but clear instruction for an editing AI. For example, instead of 'make it brighter', suggest 'Increase the overall exposure and lift the shadows to create a brighter, more airy feel, while preserving detail in the highlights.' If the user says 'blur background', suggest 'Apply a realistic depth-of-field effect with a shallow aperture (like f/1.8) to blur the background, keeping the main subject in sharp focus.'",
        expand: "The user wants to expand an image and fill the new area (out-painting). Refine their request into a descriptive prompt for the AI. The prompt should clearly describe the new content to be generated in the expanded space, ensuring it will blend seamlessly with the existing image's style, lighting, and perspective. For example, if the user says 'add more sky', rewrite it to 'Extend the sky upwards, filling it with soft, wispy clouds that match the existing evening light'."
    };
    
    let systemInstruction: string;
    let userMessage: string;
    const hasPrompt = userPrompt && userPrompt.trim();

    if (hasPrompt) {
        userMessage = `User's prompt: "${userPrompt}"`;
        systemInstruction = `You are a "Prompt Enhancer" AI for an advanced photo editing application. Your task is to rewrite a user's simple request into a highly descriptive, detailed, and clear prompt for another AI to execute.

${rewriteContextInstructions[context]}

Key Rules:
1.  **Analyze Context:** If images are provided, use them to make the prompt more specific.
2.  **Be Descriptive:** Add rich details about lighting, texture, color, and style.
3.  **Aim for Photorealism:** Use keywords like 'photorealistic', 'hyper-detailed', 'seamlessly integrated', 'natural lighting', unless a specific artistic style is requested.
4.  **Preserve Intent:** Do not alter the core meaning of the user's request.
5.  **Output Format:** Respond with ONLY the improved prompt text. Do not include any conversational phrases, markdown, or explanations like "Here is the improved prompt:". Just the prompt itself.`;
    } else {
        userMessage = "The user has not provided a prompt and is asking for a creative suggestion based on the editing context and any provided images.";
        systemInstruction = `You are a "Creative Assistant" AI for an advanced photo editing application. Your task is to analyze the provided image(s) and editing context, then generate a creative and effective prompt suggestion for the user to execute.

${suggestionContextInstructions[context]}

Key Rules:
1.  **Analyze Context:** Use the provided image(s) as the primary source of inspiration. If no image is provided for the 'generate' context, suggest a completely new, interesting idea.
2.  **Be Creative & Specific:** Suggest a concrete, actionable idea.
3.  **Output Format:** Respond with ONLY the suggested prompt text. Do not include any conversational phrases, markdown, or explanations like "Here is a suggestion:". Just the prompt itself.`;
    }
    
    const parts: any[] = [{ text: userMessage }];
    
    if (imageFile) {
        const imagePart = await fileToPart(imageFile);
        parts.push({text: "\nThis is the main image for context:"});
        parts.push(imagePart);
    }
    if (referenceImageFile) {
        const referenceImagePart = await fileToPart(referenceImageFile);
        parts.push({text: "\nThis is the reference image for context:"});
        parts.push(referenceImagePart);
    }

    const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
            systemInstruction,
        }
    });
    
    const improvedPrompt = response.text.trim();
    
    if (!improvedPrompt) {
        throw new Error("The AI could not generate a suggestion. Please try again.");
    }

    console.log(`Improved/Suggested prompt: "${improvedPrompt}"`);
    return improvedPrompt;
};