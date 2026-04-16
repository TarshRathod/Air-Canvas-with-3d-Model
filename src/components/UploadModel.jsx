import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

function UploadedModel({ gltfArrayBuffer, texturesData = {}, onLoaded }) {
  const groupRef = useRef();
  const { scene } = useThree();

  useEffect(() => {
    if (!gltfArrayBuffer || !groupRef.current) return;

    const loader = new THREE.GLTFLoader();
    const textureLoader = new THREE.TextureLoader();
    const textureMap = {};

    // Load external textures first
    const textureLoadPromises = Object.entries(texturesData).map(
      ([key, texData]) => {
        return new Promise((resolve) => {
          try {
            const blob = new Blob([texData.arrayBuffer], { type: texData.type });
            const url = URL.createObjectURL(blob);
            
            textureLoader.load(
              url, 
              (texture) => {
                textureMap[key] = texture;
                URL.revokeObjectURL(url);
                resolve();
              }, 
              undefined, 
              (error) => {
                console.warn(`Failed to load texture ${key}:`, error);
                URL.revokeObjectURL(url);
                resolve();
              }
            );
          } catch (error) {
            console.warn(`Error processing texture ${key}:`, error);
            resolve();
          }
        });
      }
    );

    Promise.all(textureLoadPromises).then(() => {
      try {
        const blob = new Blob([gltfArrayBuffer], { 
          type: 'application/octet-stream' 
        });
        const url = URL.createObjectURL(blob);

        loader.load(
          url,
          (gltf) => {
            const model = gltf.scene;

            // Apply loaded textures to materials
            model.traverse((child) => {
              if (child.isMesh && child.material) {
                Object.entries(textureMap).forEach(([texKey, texture]) => {
                  if (texKey.includes('color') || texKey.includes('albedo') || texKey.includes('diffuse')) {
                    child.material.map = texture;
                    child.material.needsUpdate = true;
                  }
                  else if (texKey.includes('normal')) {
                    child.material.normalMap = texture;
                    child.material.needsUpdate = true;
                  }
                  else if (texKey.includes('rough')) {
                    child.material.roughnessMap = texture;
                    child.material.needsUpdate = true;
                  }
                  else if (texKey.includes('metal')) {
                    child.material.metalnessMap = texture;
                    child.material.needsUpdate = true;
                  }
                  else if (texKey.includes('ao') || texKey.includes('ambient')) {
                    child.material.aoMap = texture;
                    child.material.needsUpdate = true;
                  }
                  else {
                    if (!child.material.map) {
                      child.material.map = texture;
                      child.material.needsUpdate = true;
                    }
                  }
                });
              }
            });

            // Clear previous children
            while (groupRef.current.children.length > 0) {
              groupRef.current.remove(groupRef.current.children[0]);
            }

            groupRef.current.add(model);

            // Calculate bounding box
            const box = new THREE.Box3().setFromObject(groupRef.current);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);

            const maxDim = Math.max(size.x, size.y, size.z);
            const targetSize = 2.5;
            const autoScale = maxDim > 0 ? targetSize / maxDim : 1;

            groupRef.current.scale.multiplyScalar(autoScale);
            const scaledCenter = center.clone().multiplyScalar(autoScale);
            groupRef.current.position.sub(scaledCenter);

            const finalBox = new THREE.Box3().setFromObject(groupRef.current);
            const finalSize = new THREE.Vector3();
            const finalCenter = new THREE.Vector3();
            finalBox.getSize(finalSize);
            finalBox.getCenter(finalCenter);

            const radius = finalSize.length() / 2;

            if (onLoaded) {
              onLoaded({
                size: finalSize,
                center: finalCenter,
                radius,
                autoScale,
                boundingBox: finalBox,
              });
            }

            URL.revokeObjectURL(url);
          },
          (progress) => {
            const percentComplete = (progress.loaded / progress.total * 100).toFixed(0);
            console.log(`Model loading: ${percentComplete}%`);
          },
          (error) => {
            console.error('Error loading uploaded GLTF:', error);
            URL.revokeObjectURL(url);
            alert('Failed to load model. Please ensure it\'s a valid .glb or .gltf file.');
          }
        );
      } catch (error) {
        console.error('Error in model loading process:', error);
        alert('Error loading model');
      }
    });

  }, [gltfArrayBuffer, texturesData, onLoaded]);

  return <group ref={groupRef} />;
}

export default UploadedModel;