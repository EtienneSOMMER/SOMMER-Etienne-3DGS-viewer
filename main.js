import * as THREE from 'three';
import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

// ==========================================
// 1. CONFIGURATION DE LA SCÈNE ET VR
// ==========================================
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 5000);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Activation du WebXR pour la VR
renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));
document.body.appendChild(renderer.domElement);

// Création du Dolly (véhicule pour déplacer le joueur en VR)
const dolly = new THREE.Group();
dolly.position.set(0, 0, 0);
scene.add(dolly);
dolly.add(camera);

// Attacher les contrôleurs VR au Dolly
const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);
dolly.add(controller1);
dolly.add(controller2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;

const spark = new SparkRenderer({ renderer: renderer });
scene.add(spark);

const rgbeLoader = new RGBELoader();
rgbeLoader.load('./autumn_field_puresky_2k.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture;
});

// ==========================================
// GESTION PROPRE DES TRANSITIONS PC <-> VR
// ==========================================
renderer.xr.addEventListener('sessionstart', () => {
    // Au moment de mettre le casque, on téléporte le Dolly 
    // là où se trouvait la caméra sur l'écran classique
    dolly.position.copy(camera.position);
    // On peut forcer une hauteur d'apparition (ex: 1.6m si le modèle est à y=0)
    // dolly.position.y = 1.6; 
});

renderer.xr.addEventListener('sessionend', () => {
    // Au retour sur écran, on remet le Dolly à zéro 
    // pour que les calculs de l'Orbiteur ne soient pas faussés
    dolly.position.set(0, 0, 0);
    dolly.rotation.set(0, 0, 0);
});

// ==========================================
// 2. LOGIQUE DE GALERIE (JSON)
// ==========================================
let splatActuel = null; 
const centreOrbite = new THREE.Vector3();
let currentOrbitRadius = 60;
let currentOrbitHeight = 20;

const selectMenu = document.getElementById('model-selector');
const loadingOverlay = document.getElementById('loading-overlay');

async function initGallery() {
    try {
        const response = await fetch('./models.json');
        const modelList = await response.json();

        selectMenu.innerHTML = '';
        modelList.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.title;
            selectMenu.appendChild(option);
        });

        selectMenu.addEventListener('change', (e) => {
            chargerModele(e.target.value, modelList);
        });

        if(modelList.length > 0) {
            chargerModele(modelList[0].id, modelList);
        }
    } catch (error) {
        console.error("Erreur avec models.json :", error);
        selectMenu.innerHTML = '<option>Erreur de chargement</option>';
    }
}

function chargerModele(id, modelList) {
    const config = modelList.find(m => m.id === id);
    if (!config) return;

    loadingOverlay.classList.remove('hidden');

    if (splatActuel !== null) {
        scene.remove(splatActuel);
        splatActuel.dispose(); 
    }

    centreOrbite.set(config.target.x, config.target.y, config.target.z);
    camera.position.set(config.cameraPos.x, config.cameraPos.y, config.cameraPos.z);
    controls.target.copy(centreOrbite);
    
    currentOrbitRadius = config.orbitRadius || 60;
    currentOrbitHeight = config.orbitHeight || 20;

    splatActuel = new SplatMesh({ url: config.url });

    if (config.rotation) {
        splatActuel.rotation.x = config.rotation.x || 0;
        splatActuel.rotation.y = config.rotation.y || 0;
        splatActuel.rotation.z = config.rotation.z || 0;
    } else {
        splatActuel.rotation.x = -Math.PI;
    }

    scene.add(splatActuel);

    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
    }, 2000);
}

initGallery();

// ==========================================
// 3. LOGIQUE UI (INTERFACE PC)
// ==========================================
const btnOrbit = document.getElementById('btn-orbit');
const btnFree = document.getElementById('btn-free');
const speedContainer = document.getElementById('speed-container');
const speedSlider = document.getElementById('speed-slider');
const speedValueDisplay = document.getElementById('speed-value');

let isOrbiting = true;
let currentAngle = 0;
const clock = new THREE.Clock();

