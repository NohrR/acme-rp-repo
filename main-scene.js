import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const SCENE_MOUNT_ID = "main-scene";
const CAMERA_DISTANCE = 12;
const ORBIT_COUNT = 5;
const ORBIT_SPEED = 0.42;
const RING_RADIUS_X = 4.35;
const RING_RADIUS_Y = 2.35;
const RING_POINT_COUNT = 280;
const CAMERA_FIT_PADDING = 1.16;
const ORBIT_MODEL_MAX_DIMENSION = 1.04;
const FEATURE_MODEL_INDEX = 2;
const FEATURE_SOLID_MODEL_PATH = "./assets/models/CNCPart3.glb";
const FEATURE_MODEL_TARGET_POSITION = new THREE.Vector3(-3, 0, 1.2);
const FEATURE_MODEL_TARGET_SCALE = 4.05;
const FEATURE_MODEL_TRANSITION_SPEED = 5.2;
const FEATURE_MORPH_START_PROGRESS = 0.96;
const FEATURE_MORPH_TRANSITION_SPEED = 3.8;
const FEATURE_PART3_PRESENTATION_SPEED = 3.6;
const FEATURE_PART3_ROTATION_SPEED = 4.2;
const FEATURE_ROTATION_RESUME_BLEND_SPEED = 7.5;
const FEATURE_PART3_TARGET_ROTATION = new THREE.Euler(0, -Math.PI / 2, 0, "XYZ");
const ORBIT_MODEL_PATHS = [
  "./assets/models/wireMeshed/CNCPart1WM.glb",
  "./assets/models/wireMeshed/CNCPart2WM.glb",
  "./assets/models/wireMeshed/CNCPart3WM.glb",
  "./assets/models/wireMeshed/CNCPart4WM.glb",
  "./assets/models/wireMeshed/CNCPart5WM.glb",
];

const mount = document.getElementById(SCENE_MOUNT_ID);

if (!mount) {
  throw new Error(`Missing scene mount: #${SCENE_MOUNT_ID}`);
}

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
});

renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute("aria-hidden", "true");
mount.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
camera.position.set(0, 0, CAMERA_DISTANCE);
scene.add(camera);

const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
keyLight.position.set(5.4, 3.8, 7.2);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xf1ece3, 0.95);
fillLight.position.set(-4.4, -2.1, 5.4);
scene.add(fillLight);

const orbitRig = new THREE.Group();
orbitRig.rotation.set(-0.5, 0, -0.18);
scene.add(orbitRig);

const ringPoints = [];
for (let index = 0; index <= RING_POINT_COUNT; index += 1) {
  const angle = (index / RING_POINT_COUNT) * Math.PI * 2;
  ringPoints.push(
    new THREE.Vector3(
      Math.cos(angle) * RING_RADIUS_X,
      Math.sin(angle) * RING_RADIUS_Y,
      0
    )
  );
}

const ringGeometry = new THREE.BufferGeometry().setFromPoints(ringPoints);
const ringMaterial = new THREE.LineDashedMaterial({
  color: 0xe8742f,
  dashSize: 0.05,
  gapSize: 0.14,
  transparent: true,
  opacity: 0.9,
});
ringMaterial.userData.baseOpacity = ringMaterial.opacity;

const ring = new THREE.Line(ringGeometry, ringMaterial);
ring.computeLineDistances();
orbitRig.add(ring);

const cubeGeometry = new THREE.BoxGeometry(0.7, 0.7, 0.7);
const cubeEdges = new THREE.EdgesGeometry(cubeGeometry);
const cubeMaterial = new THREE.LineBasicMaterial({
  color: 0xe8742f,
  transparent: true,
  opacity: 0.9,
});
cubeMaterial.userData.baseOpacity = cubeMaterial.opacity;
const orbitModelEdgesMaterial = new THREE.LineBasicMaterial({
  color: 0xe8742f,
  transparent: true,
  opacity: 0.9,
});
const orbitModelSurfaceMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: false,
  opacity: 1,
  colorWrite: false,
  depthTest: true,
  depthWrite: true,
});
orbitModelSurfaceMaterial.userData.isDepthOccluder = true;
const orbitModelWireframeMaterial = new THREE.MeshBasicMaterial({
  color: 0xe8742f,
  wireframe: true,
  transparent: true,
  opacity: 0.0,
});

