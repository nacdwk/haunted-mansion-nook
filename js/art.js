// Official artwork, prepared by tools/prepare_art.py: the Stretching Room's four portraits and the
// ride's wallpaper for the Endless Hall. If the files are missing or fail to load, the house keeps its
// own painted portraits and wallpaper, so deleting assets/art/ is all it takes to go back to them.
import { THREE } from './core.js';
import { T, MAT } from './materials.js';

const DIR = './assets/art/';
const PORTRAITS = ['tightrope', 'dynamite', 'quicksand', 'widow'];   // the order of T.stretch
const WALLPAPER_WIDTH = 1.5;                                           // world units per repeat, across

export function loadOfficialArt() {
  const tl = new THREE.TextureLoader();
  const load = (f) => tl.loadAsync(`${DIR}${f}.webp`);
  return Promise.all([...PORTRAITS.map((p) => load(`stretch-${p}`)), load('wallpaper'), load('wallpaper-glow')])
    .then((t) => ({ portraits: t.slice(0, PORTRAITS.length), wallpaper: t[PORTRAITS.length], glow: t[PORTRAITS.length + 1] }));
}

// Call after buildMaterials() and before the house is built.
export function applyOfficialArt({ portraits, wallpaper, glow }) {
  for (const t of portraits) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; }
  T.stretch = portraits;
  T.stretchGlow = 0.05;      // these paintings are much lighter than the house's own
  for (const t of [wallpaper, glow]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  const m = MAT.papEyes;
  m.map = wallpaper;
  m.emissiveMap = glow;
  m.userData.uvScale = [WALLPAPER_WIDTH, WALLPAPER_WIDTH * wallpaper.image.height / wallpaper.image.width];
  m.needsUpdate = true;
}
