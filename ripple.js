const canvas = document.getElementById('rippleCanvas');
const ctx = canvas.getContext('2d');
const imageUpload = document.getElementById('imageUpload');

// --- Shader Parameters (can be adjusted) ---
const amplitude = 0.05;   // Strength of the displacement
const frequency = 15.0;    // Frequency of the ripple
const decay = 8.0;         // How quickly the ripple fades out
const speed = 2.0;         // Speed of ripple propagation
// -------------------------------------------

let sourceImage = new Image();
let sourceImageData = null; // To store pixel data of the source image
let outputImageData = null; // To store pixel data for the canvas output

let startTime = Date.now();
let mouseOrigin = { x: 0.5, y: 0.5 }; // Normalized mouse coordinates [0,1]
let mouseActive = false; // Becomes true when mouse first enters canvas

// Default image (using a public domain image from Picsum Photos)
// Using a specific image to ensure it's available. Replace with your preferred default.
const defaultImageUrl = 'https://picsum.photos/seed/shadertoyripple/600/400';

function loadImage(src) {
    sourceImage.crossOrigin = "Anonymous"; // Important for fetching images from other domains
    sourceImage.onload = () => {
        // Set canvas size to image size
        // For better performance, you might want to cap this or use a fixed size
        const aspectRatio = sourceImage.width / sourceImage.height;
        let canvasWidth = sourceImage.width;
        let canvasHeight = sourceImage.height;

        // Optional: resize if image is too large to maintain performance
        const MAX_DIMENSION = 600; // Max width or height
        if (canvasWidth > MAX_DIMENSION || canvasHeight > MAX_DIMENSION) {
            if (aspectRatio > 1) { // Landscape
                canvasWidth = MAX_DIMENSION;
                canvasHeight = MAX_DIMENSION / aspectRatio;
            } else { // Portrait or square
                canvasHeight = MAX_DIMENSION;
                canvasWidth = MAX_DIMENSION * aspectRatio;
            }
        }
        
        canvas.width = Math.round(canvasWidth);
        canvas.height = Math.round(canvasHeight);

        // Create an offscreen canvas to get image data easily and correctly
        // This avoids issues with getImageData on a scaled canvas
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = sourceImage.width; // Use original image dimensions for sampling
        offscreenCanvas.height = sourceImage.height;
        const offscreenCtx = offscreenCanvas.getContext('2d');
        offscreenCtx.drawImage(sourceImage, 0, 0, sourceImage.width, sourceImage.height);
        sourceImageData = offscreenCtx.getImageData(0, 0, sourceImage.width, sourceImage.height);

        // Prepare output data buffer for the main canvas
        outputImageData = ctx.createImageData(canvas.width, canvas.height);
        
        startTime = Date.now(); // Reset time for animation
        if (!animationFrameId) { // Start animation if not already running
          requestAnimationFrame(draw);
        }
    };
    sourceImage.onerror = () => {
        console.error("Failed to load image:", src);
        ctx.clearRect(0,0,canvas.width, canvas.height);
        ctx.fillStyle = "red";
        ctx.fillText("Error loading image. Check console.", 10, 20);
        // Fallback if the default image also fails (e.g. network issue)
        if (src === defaultImageUrl) {
            // Try a very simple base64 encoded image as a last resort
            loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");
        }
    }
    sourceImage.src = src;
}

imageUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            loadImage(e.target.result);
        }
        reader.readAsDataURL(file);
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseOrigin.x = (e.clientX - rect.left) / canvas.width;
    mouseOrigin.y = (e.clientY - rect.top) / canvas.height;
    mouseActive = true;
});

canvas.addEventListener('mouseleave', () => {
    // Optional: Reset to default or keep last mouse position
    // For this effect, keeping the last position or reverting to center can both work.
    // Let's revert to center if mouse leaves, like shader might default
    // mouseActive = false;
    // mouseOrigin = { x: 0.5, y: 0.5 };
});

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

let animationFrameId = null;

