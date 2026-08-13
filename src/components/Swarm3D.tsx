'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Task } from '@/lib/types';

interface Swarm3DProps {
  active: boolean;
  tasks?: Task[];
  count?: number;
  className?: string;
}

const STATUS_COLORS: Record<Task['status'], number> = {
  pending: 0x64748b,
  working: 0x22d3ee,
  done: 0x34d399,
  failed: 0xf43f5e,
};

const STATUS_GLYPH: Record<Task['status'], string> = {
  pending: '·',
  working: '●',
  done: '✓',
  failed: '✕',
};

const MAX_AGENTS = 10;

/**
 * Hero 3D "mission control" swarm.
 * - A central orchestrator core (layered rings + inner energy + glow).
 * - One orbiting node per agent, colored by state (working/done/failed/pending),
 *   each with a tiny A1..An label and a connection strand back to the core.
 * - Flow particles travel along each strand (out while working, back when done)
 *   so information visibly moves through the swarm.
 * - Background boids + halo are kept subtle so the agent hierarchy dominates.
 */
export function Swarm3D({ active, tasks, count = 240, className = '' }: Swarm3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const tasksRef = useRef<Task[]>(tasks ?? []);
  tasksRef.current = tasks ?? [];

  const agentCount = Math.min(Math.max((tasks ?? []).length, 0), MAX_AGENTS);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 2000);
    camera.position.z = 9.5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    /* ---------- lights ---------- */
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const key = new THREE.PointLight(0x14ffec, 3, 60);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.PointLight(0x0d7377, 2.4, 60);
    fill.position.set(-3, -1, 2);
    scene.add(fill);

    /* ---------- central core ---------- */
    const coreGeo = new THREE.SphereGeometry(1.0, 64, 64);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x14ffec,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.4,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    // inner energy shell
    const shellGeo = new THREE.SphereGeometry(1.28, 32, 32);
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0x14ffec,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    scene.add(shell);

    // core glow sprite (additive radial)
    const coreGlowTex = makeGlowTexture();
    const coreGlowMat = new THREE.SpriteMaterial({
      map: coreGlowTex,
      color: 0x14ffec,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreGlow = new THREE.Sprite(coreGlowMat);
    coreGlow.scale.set(5.5, 5.5, 1);
    scene.add(coreGlow);

    // layered transparent rings
    const rings: THREE.Mesh[] = [];
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x14ffec,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMat2 = ringMat.clone();
    ringMat2.color = new THREE.Color(0x0d7377);
    ringMat2.opacity = 0.22;
    const ringDefs = [
      { r: 1.9, m: ringMat, rot: [Math.PI / 2, 0, 0] },
      { r: 2.5, m: ringMat2, rot: [Math.PI / 2.6, 0.4, 0] },
      { r: 3.1, m: ringMat, rot: [Math.PI / 1.9, -0.3, 0.2] },
    ];
    for (const def of ringDefs) {
      const geo = new THREE.TorusGeometry(def.r, 0.015, 8, 128);
      const ring = new THREE.Mesh(geo, def.m);
      ring.rotation.set(def.rot[0], def.rot[1], def.rot[2]);
      scene.add(ring);
      rings.push(ring);
    }

    /* ---------- particle halo (subtle) ---------- */
    const haloCount = 700;
    const haloPos = new Float32Array(haloCount * 3);
    const haloCol = new Float32Array(haloCount * 3);
    const cyan = new THREE.Color(0x14ffec);
    const teal = new THREE.Color(0x0d7377);
    for (let i = 0; i < haloCount; i++) {
      const r = 1.7 + Math.random() * 1.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      haloPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      haloPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      haloPos[i * 3 + 2] = r * Math.cos(phi);
      const c = Math.random();
      const color = c < 0.55 ? cyan : teal;
      haloCol[i * 3] = color.r;
      haloCol[i * 3 + 1] = color.g;
      haloCol[i * 3 + 2] = color.b;
    }
    const haloGeo = new THREE.BufferGeometry();
    haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
    haloGeo.setAttribute('color', new THREE.BufferAttribute(haloCol, 3));
    const haloMat = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Points(haloGeo, haloMat);
    scene.add(halo);

    /* ---------- orbiting boids (subtle background) ---------- */
    const boidCount = count;
    const boidPos = new Float32Array(boidCount * 3);
    const boidCol = new Float32Array(boidCount * 3);
    const boidMeta: { radius: number; speed: number; phase: number; tilt: number }[] = [];
    for (let i = 0; i < boidCount; i++) {
      const radius = 2.4 + Math.random() * 4.4;
      const theta = Math.random() * Math.PI * 2;
      const tilt = (Math.random() - 0.5) * Math.PI * 0.7;
      const speed = 0.12 + Math.random() * 0.4;
      boidMeta.push({ radius, speed, phase: theta, tilt });
      boidPos[i * 3] = radius * Math.cos(theta);
      boidPos[i * 3 + 1] = 0;
      boidPos[i * 3 + 2] = radius * Math.sin(theta);
      const c = Math.random();
      const color = c < 0.6 ? cyan : teal;
      boidCol[i * 3] = color.r;
      boidCol[i * 3 + 1] = color.g;
      boidCol[i * 3 + 2] = color.b;
    }
    const boidGeo = new THREE.BufferGeometry();
    boidGeo.setAttribute('position', new THREE.BufferAttribute(boidPos, 3));
    boidGeo.setAttribute('color', new THREE.BufferAttribute(boidCol, 3));
    const boidMat = new THREE.PointsMaterial({
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const boids = new THREE.Points(boidGeo, boidMat);
    scene.add(boids);

    /* ---------- starfield backdrop ---------- */
    const stars = new Float32Array(800 * 3);
    for (let i = 0; i < 800; i++) {
      const r = 30 + Math.random() * 50;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      stars[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      stars[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      stars[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    const starMat = new THREE.PointsMaterial({
      color: document.documentElement.classList.contains('dark') ? 0xffffff : 0x0b0f19,
      size: 0.08,
      transparent: true,
      opacity: 0.35,
    });
    const starsMesh = new THREE.Points(starGeo, starMat);
    scene.add(starsMesh);

    /* ---------- agent nodes + connections + flow ---------- */
    const agentNodes: THREE.Mesh[] = [];
    const agentGlows: THREE.Sprite[] = [];
    const agentLabels: THREE.Sprite[] = [];
    const agentLines: THREE.Line[] = [];
    const agentFlow: THREE.Points[] = [];
    const flowMeta: { phase: number; speed: number }[] = [];
    const statusRef: Task['status'][] = [];

    const nodeGeo = new THREE.SphereGeometry(0.22, 24, 24);
    const lineGeoProto = new THREE.BufferGeometry();
    lineGeoProto.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));

    const orbitRadius = 3.9;

    for (let i = 0; i < agentCount; i++) {
      statusRef.push('pending');

      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: STATUS_COLORS.pending,
        emissiveIntensity: 0.9,
        roughness: 0.25,
        metalness: 0.3,
      });
      const node = new THREE.Mesh(nodeGeo, mat);
      scene.add(node);
      agentNodes.push(node);

      const glowMat = new THREE.SpriteMaterial({
        map: coreGlowTex,
        color: STATUS_COLORS.pending,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(1.2, 1.2, 1);
      scene.add(glow);
      agentGlows.push(glow);

      const label = makeLabel(`A${i + 1}`, '#e5e7eb');
      scene.add(label);
      agentLabels.push(label);

      const lineMat = new THREE.LineBasicMaterial({
        color: 0x0d7377,
        transparent: true,
        opacity: 0.35,
      });
      const line = new THREE.Line(lineGeoProto.clone(), lineMat);
      scene.add(line);
      agentLines.push(line);

      const flowGeo = new THREE.BufferGeometry();
      flowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      const flowMat = new THREE.PointsMaterial({
        size: 0.12,
        color: 0x14ffec,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const flow = new THREE.Points(flowGeo, flowMat);
      flow.frustumCulled = false;
      scene.add(flow);
      agentFlow.push(flow);
      flowMeta.push({ phase: Math.random() * 1, speed: 0.4 + Math.random() * 0.4 });
    }

    /* ---------- theme ---------- */
    const applyTheme = () => {
      const dark = document.documentElement.classList.contains('dark');
      starMat.color.setHex(dark ? 0xffffff : 0x0b0f19);
      starMat.opacity = dark ? 0.35 : 0.22;
      haloMat.opacity = dark ? 0.5 : 0.4;
      boidMat.opacity = dark ? 0.55 : 0.45;
      coreMat.color.setHex(dark ? 0xe5e7eb : 0xffffff);
    };
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    applyTheme();

    /* ---------- clock loop ---------- */
    const clock = new THREE.Clock();
    let raf = 0;
    let speedFactor = active ? 1 : 0.18;
    const groupAngle = new THREE.Vector3();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const t = clock.elapsedTime;

      const target = active ? 1 : 0.18;
      speedFactor += (target - speedFactor) * Math.min(1, dt * 2);

      // core + rings + halo
      core.rotation.y += dt * 0.25 * speedFactor;
      shell.rotation.y -= dt * 0.14 * speedFactor;
      halo.rotation.y += dt * 0.08 * speedFactor;
      for (let i = 0; i < rings.length; i++) {
        rings[i].rotation.z += dt * (0.15 + i * 0.05) * speedFactor;
        rings[i].rotation.x += dt * 0.06 * speedFactor;
      }

      // orbit boids (subtle)
      const pos = boidGeo.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < boidCount; i++) {
        const m = boidMeta[i];
        m.phase += dt * m.speed * speedFactor * (active ? 0.6 : 0.2);
        const bx = Math.cos(m.phase) * m.radius;
        const bz = Math.sin(m.phase) * m.radius;
        const by = Math.sin(m.phase * 1.3) * (m.radius * 0.18) * Math.sin(m.tilt);
        arr[i * 3] = bx;
        arr[i * 3 + 1] = by;
        arr[i * 3 + 2] = bz;
      }
      pos.needsUpdate = true;

      // core pulse
      const intensity = 0.7 + Math.sin(t * 2.4) * 0.3;
      coreMat.emissive.setHex(active ? 0x14ffec : 0x0d7377);
      coreMat.emissiveIntensity = intensity * (active ? 1.25 : 0.8);
      shellMat.opacity = (active ? 0.2 : 0.12) + Math.sin(t * 2) * 0.05;
      coreGlowMat.opacity = 0.4 + Math.sin(t * 2.4) * 0.15;

      // agents
      const tasks = tasksRef.current;
      const spin = active ? t * 0.12 : t * 0.03;
      for (let i = 0; i < agentCount; i++) {
        const task = tasks[i];
        const status: Task['status'] = task?.status ?? 'pending';
        const baseAngle = (i / agentCount) * Math.PI * 2 + spin;
        const ax = Math.cos(baseAngle) * orbitRadius;
        const az = Math.sin(baseAngle) * orbitRadius;
        const ay = Math.sin(baseAngle * 2) * 0.5;

        agentNodes[i].position.set(ax, ay, az);
        agentGlows[i].position.set(ax, ay, az);
        agentLabels[i].position.set(ax, ay + 0.55, az);

        // connection line core -> agent
        const lp = agentLines[i].geometry.getAttribute('position') as THREE.BufferAttribute;
        const lArr = lp.array as Float32Array;
        lArr[0] = 0; lArr[1] = 0; lArr[2] = 0;
        lArr[3] = ax; lArr[4] = ay; lArr[5] = az;
        lp.needsUpdate = true;

        // status-driven appearance
        const col = STATUS_COLORS[status];
        const nodeMat = agentNodes[i].material as THREE.MeshStandardMaterial;
        nodeMat.emissive.setHex(col);
        nodeMat.emissiveIntensity = status === 'working' ? 1.6 : status === 'done' ? 0.7 : 1.0;
        (agentGlows[i].material as THREE.SpriteMaterial).color.setHex(col);
        (agentGlows[i].material as THREE.SpriteMaterial).opacity =
          status === 'working' ? 0.55 + Math.sin(t * 4) * 0.25 : 0.4;
        (agentLines[i].material as THREE.LineBasicMaterial).opacity =
          status === 'failed' ? 0.12 : status === 'done' ? 0.22 : 0.4;

        // label glyph/color
        if (statusRef[i] !== status) {
          statusRef[i] = status;
          updateLabel(agentLabels[i], `${STATUS_GLYPH[status]} A${i + 1}`, labelColor(status));
        }

        // flow particle: working -> out to agent, done -> back to core, else idle
        const fm = flowMeta[i];
        if (status === 'working' || status === 'done') {
          fm.phase += dt * fm.speed * speedFactor;
          const p = (Math.sin(fm.phase) + 1) / 2; // 0..1
          const from = status === 'working' ? 0.8 : orbitRadius - 0.3;
          const to = status === 'working' ? orbitRadius - 0.3 : 0.8;
          const r = from + (to - from) * p;
          const fx = Math.cos(baseAngle) * r;
          const fz = Math.sin(baseAngle) * r;
          const fy = (ay / orbitRadius) * r;
          const fp = agentFlow[i].geometry.getAttribute('position') as THREE.BufferAttribute;
          (fp.array as Float32Array)[0] = fx;
          (fp.array as Float32Array)[1] = fy;
          (fp.array as Float32Array)[2] = fz;
          fp.needsUpdate = true;
          (agentFlow[i].material as THREE.PointsMaterial).opacity = 0.95;
        } else {
          (agentFlow[i].material as THREE.PointsMaterial).opacity = 0;
        }
      }

      // camera drift
      camera.position.x = Math.sin(t * 0.15) * 0.8;
      camera.position.y = Math.cos(t * 0.12) * 0.5;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    /* ---------- resize ---------- */
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // Rebuild scene only when active flips or the number of agents changes.
    // Per-task status is read live from tasksRef inside the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, agentCount]);

  return <div ref={mountRef} role="img" aria-label="Swarm visualization with orbiting agents and a glowing core" className={`relative ${className}`} />;
}

/* ------------------------------------------------------------------------- *
 * Canvas sprite helpers
 * ------------------------------------------------------------------------- */

function makeGlowTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function labelColor(status: Task['status']): string {
  switch (status) {
    case 'working': return '#22d3ee';
    case 'done': return '#34d399';
    case 'failed': return '#f43f5e';
    default: return '#94a3b8';
  }
}

function makeLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 42px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 40);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.4, 0.44, 1);
  return sprite;
}

function updateLabel(sprite: THREE.Sprite, text: string, color: string): void {
  const mat = sprite.material as THREE.SpriteMaterial;
  if (mat.map) {
    mat.map.dispose();
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 42px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 40);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  mat.map = tex;
  mat.needsUpdate = true;
}

export default Swarm3D;
