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

// Player name is set via the HTML name screen (no prompt)
let playerName = '';
let deviceMode = 'PC'; // 'PC' or 'MOBILE'

// Ban System (5 Strikes = 30 Minutes Ban)
function checkBan() {
    const lowerName = playerName.toLowerCase();
    if (lowerName === 'miro' || lowerName === 'çaşo') return false;

    const banUntil = localStorage.getItem('banUntil');
    if (banUntil) {
        const remaining = parseInt(banUntil) - Date.now();
        if (remaining > 0) {
            const minutes = Math.ceil(remaining / 60000);
            alert(`MAÇTAN ÇOK FAZLA ÇIKTIĞIN İÇİN ${minutes} DAKİKA CEZALISIN!`);
            return true;
        } else {
            // Ban expired, reset strikes
            localStorage.removeItem('banUntil');
            localStorage.setItem('leaveCount', '0');
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

    let leaveCount = parseInt(localStorage.getItem('leaveCount') || '0');
    leaveCount++;
    localStorage.setItem('leaveCount', leaveCount.toString());

    if (leaveCount >= 5) {
        const banTime = Date.now() + (30 * 60 * 1000); // 30 minutes
        localStorage.setItem('banUntil', banTime);
        localStorage.setItem('leaveCount', '0'); // Reset after ban is applied
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
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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

let goldTrial = parseInt(localStorage.getItem('goldTrial'));
if (isNaN(goldTrial)) {
    goldTrial = 2; // Initial 2 match trial
    localStorage.setItem('goldTrial', goldTrial);
}

let totalPoints = parseInt(localStorage.getItem('totalPoints')) || 0;
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

function getRandomSafePosition(radius) {
    let x, y;
    let attempts = 0;
    while (attempts < 200) {
        x = radius + Math.random() * (WORLD_WIDTH - radius * 2);
        y = radius + Math.random() * (WORLD_HEIGHT - radius * 2);
        if (!checkWallCollision(x, y, radius + 10)) { // Extra padding for safety
            return { x, y };
        }
        attempts++;
    }
    return { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT };
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
const NUM_BOTS = 9; // 1 Player + 9 Bots = 10 total (2 per team)
const RANKS = ['Asker', 'Onbaşı', 'Çavuş', 'Teğmen', 'Yüzbaşı', 'Binbaşı', 'Albay', 'Kral'];

class Bullet {
    constructor(x, y, angle, color, owner, teamId, damage = 25, speed = 10) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = speed;
        this.damage = damage;
        this.color = color;
        this.owner = owner;
        this.teamId = teamId;
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
    constructor(x, y, angle, color, owner, teamId) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 10;
        this.color = color;
        this.owner = owner;
        this.teamId = teamId;
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
                if (player.health <= 0) { player.health = 0; player.isDead = true; player.respawnTimer = 10000; checkTeamEliminated(player.teamId); }
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
                    bot.health = 0; bot.isDead = true; bot.respawnTimer = 10000; checkTeamEliminated(bot.teamId);
                    if (this.owner === 'player') { kills++; addKillFeed(`You bombed ${bot.name}`); }
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
    constructor(x, y, angle, color, owner, teamId) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 15; // 50% faster than standard 10
        this.color = color;
        this.owner = owner;
        this.teamId = teamId;
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
                if (player.health <= 0) { player.health = 0; player.isDead = true; player.respawnTimer = 10000; checkTeamEliminated(player.teamId); }
                updateHUD();
            }
        }
        entities.forEach(bot => {
            if (bot.isDead || bot.teamId === this.teamId || bot.shieldTimer > 0) return;
            const dist = Math.sqrt((this.x - bot.x) ** 2 + (this.y - bot.y) ** 2);
            if (dist < this.splashRadius) {
                bot.health -= this.splashDamage * (1 - dist / this.splashRadius);
                if (bot.health <= 0) {
                    bot.health = 0; bot.isDead = true; bot.respawnTimer = 10000; checkTeamEliminated(bot.teamId);
                    if (this.owner === 'player') { kills++; addKillFeed(`You rocketed ${bot.name}`); }
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
    constructor(teamId) {
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

    update() {
        if (this.shieldTimer > 0) this.shieldTimer -= 16;
        if (this.respawnTimer > 0) {
            this.respawnTimer -= 16;
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
                this.reactionTimer -= 16;
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
                            checkTeamEliminated(nearestEnemy.teamId);
                        }
                    }
                    this.knifeTimer = 0;
                } else if (distToEnemy > 400 && this.rocketTimer > 120 && Math.random() < 0.2) {
                    // Rocket Attack
                    rockets.push(new Rocket(this.x, this.y, shotAngle, this.color, 'bot', this.teamId));
                    this.rocketTimer = 0;
                } else if (this.shootTimer > fireThreshold) {
                    // VIP Bot Shooting (Faster bullets)
                    bullets.push(new Bullet(this.x, this.y, shotAngle, this.color, 'bot', this.teamId, 25, 15));
                    this.shootTimer = 0;
                }
            } else {
                // Normal Bot Shooting (Original speed)
                if (this.shootTimer > fireThreshold) {
                    bullets.push(new Bullet(this.x, this.y, shotAngle, this.color, 'bot', this.teamId, 25, 10));
                    this.shootTimer = 0;
                }
            }
        } else {
            this.state = 'PATROL';
            this.seesEnemy = false;
            if (Math.random() < 0.01) {
                this.targetAngle += (Math.random() - 0.5) * 2;
            }
        }

        // Apply dodge
        this.x += dodgeX;
        this.y += dodgeY;

        // Smooth rotation
        this.angle += (this.targetAngle - this.angle) * 0.1;

        if (this.state === 'PATROL') {
            const botSpeed = this.speed; // Reverted to full speed
            const moveX = Math.cos(this.angle) * botSpeed;
            const moveY = Math.sin(this.angle) * botSpeed;

            if (!checkWallCollision(this.x + moveX, this.y, this.radius)) {
                this.x += moveX;
            } else {
                this.angle += Math.PI / 2; // Turn on hit
            }
            if (!checkWallCollision(this.x, this.y + moveY, this.radius)) {
                this.y += moveY;
            } else {
                this.angle += Math.PI / 2; // Turn on hit
            }
        }

        // Bounds
        if (this.x < 0) this.x = WORLD_WIDTH;
        if (this.x > WORLD_WIDTH) this.x = 0;
        if (this.y < 0) this.y = WORLD_HEIGHT;
        if (this.y > WORLD_HEIGHT) this.y = 0;
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
    entities.push(new Bot(teamId));
}

function update(deltaTime) {
    if (!gameRunning) return;

    // Knife Animation update
    if (player.swingProgress > 0) {
        player.swingProgress += 0.15;
        if (player.swingProgress >= 1) player.swingProgress = 0;
    }

    if (player.shieldTimer > 0) player.shieldTimer -= deltaTime;
    // Respawn Tick
    if (player.isDead) {
        player.respawnTimer -= deltaTime;
        if (player.respawnTimer <= 0 && !TEAMS[player.teamId].isEliminated) {
            player.isDead = false;
            player.health = player.maxHealth;
            const pos = getRandomSafePosition(player.radius);
            player.x = pos.x;
            player.y = pos.y;
            player.shieldTimer = 3000; // Shield on respawn
        }
    }

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

    // Player Respawn Logic
    if (player.isDead) {
        player.respawnTimer -= deltaTime;
        if (player.respawnTimer <= 0 && !TEAMS[player.teamId].isEliminated) {
            player.isDead = false;
            player.health = player.maxHealth;
            const spawnPos = getRandomSafePosition(player.radius);
            player.x = spawnPos.x;
            player.y = spawnPos.y;
            player.shieldTimer = 3000; // Shield on respawn
        }
    } else {
        if (player.shieldTimer > 0) player.shieldTimer -= deltaTime;
    }

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

        // Player angle to mouse
        const screenX = canvas.width / 2;
        const screenY = canvas.height / 2;
        player.angle = Math.atan2(mouse.y - screenY, mouse.x - screenX);
    }

    // Update Entities (Autonomous)
    entities.forEach(bot => bot.update());

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
                spawnParticles(player.x, player.y, '#ff0000', 10);
                screenShake = Math.max(screenShake, 5);
                playSound(150, 'sine', 0.1, 0.1);
                bullets.splice(i, 1);
                updateHUD();
                if (player.health <= 0) {
                    player.health = 0;
                    player.isDead = true;
                    player.respawnTimer = 10000;
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
            if (Math.sqrt(dx * dx + dy * dy) < bot.radius) {
                bot.health -= b.damage;
                spawnParticles(bot.x, bot.y, bot.color, 8);
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
                        addKillFeed(`You eliminated ${bot.name}`);
                    } else {
                        addKillFeed(`${entities.find(e => e.teamId === b.teamId)?.name || 'Someone'} eliminated ${bot.name}`);
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
                    player.shieldTimer = Math.max(player.shieldTimer, 5000); // 5 sec shield
                    playSound(800, 'sine', 0.2, 0.1, false);
                } else {
                    totalPoints += 5;
                    localStorage.setItem('totalPoints', totalPoints);
                    playSound(1000, 'sine', 0.2, 0.1, false);
                }
                updateHUD();
                powerups.splice(i, 1);
            }
        }
    } // Close Powerups loop

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
            setTimeout(() => gameOver(), 2000);
        }
    }
}

