// Script execution starting...
const scriptStartTimestamp = Date.now();

// Update visual loading status
const loadingStatus = document.getElementById('loading-status');
if (loadingStatus) loadingStatus.innerText = "Kaynaklar Yükleniyor...";

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const menuOverlay = document.getElementById('menu-overlay');
const healthBar = document.getElementById('health-bar');
const killCounter = document.getElementById('kill-counter');
const killFeed = document.getElementById('kill-feed');

// Game State
let gameRunning = false;
let kills = 0;
let lastTime = 0;

// Damage Tracking for Death Screen
let damageTakenFromCurrentKiller = 0;
let hitsTakenFromCurrentKiller = 0;
let damageDealtToCurrentKiller = 0;
let hitsDealtToCurrentKiller = 0;
let lastKillerName = "";
let lastKillerWeapon = "";
let lastKillerId = null;

// Player name is set via the HTML name screen (no prompt)
let playerName = '';
let deviceMode = 'PC'; // 'PC' or 'MOBILE'

// Auto-detect mobile based on screen width or user agent
if (window.innerWidth < 1024 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    deviceMode = 'MOBILE';
}

// Safe storage helper to prevent crashes in restricted environments
const safeStorage = {
    getItem: (key) => {
        try { return localStorage.getItem(key); }
        catch (e) { console.error("Storage access denied:", key); return null; }
    },
    setItem: (key, val) => {
        try { localStorage.setItem(key, val); }
        catch (e) { console.error("Storage write denied:", key); }
    },
    removeItem: (key) => {
        try { localStorage.removeItem(key); }
        catch (e) { console.error("Storage delete denied:", key); }
    }
};

// Ban System (5 Strikes = 30 Minutes Ban)
function checkBan() {
    const lowerName = playerName.toLowerCase();
    if (lowerName === 'miro' || lowerName === 'çaşo') return false;

    const banUntil = safeStorage.getItem('banUntil');
    if (banUntil) {
        const remaining = parseInt(banUntil) - Date.now();
        if (remaining > 0) {
            const minutes = Math.ceil(remaining / 60000);
            alert(`MAÇTAN ÇOK FAZLA ÇIKTIĞIN İÇİN ${minutes} DAKİKA CEZALISIN!`);
            return true;
        } else {
            // Ban expired, reset strikes
            safeStorage.removeItem('banUntil');
            safeStorage.setItem('leaveCount', '0');
        }
    }
    return false;
}

function recordLeave() {
    if (!gameRunning) return;

    // Ban bypass for specific names
    const lowerName = playerName.toLowerCase();
    if (lowerName === 'miro' || lowerName === 'çaşo') {
        console.log("Ban bypass active for dev/VIP name.");
        return;
    }

    let leaveCount = parseInt(safeStorage.getItem('leaveCount') || '0');
    leaveCount++;
    safeStorage.setItem('leaveCount', leaveCount.toString());

    if (leaveCount >= 5) {
        const banTime = Date.now() + (30 * 60 * 1000); // 30 minutes
        safeStorage.setItem('banUntil', banTime);
        safeStorage.setItem('leaveCount', '0'); // Reset after ban is applied
        alert("Üst üste 5 kez maçtan ayrıldın! 30 dakika boyunca yeni oyun açamazsın.");
    } else {
        alert(`Maçtan ayrıldın! (Uyarı: ${leaveCount}/5). 5 olunca 30 dakika ban yersin.`);
    }
}

// Visual & Audio State
const particles = [];
let screenShake = 0;
let audioCtx = null;

function initAudio() {
    try {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.warn("Audio Context could not be initialized:", e);
    }
}

function playSound(freq, type = 'square', duration = 0.1, volume = 0.1, slide = true) {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + duration);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

class Particle {
    constructor(x, y, color, speed, angle, friction = 0.95, gravity = 0) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.friction = friction;
        this.gravity = gravity;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
        this.radius = Math.random() * 3 + 1;
    }
    update() {
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        return this.life <= 0;
    }
    draw(offsetX, offsetY) {
        // Culling: Only draw if on screen
        if (this.x - offsetX < -50 || this.x - offsetX > canvas.width + 50 ||
            this.y - offsetY < -50 || this.y - offsetY > canvas.height + 50) return;

        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        // Optimization: Shadow removed for particles
        ctx.beginPath();
        ctx.arc(this.x - offsetX, this.y - offsetY, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function spawnParticles(x, y, color, count = 10, speed = 5) {
    if (particles.length > 150) return; // Hard cap on particles for performance
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color, Math.random() * speed + 2, Math.random() * Math.PI * 2));
    }
}



// World Settings
const WORLD_WIDTH = 1000;
const WORLD_HEIGHT = 1000;

// Player Settings
const WEAPON_IMAGES = {
    'STANDART': 'https://static.wikia.nocookie.net/cswiki/images/f/f0/P250_Skin_Sand_Dune.png',
    'SNIPER': 'https://www.csgotemp.com/img/weapons/awp.png',
    'MAKİNELİ': 'https://static.wikia.nocookie.net/cswiki/images/1/1b/Mp5sd_inventory.png',
    'AK-47': 'https://static.wikia.nocookie.net/cswiki/images/2/23/Ak47_inventory.png',
    'Tabanca': 'https://static.wikia.nocookie.net/cswiki/images/f/f0/P250_Sand_Dune.png'
};

const player = {
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
    radius: 20,
    color: '#00e5ff',
    speed: 3.5,
    health: 100,
    maxHealth: 100,
    angle: 0,
    teamId: 0, // User is always Team 0
    isDead: false,
    respawnTimer: 0,
    shieldTimer: 0, // In milliseconds
    weapon: null
};

const WEAPONS = {
    DEFAULT: {
        name: 'STANDART',
        damage: 25,
        fireRate: 500, // ms between shots
        bulletSpeed: 10,
        playerSpeed: 3.5,
        cost: 0
    },
    SNIPER: {
        name: 'SNIPER',
        damage: 120, // One shot kill usually
        fireRate: 2000,
        bulletSpeed: 25,
        playerSpeed: 2.2,
        cost: 10
    },
    MACHINE_GUN: {
        name: 'MAKİNELİ',
        damage: 10,
        fireRate: 150,
        bulletSpeed: 15,
        playerSpeed: 3.2,
        cost: 5
    },
    AK47: {
        name: 'AK-47',
        damage: 20,
        fireRate: 100,
        bulletSpeed: 18,
        playerSpeed: 3.4,
        cost: 0 // Exclusive to Lord
    },
    GOD_GUN: {
        name: 'TEK ATAN',
        damage: 9999,
        fireRate: 50,
        bulletSpeed: 30,
        playerSpeed: 5,
        cost: 0
    }
};

player.hasGoldPackage = false;
player.hasKingPackage = false;
player.hasLordPackage = false;
player.hasVIPPackage = false;
player.currentSlot = 1;
player.swingProgress = 0; // 0 to 1 for knife animation
let selectedMap = 'NORMAL';

let lastKnifeTime = 0;
let lastBombTime = 0;

let goldTrial = parseInt(safeStorage.getItem('goldTrial'));
if (isNaN(goldTrial)) {
    goldTrial = 2; // Initial 2 match trial
    safeStorage.setItem('goldTrial', goldTrial);
}

let totalPoints = parseInt(safeStorage.getItem('totalPoints')) || 0;
const WALLS = [
    // Outer boundary walls
    { x: 0, y: 0, w: 1000, h: 20 },
    { x: 0, y: 980, w: 1000, h: 20 },
    { x: 0, y: 0, w: 20, h: 1000 },
    { x: 980, y: 0, w: 20, h: 1000 },

    // Room 1: Top Left
    { x: 200, y: 0, w: 20, h: 200 },
    { x: 0, y: 200, w: 200, h: 20 },

    // Room 2: Center
    { x: 400, y: 400, w: 200, h: 20 }, // Top
    { x: 400, y: 580, w: 200, h: 20 }, // Bottom
    { x: 400, y: 400, w: 20, h: 60 }, // Left top
    { x: 400, y: 520, w: 20, h: 80 }, // Left bottom
    { x: 580, y: 400, w: 20, h: 60 }, // Right top
    { x: 580, y: 520, w: 20, h: 80 }, // Right bottom

    // Maze-like walls
    { x: 750, y: 150, w: 20, h: 500 },
    { x: 600, y: 750, w: 300, h: 20 },
    { x: 150, y: 600, w: 20, h: 300 },
    { x: 300, y: 300, w: 50, h: 50 } // A pillar
];

function checkWallCollision(x, y, radius) {
    for (const wall of WALLS) {
        const closestX = Math.max(wall.x, Math.min(x, wall.x + wall.w));
        const closestY = Math.max(wall.y, Math.min(y, wall.y + wall.h));
        const dx = x - closestX;
        const dy = y - closestY;
        const distSq = dx * dx + dy * dy;
        if (distSq < radius * radius) return true;
    }
    return false;
}

function resolveWallCollision(entity) {
    if (!entity) return;
    for (const wall of WALLS) {
        const closestX = Math.max(wall.x, Math.min(entity.x, wall.x + wall.w));
        const closestY = Math.max(wall.y, Math.min(entity.y, wall.y + wall.h));
        const dx = entity.x - closestX;
        const dy = entity.y - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq < entity.radius * entity.radius) {
            const dist = Math.sqrt(distSq);
            if (dist < 0.01) {
                entity.x += (entity.x < WORLD_WIDTH / 2) ? 2 : -2;
                continue;
            }
            const overlap = entity.radius - dist;
            entity.x += (dx / dist) * overlap;
            entity.y += (dy / dist) * overlap;
        }
    }
}

function getRandomSafePosition(radius) {
    let x, y;
    let attempts = 0;
    while (attempts < 500) {
        x = radius + 20 + Math.random() * (WORLD_WIDTH - radius * 2 - 40);
        y = radius + 20 + Math.random() * (WORLD_HEIGHT - radius * 2 - 40);
        if (!checkWallCollision(x, y, radius + 20)) {
            return { x, y };
        }
        attempts++;
    }
    // Fallback to a guaranteed safe spot (center of room 2)
    return { x: 500, y: 500 };
}
let selectedClass = 'DEFAULT';
player.weapon = WEAPONS[selectedClass];
player.speed = player.weapon.playerSpeed;

let lastShootTime = 0;

const TEAMS = [
    { id: 0, name: 'Kırmızı', color: '#ff3e3e', isEliminated: false },
    { id: 1, name: 'Mavi', color: '#00e5ff', isEliminated: false },
    { id: 2, name: 'Yeşil', color: '#00ff00', isEliminated: false },
    { id: 3, name: 'Altın', color: '#ffcc00', isEliminated: false },
    { id: 4, name: 'Mor', color: '#bf00ff', isEliminated: false }
];

