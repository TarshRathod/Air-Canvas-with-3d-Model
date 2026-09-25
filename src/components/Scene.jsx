import React, { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const MODEL_PATH = `${import.meta.env.BASE_URL}scene.gltf`

export default function Model({ onLoaded, ...props }) {
  const gltf = useGLTF(MODEL_PATH)

  // Clone scene cleanly and normalize bounds so it renders perfectly at center
  const sceneClone = useMemo(() => {
    if (!gltf || !gltf.scene) return null

    const clone = gltf.scene.clone(true)

    // Compute bounding box
    const box = new THREE.Box3().setFromObject(clone)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)

    // Scale to fit comfortably in viewport (~2.8 units)
    const maxDim = Math.max(size.x, size.y, size.z)
    const targetScale = maxDim > 0 ? 2.8 / maxDim : 1

    clone.scale.setScalar(targetScale)

    // Center model at local origin
    clone.position.x = -center.x * targetScale
    clone.position.y = -center.y * targetScale
    clone.position.z = -center.z * targetScale

    // Ensure all materials and meshes are properly configured with shadows/transparency
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (child.material) {
          child.material.needsUpdate = true
          child.material.side = THREE.DoubleSide
        }
      }
    })

    if (onLoaded) {
      onLoaded({
        size,
        center,
        radius: 1.6,
        targetScale,
        boundingBox: box
      })
    }

    return clone
  }, [gltf, onLoaded])

  if (!sceneClone) return null

  return (
    <group {...props} dispose={null}>
      <primitive object={sceneClone} />
    </group>
  )
}

useGLTF.preload(MODEL_PATH)
