// netlify/functions/generate.js

export const handler = async (event) => {
    // 1. Handle Preflight Request (CORS)
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { prompt, reference, style, font, lighting, ratio, language, userApiKey } = JSON.parse(event.body);
        
        let apiKey = userApiKey;
        if (!apiKey || apiKey.trim() === "") {
            apiKey = process.env.GEMINI_API_KEY;
        }

        if (!apiKey) {
            console.error("FATAL: No API KEY found.");
            throw new Error("API Key tidak ditemukan. Mohon masukkan API Key Anda di kolom input atas.");
        }

        // SYSTEM PROMPT: EXTREME DIRECTOR MODE + DYNAMIC TYPOGRAPHY
        const systemPrompt = `
**ROLE:**
You are a World-Class Commercial Creative Director specializing in High-Impact Advertising & Nano Banana Pro (Gemini Image 3).
Your goal is "Dynamic", "Explosive", and "Scroll-Stopping" visuals. 
**NEVER be boring. NEVER be flat.**

**TASK:**
Convert user ideas into a sophisticated, highly detailed JSON Prompt. 
"Hallucinate" excessive details (textures, lighting, physics) to make it look expensive.

**CRITICAL SYNTAX RULES:**
1. **ESCAPE QUOTES:** If a text description contains a quote, you MUST escape it. (e.g., "The sign says \\"HELLO\\"")
2. **NO COMMENTS:** Do not add // comments inside the JSON.
3. **COMPLETE JSON:** Do not stop generating until the final closing brace '}' is written.

**MANDATORY JSON SCHEMA:**
{
  "prompt": {
    "type": "Select best fit: Cinematic / High-Speed / Minimalist / Surreal / 3D Render",
    "subject_context": "Short context of the ad/image",
    "composition_logic": {
      "angle": "Dynamic Camera angle (e.g., Dutch Tilt, Worm's Eye, Macro). Avoid flat angles.",
      "depth_layering": "Explicitly define Foreground, Middleground, and Background.",
      "focus": "Focus point and depth of field details"
    },
    "visual_elements": {
      "main_subject": "High-detail description of the main object/product (textures, materials).",
      "action_elements": "MANDATORY: Add dynamic movement (flying debris, splashes, steam, light leaks).",
      "environment": "Background setting description with specific materials."
    },
    "typography_content": {
      "headline": "Main text",
      "sub_headline": "Secondary text",
      "cta_button": "Call to Action text"
    },
    "text_integration_styling": {
      "headline_style": {
        "font": "Font vibe description",
        "placement": "CRITICAL: The text MUST NOT be flat. USE EXTREME PERSPECTIVE. Instructions: 1. WARPING (Curve the text around the object). 2. ZOOM (Make one word huge and another small). 3. TILT (Follow the camera angle). 4. OCCLUSION (The object must block parts of the text).",
        "material_and_lighting": "Define text material (e.g., 'Neon tube', 'Gold', 'Ice', 'Clouds')."
      },
      "cta_style": "Describe the button as a physical object (e.g., 'Glass pill', 'Metal tag')."
    },
    "lighting_and_atmosphere": {
      "lighting_setup": "Complex lighting (e.g., Rim Light, Volumetric Rays, Neon Split).",
      "special_effects": "Lens flares, chromatic aberration, film grain, bokeh."
    },
    "color_palette": {
      "primary": "Hex/name",
      "secondary": "Hex/name",
      "contrast": "Hex/name"
    }
  }
}
`;

        let constraints = "";
        
        // 1. Handle Reference Image Input
        if (reference && reference.trim() !== "") {
            constraints += `\n**REFERENCE IMAGE CONTEXT:**\nThe user has provided a description of a specific reference image/sketch: "${reference}".\nINSTRUCTION: You MUST incorporate the visual elements of this reference into the 'visual_elements' or 'text_integration_styling' section. Ensure the generated prompt reflects this reference.\n`;
        }

        // 2. Handle Other Constraints
        if (style || font || lighting || ratio || language) {
            constraints += "\n**CRITICAL USER OVERRIDES (YOU MUST FOLLOW THESE):**\n";
            if (style) constraints += `- Visual Style: Force the image style to be "${style}".\n`;
            if (font) constraints += `- Typography Style: Use "${font}" font style for the text.\n`;
            if (lighting) constraints += `- Lighting & Atmosphere: Enforce "${lighting}" mood.\n`;
            if (ratio) constraints += `- Aspect Ratio Target: ${ratio} (Adjust composition logic to fit this frame).\n`;
            if (language) constraints += `- Text Language: Ensure spelling of text content is strictly in "${language}".\n`;
        }

        async function getAvailableModel() {
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const response = await fetch(listUrl);
            const data = await response.json();

            if (data.error) throw new Error(`Gagal cek model (Cek API Key Anda): ${data.error.message}`);
            if (!data.models) throw new Error("API Key valid tapi tidak ada model yang tersedia.");

            const flashModel = data.models.find(m => m.name.includes('flash') && m.supportedGenerationMethods.includes('generateContent'));
            const proModel = data.models.find(m => m.name.includes('pro') && m.supportedGenerationMethods.includes('generateContent'));
            const anyModel = data.models.find(m => m.supportedGenerationMethods.includes('generateContent'));

            const selected = flashModel || proModel || anyModel;
            if (!selected) throw new Error("Tidak ditemukan model yang mendukung 'generateContent' di akun ini.");

            return selected.name.replace('models/', '');
        }

        async function runInference() {
            const modelName = await getAvailableModel();
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            
            const finalPrompt = `SYSTEM INSTRUCTION:\n${systemPrompt}\n${constraints}\nUSER INPUT:\n${prompt}`;

            const payload = {
                contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
                generationConfig: {
                    temperature: 0.75, 
                    maxOutputTokens: 8192, 
                    responseMimeType: "application/json"
                }
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            if (!data.candidates || data.candidates.length === 0) throw new Error("Empty candidates");

            return data.candidates[0].content.parts[0].text;
        }

        const rawText = await runInference();

        // --- JSON CLEANING LOGIC (SMART CLEANER) ---
        let cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        const firstBrace = cleanJson.indexOf('{');
        const lastBrace = cleanJson.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
            cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
        }
        
        let jsonResult;
        try {
            jsonResult = JSON.parse(cleanJson);
        } catch (e) {
            console.warn("Standard JSON Parse failed, attempting Loose Parse...");
            try {
                jsonResult = (new Function(`return ${cleanJson}`))();
            } catch (e2) {
                console.error("All parsing failed.", e2);
                jsonResult = { 
                    "error": "Maaf, AI terlalu kreatif dan merusak format JSON. Silakan coba lagi.",
                    "raw_output": cleanJson 
                };
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: jsonResult })
        };

    } catch (error) {
        console.error("Function execution failed:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Gagal: ${error.message}` })
        };
    }
};