// Keys
const keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// Mouse
const mouse = { x: 0, y: 0 };
window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

// Slot Switching
window.addEventListener('keydown', e => {
    if (['1', '2', '3', '4'].includes(e.key)) {
        player.currentSlot = parseInt(e.key);
        updateHUD();
    }
});

// Bots
const entities = [];
const NUM_BOTS = 14;
const RANKS = ['Asker', 'Onbaşı', 'Çavuş', 'Teğmen', 'Yüzbaşı', 'Binbaşı', 'Albay', 'Kral'];

class Bullet {
    constructor(x, y, angle, color, owner, teamId, damage = 25, speed = 10, ownerId = null) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = speed;
        this.damage = damage;
        this.color = color;
        this.owner = owner;
        this.teamId = teamId;
        this.ownerId = ownerId;
        this.radius = 4;
        this.distance = 0;
        this.maxDistance = 1000;
    }

    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.distance += this.speed;

        if (checkWallCollision(this.x, this.y, this.radius)) {
            return true; // Hit wall (mark for deletion)
        }
        return false;
    }

    draw(offsetX, offsetY) {
        // Culling
        if (this.x - offsetX < -20 || this.x - offsetX > canvas.width + 20 ||
            this.y - offsetY < -20 || this.y - offsetY > canvas.height + 20) return;

        ctx.beginPath();
        ctx.arc(this.x - offsetX, this.y - offsetY, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        // Optimization: Shadow removed for bullets
        ctx.closePath();
    }
}

const bullets = [];

class Bomb {
    constructor(x, y, angle, color, owner, teamId, ownerId = null) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 10;
        this.color = color;
        this.owner = owner;
        this.teamId = teamId;
        this.ownerId = ownerId;
        this.radius = 6;
        this.distance = 0;
        this.maxDistance = 300; // 30cm limit
        this.splashRadius = 120;
        this.splashDamage = 80;
    }

    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.distance += this.speed;

        if (this.distance >= this.maxDistance || checkWallCollision(this.x, this.y, this.radius)) {
            this.explode();
            return true; // Finished
        }
        return false;
    }

    explode() {
        if (explosions.length < 20) {
            explosions.push(new Explosion(this.x, this.y, this.color, this.splashRadius));
        }
        spawnParticles(this.x, this.y, '#ff9900', 30, 10);
        screenShake = Math.max(screenShake, 15);
        playSound(60, 'sawtooth', 0.5, 0.3); // Explosion sound

        // Splash damage to player
        if (player.teamId !== this.teamId && !player.isDead && player.shieldTimer <= 0) {
            const dist = Math.sqrt((this.x - player.x) ** 2 + (this.y - player.y) ** 2);
            if (dist < this.splashRadius) {
                player.health -= this.splashDamage * (1 - dist / this.splashRadius);
                if (player.health <= 0) {
                    player.health = 0;
                    player.isDead = true;
                    player.respawnTimer = 10000;
                    const killer = entities.find(e => e.id === this.ownerId);
                    lastKillerName = killer?.name || "Bilinmeyen";
                    lastKillerWeapon = "BOMBA";
                    lastKillerId = this.ownerId;
                    showDeathScreen();
                    addKillFeed(`${lastKillerName} seni BOMBA ile patlattı`);
                    checkTeamEliminated(player.teamId);
                }
                updateHUD();
            }
        }
        // Splash damage to bots
        entities.forEach(bot => {
            if (bot.isDead || bot.teamId === this.teamId || bot.shieldTimer > 0) return;
            const dist = Math.sqrt((this.x - bot.x) ** 2 + (this.y - bot.y) ** 2);
            if (dist < this.splashRadius) {
                bot.health -= this.splashDamage * (1 - dist / this.splashRadius);
                if (bot.health <= 0) {
                    if (this.owner === 'player') {
                        bot.health = 0; bot.isDead = true; bot.respawnTimer = 10000; checkTeamEliminated(bot.teamId);
                        kills++;
                        addKillFeed(`You bombed ${bot.name} with BOMBA`);
                    } else {
                        bot.health = 0; bot.isDead = true; bot.respawnTimer = 10000; checkTeamEliminated(bot.teamId);
                        const killer = entities.find(e => e.id === this.ownerId);
                        addKillFeed(`${killer?.name || 'Birisi'} ${bot.name} adlı oyuncuyu BOMBA ile patlattı`);
                    }
                    updateHUD();
                }
            }
        });
    }

    draw(offsetX, offsetY) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x - offsetX, this.y - offsetY, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Fuse indicator
        ctx.beginPath();
        ctx.moveTo(this.x - offsetX, this.y - offsetY - this.radius);
        ctx.lineTo(this.x - offsetX + 2, this.y - offsetY - this.radius - 4);
        ctx.strokeStyle = '#ff9900';
        ctx.stroke();
        ctx.restore();
    }
}

const bombs = [];

class Rocket {
    constructor(x, y, angle, color, owner, teamId, ownerId = null) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 15; // 50% faster than standard 10
        this.color = color;
        this.owner = owner;
        this.teamId = teamId;
        this.ownerId = ownerId;
        this.radius = 8;
        this.distance = 0;
        this.maxDistance = 1000;
        this.splashRadius = 150;
        this.splashDamage = 100;
    }

    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.distance += this.speed;
        if (this.distance > this.maxDistance || checkWallCollision(this.x, this.y, this.radius)) {
            this.explode();
            return true;
        }
        return false;
    }

    explode() {
        explosions.push(new Explosion(this.x, this.y, this.color, this.splashRadius));
        spawnParticles(this.x, this.y, '#ff4400', 40, 12);
        screenShake = Math.max(screenShake, 25);
        playSound(40, 'sawtooth', 0.7, 0.4); // Big explosion

        if (player.teamId !== this.teamId && !player.isDead && player.shieldTimer <= 0) {
            const dist = Math.sqrt((this.x - player.x) ** 2 + (this.y - player.y) ** 2);
            if (dist < this.splashRadius) {
                let damage = this.splashDamage * (1 - dist / this.splashRadius);
                if (player.hasLordPackage) damage *= 0.5; // Damage resistance
                player.health -= damage;
                if (player.health <= 0) {
                    player.health = 0;
                    player.isDead = true;
                    player.respawnTimer = 10000;
                    const killer = entities.find(e => e.id === this.ownerId);
                    lastKillerName = killer?.name || "Bilinmeyen";
                    lastKillerWeapon = "ROKET";
                    lastKillerId = this.ownerId;
                    showDeathScreen();
                    addKillFeed(`${lastKillerName} seni ROKET ile havaya uçurdu`);
                    checkTeamEliminated(player.teamId);
                }
                updateHUD();
            }
        }
        entities.forEach(bot => {
            if (bot.isDead || bot.teamId === this.teamId || bot.shieldTimer > 0) return;
            const dist = Math.sqrt((this.x - bot.x) ** 2 + (this.y - bot.y) ** 2);
            if (dist < this.splashRadius) {
                bot.health -= this.splashDamage * (1 - dist / this.splashRadius);
                if (bot.health <= 0) {
                    if (this.owner === 'player') {
                        bot.health = 0; bot.isDead = true; bot.respawnTimer = 10000; checkTeamEliminated(bot.teamId);
                        kills++;
                        addKillFeed(`You rocketed ${bot.name} with ROKET`);
                    } else {
                        bot.health = 0; bot.isDead = true; bot.respawnTimer = 10000; checkTeamEliminated(bot.teamId);
                        const killer = entities.find(e => e.id === this.ownerId);
                        addKillFeed(`${killer?.name || 'Birisi'} ${bot.name} adlı oyuncuyu ROKET ile havaya uçurdu`);
                    }
                    updateHUD();
                }
            }
        });
    }

    draw(offsetX, offsetY) {
        ctx.save();
        ctx.translate(this.x - offsetX, this.y - offsetY);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#555';
        ctx.fillRect(-10, -4, 20, 8);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(10, -4); ctx.lineTo(16, 0); ctx.lineTo(10, 4); ctx.fill();
        ctx.restore();
    }
}

const rockets = [];

class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // 'HEALTH', 'SHIELD', 'POINTS'
        this.radius = 15;
        this.life = 10000; // 10 seconds
        this.color = type === 'HEALTH' ? '#ff3e3e' : (type === 'SHIELD' ? '#00e5ff' : '#ffd700');
    }
    update(dt) {
        this.life -= dt;
        return this.life <= 0;
    }
    draw(offsetX, offsetY) {
        ctx.save();
        ctx.translate(this.x - offsetX, this.y - offsetY);
        ctx.rotate(Date.now() / 500);
        ctx.fillStyle = this.color;

        // Pulsing scale
        const s = 1 + Math.sin(Date.now() / 200) * 0.2;
        ctx.scale(s, s);

        ctx.beginPath();
        if (this.type === 'HEALTH') {
            ctx.rect(-8, -2, 16, 4);
            ctx.rect(-2, -8, 4, 16);
        } else if (this.type === 'SHIELD') {
            ctx.arc(0, 0, 10, 0, Math.PI * 2);
        } else {
            ctx.moveTo(0, -10);
            ctx.lineTo(8, 10);
            ctx.lineTo(-8, 10);
            ctx.closePath();
        }
        ctx.fill();
        ctx.restore();
    }
}
const powerups = [];

function spawnPowerUp(x, y) {
    const r = Math.random();
    let type = 'POINTS';
    if (r < 0.2) type = 'HEALTH';
    else if (r < 0.4) type = 'SHIELD';
    powerups.push(new PowerUp(x, y, type));
}

class Explosion {
    constructor(x, y, color, radius) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.maxRadius = radius;
        this.radius = 0;
        this.opacity = 1;
        this.finished = false;
    }

    update() {
        this.radius += (this.maxRadius - this.radius) * 0.1;
        this.opacity -= 0.05;
        if (this.opacity <= 0) {
            this.finished = true;
        }
    }

    draw(offsetX, offsetY) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x - offsetX, this.y - offsetY, this.radius, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(
            this.x - offsetX, this.y - offsetY, 0,
            this.x - offsetX, this.y - offsetY, this.radius
        );
        gradient.addColorStop(0, `rgba(255, 255, 0, ${this.opacity})`);
        gradient.addColorStop(0.5, `rgba(255, 69, 0, ${this.opacity * 0.8})`);
        gradient.addColorStop(1, `rgba(139, 0, 0, 0)`);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.restore();
    }
}

const explosions = [];



class Bot {
    constructor(teamId, id) {
        this.id = id;
        this.teamId = teamId;
        this.spawn();
        this.name = this.generateName();
        this.rank = RANKS[Math.floor(Math.random() * RANKS.length)];
        this.color = TEAMS[this.teamId].color;
    }

