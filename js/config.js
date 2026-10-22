// Game tuning constants. Units: meters, seconds, radians.

export const WORLD = {
  size: 14000,          // terrain map side length
  segments: 220,        // terrain grid subdivisions
  boundary: 4200,       // beyond this radius: "return to the front" warning
  fogNear: 350,
  fogFar: 3300,
  fogColor: 0xc4d0d4,
  skyTop: 0x5b88bd,
  sunDir: [0.45, 0.62, -0.64],
};

// Flight model – simplified, "arcade with energy physics".
export const AIRCRAFT = {
  dr1: {           // Fokker Dr.I – player
    vmax: 50,      // max level-flight speed [m/s]
    thrust: 6.4,   // engine acceleration at full throttle [m/s²]
    stall: 18,     // stall speed
    rollRate: 2.6,
    pitchRate: 1.45,
    yawAssist: 0.25,
    rudder: 0.35,  // rudder (used by the AI for fine corrections)
    induced: 0.12, // speed loss under g-load
  },
  camel: {         // Sopwith Camel – enemy
    vmax: 53,
    thrust: 6.2,
    stall: 20,
    rollRate: 2.4,
    pitchRate: 1.25,
    yawAssist: 0.25,
    rudder: 0.35,
    induced: 0.12,
  },
};

export const GUNS = {
  player: {
    rate: 11,           // rounds/s (two Spandaus, alternating)
    speed: 820,
    life: 1.1,
    convergence: 150,   // gun convergence distance
    heatPerShot: 0.024,
    cooling: 0.16,
    jamTime: 2.6,
    randomJam: 0.0012,  // jam chance per shot
    ammo: 1000,
  },
  enemy: {
    rate: 8,
    speed: 780,
    life: 1.0,
    range: 420,
  },
};

export const COMBAT = {
  playerHealth: 100,
  playerHitDamage: 3,
  enemyHealth: 8,
  pilotKillChance: 0.03,
  hitRadiusEnemy: 4.2,
  hitRadiusPlayer: 3.2,
  collideDist: 7,
};
