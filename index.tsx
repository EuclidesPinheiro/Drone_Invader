import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// --- Constantes do Jogo ---
const PROJECTILE_SPEED = 40;
const ENEMY_SPAWN_INTERVAL = 2000;
const ENEMY_SPEED = 3.5;

class NeonStrikeVR {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private clock: THREE.Clock;
    private enemyTemplate: THREE.Group | null = null; // Armazena o modelo carregado

    // Objetos de Jogo
    private controllers: THREE.Group[] = [];
    private projectiles: THREE.Mesh[] = [];
    private enemies: THREE.Group[] = [];
    private score: number = 0;
    private lastSpawnTime: number = 0;



    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x020205);
        this.scene.fog = new THREE.FogExp2(0x020205, 0.05);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1.6, 0); // Altura dos olhos

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        this.clock = new THREE.Clock();

        this.initEnvironment();
        this.initControllers();
        this.setupVR();

        window.addEventListener('resize', () => this.onWindowResize());
    }

    private initEnvironment() {
        // Iluminação
        const ambient = new THREE.AmbientLight(0x404040, 1);
        this.scene.add(ambient);

        const spot = new THREE.SpotLight(0x00ffff, 5);
        spot.position.set(0, 10, 0);
        this.scene.add(spot);

        // Chão Neon
        const grid = new THREE.GridHelper(200, 40, 0xff00ff, 0x111111);
        this.scene.add(grid);

        // Barreiras de fundo
        const boxGeo = new THREE.BoxGeometry(2, 10, 2);
        const boxMat = new THREE.MeshPhongMaterial({ color: 0x050505, emissive: 0x00ffff, emissiveIntensity: 0.1 });
        for (let i = 0; i < 20; i++) {
            const pillar = new THREE.Mesh(boxGeo, boxMat);
            const angle = (i / 20) * Math.PI * 2;
            pillar.position.set(Math.cos(angle) * 30, 5, Math.sin(angle) * 30);
            this.scene.add(pillar);
        }
    }

    private loadAssets() {
        const loader = new GLTFLoader();
        // O caminho é relativo à pasta public
        loader.load('/models/drone.glb', (gltf) => {
            const model = gltf.scene;

            // Ajuste de escala (modelos importados podem ser gigantes ou minusculos)
            model.scale.set(5.5, 5.5, 5.5);

            // Opcional: Adicionar material emissivo para brilhar no escuro (estilo Neon)
            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    // Preserva a textura original ou força um visual neon
                    mesh.material = new THREE.MeshPhongMaterial({
                        color: 0x111111,
                        emissive: 0xff0000, // Vermelho brilhante
                        emissiveIntensity: 1
                    });
                }
            });

            this.enemyTemplate = model; // Salva na memória
        });
    }

    private initControllers() {
        const onSelectStart = (event: any) => {
            const controller = event.target;
            this.fireBlaster(controller);
        };

        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            controller.addEventListener('selectstart', onSelectStart);
            this.scene.add(controller);
            this.controllers.push(controller);

            // Modelo da Arma (Blaster)
            const blasterGroup = new THREE.Group();

            const bodyGeo = new THREE.BoxGeometry(0.05, 0.08, 0.25);
            const bodyMat = new THREE.MeshPhongMaterial({ color: 0x222222, emissive: i === 0 ? 0x00ffff : 0xff00ff });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            blasterGroup.add(body);

            const barrelGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.1);
            const barrel = new THREE.Mesh(barrelGeo, bodyMat);
            barrel.rotation.x = Math.PI / 2;
            barrel.position.z = -0.15;
            blasterGroup.add(barrel);

            controller.add(blasterGroup);
        }
    }

    private fireBlaster(controller: THREE.Group) {
        // Criar projétil
        const projGeo = new THREE.SphereGeometry(0.03, 8, 8);
        const projMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const proj = new THREE.Mesh(projGeo, projMat);

        // Posicionamento preciso baseado no controlador
        const matrix = new THREE.Matrix4();
        matrix.extractRotation(controller.matrixWorld);

        const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(matrix);
        const position = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);

        proj.position.copy(position);
        proj.userData.velocity = direction.multiplyScalar(PROJECTILE_SPEED);
        proj.userData.life = 2.0; // segundos de vida

        this.projectiles.push(proj);
        this.scene.add(proj);

        // Feedback Háptico do Quest 3
        const session = this.renderer.xr.getSession();
        if (session) {
            const inputSource = session.inputSources[this.controllers.indexOf(controller)];
            if (inputSource?.gamepad?.hapticActuators) {
                inputSource.gamepad.hapticActuators[0].pulse(0.8, 50);
            }
        }
    }

    private spawnEnemy() {
        if (!this.enemyTemplate) return; // Se o modelo ainda não carregou, aborta

        const droneGroup = this.enemyTemplate.clone(); // Clona o modelo carregado

        // Posição aleatória (mantém sua lógica original)
        const angle = Math.random() * Math.PI * 2;
        const dist = 25 + Math.random() * 5;
        droneGroup.position.set(Math.cos(angle) * dist, 1 + Math.random() * 3, Math.sin(angle) * dist);

        // Importante: Manter a lógica de vida/colisão
        droneGroup.userData.health = 1;

        // Adiciona à lista de inimigos e à cena
        this.enemies.push(droneGroup);
        this.scene.add(droneGroup);
    }

    private speak(text: string) {
        console.log(`[AUDIO] ${text}`);
    }

    private setupVR() {
        document.body.appendChild(VRButton.createButton(this.renderer));
        const btn = document.getElementById('start-button');
        btn?.addEventListener('click', () => {
            document.getElementById('ui-overlay')!.style.display = 'none';
            document.getElementById('score-panel')!.style.display = 'block';
            this.speak("Sistemas online. Defenda a arena!");
        });
    }

    private update() {
        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();

        // Spawn Inimigos
        if (time - this.lastSpawnTime > (ENEMY_SPAWN_INTERVAL / 1000)) {
            this.spawnEnemy();
            this.lastSpawnTime = time;
            if (this.score % 10 === 0 && this.score > 0) this.speak("Múltiplos alvos detectados!");
        }

        // Atualizar Projéteis
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.position.add(p.userData.velocity.clone().multiplyScalar(delta));
            p.userData.life -= delta;

            if (p.userData.life <= 0) {
                this.scene.remove(p);
                this.projectiles.splice(i, 1);
                continue;
            }

            // Colisão com Inimigos
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                if (p.position.distanceTo(e.position) < 0.6) {
                    this.score += 10;
                    document.getElementById('score-val')!.innerText = this.score.toString();

                    this.scene.remove(e);
                    this.enemies.splice(j, 1);
                    this.scene.remove(p);
                    this.projectiles.splice(i, 1);
                    break;
                }
            }
        }

        // Atualizar Inimigos
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const toPlayer = new THREE.Vector3(0, 1.6, 0).sub(e.position).normalize();

            // Movimento levemente senoidal para dificultar o tiro
            const sineOffset = new THREE.Vector3(Math.sin(time * 2), Math.cos(time * 2), 0).multiplyScalar(0.01);
            e.position.add(toPlayer.multiplyScalar(ENEMY_SPEED * delta)).add(sineOffset);

            e.rotation.y += delta * 2;
            e.rotation.z += delta;

            // Se chegar muito perto, jogador "perde" pontos (simulação de dano)
            if (e.position.distanceTo(new THREE.Vector3(0, 1.6, 0)) < 1.5) {
                this.score = Math.max(0, this.score - 5);
                document.getElementById('score-val')!.innerText = this.score.toString();
                this.scene.remove(e);
                this.enemies.splice(i, 1);
                this.speak("Aviso: Perímetro violado!");
            }
        }
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    public animate() {
        this.renderer.setAnimationLoop(() => {
            this.update();
            this.renderer.render(this.scene, this.camera);
        });
    }
}

const game = new NeonStrikeVR();
game.animate();