function draw() {
    if (!sourceImageData || !outputImageData) {
        animationFrameId = requestAnimationFrame(draw); // Keep trying if image not loaded
        return;
    }

    const iTime = (Date.now() - startTime) / 1000.0;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const imgWidth = sourceImageData.width;   // Original image width for sampling
    const imgHeight = sourceImageData.height; // Original image height for sampling

    const sourceData = sourceImageData.data;
    const outputData = outputImageData.data;

    // --- Time logic from shader ---
    // float time = iTime * 0.5;
    // float offset = (time- floor(time))/time; // This simplifies to fract(time)/time
    // time = (time)*(offset); // This simplifies to fract(time) or time % 1.0
    let effectTime = (iTime * 0.5) % 1.0; 
    // -----------------------------

    // --- Origin of the ripple (normalized [0,1]) ---
    let originX_norm, originY_norm;
    if (mouseActive) {
        originX_norm = mouseOrigin.x;
        originY_norm = mouseOrigin.y;
    } else {
        // Default origin if no mouse input (or mouse left)
        originX_norm = 0.5;
        originY_norm = 0.5;
    }
    // ------------------------------------------

    // --- Aspect ratio handling (like in shader) ---
    // float ratio = iResolution.y / iResolution.x;
    // uv.y = uv.y * ratio;
    // The goal is to make the distance calculation behave as if on a square plane.
    const canvasAspect = canvasHeight / canvasWidth;

    const origin_transformed_x = originX_norm;
    const origin_transformed_y = originY_norm * canvasAspect; // Transform origin y for distance calc
    // ------------------------------------------------

    for (let y_canvas = 0; y_canvas < canvasHeight; y_canvas++) {
        for (let x_canvas = 0; x_canvas < canvasWidth; x_canvas++) {
            // Normalize canvas coordinates to [0,1] range
            const uvx_canvas = x_canvas / canvasWidth;
            const uvy_canvas = y_canvas / canvasHeight;

            // Transform current pixel's y-coordinate for distance calculation
            const pos_transformed_x = uvx_canvas;
            const pos_transformed_y = uvy_canvas * canvasAspect;

            // The distance of the current pixel position from origin in transformed space
            const dx_transformed = pos_transformed_x - origin_transformed_x;
            const dy_transformed = pos_transformed_y - origin_transformed_y;
            let distance = Math.sqrt(dx_transformed * dx_transformed + dy_transformed * dy_transformed);

            // The amount of time it takes for the ripple to arrive at the current pixel position
            const delay = distance / speed;

            // Adjust for delay, clamp to 0
            let pixelTime = effectTime - delay;
            pixelTime = Math.max(0.0, pixelTime);

            // The ripple is a sine wave scaled by an exponential decay function
            const rippleVal = Math.sin(frequency * pixelTime) * Math.exp(-decay * pixelTime);
            const rippleAmount = amplitude * rippleVal;

            // A vector of length 'amplitude' that points away from origin (in transformed space)
            let nx_transformed = 0, ny_transformed = 0;
            if (distance > 0.00001) { // Avoid division by zero
                nx_transformed = dx_transformed / distance;
                ny_transformed = dy_transformed / distance;
            }

            // Scale n by the ripple amount and add it to the current pixel position (in transformed space)
            const newPos_transformed_x = pos_transformed_x + rippleAmount * nx_transformed;
            const newPos_transformed_y = pos_transformed_y + rippleAmount * ny_transformed;

            // --- Convert newPosition back to standard normalized UV for texture sampling ---
            // The original uv (before aspect correction) is what we need for sampling.
            // So, we need to "un-transform" the y-component.
            const sample_uv_x = newPos_transformed_x;
            const sample_uv_y = (canvasAspect > 0) ? newPos_transformed_y / canvasAspect : newPos_transformed_y;


            // Sample the texture (sourceImageData) at the new position
            // Convert normalized [0,1] sample_uv to actual pixel coords in source image
            const sourceX = clamp(Math.floor(sample_uv_x * imgWidth), 0, imgWidth - 1);
            const sourceY = clamp(Math.floor(sample_uv_y * imgHeight), 0, imgHeight - 1);
            
            const sourceIdx = (sourceY * imgWidth + sourceX) * 4;

            let r = sourceData[sourceIdx];
            let g = sourceData[sourceIdx + 1];
            let b = sourceData[sourceIdx + 2];
            let a = sourceData[sourceIdx + 3];

            // Lighten or darken the color based on the ripple amount
            // color.rgb += 0.3 * (rippleAmount / amplitude);
            // rippleAmount / amplitude gives a value between -1 and 1 (approx)
            const colorAdjustFactor = 0.3 * (rippleAmount / amplitude); // Range approx -0.3 to 0.3
            
            r = clamp(r + colorAdjustFactor * 255, 0, 255);
            g = clamp(g + colorAdjustFactor * 255, 0, 255);
            b = clamp(b + colorAdjustFactor * 255, 0, 255);

            // Output the final color to canvas pixel data
            const destIdx = (y_canvas * canvasWidth + x_canvas) * 4;
            outputData[destIdx]     = r;
            outputData[destIdx + 1] = g;
            outputData[destIdx + 2] = b;
            outputData[destIdx + 3] = a; // Use original alpha, or 255 if source image has no/full alpha
        }
    }

    ctx.putImageData(outputImageData, 0, 0);
    animationFrameId = requestAnimationFrame(draw);
}

// Initial load
loadImage(defaultImageUrl);