speedSlider.addEventListener('input', (e) => {
    speedValueDisplay.textContent = parseFloat(e.target.value).toFixed(2);
});

btnOrbit.addEventListener('click', () => {
    isOrbiting = true;
    controls.enabled = false;
    btnOrbit.classList.add('active');
    btnFree.classList.remove('active');
    speedContainer.style.opacity = '1';
    speedContainer.style.pointerEvents = 'auto';
});

btnFree.addEventListener('click', () => {
    isOrbiting = false;
    controls.enabled = true;
    btnFree.classList.add('active');
    btnOrbit.classList.remove('active');
    speedContainer.style.opacity = '0.4';
    speedContainer.style.pointerEvents = 'none';
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('dblclick', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    if (splatActuel) {
        const intersects = raycaster.intersectObject(splatActuel);
        if (intersects.length > 0) {
            const nouveauCentre = intersects[0].point;
            centreOrbite.copy(nouveauCentre);
            controls.target.copy(nouveauCentre);
            controls.update(); 
        }
    }
});

// ==========================================
// 4. LOGIQUE DE DÉPLACEMENT VR (JOYSTICKS)
// ==========================================
const vitesseDeplacement = 5.0; // Vitesse d'avancée (mètres par seconde)
const vitesseRotation = 1.5;    // Vitesse de rotation (radians par seconde)
const deadzone = 0.1;           // Zone morte des joysticks

function gererDeplacementVR(delta) {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
        if (!source || !source.gamepad) continue;

        // axes[2] = axe horizontal (X), axes[3] = axe vertical (Y) du joystick
        const axeX = source.gamepad.axes[2];
        const axeY = source.gamepad.axes[3];

        // MANETTE GAUCHE : Déplacement horizontal (Plan XZ)
        if (source.handedness === 'left') {
            if (Math.abs(axeX) > deadzone || Math.abs(axeY) > deadzone) {
                
                const cameraDir = new THREE.Vector3();
                camera.getWorldDirection(cameraDir);
                cameraDir.y = 0; // On maintient le vecteur directeur à l'horizontale
                cameraDir.normalize();

                const cameraRight = new THREE.Vector3();
                cameraRight.crossVectors(cameraDir, new THREE.Vector3(0, 1, 0)).normalize();

                dolly.position.addScaledVector(cameraRight, axeX * vitesseDeplacement * delta);
                dolly.position.addScaledVector(cameraDir, -axeY * vitesseDeplacement * delta);
            }
        }

        // MANETTE DROITE : Rotation et Altitude (Élévation sur l'axe Y)
        if (source.handedness === 'right') {
            // Rotation de la vue (joystick vers la gauche/droite)
            if (Math.abs(axeX) > deadzone) {
                dolly.rotation.y -= axeX * vitesseRotation * delta;
            }
            // Altitude (joystick vers l'avant/arrière)
            if (Math.abs(axeY) > deadzone) {
                // Remarque : pousser le joystick en avant donne une valeur axeY négative.
                // Soustraire cette valeur fait donc monter le Dolly.
                dolly.position.y -= axeY * vitesseDeplacement * delta;
            }
        }
    }
}

// ==========================================
// 5. BOUCLE D'ANIMATION GLOBALE
// ==========================================
renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();

    if (renderer.xr.isPresenting) {
        // Mode VR : Le casque gère la caméra locale, on déplace le Dolly avec les joysticks
        gererDeplacementVR(delta);
    } else {
        // Mode Écran (PC/Mobile)
        if (isOrbiting) {
            const vitesse = parseFloat(speedSlider.value);
            currentAngle += delta * vitesse;
            
            camera.position.set(
                centreOrbite.x + Math.cos(currentAngle) * currentOrbitRadius, 
                centreOrbite.y + currentOrbitHeight, 
                centreOrbite.z + Math.sin(currentAngle) * currentOrbitRadius
            );
            camera.lookAt(centreOrbite);
        } else {
            controls.update();
        }
    }

    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