    spawn() {
        const pos = getRandomSafePosition(20);
        this.x = pos.x;
        this.y = pos.y;
        this.radius = 20;
        this.speed = 2 + Math.random() * 2;
        this.health = 100;
        this.isDead = false;
        this.respawnTimer = 0;
        this.shieldTimer = 3000; // 3 second spawn shield
        this.angle = Math.random() * Math.PI * 2;
        this.targetAngle = this.angle;
        this.state = 'PATROL'; // PATROL, CHASE, ATTACK
        this.shootTimer = 0;
        this.knifeTimer = 0;
        this.rocketTimer = 0;
        this.reactionTimer = 0;
        this.seesEnemy = false;
    }

    generateName() {
        const names = ['X-Warrior', 'Shadow', 'Destroyer', 'Rex', 'Omega', 'Viper', 'Ghost', 'Titan'];
        return names[Math.floor(Math.random() * names.length)] + '_' + Math.floor(Math.random() * 999);
    }

    update(deltaTime) {
        if (this.isDead) return;
        if (this.shieldTimer > 0) this.shieldTimer -= deltaTime;
        if (this.respawnTimer > 0) {
            this.respawnTimer -= deltaTime;
            if (this.respawnTimer <= 0) this.spawn();
            return;
        }

        let nearestEnemy = null;
        let minDist = 800; // Increased perception range

        // Bullet dodging
        let dodgeX = 0;
        let dodgeY = 0;
        bullets.forEach(b => {
            if (b.teamId === this.teamId) return;
            const dx = b.x - this.x;
            const dy = b.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 150) { // Increased dodge range
                // Perpendicular dodge
                const angle = b.angle + Math.PI / 2;
                dodgeX += Math.cos(angle) * 4; // Increased dodge speed
                dodgeY += Math.sin(angle) * 4;
            }
        });

        // Check player
        if (player.teamId !== this.teamId && !player.isDead) {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                nearestEnemy = player;
            }
        }

        // Check other bots
        entities.forEach(other => {
            if (other === this || other.teamId === this.teamId || other.isDead) return;
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                nearestEnemy = other;
            }
        });

        if (nearestEnemy) {
            if (!this.seesEnemy) {
                this.seesEnemy = true;
                this.reactionTimer = selectedMap === 'VIP' ? 100 : 300; // Faster reaction
            }

            this.state = 'ATTACK';
            this.targetAngle = Math.atan2(nearestEnemy.y - this.y, nearestEnemy.x - this.x);

            if (this.reactionTimer > 0) {
                this.reactionTimer -= deltaTime;
                // Still move but don't shoot yet
            }

            // Tactical movement: Maintain distance and move slightly sideways
            const isVipMap = selectedMap === 'VIP';
            const botSpeed = this.speed;

            const distToEnemy = minDist;

            // ... (rest of movement logic)
            if (distToEnemy < 200) {
                const moveX = -Math.cos(this.targetAngle) * botSpeed * 0.5;
                const moveY = -Math.sin(this.targetAngle) * botSpeed * 0.5;
                if (!checkWallCollision(this.x + moveX, this.y, this.radius)) this.x += moveX;
                if (!checkWallCollision(this.x, this.y + moveY, this.radius)) this.y += moveY;
            } else if (distToEnemy > 300) {
                const moveX = Math.cos(this.targetAngle) * botSpeed * 0.8;
                const moveY = Math.sin(this.targetAngle) * botSpeed * 0.8;
                if (!checkWallCollision(this.x + moveX, this.y, this.radius)) this.x += moveX;
                if (!checkWallCollision(this.x, this.y + moveY, this.radius)) this.y += moveY;
            }

            if (this.reactionTimer > 0) return; // Don't shoot during reaction time

            // Don't shoot at shielded targets
            if (nearestEnemy.shieldTimer > 0) return;

            // Fire rate adjustment
            let fireThreshold = 70; // Original-like speed for Normal map
            if (isVipMap) fireThreshold = 25; // Elite speed for VIP

            this.shootTimer++;
            this.knifeTimer++;
            this.rocketTimer++;

            // Accurate but slightly imperfect shooting
            const accuracyOffset = isVipMap ? 0.1 : 0.3; // VIP is 3x more accurate
            const shotAngle = this.targetAngle + (Math.random() - 0.5) * accuracyOffset;

            // Decision logic for VIP Bots
            if (isVipMap) {
                if (distToEnemy < 80 && this.knifeTimer > 40 && nearestEnemy.shieldTimer <= 0) {
                    // Knife Attack
                    let dmg = 100;
                    if (nearestEnemy === player) {
                        if (player.hasLordPackage) dmg *= 0.5;
                        player.health -= dmg;
                        updateHUD();
                        if (player.health <= 0) {
                            player.isDead = true;
                            player.respawnTimer = 10000;
                            checkTeamEliminated(player.teamId);
                        }
                    } else {
                        nearestEnemy.health -= dmg;
                        if (nearestEnemy.health <= 0) {
                            nearestEnemy.isDead = true;
                            nearestEnemy.respawnTimer = 10000;
                            addKillFeed(`${this.name}, ${nearestEnemy.name} adlı oyuncuyu BIÇAK ile eledi`);
                            checkTeamEliminated(nearestEnemy.teamId);
                        }
                    }
                    this.knifeTimer = 0;
                } else if (distToEnemy > 400 && this.rocketTimer > 120 && Math.random() < 0.2) {
                    // Rocket Attack
                    rockets.push(new Rocket(this.x, this.y, shotAngle, this.color, 'bot', this.teamId, this.id));
                    this.rocketTimer = 0;
                } else if (this.shootTimer > fireThreshold) {
                    // VIP Bot Shooting (Faster bullets)
                    bullets.push(new Bullet(this.x, this.y, shotAngle, this.color, 'bot', this.teamId, 25, 15, this.id));
                    this.shootTimer = 0;
                }
            } else {
                // Normal Bot Shooting (Original speed)
                if (this.shootThreshold || true) { // Reference bot fire logic
                    if (this.shootTimer > fireThreshold) {
                        bullets.push(new Bullet(this.x, this.y, shotAngle, this.color, 'bot', this.teamId, 25, 10, this.id));
                        this.shootTimer = 0;
                    }
                }
            }
        } else {
            this.state = 'PATROL';
            this.seesEnemy = false;
            if (Math.random() < 0.01) {
                this.targetAngle += (Math.random() - 0.5) * 2;
            }
        }

        // Smooth rotation interpolation
        let angleDiff = this.targetAngle - this.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        this.angle += angleDiff * 0.15;

        const botSpeed = this.speed * (deltaTime / 16.66); // Normalized to 60fps

        if (this.state === 'PATROL') {
            const moveX = Math.cos(this.angle) * botSpeed;
            const moveY = Math.sin(this.angle) * botSpeed;

            if (!checkWallCollision(this.x + moveX, this.y, this.radius)) {
                this.x += moveX;
            } else {
                this.targetAngle += Math.PI / 2;
            }
            if (!checkWallCollision(this.x, this.y + moveY, this.radius)) {
                this.y += moveY;
            } else {
                this.targetAngle += Math.PI / 2;
            }
        } else if (this.state === 'ATTACK') {
            // Tactical movement: Maintain distance and move slightly sideways
            const distToEnemy = Math.sqrt((nearestEnemy.x - this.x) ** 2 + (nearestEnemy.y - this.y) ** 2);
            let moveX = 0, moveY = 0;

            if (distToEnemy < 200) {
                moveX = -Math.cos(this.targetAngle) * botSpeed * 0.5;
                moveY = -Math.sin(this.targetAngle) * botSpeed * 0.5;
            } else if (distToEnemy > 350) {
                moveX = Math.cos(this.targetAngle) * botSpeed * 0.8;
                moveY = Math.sin(this.targetAngle) * botSpeed * 0.8;
            }

            // Side-stepping
            const sideAngle = this.targetAngle + Math.PI / 2;
            moveX += Math.cos(sideAngle) * Math.sin(Date.now() / 500) * botSpeed * 0.3;
            moveY += Math.sin(sideAngle) * Math.sin(Date.now() / 500) * botSpeed * 0.3;

            if (!checkWallCollision(this.x + moveX, this.y, this.radius)) this.x += moveX;
            if (!checkWallCollision(this.x, this.y + moveY, this.radius)) this.y += moveY;
        }

        // Apply dodge with wall checks
        if (!checkWallCollision(this.x + dodgeX * (deltaTime / 16), this.y, this.radius)) this.x += dodgeX * (deltaTime / 16);
        if (!checkWallCollision(this.x, this.y + dodgeY * (deltaTime / 16), this.radius)) this.y += dodgeY * (deltaTime / 16);

        // Bounds
        this.x = Math.max(this.radius, Math.min(WORLD_WIDTH - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(WORLD_HEIGHT - this.radius, this.y));

        resolveWallCollision(this);
    }

    draw(offsetX, offsetY) {
        if (this.isDead) return;

        // Culling
        if (this.x - offsetX < -100 || this.x - offsetX > canvas.width + 100 ||
            this.y - offsetY < -100 || this.y - offsetY > canvas.height + 100) return;

        ctx.save();
        ctx.translate(this.x - offsetX, this.y - offsetY);
        ctx.rotate(this.angle);

        // Body
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 🛡️ Pulse Shield Effect
        if (this.shieldTimer > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 5 + Math.sin(Date.now() / 100) * 3, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        // Gun
        ctx.fillStyle = '#333';
        ctx.fillRect(10, -5, 20, 10);

        ctx.restore();

        // Rank
        ctx.fillStyle = this.color;
        ctx.font = 'bold 10px Rajdhani';
        ctx.fillText(this.rank.toUpperCase(), this.x - offsetX, this.y - offsetY - 45);

        // Name
        ctx.fillStyle = '#fff';
        ctx.font = '12px Rajdhani';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, this.x - offsetX, this.y - offsetY - 30);
    }
}

// Init Bots
// 14 bots total. 
// Team 0 gets 2 bots (since player is Team 0)
// Teams 1-4 get 3 bots each.
for (let i = 0; i < NUM_BOTS; i++) {
    let teamId;
    if (i < 2) teamId = 0;
    else teamId = Math.floor((i - 2) / 3) + 1;
    entities.push(new Bot(teamId, `bot_${i}`));
}

