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

  try {
    const response = await fetch(dataUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const people = await response.json();
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
      throw new Error("找不到根人物 P001");
    }

    drawPedigree(tree, root, childrenOf, byId);
    setupSearch(people);
  } catch (error) {
    tree.innerHTML = `
      <p class="error">
        无法载入族谱。请确认 family.json 已上传，
        并通过 GitHub Pages 访问网站。
      </p>
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

    return {
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
  }

  const rootNode = makeNode(root);

  let leafCursor = 0;
  let maxDepth = 0;

  function position(node, depth) {
    maxDepth = Math.max(maxDepth, depth);
    node.depth = depth;

    if (!node.children.length) {
      node.x =
        MARGIN +
        leafCursor * (CARD_WIDTH + LEAF_GAP);

      leafCursor += 1;
    } else {
      node.children.forEach(
        child => position(child, depth + 1)
      );

      const first = node.children[0];
      const last =
        node.children[node.children.length - 1];

      node.x = (first.x + last.x) / 2;
    }

    node.y =
      MARGIN +
      depth * (CARD_HEIGHT + LEVEL_GAP);
  }

  position(rootNode, 0);

  const width = Math.max(
    720,
    MARGIN * 2 +
      leafCursor * CARD_WIDTH +
      Math.max(0, leafCursor - 1) * LEAF_GAP
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

    svg.append(line);
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

  render(rootNode);
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
