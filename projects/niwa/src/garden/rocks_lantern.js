// niwa/src/garden/rocks_lantern.js: where the garden's lanterns and bonbori stand (plan.LANTERNS, plan.BONBORI). The
// lanterns themselves are the kit's (engine/scene3d/kit/lantern/lantern.js: the kasuga on a museum original, the yukimi,
// the kotoji, the oribe, the bonbori); here, niwa's rules for setting them: the yukimi on its flat stone at the water's
// edge, the kotoji's legs to the bank stone and the pond's floor (rocks.js lanternStones), every lantern's seeds.
import { lanternGeos, bonboriGeos, lampOn, FIRE, PAPER } from 'scene3d/kit/lantern/lantern.js';

export { lampOn, FIRE, PAPER };

export function buildLanterns({ P, heightAt, mossAt, kotoji, yukimiTop }) {
  const WL = P.WATER_LEVEL;
  const stoneGeos = [], paperGeos = [], flameGeos = [], recs = [];
  P.LANTERNS.forEach((L, li) => {
    const s = L.s || 1;
    let H, ground = heightAt(...L.at), legFeet = null;
    if (L.kind === 'kasuga') H = 1.82 * s;
    else if (L.kind === 'oribe') H = 1.3 * s;
    else if (L.kind === 'yukimi') {
      H = 1.0 * s;
      // it stands at the water's edge on a broad flat stone just proud of the water
      ground = yukimiTop ?? Math.max(WL + 0.1, ground);
    } else if (L.kind === 'kotoji') {
      // two legs, one long into the water, one short onto a stone on the bank (Kenroku-en's kotoji-toro)
      H = 1.2 * s;
      ground = kotoji.datum;                           // the body's datum: its legs reach down to their own feet
      legFeet = kotoji.feet;
    } else return;
    const rot = L.kind === 'kotoji' ? kotoji.yaw : (L.rot || 0) * Math.PI / 180;
    const g = lanternGeos({ kind: L.kind, at: L.at, ground, yaw: rot, H, seed: 600 + li * 31, tone: (li * 0.37 + 0.11) % 1, paperSeed: li, legFeet, heightAt, mossAt });
    stoneGeos.push(...g.stoneGeos); paperGeos.push(...g.paperGeos); flameGeos.push(...g.flameGeos);
    recs.push(g.rec);
  });
  return { stoneGeos, paperGeos, flameGeos, recs };
}

export function buildBonbori(P, heightAt) {
  const wood = [], paper = [], stone = [], foot = [], lights = [];
  P.BONBORI.forEach((xz, i) => {
    const b = bonboriGeos(xz, i, heightAt);
    wood.push(...b.wood); paper.push(...b.paper); stone.push(...b.stone); foot.push(b.foot); lights.push(b.light);
  });
  return { wood, paper, stone, foot, lights };
}
