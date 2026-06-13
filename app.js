// Antigravity CLI - Immersive 3D Walkable Universe
// Optimized Version with Real PBR Floor Textures and Grazing Player PointLight

// 1. Core Scene Variables
let scene, camera, renderer;
let particleSystem;
const monuments = [];
const columns = [];
let targetMonument = null;
let isModalOpen = false;

// Proximity HUD Tracking
let activePillarIndex = -1;
let proximityHud, proximityTitle, proximityContent;

// Dynamic Light Follow Setup
let playerSpotlight, spotlightTarget;
let playerDownlight;
let playerPointLight; // Strong grazing light just above the floor

// Cyberpunk 3D Car Asset & Physics Variables
let cyberCar;
const carWheels = [];
let carHeading = Math.PI; // initial heading angle facing away from starting camera position
let carVelocity = 0;
const carMaxSpeed = 22.0;
const carMaxReverseSpeed = -8.0;
const carAcceleration = 14.0;
const carBrakingDecel = 24.0;
const carDecel = 5.0; // rolling friction
let carSteerAngle = 0;
const carMoveDirection = new THREE.Vector3(0, 0, -1); // initial move direction

// Gameplay State Variables
let collectedNodesCount = 0;
const activeExplosions = [];
const obstacles = []; // Spawning coordinates and radius of building ruins and dead trees

// Phase 3: AAA Polish Particle & Visual Systems Pools
const dustPuffs = [];
const maxDustPuffs = 150;
let nextDustPuffIndex = 0;
let dustSpawnTimer = 0;

const skidmarks = [];
const maxSkidmarks = 350;
let nextSkidmarkIndex = 0;
const lastSkidLeft = new THREE.Vector3();
const lastSkidRight = new THREE.Vector3();

// 2. Control Variables (WASD + Mouse)
const keys = { w: false, a: false, s: false, d: false, shift: false };
let yaw = 0;
let pitch = 0.08; // rest pitch slightly looking down
let bobTimer = 0; // Tracks cycle time for smooth head-bobbing displacement
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const speed = 0.12; // walking speed
const friction = 0.85; // sliding deceleration

// DOM Elements
let blocker, instructions, crosshair, targetInfo, targetName, detailModal, modalTitle, modalBody, modalCloseBtn;

// Initialize application on load
window.addEventListener('DOMContentLoaded', () => {
  // Bind DOM elements
  blocker = document.getElementById('blocker');
  instructions = document.getElementById('instructions');
  crosshair = document.getElementById('crosshair');
  targetInfo = document.getElementById('target-info');
  targetName = document.getElementById('target-name');
  detailModal = document.getElementById('detail-modal');
  modalTitle = document.getElementById('modal-title');
  modalBody = document.getElementById('modal-body');
  modalCloseBtn = document.getElementById('modal-close-btn');

  proximityHud = document.getElementById('proximity-hud');
  proximityTitle = document.getElementById('proximity-title');
  proximityContent = document.getElementById('proximity-content');

  init3D();
  setupEvents();
  createEnvironment();
  createMonuments();
  createColumns();
  animate();
});

// Setup Three.js WebGL Scene
function init3D() {
  const container = document.getElementById('canvas-container');
  
  // Scene setup with a brighter, dusty apocalyptic sky and realistic fog
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x352d26); // Lighter, dusty warm-grey sky background
  scene.fog = new THREE.FogExp2(0x352d26, 0.015); // Realistic overcast nuclear winter fog (density 0.015)

  // Camera setup
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 15); // Start at human height (1.6m) and slightly back

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Enable modern physically correct lighting and filmic tone mapping
  renderer.physicallyCorrectLights = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  
  container.appendChild(renderer.domElement);

  // Trigger smooth fade-in of the 3D scene canvas
  setTimeout(() => {
    container.style.opacity = '1';
  }, 100);

  // Initial window resize event
  window.addEventListener('resize', onWindowResize);
}

// Optimized Window resize handler (Debounced & CSS scaled for stutter-free updates)
let resizeTimeout;
function onWindowResize() {
  // Instantly update aspect ratio to avoid image stretching
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  // Instantly scale the canvas in CSS to match window dimensions (GPU hardware scaling)
  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  // Debounce the heavy WebGL buffer reallocation to prevent layout thrashing
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    renderer.setSize(window.innerWidth, window.innerHeight, false); // false keeps CSS styling intact
  }, 120);
}

// Helper to draw a soft circular glowing particle texture dynamically
function createCircleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.3, 'rgba(0, 242, 254, 0.8)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 16);
  return new THREE.CanvasTexture(canvas);
}

// Setup Keyboard, Mouse & Pointer Lock Events
function setupEvents() {
  // Click instructions to lock pointer
  instructions.addEventListener('click', () => {
    document.body.requestPointerLock();
  });

  // Track pointer lock state changes
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === document.body) {
      blocker.style.opacity = '0';
      setTimeout(() => { blocker.style.display = 'none'; }, 500);
      isModalOpen = false;
    } else {
      if (!isModalOpen) {
        blocker.style.display = 'flex';
        setTimeout(() => { blocker.style.opacity = '1'; }, 10);
      }
    }
  });

  // Track Mouse Movements for Car Orbit Look-around
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== document.body || isModalOpen) return;

    const sensitivity = 0.003;
    yaw -= e.movementX * sensitivity;
    pitch -= e.movementY * sensitivity;

    // Clamp look-around orbit angles to reasonable limits
    yaw = Math.max(-Math.PI / 1.5, Math.min(Math.PI / 1.5, yaw));
    pitch = Math.max(-0.25, Math.min(Math.PI / 5, pitch));
  });

  // Keyboard Down Handlers
  document.addEventListener('keydown', (e) => {
    switch(e.code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.w = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        keys.a = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        keys.s = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        keys.d = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        keys.shift = true;
        break;
    }
  });

  // Keyboard Up Handlers
  document.addEventListener('keyup', (e) => {
    switch(e.code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.w = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        keys.a = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        keys.s = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        keys.d = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        keys.shift = false;
        break;
    }
  });

  // Mouse Click Handler for Interaction
  document.addEventListener('click', () => {
    if (document.pointerLockElement === document.body && targetMonument && !isModalOpen) {
      openDetailModal(targetMonument);
    }
  });

  // Modal Close Events
  modalCloseBtn.addEventListener('click', closeDetailModal);
  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) closeDetailModal();
  });
}