const orbitItems = [];
const rigBounds = new THREE.Box3();
const rigSize = new THREE.Vector3();
const rigCenter = new THREE.Vector3();
const modelBounds = new THREE.Box3();
const modelSize = new THREE.Vector3();
const modelCenter = new THREE.Vector3();
const tempMatrixA = new THREE.Matrix4();
const loader = new GLTFLoader();
const animationMixers = [];
const wireMeshRotationSpeedY = 0.28;
const featureOrbitDeparturePosition = new THREE.Vector3();
const featurePart3StartRotation = new THREE.Euler();
const featurePart3ResolvedTargetRotation = new THREE.Euler();
let featureSpinRotationY = 0;
let featureRotationResumeActive = false;
let activeSectionIndex = 0;
let featureFocusProgress = 0;
let featureSolidProgress = 0;
let featurePart3PresentationProgress = 0;
let orbitOffset = 0;

for (let index = 0; index < ORBIT_COUNT; index += 1) {
  const baseAngle = (index / ORBIT_COUNT) * Math.PI * 2;

  if (index < ORBIT_MODEL_PATHS.length) {
    const modelAnchor = new THREE.Group();
    modelAnchor.userData.baseAngle = baseAngle;
    modelAnchor.userData.isFeatureModel = index === FEATURE_MODEL_INDEX;
    orbitRig.add(modelAnchor);
    orbitItems.push(modelAnchor);
    continue;
  }

  const cube = new THREE.LineSegments(cubeEdges, cubeMaterial);
  cube.rotation.set(0.72, 0.82, 0.16);
  cube.userData.baseAngle = baseAngle;
  cube.userData.isFeatureModel = false;
  orbitRig.add(cube);
  orbitItems.push(cube);
}

function positionOrbitItem(item, angle, focusProgress) {
  const orbitX = Math.cos(angle) * RING_RADIUS_X;
  const orbitY = Math.sin(angle) * RING_RADIUS_Y;

  if (item.userData.isFeatureModel) {
    const departureX =
      activeSectionIndex >= 1 ? featureOrbitDeparturePosition.x : orbitX;
    const departureY =
      activeSectionIndex >= 1 ? featureOrbitDeparturePosition.y : orbitY;

    item.position.set(
      THREE.MathUtils.lerp(departureX, FEATURE_MODEL_TARGET_POSITION.x, focusProgress),
      THREE.MathUtils.lerp(departureY, FEATURE_MODEL_TARGET_POSITION.y, focusProgress),
      THREE.MathUtils.lerp(0, FEATURE_MODEL_TARGET_POSITION.z, focusProgress)
    );
    item.scale.setScalar(THREE.MathUtils.lerp(1, FEATURE_MODEL_TARGET_SCALE, focusProgress));
    return;
  }

  item.position.set(orbitX, orbitY, 0);
  item.scale.setScalar(1);
}

function fitModelToDimension(modelRoot, targetDimension) {
  modelBounds.setFromObject(modelRoot);
  modelBounds.getSize(modelSize);

  const maxDimension = Math.max(modelSize.x, modelSize.y, modelSize.z);

  if (maxDimension <= 0) {
    return;
  }

  const scale = targetDimension / maxDimension;
  modelRoot.scale.setScalar(scale);
  modelRoot.updateMatrixWorld(true);

  modelBounds.setFromObject(modelRoot);
  modelBounds.getCenter(modelCenter);
  modelRoot.position.sub(modelCenter);
}

function fitOrbitModel(modelRoot) {
  fitModelToDimension(modelRoot, ORBIT_MODEL_MAX_DIMENSION);
}

function getNearestEquivalentAngle(fromAngle, targetAngle) {
  const shortestDelta = Math.atan2(
    Math.sin(targetAngle - fromAngle),
    Math.cos(targetAngle - fromAngle)
  );

  return fromAngle + shortestDelta;
}

function usesWireMeshedEdges(modelPath) {
  return modelPath.includes("/wireMeshed/");
}

function addQuadEdges(mesh) {
  if (!mesh.geometry) {
    return;
  }

  const edgeLines = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    orbitModelEdgesMaterial.clone()
  );

  edgeLines.name = mesh.name ? `${mesh.name}-edges` : "orbit-model-edges";
  edgeLines.renderOrder = 1;
  edgeLines.material.userData.baseOpacity = orbitModelEdgesMaterial.opacity;
  mesh.material = orbitModelSurfaceMaterial.clone();
  mesh.material.userData.baseOpacity = mesh.material.opacity;
  mesh.add(edgeLines);
}

