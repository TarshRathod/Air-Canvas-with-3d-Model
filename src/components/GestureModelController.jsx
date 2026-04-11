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
  const rotationSpeedRef = useRef(0.01);
  const zoomSpeedRef = useRef(0.008);
  const initialModelPositionRef = useRef(null);
  const dragStartPositionRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Store initial model position when component mounts
  useEffect(() => {
    if (groupRef?.current && !initialModelPositionRef.current) {
      initialModelPositionRef.current = {
        x: groupRef.current.position.x,
        y: groupRef.current.position.y,
        z: groupRef.current.position.z
      };
    }
  }, [groupRef]);

  // Handle model rotation based on hand left/right movement (only X-axis rotation)
  useEffect(() => {
    if (!groupRef?.current || !handPosition) return;
    const model = groupRef.current;
    // Get current hand X position (0-1 range, 0.5 is center)
    const currentHandX = handPosition.x;
    if (prevHandXRef.current !== null && !isGrabbing && !isPinching) {
      // Calculate hand movement (left or right)
      const handMovement = currentHandX - prevHandXRef.current;
      // Rotate model based on hand movement (only Y-axis rotation)
      if (Math.abs(handMovement) > 0.005) {
        model.rotation.y += handMovement * rotationSpeedRef.current;
      }
    }
    prevHandXRef.current = currentHandX;
  }, [handPosition, groupRef, isGrabbing, isPinching]);

  // Handle model dragging (panning) with pinch gesture
  useEffect(() => {
    if (!groupRef?.current || !handPosition) return;
    const model = groupRef.current;
    if (isPinching) {
      if (!isDraggingRef.current && prevHandXRef.current !== null && prevHandYRef.current !== null) {
        // Start dragging
        isDraggingRef.current = true;
        dragStartPositionRef.current = {
          x: handPosition.x,
          y: handPosition.y,
          modelX: model.position.x,
          modelY: model.position.y
        };
      } else if (isDraggingRef.current && dragStartPositionRef.current && prevHandXRef.current !== null) {
        // Calculate drag movement
        const deltaX = (handPosition.x - dragStartPositionRef.current.x) * 0.006;
        const deltaY = (handPosition.y - dragStartPositionRef.current.y) * 0.006;
        // Move model within screen bounds
        const newX = dragStartPositionRef.current.modelX + deltaX;
        const newY = dragStartPositionRef.current.modelY - deltaY;
        // Apply bounds to keep model within view
        model.position.x = Math.max(-3, Math.min(3, newX));
        model.position.y = Math.max(-2, Math.min(2, newY));
      }
    } else {
      // Reset dragging state when pinch ends
      isDraggingRef.current = false;
      dragStartPositionRef.current = null;
    }
    prevHandYRef.current = handPosition.y;
  }, [handPosition, isPinching, groupRef]);

  // Handle camera zoom based on two-hand pinch distance
  useEffect(() => {
    if (!orbitControlsRef?.current || twoHandDistance === null) return;
    const controls = orbitControlsRef.current;
    const currentDistance = twoHandDistance;
    if (prevTwoHandDistanceRef.current !== null) {
      // Calculate distance change
      const distanceChange = currentDistance - prevTwoHandDistanceRef.current;
      // Get current camera distance
      const cameraDistance = controls.getDistance();
      // Zoom based on hand distance change
      if (Math.abs(distanceChange) > 2) {
        // Apply constraints based on orbit controls limits
        const minDist = controls.minDistance || 1.5;
        const maxDist = controls.maxDistance || 8;
        // Calculate new distance with sensitivity (negative because hands apart = zoom out)
        let newDistance;
        if (distanceChange > 0) {
          // Hands moving apart - zoom out
          newDistance = cameraDistance + distanceChange * zoomSpeedRef.current;
        } else {
          // Hands moving together - zoom in
          newDistance = cameraDistance + distanceChange * zoomSpeedRef.current;
        }
        // Clamp to min/max limits
        const clampedDistance = Math.max(minDist, Math.min(maxDist, newDistance));
        // Update camera position
        const direction = controls.target.clone().sub(controls.object.position).normalize();
        controls.object.position.copy(controls.target.clone().sub(direction.multiplyScalar(clampedDistance)));
        controls.update();
      }
    }
    prevTwoHandDistanceRef.current = currentDistance;
  }, [twoHandDistance, orbitControlsRef]);

  // Reset model position when hands touch (twoHandDistance becomes very small)
  useEffect(() => {
    if (twoHandDistance !== null && twoHandDistance < 35 && groupRef?.current && initialModelPositionRef.current) {
      // Reset model position and rotation
      groupRef.current.position.copy(initialModelPositionRef.current);
      groupRef.current.rotation.y = 0;
      
      // Reset camera view if orbit controls available
      if (orbitControlsRef?.current) {
        const controls = orbitControlsRef.current;
        controls.target.set(0, 0, 0);
        controls.update();
      }
    }
  }, [twoHandDistance, groupRef, orbitControlsRef]);

  // This is a controller component that doesn't render anything
  return null;
}