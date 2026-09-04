"use strict";

const dataUrl = "family.json";

function personLabel(person) {
  return person.name;
}

function personLink(person, className = "person-card") {
  const link = document.createElement("a");

  link.className =
    `${className} ${person.gender === "female" ? "female" : "male"}`;

  link.href =
    `person.html?id=${encodeURIComponent(person.id)}`;

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
        无法载入族谱：${error.message}
      </p>
    `;

    console.error(error);
  }
}

function drawPedigree(
  viewport,
  root,
  childrenOf,
  byId
) {
  const CARD_WIDTH = 148;
  const CARD_HEIGHT = 72;
  const LEAF_GAP = 36;
  const LEVEL_GAP = 64;
  const SPOUSE_GAP = 80;
  const MARGIN = 50;

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

  function assignDepth(node, depth) {
    node.depth = depth;
    maxDepth = Math.max(maxDepth, depth);

    node.children.forEach(
      child => assignDepth(child, depth + 1)
    );
  }

  assignDepth(rootNode, 0);

  const leaves = [];

  function collectLeaves(node) {
    if (!node.children.length) {
      leaves.push(node);
    } else {
      node.children.forEach(collectLeaves);
    }
  }

  collectLeaves(rootNode);

  leaves.forEach((leaf, index) => {
    leaf.x =
      MARGIN +
      index * (CARD_WIDTH + LEAF_GAP);
  });

  function centerParents(node) {
    if (!node.children.length) {
      return;
    }

    node.children.forEach(centerParents);

    const first = node.children[0];
    const last =
      node.children[node.children.length - 1];

    node.x = (first.x + last.x) / 2;
  }

  centerParents(rootNode);

  function setY(node) {
    node.y =
      MARGIN +
      node.depth * (CARD_HEIGHT + LEVEL_GAP);

    node.children.forEach(setY);
  }

  setY(rootNode);

  /*
   * Spouses are added only after the normal family tree
   * has reached its final position.
   */
  const spousePlaced = new Map();

  function collidesAt(depth, candidateX) {
    const candidateLeft =
      candidateX - SPOUSE_GAP;

    const candidateRight =
      candidateX +
      CARD_WIDTH +
      SPOUSE_GAP;

    for (const existing of nodeById.values()) {
      if (existing.depth !== depth) {
        continue;
      }

      const existingLeft = existing.x;
      const existingRight =
        existing.x + CARD_WIDTH;

      if (
        candidateLeft < existingRight &&
        candidateRight > existingLeft
      ) {
        return true;
      }
    }

    return false;
  }

  for (const node of Array.from(nodeById.values())) {
    const spouses = node.person.spouses || [];

    for (const spouseId of spouses) {
      /*
       * If this person is already in the descendant
       * tree, do not create a second box.
       */
      if (nodeById.has(spouseId)) {
        continue;
      }

      const spousePerson = byId.get(spouseId);

      if (!spousePerson) {
        continue;
      }

      const step = CARD_WIDTH + SPOUSE_GAP;

      let distance = 1;
      let spouseX = null;

      while (spouseX === null) {
        const rightX =
          node.x + distance * step;

        const leftX =
          node.x - distance * step;

        if (!collidesAt(node.depth, rightX)) {
          spouseX = rightX;
        } else if (
          !collidesAt(node.depth, leftX)
        ) {
          spouseX = leftX;
        } else {
          distance += 1;
        }
      }

      const spouseNode = {
        person: spousePerson,
        children: [],
        leaves: 1,
        depth: node.depth,
        x: spouseX,
        y: node.y
      };

      nodeById.set(spouseId, spouseNode);
      spousePlaced.set(spouseId, spouseNode);
    }
  }

  /*
   * Calculate the size of the drawing.
   */
  let minX = Infinity;
  let maxX = -Infinity;

  for (const node of nodeById.values()) {
    minX = Math.min(minX, node.x);

    maxX = Math.max(
      maxX,
      node.x + CARD_WIDTH
    );
  }

  /*
   * Shift everything right if a spouse was placed
   * beyond the original left edge.
   */
  if (minX < MARGIN) {
    const shiftX = MARGIN - minX;

    for (const node of nodeById.values()) {
      node.x += shiftX;
    }

    maxX += shiftX;
    minX = MARGIN;
  }

  const width = Math.max(
    720,
    MARGIN * 2 + (maxX - minX)
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

  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
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

    line.setAttribute("stroke", "#8a3f2d");
    line.setAttribute("stroke-width", "3");
    line.setAttribute(
      "stroke-linecap",
      "round"
    );

    svg.append(line);
  }

  function render(node) {
    const group = document.createElement("div");

    group.className = "pedigree-person";

    group.style.left = `${node.x}px`;
    group.style.top = `${node.y}px`;

    group.dataset.id = node.person.id;
    group.append(personLink(node.person));

    stage.append(group);

    node.children.forEach(render);
  }

  render(rootNode);
  viewport.append(stage);

  /*
   * Render separately placed spouse boxes.
   */
  for (
    const [spouseId, spouseNode]
    of spousePlaced
  ) {
    const group = document.createElement("div");

    group.className = "pedigree-person";
    group.style.left = `${spouseNode.x}px`;
    group.style.top = `${spouseNode.y}px`;

    group.dataset.id = spouseId;
    group.append(personLink(spouseNode.person));

    stage.append(group);
  }

  /*
   * Measure actual browser-rendered card widths.
   *
   * This performs one final collision pass so CSS,
   * fonts, zoom, padding, and box-sizing cannot cause
   * married boxes to overlap.
   */
  function resolveRenderedSpouseOverlaps() {
    const RENDERED_GAP = 80;

    function groupFor(id) {
      return stage.querySelector(
        `[data-id="${id}"]`
      );
    }

    function cardWidth(group) {
      const card =
        group.querySelector(".person-card") ||
        group;

      return card.getBoundingClientRect().width;
    }

    function groupX(group) {
      return (
        Number.parseFloat(group.style.left) ||
        0
      );
    }

    function isFree(
      candidateX,
      candidateWidth,
      depth,
      ignoredIds
    ) {
      const candidateLeft =
        candidateX - RENDERED_GAP;

      const candidateRight =
        candidateX +
        candidateWidth +
        RENDERED_GAP;

      for (
        const [otherId, otherNode]
        of nodeById
      ) {
        if (
          otherNode.depth !== depth ||
          ignoredIds.has(otherId)
        ) {
          continue;
        }

        const otherGroup = groupFor(otherId);

        if (!otherGroup) {
          continue;
        }

        const otherLeft = groupX(otherGroup);

        const otherRight =
          otherLeft + cardWidth(otherGroup);

        if (
          candidateLeft < otherRight &&
          candidateRight > otherLeft
        ) {
          return false;
        }
      }

      return true;
    }

    for (
      const [spouseId, spouseNode]
      of spousePlaced
    ) {
      const spouseGroup = groupFor(spouseId);

      if (!spouseGroup) {
        continue;
      }

      /*
       * Find the spouse's partner in the main tree.
       */
      const partnerEntry =
        Array.from(nodeById.entries()).find(
          ([id, node]) =>
            id !== spouseId &&
            (node.person.spouses || [])
              .includes(spouseId)
        );

      if (!partnerEntry) {
        continue;
      }

      const [partnerId, partnerNode] =
        partnerEntry;

      const partnerGroup =
        groupFor(partnerId);

      if (!partnerGroup) {
        continue;
      }

      const spouseWidth =
        cardWidth(spouseGroup);

      const partnerWidth =
        cardWidth(partnerGroup);

      const ignoredIds =
        new Set([partnerId, spouseId]);

      const step =
        Math.max(CARD_WIDTH, spouseWidth) +
        RENDERED_GAP;

      /*
       * Prefer placing the spouse immediately to the
       * right with exactly an 80-pixel edge gap.
       */
      let candidateX =
        groupX(partnerGroup) +
        partnerWidth +
        RENDERED_GAP;

      /*
       * If another box occupies that space, move the
       * spouse farther right until the entire rendered
       * box and its margins are clear.
       */
      while (
        !isFree(
          candidateX,
          spouseWidth,
          partnerNode.depth,
          ignoredIds
        )
      ) {
        candidateX += step;
      }

      spouseNode.x = candidateX;

      spouseGroup.style.left =
        `${candidateX}px`;
    }

    /*
     * Increase the drawing width if moving a spouse
     * extends the tree.
     */
    let requiredWidth = width;

    for (const [id] of nodeById) {
      const group = groupFor(id);

      if (!group) {
        continue;
      }

      requiredWidth = Math.max(
        requiredWidth,
        groupX(group) +
          cardWidth(group) +
          MARGIN
      );
    }

    if (requiredWidth > width) {
      stage.style.width =
        `${requiredWidth}px`;

      svg.setAttribute(
        "viewBox",
        `0 0 ${requiredWidth} ${height}`
      );

      svg.setAttribute(
        "width",
        String(requiredWidth)
      );
    }
  }

  resolveRenderedSpouseOverlaps();

  /*
  * Center children beneath the midpoint of their parent couple.
  * Move every descendant subtree as one unit, including spouses,
  * so the spouse-spacing fix is preserved.
  */
  function balanceRenderedChildren(node) {
    if (!node.children.length) {
      return;
    }

    const stageRect = stage.getBoundingClientRect();

    function cardFor(id) {
      return stage.querySelector(
        `.person-card[data-person-id="${id}"]`
      );
    }

    function centerX(card) {
      const rect = card.getBoundingClientRect();

      return (
        rect.left -
        stageRect.left +
        rect.width / 2
      );
    }

    function shiftGroup(id, dx) {
      const group = stage.querySelector(
        `[data-id="${id}"]`
      );

      const shiftedNode = nodeById.get(id);

      if (!group || !shiftedNode) {
        return;
      }

      shiftedNode.x += dx;
      group.style.left = `${shiftedNode.x}px`;
    }

    function shiftSubtree(
      subtree,
      dx,
      shiftedSpouses = new Set()
    ) {
      shiftGroup(subtree.person.id, dx);

      for (
        const spouseId
        of subtree.person.spouses || []
      ) {
        if (
          spousePlaced.has(spouseId) &&
          !shiftedSpouses.has(spouseId)
        ) {
          shiftGroup(spouseId, dx);
          shiftedSpouses.add(spouseId);
        }
      }

      subtree.children.forEach(child => {
        shiftSubtree(
          child,
          dx,
          shiftedSpouses
        );
      });
    }

    const parentCard =
      cardFor(node.person.id);

    const firstChildCard =
      cardFor(node.children[0].person.id);

    const lastChildCard =
      cardFor(
        node.children[
          node.children.length - 1
        ].person.id
      );

    if (
      !parentCard ||
      !firstChildCard ||
      !lastChildCard
    ) {
      return;
    }

    const parentCenter =
      centerX(parentCard);

    let desiredCenter = parentCenter;

    const spouseCard =
      (node.person.spouses || [])
        .map(cardFor)
        .find(Boolean);

    if (spouseCard) {
      desiredCenter =
        (
          parentCenter +
          centerX(spouseCard)
        ) / 2;
    }

    const currentChildrenCenter =
      (
        centerX(firstChildCard) +
        centerX(lastChildCard)
      ) / 2;

    const dx =
      desiredCenter -
      currentChildrenCenter;

    if (Math.abs(dx) > 0.5) {
      node.children.forEach(child => {
        shiftSubtree(child, dx);
      });
    }

    node.children.forEach(
      balanceRenderedChildren
    );
  }

  balanceRenderedChildren(rootNode);

  /*
  * Balancing may move descendants beyond the
  * previously calculated right edge.
  */
  let balancedWidth =
    Number.parseFloat(stage.style.width) ||
    width;

  for (const [id] of nodeById) {
    const group = stage.querySelector(
      `[data-id="${id}"]`
    );

    if (!group) {
      continue;
    }

    const card =
      group.querySelector(".person-card") ||
      group;

    const left =
      Number.parseFloat(group.style.left) ||
      0;

    balancedWidth = Math.max(
      balancedWidth,
      left +
        card.getBoundingClientRect().width +
        MARGIN
    );
  }

  stage.style.width = `${balancedWidth}px`;

  svg.setAttribute(
    "viewBox",
    `0 0 ${balancedWidth} ${height}`
  );

  svg.setAttribute(
    "width",
    String(balancedWidth)
  );

  /*
   * Draw lines after all final box positions have
   * been determined.
   */
  function drawRelationshipLines() {
    const stageRect =
      stage.getBoundingClientRect();

    for (const [id, node] of nodeById) {
      const spouses =
        node.person.spouses || [];

      if (!spouses.length) {
        continue;
      }

      const firstCard = stage.querySelector(
        `.person-card[data-person-id="${id}"]`
      );

      if (!firstCard) {
        continue;
      }

      const firstRect =
        firstCard.getBoundingClientRect();

      const x1 =
        firstRect.left -
        stageRect.left +
        firstRect.width / 2;

      const y1 =
        firstRect.top -
        stageRect.top +
        firstRect.height / 2;

      for (const spouseId of spouses) {
        /*
         * Avoid drawing each marriage line twice.
         */
        if (id >= spouseId) {
          continue;
        }

        const secondCard =
          stage.querySelector(
            `.person-card[data-person-id="${spouseId}"]`
          );

        if (!secondCard) {
          continue;
        }

        const secondRect =
          secondCard.getBoundingClientRect();

        const x2 =
          secondRect.left -
          stageRect.left +
          secondRect.width / 2;

        const y2 =
          secondRect.top -
          stageRect.top +
          secondRect.height / 2;

        addLine(x1, y1, x2, y2);
      }
    }
  }

  function drawParentChildLines() {
    const stageRect =
      stage.getBoundingClientRect();

    for (const [id, node] of nodeById) {
      if (!node.children.length) {
        continue;
      }

      const parentGroup =
        stage.querySelector(
          `[data-id="${id}"]`
        );

      if (!parentGroup) {
        continue;
      }

      const parentCard =
        parentGroup.querySelector(
          ".person-card"
        ) || parentGroup;

      const parentRect =
        parentCard.getBoundingClientRect();

      const parentCenterX =
        parentRect.left -
        stageRect.left +
        parentRect.width / 2;

      const parentCenterY =
        parentRect.top -
        stageRect.top +
        parentRect.height / 2;

      const childCards =
        node.children
          .map(child =>
            stage.querySelector(
              `.person-card[data-person-id="${child.person.id}"]`
            )
          )
          .filter(Boolean);

      if (!childCards.length) {
        continue;
      }

      const childRects =
        childCards.map(card =>
          card.getBoundingClientRect()
        );

      const childCenters =
        childRects.map(rect => ({
          x:
            rect.left -
            stageRect.left +
            rect.width / 2,

          y:
            rect.top -
            stageRect.top +
            rect.height / 2
        }));

      const firstCenterX =
        childCenters[0].x;

      const lastCenterX =
        childCenters[
          childCenters.length - 1
        ].x;

      const childCenterY =
        childCenters[0].y;

      const junctionY =
        (parentCenterY + childCenterY) / 2;

      const childGroupCenter =
        (firstCenterX + lastCenterX) / 2;

      /*
       * Start the descendant line between married
       * parents when a displayed spouse exists.
       */
      let attachX = parentCenterX;

      const displayedSpouse =
        (node.person.spouses || [])
          .map(spouseId =>
            stage.querySelector(
              `.person-card[data-person-id="${spouseId}"]`
            )
          )
          .find(Boolean);

      if (displayedSpouse) {
        const spouseRect =
          displayedSpouse.getBoundingClientRect();

        const spouseCenterX =
          spouseRect.left -
          stageRect.left +
          spouseRect.width / 2;

        attachX =
          (parentCenterX + spouseCenterX) / 2;
      } else {
        attachX = childGroupCenter;
      }

      addLine(
        attachX,
        parentCenterY,
        attachX,
        junctionY
      );

      addLine(
        Math.min(firstCenterX, attachX),
        junctionY,
        Math.max(lastCenterX, attachX),
        junctionY
      );

      for (const child of childCenters) {
        addLine(
          child.x,
          junctionY,
          child.x,
          child.y
        );
      }
    }
  }

  drawParentChildLines();
  drawRelationshipLines();

  viewport.scrollLeft = Math.max(
    0,
    (
      stage.getBoundingClientRect().width -
      viewport.clientWidth
    ) / 2
  );
}

function setupSearch(people) {
  const input =
    document.querySelector("#person-search");

  const results =
    document.querySelector("#search-results");

  if (!input || !results) {
    return;
  }

  input.addEventListener("input", () => {
    const query =
      input.value
        .trim()
        .toLocaleLowerCase("zh-CN");

    results.textContent = "";

    if (!query) {
      results.hidden = true;
      return;
    }

    const matches =
      people
        .filter(person =>
          person.name
            .toLocaleLowerCase("zh-CN")
            .includes(query)
        )
        .slice(0, 8);

    if (!matches.length) {
      results.textContent =
        "没有找到匹配人物";
    } else {
      matches.forEach(person => {
        results.append(
          personLink(
            person,
            "search-result"
          )
        );
      });
    }

    results.hidden = false;
  });
}

loadFamily();
