import { useEffect, useRef } from "react";

export default function GestureModelController({
  groupRef,
  handPosition,
  isGrabbing,
  isPinching,
  twoHandDistance,
  orbitControlsRef,
}) {
  const prevHandXRef = useRef(null);
  const prevHandYRef = useRef(null);
  const prevTwoHandDistanceRef = useRef(null);
  const dragStartPositionRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Store initial model position & rotation for clean reset
  const initialPositionRef = useRef({ x: 0, y: 0, z: 0 });
  const targetRotationYRef = useRef(0);
  const currentRotationYRef = useRef(0);

  // Smooth rotation update based on horizontal hand movement
  useEffect(() => {
    if (!groupRef?.current || !handPosition) {
      prevHandXRef.current = null;
      return;
    }

    const model = groupRef.current;
    const currentHandX = handPosition.x;

    if (prevHandXRef.current !== null && !isGrabbing && !isPinching) {
      // Normalize movement across canvas width (800px)
      const deltaX = (currentHandX - prevHandXRef.current) / 800;
      
      // Filter out micro-jitter
      if (Math.abs(deltaX) > 0.003) {
        model.rotation.y += deltaX * 3.2;
      }
    }
    prevHandXRef.current = currentHandX;
  }, [handPosition, groupRef, isGrabbing, isPinching]);

  // Smooth model translation (panning) with pinch gesture
  useEffect(() => {
    if (!groupRef?.current || !handPosition) {
      isDraggingRef.current = false;
      dragStartPositionRef.current = null;
      prevHandYRef.current = null;
      return;
    }

    const model = groupRef.current;

    if (isPinching) {
      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        dragStartPositionRef.current = {
          startX: handPosition.x,
          startY: handPosition.y,
          modelX: model.position.x,
          modelY: model.position.y,
        };
      } else if (dragStartPositionRef.current) {
        // Delta scaled to 3D world units
        const deltaX = ((handPosition.x - dragStartPositionRef.current.startX) / 800) * 4.5;
        const deltaY = ((handPosition.y - dragStartPositionRef.current.startY) / 600) * 3.5;

        const targetX = dragStartPositionRef.current.modelX + deltaX;
        const targetY = dragStartPositionRef.current.modelY - deltaY;

        // Clamp within comfortable viewport view
        model.position.x = Math.max(-2.5, Math.min(2.5, targetX));
        model.position.y = Math.max(-1.8, Math.min(1.8, targetY));
      }
    } else {
      isDraggingRef.current = false;
      dragStartPositionRef.current = null;
    }

    prevHandYRef.current = handPosition.y;
  }, [handPosition, isPinching, groupRef]);

  // Handle camera zoom based on distance between two hands
  useEffect(() => {
    if (!orbitControlsRef?.current || twoHandDistance === null) {
      prevTwoHandDistanceRef.current = null;
      return;
    }

    const controls = orbitControlsRef.current;
    const currentDist = twoHandDistance;

    if (prevTwoHandDistanceRef.current !== null) {
      const deltaDist = currentDist - prevTwoHandDistanceRef.current;

      if (Math.abs(deltaDist) > 1.5) {
        const cameraDist = controls.getDistance();
        const minDist = controls.minDistance || 1.2;
        const maxDist = controls.maxDistance || 8.0;

        // Moving apart zooms out, moving together zooms in
        const newDist = Math.max(minDist, Math.min(maxDist, cameraDist - deltaDist * 0.008));

        const dir = controls.target.clone().sub(controls.object.position).normalize();
        controls.object.position.copy(controls.target.clone().sub(dir.multiplyScalar(newDist)));
        controls.update();
      }
    }
    prevTwoHandDistanceRef.current = currentDist;
  }, [twoHandDistance, orbitControlsRef]);

  // Reset model when hands touch (distance < 35px)
  useEffect(() => {
    if (twoHandDistance !== null && twoHandDistance < 35 && groupRef?.current) {
      groupRef.current.position.set(0, 0, 0);
      groupRef.current.rotation.set(0, 0, 0);

      if (orbitControlsRef?.current) {
        orbitControlsRef.current.reset();
        orbitControlsRef.current.target.set(0, 0, 0);
        orbitControlsRef.current.update();
      }
    }
  }, [twoHandDistance, groupRef, orbitControlsRef]);

  return null;
}