// Create PBR Floor, Lighting, & Particles
function createEnvironment() {
  // 1. Sky Dome with Dark Apocalyptic Gradient & Dim Sun
  const skyVertexShader = `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const skyFragmentShader = `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    uniform vec3 sunPosition;
    varying vec3 vWorldPosition;
    void main() {
      vec3 dir = normalize(vWorldPosition);
      // Height-based atmospheric gradient
      float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
      vec3 skyColor = mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0));
      
      // Sun position calculation
      vec3 sunDir = normalize(sunPosition);
      float sunInfluence = max(dot(dir, sunDir), 0.0);
      
      // Dim nuclear winter sun disk
      float sunDisk = pow(sunInfluence, 1200.0) * 1.5;
      // Soft warm sun corona / halo
      float sunHalo = pow(sunInfluence, 15.0) * 0.4;
      // Broad ambient sky glow
      float sunBloom = pow(sunInfluence, 2.5) * 0.1;
      
      vec3 sunColor = vec3(0.95, 0.55, 0.25); // pale warm orange/gold sun
      vec3 finalColor = skyColor + sunColor * (sunDisk + sunHalo + sunBloom);
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  const skyGeo = new THREE.SphereGeometry(700, 32, 15);
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    uniforms: {
      topColor: { value: new THREE.Color(0x221d1a) },      // Soft dark-grey/brown zenith
      bottomColor: { value: new THREE.Color(0x5a483e) },   // Warm amber/grey horizon
      offset: { value: 25.0 },
      exponent: { value: 0.6 },
      sunPosition: { value: new THREE.Vector3(60, 120, 30) }
    },
    side: THREE.BackSide,
    depthWrite: false
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyMesh);

  // Generate environment map from the Sky Dome for high-fidelity reflections
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  
  const envScene = new THREE.Scene();
  const skyClone = skyMesh.clone();
  envScene.add(skyClone);
  const envCube = pmremGenerator.fromScene(envScene);
  scene.environment = envCube.texture;
  pmremGenerator.dispose();

  // 2. Volumetric Dust Sunbeams (Faint reddish-orange shafts)
  const beamDir = new THREE.Vector3(-60, -120, -30).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const beamQuaternion = new THREE.Quaternion().setFromUnitVectors(up, beamDir);

  const beamGeo = new THREE.CylinderGeometry(2, 15, 180, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xcc4422,
    transparent: true,
    opacity: 0.015, // very dusty, dim haze
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const beamPositions = [
    new THREE.Vector3(-15, 60, -25),
    new THREE.Vector3(20, 60, -50),
    new THREE.Vector3(-35, 60, -70),
    new THREE.Vector3(10, 60, 15)
  ];

  beamPositions.forEach(pos => {
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.copy(pos);
    beam.quaternion.copy(beamQuaternion);
    scene.add(beam);
  });

  // 3. Dim Red Sun Sprite in 3D (Adds nuclearly overcast sun glare)
  const sunGlowCanvas = document.createElement('canvas');
  sunGlowCanvas.width = 128;
  sunGlowCanvas.height = 128;
  const sunGlowCtx = sunGlowCanvas.getContext('2d');
  const sunGlowGrad = sunGlowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
  sunGlowGrad.addColorStop(0, 'rgba(255, 100, 50, 0.7)');
  sunGlowGrad.addColorStop(0.2, 'rgba(255, 70, 30, 0.35)');
  sunGlowGrad.addColorStop(0.5, 'rgba(200, 40, 10, 0.15)');
  sunGlowGrad.addColorStop(0.8, 'rgba(150, 20, 0, 0.02)');
  sunGlowGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  sunGlowCtx.fillStyle = sunGlowGrad;
  sunGlowCtx.fillRect(0, 0, 128, 128);

  const sunGlowTexture = new THREE.CanvasTexture(sunGlowCanvas);
  const sunSpriteMat = new THREE.SpriteMaterial({
    map: sunGlowTexture,
    color: 0xe05a36, // brighter orange-red sun color
    transparent: true,
    opacity: 0.65, // slightly more intense
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const sunSprite = new THREE.Sprite(sunSpriteMat);
  const sunDirVec = new THREE.Vector3(60, 120, 30).normalize();
  sunSprite.position.copy(sunDirVec).multiplyScalar(500); // place deep in sky
  sunSprite.scale.set(150, 150, 1);
  scene.add(sunSprite);

  // 4. Hemisphere Ambient Light (Realistic Steel-Grey sky to Warm Soil bounce)
  const ambientLight = new THREE.HemisphereLight(0x505b6b, 0x302822, 0.75); // Increased to 0.75 for realistic, bright ambient fills
  scene.add(ambientLight);

  // 5. Overcast Sun Directional Light (Bright warm amber shadows)
  const dirLight = new THREE.DirectionalLight(0xe5aa7a, 1.3); // Warm amber sunlight, increased to 1.3
  dirLight.position.set(60, 120, 30);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 250;
  const d = 110;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  dirLight.shadow.bias = -0.0004;
  scene.add(dirLight);

  // 6. Load PBR Floor Textures (Representing cracked ruined asphalt)
  const textureLoader = new THREE.TextureLoader();
  const repeatCount = 50;

  // Diffuse/Color Map
  const colorMap = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/brick_diffuse.jpg');
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(repeatCount, repeatCount);
  colorMap.anisotropy = 8;

  // Bump/Normal Map
  const bumpMap = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/brick_bump.jpg');
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(repeatCount, repeatCount);

  // Roughness Map
  const roughnessMap = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/brick_roughness.jpg');
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(repeatCount, repeatCount);

  // 7. Ground Plane with Cracked, Dusty Dark PBR Asphalt Material
  const floorGeo = new THREE.PlaneGeometry(1200, 1200);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x2b2b2f,            // Lighter, realistic warm slate gray
    map: colorMap,
    bumpMap: bumpMap,
    bumpScale: 0.1,             // subtle, realistic crack depth (less harsh shadows)
    roughnessMap: roughnessMap,
    roughness: 0.8,             // matte dust feel
    metalness: 0.05,            // non-metallic dirt/ash
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  // 8. Cold White Chase Flashlight (Brighter for nuclear winter night helper)
  playerSpotlight = new THREE.SpotLight(0xe2f1ff, 1.2, 45, Math.PI / 4.5, 0.4, 0.8);
  playerSpotlight.castShadow = true;
  playerSpotlight.shadow.mapSize.width = 1024;
  playerSpotlight.shadow.mapSize.height = 1024;
  playerSpotlight.shadow.camera.near = 0.5;
  playerSpotlight.shadow.camera.far = 50;
  scene.add(playerSpotlight);

  // Spotlight Target
  spotlightTarget = new THREE.Object3D();
  scene.add(spotlightTarget);
  playerSpotlight.target = spotlightTarget;

  // 9. Fire Embers Grazing PointLight (Orange embers glow in asphalt cracks)
  playerPointLight = new THREE.PointLight(0xffa477, 1.8, 15);
  playerPointLight.castShadow = true;
  playerPointLight.shadow.mapSize.width = 1024;
  playerPointLight.shadow.mapSize.height = 1024;
  playerPointLight.shadow.camera.near = 0.1;
  playerPointLight.shadow.camera.far = 18;
  playerPointLight.shadow.bias = -0.001;
  scene.add(playerPointLight);

  // 10. Cyan Chassis Under-light Underglow
  playerDownlight = new THREE.PointLight(0x00f2fe, 1.2, 10);
  scene.add(playerDownlight);

  // 11. Floating Ash Dust Particles (Grey ash dust drifting)
  const particleCount = 2000;
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const phases = new Float32Array(particleCount);

  for (let i = 0; i < particleCount * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 350;     // X
    positions[i + 1] = Math.random() * 40;           // Y (above ground)
    positions[i + 2] = (Math.random() - 0.5) * 350; // Z
    phases[i/3] = Math.random() * Math.PI * 2;       // random phase
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const particleTexture = createCircleTexture();

  const particleMat = new THREE.PointsMaterial({
    color: 0xa89988, // ash grey/brown particles
    size: 0.14,
    map: particleTexture,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  particleSystem = new THREE.Points(particleGeo, particleMat);
  particleSystem.userData = { phases: phases };
  scene.add(particleSystem);

  // 12. Spawns building ruins and dead trees randomly
  generateObstacles();

  // 13. Create Cyberpunk 3D Car Asset
  createCyberCar();

  // 13b. Initialize Phase 3 Pools
  initDustSystem();
  initSkidmarks();
}

// Function to assemble the Cyberpunk car from basic 3D geometries
function createCyberCar() {
  cyberCar = new THREE.Group();
  
  // Create a sub-group for the car body to enable realistic chassis roll & pitch (Phase 3)
  const carBody = new THREE.Group();
  carBody.name = "body";
  cyberCar.add(carBody);
  
  // 1. Lower chassis (Obsidian Black)
  const chassisGeo = new THREE.BoxGeometry(2.0, 0.4, 4.2);
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x08090d,
    roughness: 0.15,
    metalness: 0.9
  });
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.position.y = 0.5; // clear the wheels
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  carBody.add(chassis);

  // 2. Upper Cabin (Obsidian Black + Glass)
  const cabinGeo = new THREE.BoxGeometry(1.6, 0.5, 2.2);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x11131a,
    roughness: 0.1,
    metalness: 0.95
  });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 0.95, -0.4); // set slightly back
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  carBody.add(cabin);

  // Cabin windshield (Cyan glowing neon frame)
  const windowGeo = new THREE.BoxGeometry(1.62, 0.4, 0.1);
  const windowMat = new THREE.MeshBasicMaterial({
    color: 0x00f2fe,
    transparent: true,
    opacity: 0.7
  });
  const windshield = new THREE.Mesh(windowGeo, windowMat);
  windshield.position.set(0, 0.95, 0.7); // front window
  carBody.add(windshield);

  // 3. Glowing Cyan Headlights (High-intensity Basic Material)
  const headlightGeo = new THREE.BoxGeometry(0.4, 0.12, 0.1);
  const headlightMat = new THREE.MeshBasicMaterial({
    color: 0x00f2fe
  });

  const leftHeadlight = new THREE.Mesh(headlightGeo, headlightMat);
  leftHeadlight.position.set(-0.7, 0.5, 2.1);
  carBody.add(leftHeadlight);

  const rightHeadlight = leftHeadlight.clone();
  rightHeadlight.position.x = 0.7;
  carBody.add(rightHeadlight);

  // Add front headlight spotlight to illuminate the ground in front of the car
  const carLight = new THREE.SpotLight(0x00f2fe, 3.0, 25, Math.PI / 6, 0.5, 0.5);
  carLight.position.set(0, 0.5, 2.1);
  const carLightTarget = new THREE.Object3D();
  carLightTarget.position.set(0, 0.5, 10.0);
  carBody.add(carLightTarget);
  carLight.target = carLightTarget;
  carBody.add(carLight);

  // 4. Glowing Red Taillights
  const taillightGeo = new THREE.BoxGeometry(0.7, 0.08, 0.1);
  const taillightMat = new THREE.MeshBasicMaterial({
    color: 0xff0844
  });
  const taillight = new THREE.Mesh(taillightGeo, taillightMat);
  taillight.position.set(0, 0.55, -2.1);
  carBody.add(taillight);

  // 5. Wheels
  // Cylinders: radius 0.45, length 0.35, segments 16
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 16);
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x13151c,
    roughness: 0.6,
    metalness: 0.3
  });

  // Glowing Spokes inside the wheels so the rotation is clearly visible
  const spokeGeo = new THREE.BoxGeometry(0.08, 0.9, 0.37);
  const spokeMat = new THREE.MeshBasicMaterial({
    color: 0x00f2fe
  });

  const wheelPositions = [
    { x: -1.05, y: 0.45, z: 1.3 },  // Front Left
    { x: 1.05, y: 0.45, z: 1.3 },   // Front Right
    { x: -1.05, y: 0.45, z: -1.3 }, // Rear Left
    { x: 1.05, y: 0.45, z: -1.3 }   // Rear Right
  ];

  wheelPositions.forEach(pos => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(pos.x, pos.y, pos.z);
    wheelGroup.rotation.order = 'YXZ'; // Important for combining steering and rolling correctly

    const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
    // Cylinders are created vertically, rotate to horizontal (around Z-axis)
    wheelMesh.rotation.z = Math.PI / 2;
    wheelMesh.castShadow = true;
    wheelGroup.add(wheelMesh);

    // Add visual spokes (Cross-shape)
    const spoke1 = new THREE.Mesh(spokeGeo, spokeMat);
    wheelGroup.add(spoke1);

    const spoke2 = spoke1.clone();
    spoke2.rotation.y = Math.PI / 2; // cross spokes
    wheelGroup.add(spoke2);

    cyberCar.add(wheelGroup);
    carWheels.push(wheelGroup); // save wheels for animation
  });

  // Set initial position in the open starting plaza
  cyberCar.position.set(0, 0, 0); 
  scene.add(cyberCar);
}

