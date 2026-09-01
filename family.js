"use strict";

const dataUrl = "family.json";

function personLabel(person) {
  return person.birth ? `${person.name} (${person.birth})` : person.name;
}

function personLink(person, className = "person-card") {
  const link = document.createElement("a");
  link.className = `${className} ${person.gender === "female" ? "female" : "male"}`;
  link.href = `person.html?id=${encodeURIComponent(person.id)}`;
  link.textContent = personLabel(person);
  return link;
}

async function loadFamily() {
  const tree = document.querySelector("#family-tree");

  try {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const people = await response.json();
    const byId = new Map(people.map(person => [person.id, person]));

    const childrenOf = id => people.filter(person => person.father === id || person.mother === id);

    function buildBranch(person, ancestry = new Set()) {
      const item = document.createElement("li");
      item.append(personLink(person));

      if (ancestry.has(person.id)) return item;
      const nextAncestry = new Set(ancestry).add(person.id);
      const children = childrenOf(person.id);

      if (children.length) {
        const list = document.createElement("ul");
        children.forEach(child => list.append(buildBranch(child, nextAncestry)));
        item.append(list);
      }
      return item;
    }

    const root = byId.get("P001");
    if (!root) throw new Error("找不到根人物 P001");

    tree.textContent = "";
    const rootRow = document.createElement("div");
    rootRow.className = "root-couple";
    rootRow.append(personLink(root));
    (root.spouses || []).forEach(id => {
      const spouse = byId.get(id);
      if (spouse) {
        const join = document.createElement("span");
        join.textContent = "—";
        join.setAttribute("aria-hidden", "true");
        rootRow.append(join, personLink(spouse));
      }
    });

    const list = document.createElement("ul");
    list.className = "tree";
    childrenOf(root.id).forEach(child => list.append(buildBranch(child, new Set([root.id]))));
    tree.append(rootRow, list);

    setupSearch(people);
  } catch (error) {
    tree.innerHTML = `<p class="error">无法载入族谱。请确认 family.json 已上传，并通过 GitHub Pages 访问网站。</p>`;
    console.error(error);
  }
}

function setupSearch(people) {
  const input = document.querySelector("#person-search");
  const results = document.querySelector("#search-results");

  input.addEventListener("input", () => {
    const query = input.value.trim().toLocaleLowerCase("zh-CN");
    results.textContent = "";
    if (!query) {
      results.hidden = true;
      return;
    }

    const matches = people.filter(person => person.name.toLocaleLowerCase("zh-CN").includes(query)).slice(0, 8);
    if (!matches.length) {
      results.textContent = "没有找到匹配人物";
    } else {
      matches.forEach(person => results.append(personLink(person, "search-result")));
    }
    results.hidden = false;
  });
}

loadFamily();
