import * as THREE from 'three';
import { shade } from './shading.js';
import { heightAt } from './terrain.js';

// Short-lived visual effects: explosion flashes, smoke puffs, sparks and fireworks.
const PALETTE = ['#ff7a59', '#ffd23f', '#2fd3c4', '#fff3d6', '#ff5c8a'];

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.puffGeo = new THREE.IcosahedronGeometry(1, 0);
    this.sparkGeo = new THREE.OctahedronGeometry(0.5, 0);
    this.ballGeo = new THREE.IcosahedronGeometry(0.5, 4);
    this.chunkGeo = new THREE.BoxGeometry(1, 0.7, 0.8);
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    this.discGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
    // Read by the main loop: camera shake (0 to 1, decays), slow motion, and the blast that bends the grass
    this.shake = 0;
    this.slow = 0;
    this.blastAt = new THREE.Vector4(0, 0, 0, 0); // x, z, radius, strength (decays)
  }

  add(item) {
    this.items.push(item);
  }

  // Spark burst: small glowing shapes (instanced, so it is one draw call) with velocity, gravity and fade.
  // Real geometry rather than GL points, because many devices cap the size of points.
  sparks(pos, count, speed, colors, { life = 1.2, size = 0.35, up = 0, gravity = 9, spread = 1 } = {}) {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const mesh = new THREE.InstancedMesh(this.sparkGeo, mat, count);
    mesh.frustumCulled = false; // instances move far from where the bounds were first measured
    const p = [], v = [], m = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      p.push(pos.clone());
      const d = new THREE.Vector3().randomDirection();
      d.y = Math.abs(d.y) * spread + up;
      v.push(d.normalize().multiplyScalar(speed * (0.55 + Math.random() * 0.45)));
      mesh.setColorAt(i, col.set(colors[i % colors.length]));
      mesh.setMatrixAt(i, m.compose(pos, q, sc.setScalar(size)));
    }
    this.scene.add(mesh);
    let t = 0;
    this.add({
      update: (dt) => {
        t += dt;
        const k = Math.max(0, 1 - t / life);
        sc.setScalar(size * (0.4 + 0.6 * k));
        for (let i = 0; i < count; i++) {
          v[i].y -= gravity * dt;
          p[i].addScaledVector(v[i], dt);
          mesh.setMatrixAt(i, m.compose(p[i], q, sc));
        }
        mesh.instanceMatrix.needsUpdate = true;
        mat.opacity = Math.min(1, k * 1.6);
        return t < life;
      },
      dispose: () => { this.scene.remove(mesh); mesh.dispose(); mat.dispose(); },
    });
  }

  // Splash: white and pale teal droplets thrown up off a wheel driving through water
  splash(pos, amount = 1) {
    this.sparks(pos, Math.round(7 * amount), 3.2 + amount * 1.6, ['#ffffff', '#e8fbf8', '#bfeee8'], { life: 0.6, size: 0.16, up: 1.4, gravity: 14, spread: 1.2 });
  }

  // Explosion (reworked 2026-10-30 to feel bigger and more alive, our own take on the reference's technique):
  // a fireball that swells fast and burns away through noise with a sooty edge, a shock ring along the
  // ground, tumbling debris, rolling smoke, a scorch mark that fades, sparks, a camera kick, the grass
  // flattened outward, and a moment of slow motion when the car is caught close.
  // The fireball is brighter than white, so the glow pass makes it flare by day and night.
  boom(pos, size = 1, { carDist = 99 } = {}) {
    const groundY = heightAt(pos.x, pos.z);
    this.fireball(pos, size);
    this.fireball(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * size, size * 0.6, (Math.random() - 0.5) * size)), size * 0.65, 0.12);
    this.shockRing(new THREE.Vector3(pos.x, groundY + 0.08, pos.z), size);
    this.scorch(new THREE.Vector3(pos.x, groundY + 0.04, pos.z), size);
    this.debris(pos, size);
    for (let i = 0; i < 10; i++) this.smoke(pos, size, i);
    this.sparks(pos, 60, 10 * size, ['#ffb347', '#ffe08a', '#ff7a59', '#fff3c0'], { life: 1.1, size: 0.3, up: 0.5 });
    this.shake = Math.max(this.shake, Math.min(1, size * (1.4 - carDist / 14)));
    if (carDist < 5 * size) this.slow = 0.3;
    this.blastAt.set(pos.x, pos.z, 7 * size, 1);
  }

  fireball(pos, size, delay = 0) {
    const uniforms = { uProgress: { value: 0 }, uHot: { value: new THREE.Color('#fff1b0') }, uMid: { value: new THREE.Color('#ff8a2a') }, uCool: { value: new THREE.Color('#d6331f') }, uSoot: { value: new THREE.Color('#3a2440') }, uSeed: { value: Math.random() * 50 } };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vP; varying vec3 vN;
        void main() { vP = position; vN = normalize( normalMatrix * normal ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: /* glsl */ `
        uniform float uProgress; uniform vec3 uHot; uniform vec3 uMid; uniform vec3 uCool; uniform vec3 uSoot; uniform float uSeed;
        varying vec3 vP; varying vec3 vN;
        float h3( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
        float n3( vec3 p ) {
          vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( mix( h3( i ), h3( i + vec3( 1, 0, 0 ) ), f.x ), mix( h3( i + vec3( 0, 1, 0 ) ), h3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                      mix( mix( h3( i + vec3( 0, 0, 1 ) ), h3( i + vec3( 1, 0, 1 ) ), f.x ), mix( h3( i + vec3( 0, 1, 1 ) ), h3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
        }
        void main() {
          vec3 p = vP * 4.0 + uSeed;
          float n = n3( p ) * 0.6 + n3( p * 2.3 ) * 0.3 + n3( p * 5.1 ) * 0.1;
          float facing = clamp( dot( vN, vec3( 0.0, 0.0, 1.0 ) ), 0.0, 1.0 );
          float v = n + facing * 0.25 - uProgress; // burns away from the edges inward
          if ( v < 0.0 ) discard;
          vec3 c = mix( uCool, uMid, smoothstep( 0.05, 0.35, v ) );
          c = mix( c, uHot, smoothstep( 0.35, 0.7, v ) );
          c *= 2.6 * ( 1.0 - uProgress * 0.6 ); // brighter than white, so it glows
          c = mix( c, uSoot, smoothstep( 0.08, 0.0, v ) ); // a sooty edge where it is burning away
          gl_FragColor = vec4( c, 1.0 );
        }`,
    });
    const ball = new THREE.Mesh(this.ballGeo, mat);
    ball.position.copy(pos);
    ball.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    ball.visible = false;
    this.scene.add(ball);
    let t = -delay;
    this.add({
      update: (dt) => {
        t += dt;
        if (t < 0) return true;
        ball.visible = true;
        const grow = 1 - Math.pow(1 - Math.min(1, t / 0.5), 3);
        ball.scale.set(1, 0.85, 1).multiplyScalar(size * (0.6 + 3.4 * grow));
        ball.position.y += dt * 0.8 * size;
        ball.rotation.y += dt * 0.6;
        uniforms.uProgress.value = THREE.MathUtils.clamp((t - 0.15) / 1.6, 0, 1.05) * 1.05;
        return t < 1.9;
      },
      dispose: () => { this.scene.remove(ball); mat.dispose(); },
    });
  }

  shockRing(pos, size) {
    const mat = new THREE.MeshBasicMaterial({ color: '#fff0c8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(this.ringGeo, mat);
    ring.position.copy(pos);
    this.scene.add(ring);
    let t = 0;
    this.add({
      update: (dt) => { t += dt; const k = t / 0.45; ring.scale.setScalar(size * (1 + 7 * Math.sqrt(k))); mat.opacity = 0.6 * (1 - k); return k < 1; },
      dispose: () => { this.scene.remove(ring); mat.dispose(); },
    });
  }

  scorch(pos, size) {
    const mat = new THREE.MeshBasicMaterial({ color: '#2b1c26', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const disc = new THREE.Mesh(this.discGeo, mat);
    disc.position.copy(pos);
    disc.scale.setScalar(size * 2.2);
    disc.rotation.y = Math.random() * 6;
    this.scene.add(disc);
    let t = 0;
    this.add({
      update: (dt) => { t += dt; mat.opacity = 0.55 * (1 - THREE.MathUtils.smoothstep(t, 3, 8)); return t < 8; },
      dispose: () => { this.scene.remove(disc); mat.dispose(); },
    });
  }

  // Tumbling chunks that arc out, bounce once or twice on the ground and settle
  debris(pos, size) {
    const colors = ['#5d402c', '#a87950', '#3a3036', '#c79867'];
    for (let i = 0; i < 12; i++) {
      const mat = shade(new THREE.MeshStandardMaterial({ color: colors[i % colors.length], flatShading: true, roughness: 0.9 }));
      const m = new THREE.Mesh(this.chunkGeo, mat);
      m.castShadow = true;
      m.position.copy(pos);
      m.scale.setScalar(size * (0.12 + Math.random() * 0.16));
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2, out = 4 + Math.random() * 6;
      const v = new THREE.Vector3(Math.cos(a) * out, 6 + Math.random() * 6, Math.sin(a) * out).multiplyScalar(Math.sqrt(size));
      const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
      let t = 0;
      this.add({
        update: (dt) => {
          t += dt;
          v.y -= 22 * dt;
          m.position.addScaledVector(v, dt);
          const g = heightAt(m.position.x, m.position.z) + m.scale.y * 0.35;
          if (m.position.y < g) { m.position.y = g; v.y = Math.abs(v.y) * 0.3; v.x *= 0.6; v.z *= 0.6; spin.multiplyScalar(0.5); }
          m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; m.rotation.z += spin.z * dt;
          if (t > 3) m.scale.multiplyScalar(1 - dt * 3);
          return t < 4;
        },
        dispose: () => { this.scene.remove(m); mat.dispose(); },
      });
    }
  }

  // Rolling smoke: puffs that rise, drift outward and fade, from warm grey to the island's purple shadow
  smoke(pos, size, i) {
    const mat = shade(new THREE.MeshStandardMaterial({ color: i % 3 ? '#d9cfc6' : '#a99aa8', flatShading: true, transparent: true, roughness: 1, depthWrite: false }));
    const puff = new THREE.Mesh(this.puffGeo, mat);
    const dir = new THREE.Vector3().randomDirection(); dir.y = Math.abs(dir.y) * 0.6 + 0.35;
    puff.position.copy(pos);
    puff.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    this.scene.add(puff);
    let t = -0.12 - Math.random() * 0.25;
    const life = 2.2 + Math.random() * 1.2;
    this.add({
      update: (dt) => {
        t += dt;
        if (t < 0) { puff.visible = false; return true; }
        puff.visible = true;
        puff.position.addScaledVector(dir, dt * size * 3 * Math.max(0.12, 1 - t * 0.9));
        puff.position.y += dt * 0.6;
        puff.scale.setScalar(size * (0.7 + t * 0.9));
        puff.rotation.y += dt * 0.3;
        mat.opacity = Math.max(0, 0.85 * (1 - t / life));
        return t < life;
      },
      dispose: () => { this.scene.remove(puff); mat.dispose(); },
    });
  }

  // A soft puff of sand or dust kicked up by the wheels
  dust(pos, size = 1) {
    const puff = new THREE.Mesh(this.puffGeo, this.dustMat ??= shade(new THREE.MeshStandardMaterial({ color: '#e8d2a6', flatShading: true, transparent: true, opacity: 0.7, roughness: 1, depthWrite: false })));
    const m = puff.material.clone();
    puff.material = m;
    puff.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3));
    this.scene.add(puff);
    let t = 0;
    const life = 0.7 + Math.random() * 0.4;
    this.add({
      update: (dt) => { t += dt; puff.position.y += dt * 0.6; puff.scale.setScalar(size * (0.18 + t * 0.7)); m.opacity = 0.65 * Math.max(0, 1 - t / life); return t < life; },
      dispose: () => { this.scene.remove(puff); m.dispose(); },
    });
  }

  // A rocket that climbs, then bursts into colored stars
  firework(pos, height = 11, colors = PALETTE) {
    const rocket = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6), new THREE.MeshBasicMaterial({ color: colors[0] }));
    rocket.position.copy(pos);
    this.scene.add(rocket);
    const top = pos.y + height;
    let t = 0, trail = 0;
    this.add({
      update: (dt) => {
        t += dt;
        rocket.position.y += dt * (height / 0.75);
        rocket.position.x += Math.sin(t * 9) * 0.02;
        trail += dt;
        if (trail > 0.05) { trail = 0; this.sparks(rocket.position.clone(), 3, 1.2, ['#ffe08a'], { life: 0.4, size: 0.15, gravity: 2 }); }
        if (rocket.position.y >= top) {
          const c = colors.slice().sort(() => Math.random() - 0.5).slice(0, 2);
          this.sparks(rocket.position.clone(), 90, 7, c, { life: 1.6, size: 0.24, gravity: 3.5, spread: 1 });
          return false;
        }
        return true;
      },
      dispose: () => { this.scene.remove(rocket); rocket.geometry.dispose(); rocket.material.dispose(); },
    });
  }

  // A little show of several rockets around a point
  celebrate(pos, count = 4) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        // The camera looks down from the south (+Z), so rockets launched a little toward it burst in view
        const h = 4.5 + Math.random() * 2;
        const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0.5, h * 0.5 + (Math.random() - 0.5) * 3));
        this.firework(p, h);
      }, i * 260);
    }
  }

  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.slow = Math.max(0, this.slow - dt);
    this.blastAt.w = Math.max(0, this.blastAt.w - dt * 1.4);
    // Effects can spawn new effects while updating (rocket trails, bursts), so run over a
    // snapshot and keep anything added during the pass.
    const current = this.items;
    this.items = [];
    const kept = current.filter((it) => {
      const alive = it.update(dt);
      if (!alive) it.dispose();
      return alive;
    });
    this.items = kept.concat(this.items);
  }
}
