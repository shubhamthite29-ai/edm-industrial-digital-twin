import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Component, Suspense, useMemo, useRef, type ReactNode } from "react";
import { Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { DerivedMetrics, MachineParameters } from "../types/twin";

const CAD_MODEL_URL = `${import.meta.env.BASE_URL}models/edm-unity.fbx`;

class SceneErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function prepareCadModel(model: Group) {
  model.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;

      if (!object.material) {
        object.material = new MeshStandardMaterial({ color: "#5d7187", metalness: 0.48, roughness: 0.36 });
      }

      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if ("metalness" in material) material.metalness = Math.max(material.metalness ?? 0, 0.28);
        if ("roughness" in material) material.roughness = Math.min(material.roughness ?? 0.5, 0.52);
      });
    }
  });

  const box = new Box3().setFromObject(model);
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  const scale = 1.45 / maxAxis;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale - 0.48, -center.z * scale);

  return model;
}

function CadEDMModel({ metrics, parameters }: { metrics: DerivedMetrics; parameters: MachineParameters }) {
  const model = useLoader(FBXLoader, CAD_MODEL_URL);
  const root = useRef<Group>(null);
  const spark = useRef<Mesh>(null);
  const thermal = metrics.dielectricTemperature / 45;
  const arcColor = metrics.gapState === "Arc" || metrics.gapState === "Short Circuit" ? "#ff5168" : "#28d7ff";

  const preparedModel = useMemo(() => prepareCadModel(model), [model]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (root.current) {
      root.current.rotation.y = -0.45 + Math.sin(t * 0.18) * 0.18;
      root.current.position.y = Math.sin(t * 1.25) * parameters.gapDistance * 0.35;
    }
    if (spark.current) {
      const sparkScale = 0.72 + Math.sin(t * 20) * 0.12 + metrics.arcRatio * 0.9;
      spark.current.scale.setScalar(sparkScale);
    }
  });

  return (
    <group ref={root} rotation={[0.16, -0.62, 0]} position={[0, 0.05, 0]}>
      <primitive object={preparedModel} />
      <mesh ref={spark} position={[0.02, -0.18, 0.04]}>
        <sphereGeometry args={[0.07, 32, 32]} />
        <meshStandardMaterial color={arcColor} emissive={arcColor} emissiveIntensity={3} transparent opacity={0.88} />
      </mesh>
      <mesh position={[0.02, -0.2, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.5 + thermal * 0.18, 72]} />
        <meshBasicMaterial color={metrics.gapState === "Spark" ? "#f4b24d" : arcColor} transparent opacity={0.18 + metrics.arcRatio * 0.32} />
      </mesh>
      <mesh position={[-0.78, -0.48, 0.7]}>
        <boxGeometry args={[0.9, 0.42, 0.14]} />
        <meshStandardMaterial color="#28d7ff" emissive="#0a5465" transparent opacity={0.38} />
      </mesh>
    </group>
  );
}

function FallbackEDMModel({ metrics, parameters }: { metrics: DerivedMetrics; parameters: MachineParameters }) {
  const ram = useRef<Mesh>(null);
  const spark = useRef<Mesh>(null);
  const heat = metrics.dielectricTemperature / 45;

  useFrame((state) => {
    if (ram.current) ram.current.position.y = 0.72 + Math.sin(state.clock.elapsedTime * 1.5) * parameters.gapDistance * 2;
    if (spark.current) spark.current.scale.setScalar(0.8 + Math.sin(state.clock.elapsedTime * 18) * 0.12 + metrics.arcRatio);
  });

  return (
    <group rotation={[0.18, -0.52, 0]} scale={1.15} position={[0, 0.05, 0]}>
      <mesh position={[0, -0.72, 0]}>
        <boxGeometry args={[3.4, 0.22, 2.4]} />
        <meshStandardMaterial color="#42546d" metalness={0.55} roughness={0.28} />
      </mesh>
      <mesh position={[0, -0.36, 0]}>
        <boxGeometry args={[2.4, 0.42, 1.45]} />
        <meshStandardMaterial color="#1e334a" metalness={0.45} roughness={0.4} />
      </mesh>
      <mesh ref={ram} position={[0, 0.72, 0]}>
        <boxGeometry args={[0.46, 1.05, 0.46]} />
        <meshStandardMaterial color="#4b6682" metalness={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 0.58, 32]} />
        <meshStandardMaterial color="#d3984f" metalness={0.9} roughness={0.18} />
      </mesh>
      <mesh ref={spark} position={[0, -0.2, 0]}>
        <sphereGeometry args={[0.08, 24, 24]} />
        <meshStandardMaterial color="#28d7ff" emissive="#28d7ff" emissiveIntensity={2.4} />
      </mesh>
      <mesh position={[0, -0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.48 + heat * 0.22, 48]} />
        <meshBasicMaterial color="#f4b24d" transparent opacity={0.18 + metrics.arcRatio * 0.28} />
      </mesh>
    </group>
  );
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.95} />
      <directionalLight position={[3, 5, 4]} intensity={3.8} color="#f7fbff" />
      <pointLight position={[2, 3, 3]} intensity={7} color="#28d7ff" />
      <pointLight position={[-3, 2, 2]} intensity={4} color="#f4b24d" />
      <gridHelper args={[4, 16, "#28d7ff", "#273244"]} position={[0, -0.85, 0]} />
    </>
  );
}

function SceneLoading() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[1.6, 0.08, 1.1]} />
        <meshStandardMaterial color="#273244" emissive="#0a2430" />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.45, 0.42, 0.45]} />
        <meshStandardMaterial color="#28d7ff" emissive="#073342" transparent opacity={0.45} />
      </mesh>
    </group>
  );
}

export function MachineScene({ metrics, parameters }: { metrics: DerivedMetrics; parameters: MachineParameters }) {
  return (
    <div className="relative h-[340px] overflow-hidden rounded border border-plant-line bg-[linear-gradient(90deg,rgba(39,50,68,0.18)_1px,transparent_1px),linear-gradient(0deg,rgba(39,50,68,0.18)_1px,transparent_1px),radial-gradient(circle_at_50%_45%,rgba(40,215,255,0.28),transparent_48%),#08111d] bg-[size:32px_32px,32px_32px,auto,auto]">
      <Canvas camera={{ position: [0, 1.05, 5.4], fov: 38 }} shadows>
        <SceneLights />
        <SceneErrorBoundary fallback={<FallbackEDMModel metrics={metrics} parameters={parameters} />}>
          <Suspense fallback={<SceneLoading />}>
            <CadEDMModel metrics={metrics} parameters={parameters} />
          </Suspense>
        </SceneErrorBoundary>
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-3 rounded border border-plant-cyan/40 bg-plant-void/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-plant-cyan">
        CAD model active
      </div>
    </div>
  );
}