// Construct and Place the 3D Feature Monuments
function createMonuments() {
  const m1 = buildMultiAgentMonument();
  const m2 = buildCoderMonument();
  const m3 = buildScienceMonument();
  const m4 = buildSandboxMonument();

  monuments.push(m1, m2, m3, m4);

  // Add all monument groups and point lights to the scene
  monuments.forEach(m => {
    m.isCollected = false;
    m.collectTime = 0;
    scene.add(m.mesh);
    scene.add(m.light);
  });
}

// Glass Column Builder (Hexagonal Column of Glassmorphism Material)
function buildGlassColumn(x, z, color, title, descShort, detailHtml) {
  const group = new THREE.Group();
  group.position.set(x, 4.0, z); // centered at Y = 4.0 (height is 8)

  // 1. Glossy Hexagonal Glass Outer Cylinder
  const glassGeo = new THREE.CylinderGeometry(1.2, 1.2, 8.0, 6);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.35,
    transmission: 0.95, // High transmission for glassmorphism
    roughness: 0.05,
    metalness: 0.1,
    ior: 1.55,
    thickness: 1.5,
    specularIntensity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    side: THREE.DoubleSide
  });
  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  glassMesh.castShadow = true;
  glassMesh.receiveShadow = true;
  group.add(glassMesh);

  // 2. Inner Neon Core Rod (glowing energy bar)
  const coreGeo = new THREE.CylinderGeometry(0.12, 0.12, 7.6, 6);
  const coreMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.8
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  group.add(coreMesh);

  // 3. Inner neon wireframe cage
  const wireGeo = new THREE.CylinderGeometry(0.24, 0.24, 7.6, 6);
  const wireMat = new THREE.MeshBasicMaterial({
    color: color,
    wireframe: true,
    transparent: true,
    opacity: 0.25
  });
  const wireMesh = new THREE.Mesh(wireGeo, wireMat);
  group.add(wireMesh);

  // 4. Metal Top Cap (hexagonal cap)
  const capGeo = new THREE.CylinderGeometry(1.25, 1.25, 0.4, 6);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x11131a,
    roughness: 0.4,
    metalness: 0.9
  });
  const topCap = new THREE.Mesh(capGeo, capMat);
  topCap.position.y = 4.0;
  group.add(topCap);

  // 5. Metal Bottom Cap (hexagonal cap)
  const bottomCap = topCap.clone();
  bottomCap.position.y = -4.0;
  group.add(bottomCap);

  // 6. Point Light inside the column for glowing illumination on floor
  const light = new THREE.PointLight(color, 2.5, 15);
  light.position.set(0, 0, 0); // local center
  group.add(light);

  // Save info
  return {
    name: title,
    desc: descShort,
    mesh: group,
    colorStr: '#' + color.toString(16).padStart(6, '0'),
    position: new THREE.Vector3(x, 0, z), // store baseline position
    update: (time) => {
      // Rotate parts
      glassMesh.rotation.y = time * 0.08;
      coreMesh.rotation.y = -time * 0.2;
      wireMesh.rotation.y = time * 0.15;
      
      // Core glowing fluctuation
      coreMat.opacity = 0.6 + Math.sin(time * 3) * 0.25;
      wireMat.opacity = 0.15 + Math.sin(time * 2) * 0.1;
    },
    description: detailHtml
  };
}

// Generate the three large glass columns
function createColumns() {
  const col1 = buildGlassColumn(
    -15, -45, 0x00f2fe,
    "Autonome Agenten",
    "Agentensysteme führen komplexe Refactorings, Suchen und Diagnosen vollkommen selbstständig aus.",
    `
      <p>Die Antigravity Engine orchestriert hoch-effiziente <strong>Agenten-Schwärme</strong>. Diese arbeiten autonom im Hintergrund, lesen und schreiben Dateien, führen Tests aus und korrigieren ihre Fehler selbstständig.</p>
      <ul>
        <li><strong>Autonomie:</strong> Der Agent entscheidet eigenständig über den besten Lösungsweg für das gegebene Ziel.</li>
        <li><strong>Multi-Agenten Chats:</strong> Kooperative Problemlösung durch Delegation und Validierung im Gruppenchat.</li>
        <li><strong>Selbst-Korrektur:</strong> Automatische Fehlerdiagnose durch Testausführungen im geschützten Bereich.</li>
      </ul>
      <p>Geben Sie Ihren Agenten Aufgaben:</p>
      <div class="modal-code">antigravity run-workflow --agents "research,coder" --goal "Finde Performance-Flaschenhälse"</div>
    `
  );

  const col2 = buildGlassColumn(
    0, -55, 0xb152ff,
    "Zero-UI",
    "Die Zero-UI Philosophie minimiert Ablenkungen, indem Befehle direkt in produktiven Code übersetzt werden.",
    `
      <p>Die <strong>Zero-UI Philosophie</strong> befreit Entwickler von starren Editor-Oberflächen. Befehle und Anweisungen werden direkt im Terminal oder per natürlicher Sprache entgegengenommen und ausgeführt.</p>
      <ul>
        <li><strong>Reduzierte Ablenkung:</strong> Keine überfüllten Menüs oder schwer konfigurierbaren Code-Editoren.</li>
        <li><strong>Direkte Umsetzung:</strong> Ausführen von Systembefehlen, Erstellung von UI-Komponenten und Dateiverarbeitung im Hintergrund.</li>
        <li><strong>Kontextsensitivität:</strong> Das System analysiert geöffnete Dateien und Cursor-Positionen automatisch.</li>
      </ul>
      <p>Starten Sie Ihren Zero-UI Workflow:</p>
      <div class="modal-code">antigravity code --context active_editor --apply "Füge Error-Handling hinzu"</div>
    `
  );

  const col3 = buildGlassColumn(
    15, -45, 0x38ef7d,
    "SOTA Benchmarks",
    "Optimiert auf modernste Codegenerierungs- und Editier-Benchmarks (State-Of-The-Art) für maximale Effizienz.",
    `
      <p>Antigravity CLI ist auf modernste <strong>State-of-the-Art (SOTA) Benchmarks</strong> optimiert. Das bedeutet rasend schnelle Bearbeitungszeiten bei maximaler semantischer Code-Präzision.</p>
      <ul>
        <li><strong>Latenz-Optimierung:</strong> Intelligentes Caching reduziert API-Aufrufe und beschleunigt Antworten um bis zu 40%.</li>
        <li><strong>Kontext-Kompression:</strong> Extraktion nur der relevanten Code-Chunks, um das Token-Limit des LLM optimal zu nutzen.</li>
        <li><strong>Präzise Code-Diffs:</strong> Keine redundanten Schreibvorgänge; es werden nur geänderte Zeilen überschrieben.</li>
      </ul>
      <p>Prüfen Sie die System-Performance:</p>
      <div class="modal-code">antigravity benchmark --run-all</div>
    `
  );

  columns.push(col1, col2, col3);

  columns.forEach(c => {
    scene.add(c.mesh);
  });
}

/* --- MONUMENT BUILDERS --- */

