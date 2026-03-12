import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const canvas = document.getElementById('app');
const statsEl = document.getElementById('stats');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#7dc2f3');
scene.fog = new THREE.Fog('#8bc7f6', 25, 115);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(10, 15, 40);

const hemi = new THREE.HemisphereLight('#d8f8ff', '#6d8dc7', 1.1);
scene.add(hemi);

const sun = new THREE.DirectionalLight('#fff5dc', 1.0);
sun.position.set(45, 70, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
scene.add(sun);

const fillLight = new THREE.DirectionalLight('#8dd7ff', 0.55);
fillLight.position.set(-25, 15, -45);
scene.add(fillLight);

const skySphere = new THREE.Mesh(
  new THREE.SphereGeometry(180, 48, 24),
  new THREE.MeshBasicMaterial({ color: '#8fd2ff', side: THREE.BackSide })
);
scene.add(skySphere);

const world = {
  nx: 42,
  ny: 24,
  nz: 42,
  cellSize: 1,
  isoLevel: 0,
};

const fieldSize = (world.nx + 1) * (world.ny + 1) * (world.nz + 1);
const field = new Float32Array(fieldSize);

const tetrahedra = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
];

const cubeVerts = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];

const tetraEdgeToVertex = [
  [0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3],
];

const tetraTriTable = [
  [],
  [[0, 3, 2]],
  [[0, 1, 4]],
  [[1, 4, 2], [2, 4, 3]],
  [[1, 2, 5]],
  [[0, 3, 5], [0, 5, 1]],
  [[0, 2, 5], [0, 5, 4]],
  [[5, 4, 3]],
  [[3, 4, 5]],
  [[4, 5, 0], [5, 2, 0]],
  [[1, 5, 0], [5, 3, 0]],
  [[5, 2, 1]],
  [[3, 4, 2], [2, 4, 1]],
  [[4, 1, 0]],
  [[2, 3, 0]],
  [],
];

const terrainMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.92,
  metalness: 0.02,
  flatShading: false,
});

let terrainMesh = null;

function idx(x, y, z) {
  return x + (world.nx + 1) * (y + (world.ny + 1) * z);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function hash(n) {
  const x = Math.sin(n) * 43758.5453123;
  return x - Math.floor(x);
}

function valueNoise3D(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);

  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;

  const smooth = (t) => t * t * (3 - 2 * t);
  const u = smooth(xf);
  const v = smooth(yf);
  const w = smooth(zf);

  const h = (ix, iy, iz) => hash(ix * 157.13 + iy * 311.7 + iz * 911.3 + 47.23);

  const n000 = h(xi, yi, zi);
  const n100 = h(xi + 1, yi, zi);
  const n010 = h(xi, yi + 1, zi);
  const n110 = h(xi + 1, yi + 1, zi);
  const n001 = h(xi, yi, zi + 1);
  const n101 = h(xi + 1, yi, zi + 1);
  const n011 = h(xi, yi + 1, zi + 1);
  const n111 = h(xi + 1, yi + 1, zi + 1);

  const x00 = n000 * (1 - u) + n100 * u;
  const x10 = n010 * (1 - u) + n110 * u;
  const x01 = n001 * (1 - u) + n101 * u;
  const x11 = n011 * (1 - u) + n111 * u;

  const y0 = x00 * (1 - v) + x10 * v;
  const y1 = x01 * (1 - v) + x11 * v;

  return y0 * (1 - w) + y1 * w;
}

function fbm(x, y, z, octaves = 4) {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    total += amp * (valueNoise3D(x * freq, y * freq, z * freq) * 2 - 1);
    amp *= 0.5;
    freq *= 2.05;
  }
  return total;
}

function generateTerrainField() {
  for (let z = 0; z <= world.nz; z++) {
    for (let y = 0; y <= world.ny; y++) {
      for (let x = 0; x <= world.nx; x++) {
        const wx = x * world.cellSize;
        const wy = y * world.cellSize;
        const wz = z * world.cellSize;

        const hill = fbm(wx * 0.035, 0.13, wz * 0.035, 5) * 8;
        const plateau = fbm(wx * 0.01 + 14, 0.4, wz * 0.01 - 7, 2) * 10;
        const baseHeight = 8 + hill + plateau;
        const caves = fbm(wx * 0.06 + 30, wy * 0.09, wz * 0.06 - 17, 4) * 2.7;

        field[idx(x, y, z)] = (baseHeight - wy) + caves;
      }
    }
  }
}