function setObjectOpacity(object, opacityMultiplier) {
  object.visible = opacityMultiplier > 0.02;

  object.traverse((child) => {
    const materials = Array.isArray(child.material) ? child.material : [child.material];

    for (const material of materials) {
      if (!material) {
        continue;
      }

      if (material.userData.baseOpacity === undefined) {
        material.userData.baseOpacity = material.opacity;
      }

      const baseOpacity = material.userData.baseOpacity;

      if (material.userData.isDepthOccluder) {
        material.transparent = false;
        material.opacity = 1;
        material.colorWrite = false;
        material.depthWrite = true;
        material.depthTest = true;
        continue;
      }

      material.transparent = true;
      material.opacity = baseOpacity * opacityMultiplier;
    }
  });
}

function prepareSolidFeatureModel(modelRoot) {
  modelRoot.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.castShadow = false;
    child.receiveShadow = false;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const clonedMaterials = materials.map((material) => {
      const clonedMaterial = material ? material.clone() : new THREE.MeshBasicMaterial();
      clonedMaterial.userData.baseOpacity = clonedMaterial.opacity;
      clonedMaterial.transparent = true;
      clonedMaterial.opacity = 0;
      return clonedMaterial;
    });

    child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0];
  });
}

function loadFeatureSolidModel(anchor, modelPivot) {
  loader.load(
    FEATURE_SOLID_MODEL_PATH,
    (gltf) => {
      const solidRoot = gltf.scene;

      if (!solidRoot) {
        return;
      }

      prepareSolidFeatureModel(solidRoot);
      fitOrbitModel(solidRoot);
      solidRoot.visible = false;
      modelPivot.add(solidRoot);
      anchor.userData.solidModelRoot = solidRoot;

      updateLayout();
    },
    undefined,
    (error) => {
      console.warn(`Failed to load feature solid model: ${FEATURE_SOLID_MODEL_PATH}`, error);
    }
  );
}

function loadOrbitModel(anchor, modelPath, index) {
  const renderWithQuadEdges = usesWireMeshedEdges(modelPath);

  loader.load(
    modelPath,
    (gltf) => {
      const modelRoot = gltf.scene;

      if (!modelRoot) {
        return;
      }

      modelRoot.traverse((child) => {
        if (!child.isMesh) {
          return;
        }

        child.castShadow = false;
        child.receiveShadow = false;

        if (renderWithQuadEdges) {
          addQuadEdges(child);
          return;
        }

        child.material = orbitModelWireframeMaterial;
      });

      fitOrbitModel(modelRoot);

      const modelPivot = new THREE.Group();
      modelPivot.rotation.set(0.46, index * 0.52, 0.2);
      modelPivot.userData.baseRotationX = 0.46;
      modelPivot.userData.baseRotationY = index * 0.52;
      modelPivot.userData.baseRotationZ = 0.2;
      modelPivot.userData.rotationSpeedY = wireMeshRotationSpeedY + index * 0.03;
      modelPivot.add(modelRoot);
      anchor.add(modelPivot);
      anchor.userData.modelRoot = modelPivot;
      anchor.userData.wireModelRoot = modelRoot;

      if (index === FEATURE_MODEL_INDEX) {
        loadFeatureSolidModel(anchor, modelPivot);
      }

      if (Array.isArray(gltf.animations) && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(modelRoot);

        for (const clip of gltf.animations) {
          mixer.clipAction(clip).play();
        }

        animationMixers.push(mixer);
      }

      updateLayout();
    },
    undefined,
    (error) => {
      console.warn(`Failed to load orbit model: ${modelPath}`, error);
    }
  );
}

for (let index = 0; index < ORBIT_MODEL_PATHS.length; index += 1) {
  loadOrbitModel(orbitItems[index], ORBIT_MODEL_PATHS[index], index);
}

