import Phaser from 'phaser';

export function buildGameTextures(scene: Phaser.Scene): void {
  makeTexture(scene, 'shipTex',     64, 88, g => drawShipShape(g, 0xffffff, 0x112233, 0x00ccff, 0xff4400));
  makeTexture(scene, 'allyShipTex', 64, 88, g => drawShipShape(g, 0x00ff66, 0x003322, 0x00ffaa, 0x00ff44));
  makeTexture(scene, 'laserTex',    6,  26, g => {
    g.lineStyle(2, 0x00ffff, 1);
    g.beginPath();
    ([[3,0],[0,5],[6,10],[0,15],[6,20],[3,25]] as [number,number][])
      .forEach(([x,y],i) => i === 0 ? g.moveTo(x,y) : g.lineTo(x,y));
    g.strokePath();
  });
  makeTexture(scene, 'spreadTex',  10, 10, g => { g.fillStyle(0xff8800,1); g.fillCircle(5,5,4); });
  makeTexture(scene, 'beamTex',    8,  24, g => {
    g.fillStyle(0xffffff,1); g.fillRect(0,0,8,24);
    g.fillStyle(0x88ccff,0.6); g.fillRect(2,2,4,20);
  });
  makeTexture(scene, 'shotTex',    10, 10, g => {
    g.fillStyle(0xffcc00,1); g.fillRect(1,1,8,8);
    g.lineStyle(1,0xff6600,1); g.strokeRect(0,0,10,10);
  });
  makeTexture(scene, 'starTex',    30, 30, g => { g.lineStyle(1.5,0xffffff,1); traceStar(g,15,15,13,5,5); });
  makeTexture(scene, 'circleTex',  60, 60, g => {
    ([0xdd4444,0xaaaaaa,0x777777,0x555555] as number[])
      .forEach((c,i) => { g.lineStyle(2,c,1); g.strokeCircle(30,30,8+i*7); });
  });
  makeTexture(scene, 'bossTex',    80, 80, g => {
    g.lineStyle(2,0xff8800,1); traceStar(g,40,40,36,14,8);
    g.lineStyle(1,0xff4400,0.6); traceStar(g,40,40,28,10,8);
  });
  makeTexture(scene, 'asteroidTex', 20, 20, g => {
    g.fillStyle(0x666666, 1); g.fillCircle(10, 10, 9);
    g.lineStyle(1, 0x999999, 1); g.strokeCircle(10, 10, 9);
    // Crater marks give it a rocky silhouette.
    g.fillStyle(0x444444, 1); g.fillCircle(6,  7,  3);
    g.fillStyle(0x555555, 1); g.fillCircle(13, 13, 2);
    g.fillStyle(0x4a4a4a, 1); g.fillCircle(12, 5,  2);
  });
}

function makeTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  const g = scene.make.graphics(undefined, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function drawShipShape(
  g: Phaser.GameObjects.Graphics,
  outline: number,
  fill: number,
  cockpit: number,
  engine: number,
): void {
  // ── hull body ──────────────────────────────────────────────────────────────
  // Phaser retains the path after fillPath(), so strokePath() reuses it without
  // re-tracing the vertices (avoids the duplicate-literal code smell).
  g.fillStyle(fill, 0.9);
  g.lineStyle(2, outline, 1);
  traceDeltaBody(g);
  g.fillPath();
  g.strokePath();

  // ── wing armour panels (slightly lighter than hull, add layered depth) ────
  const armour = 0x1a3a55;
  g.fillStyle(armour, 0.8);
  g.beginPath();                                        // left wing panel
  g.moveTo(10, 56); g.lineTo(2,  64); g.lineTo(14, 78); g.lineTo(18, 62);
  g.closePath(); g.fillPath();
  g.beginPath();                                        // right wing panel
  g.moveTo(54, 56); g.lineTo(62, 64); g.lineTo(50, 78); g.lineTo(46, 62);
  g.closePath(); g.fillPath();

  // ── structural panel lines ─────────────────────────────────────────────────
  g.lineStyle(1, outline, 0.25);
  g.lineBetween(32, 2,  10, 56);    // left sweep line from nose
  g.lineBetween(32, 2,  54, 56);    // right sweep line from nose
  g.lineBetween(14, 78, 50, 78);    // base cross-member
  g.lineBetween(20, 42, 44, 42);    // mid-hull horizontal rib
  g.lineBetween(13, 58, 51, 58);    // lower horizontal rib
  g.lineStyle(1, outline, 0.15);
  g.lineBetween(10, 56, 14, 78);    // left trailing edge
  g.lineBetween(54, 56, 50, 78);    // right trailing edge

  // ── cockpit canopy ─────────────────────────────────────────────────────────
  // Hex body — fill then stroke on the same retained path.
  g.fillStyle(cockpit, 0.85);
  g.lineStyle(1, cockpit, 0.4);
  g.beginPath();
  g.moveTo(32, 8);  g.lineTo(38, 18);
  g.lineTo(38, 44); g.lineTo(32, 50);
  g.lineTo(26, 44); g.lineTo(26, 18);
  g.closePath();
  g.fillPath();
  g.strokePath();

  // Inner glass highlight — soft vertical strip on the port side of the canopy.
  g.fillStyle(0xffffff, 0.14);
  g.fillRect(27, 10, 4, 34);

  // Horizontal frame bars crossing the canopy at one-third and two-thirds.
  g.lineStyle(1, cockpit, 0.5);
  g.lineBetween(27, 22, 37, 22);    // upper frame bar
  g.lineBetween(27, 38, 37, 38);    // lower frame bar

  // ── engine pods ────────────────────────────────────────────────────────────
  // Heat-shroud outer ring
  g.lineStyle(2, 0x332211, 1);
  g.strokeCircle(22, 80, 9);
  g.strokeCircle(42, 80, 9);

  // Dark engine bay interior
  g.fillStyle(0x110800, 1);
  g.fillCircle(22, 80, 7);
  g.fillCircle(42, 80, 7);

  // Exhaust glow (engine colour)
  g.fillStyle(engine, 0.85);
  g.fillCircle(22, 80, 5);
  g.fillCircle(42, 80, 5);

  // Bright nozzle core
  g.fillStyle(0xffffff, 0.6);
  g.fillCircle(22, 79, 2.5);
  g.fillCircle(42, 79, 2.5);
}

// Traces the delta-wing hull outline without stroking or filling.
// Called once so fillPath() + strokePath() can reuse the same path.
function traceDeltaBody(g: Phaser.GameObjects.Graphics): void {
  g.beginPath();
  g.moveTo(32,  2);   // nose
  g.lineTo(62, 64);   // right wing tip
  g.lineTo(50, 78);   // right base
  g.lineTo(40, 84);   // right engine outer
  g.lineTo(32, 86);   // centre base
  g.lineTo(24, 84);   // left engine outer
  g.lineTo(14, 78);   // left base
  g.lineTo( 2, 64);   // left wing tip
  g.closePath();
}

function traceStar(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  pts: number,
): void {
  g.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const a = (i * Math.PI / pts) - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    i === 0
      ? g.moveTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r)
      : g.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
  }
  g.closePath(); g.strokePath();
}
