/**
 * Stonewild — first-person held item/hand.
 *
 * Plain THREE.Object3D attached directly to the camera (camera-local space),
 * not a React component — it only ever needs a handful of boxes, so there's
 * no benefit to routing it through React, and attaching straight to the
 * camera means it automatically tracks look direction for free.
 *
 * Empty-handed shows a simple blocky arm; a tool shows a handle + head
 * silhouette (shape depends on the item's icon descriptor — see
 * items.js); a placeable block shows a small cube in that block's color.
 * `swing()` plays a short, snappy animation for a break hit, an attack, or
 * a placement — never long enough to feel unresponsive.
 */

import * as THREE from "three";
import { getItem } from "./items.js";

const BASE_POS = new THREE.Vector3(0.42, -0.36, -0.65);
const BASE_ROT = new THREE.Euler(0.12, -0.22, 0.08);

export class HeldItemRig {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.position.copy(BASE_POS);
    this.group.rotation.copy(BASE_ROT);
    camera.add(this.group);

    this.content = new THREE.Group();
    this.group.add(this.content);

    this.currentItemId = undefined;
    this.swingT = 0;
    this._renderEmpty();
  }

  _clear() {
    for (let i = this.content.children.length - 1; i >= 0; i--) {
      const child = this.content.children[i];
      this.content.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
  }

  _renderEmpty() {
    this._clear();
    const skin = new THREE.MeshLambertMaterial({ color: "#d9a066" });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.55), skin);
    arm.position.set(0, 0, 0.1);
    this.content.add(arm);
  }

  _renderTool(def) {
    this._clear();
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.5, 0.09),
      new THREE.MeshLambertMaterial({ color: "#8a6a3f" }),
    );
    handle.position.set(0, -0.05, 0);
    this.content.add(handle);

    const headMat = new THREE.MeshLambertMaterial({ color: def.icon?.accent || "#9a978d" });
    let head;
    if (def.icon?.shape === "pickaxe") {
      head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), headMat);
      head.position.set(0, 0.22, 0);
    } else if (def.icon?.shape === "shovel") {
      head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.05), headMat);
      head.position.set(0, 0.26, 0);
    } else {
      head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.09), headMat);
      head.position.set(0.1, 0.22, 0);
    }
    this.content.add(head);
  }

  _renderBlock(def) {
    this._clear();
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.32, 0.32),
      new THREE.MeshLambertMaterial({ color: def.icon?.color || "#ffffff" }),
    );
    this.content.add(cube);
  }

  _renderResource(def) {
    this._clear();
    const chip = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.4),
      new THREE.MeshLambertMaterial({ color: def.icon?.color || "#ffffff" }),
    );
    this.content.add(chip);
  }

  setSelected(itemId) {
    if (itemId === this.currentItemId) return;
    this.currentItemId = itemId;
    const def = itemId ? getItem(itemId) : null;
    if (!def) this._renderEmpty();
    else if (def.category === "tool") this._renderTool(def);
    else if (def.category === "block") this._renderBlock(def);
    else this._renderResource(def);
  }

  swing() {
    this.swingT = 1;
  }

  update(dt, elapsed) {
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt * 5);
      const s = Math.sin((1 - this.swingT) * Math.PI);
      this.group.position.set(BASE_POS.x - s * 0.12, BASE_POS.y - s * 0.07, BASE_POS.z + s * 0.1);
      this.group.rotation.set(BASE_ROT.x - s * 0.55, BASE_ROT.y, BASE_ROT.z + s * 0.3);
    } else {
      const bob = Math.sin(elapsed * 2.2) * 0.007;
      this.group.position.set(BASE_POS.x, BASE_POS.y + bob, BASE_POS.z);
      this.group.rotation.copy(BASE_ROT);
    }
  }

  dispose() {
    this._clear();
    this.camera.remove(this.group);
  }
}
