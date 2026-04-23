import * as THREE from 'three';
import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

// ==========================================
// 1. CONFIGURATION DE LA SCÈNE
// ==========================================
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 5000);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

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
        // 1. Lire le fichier JSON
        const response = await fetch('./models.json');
        const modelList = await response.json();

        // 2. Remplir le menu déroulant
        selectMenu.innerHTML = '';
        modelList.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.title;
            selectMenu.appendChild(option);
        });

        // 3. Écouter les changements du menu
        selectMenu.addEventListener('change', (e) => {
            chargerModele(e.target.value, modelList);
        });

        // 4. Charger le premier modèle par défaut
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

    // NETTOYAGE : Supprimer l'ancien modèle de la mémoire
    if (splatActuel !== null) {
        scene.remove(splatActuel);
        splatActuel.dispose(); 
    }

    // MISE À JOUR DES PARAMÈTRES
    centreOrbite.set(config.target.x, config.target.y, config.target.z);
    camera.position.set(config.cameraPos.x, config.cameraPos.y, config.cameraPos.z);
    controls.target.copy(centreOrbite);
    
    currentOrbitRadius = config.orbitRadius || 60;
    currentOrbitHeight = config.orbitHeight || 20;

    // CHARGEMENT DU NOUVEAU SPLAT
    splatActuel = new SplatMesh({ url: config.url });

    // APPLICATION DE LA ROTATION DYNAMIQUE
    if (config.rotation) {
        splatActuel.rotation.x = config.rotation.x || 0;
        splatActuel.rotation.y = config.rotation.y || 0;
        splatActuel.rotation.z = config.rotation.z || 0;
    } else {
        // Rotation par défaut si rien n'est précisé
        splatActuel.rotation.x = -Math.PI;
    }

    scene.add(splatActuel);

    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
    }, 2000);
}

// Lancement !
initGallery();

// ==========================================
// 3. LOGIQUE UI (INTERFACE)
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

// ==========================================
// OUTIL : RAYCASTER (DOUBLE CLIC POUR RECENTRER)
// ==========================================
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
            console.log("Nouveau centre :", nouveauCentre);
        }
    }
});

// ==========================================
// 4. BOUCLE D'ANIMATION
// ==========================================
renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();

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

    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
