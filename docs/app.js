(() => {
  "use strict";

  const OWNED_KEY = "opcol_owned_v1";
  const LASTSET_KEY = "opcol_lastset_v1";

  const COLOR_HEX = {
    Red: "#e63946", Blue: "#3a86ff", Green: "#2ecc71", Purple: "#9b5de5",
    Black: "#2b2d42", Yellow: "#ffd60a"
  };

  let cards = [];
  let bySet = new Map();
  let owned = new Set();
  let currentSet = null;
  let currentFilter = "all";
  let searchTerm = "";

  const $ = (sel) => document.querySelector(sel);
  const grid = $("#grid");
  const setTabsEl = $("#setTabs");
  const emptyState = $("#emptyState");
  const searchInput = $("#searchInput");
  const clearSearchBtn = $("#clearSearch");
  const overallCount = $("#overallCount");
  const overallFill = $("#overallFill");
  const overallValue = $("#overallValue");

  function formatPrice(n) {
    if (n === null || n === undefined || isNaN(n)) return null;
    return "$" + Number(n).toFixed(2);
  }

  function normalize(str) {
    return (str || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  function loadOwned() {
    try {
      const raw = localStorage.getItem(OWNED_KEY);
      if (raw) owned = new Set(JSON.parse(raw));
    } catch (e) { owned = new Set(); }
  }

  function saveOwned() {
    localStorage.setItem(OWNED_KEY, JSON.stringify(Array.from(owned)));
  }

  function setCounts(setName) {
    const list = bySet.get(setName) || [];
    const got = list.filter(c => owned.has(c.id)).length;
    return { got, total: list.length };
  }

  function renderTabs() {
    setTabsEl.innerHTML = "";
    for (const setName of bySet.keys()) {
      const { got, total } = setCounts(setName);
      const btn = document.createElement("button");
      btn.className = "set-tab" + (setName === currentSet ? " active" : "") + (got === total ? " complete" : "");
      btn.dataset.set = setName;
      btn.innerHTML = `<span>${setName}</span><span class="set-tab-count">${got}/${total}</span>`;
      btn.addEventListener("click", () => {
        searchTerm = "";
        searchInput.value = "";
        clearSearchBtn.hidden = true;
        currentSet = setName;
        localStorage.setItem(LASTSET_KEY, setName);
        renderTabs();
        renderGrid();
      });
      setTabsEl.appendChild(btn);
    }
  }

  function renderOverall() {
    const total = cards.length;
    let got = 0;
    let value = 0;
    let topCard = null;
    for (const c of cards) {
      if (owned.has(c.id)) {
        got++;
        if (typeof c.price === "number") {
          value += c.price;
          if (!topCard || c.price > topCard.price) topCard = c;
        }
      }
    }
    overallCount.textContent = `${got} / ${total}`;
    overallValue.textContent = "$" + value.toFixed(2);
    overallFill.style.width = total ? `${(got / total) * 100}%` : "0%";
    renderTopCard(topCard);
  }

  function renderTopCard(topCard) {
    const btn = $("#topCardBtn");
    const stat = $("#topCardStat");
    if (topCard) {
      const nameEl = $("#topCardName");
      const priceEl = $("#topCardPrice");
      nameEl.textContent = `${topCard.name} (${topCard.id})`;
      priceEl.textContent = formatPrice(topCard.price);
      btn.title = `Tu carta mas cara: ${topCard.name} (${topCard.id})`;
      btn.hidden = false;
      btn.onclick = () => jumpToCard(topCard);
      if (stat) {
        stat.textContent = `🏆 Tu carta mas cara: ${topCard.name} (${topCard.id}) · ${formatPrice(topCard.price)}`;
        stat.onclick = () => { $("#menuSheet").hidden = true; jumpToCard(topCard); };
      }
    } else {
      btn.hidden = true;
      if (stat) stat.textContent = "Todavia no marcaste ninguna carta como obtenida.";
    }
  }

  function jumpToCard(card) {
    searchTerm = "";
    searchInput.value = "";
    clearSearchBtn.hidden = true;
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    document.querySelector('.filter-btn[data-filter="all"]').classList.add("active");
    currentFilter = "all";
    currentSet = card.set;
    localStorage.setItem(LASTSET_KEY, currentSet);
    renderTabs();
    renderGrid();
    requestAnimationFrame(() => {
      const el = grid.querySelector(`.card[data-id="${CSS.escape(card.id)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.style.outline = "2px solid var(--accent)";
        setTimeout(() => { el.style.outline = ""; }, 1500);
      }
    });
  }

  function cardMatchesFilter(card) {
    const isOwned = owned.has(card.id);
    if (currentFilter === "owned") return isOwned;
    if (currentFilter === "missing") return !isOwned;
    return true;
  }

  function cardMatchesSearch(card) {
    if (!searchTerm) return true;
    const hay = normalize(card.name) + " " + normalize(card.id);
    return hay.includes(searchTerm);
  }

  function buildCardEl(card) {
    const el = document.createElement("div");
    const isOwned = owned.has(card.id);
    el.className = "card" + (isOwned ? " owned" : " missing");
    el.dataset.id = card.id;

    const colorBar = document.createElement("div");
    colorBar.className = "color-bar";
    const primaryColor = (card.color || "").split(/[\/,\s]+/)[0].trim();
    colorBar.style.background = COLOR_HEX[primaryColor] || "#555";
    el.appendChild(colorBar);

    const img = document.createElement("img");
    img.src = card.img;
    img.loading = "lazy";
    img.alt = card.name || card.id;
    el.appendChild(img);

    if (card.variant && card.variant !== "base") {
      const badge = document.createElement("div");
      badge.className = "variant-badge";
      badge.textContent = card.variant.toUpperCase();
      el.appendChild(badge);
    }

    const check = document.createElement("div");
    check.className = "owned-check";
    check.textContent = "✓";
    el.appendChild(check);

    const priceText = formatPrice(card.price);
    const label = document.createElement("div");
    label.className = "code-label";
    label.textContent = priceText ? `${card.id} · ${priceText}` : card.id;
    el.appendChild(label);

    el.addEventListener("click", () => toggleOwned(card, el));
    return el;
  }

  function toggleOwned(card, el) {
    if (owned.has(card.id)) {
      owned.delete(card.id);
      el.classList.remove("owned");
      el.classList.add("missing");
    } else {
      owned.add(card.id);
      el.classList.remove("missing");
      el.classList.add("owned");
    }
    saveOwned();
    renderOverall();
    renderTabs();
    if (currentFilter !== "all" && !cardMatchesFilter(card)) {
      el.remove();
      if (!grid.querySelector(".card")) emptyState.hidden = false;
    }
  }

  function renderGrid() {
    grid.innerHTML = "";
    let shown = 0;

    if (searchTerm) {
      for (const [setName, list] of bySet.entries()) {
        const matches = list.filter(c => cardMatchesSearch(c) && cardMatchesFilter(c));
        if (!matches.length) continue;
        const heading = document.createElement("div");
        heading.className = "set-heading";
        heading.textContent = setName;
        grid.appendChild(heading);
        for (const card of matches) {
          grid.appendChild(buildCardEl(card));
          shown++;
        }
      }
    } else {
      const list = bySet.get(currentSet) || [];
      for (const card of list) {
        if (!cardMatchesFilter(card)) continue;
        grid.appendChild(buildCardEl(card));
        shown++;
      }
    }

    emptyState.hidden = shown !== 0;
  }

  function setupSearch() {
    searchInput.addEventListener("input", () => {
      searchTerm = normalize(searchInput.value.trim());
      clearSearchBtn.hidden = !searchTerm;
      renderGrid();
    });
    clearSearchBtn.addEventListener("click", () => {
      searchInput.value = "";
      searchTerm = "";
      clearSearchBtn.hidden = true;
      searchInput.focus();
      renderGrid();
    });
  }

  function setupFilters() {
    document.querySelectorAll(".filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.filter;
        renderGrid();
      });
    });
  }

  function showToast(msg) {
    const toast = $("#toast");
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 2200);
  }

  function setupMenu() {
    const sheet = $("#menuSheet");
    $("#menuBtn").addEventListener("click", () => { sheet.hidden = false; });
    $("#closeSheet").addEventListener("click", () => { sheet.hidden = true; });
    $("#sheetBackdrop").addEventListener("click", () => { sheet.hidden = true; });

    $("#exportBtn").addEventListener("click", () => {
      const payload = { exportedAt: new Date().toISOString(), owned: Array.from(owned) };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `op-tcg-coleccion-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      sheet.hidden = true;
    });

    $("#importFile").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const ids = Array.isArray(data.owned) ? data.owned : Array.isArray(data) ? data : [];
          ids.forEach(id => owned.add(id));
          saveOwned();
          renderOverall();
          renderTabs();
          renderGrid();
          showToast(`Importadas ${ids.length} cartas`);
        } catch (err) {
          showToast("Archivo invalido");
        }
        sheet.hidden = true;
        e.target.value = "";
      };
      reader.readAsText(file);
    });

    $("#resetSetBtn").addEventListener("click", () => {
      if (!currentSet) return;
      if (!confirm(`¿Vaciar todo el progreso del set ${currentSet}?`)) return;
      const list = bySet.get(currentSet) || [];
      list.forEach(c => owned.delete(c.id));
      saveOwned();
      renderOverall();
      renderTabs();
      renderGrid();
      sheet.hidden = true;
      showToast(`Set ${currentSet} vaciado`);
    });
  }

  async function init() {
    loadOwned();
    setupSearch();
    setupFilters();
    setupMenu();

    const res = await fetch("data/cards.json");
    cards = await res.json();

    bySet = new Map();
    for (const card of cards) {
      if (!bySet.has(card.set)) bySet.set(card.set, []);
      bySet.get(card.set).push(card);
    }
    for (const list of bySet.values()) {
      list.sort((a, b) => a.number - b.number || a.variant.localeCompare(b.variant));
    }
    bySet = new Map(Array.from(bySet.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })));

    const lastSet = localStorage.getItem(LASTSET_KEY);
    currentSet = (lastSet && bySet.has(lastSet)) ? lastSet : bySet.keys().next().value;

    renderTabs();
    renderOverall();
    renderGrid();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  init();
})();