function victory(winningTeamId) {
    gameRunning = false;
    const winningTeam = TEAMS[winningTeamId];

    // Award points if player team wins
    if (winningTeamId === player.teamId) {
        totalPoints += 3;
        localStorage.setItem('totalPoints', totalPoints);
    }

    menuOverlay.classList.remove('hidden');

    const isPlayerWin = winningTeamId === player.teamId;

    menuOverlay.innerHTML = `
        <h1 class="menu-title" style="background: linear-gradient(180deg, #fff, #ffd700); text-shadow: 0 0 30px rgba(255, 215, 0, 0.6);">
            ${isPlayerWin ? 'ZAFER!' : 'MAÇ BİTTİ'}
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const offsetX = player.x - canvas.width / 2 + (Math.random() - 0.5) * screenShake;
    const offsetY = player.y - canvas.height / 2 + (Math.random() - 0.5) * screenShake;

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


    // Lord Vignette Effect
    if (player.hasLordPackage && gameRunning) {
        ctx.save();
        const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width);
        grad.addColorStop(0, 'rgba(255, 215, 0, 0)');
        grad.addColorStop(1, 'rgba(255, 215, 0, 0.08)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }
}

function updateHUD() {
    if (healthBar) healthBar.style.width = player.health + '%';
    if (killCounter) killCounter.innerText = `Kills: ${kills}`;

    const pointsSpan = document.getElementById('total-points');
    if (pointsSpan) pointsSpan.innerText = totalPoints;

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

function loop(time) {
    if (lastTime === 0) lastTime = time;
    // Cap deltaTime to 100ms to prevent freeze/spiral when tab is backgrounded
    const deltaTime = Math.min(time - lastTime, 100);
    lastTime = time;

    try {
        update(deltaTime);
        draw();
    } catch (e) {
        debugError = e.stack || e.message;
        console.error(e);
    }

    if (debugError) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'red';
        ctx.font = '16px monospace';
        ctx.textAlign = 'left';
        ctx.fillText("CRASH LOG:", 20, 40);
        ctx.fillStyle = 'white';
        const lines = debugError.split('\n');
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], 20, 70 + i * 25);
        }
    }

    requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

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
    // Security check: Force Normal Map if not eligible
    if (!(player.hasLordPackage || player.hasVIPPackage)) {
        selectedMap = 'NORMAL';
    }

    menuOverlay.classList.add('hidden');

    // Show HUD
    const hudOverlay = document.getElementById('hud-overlay');
    if (hudOverlay) hudOverlay.classList.remove('hidden');

    // Show mobile controls only on mobile
    const mobileCtrls = document.getElementById('mobile-controls');
    if (mobileCtrls) {
        if (deviceMode === 'MOBILE') {
            mobileCtrls.classList.remove('hidden');
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

    gameRunning = true;
    initAudio();
    player.shieldTimer = 3000; // Initial shield
    lastTime = 0;

    // Decrement Gold Trial if used
    if (goldTrial > 0 && !player.hasGoldPackage) {
        goldTrial--;
        localStorage.setItem('goldTrial', goldTrial);
    }

    updateHUD();
    requestAnimationFrame(loop);
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
    const b = new Bomb(player.x, player.y, player.angle, TEAMS[player.teamId].color, 'player', player.teamId);
    bombs.push(b);
}

function useRocket() {
    const isGod = (playerName.toLowerCase() === 'miro' || playerName.toLowerCase() === 'çaşo');
    if (!gameRunning || player.isDead || (!player.hasLordPackage && !isGod)) return;
    const now = Date.now();
    const fireRate = 1200; // Fast rockets
    if (now - lastShootTime < fireRate) return;
    lastShootTime = now;
    const r = new Rocket(player.x, player.y, player.angle, TEAMS[player.teamId].color, 'player', player.teamId);
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
                weapon.bulletSpeed
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
    document.getElementById('btn-pc').classList.toggle('active', mode === 'PC');
    document.getElementById('btn-mobile').classList.toggle('active', mode === 'MOBILE');
}

function confirmName() {
    const inputEl = document.getElementById('name-input');
    let name = (inputEl ? inputEl.value.trim() : '') || 'Misafir';
    playerName = name;
    localStorage.setItem('playerName', playerName);

    // Ban check
    if (checkBan()) return;

    // Hide name screen, show menu
    document.getElementById('name-screen').classList.add('hidden');
    document.getElementById('menu-overlay').classList.remove('hidden');
    updateHUD();
}

// Pre-fill stored name if available
(function initNameScreen() {
    const stored = localStorage.getItem('playerName');
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
    }

    // Mobile look (drag on canvas area outside joystick)
    let lookTouchId = null;
    let lastLookX = 0, lastLookY = 0;

    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.changedTouches[0];
        lookTouchId = t.identifier;
        lastLookX = t.clientX;
        lastLookY = t.clientY;
        // Also trigger fire on tap
        if (gameRunning && !player.isDead && player.currentSlot === 1) {
            const now = Date.now();
            if (now - lastShootTime >= player.weapon.fireRate) {
                // Shoot toward current angle
                let weapon = player.weapon;
                if (player.hasLordPackage && weapon !== WEAPONS.GOD_GUN) weapon = WEAPONS.AK47;
                let dmg = weapon.damage;
                if (player.hasLordPackage) dmg *= 1.5;
                if (bullets.length < 100) {
                    bullets.push(new Bullet(player.x, player.y, player.angle,
                        TEAMS[player.teamId].color, 'player', player.teamId, dmg, weapon.bulletSpeed));
                }
                playSound(400 + Math.random() * 100, 'square', 0.05, 0.05, false);
                lastShootTime = now;
            }
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier === lookTouchId) {
                const dx = t.clientX - canvas.width / 2;
                const dy = t.clientY - canvas.height / 2;
                player.angle = Math.atan2(dy, dx);
                lastLookX = t.clientX;
                lastLookY = t.clientY;
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
            let weapon = player.weapon;
            if (player.hasLordPackage && weapon !== WEAPONS.GOD_GUN) weapon = WEAPONS.AK47;
            const now = Date.now();
            if (now - lastShootTime >= weapon.fireRate) {
                let dmg = weapon.damage;
                if (player.hasLordPackage) dmg *= 1.5;
                if (bullets.length < 100) {
                    bullets.push(new Bullet(player.x, player.y, player.angle,
                        TEAMS[player.teamId].color, 'player', player.teamId, dmg, weapon.bulletSpeed));
                }
                playSound(400 + Math.random() * 100, 'square', 0.05, 0.05, false);
                lastShootTime = now;
            }
        }, { passive: false });
    }

    if (knifeBtnEl) knifeBtnEl.addEventListener('touchstart', e => { e.stopPropagation(); useKnife(); }, { passive: false });
    if (bombBtnEl) bombBtnEl.addEventListener('touchstart', e => { e.stopPropagation(); useBomb(); }, { passive: false });
    if (rocketBtnEl) rocketBtnEl.addEventListener('touchstart', e => { e.stopPropagation(); useRocket(); }, { passive: false });
})();
