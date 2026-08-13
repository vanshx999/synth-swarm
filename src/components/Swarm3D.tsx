'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Swarm3DProps {
  active: boolean;
  count?: number;
  className?: string;
}

/**
 * Real 3D swarm visualization (Three.js).
 * - A glowing core sphere (additive shader feel via emissive + points halo)
 * - `count` orbiting boids: each is a small glowing node on a ring, they spin
 *   around and gently bob; rings are tilted in 3D so motion reads as depth.
 * - Active state ramps particle speed + emission color to a hotter palette.
 */
export function Swarm3D({ active, count = 240, className = '' }: Swarm3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
    camera.position.z = 9;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    /* ---------- lights ---------- */
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const key = new THREE.PointLight(0x8b5cf6, 3, 60);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.PointLight(0x0ea5e9, 2.4, 60);
    fill.position.set(-3, -1, 2);
    scene.add(fill);

    /* ---------- central core ---------- */
    const coreGeo = new THREE.SphereGeometry(1.15, 64, 64);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x8b5cf6,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.4,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    // inner glow shell
    const shellGeo = new THREE.SphereGeometry(1.42, 32, 32);
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    scene.add(shell);

    /* ---------- particle halo ---------- */
    const haloCount = 900;
    const haloPos = new Float32Array(haloCount * 3);
    const haloCol = new Float32Array(haloCount * 3);
    const cyan = new THREE.Color(0x0ea5e9);
    const violet = new THREE.Color(0x8b5cf6);
    const fuchsia = new THREE.Color(0xd946ef);
    for (let i = 0; i < haloCount; i++) {
      const r = 1.7 + Math.random() * 1.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      haloPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      haloPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      haloPos[i * 3 + 2] = r * Math.cos(phi);
      const c = Math.random();
      const color = c < 0.4 ? cyan : c < 0.75 ? violet : fuchsia;
      haloCol[i * 3] = color.r;
      haloCol[i * 3 + 1] = color.g;
      haloCol[i * 3 + 2] = color.b;
    }
    const haloGeo = new THREE.BufferGeometry();
    haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
    haloGeo.setAttribute('color', new THREE.BufferAttribute(haloCol, 3));
    const haloMat = new THREE.PointsMaterial({
      size: 0.035,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Points(haloGeo, haloMat);
    scene.add(halo);

    /* ---------- orbiting boids ---------- */
    const boidCount = count;
    const boidPos = new Float32Array(boidCount * 3);
    const boidCol = new Float32Array(boidCount * 3);
    const boidMeta: { radius: number; speed: number; phase: number; tilt: number }[] = [];
    for (let i = 0; i < boidCount; i++) {
      const radius = 2.4 + Math.random() * 4.2;
      const theta = Math.random() * Math.PI * 2;
      const tilt = (Math.random() - 0.5) * Math.PI * 0.7;
      const speed = 0.12 + Math.random() * 0.4;
      boidMeta.push({ radius, speed, phase: theta, tilt });
      boidPos[i * 3] = radius * Math.cos(theta);
      boidPos[i * 3 + 1] = 0;
      boidPos[i * 3 + 2] = radius * Math.sin(theta);
      const c = Math.random();
      const color = c < 0.45 ? cyan : c < 0.8 ? violet : fuchsia;
      boidCol[i * 3] = color.r;
      boidCol[i * 3 + 1] = color.g;
      boidCol[i * 3 + 2] = color.b;
    }
    const boidGeo = new THREE.BufferGeometry();
    boidGeo.setAttribute('position', new THREE.BufferAttribute(boidPos, 3));
    boidGeo.setAttribute('color', new THREE.BufferAttribute(boidCol, 3));
    const boidMat = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const boids = new THREE.Points(boidGeo, boidMat);
    scene.add(boids);

    /* ---------- connecting strands ---------- */
    const strandMat = new THREE.LineBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.22,
    });
    const strandLines: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
    for (let i = 0; i < 48; i++) {
      const a = i;
      const b = (i + 1) % boidCount;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(6), 3)
      );
      const line = new THREE.Line(geo, strandMat.clone());
      line.userData = { a, b };
      scene.add(line);
      strandLines.push(line);
    }

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

    const applyTheme = () => {
      const dark = document.documentElement.classList.contains('dark');
      starMat.color.setHex(dark ? 0xffffff : 0x0b0f19);
      starMat.opacity = dark ? 0.35 : 0.22;
      haloMat.opacity = dark ? 0.85 : 0.65;
      coreMat.color.setHex(dark ? 0xe5e7eb : 0xffffff);
    };
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    applyTheme();

    /* ---------- clock loop ---------- */
    const clock = new THREE.Clock();
    let raf = 0;
    let speedFactor = active ? 1 : 0.18;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();

      // smooth speed transitions
      const target = active ? 1 : 0.18;
      speedFactor += (target - speedFactor) * Math.min(1, dt * 2);

      // rotate core + halo slowly
      core.rotation.y += dt * 0.2 * speedFactor;
      shell.rotation.y -= dt * 0.12 * speedFactor;
      halo.rotation.y += dt * 0.08 * speedFactor;

      // orbit boids
      const pos = boidGeo.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < boidCount; i++) {
        const m = boidMeta[i];
        m.phase += dt * m.speed * speedFactor * (active ? 1 : 0.2);
        const bx = Math.cos(m.phase) * m.radius;
        const bz = Math.sin(m.phase) * m.radius;
        const by = Math.sin(m.phase * 1.3) * (m.radius * 0.18) * Math.sin(m.tilt);
        arr[i * 3] = bx;
        arr[i * 3 + 1] = by;
        arr[i * 3 + 2] = bz;
      }
      pos.needsUpdate = true;

      // update strands to connect nearest-ring neighbors (unrolled)
      const posArr = pos.array as Float32Array;
      for (const line of strandLines) {
        const { a, b } = line.userData as { a: number; b: number };
        const geoPos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
        const lp = geoPos.array as Float32Array;
        lp[0] = posArr[a * 3];
        lp[1] = posArr[a * 3 + 1];
        lp[2] = posArr[a * 3 + 2];
        lp[3] = posArr[b * 3];
        lp[4] = posArr[b * 3 + 1];
        lp[5] = posArr[b * 3 + 2];
        geoPos.needsUpdate = true;
      }

      // core emissive pulse
      const intensity = 0.55 + Math.sin(clock.elapsedTime * 2.4) * 0.25;
      (coreMat.emissive as THREE.Color).setHex(active ? 0xd946ef : 0x8b5cf6);
      coreMat.emissiveIntensity = intensity * (active ? 1.3 : 0.8);
      shellMat.opacity = (active ? 0.22 : 0.12) + Math.sin(clock.elapsedTime * 2) * 0.04;

      // camera drift
      camera.position.x = Math.sin(clock.elapsedTime * 0.15) * 0.8;
      camera.position.y = Math.cos(clock.elapsedTime * 0.12) * 0.5;
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
      // dispose geometries/materials to avoid leaks
      [
        coreGeo, shellGeo, haloGeo, boidGeo, starGeo,
        coreMat, shellMat, haloMat, boidMat, strandMat, starMat,
      ].forEach((o) => (o as THREE.BufferGeometry | THREE.Material).dispose());
      strandLines.forEach((l) => l.geometry.dispose());
    };
  }, [active, count]);

  return <div ref={mountRef} role="img" aria-label="Swarm visualization with orbiting boids and glowing core" className={`relative ${className}`} />;
}

export default Swarm3D;