// 1. Multi-Agent Monument
function buildMultiAgentMonument() {
  const group = new THREE.Group();
  group.position.set(-20, 2.5, -25);

  const coreGeo = new THREE.SphereGeometry(1.0, 32, 32);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  const rings = [];
  const ringColors = [0x00f2fe, 0x4facfe, 0xb152ff];
  const radii = [2.0, 2.4, 2.8];

  for (let i = 0; i < 3; i++) {
    const ringGeo = new THREE.TorusGeometry(radii[i], 0.04, 8, 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: ringColors[i],
      emissive: ringColors[i],
      emissiveIntensity: 0.5,
      roughness: 0.1
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.random() * Math.PI;
    ring.rotation.y = Math.random() * Math.PI;
    group.add(ring);
    rings.push(ring);
  }

  const pedGeo = new THREE.CylinderGeometry(2, 2.5, 0.8, 8);
  const pedMat = new THREE.MeshStandardMaterial({ color: 0x0f1118, roughness: 0.5, metalness: 0.8 });
  const pedestal = new THREE.Mesh(pedGeo, pedMat);
  pedestal.position.y = -2.1;
  pedestal.receiveShadow = true;
  pedestal.castShadow = true;
  group.add(pedestal);

  const light = new THREE.PointLight(0x00f2fe, 2, 20);
  light.position.set(-20, 3, -25);

  return {
    name: "Multi-Agent Workspaces",
    mesh: group,
    light: light,
    update: (time) => {
      group.position.y = 2.5 + Math.sin(time * 1.5) * 0.15;
      rings[0].rotation.x += 0.01;
      rings[0].rotation.y += 0.005;
      rings[1].rotation.y -= 0.015;
      rings[1].rotation.z += 0.008;
      rings[2].rotation.z += 0.012;
      rings[2].rotation.x -= 0.006;
    },
    description: `
      <p>Die Antigravity CLI ermöglicht das Erstellen <strong>autonomer Multi-Agenten-Workspaces</strong> direkt auf Ihrem lokalen Rechner.</p>
      <p>LLM-Agenten können parallel an einer komplexen Zielsetzung arbeiten, Tasks untereinander verteilen und Dritte hinzuziehen. Der Austausch erfolgt in Echtzeit:</p>
      <ul>
        <li><strong>Rollenbasierte Agenten:</strong> Zuweisung von Spezialisten (z.B. Researcher, Coder, Tester, Architect).</li>
        <li><strong>Gemeinsamer Workspace:</strong> Zugriff auf dieselbe Verzeichnisstruktur für nahtlose Anpassungen.</li>
        <li><strong>Selbst-Korrektur:</strong> Automatische Fehlerdiagnose durch Peer-Review im Gruppenchat.</li>
      </ul>
      <p>Starten Sie Ihren ersten Agenten-Schwarm mit der CLI:</p>
      <div class="modal-code">antigravity run-workflow --agents "research,coder,tester" --goal "Erstelle eine responsive WebApp"</div>
    `
  };
}

// 2. Coder/Code-Editor Monument
function buildCoderMonument() {
  const group = new THREE.Group();
  group.position.set(20, 3.2, -25);

  const prismGeo = new THREE.CylinderGeometry(0.8, 1.2, 3.5, 4);
  const prismMat = new THREE.MeshStandardMaterial({
    color: 0x0a0c12,
    roughness: 0.05,
    metalness: 0.95,
  });
  const prism = new THREE.Mesh(prismGeo, prismMat);
  prism.rotation.y = Math.PI / 4;
  prism.castShadow = true;
  prism.receiveShadow = true;
  group.add(prism);

  const cubes = [];
  const cubeCount = 5;
  for (let i = 0; i < cubeCount; i++) {
    const cubeGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const cubeMat = new THREE.MeshStandardMaterial({
      color: 0xb152ff,
      emissive: 0xb152ff,
      emissiveIntensity: 0.6,
      roughness: 0.2
    });
    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    group.add(cube);
    cubes.push({
      mesh: cube,
      angle: (i / cubeCount) * Math.PI * 2,
      speed: 0.5 + Math.random() * 0.5,
      heightOffset: (i - 2) * 0.7
    });
  }

  const pedGeo = new THREE.CylinderGeometry(2, 2.5, 0.8, 8);
  const pedMat = new THREE.MeshStandardMaterial({ color: 0x0f1118, roughness: 0.5, metalness: 0.8 });
  const pedestal = new THREE.Mesh(pedGeo, pedMat);
  pedestal.position.y = -2.8;
  pedestal.receiveShadow = true;
  pedestal.castShadow = true;
  group.add(pedestal);

  const light = new THREE.PointLight(0xb152ff, 2, 20);
  light.position.set(20, 3, -25);

  return {
    name: "Autonome Code-Editierung",
    mesh: group,
    light: light,
    update: (time) => {
      group.position.y = 3.2 + Math.cos(time * 1.2) * 0.1;
      prism.rotation.y += 0.003;

      cubes.forEach(c => {
        c.angle += 0.015 * c.speed;
        const radius = 1.6 + Math.sin(time + c.angle) * 0.15;
        c.mesh.position.x = Math.cos(c.angle) * radius;
        c.mesh.position.z = Math.sin(c.angle) * radius;
        c.mesh.position.y = c.heightOffset + Math.sin(time * 2 + c.angle) * 0.1;
        c.mesh.rotation.x += 0.01;
        c.mesh.rotation.y += 0.01;
      });
    },
    description: `
      <p>Die CLI bringt einen leistungsfähigen, AI-gesteuerten <strong>Code-Editiermodus</strong> mit sich. Durch präzise Chunk-Replacements modifiziert das System Dateien, ohne die gesamte Datei neu schreiben zu müssen.</p>
      <p>Die Engine ist darauf ausgelegt, große Projekte schrittweise und sicher zu bearbeiten:</p>
      <ul>
        <li><strong>Lokalisiertes Refactoring:</strong> Erkennt genau, wo Modifikationen vorgenommen werden müssen und vermeidet Nebeneffekte.</li>
        <li><strong>Verzeichnis-Scans:</strong> Führt semantische Suchen und Dateianalysen über Ripgrep direkt in der CLI aus.</li>
        <li><strong>Integrierter Linter-Check:</strong> Erkennt Syntax- und logische Fehler sofort und behebt sie vor dem endgültigen Speichern.</li>
      </ul>
      <p>Bearbeiten Sie ein bestehendes Projekt mit einem einfachen Befehl:</p>
      <div class="modal-code">antigravity code --refactor "Konvertiere index.html zu einer Single-Page-App"</div>
    `
  };
}

// 3. Science Engines Monument
function buildScienceMonument() {
  const group = new THREE.Group();
  group.position.set(-20, 3.0, -65);

  const helixGroup = new THREE.Group();
  const sphereGeo = new THREE.SphereGeometry(0.25, 16, 16);
  const connectGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8);
  const strandColor1 = 0xff0844;
  const strandColor2 = 0x4facfe;

  const mat1 = new THREE.MeshStandardMaterial({ color: strandColor1, emissive: strandColor1, emissiveIntensity: 0.4 });
  const mat2 = new THREE.MeshStandardMaterial({ color: strandColor2, emissive: strandColor2, emissiveIntensity: 0.4 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });

  const numNodes = 12;

  for (let i = 0; i < numNodes; i++) {
    const y = (i - numNodes / 2) * 0.4;
    const angle = (i / numNodes) * Math.PI * 2.5;

    const x1 = Math.cos(angle) * 1.1;
    const z1 = Math.sin(angle) * 1.1;
    const s1 = new THREE.Mesh(sphereGeo, mat1);
    s1.position.set(x1, y, z1);
    helixGroup.add(s1);

    const x2 = -Math.cos(angle) * 1.1;
    const z2 = -Math.sin(angle) * 1.1;
    const s2 = new THREE.Mesh(sphereGeo, mat2);
    s2.position.set(x2, y, z2);
    helixGroup.add(s2);

    const rod = new THREE.Mesh(connectGeo, lineMat);
    rod.position.set(0, y, 0);
    rod.rotation.z = Math.PI / 2;
    rod.rotation.y = -angle;
    helixGroup.add(rod);
  }

  group.add(helixGroup);

  const pedGeo = new THREE.CylinderGeometry(2, 2.5, 0.8, 8);
  const pedMat = new THREE.MeshStandardMaterial({ color: 0x0f1118, roughness: 0.5, metalness: 0.8 });
  const pedestal = new THREE.Mesh(pedGeo, pedMat);
  pedestal.position.y = -2.6;
  pedestal.receiveShadow = true;
  pedestal.castShadow = true;
  group.add(pedestal);

  const light = new THREE.PointLight(0xff0844, 2, 20);
  light.position.set(-20, 3, -65);

  return {
    name: "Wissenschaftliche Plugins",
    mesh: group,
    light: light,
    update: (time) => {
      group.position.y = 3.0 + Math.sin(time * 0.9) * 0.12;
      helixGroup.rotation.y = time * 0.4;
    },
    description: `
      <p>Antigravity CLI besitzt eine tiefe <strong>Science-Datenbank-Integration</strong> für molekulare, genetische, pharmazeutische und literarische Suchen.</p>
      <p>Sie ermöglicht biomedizinischen Forschern und Entwicklern das Abrufen strukturierter Informationen direkt über standardisierte APIs:</p>
      <ul>
        <li><strong>Bioinformatik:</strong> Direkter Datenabruf aus UniProt, NCBI (Nucleotide & Protein), AlphaFold-Datenbanken und der Protein Data Bank (PDB).</li>
        <li><strong>Medizinische Validierung:</strong> Query-Schnittstellen für ClinVar, dbsnp, gnomAD, GTEx und ClinicalTrials.gov.</li>
        <li><strong>Pharmazeutik & Literatur:</strong> Anbindung an ChEMBL, PubChem und openFDA sowie OpenAlex, arXiv und Europe PMC für Literatursuchen.</li>
      </ul>
      <p>Fragen Sie biologische Moleküle über die CLI ab:</p>
      <div class="modal-code">antigravity science fetch-structure --pdb "1A8O" --render-image</div>
    `
  };
}

// 4. Secure Sandbox Monument
function buildSandboxMonument() {
  const group = new THREE.Group();
  group.position.set(20, 3.0, -65);

  const coreGeo = new THREE.OctahedronGeometry(0.8, 0);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x38ef7d,
    emissive: 0x38ef7d,
    emissiveIntensity: 0.8,
    roughness: 0.1
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  const shieldGeo = new THREE.SphereGeometry(1.8, 16, 12);
  const shieldMat = new THREE.MeshBasicMaterial({
    color: 0x38ef7d,
    wireframe: true,
    transparent: true,
    opacity: 0.15
  });
  const shield = new THREE.Mesh(shieldGeo, shieldMat);
  group.add(shield);

  const ringGeo = new THREE.TorusGeometry(1.4, 0.03, 8, 48);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x38ef7d, transparent: true, opacity: 0.4 });
  const ring1 = new THREE.Mesh(ringGeo, ringMat);
  ring1.rotation.x = Math.PI / 2;
  group.add(ring1);

  const pedGeo = new THREE.CylinderGeometry(2, 2.5, 0.8, 8);
  const pedMat = new THREE.MeshStandardMaterial({ color: 0x0f1118, roughness: 0.5, metalness: 0.8 });
  const pedestal = new THREE.Mesh(pedGeo, pedMat);
  pedestal.position.y = -2.6;
  pedestal.receiveShadow = true;
  pedestal.castShadow = true;
  group.add(pedestal);

  const light = new THREE.PointLight(0x38ef7d, 2, 20);
  light.position.set(20, 3, -65);

  return {
    name: "Isolierte Sandboxen & Shells",
    mesh: group,
    light: light,
    update: (time) => {
      group.position.y = 3.0 + Math.cos(time * 1.4) * 0.1;
      core.rotation.y = time * 0.5;
      core.rotation.x = time * 0.25;
      shield.rotation.y = -time * 0.15;
      shield.rotation.z = time * 0.05;
      ring1.rotation.y = time * 0.3;
    },
    description: `
      <p>Sicherheit geht vor. Antigravity CLI führt generierten Code und Terminalbefehle standardmäßig in <strong>isolierten Sandbox-Systemen</strong> aus.</p>
      <p>Dadurch wird verhindert, dass ungetestete Scripte Schaden an Ihrem lokalen System oder in Ihrer Live-Umgebung anrichten:</p>
      <ul>
        <li><strong>Docker Sandboxing:</strong> Codeausführung in flüchtigen, isolierten Containern ohne Host-Zugriff.</li>
        <li><strong>Lokale Berechtigungsstufen:</strong> Detailliert konfigurierbares Rechtesystem für Lese- und Schreibzugriffe.</li>
        <li><strong>Kommando-Auditierung:</strong> Generierte Shell-Befehle werden erst nach interaktiver Benutzerfreigabe ausgeführt oder laufen in abgesicherten Umgebungen.</li>
      </ul>
      <p>Starten Sie ein Kommando in der Sandbox:</p>
      <div class="modal-code">antigravity run "python analyze.py" --sandbox --volumes "./data:/app/data"</div>
    `
  };
}

