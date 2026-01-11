import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

// --- SHADERS ---

// Vertex Shader: Handles particle positioning and organic movement
const vertexShader = `
  uniform float uTime;
  uniform float uMouseX;
  uniform float uMouseY;
  
  attribute float offset;
  
  varying float vDistance;

  // Simple pseudo-random function
  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  // 3D Noise function (Simplex-like)
  float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n = p.x + p.y * 57.0 + 113.0 * p.z;
    return mix(mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
                   mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
               mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                   mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z);
  }

  void main() {
    vec3 pos = position;

    // Organic movement using noise and time
    // We displace the y and z coordinates based on x and time to create waves
    float noiseVal = noise(vec3(pos.x * 0.5 + uTime * 0.2, pos.y * 0.5 + uTime * 0.3, uTime * 0.1));
    
    // Wave effect
    float wave = sin(pos.x * 2.0 + uTime) * 0.2 + cos(pos.y * 1.5 + uTime) * 0.2;
    
    // Mouse interaction: push particles away or pull them
    // Map mouse screen coords (0..1) to approximate world coords
    // This is a simplified interaction
    float dist = distance(vec2(pos.x, pos.y), vec2(uMouseX * 10.0 - 5.0, -uMouseY * 10.0 + 5.0));
    float mouseEffect = smoothstep(2.0, 0.0, dist) * 0.5; // Ripple effect radius
    
    // Apply displacements
    pos.z += noiseVal * 1.5 + wave + (mouseEffect * sin(uTime * 10.0));
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Size attenuation based on depth
    gl_PointSize = (4.0 * noiseVal + 2.0) * (10.0 / -mvPosition.z);
    
    vDistance = pos.z; // Pass depth to fragment shader for coloring
  }
`;

// Fragment Shader: Handles particle color and glow
const fragmentShader = `
  varying float vDistance;
  uniform float uTime;

  void main() {
    // Create a circular particle
    if (length(gl_PointCoord - vec2(0.5, 0.5)) > 0.5) discard;

    // Colors
    vec3 deepDark = vec3(0.05, 0.05, 0.08); // Deep dark background tone
    vec3 amber = vec3(1.0, 0.7, 0.2);       // Amber glow
    vec3 copper = vec3(0.72, 0.45, 0.2);    // Copper tone

    // Mix colors based on "height" (z-position) and time
    float mixFactor = smoothstep(-1.0, 2.0, vDistance + sin(uTime) * 0.5);
    
    vec3 finalColor = mix(deepDark, mix(copper, amber, mixFactor), mixFactor * 0.8);

    // Alpha/glow
    float alpha = 0.8 + 0.2 * sin(uTime * 3.0 + vDistance);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

const Particles = () => {
    // Reference to the points mesh
    const pointsRef = useRef();

    // Uniforms for shaders
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uMouseX: { value: 0 },
        uMouseY: { value: 0 },
    }), []);

    // Create particles
    const particleCount = 5000;
    const positions = useMemo(() => {
        const pos = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
            // Spread particles across a plane
            pos[i * 3] = (Math.random() - 0.5) * 15;      // x: -7.5 to 7.5
            pos[i * 3 + 1] = (Math.random() - 0.5) * 15;  // y: -7.5 to 7.5
            pos[i * 3 + 2] = (Math.random() - 0.5) * 2;   // z: -1 to 1 (depth)
        }
        return pos;
    }, []);

    // Frame loop for animation
    useFrame((state) => {
        const { clock, mouse } = state;
        if (pointsRef.current) {
            pointsRef.current.material.uniforms.uTime.value = clock.getElapsedTime();
            // Smoothly interpolate mouse values
            pointsRef.current.material.uniforms.uMouseX.value = THREE.MathUtils.lerp(
                pointsRef.current.material.uniforms.uMouseX.value,
                mouse.x,
                0.1
            );
            pointsRef.current.material.uniforms.uMouseY.value = THREE.MathUtils.lerp(
                pointsRef.current.material.uniforms.uMouseY.value,
                mouse.y,
                0.1
            );
        }
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={particleCount}
                    array={positions}
                    itemSize={3}
                />
            </bufferGeometry>
            {/* Using ShaderMaterial for full control */}
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
};

const MoltenStoneBackground = () => {
    return (
        <div className="absolute inset-0 w-full h-full z-0 overflow-hidden bg-black/90">
            {/* Gradient Overlay for subtle text readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-stone-950 z-10 pointer-events-none" />

            {/* CSS Blur overlay as requested */}
            <div className="absolute inset-0 backdrop-blur-[1px] z-10 pointer-events-none" />

            <Canvas
                camera={{ position: [0, 0, 6], fov: 60 }}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                dpr={[1, 2]} // Optimize pixel ratio
                gl={{ antialias: false }} // Performance optimization
            >
                <Particles />
            </Canvas>
        </div>
    );
};

export default MoltenStoneBackground;
