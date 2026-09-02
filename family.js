"use strict";

const dataUrl = "family.json";

function personLabel(person) {
  return person.birth ? `${person.name} (${person.birth})` : person.name;
}

function personLink(person, className = "person-card") {
  const link = document.createElement("a");
  link.className =
    `${className} ${person.gender === "female" ? "female" : "male"}`;
  link.href = `person.html?id=${encodeURIComponent(person.id)}`;
  link.textContent = personLabel(person);
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
  const LEVEL_GAP = 116;
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

  const width = Math.max(
    720,
    MARGIN * 2 +
      leaves.length * CARD_WIDTH +
      Math.max(0, leaves.length - 1) * LEAF_GAP
  );

  const height =
    MARGIN * 2 +
    (maxDepth + 1) * CARD_HEIGHT +
    maxDepth * LEVEL_GAP;

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
  svg.setAttribute("aria-hidden", "true");
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
  }

  // draw spouse/relationship lines between node centers
  function drawRelationshipLines() {
    console.log("family.js: nodeById keys", Array.from(nodeById.keys()));

    for (const [id, node] of nodeById) {
      if (!node.person.spouses || !node.person.spouses.length) continue;

      for (const sid of node.person.spouses) {
        if (!nodeById.has(sid)) {
          console.log(`family.js: skipping spouse line ${id} -> ${sid} (node missing)`);
          continue;
        }

        // avoid drawing duplicate lines: only draw when id < sid
        if (id >= sid) {
          console.log(`family.js: skipping duplicate spouse line ${id} -> ${sid}`);
          continue;
        }

        const other = nodeById.get(sid);

        const x1 = node.x + CARD_WIDTH / 2;
        const y1 = node.y + CARD_HEIGHT / 2;
        const x2 = other.x + CARD_WIDTH / 2;
        const y2 = other.y + CARD_HEIGHT / 2;

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

    if (node.depth === 0) {
      (node.person.spouses || []).forEach(id => {
        const spouse = byId.get(id);

        if (!spouse) {
          return;
        }

        const join = document.createElement("span");
        join.className = "spouse-join";
        join.textContent = "配偶";

        group.append(join, personLink(spouse));
      });
    }

    stage.append(group);

    if (node.children.length) {
      const parentCenterX =
        node.x + CARD_WIDTH / 2;

      const parentBottomY =
        node.y + CARD_HEIGHT;

      const junctionY =
        parentBottomY + LEVEL_GAP / 2;

      const firstCenterX =
        node.children[0].x + CARD_WIDTH / 2;

      const lastCenterX =
        node.children[node.children.length - 1].x +
        CARD_WIDTH / 2;

      addLine(
        parentCenterX,
        parentBottomY,
        parentCenterX,
        junctionY
      );

      addLine(
        firstCenterX,
        junctionY,
        lastCenterX,
        junctionY
      );

      node.children.forEach(child => {
        const childCenterX =
          child.x + CARD_WIDTH / 2;

        addLine(
          childCenterX,
          junctionY,
          childCenterX,
          child.y
        );

        render(child);
      });
    }
  }

  // render nodes (which also draws parent->child connectors)
  render(rootNode);
  viewport.append(stage);

  // draw spouse/relationship connector lines on top of svg (but beneath person cards)
  drawRelationshipLines();
  console.log("family.js: total lines drawn", svg.querySelectorAll('line').length);
  viewport.append(stage);

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