/* --- GAME LOOP & ANIMATION --- */

let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const time = performance.now();
  const delta = (time - lastTime) / 1000;
  lastTime = time;

  const elapsed = time * 0.001;

  // 1. Update Monuments (floating collection & animations) and Glass Columns
  monuments.forEach(m => {
    if (m.isCollected) {
      // Float upward and shrink
      m.mesh.position.y += delta * 12.0;
      m.mesh.scale.multiplyScalar(Math.max(0, 1.0 - delta * 2.0));
      m.light.intensity = Math.max(0, m.light.intensity - delta * 5.0);
      
      m.collectTime += delta;
      if (m.collectTime > 1.0 && m.mesh.visible) {
        m.mesh.visible = false;
        scene.remove(m.mesh);
        scene.remove(m.light);
      }
    } else {
      m.update(elapsed);
      
      // Perform gameplay collision check between car and monument base
      if (cyberCar) {
        const carPos2D = new THREE.Vector2(cyberCar.position.x, cyberCar.position.z);
        const monPos2D = new THREE.Vector2(m.mesh.position.x, m.mesh.position.z);
        const dist = carPos2D.distanceTo(monPos2D);
        if (dist < 3.2) {
          m.isCollected = true;
          m.collectTime = 0;
          
          // Trigger particle explosion
          const colorHex = '#' + m.light.color.getHexString();
          createExplosion(m.mesh.position.clone(), colorHex);
          
          // Sound effect
          playCollectSound();
          
          // Increment counter
          collectedNodesCount++;
          updateNodesHUD();
        }
      }
    }
  });

  columns.forEach(c => c.update(elapsed));

  // 2. Animate Background Particles (Drifting & Twinkling Stardust - Optimized loop)
  if (particleSystem) {
    const posAttr = particleSystem.geometry.attributes.position;
    const phases = particleSystem.userData.phases;
    const arr = posAttr.array;
    const count = posAttr.count;
    const rise = delta * 0.3;
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      
      // Floating upwards slowly
      arr[idx + 1] += rise;
      if (arr[idx + 1] > 40) {
        arr[idx + 1] = 0; // wrap back to floor
      }
      
      // Drift sideways slightly
      const phase = elapsed + phases[i];
      arr[idx] += Math.sin(phase) * 0.005;
      arr[idx + 2] += Math.cos(phase) * 0.005;
    }
    posAttr.needsUpdate = true;
  }

  // 2b. Update active particle explosions
  updateExplosions(delta);

  // 2c. Update Phase 3 VFX (Dust & Skidmarks)
  updateDust(delta);
  updateSkidmarks(delta);

  // 3. Update Car Physics and Chase Camera Follow
  updateMovement(delta);

  // 4. Update Dynamic Player Follow Lights (including Grazing Light)
  updatePlayerLights();

  // 5. Proximity Checks (Distance to Glass Columns for HUD text popups)
  checkProximity();

  // 6. Raycast for Focus Target Selection
  updateRaycast();

  // 7. Update Real-time HTML Sun Lens Flare
  updateLensFlare();

  // 8. Render Scene
  renderer.render(scene, camera);
}

