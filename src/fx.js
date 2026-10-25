import * as THREE from 'three';

// Short-lived visual effects: explosion flashes, smoke puffs, sparks and fireworks.
const PALETTE = ['#ff7a59', '#ffd23f', '#2fd3c4', '#fff3d6', '#ff5c8a'];

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.puffGeo = new THREE.IcosahedronGeometry(1, 0);
    this.sparkGeo = new THREE.OctahedronGeometry(0.5, 0);
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

  // Explosion: hot flash, puffs of smoke and a spray of sparks
  boom(pos, size = 1) {
    const flash = new THREE.Mesh(this.puffGeo, new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.position.copy(pos);
    this.scene.add(flash);
    let t = 0;
    this.add({
      update: (dt) => { t += dt; const k = t / 0.35; flash.scale.setScalar(size * (0.6 + k * 3.2)); flash.material.opacity = Math.max(0, 1 - k); return k < 1; },
      dispose: () => { this.scene.remove(flash); flash.material.dispose(); },
    });
    for (let i = 0; i < 9; i++) {
      const puff = new THREE.Mesh(this.puffGeo, new THREE.MeshStandardMaterial({ color: i % 3 ? '#e9e2d6' : '#cfc6b8', flatShading: true, transparent: true, roughness: 1 }));
      const dir = new THREE.Vector3().randomDirection(); dir.y = Math.abs(dir.y) * 0.8 + 0.2;
      puff.position.copy(pos);
      this.scene.add(puff);
      let pt = 0;
      const life = 1.4 + Math.random() * 0.6;
      this.add({
        update: (dt) => {
          pt += dt;
          puff.position.addScaledVector(dir, dt * size * 3.2 * Math.max(0.15, 1 - pt));
          puff.scale.setScalar(size * (0.5 + pt * 1.1));
          puff.material.opacity = Math.max(0, 0.85 * (1 - pt / life));
          return pt < life;
        },
        dispose: () => { this.scene.remove(puff); puff.material.dispose(); },
      });
    }
    this.sparks(pos, 50, 9 * size, ['#ffb347', '#ffe08a', '#ff7a59'], { life: 0.9, size: 0.35, up: 0.3 });
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
