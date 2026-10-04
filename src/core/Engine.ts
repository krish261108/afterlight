import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Quality } from './Save';

export interface LightingPreset {
  sky: [string, string, string];
  fog: string;
  fogDensity: number;
  sun: string;
  sunIntensity: number;
  sunDir: [number, number, number];
  ambient: string;
  ambientIntensity: number;
  hemiGround: string;
  exposure: number;
  bloom: number;
  suns: number;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private skyMat: THREE.ShaderMaterial;
  readonly sky: THREE.Mesh;
  quality: Quality = 'high';
  private bloomStrength = 0.6;
  readonly canvas: HTMLCanvasElement;
  flash = 0;
  private baseExposure = 1;

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'game-canvas';
    parent.appendChild(this.canvas);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 600);
    this.camera.position.set(0, 3, 8);

    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x2a1f18, 0.7);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.15);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff0dd, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.left = -32;
    sc.right = 32;
    sc.top = 32;
    sc.bottom = -32;
    sc.near = 1;
    sc.far = 140;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#1b2448') },
        mid: { value: new THREE.Color('#8a6fa8') },
        bottom: { value: new THREE.Color('#e8b48a') },
        sunDir: { value: new THREE.Vector3(0.4, 0.3, -1).normalize() },
        sunColor: { value: new THREE.Color('#fff2d8') },
        suns: { value: 1 },
        time: { value: 0 },
        stars: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
        uniform vec3 sunDir; uniform vec3 sunColor; uniform float suns; uniform float time; uniform float stars;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bottom, pow(-h, 0.4));
          col = mix(col, bottom, smoothstep(0.25, -0.02, h) * 0.6);
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35);
          if (suns > 1.5) {
            vec3 s2d = normalize(sunDir + vec3(-0.55, 0.22, 0.25));
            float s2 = max(dot(d, s2d), 0.0);
            col += vec3(0.85, 0.88, 1.0) * (pow(s2, 2600.0) * 3.0 + pow(s2, 60.0) * 0.08);
          }
          if (stars > 0.0 && h > 0.0) {
            vec3 q = floor(d * 260.0);
            float st = step(0.9965, hash(q));
            col += vec3(st) * stars * smoothstep(0.0, 0.3, h) * (0.6 + 0.4 * sin(time * 2.0 + hash(q) * 40.0));
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(0x8a7d9a, 0.012);

    this.setQuality('high');
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.castShadow = q !== 'low';
    if (q === 'low') {
      this.composer?.dispose();
      this.composer = null;
      this.bloom = null;
    } else if (!this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.bloomStrength, 0.55, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 72 : 58;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    const half = this.quality === 'high' ? 0.5 : 0.35;
    this.bloom?.setSize(Math.max(64, w * half), Math.max(64, h * half));
  }

  applyLighting(p: LightingPreset) {
    const u = this.skyMat.uniforms;
    (u.top.value as THREE.Color).set(p.sky[0]);
    (u.mid.value as THREE.Color).set(p.sky[1]);
    (u.bottom.value as THREE.Color).set(p.sky[2]);
    (u.sunDir.value as THREE.Vector3).set(...p.sunDir).normalize();
    (u.sunColor.value as THREE.Color).set(p.sun);
    u.suns.value = p.suns;
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.set(p.fog);
    fog.density = p.fogDensity;
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.set(p.sky[1]);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.ambientIntensity;
    this.ambient.color.set(p.ambient);
    this.ambient.intensity = p.ambientIntensity * 0.35;
    this.baseExposure = p.exposure;
    this.renderer.toneMappingExposure = p.exposure;
    this.bloomStrength = p.bloom;
    if (this.bloom) this.bloom.strength = p.bloom;
    this.scene.background = null;
  }

  setStars(v: number) {
    this.skyMat.uniforms.stars.value = v;
  }

  sunDirection() {
    return (this.skyMat.uniforms.sunDir.value as THREE.Vector3).clone();
  }

  /** Keeps the shadow frustum centred on the action. */
  followShadow(target: THREE.Vector3) {
    const dir = this.sunDirection();
    this.sun.position.copy(target).addScaledVector(dir, 60);
    this.sun.target.position.copy(target);
  }

  render(time: number) {
    this.skyMat.uniforms.time.value = time;
    this.sky.position.copy(this.camera.position);
    if (this.flash > 0) {
      this.renderer.toneMappingExposure = this.baseExposure * (1 + this.flash * 2.5);
      this.flash = Math.max(0, this.flash - 0.06);
      if (this.flash === 0) this.renderer.toneMappingExposure = this.baseExposure;
    }
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