function sampleField(worldPos) {
  const gx = clamp(worldPos.x / world.cellSize, 0, world.nx);
  const gy = clamp(worldPos.y / world.cellSize, 0, world.ny);
  const gz = clamp(worldPos.z / world.cellSize, 0, world.nz);

  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const z0 = Math.floor(gz);
  const x1 = Math.min(x0 + 1, world.nx);
  const y1 = Math.min(y0 + 1, world.ny);
  const z1 = Math.min(z0 + 1, world.nz);

  const tx = gx - x0;
  const ty = gy - y0;
  const tz = gz - z0;

  const lerp = (a, b, t) => a + (b - a) * t;

  const c000 = field[idx(x0, y0, z0)];
  const c100 = field[idx(x1, y0, z0)];
  const c010 = field[idx(x0, y1, z0)];
  const c110 = field[idx(x1, y1, z0)];
  const c001 = field[idx(x0, y0, z1)];
  const c101 = field[idx(x1, y0, z1)];
  const c011 = field[idx(x0, y1, z1)];
  const c111 = field[idx(x1, y1, z1)];

  const x00 = lerp(c000, c100, tx);
  const x10 = lerp(c010, c110, tx);
  const x01 = lerp(c001, c101, tx);
  const x11 = lerp(c011, c111, tx);

  const y0v = lerp(x00, x10, ty);
  const y1v = lerp(x01, x11, ty);

  return lerp(y0v, y1v, tz);
}

function gradientAt(worldPos) {
  const e = 0.4;
  const dx = sampleField(new THREE.Vector3(worldPos.x + e, worldPos.y, worldPos.z))
    - sampleField(new THREE.Vector3(worldPos.x - e, worldPos.y, worldPos.z));
  const dy = sampleField(new THREE.Vector3(worldPos.x, worldPos.y + e, worldPos.z))
    - sampleField(new THREE.Vector3(worldPos.x, worldPos.y - e, worldPos.z));
  const dz = sampleField(new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z + e))
    - sampleField(new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z - e));
  return new THREE.Vector3(dx, dy, dz).normalize();
}

function vertexColor(y, normal) {
  const low = new THREE.Color('#f4ca95');
  const mid = new THREE.Color('#82bf67');
  const high = new THREE.Color('#d9d8df');

  const h = clamp(y / world.ny, 0, 1);
  const slope = 1 - Math.abs(normal.y);
  const base = low.clone().lerp(mid, clamp(h * 1.25, 0, 1)).lerp(high, Math.max(0, h - 0.62) * 2.2);

  if (slope > 0.55) {
    base.lerp(new THREE.Color('#9a876f'), (slope - 0.55) * 1.3);
  }

  return base;
}

function polygoniseTetra(points, values, positions, normals, colors, indices) {
  let mask = 0;
  for (let i = 0; i < 4; i++) {
    if (values[i] >= world.isoLevel) mask |= (1 << i);
  }

  const triangles = tetraTriTable[mask];
  if (!triangles.length) return;

  const edgeVertices = new Array(6);

  for (let edge = 0; edge < 6; edge++) {
    const [a, b] = tetraEdgeToVertex[edge];
    const va = values[a];
    const vb = values[b];
    if ((va >= world.isoLevel) !== (vb >= world.isoLevel)) {
      const t = (world.isoLevel - va) / (vb - va);
      edgeVertices[edge] = points[a].clone().lerp(points[b], t);
    }
  }

  for (const tri of triangles) {
    const triIndices = [];
    for (const e of tri) {
      const p = edgeVertices[e];
      if (!p) continue;
      const n = gradientAt(p);
      const c = vertexColor(p.y, n);
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      colors.push(c.r, c.g, c.b);
      triIndices.push((positions.length / 3) - 1);
    }
    if (triIndices.length === 3) indices.push(...triIndices);
  }
}