function update(deltaTime, time) {
    if (!gameRunning) return;

    // Safety check for player position
    if (isNaN(player.x) || isNaN(player.y)) {
        console.error("Player coordinates are NaN! Resetting to center.");
        player.x = WORLD_WIDTH / 2;
        player.y = WORLD_HEIGHT / 2;
    }

    // Knife Animation update
    if (player.swingProgress > 0) {
        player.swingProgress += 0.15;
        if (player.swingProgress >= 1) player.swingProgress = 0;
    }

    if (player.shieldTimer > 0) player.shieldTimer -= deltaTime;
    // Player Respawn Logic
    if (player.isDead) {
        player.respawnTimer = Math.max(0, player.respawnTimer - deltaTime);

        // Update death screen timer if visible
        const timerUI = document.getElementById('respawn-timer-ui');
        if (timerUI) {
            if (TEAMS[player.teamId].isEliminated) {
                // Get the parent container (respawn-line) and set its text
                const respawnLine = timerUI.parentElement;
                if (respawnLine) respawnLine.innerText = "TAKIMIN ELENDİ!";
            } else {
                timerUI.innerText = Math.ceil(player.respawnTimer / 1000);
            }
        }

        if (player.respawnTimer <= 0 && !TEAMS[player.teamId].isEliminated) {
            player.isDead = false;
            player.health = player.maxHealth;
            const pos = getRandomSafePosition(player.radius);
            player.x = pos.x;
            player.y = pos.y;
            player.shieldTimer = 3000; // Shield on respawn

            // Reset damage tracking
            damageTakenFromCurrentKiller = 0;
            hitsTakenFromCurrentKiller = 0;
            damageDealtToCurrentKiller = 0;
            hitsDealtToCurrentKiller = 0;
            document.getElementById('death-screen')?.classList.add('hidden');
        }
    } else {
        if (player.shieldTimer > 0) player.shieldTimer -= deltaTime;
    }

    // Bot Respawn Logic
    entities.forEach(bot => {
        if (bot.isDead) {
            bot.respawnTimer -= deltaTime;
            if (bot.respawnTimer <= 0 && !TEAMS[bot.teamId].isEliminated) {
                bot.isDead = false;
                bot.health = 100;
                bot.spawn();
                bot.shieldTimer = 3000; // Shield on respawn
            }
        } else {
            if (bot.shieldTimer > 0) bot.shieldTimer -= deltaTime;
        }
    });

    // Player move
    if (!player.isDead) {
        const speed = player.weapon.playerSpeed;
        let moveX = 0;
        let moveY = 0;
        if (keys['w'] || keys['arrowup']) moveY -= speed;
        if (keys['s'] || keys['arrowdown']) moveY += speed;
        if (keys['a'] || keys['arrowleft']) moveX -= speed;
        if (keys['d'] || keys['arrowright']) moveX += speed;

        if (!checkWallCollision(player.x + moveX, player.y, player.radius)) player.x += moveX;
        if (!checkWallCollision(player.x, player.y + moveY, player.radius)) player.y += moveY;

        // Player bounds
        player.x = Math.max(0, Math.min(WORLD_WIDTH, player.x));
        player.y = Math.max(0, Math.min(WORLD_HEIGHT, player.y));

        // Player angle
        if (deviceMode === 'PC') {
            const screenX = canvas.width / 2;
            const screenY = canvas.height / 2;
            player.angle = Math.atan2(mouse.y - screenY, mouse.x - screenX);
        }
        resolveWallCollision(player);
    }

    // Update Entities (Autonomous)
    entities.forEach(bot => bot.update(deltaTime));

    // Update Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        if (b.update()) {
            bullets.splice(i, 1);
            continue;
        }

        if (b.distance > b.maxDistance) {
            bullets.splice(i, 1);
            continue;
        }

        // Collision Check (Player)
        if (!player.isDead && b.teamId !== player.teamId && player.shieldTimer <= 0) {
            const dx = b.x - player.x;
            const dy = b.y - player.y;
            if (Math.sqrt(dx * dx + dy * dy) < player.radius) {
                let damage = b.damage;
                if (player.hasLordPackage) damage *= 0.5;
                player.health -= damage;

                // Track damage for death screen (if bot killed player)
                const killerBot = entities.find(e => e.id === b.ownerId);
                if (killerBot) {
                    lastKillerName = killerBot.name;
                    lastKillerWeapon = killerBot.weapon?.name || "Tabanca";
                    lastKillerId = killerBot.id;
                    damageTakenFromCurrentKiller += damage;
                    hitsTakenFromCurrentKiller++;
                }

                spawnParticles(player.x, player.y, '#ff0000', 10);
                screenShake = Math.max(screenShake, 5);
                playSound(150, 'sine', 0.1, 0.1);
                bullets.splice(i, 1);
                updateHUD();
                if (player.health <= 0) {
                    player.health = 0;
                    player.isDead = true;
                    showDeathScreen();
                    addKillFeed(`${lastKillerName} seni ${lastKillerWeapon} ile eledi`);
                    checkTeamEliminated(player.teamId);
                }
                continue;
            }
        }

        // Check bot collisions
        for (let j = entities.length - 1; j >= 0; j--) {
            const bot = entities[j];
            if (bot.isDead || b.teamId === bot.teamId || bot.shieldTimer > 0) continue;

            const dx = b.x - bot.x;
            const dy = b.y - bot.y;
            const distSq = dx * dx + dy * dy;
            const combinedRadiusSq = bot.radius * bot.radius;

            if (distSq < combinedRadiusSq) {
                bot.health -= b.damage;

                // Track damage dealt by player
                if (b.owner === 'player') {
                    damageDealtToCurrentKiller += b.damage;
                    hitsDealtToCurrentKiller++;
                }

                const pCount = selectedMap === 'VIP' ? 4 : 8;
                spawnParticles(bot.x, bot.y, bot.color, pCount);
                playSound(200, 'sine', 0.1, 0.05);
                bullets.splice(i, 1);
                if (bot.health <= 0) {
                    bot.health = 0;
                    bot.isDead = true;
                    bot.respawnTimer = 10000;
                    spawnParticles(bot.x, bot.y, '#fff', 20, 8);
                    spawnPowerUp(bot.x, bot.y);
                    checkTeamEliminated(bot.teamId);

                    if (b.owner === 'player') {
                        kills++;
                        addKillFeed(`${bot.name} adlı oyuncuyu ${player.weapon.name} ile eledin`);
                    } else {
                        const killer = entities.find(e => e.id === b.ownerId);
                        const killerWeapon = killer?.weapon?.name || "Tabanca";
                        addKillFeed(`${killer?.name || 'Birisi'} ${bot.name} adlı oyuncuyu ${killerWeapon} ile eledi`);
                    }
                    updateHUD();
                }
                break;
            }
        }
    }

    // Update Bombs
    for (let i = bombs.length - 1; i >= 0; i--) {
        if (bombs[i].update()) {
            bombs.splice(i, 1);
        }
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].update()) {
            particles.splice(i, 1);
        }
    }

    // Update Powerups
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        if (p.update(deltaTime)) {
            powerups.splice(i, 1);
            continue;
        }
        if (!player.isDead) {
            const dx = p.x - player.x;
            const dy = p.y - player.y;
            if (Math.sqrt(dx * dx + dy * dy) < player.radius + p.radius) {
                if (p.type === 'HEALTH') {
                    player.health = Math.min(player.maxHealth, player.health + 30);
                    playSound(600, 'sine', 0.2, 0.1, false);
                } else if (p.type === 'SHIELD') {
                    player.shieldTimer = Math.max(player.shieldTimer, 5000);
                    playSound(800, 'sine', 0.2, 0.1, false);
                } else {
                    totalPoints += 5;
                    safeStorage.setItem('totalPoints', totalPoints);
                    playSound(1000, 'sine', 0.2, 0.1, false);
                }
                updateHUD();
                powerups.splice(i, 1);
            }
        }
    }

    if (screenShake > 0) screenShake *= 0.9;
    if (screenShake < 0.1) screenShake = 0;

    // Update Rockets
    for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        if (r.update()) {
            rockets.splice(i, 1);
            continue;
        }
        entities.forEach(bot => {
            if (bot.isDead || r.teamId === bot.teamId) return;
            const dist = Math.sqrt((r.x - bot.x) ** 2 + (r.y - bot.y) ** 2);
            if (dist < bot.radius) {
                r.explode();
                rockets.splice(i, 1);
            }
        });
    }

    // Update Explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].update();
        if (explosions[i].finished) {
            explosions.splice(i, 1);
        }
    }

    // Periodic Win Check (Every 1 second)
    if (gameRunning && Math.floor(time / 1000) !== Math.floor((time - deltaTime) / 1000)) {
        checkVictory();
    }
}

function checkVictory() {
    if (!gameRunning) return;

    // Count teams that have at least one member alive or respawning
    const activeTeams = TEAMS.filter(team => {
        if (team.isEliminated) return false;

        const hasAliveBot = entities.some(bot => bot.teamId === team.id && !bot.isDead);
        const hasAlivePlayer = (player.teamId === team.id && !player.isDead);
        const hasRespawningBot = entities.some(bot => bot.teamId === team.id && bot.respawnTimer > 0);
        const hasRespawningPlayer = (player.teamId === team.id && player.respawnTimer > 0);

        const isActuallyActive = hasAliveBot || hasAlivePlayer || hasRespawningBot || hasRespawningPlayer;

        if (!isActuallyActive && !team.isEliminated) {
            team.isEliminated = true;
            addKillFeed(`${team.name.toUpperCase()} TAKIMI ELENDİ!`);
            return false;
        }
        return true;
    });

    if (activeTeams.length === 1 && gameRunning) {
        victory(activeTeams[0].id);
    }
}

function checkTeamEliminated(teamId) {
    const isPlayerInTeam = player.teamId === teamId;
    const teamBots = entities.filter(e => e.teamId === teamId);

    const allDead = (isPlayerInTeam ? player.isDead : true) && teamBots.every(b => b.isDead);

    if (allDead) {
        TEAMS[teamId].isEliminated = true;
        addKillFeed(`${TEAMS[teamId].name.toUpperCase()} TAKIMI ELENDİ!`);

        // Check for winner
        const activeTeams = TEAMS.filter(t => !t.isEliminated);
        if (activeTeams.length === 1) {
            victory(activeTeams[0].id);
        } else if (isPlayerInTeam) {
            // Delay showing game over to allow death screen to be seen?
            // Actually, showDeathScreen is already called when health <= 0
        }
    }
}