function updateLayout() {
  const width = Math.max(1, mount.clientWidth);
  const height = Math.max(1, mount.clientHeight);
  const compactLayout = width < 680 || height < 360;
  const tallLayout = height > width * 1.05;

  renderer.setSize(width, height, false);
  camera.aspect = width / height;

  orbitRig.scale.setScalar(compactLayout ? 0.82 : (tallLayout ? 0.9 : 1));
  orbitRig.position.set(
    compactLayout ? 0 : 0.45,
    compactLayout ? -0.06 : -0.18,
    0
  );

  const activePresentation = orbitRig;

  activePresentation.updateMatrixWorld(true);
  rigBounds.setFromObject(activePresentation);

  rigBounds.getSize(rigSize);
  rigBounds.getCenter(rigCenter);

  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const fitHeightDistance = (rigSize.y * 0.5) / Math.tan(verticalFov * 0.5);
  const fitWidthDistance =
    (rigSize.x * 0.5) / (Math.tan(verticalFov * 0.5) * camera.aspect);
  const fitDepthOffset = rigSize.z * 0.5;
  const fitDistance =
    Math.max(fitHeightDistance, fitWidthDistance) * CAMERA_FIT_PADDING + fitDepthOffset;

  camera.position.set(rigCenter.x, rigCenter.y, Math.max(CAMERA_DISTANCE, fitDistance));
  camera.lookAt(rigCenter);
  camera.updateProjectionMatrix();
}

function setActiveSection(index) {
  const numericIndex = Number(index);
  const nextSectionIndex = Number.isFinite(numericIndex)
    ? THREE.MathUtils.clamp(Math.round(numericIndex), 0, 2)
    : 0;
  const previousSectionIndex = activeSectionIndex;

  if (nextSectionIndex === activeSectionIndex) {
    return;
  }

  if (nextSectionIndex >= 1) {
    const featureItem = orbitItems[FEATURE_MODEL_INDEX];
    const departureAngle = featureItem.userData.baseAngle + orbitOffset;

    featureOrbitDeparturePosition.set(
      Math.cos(departureAngle) * RING_RADIUS_X,
      Math.sin(departureAngle) * RING_RADIUS_Y,
      0
    );
  }

  if (activeSectionIndex < 2 && nextSectionIndex >= 2) {
    const featureModelRoot = orbitItems[FEATURE_MODEL_INDEX]?.userData?.modelRoot;
    if (featureModelRoot) {
      featurePart3StartRotation.set(
        featureModelRoot.rotation.x,
        featureModelRoot.rotation.y,
        featureModelRoot.rotation.z
      );
      featurePart3ResolvedTargetRotation.set(
        getNearestEquivalentAngle(
          featurePart3StartRotation.x,
          FEATURE_PART3_TARGET_ROTATION.x
        ),
        getNearestEquivalentAngle(
          featurePart3StartRotation.y,
          FEATURE_PART3_TARGET_ROTATION.y
        ),
        getNearestEquivalentAngle(
          featurePart3StartRotation.z,
          FEATURE_PART3_TARGET_ROTATION.z
        )
      );
      featureRotationResumeActive = false;
    }
  }

  if (activeSectionIndex >= 2 && nextSectionIndex < 2) {
    const featureModelRoot = orbitItems[FEATURE_MODEL_INDEX]?.userData?.modelRoot;
    if (featureModelRoot) {
      featureSpinRotationY = featureModelRoot.rotation.y - featureModelRoot.userData.baseRotationY;
      featureRotationResumeActive = true;
    }
  }

  activeSectionIndex = nextSectionIndex;
  orbitRig.visible = true;

  if (previousSectionIndex === 0 || nextSectionIndex === 0) {
    updateLayout();
  }
}

const clock = new THREE.Clock();