function rebuildTerrainMesh() {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];

  for (let z = 0; z < world.nz; z++) {
    for (let y = 0; y < world.ny; y++) {
      for (let x = 0; x < world.nx; x++) {
        const cubePoints = cubeVerts.map(([ox, oy, oz]) => {
          return new THREE.Vector3((x + ox) * world.cellSize, (y + oy) * world.cellSize, (z + oz) * world.cellSize);
        });
        const cubeValues = cubeVerts.map(([ox, oy, oz]) => field[idx(x + ox, y + oy, z + oz)]);

        for (const tet of tetrahedra) {
          polygoniseTetra(
            tet.map((i) => cubePoints[i]),
            tet.map((i) => cubeValues[i]),
            positions,
            normals,
            colors,
            indices
          );
        }
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(indices);
  geom.computeBoundingSphere();

  if (terrainMesh) {
    scene.remove(terrainMesh);
    terrainMesh.geometry.dispose();
  }

  terrainMesh = new THREE.Mesh(geom, terrainMaterial);
  terrainMesh.castShadow = true;
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);
}

function applyBrush(point, addMaterial, radius = brush.radius, power = brush.power) {
  const gx = point.x / world.cellSize;
  const gy = point.y / world.cellSize;
  const gz = point.z / world.cellSize;

  const minX = Math.max(0, Math.floor(gx - radius));
  const minY = Math.max(0, Math.floor(gy - radius));
  const minZ = Math.max(0, Math.floor(gz - radius));
  const maxX = Math.min(world.nx, Math.ceil(gx + radius));
  const maxY = Math.min(world.ny, Math.ceil(gy + radius));
  const maxZ = Math.min(world.nz, Math.ceil(gz + radius));

  for (let z = minZ; z <= maxZ; z++) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - gx;
        const dy = y - gy;
        const dz = z - gz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > radius) continue;

        const falloff = Math.pow(1 - dist / radius, 1.5);
        const delta = power * falloff * (addMaterial ? 1 : -1);
        field[idx(x, y, z)] += delta;
      }
    }
  }
}

const clock = new THREE.Clock();
const keys = new Set();
const velocity = new THREE.Vector3();
const drag = 12;
const moveAccel = 24;
const look = { yaw: -Math.PI / 2, pitch: -0.3 };
const brush = { radius: 3.2, power: 0.7 };
const action = { primary: false, secondary: false, pendingRemesh: false, lastRemesh: 0 };

const raycaster = new THREE.Raycaster();
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();

function updateStats() {
  const mode = action.primary ? 'Build' : action.secondary ? 'Destroy' : 'Idle';
  statsEl.textContent = `Brush radius: ${brush.radius.toFixed(1)} | Strength: ${brush.power.toFixed(2)} | Tool: ${mode}`;
}

function updateCameraDirection() {
  look.pitch = clamp(look.pitch, -1.5, 1.5);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = look.yaw;
  camera.rotation.x = look.pitch;
}

function processMovement(dt) {
  tmpForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  tmpForward.y = 0;
  tmpForward.normalize();
  tmpRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();

  const accel = new THREE.Vector3();
  if (keys.has('KeyW')) accel.add(tmpForward);
  if (keys.has('KeyS')) accel.sub(tmpForward);
  if (keys.has('KeyA')) accel.sub(tmpRight);
  if (keys.has('KeyD')) accel.add(tmpRight);
  if (keys.has('Space')) accel.y += 1;
  if (keys.has('ShiftLeft')) accel.y -= 1;

  if (accel.lengthSq() > 0) {
    accel.normalize().multiplyScalar(moveAccel * dt);
    velocity.add(accel);
  }

  velocity.multiplyScalar(Math.exp(-drag * dt));
  camera.position.addScaledVector(velocity, dt * 12);

  camera.position.x = clamp(camera.position.x, 1, world.nx - 1);
  camera.position.y = clamp(camera.position.y, 1, world.ny - 1);
  camera.position.z = clamp(camera.position.z, 1, world.nz - 1);
}

function editTerrain() {
  if (!terrainMesh || (!action.primary && !action.secondary)) return;

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = raycaster.intersectObject(terrainMesh, false)[0];
  if (!hit) return;

  const editPoint = hit.point.clone().add(hit.face.normal.clone().multiplyScalar(action.primary ? 0.7 : -0.7));
  applyBrush(editPoint, action.primary);

  action.pendingRemesh = true;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());

  processMovement(dt);
  editTerrain();

  const now = performance.now();
  if (action.pendingRemesh && now - action.lastRemesh > 60) {
    rebuildTerrainMesh();
    action.pendingRemesh = false;
    action.lastRemesh = now;
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (event.code === 'KeyL') {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    else canvas.requestPointerLock();
  }
});

window.addEventListener('keyup', (event) => keys.delete(event.code));

window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;
  look.yaw -= event.movementX * 0.0024;
  look.pitch -= event.movementY * 0.0022;
  updateCameraDirection();
});

window.addEventListener('mousedown', (event) => {
  if (event.button === 0) action.primary = true;
  if (event.button === 2) action.secondary = true;
});

window.addEventListener('mouseup', (event) => {
  if (event.button === 0) action.primary = false;
  if (event.button === 2) action.secondary = false;
});

window.addEventListener('wheel', (event) => {
  brush.radius = clamp(brush.radius + Math.sign(event.deltaY) * 0.3, 1.4, 7.5);
  updateStats();
});

window.addEventListener('contextmenu', (event) => event.preventDefault());

generateTerrainField();
rebuildTerrainMesh();
updateCameraDirection();
updateStats();
animate();