function showDeathScreen() {
    const ds = document.getElementById('death-screen');
    if (!ds) return;

    const killerBot = entities.find(e => e.id === lastKillerId);
    const killerColor = killerBot ? killerBot.color : "#ff3e3e";
    const killerWeaponName = lastKillerWeapon || "Silah";

    document.getElementById('killer-name').innerText = lastKillerName || "Bilinmeyen";
    document.getElementById('killer-weapon-name').innerText = killerWeaponName;
    document.getElementById('stats-taken-hits').innerText = hitsTakenFromCurrentKiller;
    document.getElementById('stats-taken-dmg').innerText = Math.round(damageTakenFromCurrentKiller);
    document.getElementById('stats-dealt-hits').innerText = hitsDealtToCurrentKiller;
    document.getElementById('stats-dealt-dmg').innerText = Math.round(damageDealtToCurrentKiller);

    // Update Bars (capped at 100% width)
    const barTaken = document.getElementById('bar-taken');
    if (barTaken) barTaken.style.width = Math.min(100, (damageTakenFromCurrentKiller / 100) * 100) + '%';
    const barDealt = document.getElementById('bar-dealt');
    if (barDealt) barDealt.style.width = Math.min(100, (damageDealtToCurrentKiller / 100) * 100) + '%';

    // Weapon Image Mapping
    const weaponImg = document.getElementById('killer-weapon-img');
    if (weaponImg) {
        weaponImg.src = WEAPON_IMAGES[killerWeaponName] || WEAPON_IMAGES['STANDART'];
    }

    // Style adjustments
    const killerAvatar = document.querySelector('.killer-avatar img');
    if (killerAvatar) killerAvatar.style.borderColor = killerColor;

    ds.classList.remove('hidden');
}

function victory(winningTeamId) {
    gameRunning = false;
    const winningTeam = TEAMS[winningTeamId];

    // Award points if player team wins
    if (winningTeamId === player.teamId) {
        totalPoints += 3;
        safeStorage.setItem('totalPoints', totalPoints);
    }

    menuOverlay.classList.remove('hidden');

    const isPlayerWin = winningTeamId === player.teamId;

    menuOverlay.innerHTML = `
         <h1 class="menu-title" style="background: linear-gradient(180deg, #fff, #ffd700); text-shadow: 0 0 30px rgba(255, 215, 0, 0.6);">
             ${isPlayerWin ? 'OYUNU KAZANDINIZ!' : 'MAÇ BİTTİ'}
         </h1>
        <div class="menu-info">
            <p style="color: ${winningTeam.color}; font-size: 2rem;">
                ${winningTeam.name.toUpperCase()} TAKIMI KAZANDI!
            </p>
            <p>Skorun: ${kills} Leş</p>
        </div>
        <button id="restart-btn" class="premium-btn" style="background: linear-gradient(135deg, #ffd700, #b8860b); color: #000;">
            YENİDEN OYNA
        </button>
    `;
    document.getElementById('restart-btn').onclick = () => location.reload();
}

