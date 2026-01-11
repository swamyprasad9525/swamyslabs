import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Sparkles, Float, Environment } from '@react-three/drei';
import * as THREE from 'three';

const RoughStone = () => {
    const meshRef = useRef();

    // Rotate the stone slowly
    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.rotation.y += 0.002;
            meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
        }
    });

    return (
        <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
            <mesh ref={meshRef} scale={2}>
                {/* Deformed sphere to simulate raw stone block */}
                <sphereGeometry args={[1, 64, 64]} />
                {/* Rough, jagged material */}
                <MeshDistortMaterial
                    color="#1c1917" // Dark Charcoal
                    attach="material"
                    distort={0.4} // High distortion for "raw" look
                    speed={0.5} // Slow movement of distortion
                    roughness={0.9}
                    metalness={0.2}
                    bumpScale={0.05}
                />
            </mesh>
        </Float>
    );
};

const FissureLight = () => {
    const lightRef = useRef();

    // Animate light to simulate a pulse/breathing
    useFrame((state) => {
        if (lightRef.current) {
            lightRef.current.intensity = 2 + Math.sin(state.clock.elapsedTime) * 0.5;
        }
    });

    return (
        <pointLight ref={lightRef} position={[0, 0, 0]} color="#f59e0b" distance={5} decay={2} />
    );
};


const StoneHero = () => {
    return (
        <div className="w-full h-full min-h-[50vh] lg:min-h-screen relative">
            <Canvas camera={{ position: [0, 0, 4], fov: 45 }}>
                {/* Lighting Setup */}
                <ambientLight intensity={0.5} />
                <directionalLight position={[5, 5, 5]} intensity={1} color="#ffffff" />
                <pointLight position={[-5, -5, -5]} intensity={0.5} color="#4b5563" />

                {/* The "Fissure" Light (Internal Glow) */}
                <FissureLight />

                {/* The Main Object */}
                <RoughStone />

                {/* Floating Particles (Dust) */}
                <Sparkles
                    count={100}
                    scale={6}
                    size={2}
                    speed={0.4}
                    opacity={0.5}
                    color="#d97706" // Amber dust
                />

                {/* Environment for reflections */}
                <Environment preset="city" />
            </Canvas>
        </div>
    );
};

export default StoneHero;
