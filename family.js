"use strict";

const dataUrl = "family.json";

function personLabel(person) {
  return person.name;
}

function personLink(person, className = "person-card") {
  const link = document.createElement("a");
  link.className =
    `${className} ${person.gender === "female" ? "female" : "male"}`;
  link.href = `person.html?id=${encodeURIComponent(person.id)}`;
  link.textContent = personLabel(person);
  link.dataset.personId = person.id;
  return link;
}

async function loadFamily() {
  const tree = document.querySelector("#family-tree");

  if (!tree) {
    console.error("No element with id '#family-tree' found.");
    return;
  }

  try {
    const response = await fetch(dataUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const people = await response.json();
    console.log("family.js: loaded people", people.length, people.map(p=>p.id));
    const byId = new Map(
      people.map(person => [person.id, person])
    );

    const childrenOf = id =>
      people.filter(
        person =>
          person.father === id ||
          person.mother === id
      );

    const root = byId.get("P001");

    if (!root) {
      console.error("family.js: root P001 not found in data", Array.from(byId.keys()));
      throw new Error("找不到根人物 P001");
    }
    console.log("family.js: drawing pedigree for root", root.id);
    drawPedigree(tree, root, childrenOf, byId);
    setupSearch(people);
  } catch (error) {
    tree.innerHTML = `
      <p class="error">
        无法载入族谱：${error.message}
      </p>
      <pre class="error-details">${(error && error.stack) || ''}</pre>
    `;

    console.error(error);
  }
}

function drawPedigree(viewport, root, childrenOf, byId) {
  const CARD_WIDTH = 148;
  const CARD_HEIGHT = 72;
  const LEAF_GAP = 36;
  const LEVEL_GAP = 64;
  const MARGIN = 50;

  // map of person id -> node for drawing relationship lines
  const nodeById = new Map();

  function makeNode(person, seen = new Set()) {
    if (seen.has(person.id)) {
      return {
        person,
        children: [],
        leaves: 1
      };
    }

    const nextSeen = new Set(seen);
    nextSeen.add(person.id);

    const children = childrenOf(person.id).map(
      child => makeNode(child, nextSeen)
    );

    const node = {
      person,
      children,
      leaves: Math.max(
        1,
        children.reduce(
          (sum, child) => sum + child.leaves,
          0
        )
      )
    };

    nodeById.set(person.id, node);

    return node;
  }

  const rootNode = makeNode(root);

  let maxDepth = 0;

  // assign depth to each node
  function assignDepth(node, depth) {
    node.depth = depth;
    maxDepth = Math.max(maxDepth, depth);
    node.children.forEach(child => assignDepth(child, depth + 1));
  }

  assignDepth(rootNode, 0);

  // collect leaf nodes in left-to-right order
  const leaves = [];
  function collectLeaves(node) {
    if (!node.children.length) {
      leaves.push(node);
    } else {
      node.children.forEach(child => collectLeaves(child));
    }
  }

  collectLeaves(rootNode);

  // assign x positions for leaves with equal spacing
  leaves.forEach((leaf, i) => {
    leaf.x = MARGIN + i * (CARD_WIDTH + LEAF_GAP);
  });

  // set parent x to be centered above its children (post-order)
  function centerParents(node) {
    if (node.children.length) {
      node.children.forEach(child => centerParents(child));
      const first = node.children[0];
      const last = node.children[node.children.length - 1];
      node.x = (first.x + last.x) / 2;
    }
  }

  centerParents(rootNode);

  // set y for every node based on its depth -> one horizontal row per generation
  function setY(node) {
    node.y = MARGIN + node.depth * (CARD_HEIGHT + LEVEL_GAP);
    node.children.forEach(child => setY(child));
  }

  setY(rootNode);

  // create spouse nodes in the node map (not rendered yet) so positioning can account for spouses
  const SPOUSE_OFFSET = CARD_WIDTH + 36; // increase offset to give spouses more breathing room
  const spousePlaced = new Map();

  for (const [id, node] of Array.from(nodeById)) {
    const spouses = node.person.spouses || [];
    let idx = 0;
    for (const sid of spouses) {
      if (nodeById.has(sid)) continue; // already in tree
      const spousePerson = byId.get(sid);
      if (!spousePerson) continue;

      // compute initial spouse x, then avoid collisions with existing nodes on same row
      const baseX = node.x + SPOUSE_OFFSET + idx * (CARD_WIDTH + 12);
      const minSep = CARD_WIDTH + 12;
      let sX = baseX;
      let collision;
      do {
        collision = false;
        for (const existing of nodeById.values()) {
          if (existing.depth !== node.depth) continue;
          if (Math.abs(existing.x - sX) < minSep) {
            sX += minSep;
            collision = true;
          }
        }
      } while (collision);

      const sNode = {
        person: spousePerson,
        children: [],
        leaves: 1,
        depth: node.depth,
        x: sX,
        y: MARGIN + node.depth * (CARD_HEIGHT + LEVEL_GAP)
      };

      nodeById.set(sid, sNode);
      spousePlaced.set(sid, sNode);
      idx += 1;
    }
  }

  // shift subtrees so children are centered between parents when possible
  function shiftSubtree(n, dx) {
    n.x += dx;
    n.children.forEach(c => shiftSubtree(c, dx));
  }

  function balanceChildren(node) {
    if (node.children.length) {
      const first = node.children[0];
      const last = node.children[node.children.length - 1];
      const firstCenter = first.x + CARD_WIDTH / 2;
      const lastCenter = last.x + CARD_WIDTH / 2;
      const currentCenter = (firstCenter + lastCenter) / 2;

      const parentCenter = node.x + CARD_WIDTH / 2;
      let desiredCenter = parentCenter;

      if (node.person.spouses && node.person.spouses.length) {
        const sid = node.person.spouses[0];
        const spouseNode = nodeById.get(sid);
        if (spouseNode) {
          const spouseCenter = spouseNode.x + CARD_WIDTH / 2;
          desiredCenter = (parentCenter + spouseCenter) / 2;
        }
      }

      const dx = desiredCenter - currentCenter;
      if (Math.abs(dx) > 0.5) {
        node.children.forEach(c => shiftSubtree(c, dx));
      }
    }

    node.children.forEach(balanceChildren);
  }

  balanceChildren(rootNode);

  // recompute overall width/height from node positions
  let minX = Infinity;
  let maxX = -Infinity;
  for (const n of nodeById.values()) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x + CARD_WIDTH);
  }

  const width = Math.max(720, MARGIN * 2 + (maxX - minX));

  const height = MARGIN * 2 + (maxDepth + 1) * CARD_HEIGHT + maxDepth * LEVEL_GAP;

  viewport.textContent = "";

  const stage = document.createElement("div");
  stage.className = "pedigree-stage";
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;

  const svg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );

  svg.classList.add("pedigree-lines");
  svg.setAttribute(
    "viewBox",
    `0 0 ${width} ${height}`
  );
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  stage.append(svg);

  function addLine(x1, y1, x2, y2) {
    const line = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);

    line.setAttribute("stroke", "#8a3f2d");
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-linecap", "round");
    console.log("family.js: addLine", x1, y1, x2, y2);

    svg.append(line);
    return line;
  }

  // draw spouse/relationship lines between node centers
  function drawRelationshipLines() {
    console.log("family.js: drawing spouse lines from DOM positions");
    console.log("family.js: nodeById keys", Array.from(nodeById.keys()));

    const stageRect = stage.getBoundingClientRect();

    for (const [id, node] of nodeById) {
      if (!node.person.spouses || !node.person.spouses.length) continue;

      // prefer any person-card rendered for this id, otherwise fall back to the group container
      const el = stage.querySelector(`.person-card[data-person-id="${id}"]`) || stage.querySelector(`[data-id="${id}"]`);
      if (!el) {
        console.log(`family.js: spouse source element missing for ${id}`);
        continue;
      }

      const r1 = el.getBoundingClientRect();
      const x1 = r1.left - stageRect.left + r1.width / 2;
      const y1 = r1.top - stageRect.top + r1.height / 2;

      for (const sid of node.person.spouses) {
        if (id >= sid) continue; // avoid duplicates

        const otherEl = stage.querySelector(`.person-card[data-person-id="${sid}"]`) || stage.querySelector(`[data-id="${sid}"]`);
        if (!otherEl) {
          console.log(`family.js: spouse target element missing for ${sid}`);
          continue;
        }

        const r2 = otherEl.getBoundingClientRect();
        const x2 = r2.left - stageRect.left + r2.width / 2;
        const y2 = r2.top - stageRect.top + r2.height / 2;

        addLine(x1, y1, x2, y2);
      }
    }
  }

  function render(node) {
    const group = document.createElement("div");

    group.className =
      `pedigree-person ${
        node.depth === 0 ? "founding-couple" : ""
      }`;

    group.style.left = `${node.x}px`;
    group.style.top = `${node.y}px`;

    group.append(personLink(node.person));
    group.dataset.id = node.person.id;

    if (node.depth === 0) {
      // do not render spouses inline; spouse nodes are rendered separately and connected with dashed lines
    }

    stage.append(group);

    if (node.children.length) {
      node.children.forEach(child => render(child));
    }
  }
  // render nodes
  render(rootNode);
  viewport.append(stage);

  // render spouse nodes that were added to nodeById earlier
  for (const [sid, sNode] of spousePlaced) {
    const sGroup = document.createElement('div');
    sGroup.className = 'pedigree-person';
    sGroup.style.left = `${sNode.x}px`;
    sGroup.style.top = `${sNode.y}px`;
    sGroup.dataset.id = sNode.person.id;
    sGroup.append(personLink(sNode.person));
    stage.append(sGroup);
  }

  // draw parent->child connectors using DOM positions so lines meet card centers
  function drawParentChildLines() {
    const stageRect = stage.getBoundingClientRect();

    for (const [id, node] of nodeById) {
      if (!node.children || !node.children.length) continue;

      const parentEl = stage.querySelector(`[data-id="${id}"]`);
      if (!parentEl) continue;

      // prefer the actual card element for centering (the .person-card inside the group)
      const parentCard = parentEl.querySelector('.person-card') || parentEl;
      const pr = parentCard.getBoundingClientRect();
      const parentCenterX = pr.left - stageRect.left + pr.width / 2;
      const parentCenterY = pr.top - stageRect.top + pr.height / 2;

      const firstChildEl = stage.querySelector(`[data-id="${node.children[0].person.id}"]`);
      const lastChildEl = stage.querySelector(`[data-id="${node.children[node.children.length - 1].person.id}"]`);
      if (!firstChildEl || !lastChildEl) continue;

      const fr = firstChildEl.querySelector('.person-card')?.getBoundingClientRect() || firstChildEl.getBoundingClientRect();
      const lr = lastChildEl.querySelector('.person-card')?.getBoundingClientRect() || lastChildEl.getBoundingClientRect();

      const firstCenterX = fr.left - stageRect.left + fr.width / 2;
      const lastCenterX = lr.left - stageRect.left + lr.width / 2;

      // children are on the same generation row, take their center Y
      const childCenterY = fr.top - stageRect.top + fr.height / 2;

      // junction midway between parent center and child center
      const junctionY = (parentCenterY + childCenterY) / 2;

      // compute child group center
      const childGroupCenter = (firstCenterX + lastCenterX) / 2;

      // if parent has a spouse shown on the stage, compute spouse midpoint,
      // then average it with the child group center so the attach point is balanced
      let attachX = parentCenterX;
      if (node.person.spouses && node.person.spouses.length) {
        for (const sid of node.person.spouses) {
          const spouseEl = stage.querySelector(`.person-card[data-person-id="${sid}"]`) || stage.querySelector(`[data-id="${sid}"]`);
          if (spouseEl) {
            const sr = spouseEl.getBoundingClientRect();
            const spouseCenterX = sr.left - stageRect.left + sr.width / 2;
            const spouseMid = (parentCenterX + spouseCenterX) / 2;
            // average spouse-midpoint and child group center for balanced attach
            attachX = (spouseMid + childGroupCenter) / 2;
            break;
          }
        }
      } else {
        // no spouse: center attach to child group center
        attachX = childGroupCenter;
      }

      // vertical from the attach point (balanced midpoint)
      addLine(attachX, parentCenterY, attachX, junctionY);
      // horizontal spine across children (ensure span covers all children and the attach point)
      const hStart = Math.min(firstCenterX, attachX);
      const hEnd = Math.max(lastCenterX, attachX);
      addLine(hStart, junctionY, hEnd, junctionY);

      for (const child of node.children) {
        const childEl = stage.querySelector(`[data-id="${child.person.id}"]`);
        if (!childEl) continue;
        const crect = childEl.querySelector('.person-card')?.getBoundingClientRect() || childEl.getBoundingClientRect();
        const childCenterX = crect.left - stageRect.left + crect.width / 2;
        const childCenterY = crect.top - stageRect.top + crect.height / 2;
        addLine(childCenterX, junctionY, childCenterX, childCenterY);
      }
    }
  }

  drawParentChildLines();

  // draw spouse lines after parent-child lines
  drawRelationshipLines();
  console.log("family.js: total lines drawn", svg.querySelectorAll('line').length);

  viewport.scrollLeft = Math.max(
    0,
    (width - viewport.clientWidth) / 2
  );
}

function setupSearch(people) {
  const input =
    document.querySelector("#person-search");

  const results =
    document.querySelector("#search-results");

  if (!input || !results) {
    console.warn("Search elements (#person-search or #search-results) not found.");
    return;
  }

  input.addEventListener("input", () => {
    const query = input.value
      .trim()
      .toLocaleLowerCase("zh-CN");

    results.textContent = "";

    if (!query) {
      results.hidden = true;
      return;
    }

    const matches = people
      .filter(person =>
        person.name
          .toLocaleLowerCase("zh-CN")
          .includes(query)
      )
      .slice(0, 8);

    if (!matches.length) {
      results.textContent = "没有找到匹配人物";
    } else {
      matches.forEach(person => {
        results.append(
          personLink(person, "search-result")
        );
      });
    }

    results.hidden = false;
  });
}

loadFamily();