function render() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;
  orbitOffset = elapsed * ORBIT_SPEED;

  if (activeSectionIndex < 2) {
    featureSpinRotationY += delta * (wireMeshRotationSpeedY + FEATURE_MODEL_INDEX * 0.03);
  }

  const targetFeatureFocusProgress = activeSectionIndex >= 1 ? 1 : 0;

  featureFocusProgress = THREE.MathUtils.damp(
    featureFocusProgress,
    targetFeatureFocusProgress,
    FEATURE_MODEL_TRANSITION_SPEED,
    delta
  );

  const targetFeatureSolidProgress =
    activeSectionIndex >= 1 && featureFocusProgress >= FEATURE_MORPH_START_PROGRESS ? 1 : 0;

  featureSolidProgress = THREE.MathUtils.damp(
    featureSolidProgress,
    targetFeatureSolidProgress,
    FEATURE_MORPH_TRANSITION_SPEED,
    delta
  );

  featurePart3PresentationProgress = THREE.MathUtils.damp(
    featurePart3PresentationProgress,
    activeSectionIndex >= 2 ? 1 : 0,
    FEATURE_PART3_PRESENTATION_SPEED,
    delta
  );

  ring.visible = featureFocusProgress < 0.98;
  ringMaterial.opacity = ringMaterial.userData.baseOpacity * (1 - featureFocusProgress);

  orbitRig.visible = true;

  for (const item of orbitItems) {
    positionOrbitItem(item, item.userData.baseAngle + orbitOffset, featureFocusProgress);

    if (item.userData.isFeatureModel) {
      setObjectOpacity(item.userData.wireModelRoot ?? item, 1 - featureSolidProgress);

      if (item.userData.solidModelRoot) {
        setObjectOpacity(item.userData.solidModelRoot, featureSolidProgress);
      }
    } else {
      setObjectOpacity(item, 1 - featureFocusProgress);
    }

    if (item.userData.modelRoot) {
      const { modelRoot } = item.userData;

      if (item.userData.isFeatureModel && activeSectionIndex >= 2) {
        modelRoot.rotation.x = THREE.MathUtils.damp(
          modelRoot.rotation.x,
          THREE.MathUtils.lerp(
            featurePart3StartRotation.x,
            featurePart3ResolvedTargetRotation.x,
            featurePart3PresentationProgress
          ),
          FEATURE_PART3_ROTATION_SPEED,
          delta
        );
        modelRoot.rotation.y = THREE.MathUtils.damp(
          modelRoot.rotation.y,
          THREE.MathUtils.lerp(
            featurePart3StartRotation.y,
            featurePart3ResolvedTargetRotation.y,
            featurePart3PresentationProgress
          ),
          FEATURE_PART3_ROTATION_SPEED,
          delta
        );
        modelRoot.rotation.z = THREE.MathUtils.damp(
          modelRoot.rotation.z,
          THREE.MathUtils.lerp(
            featurePart3StartRotation.z,
            featurePart3ResolvedTargetRotation.z,
            featurePart3PresentationProgress
          ),
          FEATURE_PART3_ROTATION_SPEED,
          delta
        );
        continue;
      }

      if (item.userData.isFeatureModel) {
        const resumedRotationY = modelRoot.userData.baseRotationY + featureSpinRotationY;
        if (featureRotationResumeActive) {
          modelRoot.rotation.x = THREE.MathUtils.damp(
            modelRoot.rotation.x,
            modelRoot.userData.baseRotationX,
            FEATURE_ROTATION_RESUME_BLEND_SPEED,
            delta
          );
          modelRoot.rotation.y = resumedRotationY;
          modelRoot.rotation.z = THREE.MathUtils.damp(
            modelRoot.rotation.z,
            modelRoot.userData.baseRotationZ,
            FEATURE_ROTATION_RESUME_BLEND_SPEED,
            delta
          );

          const resumeComplete =
            Math.abs(modelRoot.rotation.x - modelRoot.userData.baseRotationX) < 0.002 &&
            Math.abs(modelRoot.rotation.z - modelRoot.userData.baseRotationZ) < 0.002;

          if (resumeComplete) {
            modelRoot.rotation.x = modelRoot.userData.baseRotationX;
            modelRoot.rotation.y = resumedRotationY;
            modelRoot.rotation.z = modelRoot.userData.baseRotationZ;
            featureRotationResumeActive = false;
          }
        } else {
          modelRoot.rotation.x = modelRoot.userData.baseRotationX;
          modelRoot.rotation.y = resumedRotationY;
          modelRoot.rotation.z = modelRoot.userData.baseRotationZ;
        }
      } else {
        modelRoot.rotation.x = modelRoot.userData.baseRotationX;
        modelRoot.rotation.y =
          modelRoot.userData.baseRotationY + elapsed * modelRoot.userData.rotationSpeedY;
        modelRoot.rotation.z = modelRoot.userData.baseRotationZ;
      }

    }
  }

  for (const mixer of animationMixers) {
    mixer.update(delta);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

window.addEventListener("main-scene-section-change", (event) => {
  setActiveSection(event.detail?.index);
});
window.addEventListener("resize", updateLayout, { passive: true });

setActiveSection(document.body?.dataset.mainSection ?? 0);
updateLayout();
render();