// Calculate player movements and collisions (Driving physics & Follow camera)
function updateMovement(delta) {
  // Only process keyboard inputs when pointer is locked and modal is closed
  const activeControl = (document.pointerLockElement === document.body) && !isModalOpen;
  
  // 1. Acceleration & Braking Physics
  if (activeControl) {
    if (keys.w) {
      if (carVelocity < 0) {
        carVelocity += carBrakingDecel * delta; // Quick brake if reversing
      } else {
        carVelocity += carAcceleration * delta;
      }
    } else if (keys.s) {
      if (carVelocity > 0) {
        carVelocity -= carBrakingDecel * delta; // Quick brake if moving forward
      } else {
        carVelocity -= carAcceleration * 0.5 * delta; // Slower reverse acceleration
      }
    } else {
      // Natural rolling drag
      const drag = carDecel * delta;
      if (carVelocity > drag) carVelocity -= drag;
      else if (carVelocity < -drag) carVelocity += drag;
      else carVelocity = 0;
    }
  } else {
    // Natural rolling drag to stop if control lost
    const drag = carDecel * delta;
    if (carVelocity > drag) carVelocity -= drag;
    else if (carVelocity < -drag) carVelocity += drag;
    else carVelocity = 0;
  }
  
  // Clamp speed limits
  carVelocity = Math.max(carMaxReverseSpeed, Math.min(carMaxSpeed, carVelocity));

  // 2. Steering Physics
  // Steering is less effective at low speed, and loses grip at high speed
  const speedRatio = Math.abs(carVelocity) / carMaxSpeed;
  const turnFactor = Math.min(1.0, Math.abs(carVelocity) / 3.0);
  const gripFactor = Math.max(0.35, 1.0 - speedRatio * 0.45);
  
  // Hold Shift for Handbrake drift (higher turn, less grip)
  const isDrifting = activeControl && keys.shift;
  const driftSteerMultiplier = isDrifting ? 1.6 : 1.0;
  const turnAmt = 2.4 * delta * turnFactor * gripFactor * driftSteerMultiplier;

  if (activeControl) {
    if (keys.a) {
      carHeading += turnAmt * Math.sign(carVelocity);
      carSteerAngle = THREE.MathUtils.lerp(carSteerAngle, 0.45, delta * 12);
    } else if (keys.d) {
      carHeading -= turnAmt * Math.sign(carVelocity);
      carSteerAngle = THREE.MathUtils.lerp(carSteerAngle, -0.45, delta * 12);
    } else {
      carSteerAngle = THREE.MathUtils.lerp(carSteerAngle, 0, delta * 12);
    }
  } else {
    carSteerAngle = THREE.MathUtils.lerp(carSteerAngle, 0, delta * 12);
  }

  // 3. Slide/Drift Mechanics (Lateral Slip Inertia)
  const headingVec = new THREE.Vector3(Math.sin(carHeading), 0, Math.cos(carHeading));
  
  // Lower interpolation rate yields longer drifts
  let slipLerpSpeed = 5.0 - (Math.abs(carSteerAngle) * 2.5) - (speedRatio * 2.0);
  if (isDrifting) {
    slipLerpSpeed = 0.6; // extreme slip when e-brake drifting (Phase 3: enhanced from 1.0 to 0.6)
  }
  slipLerpSpeed = Math.max(0.6, slipLerpSpeed);
  carMoveDirection.lerp(headingVec, delta * slipLerpSpeed).normalize();

  // Move the car
  if (cyberCar) {
    cyberCar.position.addScaledVector(carMoveDirection, carVelocity * delta);
    cyberCar.rotation.y = carHeading;

    // Apply Bounding Box Limits to Car
    const maxBound = 140;
    cyberCar.position.x = Math.max(-maxBound, Math.min(maxBound, cyberCar.position.x));
    cyberCar.position.z = Math.max(-maxBound, Math.min(maxBound, cyberCar.position.z));
    cyberCar.position.y = 0; // Lock to floor height
    
    // 3b. Chassis Roll and Pitch (Phase 3)
    const carBody = cyberCar.getObjectByName("body");
    if (carBody) {
      // Calculate lateral G-forces based on speed ratio and steering angle
      const lateralG = (carVelocity / carMaxSpeed) * carSteerAngle;
      
      // Roll (Z rotation): rolls outwards in turns.
      // Pitch (X rotation): dips forward during braking, lifts slightly during acceleration.
      const targetRoll = lateralG * 0.15; // roll angle in radians
      
      let targetPitch = 0;
      if (activeControl) {
        if (keys.w && carVelocity > 0) {
          targetPitch = -0.02 * (carVelocity / carMaxSpeed); // Front lifts slightly
        } else if (keys.s && carVelocity > 0) {
          targetPitch = 0.045 * (carVelocity / carMaxSpeed); // Front dips heavily
        }
      }
      // Damped lerp for smooth transitions
      carBody.rotation.z = THREE.MathUtils.lerp(carBody.rotation.z, targetRoll, delta * 7.5);
      carBody.rotation.x = THREE.MathUtils.lerp(carBody.rotation.x, targetPitch, delta * 8.5);
    }

    // 3c. Spawn rear wheel dust particles (Phase 3)
    dustSpawnTimer += delta;
    const dustInterval = 0.04; // ~25 times per second
    if (dustSpawnTimer >= dustInterval) {
      dustSpawnTimer = 0;
      const isAccelerating = activeControl && (keys.w || keys.s);
      
      // Spawn dust when moving and either accelerating, steering, or drifting
      if (Math.abs(carVelocity) > 1.2 && (isAccelerating || Math.abs(carSteerAngle) > 0.15 || isDrifting)) {
        cyberCar.updateMatrixWorld(true);
        
        // Get rear wheels positions
        const rearLeftPos = new THREE.Vector3(-1.05, 0.15, -1.3).applyMatrix4(cyberCar.matrixWorld);
        const rearRightPos = new THREE.Vector3(1.05, 0.15, -1.3).applyMatrix4(cyberCar.matrixWorld);
        
        // Dust velocity blows opposite to the car's movement direction
        const moveBackDir = carMoveDirection.clone().negate().normalize();
        const speedFactor = Math.abs(carVelocity) * 0.45;
        const baseVel = moveBackDir.multiplyScalar(speedFactor);
        
        // Spawn more puffs when drifting
        const spawnCount = isDrifting ? 3 : 1;
        for (let s = 0; s < spawnCount; s++) {
          spawnDustPuff(rearLeftPos, baseVel);
          spawnDustPuff(rearRightPos, baseVel);
        }
      }
    }

    // 3d. Spawn tyre skidmarks during drifts and hard slides (Phase 3)
    const isSlidingHeavily = Math.abs(carVelocity) > 7.0 && Math.abs(carSteerAngle) > 0.28;
    if (isDrifting || isSlidingHeavily) {
      cyberCar.updateMatrixWorld(true);
      
      const rearLeftPos = new THREE.Vector3(-1.05, 0.006, -1.3).applyMatrix4(cyberCar.matrixWorld);
      const rearRightPos = new THREE.Vector3(1.05, 0.006, -1.3).applyMatrix4(cyberCar.matrixWorld);
      
      // Distance check to prevent overlapping/redundant skidmark segments
      if (lastSkidLeft.distanceTo(rearLeftPos) > 0.35) {
        spawnSkidmark(rearLeftPos, carHeading);
        lastSkidLeft.copy(rearLeftPos);
      }
      if (lastSkidRight.distanceTo(rearRightPos) > 0.35) {
        spawnSkidmark(rearRightPos, carHeading);
        lastSkidRight.copy(rearRightPos);
      }
    }

    // 4. Collision Check with Monuments (Skip if collected)
    monuments.forEach(m => {
      if (m.isCollected) return;
      const mPos = m.mesh.position.clone();
      mPos.y = cyberCar.position.y;
      const dist = cyberCar.position.distanceTo(mPos);
      const minCollisionDist = 5.2 + 1.1; // Monument radius + car radius padding
      if (dist < minCollisionDist) {
        const pushDirection = cyberCar.position.clone().sub(mPos).normalize();
        cyberCar.position.copy(mPos).addScaledVector(pushDirection, minCollisionDist);
        carVelocity *= -0.25; // bounce back
      }
    });

    // 5. Collision Check with Columns
    columns.forEach(c => {
      const cPos = c.position.clone();
      cPos.y = cyberCar.position.y;
      const dist = cyberCar.position.distanceTo(cPos);
      const minCollisionDist = 1.6 + 1.1; // Column radius + car radius padding
      if (dist < minCollisionDist) {
        const pushDirection = cyberCar.position.clone().sub(cPos).normalize();
        cyberCar.position.copy(cPos).addScaledVector(pushDirection, minCollisionDist);
        carVelocity *= -0.25; // bounce back
      }
    });

    // 5b. Collision Check with Procedural Obstacles (Ruins & Trees)
    obstacles.forEach(obs => {
      const obsPos = obs.position.clone();
      obsPos.y = cyberCar.position.y;
      const dist = cyberCar.position.distanceTo(obsPos);
      const minCollisionDist = obs.radius + 1.1; // obstacle radius + car radius padding
      if (dist < minCollisionDist) {
        const pushDirection = cyberCar.position.clone().sub(obsPos).normalize();
        cyberCar.position.copy(obsPos).addScaledVector(pushDirection, minCollisionDist);
        carVelocity *= -0.25; // bounce back and lose speed
      }
    });

    // 6. Update Wheels steering & rolling
    // Wheels 0 and 1 are front wheels
    if (carWheels.length >= 4) {
      carWheels[0].rotation.y = carSteerAngle;
      carWheels[1].rotation.y = carSteerAngle;
      
      const wheelRotAmt = (carVelocity * delta) / 0.45; // linear dist / radius
      carWheels.forEach(w => {
        w.rotation.x += wheelRotAmt;
      });
    }
  }

  // 7. Orbit Camera Follow Logic with Damping
  if (activeControl) {
    // Mouse input decays slowly back to look forward
    yaw = THREE.MathUtils.lerp(yaw, 0, delta * 2.2);
    pitch = THREE.MathUtils.lerp(pitch, 0.08, delta * 2.2); // rest pitch is slightly down
  } else {
    yaw = 0;
    pitch = 0.08;
  }

  const combinedHeading = carHeading + yaw;
  const backX = -Math.sin(combinedHeading) * Math.cos(pitch);
  const backY = Math.sin(pitch);
  const backZ = -Math.cos(combinedHeading) * Math.cos(pitch);

  // Ideal camera position is behind and above the car
  const cameraDistance = isDrifting ? 9.0 : 7.5; // pull back further during drift
  const idealCameraPos = new THREE.Vector3(
    cyberCar.position.x + backX * cameraDistance,
    cyberCar.position.y + 1.9 + backY * cameraDistance,
    cyberCar.position.z + backZ * cameraDistance
  );

  // Damped follow camera position
  camera.position.lerp(idealCameraPos, delta * 5.0);

  // 7b. High-Speed Camera Shake (Phase 3)
  // Shake kicks in starting at 15.0 m/s and increases in intensity up to 22.0 m/s (max speed)
  if (Math.abs(carVelocity) > 15.0) {
    const excessSpeed = Math.abs(carVelocity) - 15.0; // 0 to 7
    const shakeIntensity = (excessSpeed / 7.0) * 0.12; // Max offset of 0.12m
    
    // High-frequency random offsets
    camera.position.x += (Math.random() - 0.5) * shakeIntensity;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity;
    camera.position.z += (Math.random() - 0.5) * shakeIntensity;
  }

  // Look target in front of the car
  const lookTarget = new THREE.Vector3(
    cyberCar.position.x + Math.sin(carHeading) * 1.5,
    cyberCar.position.y + 0.6,
    cyberCar.position.z + Math.cos(carHeading) * 1.5
  );
  camera.lookAt(lookTarget);
}

// Update player attached lighting (Flashlight, Down-light & Grazing PointLight)
function updatePlayerLights() {
  if (playerSpotlight && spotlightTarget) {
    // Flashlight follows camera look direction
    playerSpotlight.position.copy(camera.position);
    
    const lookDir = new THREE.Vector3();
    camera.getWorldDirection(lookDir);
    
    const targetPos = camera.position.clone().addScaledVector(lookDir, 15);
    spotlightTarget.position.copy(targetPos);
  }

  // Grazing Light follows the Car to illuminate pavement cracks around it
  if (playerPointLight && cyberCar) {
    playerPointLight.position.x = cyberCar.position.x;
    playerPointLight.position.z = cyberCar.position.z;
    playerPointLight.position.y = 0.15;
  }

  // Under-light follows the Car to act as a neat chassis neon underglow
  if (playerDownlight && cyberCar) {
    playerDownlight.position.x = cyberCar.position.x;
    playerDownlight.position.z = cyberCar.position.z;
    playerDownlight.position.y = 0.08; // close to floor
  }
}

// Check Player Proximity to Glass Columns
function checkProximity() {
  if (isModalOpen) {
    if (proximityHud.style.opacity === '1') {
      proximityHud.style.opacity = '0';
      proximityHud.style.transform = 'translate(-50%, 20px)';
      setTimeout(() => { proximityHud.style.display = 'none'; }, 400);
    }
    activePillarIndex = -1;
    return;
  }

  let closestColIdx = -1;
  let minDistance = Infinity;

  // Track horizontal distance in 2D plane relative to the cyber car
  const playerPos = cyberCar ? new THREE.Vector2(cyberCar.position.x, cyberCar.position.z) : new THREE.Vector2(camera.position.x, camera.position.z);

  columns.forEach((c, idx) => {
    const colPos = new THREE.Vector2(c.position.x, c.position.z);
    const dist = playerPos.distanceTo(colPos);

    if (dist < 6.0 && dist < minDistance) {
      minDistance = dist;
      closestColIdx = idx;
    }
  });

  if (closestColIdx !== -1) {
    if (activePillarIndex !== closestColIdx) {
      activePillarIndex = closestColIdx;
      const col = columns[activePillarIndex];

      // Update Proximity HUD contents
      proximityTitle.textContent = col.name;
      proximityContent.textContent = col.desc;
      
      // Update HUD card styling border & shadow to column's neon color
      proximityHud.firstElementChild.style.borderColor = col.colorStr;
      proximityHud.firstElementChild.style.boxShadow = `0 0 30px ${col.colorStr}33`; // 20% opacity shadow

      // Show Proximity HUD
      proximityHud.style.display = 'block';
      setTimeout(() => {
        proximityHud.style.opacity = '1';
        proximityHud.style.transform = 'translate(-50%, 0)';
      }, 10);
    }
  } else {
    if (activePillarIndex !== -1) {
      activePillarIndex = -1;
      
      // Fade out Proximity HUD
      proximityHud.style.opacity = '0';
      proximityHud.style.transform = 'translate(-50%, 20px)';
      setTimeout(() => {
        // Double check we haven't entered another pillar's area before hiding
        if (activePillarIndex === -1) {
          proximityHud.style.display = 'none';
        }
      }, 400);
    }
  }
}

