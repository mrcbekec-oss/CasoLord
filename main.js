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
let fakePlayerCount = 740 + Math.floor(Math.random() * 60);

// World Settings
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;

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
    }
};

player.hasGoldPackage = false;
player.hasKingPackage = false;
player.hasLordPackage = false;
player.hasVIPPackage = false;
player.currentSlot = 1;
player.swingProgress = 0; // 0 to 1 for knife animation
let selectedMap = 'NORMAL';

const WALLS = [
    // Outer boundary walls (optional since we have clamping, but good for visual)
    { x: 0, y: 0, w: 2000, h: 20 },
    { x: 0, y: 1980, w: 2000, h: 20 },
    { x: 0, y: 0, w: 20, h: 2000 },
    { x: 1980, y: 0, w: 20, h: 2000 },

    // Room 1: Top Left
    { x: 400, y: 0, w: 20, h: 300 },
    { x: 0, y: 400, w: 300, h: 20 },

    // Room 2: Center
    { x: 800, y: 800, w: 400, h: 20 }, // Top
    { x: 800, y: 1180, w: 400, h: 20 }, // Bottom
    { x: 800, y: 800, w: 20, h: 100 }, // Left top
    { x: 800, y: 1080, w: 20, h: 120 }, // Left bottom (Door at 900-1080)
    { x: 1180, y: 800, w: 20, h: 100 }, // Right top
    { x: 1180, y: 1080, w: 20, h: 120 }, // Right bottom (Door at 900-1080)

    // Maze-like walls
    { x: 1500, y: 300, w: 20, h: 1000 },
    { x: 1200, y: 1500, w: 600, h: 20 },
    { x: 300, y: 1200, w: 20, h: 600 },
    { x: 600, y: 600, w: 100, h: 100 } // A pillar
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

let lastKnifeTime = 0;
let lastBombTime = 0;

let goldTrial = parseInt(localStorage.getItem('goldTrial'));
if (isNaN(goldTrial)) {
    goldTrial = 2; // Initial 2 match trial
    localStorage.setItem('goldTrial', goldTrial);
}

let totalPoints = parseInt(localStorage.getItem('lordPoints')) || 0;
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
const NUM_BOTS = 14; // 1 Player + 14 Bots = 15 total (3 per team)
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
        ctx.beginPath();
        ctx.arc(this.x - offsetX, this.y - offsetY, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
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
        explosions.push(new Explosion(this.x, this.y, this.color, this.splashRadius));

        // Splash damage to player
        if (player.teamId !== this.teamId && !player.isDead) {
            const dist = Math.sqrt((this.x - player.x) ** 2 + (this.y - player.y) ** 2);
            if (dist < this.splashRadius) {
                player.health -= this.splashDamage * (1 - dist / this.splashRadius);
                if (player.health <= 0) { player.health = 0; player.isDead = true; player.respawnTimer = 10000; checkTeamEliminated(player.teamId); }
                updateHUD();
            }
        }
        // Splash damage to bots
        entities.forEach(bot => {
            if (bot.isDead || bot.teamId === this.teamId) return;
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
        if (player.teamId !== this.teamId && !player.isDead) {
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
            if (bot.isDead || bot.teamId === this.teamId) return;
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
        this.x = Math.random() * WORLD_WIDTH;
        this.y = Math.random() * WORLD_HEIGHT;
        this.radius = 20;
        this.speed = 2 + Math.random() * 2;
        this.health = 100;
        this.isDead = false;
        this.respawnTimer = 0;
        this.angle = Math.random() * Math.PI * 2;
        this.targetAngle = this.angle;
        this.state = 'PATROL'; // PATROL, CHASE, ATTACK
        this.shootTimer = 0;
        this.knifeTimer = 0;
        this.rocketTimer = 0;
    }

    generateName() {
        const names = ['X-Warrior', 'Shadow', 'Destroyer', 'Rex', 'Omega', 'Viper', 'Ghost', 'Titan'];
        return names[Math.floor(Math.random() * names.length)] + '_' + Math.floor(Math.random() * 999);
    }

    update() {
        if (this.isDead) return;

        let nearestEnemy = null;
        let minDist = 400;

        // Bullet dodging
        let dodgeX = 0;
        let dodgeY = 0;
        bullets.forEach(b => {
            if (b.teamId === this.teamId) return;
            const dx = b.x - this.x;
            const dy = b.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 100) {
                // Perpendicular dodge
                const angle = b.angle + Math.PI / 2;
                dodgeX += Math.cos(angle) * 2;
                dodgeY += Math.sin(angle) * 2;
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
            this.state = 'ATTACK';
            this.targetAngle = Math.atan2(nearestEnemy.y - this.y, nearestEnemy.x - this.x);

            // Tactical movement: Maintain distance and move slightly sideways
            const isVipMap = selectedMap === 'VIP';
            const botSpeed = this.speed; // Restored to full speed for all maps

            // Tactical movement
            const distToEnemy = minDist;
            const nextX = isVipMap ? this.x + Math.cos(this.targetAngle) * botSpeed * 0.8 : this.x + Math.cos(this.targetAngle) * botSpeed * 0.8;
            const nextY = isVipMap ? this.y + Math.sin(this.targetAngle) * botSpeed * 0.8 : this.y + Math.sin(this.targetAngle) * botSpeed * 0.8;

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

            // Fire rate adjustment
            let fireThreshold = 70; // Original-like speed for Normal map
            if (isVipMap) fireThreshold = 25; // Elite speed for VIP

            this.shootTimer++;
            this.knifeTimer++;
            this.rocketTimer++;

            // Decision logic for VIP Bots
            if (isVipMap) {
                if (distToEnemy < 80 && this.knifeTimer > 40) {
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
                    // Visual swing effect could be added here
                } else if (distToEnemy > 400 && this.rocketTimer > 120 && Math.random() < 0.2) {
                    // Rocket Attack
                    rockets.push(new Rocket(this.x, this.y, this.targetAngle, this.color, 'bot', this.teamId));
                    this.rocketTimer = 0;
                } else if (this.shootTimer > fireThreshold) {
                    // VIP Bot Shooting (Faster bullets)
                    bullets.push(new Bullet(this.x, this.y, this.targetAngle, this.color, 'bot', this.teamId, 25, 15));
                    this.shootTimer = 0;
                }
            } else {
                // Normal Bot Shooting (Original speed)
                if (this.shootTimer > fireThreshold) {
                    bullets.push(new Bullet(this.x, this.y, this.targetAngle, this.color, 'bot', this.teamId, 25, 10));
                    this.shootTimer = 0;
                }
            }
        } else {
            this.state = 'PATROL';
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

    // Respawn Tick
    if (player.isDead) {
        player.respawnTimer -= deltaTime;
        if (player.respawnTimer <= 0 && !TEAMS[player.teamId].isEliminated) {
            player.isDead = false;
            player.health = player.maxHealth;
            player.x = Math.random() * WORLD_WIDTH;
            player.y = Math.random() * WORLD_HEIGHT;
        }
    }

    entities.forEach(bot => {
        if (bot.isDead) {
            bot.respawnTimer -= deltaTime;
            if (bot.respawnTimer <= 0 && !TEAMS[bot.teamId].isEliminated) {
                bot.isDead = false;
                bot.health = 100;
                bot.spawn();
            }
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

        // Player angle to mouse
        const screenX = canvas.width / 2;
        const screenY = canvas.height / 2;
        player.angle = Math.atan2(mouse.y - screenY, mouse.x - screenX);

        // Update Entities
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

            // Collision Check
            if (b.teamId !== player.teamId) {
                const dx = b.x - player.x;
                const dy = b.y - player.y;
                if (Math.sqrt(dx * dx + dy * dy) < player.radius) {
                    let damage = b.damage;
                    if (player.hasLordPackage) damage *= 0.5; // Damage resistance
                    player.health -= damage;
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

            // Check bot collisions if not on same team
            for (let j = entities.length - 1; j >= 0; j--) {
                const bot = entities[j];
                if (bot.isDead || b.teamId === bot.teamId) continue;

                const dx = b.x - bot.x;
                const dy = b.y - bot.y;
                if (Math.sqrt(dx * dx + dy * dy) < bot.radius) {
                    bot.health -= b.damage;
                    bullets.splice(i, 1);
                    if (bot.health <= 0) {
                        bot.health = 0;
                        bot.isDead = true;
                        bot.respawnTimer = 10000;
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
    }

    // Update Bombs
    for (let i = bombs.length - 1; i >= 0; i--) {
        if (bombs[i].update()) {
            bombs.splice(i, 1);
        }
    }

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
        localStorage.setItem('lordPoints', totalPoints);
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

    const offsetX = player.x - canvas.width / 2;
    const offsetY = player.y - canvas.height / 2;

    const isVipMap = selectedMap === 'VIP';

    // Draw Grid
    ctx.strokeStyle = isVipMap ? 'rgba(191, 0, 255, 0.1)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < WORLD_WIDTH; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x - offsetX, 0 - offsetY);
        ctx.lineTo(x - offsetX, WORLD_HEIGHT - offsetY);
        ctx.stroke();
    }
    for (let y = 0; y < WORLD_HEIGHT; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0 - offsetY, y - offsetY);
        ctx.lineTo(WORLD_WIDTH - offsetX, y - offsetY);
        ctx.stroke();
    }

    // Draw Walls
    ctx.fillStyle = '#2c3e50';
    ctx.strokeStyle = '#34495e';
    ctx.lineWidth = 4;
    for (const wall of WALLS) {
        ctx.fillRect(wall.x - offsetX, wall.y - offsetY, wall.w, wall.h);
        ctx.strokeRect(wall.x - offsetX, wall.y - offsetY, wall.w, wall.h);
    }

    // Draw Bullets
    bullets.forEach(b => b.draw(offsetX, offsetY));

    // Draw Rockets
    rockets.forEach(r => r.draw(offsetX, offsetY));

    // Draw Bombs
    bombs.forEach(b => b.draw(offsetX, offsetY));

    // Draw Explosions
    explosions.forEach(e => e.draw(offsetX, offsetY));

    // Draw Bots
    entities.forEach(bot => bot.draw(offsetX, offsetY));

    // Draw Player
    if (!player.isDead) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(player.angle);

        ctx.shadowBlur = 15;
        ctx.shadowColor = TEAMS[player.teamId].color;
        ctx.beginPath();
        ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
        ctx.fillStyle = TEAMS[player.teamId].color;
        ctx.fill();

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
        ctx.fillText(TEAMS[player.teamId].name.toUpperCase() + " TAKIMI", canvas.width / 2, canvas.height / 2 - 40);
    } else {
        // Draw Respawn Timer
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Rajdhani';
        ctx.textAlign = 'center';
        ctx.fillText(`CANLANMA: ${Math.ceil(player.respawnTimer / 1000)}s`, canvas.width / 2, canvas.height / 2);
    }

    // Ensure no neon/colored shadows leak into the fog
    ctx.shadowBlur = 0;

    // Fog of War / Limited Visibility (20cm / 200px)
    if (gameRunning) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 300; // Expanded slightly for better feel

        const visionGrad = ctx.createRadialGradient(centerX, centerY, 50, centerX, centerY, radius);
        visionGrad.addColorStop(0, 'rgba(0,0,0,0)'); // Perfectly clear center
        visionGrad.addColorStop(1, 'rgba(0,0,0,0.98)'); // Dark edges

        ctx.fillStyle = visionGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }
}

function updateHUD() {
    if (healthBar) healthBar.style.width = player.health + '%';
    if (killCounter) killCounter.innerText = `Kills: ${kills}`;

    // Fluctuating fake count
    if (Math.random() < 0.01) {
        fakePlayerCount += Math.random() > 0.5 ? 1 : -1;
        if (fakePlayerCount < 700) fakePlayerCount = 700;
        if (fakePlayerCount > 800) fakePlayerCount = 800;
    }

    const countDisplay = document.getElementById('player-count-display');
    if (countDisplay) {
        countDisplay.innerText = `Çevrimiçi: ${fakePlayerCount} Oyuncu`;
    }

    const pointsSpan = document.getElementById('total-points');
    if (pointsSpan) pointsSpan.innerText = totalPoints;

    // Refresh class availability
    document.querySelectorAll('.class-btn').forEach(btn => {
        const type = btn.dataset.class;
        const weapon = WEAPONS[type];

        if (totalPoints < weapon.cost) {
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

        slot.classList.toggle('locked', locked);
    });
    const teamStatusList = document.getElementById('team-status-list');
    if (teamStatusList) {
        teamStatusList.innerHTML = '';
        TEAMS.forEach(team => {
            const div = document.createElement('div');
            div.className = 'team-status-item' + (team.isEliminated ? ' team-eliminated' : '');
            div.style.color = team.color;

            const aliveCount = (player.teamId === team.id ? (player.isDead ? 0 : 1) : 0) +
                entities.filter(e => e.teamId === team.id && !e.isDead).length;

            div.innerHTML = `<span>${team.name}</span> <span>${team.isEliminated ? 'ELENDİ' : aliveCount + '/3'}</span>`;
            teamStatusList.appendChild(div);
        });
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
    menuOverlay.classList.remove('hidden');
    menuOverlay.innerHTML = `
        <h1 class="menu-title">YENİLDİN!</h1>
        <div class="menu-info">
            <p>Skorun: ${kills} Leş</p>
        </div>
        <button id="restart-btn" class="premium-btn">YENİDEN DENE</button>
    `;
    document.getElementById('restart-btn').onclick = () => location.reload();
}

function loop(time) {
    const deltaTime = time - lastTime;
    lastTime = time;

    update(deltaTime);
    draw();

    requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Note: selectedMap is already declared at the top as 'NORMAL'

if (player.hasLordPackage) {
    alert("LORD PAKET AKTİF! Normal veya VIP Harita Seçebilirsin.");
}
if (player.hasVIPPackage) {
    alert("VIP PAKET AKTİF! İndirimlerin ve VIP Harita Hakkın Tanımlandı.");
}
updateHUD();

document.querySelectorAll('.map-btn').forEach(btn => {
    btn.onclick = () => {
        selectedMap = btn.dataset.map;
        document.getElementById('map-selection').classList.add('hidden');
        document.getElementById('start-btn').classList.remove('hidden');
        startGame();
    };
});

startBtn.onclick = () => {
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

function startGame() {
    // Security check: Force Normal Map if not eligible
    if (!(player.hasLordPackage || player.hasVIPPackage)) {
        selectedMap = 'NORMAL';
    }

    menuOverlay.classList.add('hidden');
    gameRunning = true;
    lastTime = Date.now();

    // Decrement Gold Trial if used
    if (goldTrial > 0 && !player.hasGoldPackage) {
        goldTrial--;
        localStorage.setItem('goldTrial', goldTrial);
    }

    updateHUD();
    requestAnimationFrame(loop);
}

// Class Selection Logic
document.querySelectorAll('.class-btn').forEach(btn => {
    btn.onclick = () => {
        const type = btn.dataset.class;
        const weapon = WEAPONS[type];

        if (totalPoints >= weapon.cost) {
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

const emperorBtn = document.getElementById('emperor-btn');
const emperorModal = document.getElementById('emperor-modal');
const closeBtn = document.querySelector('.close-btn');

if (emperorBtn) {
    emperorBtn.onclick = () => {
        emperorModal.classList.remove('hidden');
    };
}

if (closeBtn) {
    closeBtn.onclick = () => {
        emperorModal.classList.add('hidden');
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

function useKnife() {
    if (!gameRunning || player.isDead) return;
    const hasEffect = player.hasGoldPackage || (goldTrial > 0) || player.hasLordPackage;
    if (!hasEffect) return;

    const now = Date.now();
    if (now - lastKnifeTime < 1000) return;
    lastKnifeTime = now;
    player.swingProgress = 0.01;

    entities.forEach(bot => {
        if (bot.isDead) return;
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
                addKillFeed(`You knifed ${bot.name}!`);
                updateHUD();
                checkTeamEliminated(bot.teamId);
            }
        }
    });
}

function useBomb() {
    if (!gameRunning || player.isDead) return;
    if (!player.hasKingPackage && !player.hasLordPackage) return;
    const now = Date.now();
    if (now - lastBombTime < 3000) return;
    lastBombTime = now;
    bombs.push(new Bomb(player.x, player.y, player.angle, TEAMS[player.teamId].color, 'player', player.teamId));
}

function useRocket() {
    if (!gameRunning || player.isDead || !player.hasLordPackage) return;
    const now = Date.now();
    const fireRate = 1200; // Fast rockets
    if (now - lastShootTime < fireRate) return;
    lastShootTime = now;
    rockets.push(new Rocket(player.x, player.y, player.angle, TEAMS[player.teamId].color, 'player', player.teamId));
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
        if (player.hasLordPackage) {
            weapon = WEAPONS.AK47; // Forced AK47 boost
        }

        const now = Date.now();
        if (now - lastShootTime >= weapon.fireRate) {
            let dmg = weapon.damage;
            if (player.hasLordPackage) dmg *= 1.5; // Damage boost

            bullets.push(new Bullet(
                player.x,
                player.y,
                player.angle,
                TEAMS[player.teamId].color,
                'player',
                player.teamId,
                dmg,
                weapon.bulletSpeed
            ));
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

requestAnimationFrame(loop);
updateHUD(); // Initial HUD update to show points and locks
