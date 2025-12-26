import * as THREE from 'https://unpkg.com/three@0.155.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.155.0/examples/jsm/controls/OrbitControls.js';

// 基础场景
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.5, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// 环境光与点光
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const pLight = new THREE.PointLight(0xfff5c3, 1, 20);
pLight.position.set(0, 6, 6);
scene.add(pLight);

// 粒子圣诞树生成函数
function makeParticleTree({ height = 3.2, radialSegments = 256, levels = 220, points = 16000 } = {}) {
  const geometry = new THREE.BufferGeometry();
  const pos = new Float32Array(points * 3);
  const color = new Float32Array(points * 3);
  const size = new Float32Array(points);

  let idx = 0;
  for (let i = 0; i < points; i++) {
    // 采用高度采样法：随机高度 y，然后半径按高度衰减形成圆锥形
    const h = Math.random() ** 1.6 * height; // 更偏向树底
    const maxR = (1 - (h / height)) * 1.6; // 底大顶小
    const r = Math.random() ** 0.9 * maxR;
    const theta = Math.random() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const y = h - 0.2; // 微微向上

    pos[idx * 3 + 0] = x;
    pos[idx * 3 + 1] = y;
    pos[idx * 3 + 2] = z;

    // 颜色：由深绿到亮绿带一点黄
    const t = h / height;
    const rC = 0.05 + 0.4 * (1 - t);
    const gC = 0.25 + 0.7 * t;
    const bC = 0.05 + 0.15 * t;
    color[idx * 3 + 0] = rC;
    color[idx * 3 + 1] = gC;
    color[idx * 3 + 2] = bC;

    // 大小随高度变化
    size[idx] = 6 * (0.5 + 0.5 * (1 - t));

    idx++;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(size, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uSize: { value: 1.0 },
      uTwinkle: { value: 1.0 }
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      varying float vTw;
      uniform float uTime;
      uniform float uSize;
      void main(){
        vColor = color;
        // 添加微小摆动
        vec3 p = position;
        p.x += sin(uTime*0.7 + position.y*3.0 + position.x*6.0) * 0.005;
        p.z += cos(uTime*0.5 + position.y*2.0 + position.z*4.0) * 0.005;
        // 闪烁分量（传给片元）
        vTw = 0.5 + 0.5 * sin(uTime*6.0 + position.y*8.0);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * uSize * (300.0 / -mvPosition.z) * (1.0/uPixelRatio);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTw;
      uniform float uTwinkle;
      void main(){
        float r = length(gl_PointCoord - vec2(0.5));
        if (r > 0.5) discard;
        float alpha = 0.7 + 0.3 * (vTw * uTwinkle);
        vec3 col = vColor * (0.8 + 0.4 * (vTw * uTwinkle));
        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  const pointsMesh = new THREE.Points(geometry, material);
  return pointsMesh;
}

const isMobile = (innerWidth < 700) || /Mobi|Android/i.test(navigator.userAgent);
let initialPoints = isMobile ? 8000 : 18000;
let tree = makeParticleTree({ points: initialPoints });
scene.add(tree);

// 顶部星星
const starGeo = new THREE.SphereGeometry(0.06, 8, 6);
const starMat = new THREE.MeshBasicMaterial({ color: 0xffee66 });
const star = new THREE.Mesh(starGeo, starMat);
star.position.set(0, 3.25, 0);
scene.add(star);

// 地面光晕
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(3.5, 32),
  new THREE.MeshBasicMaterial({ color: 0x052d2a, opacity: 0.35, transparent: true })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.25;
scene.add(ground);

// 彩灯（GPU 实例化）：使用 InstancedMesh、在顶点/片元着色器里闪烁与缩放
let lightsMesh = null;
function generateLights(count = 80) {
  if (lightsMesh) {
    scene.remove(lightsMesh);
    try { lightsMesh.geometry.dispose(); lightsMesh.material.dispose(); } catch(e) {}
  }
  const posAttr = tree.geometry.getAttribute('position');
  const n = posAttr.count;
  const palette = [0xff3d6b, 0xffd24d, 0x4cffb6, 0x7ec8ff, 0xe8a1ff];

  const sphereGeo = new THREE.SphereGeometry(0.035, 8, 6);
  const instGeo = sphereGeo.clone();

  const phases = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const dummyMatrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * n);
    const x = posAttr.getX(idx);
    const y = posAttr.getY(idx);
    const z = posAttr.getZ(idx);

    phases[i] = Math.random() * Math.PI * 2;
    const col = new THREE.Color(palette[i % palette.length]);
    colors[i*3 + 0] = col.r;
    colors[i*3 + 1] = col.g;
    colors[i*3 + 2] = col.b;

    dummyMatrix.makeTranslation(x, y, z);
    instGeo.setAttribute('instanceMatrix', instGeo.getAttribute('instanceMatrix') || new THREE.InstancedBufferAttribute(new Float32Array(count * 16), 16));
    const im = instGeo.getAttribute('instanceMatrix');
    for (let j = 0; j < 16; j++) im.setX(i*16 + j, dummyMatrix.elements[j]);
  }

  instGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  instGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uTwinkle: { value: tree.material.uniforms.uTwinkle.value } },
    vertexShader: `
      attribute float aPhase;
      attribute vec3 aColor;
      attribute mat4 instanceMatrix;
      uniform float uTime;
      varying vec3 vColor;
      void main(){
        vColor = aColor;
        float f = 0.7 + 0.6 * sin(uTime * 6.0 + aPhase);
        float s = 0.6 + 0.4 * sin(uTime * 6.0 + aPhase);
        vec3 localPos = position * s;
        vec4 worldPos = instanceMatrix * vec4(localPos, 1.0);
        vec4 mvPos = modelViewMatrix * worldPos;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main(){
        gl_FragColor = vec4(vColor, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false
  });

  // 使用一个空 mesh 承载 geometry+材质
  lightsMesh = new THREE.Mesh(instGeo, material);
  lightsMesh.frustumCulled = false;
  scene.add(lightsMesh);
}

generateLights(80);

// 飘雪系统
let snowPoints = null;
function generateSnow(count = 400) {
  if (snowPoints) {
    scene.remove(snowPoints);
  }
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 6.0;
    const y = Math.random() * 5.0 + 0.5;
    const z = (Math.random() - 0.5) * 6.0;
    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    speeds[i] = 0.2 + Math.random() * 0.6;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.9 });
  snowPoints = new THREE.Points(geo, mat);
  scene.add(snowPoints);
}

generateSnow(400);

// 动画循环
let clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const dt = clock.getDelta();
  tree.material.uniforms.uTime.value = t;

  // 轻微整体摆动
  tree.rotation.y = Math.sin(t * 0.25) * 0.03;
  if (lightsMesh) lightsMesh.rotation.y = Math.sin(t * 0.25 + 0.5) * 0.03;
  star.scale.setScalar(1.0 + 0.08 * Math.sin(t * 4.0));

  // lightsMesh 使用着色器做闪烁与缩放，无需逐个 JS 更新

  // 更新飘雪
  if (snowPoints) {
    const pos = snowPoints.geometry.attributes.position.array;
    const speed = snowPoints.geometry.attributes.speed.array;
    for (let i = 0; i < pos.length / 3; i++) {
      pos[i * 3 + 1] -= speed[i] * dt * 0.6;
      if (pos[i * 3 + 1] < -1) pos[i * 3 + 1] = 5.0 + Math.random() * 1.5;
    }
    snowPoints.geometry.attributes.position.needsUpdate = true;
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

// 响应尺寸
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// 添加 GUI 控件（lil-gui）
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.18.1/dist/lil-gui.esm.min.js';
const gui = new GUI({ width: 300 });

// 性能提示：基于设备调整默认粒子数
if (isMobile) console.log('移动设备检测：已降低默认粒子数量以优化性能');
const params = {
  size: 1.0,
  twinkle: 1.0,
  lightsOn: true,
  lightCount: 80,
  regenLights: () => generateLights(params.lightCount),
  snowOn: true,
  snowCount: 400,
  regenSnow: () => generateSnow(params.snowCount)
};

// 为 instanced lights 的着色器同步 uTwinkle
function syncLightsTwinkle() {
  if (lightsMesh && lightsMesh.material && lightsMesh.material.uniforms) {
    lightsMesh.material.uniforms.uTwinkle.value = tree.material.uniforms.uTwinkle.value;
  }
}

twCtrl.onChange(() => syncLightsTwinkle());

const sizeCtrl = gui.add(params, 'size', 0.2, 4.0, 0.05).name('粒子尺寸').onChange(v => {
  tree.material.uniforms.uSize.value = v;
});
const twCtrl = gui.add(params, 'twinkle', 0.0, 2.0, 0.01).name('闪烁强度').onChange(v => {
  tree.material.uniforms.uTwinkle.value = v;
});

// 粒子重生成以便性能调节
params.particleCount = initialPoints;
params.regenTree = () => {
  if (tree) {
    scene.remove(tree);
    try { tree.geometry.dispose(); tree.material.dispose(); } catch (e) {}
  }
  tree = makeParticleTree({ points: Math.max(1000, Math.floor(params.particleCount)) });
  scene.add(tree);
};
const particleCtrl = gui.add(params, 'particleCount', 1000, 50000, 500).name('粒子数量');
const regenTreeBtn = gui.add(params, 'regenTree').name('重新生成树(性能调试)');
const lightsToggle = gui.add(params, 'lightsOn').name('彩灯开关').onChange(v => {
  if (lightsMesh) lightsMesh.visible = v;
});
const lightCountCtrl = gui.add(params, 'lightCount', 10, 300, 1).name('彩灯数量');
const regenBtn = gui.add(params, 'regenLights').name('重新生成彩灯');
const snowToggle = gui.add(params, 'snowOn').name('飘雪开关').onChange(v => {
  if (snowPoints) snowPoints.visible = v;
});
const snowCountCtrl = gui.add(params, 'snowCount', 50, 2000, 1).name('雪粒数量');
const regenSnowBtn = gui.add(params, 'regenSnow').name('重新生成飘雪');

// 简单说明日志
console.log('粒子圣诞树已加载 — 使用 Three.js 渲染');