// 收藏页: every reward by category. Owned items can be put on / used (the choice is saved and
// used in the game); the others show a silhouette and how to get them.
import { CATEGORIES, ALL_ITEMS, ITEMS, isOwned, conditionText } from './collection.js';
import { GOALS, TIERS } from './chest.js';
import { prizeSVG } from './chestshow.js';

const $ = (s) => document.querySelector(s);

const inUse = (col, it) => (it.cat === 'outfit' ? col.equip[it.slot] === it.id : col.equip[it.cat] === it.id);

export function renderCollection(col, onPick) {
  const owned = ITEMS.filter((i) => col.owned.includes(i.id)).length;
  $('#col-count').textContent = `${owned}/${ITEMS.length}`;
  $('#goal-list').innerHTML = GOALS.map((g) => `<li>${g.text}</li>`).join('');
  const cats = $('#col-cats');
  cats.innerHTML = '';
  for (const c of CATEGORIES) {
    const sec = document.createElement('section'); sec.className = 'col-cat';
    sec.innerHTML = `<h3>${c.name}</h3><div class="col-grid"></div>`;
    const grid = sec.querySelector('.col-grid');
    for (const it of ALL_ITEMS.filter((i) => i.cat === c.key)) {
      const have = isOwned(col, it.id);
      const b = document.createElement('button');
      b.type = 'button'; b.className = `col-item${have ? '' : ' locked'}${have && inUse(col, it) ? ' on' : ''}${it.tier === 4 ? ' rainbow' : ''}`;
      b.dataset.id = it.id;
      if (it.tier >= 0) b.style.setProperty('--tc', TIERS[it.tier].color);
      const sub = !have ? conditionText(it) : it.tier < 0 ? '一开始就有' : it.cat === 'outfit' ? (inUse(col, it) ? '点一下取下' : '点一下穿上') : inUse(col, it) ? '正在使用' : '点一下使用';
      b.innerHTML = `${it.tier >= 0 ? '<i class="tier-dot"></i>' : ''}<span class="ci-ico">${prizeSVG(it, 62)}</span><b>${have ? it.name : '？？？'}</b><small>${sub}</small>`;
      b.disabled = !have;
      grid.appendChild(b);
    }
    cats.appendChild(sec);
  }
  cats.onclick = (e) => { const b = e.target.closest('.col-item'); if (b && !b.disabled) onPick(b.dataset.id); };
}
