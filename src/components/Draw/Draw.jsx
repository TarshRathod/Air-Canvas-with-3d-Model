import { useRef, useEffect, useState, useCallback, Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import Model from "../Scene.jsx";
import GestureModelController from "../GestureModelController.jsx";
import { Helmet } from "react-helmet";

// Palette colors for brush & particle effects
const BRUSH_COLORS = [
  { id: "violet", name: "Cyber Violet", hex: "#a78bfa", glow: "rgba(167, 139, 250, 0.6)" },
  { id: "cyan", name: "Laser Cyan", hex: "#38bdf8", glow: "rgba(56, 189, 248, 0.6)" },
  { id: "pink", name: "Neon Pink", hex: "#f43f5e", glow: "rgba(244, 63, 94, 0.6)" },
  { id: "gold", name: "Star Gold", hex: "#fbbf24", glow: "rgba(251, 191, 36, 0.6)" },
  { id: "emerald", name: "Emerald Glow", hex: "#34d399", glow: "rgba(52, 211, 153, 0.6)" },
];

export default function DrawingCanvas() {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  // Core State
  const [show3DViewer, setShow3DViewer] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [handsReady, setHandsReady] = useState(false);
  const [handPosition, setHandPosition] = useState(null);
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [gestureInfo, setGestureInfo] = useState("");
  const [modelInfo, setModelInfo] = useState(null);
  const [twoHandDistance, setTwoHandDistance] = useState(null);

  // Active Tool & Style State
  const [activeMode, setActiveMode] = useState("pen"); // 'pen' | 'eraser'
  const [selectedColor, setSelectedColor] = useState(BRUSH_COLORS[0]);
  const [brushSize, setBrushSize] = useState(6);
  const [pipMinimized, setPipMinimized] = useState(false);
  const [hudAlert, setHudAlert] = useState("✨ Air Canvas Ready");

  // Particle System Ref
  const particlesRef = useRef([]);

  // Refs for tracking without re-triggering MediaPipe pipeline
  const drawingModeRef = useRef("pen");
  const brushColorRef = useRef(BRUSH_COLORS[0]);
  const brushSizeRef = useRef(6);
  const eraserSizeRef = useRef(50);
  const drawingActive = useRef(false);
  const prevX = useRef(0);
  const prevY = useRef(0);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);
  const drawingCanvasRef = useRef(null);
  const orbitControlsRef = useRef(null);
  const modelGroupRef = useRef(null);
  const show3DViewerRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    show3DViewerRef.current = show3DViewer;
  }, [show3DViewer]);

  useEffect(() => {
    drawingModeRef.current = activeMode;
  }, [activeMode]);

  useEffect(() => {
    brushColorRef.current = selectedColor;
  }, [selectedColor]);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  // Show a temporary HUD notification
  const triggerHudAlert = useCallback((message) => {
    setHudAlert(message);
  }, []);

  // Trigger burst of sparks when selecting an action / component
  const spawnSelectionBurst = useCallback((x, y, color = "#a78bfa") => {
    const count = 18;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 2.5 + Math.random() * 4.5;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        color: i % 2 === 0 ? color : "#ffffff",
        alpha: 1.0,
        life: 0,
        maxLife: 24 + Math.random() * 16,
        type: "selection_spark",
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.2,
      });
    }
  }, []);

  // Model loaded callback
  const handleModelLoaded = useCallback((info) => {
    setModelInfo(info);
  }, []);

  // Camera config derived from model
  const cameraConfig = useMemo(() => {
    return {
      position: [0, 0.5, 4.2],
      fov: 45,
      near: 0.01,
      far: 500,
    };
  }, []);

  // Clear Canvas Helper
  const handleClearCanvas = useCallback(() => {
    if (drawingCanvasRef.current) {
      const dCtx = drawingCanvasRef.current.getContext("2d");
      dCtx.clearRect(0, 0, 800, 600);
      drawingActive.current = false;
      prevX.current = 0;
      prevY.current = 0;
      spawnSelectionBurst(400, 300, "#f87171");
      triggerHudAlert("🧹 Canvas Cleared");
    }
  }, [spawnSelectionBurst, triggerHudAlert]);

  // Load MediaPipe from CDN
  useEffect(() => {
    let script1, script2;

    const loadScripts = () => {
      return new Promise((resolve, reject) => {
        script1 = document.createElement("script");
        script1.src = "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js";
        script1.crossOrigin = "anonymous";

        script2 = document.createElement("script");
        script2.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js";
        script2.crossOrigin = "anonymous";

        script1.onload = () => {
          document.body.appendChild(script2);
        };

        script2.onload = () => {
          setHandsReady(true);
          resolve();
        };

        script1.onerror = script2.onerror = () => {
          reject(new Error("Failed to load MediaPipe"));
        };

        document.body.appendChild(script1);
      });
    };

    loadScripts().catch(console.error);

    return () => {
      if (script1 && document.body.contains(script1)) document.body.removeChild(script1);
      if (script2 && document.body.contains(script2)) document.body.removeChild(script2);
    };
  }, []);

  // ================= Gesture Detection Functions =================
  const isIndexFingerUpOnly = useCallback((lm) => {
    const indexUp = lm[8].y < lm[6].y;
    const middleDown = lm[12].y > lm[10].y;
    const ringDown = lm[16].y > lm[14].y;
    const pinkyDown = lm[20].y > lm[18].y;
    const thumbDown = Math.abs(lm[4].x - lm[3].x) < 0.06;
    return indexUp && middleDown && ringDown && pinkyDown && thumbDown;
  }, []);

  const isOpenPalm = useCallback((lm) => {
    const thumbOut = Math.abs(lm[4].x - lm[2].x) > 0.05;
    const indexUp = lm[8].y < lm[6].y;
    const middleUp = lm[12].y < lm[10].y;
    const ringUp = lm[16].y < lm[14].y;
    const pinkyUp = lm[20].y < lm[18].y;
    return thumbOut && indexUp && middleUp && ringUp && pinkyUp;
  }, []);

  const isClosedFist = useCallback((lm) => {
    const indexDown = lm[8].y > lm[6].y;
    const middleDown = lm[12].y > lm[10].y;
    const ringDown = lm[16].y > lm[14].y;
    const pinkyDown = lm[20].y > lm[18].y;
    return indexDown && middleDown && ringDown && pinkyDown;
  }, []);

  const isPinchGesture = useCallback((lm) => {
    const thumbTip = lm[4];
    const indexTip = lm[8];
    const distance = Math.sqrt(
      Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2)
    );
    return distance < 0.055;
  }, []);

  const getPalmCenter = useCallback((landmarks, width, height) => {
    const indices = [0, 5, 9, 13, 17];
    let sumX = 0,
      sumY = 0;
    indices.forEach((idx) => {
      sumX += landmarks[idx].x;
      sumY += landmarks[idx].y;
    });
    return {
      x: width - (sumX / indices.length) * width,
      y: (sumY / indices.length) * height,
    };
  }, []);

  const detectEraserSizeTwoHands = useCallback(
    (handLandmarksList, width, height) => {
      if (handLandmarksList.length >= 2) {
        const hand1 = handLandmarksList[0];
        const hand2 = handLandmarksList[1];
        const hand1Center = getPalmCenter(hand1, width, height);
        const hand2Center = getPalmCenter(hand2, width, height);
        const centerX = (hand1Center.x + hand2Center.x) / 2;
        const centerY = (hand1Center.y + hand2Center.y) / 2;
        const distance = Math.sqrt(
          Math.pow(hand1Center.x - hand2Center.x, 2) +
            Math.pow(hand1Center.y - hand2Center.y, 2)
        );
        let newSize = Math.floor(25 + (distance / 450) * 95);
        newSize = Math.min(120, Math.max(25, newSize));
        return {
          isTwoHands: true,
          size: newSize,
          center: { x: centerX, y: centerY },
          hand1Center,
          hand2Center,
          distance,
        };
      }
      return {
        isTwoHands: false,
        size: null,
        center: null,
        hand1Center: null,
        hand2Center: null,
        distance: 0,
      };
    },
    [getPalmCenter]
  );

  // ================= Particle Emission Helpers =================
  const spawnDrawingSparkles = useCallback((x, y, colorHex) => {
    const count = 3;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2.0;
      particlesRef.current.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.4,
        size: 2 + Math.random() * 3.5,
        color: colorHex,
        alpha: 1.0,
        life: 0,
        maxLife: 20 + Math.random() * 15,
        type: "sparkle",
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.15,
      });
    }
  }, []);

  const spawnEraserShards = useCallback((x, y, size) => {
    const count = 5;
    const colors = ["#f87171", "#fb7185", "#fca5a5", "#fbbf24", "#ffffff"];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      particlesRef.current.push({
        x: x + (Math.random() - 0.5) * size,
        y: y + (Math.random() - 0.5) * size,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1.0,
        life: 0,
        maxLife: 18 + Math.random() * 14,
        type: "eraser_shard",
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.3,
      });
    }
  }, []);

  // Draw 4-point star sparkle
  const drawStar = useCallback((ctx, cx, cy, spikes, outerRadius, innerRadius, color, alpha) => {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, []);

  // Render & Update Particle System
  const updateAndDrawParticles = useCallback((ctx) => {
    const particles = particlesRef.current;
    if (!particles.length) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);

      if (p.life >= p.maxLife || p.alpha <= 0) {
        particles.splice(i, 1);
        continue;
      }

      if (p.type === "sparkle") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        drawStar(ctx, 0, 0, 4, p.size * 2, p.size * 0.6, p.color, p.alpha);
        ctx.restore();
      } else if (p.type === "eraser_shard") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else if (p.type === "selection_spark") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        drawStar(ctx, 0, 0, 4, p.size * 1.8, p.size * 0.5, p.color, p.alpha);
        ctx.restore();
      }
    }

    ctx.restore();
  }, [drawStar]);

  // Draw Futuristic Cyber Reticle on Active Fingertip
  const drawFingertipReticle = useCallback((ctx, x, y, mode, colorHex, isDrawing) => {
    const now = Date.now() / 1000;
    const pulse = Math.sin(now * 6) * 2;
    const radius = isDrawing ? 14 + pulse : 12;

    ctx.save();

    // Outer rotating segmented HUD ring
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(now * 3);
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Inner glowing aura
    const gradient = ctx.createRadialGradient(x, y, 2, x, y, radius + 4);
    gradient.addColorStop(0, colorHex);
    gradient.addColorStop(0.6, isDrawing ? "rgba(167, 139, 250, 0.4)" : "rgba(255, 255, 255, 0.2)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.fill();

    // Solid center core
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Text Tag Badge
    const tagText = mode === "pen" ? (isDrawing ? "✨ DRAWING" : "☝️ POINTER") : "🧽 ERASER";
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.textAlign = "center";
    
    const textWidth = ctx.measureText(tagText).width;
    ctx.fillStyle = "rgba(10, 10, 26, 0.85)";
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - textWidth / 2 - 6, y - radius - 22, textWidth + 12, 16, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colorHex;
    ctx.fillText(tagText, x, y - radius - 10);

    ctx.restore();
  }, []);

  // Draw Futuristic Holographic Eraser Box
  const drawFuturisticEraser = useCallback((ctx, x, y, size) => {
    const half = size / 2;
    const clampedX = Math.max(half, Math.min(800 - half, x));
    const clampedY = Math.max(half, Math.min(600 - half, y));
    const now = Date.now() / 1000;

    ctx.save();

    // Semi-transparent neon background
    ctx.fillStyle = "rgba(244, 63, 94, 0.18)";
    ctx.beginPath();
    ctx.roundRect(clampedX - half, clampedY - half, size, size, 8);
    ctx.fill();

    // Holographic animated border
    ctx.strokeStyle = "#f43f5e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(clampedX - half, clampedY - half, size, size, 8);
    ctx.stroke();

    // Glowing corner cyber brackets
    const bracketLen = Math.min(16, size / 3);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(clampedX - half, clampedY - half + bracketLen);
    ctx.lineTo(clampedX - half, clampedY - half);
    ctx.lineTo(clampedX - half + bracketLen, clampedY - half);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(clampedX + half - bracketLen, clampedY - half);
    ctx.lineTo(clampedX + half, clampedY - half);
    ctx.lineTo(clampedX + half, clampedY - half + bracketLen);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(clampedX - half, clampedY + half - bracketLen);
    ctx.lineTo(clampedX - half, clampedY + half);
    ctx.lineTo(clampedX - half + bracketLen, clampedY + half);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(clampedX + half - bracketLen, clampedY + half);
    ctx.lineTo(clampedX + half, clampedY + half);
    ctx.lineTo(clampedX + half, clampedY + half - bracketLen);
    ctx.stroke();

    // Animated laser scanline sweep
    const scanY = clampedY - half + ((now * 80) % size);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(clampedX - half + 4, scanY);
    ctx.lineTo(clampedX + half - 4, scanY);
    ctx.stroke();

    // Center Crosshair
    ctx.strokeStyle = "rgba(244, 63, 94, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(clampedX - 6, clampedY);
    ctx.lineTo(clampedX + 6, clampedY);
    ctx.moveTo(clampedX, clampedY - 6);
    ctx.lineTo(clampedX + 6, clampedY);
    ctx.stroke();

    // Badge
    ctx.font = "bold 11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#f43f5e";
    ctx.fillText("🧽 ERASER", clampedX, clampedY - half - 8);

    ctx.font = "10px Inter, sans-serif";
    ctx.fillStyle = "#fca5a5";
    ctx.fillText(`${size}px`, clampedX, clampedY + half + 14);

    ctx.restore();
  }, []);

  // Main Tracking Effect
  useEffect(() => {
    if (!handsReady) return;

    const drawingCanvas = document.createElement("canvas");
    drawingCanvas.width = 800;
    drawingCanvas.height = 600;
    const drawingCtx = drawingCanvas.getContext("2d");
    drawingCtx.clearRect(0, 0, 800, 600);
    drawingCanvasRef.current = drawingCanvas;

    let isCleanedUp = false;

    const initializeHands = async () => {
      try {
        const Hands = window.Hands;
        const Camera = window.Camera;

        if (!Hands || !Camera) {
          setIsLoading(false);
          return;
        }

        const hands = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        handsRef.current = hands;

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        hands.onResults((results) => {
          if (isCleanedUp) return;

          const canvas = canvasRef.current;
          if (!canvas) return;

          if (canvas.width !== 800) {
            canvas.width = 800;
            canvas.height = 600;
          }

          const ctx = canvas.getContext("2d");
          const currentMode = drawingModeRef.current;
          const currentColor = brushColorRef.current;
          const currentBrushSize = brushSizeRef.current;
          const currentEraserSize = eraserSizeRef.current;
          const currentShow3D = show3DViewerRef.current;
          const now = Date.now();

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Draw Mirrored Camera Stream
          if (videoRef.current && videoRef.current.videoWidth > 0) {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(videoRef.current, -canvas.width, 0, canvas.width, canvas.height);
            ctx.restore();
          }

          // Draw Persistent Artwork
          ctx.drawImage(drawingCanvas, 0, 0);

          // If no hands detected, render idle HUD and exit
          if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            drawingActive.current = false;
            setHandPosition(null);
            setIsGrabbing(false);
            setIsPinching(false);
            setGestureInfo("");
            setTwoHandDistance(null);

            // Update particles even when no hands
            updateAndDrawParticles(ctx);

            ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
            ctx.font = "12px Inter, sans-serif";
            ctx.textAlign = "left";
            if (currentShow3D) {
              ctx.fillText("3D: Show hand to rotate & navigate", 16, canvas.height - 20);
            } else if (currentMode === "pen") {
              ctx.fillText("PEN: Raise index finger to draw with neon glow", 16, canvas.height - 20);
            } else {
              ctx.fillText("ERASER: Open palm or point to erase strokes", 16, canvas.height - 20);
            }
            return;
          }

          const handLandmarks = results.multiHandLandmarks;
          const primaryHand = handLandmarks[0];

          // STRICT BOUNDARY CLAMPING to keep coordinates safely within canvas
          const rawIndexX = canvas.width - primaryHand[8].x * canvas.width;
          const rawIndexY = primaryHand[8].y * canvas.height;
          const x = Math.max(0, Math.min(canvas.width, rawIndexX));
          const y = Math.max(0, Math.min(canvas.height, rawIndexY));

          setHandPosition({ x, y });

          const fistClosed = isClosedFist(primaryHand);
          const pinching = isPinchGesture(primaryHand);

          setIsGrabbing(fistClosed);
          setIsPinching(pinching);

          // 3D Gesture Handling
          if (currentShow3D) {
            if (handLandmarks.length >= 2) {
              const hand1Center = getPalmCenter(handLandmarks[0], canvas.width, canvas.height);
              const hand2Center = getPalmCenter(handLandmarks[1], canvas.width, canvas.height);
              const distance = Math.sqrt(
                Math.pow(hand1Center.x - hand2Center.x, 2) + Math.pow(hand1Center.y - hand2Center.y, 2)
              );
              setTwoHandDistance(distance);
              if (distance < 35) {
                setGestureInfo("🔄 Resetting Model Position");
              } else {
                setGestureInfo(`🔍 Zoom Distance: ${Math.round(distance)}px`);
              }
            } else {
              setTwoHandDistance(null);
              if (fistClosed) {
                setGestureInfo("✊ Rotating 3D Model");
              } else if (pinching) {
                setGestureInfo("🤏 Dragging Model Position");
              } else if (isOpenPalm(primaryHand)) {
                setGestureInfo("🖐️ Open Palm — Neutral");
              } else {
                setGestureInfo("☝️ Point to Steer Model");
              }
            }
          }

          // Palm Center Calculation with Clamping
          const rawPalm = getPalmCenter(primaryHand, canvas.width, canvas.height);
          const palmCenterX = Math.max(0, Math.min(canvas.width, rawPalm.x));
          const palmCenterY = Math.max(0, Math.min(canvas.height, rawPalm.y));

          // Drawing & Erasing Logic
          if (!currentShow3D) {
            if (currentMode === "pen") {
              const drawingIntent = isIndexFingerUpOnly(primaryHand);

              if (drawingIntent) {
                if (!drawingActive.current) {
                  drawingActive.current = true;
                  prevX.current = x;
                  prevY.current = y;
                  spawnDrawingSparkles(x, y, currentColor.hex);
                } else {
                  if (prevX.current !== 0 && prevY.current !== 0) {
                    drawingCtx.save();
                    drawingCtx.strokeStyle = currentColor.hex;
                    drawingCtx.shadowColor = currentColor.glow;
                    drawingCtx.shadowBlur = 10;
                    drawingCtx.lineWidth = currentBrushSize;
                    drawingCtx.lineCap = "round";
                    drawingCtx.lineJoin = "round";
                    drawingCtx.beginPath();
                    drawingCtx.moveTo(prevX.current, prevY.current);
                    drawingCtx.lineTo(x, y);
                    drawingCtx.stroke();
                    drawingCtx.restore();

                    // Continuous sparkles along the stroke
                    spawnDrawingSparkles(x, y, currentColor.hex);
                  }
                  prevX.current = x;
                  prevY.current = y;
                }

                drawFingertipReticle(ctx, x, y, "pen", currentColor.hex, true);
              } else {
                drawingActive.current = false;
                prevX.current = 0;
                prevY.current = 0;
                drawFingertipReticle(ctx, x, y, "pen", currentColor.hex, false);
              }
            } else if (currentMode === "eraser") {
              let eraserX = palmCenterX;
              let eraserY = palmCenterY;
              let activeEraserSize = currentEraserSize;

              const eraserData = detectEraserSizeTwoHands(handLandmarks, canvas.width, canvas.height);

              if (eraserData.isTwoHands && eraserData.size !== null) {
                eraserSizeRef.current = eraserData.size;
                activeEraserSize = eraserData.size;
                eraserX = Math.max(0, Math.min(canvas.width, eraserData.center.x));
                eraserY = Math.max(0, Math.min(canvas.height, eraserData.center.y));

                if (eraserData.hand1Center && eraserData.hand2Center) {
                  ctx.beginPath();
                  ctx.moveTo(eraserData.hand1Center.x, eraserData.hand1Center.y);
                  ctx.lineTo(eraserData.hand2Center.x, eraserData.hand2Center.y);
                  ctx.strokeStyle = "rgba(251, 191, 36, 0.7)";
                  ctx.lineWidth = 2.5;
                  ctx.setLineDash([8, 6]);
                  ctx.stroke();
                  ctx.setLineDash([]);
                }
              }

              drawFuturisticEraser(ctx, eraserX, eraserY, activeEraserSize);

              const indexFingerUp = primaryHand[8].y < primaryHand[6].y;
              const middleFingerUp = primaryHand[12].y < primaryHand[10].y;
              const eraseTriggered = isOpenPalm(primaryHand) || indexFingerUp || middleFingerUp;

              if (eraseTriggered) {
                const halfSize = activeEraserSize / 2;
                if (!drawingActive.current) {
                  drawingActive.current = true;
                  prevX.current = eraserX;
                  prevY.current = eraserY;
                } else {
                  if (prevX.current !== 0 && prevY.current !== 0) {
                    const dx = eraserX - prevX.current;
                    const dy = eraserY - prevY.current;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const steps = Math.max(1, Math.floor(distance / (activeEraserSize / 4)));
                    for (let i = 0; i <= steps; i++) {
                      const t = i / steps;
                      const cx = prevX.current + dx * t;
                      const cy = prevY.current + dy * t;
                      drawingCtx.clearRect(
                        cx - halfSize,
                        cy - halfSize,
                        activeEraserSize,
                        activeEraserSize
                      );
                    }
                  }
                  drawingCtx.clearRect(
                    eraserX - halfSize,
                    eraserY - halfSize,
                    activeEraserSize,
                    activeEraserSize
                  );
                  prevX.current = eraserX;
                  prevY.current = eraserY;

                  // Disintegration particles
                  spawnEraserShards(eraserX, eraserY, activeEraserSize);
                }
              } else {
                drawingActive.current = false;
                prevX.current = 0;
                prevY.current = 0;
              }
            }
          }

          // Draw Glowing Hand Skeleton
          handLandmarks.forEach((landmarks) => {
            const connections = [
              [0, 1], [1, 2], [2, 3], [3, 4],
              [0, 5], [5, 6], [6, 7], [7, 8],
              [0, 9], [9, 10], [10, 11], [11, 12],
              [0, 13], [13, 14], [14, 15], [15, 16],
              [0, 17], [17, 18], [18, 19], [19, 20],
              [5, 9], [9, 13], [13, 17],
            ];

            // Neon gradient connections
            connections.forEach(([start, end]) => {
              const startX = canvas.width - landmarks[start].x * canvas.width;
              const startY = landmarks[start].y * canvas.height;
              const endX = canvas.width - landmarks[end].x * canvas.width;
              const endY = landmarks[end].y * canvas.height;

              ctx.beginPath();
              ctx.moveTo(startX, startY);
              ctx.lineTo(endX, endY);
              ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
              ctx.lineWidth = 2;
              ctx.stroke();
            });

            // Glowing Joint Nodes
            landmarks.forEach((lm) => {
              const lx = canvas.width - lm.x * canvas.width;
              const ly = lm.y * canvas.height;
              ctx.beginPath();
              ctx.arc(lx, ly, 3.5, 0, 2 * Math.PI);
              ctx.fillStyle = "#38bdf8";
              ctx.shadowColor = "#0284c7";
              ctx.shadowBlur = 6;
              ctx.fill();
              ctx.shadowBlur = 0;
            });
          });

          // Render Active Particles Layer
          updateAndDrawParticles(ctx);
        });

        // Initialize Camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 800 },
            height: { ideal: 600 },
            facingMode: "user",
          },
        });

        if (videoRef.current && !isCleanedUp) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();

          const CameraClass = window.Camera;
          const camera = new CameraClass(videoRef.current, {
            onFrame: async () => {
              if (
                handsRef.current &&
                videoRef.current &&
                videoRef.current.videoWidth > 0 &&
                !isCleanedUp
              ) {
                try {
                  await handsRef.current.send({ image: videoRef.current });
                } catch (e) {
                  // ignore
                }
              }
            },
            width: 800,
            height: 600,
          });

          cameraRef.current = camera;
          await camera.start();
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Camera/MediaPipe initialization error:", err);
        setIsLoading(false);
      }
    };

    initializeHands();

    // Keyboard Shortcuts
    const handleKeyPress = (e) => {
      if (e.key === "c" || e.key === "C") {
        handleClearCanvas();
      } else if (e.key === "Escape") {
        setShow3DViewer(false);
        triggerHudAlert("✏️ Exited 3D Mode");
      } else if (e.key === "p" || e.key === "P") {
        setActiveMode("pen");
        spawnSelectionBurst(400, 300, "#a78bfa");
        triggerHudAlert("✨ Pen Mode Active");
      } else if (e.key === "e" || e.key === "E") {
        setActiveMode("eraser");
        spawnSelectionBurst(400, 300, "#f87171");
        triggerHudAlert("🧽 Eraser Mode Active");
      } else if (e.key === "3") {
        setShow3DViewer((prev) => {
          const next = !prev;
          triggerHudAlert(next ? "🪐 3D Viewer Active" : "✏️ Drawing Mode Active");
          return next;
        });
      } else if (e.key === "r" || e.key === "R") {
        if (orbitControlsRef.current) {
          orbitControlsRef.current.reset();
        }
        triggerHudAlert("🔄 View Reset");
      }
    };

    window.addEventListener("keydown", handleKeyPress);

    return () => {
      isCleanedUp = true;
      window.removeEventListener("keydown", handleKeyPress);
      if (cameraRef.current) {
        try { cameraRef.current.stop(); } catch (e) { /* */ }
      }
      if (handsRef.current) {
        try { handsRef.current.close(); } catch (e) { /* */ }
      }
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, [
    handsReady,
    isIndexFingerUpOnly,
    isOpenPalm,
    isClosedFist,
    isPinchGesture,
    getPalmCenter,
    detectEraserSizeTwoHands,
    spawnDrawingSparkles,
    spawnEraserShards,
    updateAndDrawParticles,
    drawFingertipReticle,
    drawFuturisticEraser,
    handleClearCanvas,
    spawnSelectionBurst,
    triggerHudAlert,
  ]);

  // Touch drawing support for mobile screens
  const handleTouchDraw = (e) => {
    if (show3DViewer || !drawingCanvasRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    if (!touch) return;

    const scaleX = 800 / rect.width;
    const scaleY = 600 / rect.height;
    const x = Math.max(0, Math.min(800, (touch.clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.min(600, (touch.clientY - rect.top) * scaleY));

    const dCtx = drawingCanvasRef.current.getContext("2d");

    if (activeMode === "pen") {
      dCtx.save();
      dCtx.strokeStyle = selectedColor.hex;
      dCtx.shadowColor = selectedColor.glow;
      dCtx.shadowBlur = 10;
      dCtx.lineWidth = brushSize;
      dCtx.lineCap = "round";
      dCtx.lineJoin = "round";
      dCtx.beginPath();
      if (prevX.current !== 0 && prevY.current !== 0) {
        dCtx.moveTo(prevX.current, prevY.current);
        dCtx.lineTo(x, y);
      } else {
        dCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      }
      dCtx.stroke();
      dCtx.restore();
      spawnDrawingSparkles(x, y, selectedColor.hex);
    } else {
      const half = eraserSizeRef.current / 2;
      dCtx.clearRect(x - half, y - half, eraserSizeRef.current, eraserSizeRef.current);
      spawnEraserShards(x, y, eraserSizeRef.current);
    }

    prevX.current = x;
    prevY.current = y;
  };

  const handleTouchEnd = () => {
    prevX.current = 0;
    prevY.current = 0;
  };

  return (
    <>
      <Helmet>
        <title>Air Canvas 3D | Gesture Drawing & Holographic 3D Model Viewer</title>
        <meta
          name="description"
          content="Air Canvas 3D lets you draw in the air using hand gestures and inspect 3D models in real-time with AI computer vision and particle animations."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="theme-color" content="#06060e" />
      </Helmet>

      <div
        ref={containerRef}
        className={`app-container ${show3DViewer ? "app-container--3d" : "app-container--drawing"}`}
      >
        {/* Hidden video element for camera stream */}
        <video ref={videoRef} style={{ display: "none" }} autoPlay playsInline muted />

        {/* HUD Alert Toast */}
        {hudAlert && (
          <div key={hudAlert} className="hud-toast glass-panel">
            {hudAlert}
          </div>
        )}

        {/* =================== 3D FULLSCREEN VIEWER =================== */}
        {show3DViewer ? (
          <div className="viewer-3d">
            <Canvas
              camera={{
                position: cameraConfig.position,
                fov: cameraConfig.fov,
                near: cameraConfig.near,
                far: cameraConfig.far,
              }}
              style={{ width: "100%", height: "100%" }}
            >
              <ambientLight intensity={0.8} />
              <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
              <directionalLight position={[-5, 5, -5]} intensity={0.6} />
              <pointLight position={[0, 4, 3]} intensity={0.9} color="#b1e1ff" />
              <hemisphereLight skyColor="#a78bfa" groundColor="#060614" intensity={0.5} />

              <Environment preset="city" />

              <Suspense fallback={null}>
                <group ref={modelGroupRef} position={[0, 0, 0]}>
                  <Model onLoaded={handleModelLoaded} />
                </group>
              </Suspense>

              <GestureModelController
                groupRef={modelGroupRef}
                handPosition={handPosition}
                isGrabbing={isGrabbing}
                isPinching={isPinching}
                twoHandDistance={twoHandDistance}
                orbitControlsRef={orbitControlsRef}
              />

              <OrbitControls
                ref={orbitControlsRef}
                enablePan={true}
                enableZoom={true}
                enableRotate={true}
                minDistance={1.2}
                maxDistance={12}
                enableDamping={true}
                dampingFactor={0.08}
                target={[0, 0, 0]}
              />
            </Canvas>

            {/* Top Control Bar */}
            <div className="viewer-top-bar">
              <div className="viewer-header glass-panel">
                <span className="badge-3d">3D HOLOGRAM</span>
                <h3>Anime Character Model</h3>
                <p>✊ Move Hand: Rotate &nbsp;|&nbsp; 🤏 Pinch: Reposition &nbsp;|&nbsp; ✋✋ Zoom</p>
              </div>

              <button
                className="viewer-exit-btn btn btn-danger"
                onClick={() => {
                  setShow3DViewer(false);
                  triggerHudAlert("✏️ Returned to Drawing");
                }}
              >
                ✕ Exit 3D (ESC)
              </button>
            </div>

            {/* Mobile / Desktop Quick Action Controls */}
            <div className="viewer-action-dock glass-panel">
              <button
                className="dock-btn"
                title="Reset Model"
                onClick={() => {
                  if (modelGroupRef.current) {
                    modelGroupRef.current.position.set(0, 0, 0);
                    modelGroupRef.current.rotation.set(0, 0, 0);
                  }
                  if (orbitControlsRef.current) {
                    orbitControlsRef.current.reset();
                  }
                  triggerHudAlert("🔄 Model Reset to Center");
                }}
              >
                🔄 Reset
              </button>
              <button
                className="dock-btn"
                title="Zoom In"
                onClick={() => {
                  if (orbitControlsRef.current) {
                    const c = orbitControlsRef.current;
                    const d = c.getDistance();
                    const newD = Math.max(1.2, d - 0.5);
                    const dir = c.target.clone().sub(c.object.position).normalize();
                    c.object.position.copy(c.target.clone().sub(dir.multiplyScalar(newD)));
                    c.update();
                  }
                }}
              >
                🔍+
              </button>
              <button
                className="dock-btn"
                title="Zoom Out"
                onClick={() => {
                  if (orbitControlsRef.current) {
                    const c = orbitControlsRef.current;
                    const d = c.getDistance();
                    const newD = Math.min(10, d + 0.5);
                    const dir = c.target.clone().sub(c.object.position).normalize();
                    c.object.position.copy(c.target.clone().sub(dir.multiplyScalar(newD)));
                    c.update();
                  }
                }}
              >
                🔍-
              </button>
            </div>

            {/* PiP Camera Preview */}
            <div className={`viewer-pip ${pipMinimized ? "viewer-pip--minimized" : ""}`}>
              <div className="pip-header">
                <span>🎥 Motion Tracking</span>
                <button
                  className="pip-toggle"
                  onClick={() => setPipMinimized((prev) => !prev)}
                >
                  {pipMinimized ? "▲" : "▼"}
                </button>
              </div>
              {!pipMinimized && (
                <>
                  <canvas ref={canvasRef} width={800} height={600} />
                  {gestureInfo && <div className="viewer-gesture-overlay">{gestureInfo}</div>}
                </>
              )}
            </div>
          </div>
        ) : (
          /* =================== DRAWING MODE =================== */
          <>
            {/* Main App Header */}
            <header className="app-header">
              <div className="app-title-wrap">
                <span className="app-title-icon">✨</span>
                <div>
                  <h1 className="app-title">Air Canvas 3D</h1>
                  <p className="app-subtitle">Gesture AI Drawing & 3D Interactive Space</p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="header-status">
                {handsReady ? (
                  <span className="status-pill status-pill--active">AI Tracking Active</span>
                ) : (
                  <span className="status-pill status-pill--warning">Loading MediaPipe…</span>
                )}
              </div>
            </header>

            {/* Floating Glassmorphic Interactive Mode Toolbar */}
            <nav className="mode-toolbar glass-panel">
              {/* Pen Mode Button */}
              <button
                className={`toolbar-btn ${activeMode === "pen" ? "toolbar-btn--active-pen" : ""}`}
                onClick={(e) => {
                  setActiveMode("pen");
                  const rect = e.currentTarget.getBoundingClientRect();
                  spawnSelectionBurst(400, 100, selectedColor.hex);
                  triggerHudAlert("✨ Pen Mode Active");
                }}
              >
                <span className="btn-icon">✏️</span>
                <span className="btn-text">Pen</span>
              </button>

              {/* Eraser Mode Button */}
              <button
                className={`toolbar-btn ${activeMode === "eraser" ? "toolbar-btn--active-eraser" : ""}`}
                onClick={(e) => {
                  setActiveMode("eraser");
                  spawnSelectionBurst(400, 100, "#f87171");
                  triggerHudAlert("🧽 Eraser Mode Active");
                }}
              >
                <span className="btn-icon">🧽</span>
                <span className="btn-text">Eraser</span>
              </button>

              {/* 3D Mode Button */}
              <button
                className="toolbar-btn toolbar-btn--3d"
                onClick={() => {
                  setShow3DViewer(true);
                  spawnSelectionBurst(400, 100, "#38bdf8");
                  triggerHudAlert("🪐 Launching 3D Hologram");
                }}
              >
                <span className="btn-icon">📦</span>
                <span className="btn-text">3D Viewer</span>
              </button>

              {/* Clear Canvas Button */}
              <button
                className="toolbar-btn toolbar-btn--danger"
                onClick={handleClearCanvas}
                title="Clear Artwork"
              >
                <span className="btn-icon">🧹</span>
                <span className="btn-text">Clear</span>
              </button>

              {/* Color Palette Selector */}
              {activeMode === "pen" && (
                <div className="color-palette-bar">
                  {BRUSH_COLORS.map((c) => (
                    <button
                      key={c.id}
                      className={`color-swatch ${selectedColor.id === c.id ? "color-swatch--selected" : ""}`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                      onClick={() => {
                        setSelectedColor(c);
                        spawnSelectionBurst(400, 100, c.hex);
                        triggerHudAlert(`🎨 Color: ${c.name}`);
                      }}
                    />
                  ))}
                </div>
              )}
            </nav>

            {/* Responsive Canvas Container with Clamping */}
            <div className="canvas-wrapper">
              <canvas
                ref={canvasRef}
                width={800}
                height={600}
                className="drawing-canvas"
                onTouchMove={handleTouchDraw}
                onTouchEnd={handleTouchEnd}
              />

              {isLoading && (
                <div className="camera-loading-overlay">
                  <div className="spinner-large"></div>
                  <div className="title">Connecting Camera & AI Engine…</div>
                  <div className="subtitle">Please allow camera permissions for gesture tracking.</div>
                </div>
              )}
            </div>

            {/* Futuristic Guide Card Grid */}
            <footer className="instructions-panel glass-panel">
              <div className="instructions-grid">
                <div className="instruction-item">
                  <span className="icon">☝️</span>
                  <div>
                    <div className="label">Draw with Sparkles</div>
                    <div className="desc">Raise index finger only to paint neon trails & starbursts.</div>
                  </div>
                </div>

                <div className="instruction-item">
                  <span className="icon">🖐️</span>
                  <div>
                    <div className="label">Holographic Eraser</div>
                    <div className="desc">Open palm to disintegrate strokes. Two hands to resize.</div>
                  </div>
                </div>

                <div className="instruction-item">
                  <span className="icon">📦</span>
                  <div>
                    <div className="label">3D Gesture Orbit</div>
                    <div className="desc">Fist to rotate, pinch to move, two hands to zoom.</div>
                  </div>
                </div>

                <div className="instruction-item">
                  <span className="icon">⌨️</span>
                  <div>
                    <div className="label">Shortcuts & Mobile Touch</div>
                    <div className="desc">P: Pen | E: Eraser | C: Clear | 3: 3D | Touch screen to draw!</div>
                  </div>
                </div>
              </div>
            </footer>
          </>
        )}
      </div>
    </>
  );
}