// Raycast targeting: Checks if user looks at a monument or column
function updateRaycast() {
  if (document.pointerLockElement !== document.body || isModalOpen) {
    deactivateFocus();
    return;
  }

  // Create ray from center of camera
  const raycaster = new THREE.Raycaster();
  const centerScreen = new THREE.Vector2(0, 0);
  raycaster.setFromCamera(centerScreen, camera);

  let closestIntersect = null;
  let detectedMonument = null;

  // 1. Scan for monument interactions
  monuments.forEach(m => {
    const intersects = raycaster.intersectObjects(m.mesh.children, true);
    if (intersects.length > 0) {
      const dist = intersects[0].distance;
      if (dist < 28 && (!closestIntersect || dist < closestIntersect.distance)) {
        closestIntersect = intersects[0];
        detectedMonument = m;
      }
    }
  });

  // 2. Scan for glass column interactions
  columns.forEach(c => {
    const intersects = raycaster.intersectObjects(c.mesh.children, true);
    if (intersects.length > 0) {
      const dist = intersects[0].distance;
      if (dist < 28 && (!closestIntersect || dist < closestIntersect.distance)) {
        closestIntersect = intersects[0];
        detectedMonument = c;
      }
    }
  });

  // Handle active focus/hover state changes
  if (detectedMonument) {
    if (targetMonument !== detectedMonument) {
      targetMonument = detectedMonument;
      
      crosshair.classList.add('active');
      
      targetName.textContent = detectedMonument.name;
      targetInfo.style.display = 'block';
      setTimeout(() => { targetInfo.style.opacity = '1'; }, 10);
    }
  } else {
    deactivateFocus();
  }
}

function deactivateFocus() {
  if (targetMonument) {
    targetMonument = null;
    crosshair.classList.remove('active');
    targetInfo.style.opacity = '0';
    setTimeout(() => { 
      if (!targetMonument) targetInfo.style.display = 'none'; 
    }, 300);
  }
}

/* --- MODAL DIALOG MANAGEMENT --- */

function openDetailModal(monument) {
  isModalOpen = true;
  document.exitPointerLock(); // unlock cursor so user can click modal close button

  modalTitle.textContent = monument.name;
  modalBody.innerHTML = monument.description;
  
  detailModal.classList.add('open');
}

function closeDetailModal() {
  detailModal.classList.remove('open');
  isModalOpen = false;
  
  // Re-request pointer lock
  setTimeout(() => {
    document.body.requestPointerLock();
  }, 100);
}

// 8. Real-time Sun Lens Flare Calculations & Position Updates
function updateLensFlare() {
  const container = document.getElementById('lens-flare-container');
  if (!container) return;

  if (isModalOpen || document.pointerLockElement !== document.body) {
    container.style.display = 'none';
    return;
  }

  // Direction of the sun in the sky dome
  const sunPos = new THREE.Vector3(60, 120, 30).normalize().multiplyScalar(500);
  const tempV = sunPos.clone().project(camera);

  // Check if sun is in front of the camera (behind project yields z > 1)
  if (tempV.z > 1.0) {
    container.style.display = 'none';
    return;
  }

  // Convert normalized device coordinates to screen pixels
  const width = window.innerWidth;
  const height = window.innerHeight;
  const sunX = (tempV.x * 0.5 + 0.5) * width;
  const sunY = (tempV.y * -0.5 + 0.5) * height;

  // Render flares even slightly off screen for smooth edge transitions
  const margin = 250;
  if (sunX < -margin || sunX > width + margin || sunY < -margin || sunY > height + margin) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  const centerX = width / 2;
  const centerY = height / 2;

  // Vector from screen center to projected sun position
  const dx = sunX - centerX;
  const dy = sunY - centerY;

  const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const normalizedDist = dist / maxDist;

  // Brightest flares when user looks directly at the sun
  const baseOpacity = Math.max(0, 1.0 - normalizedDist * 1.4);

  // Fade flares out smoothly as the sun source approaches screen borders
  let edgeFade = 1.0;
  const pad = 200;
  if (sunX < pad) edgeFade *= sunX / pad;
  else if (sunX > width - pad) edgeFade *= (width - sunX) / pad;
  if (sunY < pad) edgeFade *= sunY / pad;
  else if (sunY > height - pad) edgeFade *= (height - sunY) / pad;
  edgeFade = Math.max(0, Math.min(1, edgeFade));

  const opacity = baseOpacity * edgeFade;

  if (opacity <= 0.01) {
    container.style.display = 'none';
    return;
  }

  // Update primary sun position flare
  const flareSun = document.getElementById('flare-sun');
  if (flareSun) {
    flareSun.style.left = `${sunX}px`;
    flareSun.style.top = `${sunY}px`;
    flareSun.style.opacity = (opacity * 0.95).toString();
  }

  // Position smaller flares along the ray extending from screen center to the sun
  const flare1 = document.getElementById('flare-1');
  const flare2 = document.getElementById('flare-2');
  const flare3 = document.getElementById('flare-3');
  const flare4 = document.getElementById('flare-4');
  const flare5 = document.getElementById('flare-5');

  // Offset multiplier determines distance along the line:
  // positive is towards sun, negative is opposite side of screen center (chromatic aberration simulation)
  setFlarePosition(flare1, centerX + dx * 0.45, centerY + dy * 0.45, opacity * 0.65);
  setFlarePosition(flare2, centerX + dx * 0.12, centerY + dy * 0.12, opacity * 0.55);
  setFlarePosition(flare3, centerX - dx * 0.25, centerY - dy * 0.25, opacity * 0.85);
  setFlarePosition(flare4, centerX - dx * 0.55, centerY - dy * 0.55, opacity * 0.45);
  setFlarePosition(flare5, centerX - dx * 0.85, centerY - dy * 0.85, opacity * 0.50);
}

function setFlarePosition(el, x, y, op) {
  if (!el) return;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.opacity = Math.max(0, Math.min(1, op)).toString();
}

// 9. Sound effect player using Web Audio API
function playCollectSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    
    // Create oscillator components for a clean digital arpeggio chord chime
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(261.63, now); // C4
    osc1.frequency.exponentialRampToValueAtTime(523.25, now + 0.08); // C5
    osc1.frequency.exponentialRampToValueAtTime(1046.50, now + 0.16); // C6
    
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(329.63, now); // E4
    osc2.frequency.exponentialRampToValueAtTime(659.25, now + 0.08); // E5
    osc2.frequency.exponentialRampToValueAtTime(1318.51, now + 0.16); // E6
    
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(392.00, now + 0.04); // G4 offset
    osc3.frequency.exponentialRampToValueAtTime(783.99, now + 0.12); // G5
    osc3.frequency.exponentialRampToValueAtTime(1567.98, now + 0.20); // G6
    
    gainNode.gain.setValueAtTime(0.25, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45); // Fade out over 450ms
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    osc3.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc1.start(now);
    osc2.start(now);
    osc3.start(now + 0.04);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
    osc3.stop(now + 0.45);
  } catch (e) {
    console.warn("Web Audio Context could not initialize: " + e.message);
  }
}

