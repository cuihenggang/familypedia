"use strict";

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}

async function loadPerson() {
  const page = document.querySelector("#person-page");
  const personId = new URLSearchParams(location.search).get("id");

  try {
    const response = await fetch("family.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const people = await response.json();
    const byId = new Map(people.map(person => [person.id, person]));
    const person = byId.get(personId);
    if (!person) throw new Error("找不到人物");

    const linkTo = id => {
      const relative = id && byId.get(id);
      return relative
        ? `<a href="person.html?id=${encodeURIComponent(relative.id)}">${escapeHtml(relative.name)}</a>`
        : "未知";
    };
    const children = people.filter(candidate => candidate.father === person.id || candidate.mother === person.id);
    const spouses = (person.spouses || []).map(linkTo);
    const childList = children.length
      ? children.map(child => `<li>${linkTo(child.id)}${child.birth ? `（${escapeHtml(child.birth)}）` : ""}</li>`).join("")
      : "<li>暂无资料</li>";

    document.title = `${person.name} · FamilyPedia`;
    page.innerHTML = `
      <p class="eyebrow">人物资料 · ${escapeHtml(person.id)}</p>
      <h1>${escapeHtml(person.name)}</h1>
      <p class="lead">${person.birth ? `${escapeHtml(person.birth)}—` : "生卒年不详"}</p>
      <h2>基本资料</h2>
      <table>
        <tbody>
          <tr><th>姓名</th><td>${escapeHtml(person.name)}</td></tr>
          <tr><th>出生</th><td>${escapeHtml(person.birth || "未知")}</td></tr>
          <tr><th>父亲</th><td>${linkTo(person.father)}</td></tr>
          <tr><th>母亲</th><td>${linkTo(person.mother)}</td></tr>
          <tr><th>配偶</th><td>${spouses.length ? spouses.join("、") : "暂无资料"}</td></tr>
        </tbody>
      </table>
      <h2>子女</h2>
      <ul class="relative-list">${childList}</ul>
      <h2>生平</h2>
      <p>${escapeHtml(person.bio || "暂无详细资料。")}</p>
    `;
  } catch (error) {
    page.innerHTML = `<h1>人物资料未找到</h1><p>请返回家族树并重新选择人物。</p>`;
    console.error(error);
  }
}

loadPerson();