function draw() {
    if (!ctx) return;

    // Force internal buffer consistency with DOM size
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    const cw = canvas.width;
    const ch = canvas.height;

    if (cw === 0 || ch === 0) return; // Cannot draw on 0-size canvas

    // Reset Context State
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;

    // Clear and background
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#0a0a0c'; // Matched with body bg
    ctx.fillRect(0, 0, cw, ch);

    // Draw subtle dark world background
    ctx.fillStyle = '#16161a';
    ctx.fillRect(0, 0, cw, ch);

    const isMobile = deviceMode === 'MOBILE';
    const zoom = isMobile ? 1.3 : 1.0;

    // Safety: ensure coordinates are valid before calculating offsets
    const px = isNaN(player.x) ? WORLD_WIDTH / 2 : player.x;
    const py = isNaN(player.y) ? WORLD_HEIGHT / 2 : player.y;

    const offsetX = px - (cw / (2 * zoom)) + (Math.random() - 0.5) * screenShake;
    const offsetY = py - (ch / (2 * zoom)) + (Math.random() - 0.5) * screenShake;

    ctx.save();
    // Centered scaling for mobile
    if (isMobile) {
        const cx = cw / 2;
        const cy = ch / 2;
        ctx.translate(cx, cy);
        ctx.scale(zoom, zoom);
        ctx.translate(-cx, -cy);
    }

    const isVipMap = selectedMap === 'VIP';

    // Optimize Grid Rendering: Only draw visible lines and stroke ONCE
    ctx.strokeStyle = isVipMap ? 'rgba(191, 0, 255, 0.15)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const startX = Math.max(0, Math.floor(offsetX / 100) * 100);
    const endX = Math.min(WORLD_WIDTH, offsetX + canvas.width + 100);
    const startY = Math.max(0, Math.floor(offsetY / 100) * 100);
    const endY = Math.min(WORLD_HEIGHT, offsetY + canvas.height + 100);

    for (let x = startX; x <= endX; x += 100) {
        ctx.moveTo(x - offsetX, Math.max(0, startY - offsetY));
        ctx.lineTo(x - offsetX, Math.min(canvas.height, endY - offsetY));
    }
    for (let y = startY; y <= endY; y += 100) {
        ctx.moveTo(Math.max(0, startX - offsetX), y - offsetY);
        ctx.lineTo(Math.min(canvas.width, endX - offsetX), y - offsetY);
    }
    ctx.stroke();

    // Draw Walls Optimized
    ctx.fillStyle = isVipMap ? '#2b00ff' : '#2c3e50';
    ctx.strokeStyle = isVipMap ? '#6a00ff' : '#34495e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (const wall of WALLS) {
        if (wall.x + wall.w < offsetX - 20 || wall.x > offsetX + canvas.width + 20 ||
            wall.y + wall.h < offsetY - 20 || wall.y > offsetY + canvas.height + 20) continue;

        ctx.fillRect(wall.x - offsetX, wall.y - offsetY, wall.w, wall.h);
        ctx.rect(wall.x - offsetX, wall.y - offsetY, wall.w, wall.h);
    }
    ctx.stroke();

    // Draw Bullets
    bullets.forEach(b => b.draw(offsetX, offsetY));

    // Draw Rockets
    rockets.forEach(r => r.draw(offsetX, offsetY));

    // Draw Bombs
    bombs.forEach(b => b.draw(offsetX, offsetY));

    // Draw Explosions
    explosions.forEach(e => e.draw(offsetX, offsetY));

    // Draw Particles
    particles.forEach(p => p.draw(offsetX, offsetY));

    // Draw PowerUps
    powerups.forEach(p => p.draw(offsetX, offsetY));

    // Draw Bots
    entities.forEach(bot => bot.draw(offsetX, offsetY));

    // Draw Player
    if (!player.isDead) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(player.angle);

        ctx.shadowBlur = 0;
        ctx.fillStyle = TEAMS[player.teamId].color;

        ctx.beginPath();
        ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 🎖️ Player Ranks (if 30+ points)
        const lowerPlayerName = playerName.toLowerCase();
        if (totalPoints >= 30 && lowerPlayerName !== 'miro' && lowerPlayerName !== 'çaşo') {
            let rank = 'Asker';
            if (totalPoints >= 60) rank = 'Onbaşı';
            if (totalPoints >= 100) rank = 'Çavuş';
            if (totalPoints >= 150) rank = 'Teğmen';
            if (totalPoints >= 210) rank = 'Yüzbaşı';
            if (totalPoints >= 300) rank = 'Binbaşı';
            if (totalPoints >= 400) rank = 'Albay';
            if (totalPoints >= 500) rank = 'Kral';

            ctx.restore();
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.fillStyle = TEAMS[player.teamId].color;
            ctx.font = 'bold 12px Rajdhani';
            ctx.textAlign = 'center';
            ctx.fillText(rank.toUpperCase(), 0, -50);
            ctx.restore();
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(player.angle);
        }

        // 🛡️ Pulse Shield Effect
        if (player.shieldTimer > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, player.radius + 5 + Math.sin(Date.now() / 100) * 3, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        // Player gun
        ctx.fillStyle = '#fff';
        ctx.fillRect(15, -4, 25, 8);

        // Knife Swing Animation
        if (player.swingProgress > 0) {
            ctx.restore(); // Exit rotated state to draw relative to player position but with custom arc
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);

            const startAngle = player.angle - Math.PI / 3;
            const endAngle = player.angle + Math.PI / 3;
            const currentArc = startAngle + (endAngle - startAngle) * player.swingProgress;

            ctx.beginPath();
            ctx.arc(0, 0, 80, startAngle, currentArc);
            ctx.strokeStyle = `rgba(0, 229, 255, ${1 - player.swingProgress})`;
            ctx.lineWidth = 15;
            ctx.lineCap = 'round';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 0, 80, startAngle, currentArc);
            ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - player.swingProgress) * 0.5})`;
            ctx.lineWidth = 5;
            ctx.stroke();
        }

        ctx.restore();

        ctx.shadowBlur = 0; // Clear player glow

        const lowerName = playerName.toLowerCase();
        let roleText = "";
        let roleColor = "#fff";
        if (lowerName === "çaşo") {
            roleText = "👑 KURUCU";
            roleColor = "#ff3e3e";
        } else if (lowerName === "miro") {
            roleText = "🛡️ MODERATÖR";
            roleColor = "#ffd700";
        }

        if (roleText) {
            ctx.fillStyle = roleColor;
            ctx.font = 'bold 13px Rajdhani';
            ctx.textAlign = 'center';
            ctx.fillText(roleText, canvas.width / 2, canvas.height / 2 - 55);
        }

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Rajdhani';
        ctx.textAlign = 'center';
        ctx.fillText(playerName, canvas.width / 2, canvas.height / 2 - 40);

        ctx.fillStyle = TEAMS[player.teamId].color;
        ctx.font = '12px Rajdhani';
        ctx.fillText(TEAMS[player.teamId].name.toUpperCase() + " TAKIMI", canvas.width / 2, canvas.height / 2 - 25);
    } else {
        // Draw Respawn Timer
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Rajdhani';
        ctx.textAlign = 'center';
        ctx.fillText(`CANLANMA: ${Math.ceil(player.respawnTimer / 1000)}s`, canvas.width / 2, canvas.height / 2);
    }

    // Ensure no neon/colored shadows leak into the fog
    ctx.shadowBlur = 0;


    if (player.hasLordPackage && gameRunning) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, canvas.width);
        grad.addColorStop(0, 'rgba(255, 215, 0, 0)');
        grad.addColorStop(1, 'rgba(255, 215, 0, 0.08)');
        ctx.fillStyle = grad;
        ctx.fillRect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
        ctx.restore();
    }

    ctx.restore(); // Restore the global zoom/translate
}

function getPlayerRank() {
    const lowerName = playerName.toLowerCase();
    if (lowerName === "çaşo") return "👑 KURUCU";
    if (lowerName === "miro") return "🛡️ MODERATÖR";

    if (totalPoints >= 30) {
        if (totalPoints >= 500) return 'KRAL';
        if (totalPoints >= 400) return 'ALBAY';
        if (totalPoints >= 300) return 'BİNBAŞI';
        if (totalPoints >= 210) return 'YÜZBAŞI';
        if (totalPoints >= 150) return 'TEĞMEN';
        if (totalPoints >= 100) return 'ÇAVUŞ';
        if (totalPoints >= 60) return 'ONBAŞI';
        return 'ASKER';
    }
    return 'ACEMİ';
}

function updateHUD() {
    if (healthBar) healthBar.style.width = player.health + '%';
    if (killCounter) killCounter.innerText = `Kills: ${kills}`;

    const pointsSpan = document.getElementById('total-points');
    if (pointsSpan) pointsSpan.innerText = totalPoints;
    const storePointsSpan = document.getElementById('current-tl');
    if (storePointsSpan) storePointsSpan.innerText = totalPoints;

    const currentRank = getPlayerRank();
    const rankDisplay = document.getElementById('rank-display-menu');
    if (rankDisplay) rankDisplay.innerText = currentRank;
    const storeRankDisplay = document.getElementById('store-rank-display');
    if (storeRankDisplay) storeRankDisplay.innerText = currentRank;

    const lowerName = (playerName || "").toLowerCase();
    const isGod = (lowerName === 'miro' || lowerName === 'çaşo');

    const godBtn = document.getElementById('god-gun-btn');
    if (godBtn) {
        if (lowerName === 'çaşo') godBtn.classList.remove('hidden');
        else godBtn.classList.add('hidden');
    }

    // Refresh class availability
    document.querySelectorAll('.class-btn').forEach(btn => {
        const type = btn.dataset.class;
        const weapon = WEAPONS[type];

        if (isGod) {
            btn.classList.remove('locked');
        } else if (weapon && totalPoints < weapon.cost) {
            btn.classList.add('locked');
        } else {
            btn.classList.remove('locked');
        }
    });

    // Update Inventory HUD
    const slots = document.querySelectorAll('.slot');
    slots.forEach(slot => {
        const slotId = parseInt(slot.dataset.slot);
        slot.classList.toggle('active', player.currentSlot === slotId);

        let locked = false;
        if (!isGod) {
            if (slotId === 2) {
                locked = !(player.hasGoldPackage || goldTrial > 0 || player.hasLordPackage);
                if (goldTrial > 0 && !player.hasGoldPackage && !player.hasLordPackage) {
                    slot.querySelector('.label').innerText = `BIÇAK (${goldTrial})`;
                } else {
                    slot.querySelector('.label').innerText = `BIÇAK`;
                }
            } else if (slotId === 3) {
                locked = !(player.hasKingPackage || player.hasLordPackage);
            } else if (slotId === 4) {
                locked = !player.hasLordPackage;
            }
        }

        slot.classList.toggle('locked', locked);
    });

    // Update Team Status
    const teamStatusDiv = document.getElementById('team-status');
    if (teamStatusDiv) {
        teamStatusDiv.innerHTML = TEAMS.map(team => {
            if (team.isEliminated) return '';
            const aliveCount = (player.teamId === team.id && !player.isDead ? 1 : 0) +
                entities.filter(bot => bot.teamId === team.id && !bot.isDead).length;

            if (aliveCount === 0) return '';

            return `
                <div class="team-info" style="color: ${team.color}">
                    <span>${team.name.toUpperCase()}</span>
                    <span class="team-count">${aliveCount} KİŞİ</span>
                </div>
            `;
        }).join('');
    }
}

function addKillFeed(msg) {
    const div = document.createElement('div');
    div.className = 'kill-msg';
    div.innerText = msg;
    killFeed.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function gameOver() {
    gameRunning = false;
    menuOverlay.innerHTML = `
        <h1 class="menu-title">YENİLDİN!</h1>
        <div class="menu-info">
            <p>Skorun: ${kills} Leş</p>
        </div>
        <button id="restart-btn" class="premium-btn">YENİDEN DENE</button>
    `;
    document.getElementById('restart-btn').onclick = () => location.reload();
}

let debugError = "";

let lastLogTime = 0;
let loopCount = 0;

function loop(time) {
    if (!time) time = performance.now();
    if (loopCount === 0) console.log("First Loop Frame at:", time);
    loopCount++;

    if (lastTime === 0) lastTime = time;
    const deltaTime = Math.min(time - lastTime, 100);
    lastTime = time;

    try {
        update(deltaTime, time);
        draw();

        // Final Screen-Space Draw (Bypassing all transforms)
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Heartbeat indicator (Screen coordinate 10, 10)
        ctx.fillStyle = (Math.floor(time / 500) % 2 === 0) ? '#00ff00' : '#ffff00';
        ctx.fillRect(10, 10, 8, 8);

        // Debug Text
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.fillText(`C: ${canvas.width}x${canvas.height} | P: ${Math.floor(player.x)},${Math.floor(player.y)}`, 25, 18);

        debugError = "";
    } catch (e) {
        debugError = e.stack || e.message;
        console.error("Frame Crash:", e);
    }

    if (debugError) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff0000';
        ctx.font = '14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText("CRITICAL ERROR (GAME STOPPED):", 20, 40);
        ctx.fillStyle = '#ffffff';
        const lines = debugError.split('\n').slice(0, 20);
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], 20, 70 + i * 20);
        }
        // Don't recurse if there's a fatal persistent error to save CPU
        // return; 
    }

    requestAnimationFrame(loop);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Safety check for mobile browsers that report 0 height during transitions
    if (canvas.width === 0 || canvas.height === 0) {
        setTimeout(resize, 100);
        return;
    }

    // Ensure the scroll is at top to fix "pushed up" layout on mobile
    window.scrollTo(0, 0);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// Note: selectedMap is already declared at the top as 'NORMAL'

updateHUD();


startBtn.onclick = () => {
    if (checkBan()) return;

    // Check if player has enough points for their weapon
    if (totalPoints < player.weapon.cost) {
        alert("Bu silah için yeterli puanın yok!");
        return;
    }

    if (player.hasLordPackage || player.hasVIPPackage) {
        // Show map choice
        startBtn.classList.add('hidden');
        document.getElementById('map-selection').classList.remove('hidden');
    } else {
        selectedMap = 'NORMAL';
        startGame();
    }
};

document.querySelectorAll('.map-btn').forEach(btn => {
    btn.onclick = () => {
        selectedMap = btn.dataset.map;
        document.getElementById('map-selection').classList.add('hidden');
        document.getElementById('start-btn').classList.remove('hidden');
        startGame();
    };
});

function startGame() {
    try {
        if (gameRunning) {
            console.warn("startGame called while already running - ignoring.");
            return;
        }
        console.log("--- startGame Sequence Initialized ---");

        gameRunning = true;
        selectedMap = (player.hasLordPackage || player.hasVIPPackage) ? selectedMap : 'NORMAL';
        console.log("Selected Map:", selectedMap);

        if (menuOverlay) menuOverlay.classList.add('hidden');

        // Show HUD
        const hudOverlay = document.getElementById('hud-overlay');
        if (hudOverlay) {
            hudOverlay.classList.remove('hidden');
            console.log("HUD Shown.");
        }

        // Show mobile controls only on mobile
        const mobileCtrls = document.getElementById('mobile-controls');
        if (mobileCtrls) {
            if (deviceMode === 'MOBILE') {
                mobileCtrls.classList.remove('hidden');
                console.log("Mobile Controls Shown.");
            } else {
                mobileCtrls.classList.add('hidden');
            }
        }

        // Update controls hint text
        const hint = document.getElementById('controls-hint');
        if (hint) {
            hint.innerHTML = deviceMode === 'MOBILE'
                ? '<p>Sol Joystick: Hareket | Sağ Butonlar: Ateş/Bıçak/Bomba/Roket</p>'
                : '<p>WASD: Hareket | Mouse: Nişan | Sol Tık: Ateş</p>';
        }

        initAudio();
        player.shieldTimer = 3000;
        lastTime = 0;
        loopCount = 0; // Reset loop log counter

        updateHUD();
        resize();
        window.scrollTo(0, 0);

        // Initial Team Scrub
        setTimeout(() => {
            try {
                console.log("Performing initial team scrub...");
                for (let i = 0; i < TEAMS.length; i++) {
                    const teamBots = entities.filter(b => b.teamId === i);
                    const isPlayerInTeam = player.teamId === i;
                    if (teamBots.length === 0 && !isPlayerInTeam) {
                        TEAMS[i].isEliminated = true;
                    }
                }
                checkVictory();
            } catch (e) {
                console.error("Delayed Team Scrub Error:", e);
            }
        }, 500);

        console.log("Requesting first animation frame...");
        requestAnimationFrame(loop);
    } catch (e) {
        console.error("FATAL START ERROR:", e);
        alert("Oyun başlatılamadı! Lütfen konsoldaki hatayı kontrol edin.");
        if (menuOverlay) menuOverlay.classList.remove('hidden');
        gameRunning = false;
    }
}

const emperorBtn = document.getElementById('emperor-btn');
const emperorModal = document.getElementById('emperor-modal');
const closeBtn = document.querySelector('.close-btn');

if (emperorBtn && emperorModal) {
    emperorBtn.onclick = () => {
        emperorModal.classList.remove('hidden');
    };
}

// Final Robust Close Modal Logic
const finalCloseBtn = document.getElementById('close-modal');
if (finalCloseBtn) {
    finalCloseBtn.onclick = () => {
        if (emperorModal) emperorModal.classList.add('hidden');
    };
}

window.onclick = (event) => {
    if (event.target == emperorModal) {
        emperorModal.classList.add('hidden');
    }
};

document.querySelectorAll('.buy-btn').forEach(btn => {
    btn.onclick = () => {
        const pkgName = btn.parentElement.querySelector('h3').innerText;
        const pkgType = btn.dataset.package;
        let price = 0;

        if (pkgType === 'gold') price = 50;
        else if (pkgType === 'king') price = 100;
        else if (pkgType === 'lord') price = 500;
        else if (pkgType === 'vip') price = 750;

        // Apply VIP discount (25%) on Gold and King
        if (player.hasVIPPackage && (pkgType === 'gold' || pkgType === 'king')) {
            price *= 0.75;
            alert(`VIP İNDİRİMİ UYGULANDI! Yeni Fiyat: ${price.toFixed(2)} TL`);
        }

        if (pkgType === 'gold') {
            player.hasGoldPackage = true;
            alert(`${pkgName} AKTİF! Artık BIÇAK kullanabilirsin.`);
        } else if (pkgType === 'king') {
            player.hasKingPackage = true;
            alert(`${pkgName} AKTİF! Artık BOMBA kullanabilirsin.`);
        } else if (pkgType === 'lord') {
            player.hasLordPackage = true;
            alert(`${pkgName} AKTİF! Efsanevi güçlerin ve AK-47 hazır!`);
        } else if (pkgType === 'vip') {
            player.hasVIPPackage = true;
            alert(`${pkgName} AKTİF! Artık indirimlerden ve VIP haritadan yararlanabilirsin.`);
        } else {
            alert(`${pkgName} satın alma sistemi şu an bakımda! Lütfen daha sonra tekrar deneyiniz.`);
        }
        updateHUD();
    };
});

// Class Selection Logic
document.querySelectorAll('.class-btn').forEach(btn => {
    btn.onclick = () => {
        const type = btn.dataset.class;
        const weapon = WEAPONS[type];

        const lowerName = (playerName || "").toLowerCase();
        const isGod = (lowerName === 'miro' || lowerName === 'çaşo');

        if (totalPoints >= weapon.cost || isGod) {
            selectedClass = type;
            player.weapon = weapon;
            player.speed = weapon.playerSpeed;

            document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        } else {
            alert(`Bu sınıfı açmak için ${weapon.cost} puan gerekiyor! Şuan ${totalPoints} puanın var.`);
        }
    };
});


function useKnife() {
    if (!gameRunning || player.isDead) return;
    const isGod = (playerName.toLowerCase() === 'miro' || playerName.toLowerCase() === 'çaşo');
    const hasEffect = player.hasGoldPackage || (goldTrial > 0) || player.hasLordPackage || isGod;
    if (!hasEffect) return;

    const now = Date.now();
    if (now - lastKnifeTime < 1000) return;
    lastKnifeTime = now;
    player.swingProgress = 0.01;

    entities.forEach(bot => {
        if (bot.isDead || bot.shieldTimer > 0) return;
        const dx = bot.x - player.x;
        const dy = bot.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100 + bot.radius) {
            let dmg = 100;
            if (player.hasLordPackage) dmg *= 1.5; // Damage boost

            bot.health -= dmg;
            if (bot.health <= 0) {
                bot.health = 0;
                bot.isDead = true;
                bot.respawnTimer = 10000;
                kills++;
                updateHUD();
                addKillFeed(`${bot.name} adlı oyuncuyu BIÇAK ile eledin`);
                checkTeamEliminated(bot.teamId);
            }
        }
    });
}

function useBomb() {
    if (!gameRunning || player.isDead) return;
    const isGod = (playerName.toLowerCase() === 'miro' || playerName.toLowerCase() === 'çaşo');
    if (!player.hasKingPackage && !player.hasLordPackage && !isGod) return;
    const now = Date.now();
    if (now - lastBombTime < 3000) return;
    lastBombTime = now;
    const b = new Bomb(player.x, player.y, player.angle, TEAMS[player.teamId].color, 'player', player.teamId, 'player');
    bombs.push(b);
}

function useRocket() {
    const isGod = (playerName.toLowerCase() === 'miro' || playerName.toLowerCase() === 'çaşo');
    if (!gameRunning || player.isDead || (!player.hasLordPackage && !isGod)) return;
    const now = Date.now();
    const fireRate = 1200; // Fast rockets
    if (now - lastShootTime < fireRate) return;
    lastShootTime = now;
    const r = new Rocket(player.x, player.y, player.angle, TEAMS[player.teamId].color, 'player', player.teamId, 'player');
    rockets.push(r);
}

// Knife Attack Logic (Right Click Shortcut)
window.addEventListener('contextmenu', e => {
    e.preventDefault();
    useKnife();
});

// Bomb Throw Logic (G Shortcut)
window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'g') {
        useBomb();
    }
});

window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only Left Click
    if (!gameRunning || player.isDead) return;

    if (player.currentSlot === 1) {
        let weapon = player.weapon;
        if (player.hasLordPackage && weapon !== WEAPONS.GOD_GUN) {
            weapon = WEAPONS.AK47; // Forced AK47 boost (unless they have GOD_GUN)
        }

        const now = Date.now();
        if (now - lastShootTime >= weapon.fireRate) {
            let dmg = weapon.damage;
            if (player.hasLordPackage) dmg *= 1.5; // Damage boost

            const b = new Bullet(
                player.x,
                player.y,
                player.angle,
                TEAMS[player.teamId].color,
                'player',
                player.teamId,
                dmg,
                weapon.bulletSpeed,
                'player'
            );
            if (bullets.length < 100) bullets.push(b);
            playSound(400 + Math.random() * 100, 'square', 0.05, 0.05, false); // Shoot sound
            lastShootTime = now;
        }
    } else if (player.currentSlot === 2) {
        useKnife();
    } else if (player.currentSlot === 3) {
        useBomb();
    } else if (player.currentSlot === 4) {
        useRocket();
    }
});


window.onbeforeunload = () => {
    recordLeave();
};

// NOTE: requestAnimationFrame(loop) is called inside startGame(), not here.
// The game loop must NOT start before the player clicks play.
updateHUD();

// ===================== NAME SCREEN & DEVICE SELECTION =====================
function selectDevice(mode) {
    deviceMode = mode;
    const btnPc = document.getElementById('btn-pc');
    const btnMob = document.getElementById('btn-mobile');
    if (btnPc) btnPc.classList.toggle('active', mode === 'PC');
    if (btnMob) btnMob.classList.toggle('active', mode === 'MOBILE');
}

function openDeviceMenu() {
    document.getElementById('name-screen').classList.remove('hidden');
    document.getElementById('menu-overlay').classList.add('hidden');
    // If name screen is opened while game is running, we might want to pause or just overlay it.
    // Given the current architecture, overlaying is safest.
}

function confirmName() {
    const input = document.getElementById('name-input');
    playerName = input.value.trim() || 'Lord_' + Math.floor(Math.random() * 999);
    safeStorage.setItem('playerName', playerName);

    document.getElementById('name-screen').classList.add('hidden');

    // Ban check
    if (checkBan()) return;

    if (!gameRunning) {
        document.getElementById('menu-overlay').classList.remove('hidden');
    } else {
        // If game is running, update the UI for the new device mode
        const mobileCtrls = document.getElementById('mobile-controls');
        if (mobileCtrls) {
            if (deviceMode === 'MOBILE') {
                mobileCtrls.classList.remove('hidden');
            } else {
                mobileCtrls.classList.add('hidden');
            }
        }

        const hint = document.getElementById('controls-hint');
        if (hint) {
            hint.innerHTML = deviceMode === 'MOBILE'
                ? '<p>Sol Joystick: Hareket | Sağ Butonlar: Ateş/Bıçak/Bomba/Roket</p>'
                : '<p>WASD: Hareket | Mouse: Nişan | Sol Tık: Ateş</p>';
        }
    }
    updateHUD();
    resize(); // Force resize sync after UI changes
}

// Pre-fill stored name if available
(function initNameScreen() {
    const stored = safeStorage.getItem('playerName');
    const inputEl = document.getElementById('name-input');
    if (stored && inputEl) inputEl.value = stored;

    // Allow Enter key to confirm
    if (inputEl) {
        inputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter') confirmName();
        });
    }
})();

// ===================== MOBILE JOYSTICK =====================
(function initMobileJoystick() {
    const joystickBase = document.getElementById('joystick-base');
    const joystickKnob = document.getElementById('joystick-knob');
    if (!joystickBase || !joystickKnob) return;

    const MAX_DIST = 48;
    let joystickActive = false;
    let joyTouchId = null;
    let baseX = 0, baseY = 0;

    function getBaseCenter() {
        const r = joystickBase.getBoundingClientRect();
        baseX = r.left + r.width / 2;
        baseY = r.top + r.height / 2;
    }

    function updateMobileAngle(cx, cy) {
        // Character no longer rotates instantly with pointing.
        // Rotation is handled by relative dragging now.
    }

    joystickBase.addEventListener('touchstart', e => {
        e.preventDefault();
        joystickActive = true;
        joyTouchId = e.changedTouches[0].identifier;
        getBaseCenter();
        updateKnob(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }, { passive: false });

    window.addEventListener('touchmove', e => {
        if (!joystickActive) return;
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier === joyTouchId) {
                updateKnob(t.clientX, t.clientY);
                break;
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', e => {
        for (const t of e.changedTouches) {
            if (t.identifier === joyTouchId) {
                joystickActive = false;
                joyTouchId = null;
                joystickKnob.style.transform = 'translate(-50%, -50%)';
                // Clear keys
                keys['w'] = false; keys['s'] = false;
                keys['a'] = false; keys['d'] = false;
                break;
            }
        }
    }, { passive: false });

    function updateKnob(cx, cy) {
        let dx = cx - baseX;
        let dy = cy - baseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > MAX_DIST) {
            dx = (dx / dist) * MAX_DIST;
            dy = (dy / dist) * MAX_DIST;
        }
        joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

        const deadzone = 10;
        keys['w'] = dy < -deadzone;
        keys['s'] = dy > deadzone;
        keys['a'] = dx < -deadzone;
        keys['d'] = dx > deadzone;

        if (deviceMode === 'MOBILE') {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > deadzone) {
                // Character no longer rotates with joystick as requested.
                // It will only rotate when touching the screen to aim.
            }
        }
    }

    let isMobileActionActive = false;

    // Mobile look (DRAG to look)
    let lookTouchId = null;
    let lastLookX = 0;

    canvas.addEventListener('touchstart', e => {
        if (deviceMode !== 'MOBILE') return;
        e.preventDefault();
        const t = e.changedTouches[0];
        lookTouchId = t.identifier;
        lastLookX = t.clientX;

        // Auto-aim on tap: Calculate angle from center to tap
        const rect = canvas.getBoundingClientRect();
        const screenX = rect.width / 2;
        const screenY = rect.height / 2;
        const tapX = t.clientX - rect.left;
        const tapY = t.clientY - rect.top;
        player.angle = Math.atan2(tapY - screenY, tapX - screenX);

        // Also trigger fire on tap
        if (gameRunning && !player.isDead && player.currentSlot === 1) {
            const now = Date.now();
            if (now - lastShootTime >= player.weapon.fireRate) {
                let weapon = player.weapon;
                if (player.hasLordPackage && weapon !== WEAPONS.GOD_GUN) weapon = WEAPONS.AK47;
                let dmg = weapon.damage;
                if (player.hasLordPackage) dmg *= 1.5;
                if (bullets.length < 100) {
                    bullets.push(new Bullet(player.x, player.y, player.angle,
                        TEAMS[player.teamId].color, 'player', player.teamId, dmg, weapon.bulletSpeed, 'player'));
                }
                playSound(400 + Math.random() * 100, 'square', 0.05, 0.05, false);
                lastShootTime = now;
            }
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
        if (deviceMode !== 'MOBILE' || lookTouchId === null) return;
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier === lookTouchId) {
                const deltaX = t.clientX - lastLookX;
                player.angle += deltaX * 0.012; // Increased sensitivity
                lastLookX = t.clientX;
                break;
            }
        }
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
        for (const t of e.changedTouches) {
            if (t.identifier === lookTouchId) lookTouchId = null;
        }
    }, { passive: false });

    // Action buttons
    const fireBtnEl = document.getElementById('mob-fire-btn');
    const knifeBtnEl = document.getElementById('mob-knife-btn');
    const bombBtnEl = document.getElementById('mob-bomb-btn');
    const rocketBtnEl = document.getElementById('mob-rocket-btn');

    if (fireBtnEl) {
        fireBtnEl.addEventListener('touchstart', e => {
            e.stopPropagation();
            if (!gameRunning || player.isDead) return;
            isMobileActionActive = true;

            // Just shoot, don't update angle here as it might jump
            let weapon = player.weapon;
            if (player.hasLordPackage && weapon !== WEAPONS.GOD_GUN) weapon = WEAPONS.AK47;
            const now = Date.now();
            if (now - lastShootTime >= weapon.fireRate) {
                let dmg = weapon.damage;
                if (player.hasLordPackage) dmg *= 1.5;
                if (bullets.length < 100) {
                    bullets.push(new Bullet(player.x, player.y, player.angle,
                        TEAMS[player.teamId].color, 'player', player.teamId, dmg, weapon.bulletSpeed, 'player'));
                }
                playSound(400 + Math.random() * 100, 'square', 0.05, 0.05, false);
                lastShootTime = now;
            }
        }, { passive: false });
    }

    if (fireBtnEl) {
        fireBtnEl.addEventListener('touchmove', e => {
            e.stopPropagation();
            // Optional: allow dragging the fire button to fine-tune aim? 
            // For now, let's keep it simple.
        }, { passive: false });
        fireBtnEl.addEventListener('touchend', e => {
            isMobileActionActive = false;
        }, { passive: false });
    }

    if (knifeBtnEl) {
        knifeBtnEl.addEventListener('touchstart', e => {
            e.stopPropagation();
            isMobileActionActive = true;
            updateMobileAngle(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            useKnife();
        }, { passive: false });
        knifeBtnEl.addEventListener('touchend', e => { isMobileActionActive = false; }, { passive: false });
    }
    if (bombBtnEl) {
        bombBtnEl.addEventListener('touchstart', e => {
            e.stopPropagation();
            isMobileActionActive = true;
            updateMobileAngle(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            useBomb();
        }, { passive: false });
        bombBtnEl.addEventListener('touchend', e => { isMobileActionActive = false; }, { passive: false });
    }
    if (rocketBtnEl) {
        rocketBtnEl.addEventListener('touchstart', e => {
            e.stopPropagation();
            isMobileActionActive = true;
            updateMobileAngle(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            useRocket();
        }, { passive: false });
        rocketBtnEl.addEventListener('touchend', e => { isMobileActionActive = false; }, { passive: false });
    }
})();

// ===================== STORE & INVENTORY LOGIC =====================
let inventory = [{ id: 'DEFAULT', name: 'Standart Silah' }];
try {
    const savedInventory = safeStorage.getItem('weaponInventory');
    if (savedInventory) {
        inventory = JSON.parse(savedInventory);
    }
} catch (e) {
    console.error("Inventory error:", e);
}

let activeWeaponId = safeStorage.getItem('activeWeaponId') || 'DEFAULT';

const STORE_THEMES = {
    bronze: ['Orman', 'Kar', 'Gece'],
    silver: ['Çöl', 'Dijital', 'Kamuflaj'],
    gold: ['Altın', 'İmparator', 'Ejder']
};

const BASE_WEAPON_TYPES = ['Tabanca', 'Sniper', 'Makineli', 'AK-47'];

function initStore() {
    try {
        const storeBtn = document.getElementById('store-btn');
        const storeModal = document.getElementById('store-modal');
        const closeStore = document.getElementById('close-store');
        const buyBoxBtns = document.querySelectorAll('.buy-box-btn');

        if (storeBtn) {
            storeBtn.onclick = () => {
                if (storeModal) storeModal.classList.remove('hidden');
                const tlSpan = document.getElementById('current-tl');
                if (tlSpan) tlSpan.innerText = totalPoints;
            };
        }

        if (closeStore && storeModal) {
            closeStore.onclick = () => storeModal.classList.add('hidden');
        }

        buyBoxBtns.forEach(btn => {
            btn.onclick = () => openBox(btn.dataset.box);
        });

        updateCollectionUI();
        applyActiveWeapon();
    } catch (e) {
        console.error("Store init crash:", e);
    }
}

function openBox(type) {
    let cost = type === 'bronze' ? 5 : (type === 'silver' ? 10 : 20);

    if (totalPoints < cost) {
        alert("Yetersiz TL! Savaşarak daha fazla kazanabilirsin.");
        return;
    }

    totalPoints -= cost;
    safeStorage.setItem('totalPoints', totalPoints);
    const tlSpan = document.getElementById('current-tl');
    if (tlSpan) tlSpan.innerText = totalPoints;
    updateHUD();

    const overlay = document.getElementById('open-animation-overlay');
    const rewardText = document.getElementById('reward-name');
    if (overlay) overlay.classList.remove('hidden');
    if (rewardText) rewardText.innerText = "Kutu Açılıyor...";

    setTimeout(() => {
        const themeList = STORE_THEMES[type];
        const theme = themeList[Math.floor(Math.random() * themeList.length)];
        const baseType = BASE_WEAPON_TYPES[Math.floor(Math.random() * BASE_WEAPON_TYPES.length)];

        const weaponName = `${baseType} ${theme} Silahı`;
        const weaponId = `custom_${Date.now()}`;

        const newWeapon = {
            id: weaponId,
            name: weaponName,
            baseType: baseType.toUpperCase(),
            theme: theme
        };

        inventory.push(newWeapon);
        safeStorage.setItem('weaponInventory', JSON.stringify(inventory));

        if (rewardText) rewardText.innerHTML = `TEBRİKLER!<br><span style="color: #ffd700">${weaponName}</span> Kazandın!`;
        playSound(800, 'square', 0.5, 0.2, false);

        setTimeout(() => {
            if (overlay) overlay.classList.add('hidden');
            updateCollectionUI();
        }, 3000);
    }, 2000);
}

function updateCollectionUI() {
    const list = document.getElementById('weapon-list');
    if (!list) return;

    const lowerName = (playerName || "").toLowerCase();
    const isGod = (lowerName === 'miro' || lowerName === 'çaşo');

    let displayInventory = [...inventory];

    if (isGod) {
        // Add all legendary themes and base types for moderators if not present
        const themes = ['Altın', 'İmparator', 'Ejder'];
        const bases = ['TABANCA', 'SNIPER', 'MAKINELI', 'AK-47'];

        bases.forEach(base => {
            themes.forEach(theme => {
                const name = `${base.charAt(0) + base.slice(1).toLowerCase()} ${theme} Silahı`;
                const mockId = `god_${base}_${theme}`;
                if (!displayInventory.find(w => w.id === mockId)) {
                    displayInventory.push({
                        id: mockId,
                        name: name,
                        baseType: base,
                        theme: theme,
                        isGodSkin: true
                    });
                }
            });
        });
    }

    list.innerHTML = displayInventory.map(w => `
        <span class="teammate ${activeWeaponId === w.id ? 'active-weapon' : ''}" 
              onclick="selectInventoryWeapon('${w.id}')">
            ${w.name} ${w.isGodSkin ? '✨' : ''}
        </span>
    `).join('');
}

function selectInventoryWeapon(id) {
    activeWeaponId = id;
    safeStorage.setItem('activeWeaponId', id);

    // If it's a god skin, we need to ensure it's "known" for applyActiveWeapon
    // For now, we'll just let applyActiveWeapon handle the id prefix
    updateCollectionUI();
    applyActiveWeapon();
}

function applyActiveWeapon() {
    try {
        if (!inventory || inventory.length === 0) {
            inventory = [{ id: 'DEFAULT', name: 'Standart Silah' }];
        }

        let weaponData = inventory.find(w => w.id === activeWeaponId);

        // Handle God Skins (virtual skins for moderators)
        if (!weaponData && activeWeaponId && activeWeaponId.startsWith('god_')) {
            const parts = activeWeaponId.split('_');
            weaponData = {
                id: activeWeaponId,
                baseType: parts[1],
                theme: parts[2],
                name: `${parts[1].charAt(0) + parts[1].slice(1).toLowerCase()} ${parts[2]} Silahı`
            };
        }

        if (!weaponData) {
            weaponData = inventory[0] || { id: 'DEFAULT', name: 'Standart Silah', baseType: 'DEFAULT' };
        }

        let protoKey = 'DEFAULT';
        if (weaponData.baseType === 'SNIPER') protoKey = 'SNIPER';
        else if (weaponData.baseType === 'MAKINELI') protoKey = 'MACHINE_GUN';
        else if (weaponData.baseType === 'AK-47') protoKey = 'AK47';

        const prototype = WEAPONS[protoKey] || WEAPONS.DEFAULT;
        if (prototype) {
            player.weapon = { ...prototype, name: weaponData.name || "Bilinmeyen Silah" };
            if (weaponData.theme === 'Altın') player.weapon.damage += 5;
            if (weaponData.theme === 'İmparator') player.weapon.fireRate *= 0.9;
            player.speed = player.weapon.playerSpeed;
            selectedClass = protoKey;
        }
    } catch (e) {
        console.error("Weapon apply crash:", e);
        // Emergency default
        player.weapon = WEAPONS.DEFAULT;
        player.speed = player.weapon.playerSpeed;
        selectedClass = 'DEFAULT';
    }
}

// Master Initialization Sequence
function masterInit() {
    try {
        initStore();

        const savedName = safeStorage.getItem('playerName');
        const nameScreen = document.getElementById('name-screen');
        const menuOverlayEl = document.getElementById('menu-overlay');

        if (savedName) {
            playerName = savedName;
            const nameInput = document.getElementById('name-input');
            if (nameInput) nameInput.value = savedName;

            if (nameScreen) nameScreen.classList.add('hidden');
            if (menuOverlayEl) menuOverlayEl.classList.remove('hidden');

            if (checkBan()) {
                if (nameScreen) nameScreen.classList.remove('hidden');
                if (menuOverlayEl) menuOverlayEl.classList.add('hidden');
            }
        } else {
            // No saved name, show name screen
            if (nameScreen) nameScreen.classList.remove('hidden');
            if (menuOverlayEl) menuOverlayEl.classList.add('hidden');
        }
        // Sync UI with auto-detected device mode
        selectDevice(deviceMode);
        updateHUD();

        // Remove loading screen
        const loader = document.getElementById('loading-screen');
        if (loader) {
            loader.style.opacity = '0';
            loader.style.transition = 'opacity 0.5s';
            setTimeout(() => loader.remove(), 500);
        }
    } catch (e) {
        console.error("Master Init Failure:", e);
        // Emergency fallback: show name screen
        const ns = document.getElementById('name-screen');
        if (ns) {
            ns.classList.remove('hidden');
        }
    }
}

// Start everything
masterInit();