// 10. Particle explosion generator for node collection
function createExplosion(pos, colorStr) {
  const particleCount = 80;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  
  for (let i = 0; i < particleCount; i++) {
    const idx = i * 3;
    positions[idx] = pos.x;
    positions[idx + 1] = pos.y + 0.5; // slight height offset
    positions[idx + 2] = pos.z;
    
    // Spherical distribution with strong vertical bias
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    const speed = 5.0 + Math.random() * 9.0;
    
    velocities[idx] = Math.sin(phi) * Math.cos(theta) * speed;
    velocities[idx + 1] = (Math.cos(phi) * speed) + 5.0; // lift upward
    velocities[idx + 2] = Math.sin(phi) * Math.sin(theta) * speed;
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const particleTexture = createCircleTexture();
  const material = new THREE.PointsMaterial({
    color: new THREE.Color(colorStr),
    size: 0.28,
    map: particleTexture,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  
  const pSystem = new THREE.Points(geometry, material);
  scene.add(pSystem);
  
  activeExplosions.push({
    system: pSystem,
    velocities: velocities,
    age: 0,
    maxAge: 1.4 // seconds
  });
}

// 11. Update particle explosions in frame loop
function updateExplosions(delta) {
  for (let eIdx = activeExplosions.length - 1; eIdx >= 0; eIdx--) {
    const exp = activeExplosions[eIdx];
    exp.age += delta;
    
    if (exp.age >= exp.maxAge) {
      scene.remove(exp.system);
      exp.system.geometry.dispose();
      exp.system.material.dispose();
      activeExplosions.splice(eIdx, 1);
      continue;
    }
    
    const posAttr = exp.system.geometry.attributes.position;
    const arr = posAttr.array;
    const v = exp.velocities;
    
    for (let i = 0; i < posAttr.count; i++) {
      const idx = i * 3;
      arr[idx] += v[idx] * delta;
      arr[idx + 1] += v[idx + 1] * delta;
      arr[idx + 2] += v[idx + 2] * delta;
      
      // Apply gravity to vertical velocity
      v[idx + 1] -= 9.8 * delta;
    }
    
    posAttr.needsUpdate = true;
    
    // Fade out material opacity
    exp.system.material.opacity = 1.0 - (exp.age / exp.maxAge);
  }
}

// 12. Update HUD Nodes Counter
function updateNodesHUD() {
  const el = document.getElementById('hud-nodes');
  if (el) {
    el.textContent = `KNOTEN GEFUNDEN: ${collectedNodesCount} / 4`;
    // Add temporary visual flash effect by styling color
    el.style.color = '#38ef7d';
    setTimeout(() => {
      el.style.color = 'var(--color-cyan)';
    }, 500);
  }
}

// 13. Procedural obstacle generation (Phase 2)
function generateObstacles() {
  const buildingColors = [0x1e2026, 0x14151a, 0x242630];
  const numBuildings = 32;
  
  for (let i = 0; i < numBuildings; i++) {
    const x = (Math.random() - 0.5) * 240;
    const z = (Math.random() - 0.5) * 240;
    
    // Skip starting area (0,0) and column cluster (0,-45) to maintain drive paths
    const distToStart = Math.sqrt(x*x + z*z);
    const distToColumns = Math.sqrt(x*x + (z + 45)*(z + 45));
    if (distToStart < 22 || distToColumns < 22) {
      continue;
    }
    
    const ruinGroup = new THREE.Group();
    ruinGroup.position.set(x, 0, z);
    
    const baseW = 6.0 + Math.random() * 8.0;
    const baseD = 6.0 + Math.random() * 8.0;
    const baseH = 8.0 + Math.random() * 15.0;
    
    const concreteMat = new THREE.MeshStandardMaterial({
      color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
      roughness: 0.95,
      metalness: 0.1
    });
    
    // Main structural box
    const mainGeo = new THREE.BoxGeometry(baseW, baseH, baseD);
    const mainMesh = new THREE.Mesh(mainGeo, concreteMat);
    mainMesh.position.y = baseH / 2;
    mainMesh.castShadow = true;
    mainMesh.receiveShadow = true;
    ruinGroup.add(mainMesh);
    
    // Ruined tilted floor slabs
    const slabCount = 1 + Math.floor(Math.random() * 3);
    for (let s = 0; s < slabCount; s++) {
      const slabGeo = new THREE.BoxGeometry(
        baseW * (0.4 + Math.random() * 0.5),
        baseH * 0.15,
        baseD * (0.4 + Math.random() * 0.5)
      );
      const slabMesh = new THREE.Mesh(slabGeo, concreteMat);
      slabMesh.position.set(
        (Math.random() - 0.5) * baseW * 0.6,
        baseH * (0.3 + Math.random() * 0.6),
        (Math.random() - 0.5) * baseD * 0.6
      );
      slabMesh.rotation.set(
        (Math.random() - 0.5) * 0.18,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.18
      );
      slabMesh.castShadow = true;
      slabMesh.receiveShadow = true;
      ruinGroup.add(slabMesh);
    }
    
    // Metal rebars sticking out of concrete
    const rebarCount = 3 + Math.floor(Math.random() * 5);
    const rebarGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.0 + Math.random() * 3.0, 4);
    const rebarMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.75, roughness: 0.45 });
    for (let r = 0; r < rebarCount; r++) {
      const rebar = new THREE.Mesh(rebarGeo, rebarMat);
      rebar.position.set(
        (Math.random() - 0.5) * baseW * 0.8,
        baseH + 1.0,
        (Math.random() - 0.5) * baseD * 0.8
      );
      rebar.rotation.set(
        (Math.random() - 0.5) * 0.35,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.35
      );
      rebar.castShadow = true;
      ruinGroup.add(rebar);
    }
    
    scene.add(ruinGroup);
    
    const collisionRadius = Math.max(baseW, baseD) * 0.6;
    obstacles.push({
      position: new THREE.Vector3(x, 0, z),
      radius: collisionRadius,
      type: 'building'
    });
  }
  
  // 14. Generate Charred Astlose Dead Trees
  const numTrees = 55;
  const treeMat = new THREE.MeshStandardMaterial({
    color: 0x08080a, // burnt coal color
    roughness: 0.98,
    metalness: 0.05
  });
  
  for (let i = 0; i < numTrees; i++) {
    const x = (Math.random() - 0.5) * 260;
    const z = (Math.random() - 0.5) * 260;
    
    const distToStart = Math.sqrt(x*x + z*z);
    const distToColumns = Math.sqrt(x*x + (z + 45)*(z + 45));
    if (distToStart < 18 || distToColumns < 18) {
      continue;
    }
    
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, 0, z);
    
    const height = 4.5 + Math.random() * 3.5;
    const baseRad = 0.22 + Math.random() * 0.08;
    
    const trunkGeo = new THREE.CylinderGeometry(0.04, baseRad, height, 8);
    const trunk = new THREE.Mesh(trunkGeo, treeMat);
    trunk.position.y = height / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);
    
    const branchCount = 2 + Math.floor(Math.random() * 2);
    for (let b = 0; b < branchCount; b++) {
      const bLen = 1.6 + Math.random() * 1.8;
      const bGeo = new THREE.CylinderGeometry(0.02, 0.08, bLen, 5);
      const branch = new THREE.Mesh(bGeo, treeMat);
      
      const bHeight = height * (0.45 + Math.random() * 0.45);
      branch.position.set(0, bHeight, 0);
      branch.rotation.z = (0.45 + Math.random() * 0.6) * (Math.random() > 0.5 ? 1 : -1);
      branch.rotation.y = Math.random() * Math.PI * 2;
      branch.rotation.x = (Math.random() - 0.5) * 0.35;
      branch.castShadow = true;
      treeGroup.add(branch);
    }
    
    scene.add(treeGroup);
    
    obstacles.push({
      position: new THREE.Vector3(x, 0, z),
      radius: baseRad + 0.35,
      type: 'tree'
    });
  }
}

// 14. Initialize Dust Particle Pool
function initDustSystem() {
  const dustGeo = new THREE.SphereGeometry(0.25, 5, 4); // Low-poly sphere for dust puffs
  const dustMatBase = new THREE.MeshBasicMaterial({
    color: 0x6e655f, // Ash-brown dusty color
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.NormalBlending
  });
  
  for (let i = 0; i < maxDustPuffs; i++) {
    const mat = dustMatBase.clone();
    const mesh = new THREE.Mesh(dustGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    dustPuffs.push({
      mesh: mesh,
      material: mat,
      active: false,
      velocity: new THREE.Vector3(),
      age: 0,
      maxAge: 1.0,
      scaleSpeed: 1.0
    });
  }
}

// 15. Spawn a dust particle puff behind a wheel
function spawnDustPuff(position, velocity) {
  const puff = dustPuffs[nextDustPuffIndex];
  nextDustPuffIndex = (nextDustPuffIndex + 1) % maxDustPuffs;
  
  puff.mesh.position.copy(position);
  // Add position dispersal
  puff.mesh.position.x += (Math.random() - 0.5) * 0.3;
  puff.mesh.position.y += (Math.random() - 0.5) * 0.1;
  puff.mesh.position.z += (Math.random() - 0.5) * 0.3;
  
  puff.velocity.copy(velocity);
  // Add velocity dispersion
  puff.velocity.x += (Math.random() - 0.5) * 1.5;
  puff.velocity.y += (Math.random() * 1.5) + 0.5; // push up
  puff.velocity.z += (Math.random() - 0.5) * 1.5;
  
  puff.age = 0;
  puff.maxAge = 0.5 + Math.random() * 0.6;
  puff.scaleSpeed = 1.8 + Math.random() * 2.2;
  
  puff.mesh.scale.setScalar(0.35 + Math.random() * 0.45);
  puff.material.opacity = 0.35 + Math.random() * 0.35;
  puff.mesh.visible = true;
  puff.active = true;
}

// 16. Update active dust puffs in game loop
function updateDust(delta) {
  dustPuffs.forEach(puff => {
    if (!puff.active) return;
    
    puff.age += delta;
    if (puff.age >= puff.maxAge) {
      puff.active = false;
      puff.mesh.visible = false;
      return;
    }
    
    // Move
    puff.mesh.position.addScaledVector(puff.velocity, delta);
    // Apply air resistance drag
    puff.velocity.multiplyScalar(Math.max(0, 1.0 - delta * 2.5));
    
    // Expand dust puff size
    const newScale = puff.mesh.scale.x + puff.scaleSpeed * delta;
    puff.mesh.scale.setScalar(newScale);
    
    // Fade out
    const lifeRatio = puff.age / puff.maxAge;
    puff.material.opacity = 0.5 * (1.0 - lifeRatio);
  });
}

// 17. Initialize Skidmarks Pool
function initSkidmarks() {
  const skidGeo = new THREE.PlaneGeometry(0.35, 0.6);
  const skidMatBase = new THREE.MeshBasicMaterial({
    color: 0x050505, // Black burnt rubber marks
    transparent: true,
    opacity: 0.0,
    depthWrite: false
  });
  
  for (let i = 0; i < maxSkidmarks; i++) {
    const mat = skidMatBase.clone();
    const mesh = new THREE.Mesh(skidGeo, mat);
    mesh.rotation.x = -Math.PI / 2; // Flat on XZ ground
    mesh.position.y = 0.006; // slightly above floor
    mesh.visible = false;
    scene.add(mesh);
    skidmarks.push({
      mesh: mesh,
      material: mat,
      active: false,
      age: 0,
      maxAge: 5.0 // last 5 seconds before disappearing
    });
  }
}

// 18. Spawn a skidmark segment
function spawnSkidmark(pos, heading) {
  const skid = skidmarks[nextSkidmarkIndex];
  nextSkidmarkIndex = (nextSkidmarkIndex + 1) % maxSkidmarks;
  
  skid.mesh.position.x = pos.x;
  skid.mesh.position.z = pos.z;
  skid.mesh.position.y = 0.006;
  skid.mesh.rotation.z = -heading; // alignment rotated on X is around local Z (world Y)
  
  skid.age = 0;
  skid.material.opacity = 0.55;
  skid.mesh.visible = true;
  skid.active = true;
}

// 19. Update skidmarks fading in game loop
function updateSkidmarks(delta) {
  skidmarks.forEach(skid => {
    if (!skid.active) return;
    
    skid.age += delta;
    if (skid.age >= skid.maxAge) {
      skid.active = false;
      skid.mesh.visible = false;
      return;
    }
    
    // Linear fade
    const lifeRatio = skid.age / skid.maxAge;
    skid.material.opacity = 0.55 * (1.0 - lifeRatio);
  });
}


