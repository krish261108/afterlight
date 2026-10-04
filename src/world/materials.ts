import * as THREE from 'three';

const cache = new Map<string, THREE.Material>();

export function mat(color: string | number, opts: { rough?: number; metal?: number; emissive?: string | number; emissiveIntensity?: number; flat?: boolean; transparent?: boolean; opacity?: number; side?: THREE.Side } = {}) {
  const key = JSON.stringify([color, opts]);
  let m = cache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.85,
      metalness: opts.metal ?? 0.05,
      flatShading: opts.flat ?? true,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    });
    cache.set(key, m);
  }
  return m;
}

export function glow(color: string | number, intensity = 2) {
  const key = 'glow:' + color + ':' + intensity;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false });
    cache.set(key, m);
  }
  return m;
}

export function additive(color: string | number, opacity = 0.6) {
  const key = 'add:' + color + ':' + opacity;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    cache.set(key, m);
  }
  return m;
}

export const isShared = (m: THREE.Material) => {
  for (const v of cache.values()) if (v === m) return true;
  return false;
};

export const PALETTE = {
  stone: '#8d8577',
  stoneDark: '#5d564d',
  stoneLight: '#b3aa98',
  wood: '#6b4a30',
  woodDark: '#4a3322',
  halvethGrey: '#6d7280',
  halvethDark: '#3f434d',
  reachRed: '#9c3b24',
  reachOchre: '#c4843d',
  bone: '#e6dcc6',
  violet: '#b07cff',
  stillfire: '#f4f7ff',
  wheelBlue: '#5fb8ff',
  amber: '#ffb347',
  skin1: '#c99a78',
  skin2: '#8d5a3b',
  skin3: '#e2b896',
  skin4: '#6b4128',
};
