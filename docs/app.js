(() => {
  "use strict";

  const OWNED_KEY = "opcol_owned_v1";
  const LASTSET_KEY = "opcol_lastset_v1";
  const LAST_EXPORT_COUNT_KEY = "opcol_last_export_count_v1";
  const BACKUP_REMINDER_THRESHOLD = 15;

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
    checkBackupReminder();
  }

  function checkBackupReminder() {
    const lastExportCount = parseInt(localStorage.getItem(LAST_EXPORT_COUNT_KEY) || "0", 10);
    const newSinceExport = owned.size - lastExportCount;
    const shouldWarn = newSinceExport >= BACKUP_REMINDER_THRESHOLD;

    const badge = $("#backupBadge");
    const warning = $("#backupWarning");
    if (badge) badge.hidden = !shouldWarn;
    if (warning) {
      warning.hidden = !shouldWarn;
      if (shouldWarn) {
        warning.textContent = `⚠️ Tienes ${newSinceExport} cartas marcadas sin respaldar. Si borras datos del navegador o cambias de celular las perderas. Toca "Exportar coleccion" para guardarlas.`;
      }
    }
  }

  function markBackedUp() {
    localStorage.setItem(LAST_EXPORT_COUNT_KEY, String(owned.size));
    checkBackupReminder();
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

    setupPressHandlers(el, card);
    return el;
  }

  const LONG_PRESS_MS = 3000;
  const MOVE_CANCEL_PX = 12;

  function setupPressHandlers(el, card) {
    let pressTimer = null;
    let startXY = null;
    let suppressClick = false;

    const clearTimer = () => { clearTimeout(pressTimer); pressTimer = null; startXY = null; };

    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      startXY = { x: e.clientX, y: e.clientY };
      pressTimer = setTimeout(() => {
        suppressClick = true;
        if (navigator.vibrate) navigator.vibrate(20);
        openZoom(card);
      }, LONG_PRESS_MS);
    });

    el.addEventListener("pointermove", (e) => {
      if (!startXY) return;
      const dx = e.clientX - startXY.x;
      const dy = e.clientY - startXY.y;
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clearTimer();
    });

    el.addEventListener("pointerup", clearTimer);
    el.addEventListener("pointercancel", clearTimer);
    el.addEventListener("pointerleave", clearTimer);
    el.addEventListener("contextmenu", (e) => e.preventDefault());

    // El toggle real va sobre "click": es el evento que los navegadores
    // normalizan de forma confiable para un toque simple. Los eventos pointer*
    // de arriba solo se usan para detectar la pulsacion larga sin pisarlo;
    // si hubo pulsacion larga, se descarta el click que le sigue.
    el.addEventListener("click", () => {
      if (suppressClick) { suppressClick = false; return; }
      toggleOwned(card, el);
    });
  }

  const MAX_ZOOM_SCALE = 4;
  const ZOOM_STEP = 2;
  const ZOOM_HOLD_MS = 900;
  const ZOOM_MOVE_CANCEL_PX = 12;

  let zoomScale = 1;
  let zoomTx = 0;
  let zoomTy = 0;
  let zoomGestureActive = false;

  function applyZoomTransform() {
    $("#zoomImg").style.transform = `translate(${zoomTx}px, ${zoomTy}px) scale(${zoomScale})`;
    $("#zoomResetBtn").hidden = zoomScale <= 1.02;
  }

  function resetZoomTransform() {
    zoomScale = 1;
    zoomTx = 0;
    zoomTy = 0;
    applyZoomTransform();
  }

  function setupZoomGestures() {
    const img = $("#zoomImg");
    let holdTimer = null;
    let startXY = null;
    let panStartTx = 0;
    let panStartTy = 0;
    let isPanning = false;

    const clearHold = () => { clearTimeout(holdTimer); holdTimer = null; };

    img.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      startXY = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStartTx = zoomTx;
      panStartTy = zoomTy;
      isPanning = false;

      holdTimer = setTimeout(() => {
        zoomScale = Math.min(MAX_ZOOM_SCALE, (zoomScale <= 1 ? 1 : zoomScale) * ZOOM_STEP);
        applyZoomTransform();
        zoomGestureActive = true;
        if (navigator.vibrate) navigator.vibrate(15);
      }, ZOOM_HOLD_MS);
    }, { passive: true });

    img.addEventListener("touchmove", (e) => {
      if (!startXY || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startXY.x;
      const dy = e.touches[0].clientY - startXY.y;

      if (!isPanning && Math.hypot(dx, dy) > ZOOM_MOVE_CANCEL_PX) {
        clearHold();
        if (zoomScale > 1) isPanning = true;
      }
      if (isPanning) {
        zoomTx = panStartTx + dx;
        zoomTy = panStartTy + dy;
        applyZoomTransform();
        zoomGestureActive = true;
        e.preventDefault();
      }
    }, { passive: false });

    const endGesture = () => {
      clearHold();
      startXY = null;
      isPanning = false;
      setTimeout(() => { zoomGestureActive = false; }, 50);
    };
    img.addEventListener("touchend", endGesture);
    img.addEventListener("touchcancel", endGesture);

    $("#zoomResetBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      resetZoomTransform();
    });
    $("#zoomCloseBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      closeZoom();
    });
  }

  function openZoom(card) {
    const overlay = $("#zoomOverlay");
    const img = $("#zoomImg");
    const caption = $("#zoomCaption");
    resetZoomTransform();
    img.src = card.img;
    img.alt = card.name || card.id;
    const priceText = formatPrice(card.price);
    caption.textContent = `${card.name} (${card.id})` + (priceText ? ` · ${priceText}` : "");
    overlay.hidden = false;
  }

  function closeZoom() {
    $("#zoomOverlay").hidden = true;
    resetZoomTransform();
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
      markBackedUp();
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
          markBackedUp();
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
    $("#zoomOverlay").addEventListener("click", () => {
      if (!zoomGestureActive) closeZoom();
    });
    setupZoomGestures();

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
