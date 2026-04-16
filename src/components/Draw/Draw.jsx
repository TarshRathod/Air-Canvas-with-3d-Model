import { useRef, useEffect, useState, useCallback, Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Center } from "@react-three/drei";
import Model from "../../../public/Scene.jsx";
import GestureModelController from "../GestureModelController.jsx";
import LoadingScreen from "../LoadingScreen.jsx";
import { Helmet } from "react-helmet";
export default function DrawingCanvas() {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  // State variables
  const [show3DViewer, setShow3DViewer] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [handsReady, setHandsReady] = useState(false);
  const [handPosition, setHandPosition] = useState(null);
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [gestureInfo, setGestureInfo] = useState("");
  const [modelInfo, setModelInfo] = useState(null);
  const [twoHandDistance, setTwoHandDistance] = useState(null);

  // Refs for values that shouldn't trigger re-renders
  const drawingModeRef = useRef("pen");
  const eraserSizeRef = useRef(50);
  const drawingActive = useRef(false);
  const prevX = useRef(0);
  const prevY = useRef(0);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);
  const drawingCanvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastToggleTime = useRef(0);
  const orbitControlsRef = useRef(null);
  const modelGroupRef = useRef(null);
  // Track show3DViewer changes without re-initializing MediaPipe
  const show3DViewerRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    show3DViewerRef.current = show3DViewer;
  }, [show3DViewer]);

  // Model loaded callback
  const handleModelLoaded = useCallback((info) => {
    setModelInfo(info);
  }, []);

  // Camera config derived from model info
  const cameraConfig = useMemo(() => {
    if (modelInfo) {
      const dist = modelInfo.radius * 2.8;
      return {
        position: [0, modelInfo.center.y, dist],
        fov: 45,
        near: 0.01,
        far: 500,
      };
    }
    return {
      position: [0, 1.5, 5],
      fov: 45,
      near: 0.01,
      far: 500,
    };
  }, [modelInfo]);

  // OrbitControls limits derived from model info
  const orbitLimits = useMemo(() => {
    if (modelInfo) {
      return {
        minDistance: modelInfo.radius * 0.8,
        maxDistance: modelInfo.radius * 8,
        target: [modelInfo.center.x, modelInfo.center.y, modelInfo.center.z],
      };
    }
    return { minDistance: 1.5, maxDistance: 25, target: [0, 0, 0] };
  }, [modelInfo]);

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

  // ================= Finger Detection Functions =================
  const isIndexFingerUpOnly = useCallback((lm) => {
    const indexUp = lm[8].y < lm[6].y;
    const middleDown = lm[12].y > lm[10].y;
    const ringDown = lm[16].y > lm[14].y;
    const pinkyDown = lm[20].y > lm[18].y;
    const thumbDown = Math.abs(lm[4].x - lm[3].x) < 0.05;
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
    return distance < 0.05;
  }, []);

  const isTwoFingerPoint = useCallback((lm) => {
    const indexUp = lm[8].y < lm[6].y;
    const middleUp = lm[12].y < lm[10].y;
    const ringDown = lm[16].y > lm[14].y;
    const pinkyDown = lm[20].y > lm[18].y;
    return indexUp && middleUp && ringDown && pinkyDown;
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
        let newSize = Math.floor(20 + (distance / 500) * 80);
        newSize = Math.min(100, Math.max(20, newSize));
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

  const drawIcons = useCallback((ctx, x, y, iconType, isSelected) => {
    ctx.save();

    if (iconType === "pen") {
      ctx.fillStyle = isSelected ? "rgba(124, 92, 252, 0.2)" : "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.roundRect(x, y, 72, 72, 10);
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#7c5cfc" : "rgba(255,255,255,0.15)";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + 18, y + 54);
      ctx.lineTo(x + 54, y + 18);
      ctx.strokeStyle = isSelected ? "#a78bfa" : "#888";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 54, y + 18, 5, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? "#a78bfa" : "#888";
      ctx.fill();

      ctx.fillStyle = isSelected ? "#a78bfa" : "#999";
      ctx.font = "bold 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PEN", x + 36, y + 66);
    } else if (iconType === "eraser") {
      ctx.fillStyle = isSelected ? "rgba(248, 113, 113, 0.2)" : "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.roundRect(x, y, 72, 72, 10);
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#f87171" : "rgba(255,255,255,0.15)";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      ctx.fillStyle = isSelected ? "#f87171" : "#666";
      ctx.beginPath();
      ctx.roundRect(x + 20, y + 18, 32, 28, 4);
      ctx.fill();
      ctx.fillStyle = isSelected ? "#f87171" : "#999";
      ctx.font = "bold 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ERASE", x + 36, y + 66);
    } else if (iconType === "3d") {
      ctx.fillStyle = isSelected ? "rgba(96, 165, 250, 0.2)" : "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.roundRect(x, y, 72, 72, 10);
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#60a5fa" : "rgba(255,255,255,0.15)";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // 3D cube icon
      ctx.strokeStyle = isSelected ? "#60a5fa" : "#888";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x + 18, y + 26, 30, 30, 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 18, y + 26);
      ctx.lineTo(x + 28, y + 16);
      ctx.lineTo(x + 58, y + 16);
      ctx.lineTo(x + 48, y + 26);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 48, y + 56);
      ctx.lineTo(x + 58, y + 46);
      ctx.lineTo(x + 58, y + 16);
      ctx.stroke();

      ctx.fillStyle = isSelected ? "#60a5fa" : "#999";
      ctx.font = "bold 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("3D", x + 36, y + 66);
    }

    ctx.restore();
  }, []);

  const drawTransparentEraser = useCallback((ctx, x, y, size) => {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#f87171";
    ctx.beginPath();
    ctx.roundRect(x - size / 2, y - size / 2, size, size, 6);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = "#f87171";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - size / 2, y - size / 2, size, size, 6);
    ctx.stroke();
    ctx.fillStyle = "#f87171";
    ctx.font = "bold 11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ERASER", x, y - size / 2 - 8);
    ctx.font = "10px Inter, sans-serif";
    ctx.fillStyle = "#fca5a5";
    ctx.fillText(`${size}px`, x, y + size / 2 + 14);
    ctx.restore();
  }, []);

  // Main initialization effect — NO show3DViewer in deps!
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
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          },
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

          const currentDrawingMode = drawingModeRef.current;
          const currentEraserSize = eraserSizeRef.current;
          const currentShow3D = show3DViewerRef.current;
          const now = Date.now();

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (videoRef.current && videoRef.current.videoWidth > 0) {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(videoRef.current, -canvas.width, 0, canvas.width, canvas.height);
            ctx.restore();
          }

          ctx.drawImage(drawingCanvas, 0, 0);

          drawIcons(ctx, 16, 16, "pen", currentDrawingMode === "pen");
          drawIcons(ctx, 100, 16, "eraser", currentDrawingMode === "eraser");
          drawIcons(ctx, 184, 16, "3d", currentShow3D);

          if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            drawingActive.current = false;
            setHandPosition(null);
            setIsGrabbing(false);
            setIsPinching(false);
            setGestureInfo("");
            setTwoHandDistance(null);

            // Subtle status text
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.font = "12px Inter, sans-serif";
            ctx.textAlign = "left";
            if (currentDrawingMode === "pen") {
              ctx.fillText("PEN — Raise index finger to draw", 10, canvas.height - 40);
            } else {
              ctx.fillText("ERASER — Open palm to erase", 10, canvas.height - 40);
            }
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.fillText("Show your hand to start", 10, canvas.height - 16);
            return;
          }

          const handLandmarks = results.multiHandLandmarks;
          const primaryHand = handLandmarks[0];

          const indexTip = primaryHand[8];
          const x = canvas.width - indexTip.x * canvas.width;
          const y = indexTip.y * canvas.height;

          setHandPosition({ x, y });

          const fistClosed = isClosedFist(primaryHand);
          const pinching = isPinchGesture(primaryHand);
          const twoFingers = isTwoFingerPoint(primaryHand);

          setIsGrabbing(fistClosed);
          setIsPinching(pinching);

          // Two-hand gesture: pass raw distance for zoom
          if (currentShow3D && handLandmarks.length >= 2) {
            const hand1 = handLandmarks[0];
            const hand2 = handLandmarks[1];
            const hand1Center = getPalmCenter(hand1, canvas.width, canvas.height);
            const hand2Center = getPalmCenter(hand2, canvas.width, canvas.height);
            const distance = Math.sqrt(
              Math.pow(hand1Center.x - hand2Center.x, 2) +
                Math.pow(hand1Center.y - hand2Center.y, 2)
            );
            setTwoHandDistance(distance);
            if (distance < 35) {
              setGestureInfo("🔄 Resetting to original size…");
            } else {
              setGestureInfo(`🔍 Zoom — Distance: ${Math.round(distance)}px`);
            }
          } else {
            setTwoHandDistance(null);
            if (currentShow3D) {
              if (fistClosed) {
                setGestureInfo("✊ Rotating Model");
              } else if (pinching) {
                setGestureInfo("🤏 Grabbing — Move hand to reposition");
              } else if (isOpenPalm(primaryHand)) {
                setGestureInfo("🖐️ Open Palm — Idle");
              } else {
                setGestureInfo("☝️ Point to Navigate");
              }
            }
          }

          const palmCenter = getPalmCenter(primaryHand, canvas.width, canvas.height);
          const palmCenterX = palmCenter.x;
          const palmCenterY = palmCenter.y;

          // Icon click detection
          if (y > 16 && y < 88) {
            if (x > 16 && x < 88) {
              if (drawingModeRef.current !== "pen") {
                drawingModeRef.current = "pen";
                drawingActive.current = false;
                prevX.current = 0;
                prevY.current = 0;
              }
            } else if (x > 100 && x < 172) {
              if (drawingModeRef.current !== "eraser") {
                drawingModeRef.current = "eraser";
                drawingActive.current = false;
                prevX.current = 0;
                prevY.current = 0;
              }
            } else if (x > 184 && x < 256) {
              if (now - lastToggleTime.current > 1000) {
                lastToggleTime.current = now;
                setShow3DViewer((prev) => !prev);
              }
            }
          }

          // Handle drawing (only when not in 3D mode)
          if (!currentShow3D) {
            if (currentDrawingMode === "pen") {
              if (isIndexFingerUpOnly(primaryHand)) {
                if (!drawingActive.current) {
                  drawingActive.current = true;
                  prevX.current = x;
                  prevY.current = y;
                } else {
                  if (prevX.current !== 0 && prevY.current !== 0) {
                    drawingCtx.beginPath();
                    drawingCtx.moveTo(prevX.current, prevY.current);
                    drawingCtx.lineTo(x, y);
                    drawingCtx.strokeStyle = "#a78bfa";
                    drawingCtx.lineWidth = 6;
                    drawingCtx.lineCap = "round";
                    drawingCtx.lineJoin = "round";
                    drawingCtx.stroke();
                  }
                  prevX.current = x;
                  prevY.current = y;
                }

                // Draw indicator
                ctx.beginPath();
                ctx.arc(x, y, 10, 0, 2 * Math.PI);
                ctx.fillStyle = "rgba(124, 92, 252, 0.5)";
                ctx.fill();
                ctx.strokeStyle = "#7c5cfc";
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.fillStyle = "#a78bfa";
                ctx.font = "bold 11px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("WRITING", x, y - 16);
              } else {
                drawingActive.current = false;
                prevX.current = 0;
                prevY.current = 0;
              }
            } else if (currentDrawingMode === "eraser") {
              let eraserX = palmCenterX;
              let eraserY = palmCenterY;
              let activeEraserSize = currentEraserSize;

              const eraserData = detectEraserSizeTwoHands(
                handLandmarks,
                canvas.width,
                canvas.height
              );

              if (eraserData.isTwoHands && eraserData.size !== null) {
                // Lock eraser size - only set once on first two-hand detection
                if (eraserSizeRef.current === 50) {
                  eraserSizeRef.current = eraserData.size;
                }
                activeEraserSize = eraserSizeRef.current;
                eraserX = eraserData.center.x;
                eraserY = eraserData.center.y;

                if (eraserData.hand1Center && eraserData.hand2Center) {
                  ctx.beginPath();
                  ctx.moveTo(eraserData.hand1Center.x, eraserData.hand1Center.y);
                  ctx.lineTo(eraserData.hand2Center.x, eraserData.hand2Center.y);
                  ctx.strokeStyle = "rgba(251, 191, 36, 0.5)";
                  ctx.lineWidth = 2;
                  ctx.setLineDash([6, 4]);
                  ctx.stroke();
                  ctx.setLineDash([]);

                  ctx.fillStyle = "rgba(251, 191, 36, 0.5)";
                  ctx.beginPath();
                  ctx.arc(eraserData.hand1Center.x, eraserData.hand1Center.y, 8, 0, 2 * Math.PI);
                  ctx.fill();
                  ctx.beginPath();
                  ctx.arc(eraserData.hand2Center.x, eraserData.hand2Center.y, 8, 0, 2 * Math.PI);
                  ctx.fill();

                  ctx.fillStyle = "rgba(251, 191, 36, 0.6)";
                  ctx.font = "11px Inter, sans-serif";
                  ctx.textAlign = "left";
                  ctx.fillText(
                    `Two-hand resize: ${activeEraserSize}px`,
                    10,
                    200
                  );
                }
              }

              drawTransparentEraser(ctx, eraserX, eraserY, activeEraserSize);

              // Eraser works on index OR middle finger up (immediate touch)
              const indexFingerUp = primaryHand[8].y < primaryHand[6].y;
              const middleFingerUp = primaryHand[12].y < primaryHand[10].y;
              
              if (isOpenPalm(primaryHand) || indexFingerUp || middleFingerUp) {
                if (!drawingActive.current) {
                  drawingActive.current = true;
                  prevX.current = eraserX;
                  prevY.current = eraserY;
                } else {
                  const halfSize = activeEraserSize / 2;
                  if (prevX.current !== 0 && prevY.current !== 0) {
                    const dx = eraserX - prevX.current;
                    const dy = eraserY - prevY.current;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const steps = Math.max(
                      1,
                      Math.floor(distance / (activeEraserSize / 4))
                    );
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
                }

                ctx.fillStyle = "#f87171";
                ctx.font = "bold 11px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("ERASING", eraserX, eraserY - activeEraserSize / 2 - 12);
              } else {
                drawingActive.current = false;
                prevX.current = 0;
                prevY.current = 0;
              }
            }
          }

          // Hand landmarks visualization
          handLandmarks.forEach((landmarks) => {
            landmarks.forEach((lm) => {
              const lx = canvas.width - lm.x * canvas.width;
              const ly = lm.y * canvas.height;
              ctx.beginPath();
              ctx.arc(lx, ly, 3, 0, 2 * Math.PI);
              ctx.fillStyle = "#34d399";
              ctx.fill();
            });

            const connections = [
              [0, 1], [1, 2], [2, 3], [3, 4],
              [0, 5], [5, 6], [6, 7], [7, 8],
              [0, 9], [9, 10], [10, 11], [11, 12],
              [0, 13], [13, 14], [14, 15], [15, 16],
              [0, 17], [17, 18], [18, 19], [19, 20],
              [5, 9], [9, 13], [13, 17],
            ];

            connections.forEach(([start, end]) => {
              const startX = canvas.width - landmarks[start].x * canvas.width;
              const startY = landmarks[start].y * canvas.height;
              const endX = canvas.width - landmarks[end].x * canvas.width;
              const endY = landmarks[end].y * canvas.height;
              ctx.beginPath();
              ctx.moveTo(startX, startY);
              ctx.lineTo(endX, endY);
              ctx.strokeStyle = "rgba(52, 211, 153, 0.4)";
              ctx.lineWidth = 1.5;
              ctx.stroke();
            });
          });

          // Status bar at bottom
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.font = "11px Inter, sans-serif";
          ctx.textAlign = "left";
          if (currentShow3D) {
            ctx.fillText(
              "3D: ✊ Rotate  |  🤏 Grab  |  ✋✋ Zoom  |  Touch = Reset",
              10,
              canvas.height - 16
            );
          } else if (currentDrawingMode === "pen") {
            ctx.fillText("PEN: Index finger only → draw  |  C: Clear", 10, canvas.height - 16);
          } else {
            ctx.fillText(
              `ERASER: Open palm → erase  |  Size: ${currentEraserSize}px`,
              10,
              canvas.height - 16
            );
          }
        });

        // Start camera
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
                  // Ignore errors during cleanup
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
        console.error("Error:", err);
        setIsLoading(false);
      }
    };

    initializeHands();

    // Keyboard controls
    const handleKeyPress = (e) => {
      if (e.key === "c" || e.key === "C") {
        if (drawingCanvasRef.current) {
          const dCtx = drawingCanvasRef.current.getContext("2d");
          dCtx.clearRect(0, 0, 800, 600);
          drawingActive.current = false;
          prevX.current = 0;
          prevY.current = 0;
        }
      } else if (e.key === "Escape") {
        setShow3DViewer(false);
      } else if (e.key === "p" || e.key === "P") {
        drawingModeRef.current = "pen";
      } else if (e.key === "e" || e.key === "E") {
        drawingModeRef.current = "eraser";
      } else if (e.key === "3") {
        setShow3DViewer((prev) => !prev);
      } else if (e.key === "r" || e.key === "R") {
        // Reset view
        if (orbitControlsRef.current) {
          orbitControlsRef.current.reset();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);

    return () => {
      isCleanedUp = true;
      window.removeEventListener("keydown", handleKeyPress);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
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
    drawIcons,
    drawTransparentEraser,
    isIndexFingerUpOnly,
    isOpenPalm,
    isClosedFist,
    isPinchGesture,
    isTwoFingerPoint,
    getPalmCenter,
    detectEraserSizeTwoHands,
    // show3DViewer is NOT here — uses ref instead
  ]);

  return (
<>
    
<Helmet>
  {/* Primary SEO */}
  <title>Air Canvas 3D | Draw with Hand Gestures & Control 3D Models in Real-Time</title>
  <meta 
    name="description" 
    content="Air Canvas 3D lets you draw in the air using hand gestures and control 3D models in real-time. Built with AI, computer vision, and modern web technologies for an immersive experience." 
  />
  <meta 
    name="keywords" 
    content="air canvas, hand gesture drawing, 3D gesture control, computer vision project, AI drawing app, gesture based drawing, 3D model control, mediapipe hands, webgl 3d app, react three fiber project" 
  />
  <meta name="author" content="Your Name" />

  {/* Viewport */}
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  {/* Robots */}
  <meta name="robots" content="index, follow" />

  {/* Canonical URL */}
  <link rel="canonical" href="https://air-canvas-3d.netlify.app/" />

  {/* Open Graph (Facebook / LinkedIn) */}
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Air Canvas 3D - Draw & Control 3D Models with Hand Gestures" />
  <meta property="og:description" content="Experience futuristic drawing using hand gestures and interact with 3D models in real-time using AI-powered tracking." />
  <meta property="og:url" content="https://air-canvas-3d.netlify.app/" />
  {/* <meta property="og:image" content="https://air-canvas-3d.netlify.app/preview.png" /> */}

  {/* Twitter SEO */}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Air Canvas 3D - Gesture Based Drawing & 3D Control" />
  <meta name="twitter:description" content="Draw in air and control 3D models using hand gestures. Built using AI & computer vision." />
  {/* <meta name="twitter:image" content="https://air-canvas-3d.netlify.app/preview.png" /> */}

  {/* Theme Color */}
  <meta name="theme-color" content="#0f172a" />
</Helmet>

    <div className={`app-container ${show3DViewer ? "app-container--3d" : "app-container--drawing"}`}>
      {/* Hidden video element */}
      <video ref={videoRef} style={{ display: "none" }} autoPlay playsInline muted />

      {/* =================== 3D FULLSCREEN MODE =================== */}
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
      onCreated={(state) => state.camera.lookAt(0, 0, 0)}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-5, 5, -5]} intensity={0.4} />
      <pointLight position={[0, 8, 0]} intensity={0.6} />
      <hemisphereLight
        skyColor="#b1e1ff"
        groundColor="#333"
        intensity={0.4}
      />

      <Environment preset="studio" />

      <Suspense fallback={null}>
        <group ref={modelGroupRef} position={[0, 0, 0]}>
          <Center>
            <Model onLoaded={handleModelLoaded} />
          </Center>
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
        enablePan={false}
        enableZoom={true}
        enableRotate={false}
        minDistance={orbitLimits.minDistance}
        maxDistance={orbitLimits.maxDistance}
        enableDamping={true}
        dampingFactor={0.08}
        target={orbitLimits.target}
      />
    </Canvas>

    {/* Top Header */}
    <div className="viewer-header glass-panel">
      <h3>🎨 3D Model Viewer</h3>
      <p>✊ Left/Right Hand = Rotate &nbsp;|&nbsp; 🤏 Pinch + Move = Drag Model &nbsp;|&nbsp; ✋✋ Two Hands = Zoom</p>
    </div>

    {/* Exit Button */}
    <button
      className="viewer-exit-btn btn btn-danger"
      onClick={() => setShow3DViewer(false)}
    >
      ✕ Exit 3D &nbsp;(ESC)
    </button>

    {/* Camera PiP */}
    <div className="viewer-pip">
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
      />
      {gestureInfo && (
        <div className="viewer-gesture-overlay">{gestureInfo}</div>
      )}
    </div>

    {/* Info Indicator */}
    <div className="viewer-scale glass-card">
      ✋ Touch hands together to reset view
    </div>

    {/* Controls Panel */}
    <div className="viewer-controls glass-card">
      <div className="ctrl-title">Hand Controls</div>
      ✊ <strong>Move Hand Left/Right:</strong> Rotate model left/right<br />
      🤏 <strong>Pinch + Move:</strong> Drag model position<br />
      ✋✋ <strong>Two Hands Apart:</strong> Zoom in<br />
      ✋✋ <strong>Two Hands Together:</strong> Zoom out<br />
      👐 <strong>Hands Touch:</strong> Reset model position & rotation<br />
      <strong>R:</strong> Reset view
    </div>
  </div>
) : (
        /* =================== DRAWING MODE =================== */
        <>
          {/* Header */}
          {!show3DViewer && (
            <div className="app-header">
              <span className="app-title-icon">✋</span>
              <div>
                <h1 className="app-title">Air Canvas</h1>
                <p className="app-subtitle">Gesture-Controlled Drawing & 3D Viewer</p>
              </div>
            </div>
          )}

          {/* MediaPipe Loading */}
          {!handsReady && (
            <div className="mediapipe-loading glass-card">
              <div className="spinner"></div>
              <span>Loading hand tracking engine…</span>
            </div>
          )}

          {/* Canvas */}
          <div className="canvas-wrapper">
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className="drawing-canvas"
            />
            {isLoading && (
              <div className="camera-loading-overlay">
                <div className="icon">🎥</div>
                <div className="title">Requesting camera access…</div>
                <div className="subtitle">Please allow camera permissions to use air drawing.</div>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="instructions-panel glass-panel">
            <div className="instructions-grid">
              <div className="instruction-item">
                <span className="icon">✏️</span>
                <div>
                  <div className="label">Pen Mode (P)</div>
                  <div className="desc">Raise only index finger to draw</div>
                </div>
              </div>
              <div className="instruction-item">
                <span className="icon">🧽</span>
                <div>
                  <div className="label">Eraser Mode (E)</div>
                  <div className="desc">Open palm to erase. Two hands to resize.</div>
                </div>
              </div>
              <div className="instruction-item">
                <span className="icon">📦</span>
                <div>
                  <div className="label">3D Viewer (3)</div>
                  <div className="desc">Fullscreen 3D model with hand controls</div>
                </div>
              </div>
              <div className="instruction-item">
                <span className="icon">⌨️</span>
                <div>
                  <div className="label">Keyboard</div>
                  <div className="desc">P/E/3: modes &nbsp;|&nbsp; C: clear &nbsp;|&nbsp; R: reset</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </>
  );
}

// Lightweight R3F-compatible loading fallback (HTML overlay rendered outside Canvas)
function LoadingScreenR3F() {
  // This renders inside R3F canvas, so we use a simple mesh as placeholder
  return null;
}
