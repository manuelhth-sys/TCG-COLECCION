(() => {
  "use strict";

  const LASTGAME_KEY = "tcgcol_lastgame_v1";
  const THEME_KEY = "tcgcol_theme_v1";
  const BACKUP_REMINDER_THRESHOLD = 15;

  const THEMES = [
    { key: "default", label: "Original", sw1: "#0f1220", sw2: "#ffb703", fonts: null },
    { key: "vitrina", label: "Vitrina", sw1: "#14120f", sw2: "#c9a15a",
      fonts: "Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Public+Sans:wght@400;500;600" },
    { key: "arcade", label: "Arcade", sw1: "#0b0714", sw2: "#ff2e88",
      fonts: "Press+Start+2P&family=JetBrains+Mono:wght@400;500;700" },
    { key: "album", label: "Album", sw1: "#f3e9d2", sw2: "#e2472b",
      fonts: "Permanent+Marker&family=Nunito:wght@400;700;800" },
    { key: "trading", label: "Trading", sw1: "#05080a", sw2: "#35c97a",
      fonts: "Space+Mono:wght@400;700" },
    { key: "dojo", label: "Dojo", sw1: "#faf8f5", sw2: "#c0392b",
      fonts: "Shippori+Mincho:wght@500;700&family=Noto+Sans+JP:wght@400;500;700" },
    { key: "boveda", label: "Boveda", sw1: "#0c0a14", sw2: "#d4af37",
      fonts: "Cinzel:wght@600;700&family=Manrope:wght@400;600;700" }
  ];
  let currentTheme = "default";

  const GAMES = {
    onepiece: {
      key: "onepiece",
      label: "One Piece",
      icon: "🏴‍☠️",
      dataUrl: "data/cards.json",
      ownedKey: "opcol_owned_v1",
      interestKey: "opcol_interest_v1",
      lastSetKey: "opcol_lastset_v1",
      lastExportCountKey: "opcol_last_export_count_v1",
      hasSeries: false,
      colorHex: {
        Red: "#e63946", Blue: "#3a86ff", Green: "#2ecc71", Purple: "#9b5de5",
        Black: "#2b2d42", Yellow: "#ffd60a"
      }
    },
    pokemon: {
      key: "pokemon",
      label: "Pokemon",
      icon: "⚡",
      dataUrl: "data/pokemon-cards.json",
      ownedKey: "pkcol_owned_v1",
      interestKey: "pkcol_interest_v1",
      lastSetKey: "pkcol_lastset_v1",
      lastSeriesKey: "pkcol_lastseries_v1",
      lastExportCountKey: "pkcol_last_export_count_v1",
      hasSeries: true,
      colorHex: {
        Grass: "#4e8234", Fire: "#e0651a", Water: "#399ad0", Lightning: "#f4c93a",
        Psychic: "#ff6f91", Fighting: "#c15a2e", Darkness: "#4a4a4a", Metal: "#8f9aa3",
        Fairy: "#ee99e0", Dragon: "#7b6fd0", Colorless: "#c7c7c7"
      },
      supertypeHex: { "Trainer": "#3a86ff", "Energy": "#8b8b8b" }
    }
  };

  let currentGame = "onepiece";
  let currentSet = null;
  let currentSeries = null;
  let currentFilter = "all";
  let searchTerm = "";

  let ownedByGame = {};
  let interestByGame = {};
  let dataByGame = {};
  let owned = new Set();
  let interested = new Set();
  let cards = [];
  let bySet = new Map();

  const $ = (sel) => document.querySelector(sel);
  const grid = $("#grid");
  const setTabsEl = $("#setTabs");
  const seriesSelectEl = $("#seriesSelect");
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

  function loadOwnedAll() {
    ownedByGame = {};
    for (const key of Object.keys(GAMES)) {
      try {
        const raw = localStorage.getItem(GAMES[key].ownedKey);
        ownedByGame[key] = raw ? new Set(JSON.parse(raw)) : new Set();
      } catch (e) {
        ownedByGame[key] = new Set();
      }
    }
  }

  function saveOwned() {
    localStorage.setItem(GAMES[currentGame].ownedKey, JSON.stringify(Array.from(owned)));
  }

  function loadInterestAll() {
    interestByGame = {};
    for (const key of Object.keys(GAMES)) {
      try {
        const raw = localStorage.getItem(GAMES[key].interestKey);
        interestByGame[key] = raw ? new Set(JSON.parse(raw)) : new Set();
      } catch (e) {
        interestByGame[key] = new Set();
      }
    }
  }

  function saveInterest() {
    localStorage.setItem(GAMES[currentGame].interestKey, JSON.stringify(Array.from(interested)));
  }

  function toggleInterest(card) {
    if (interested.has(card.id)) interested.delete(card.id);
    else interested.add(card.id);
    saveInterest();
  }

  function setCounts(setId) {
    const list = bySet.get(setId) || [];
    const got = list.filter(c => owned.has(c.id)).length;
    return { got, total: list.length };
  }

  function setLabel(setId) {
    if (!GAMES[currentGame].hasSeries) return setId;
    const meta = dataByGame[currentGame].setMeta.get(setId);
    return meta ? meta.name : setId;
  }

  function cardCodeLabel(card) {
    if (GAMES[currentGame].hasSeries) {
      return card.printedTotal ? `${card.number}/${card.printedTotal}` : card.number;
    }
    return card.id;
  }

  function cardColorHex(card) {
    const game = GAMES[currentGame];
    if (!game.hasSeries) {
      const primaryColor = (card.color || "").split(/[\/,\s]+/)[0].trim();
      return game.colorHex[primaryColor] || "#555";
    }
    const primaryType = (card.types || "").split("/")[0].trim();
    return game.colorHex[primaryType] || (game.supertypeHex && game.supertypeHex[card.supertype]) || "#555";
  }

  function visibleSetIds() {
    const game = GAMES[currentGame];
    const data = dataByGame[currentGame];
    if (!data) return [];
    if (!game.hasSeries) return Array.from(data.bySet.keys());
    const ids = Array.from(data.bySet.keys()).filter(id => {
      const meta = data.setMeta.get(id);
      return meta && meta.series === currentSeries;
    });
    ids.sort((a, b) => (data.setMeta.get(a).releaseDate || "").localeCompare(data.setMeta.get(b).releaseDate || ""));
    return ids;
  }

  function selectSet(setId) {
    searchTerm = "";
    searchInput.value = "";
    clearSearchBtn.hidden = true;
    currentSet = setId;
    localStorage.setItem(GAMES[currentGame].lastSetKey, setId);
    renderTabs();
    renderGrid();
  }

  function renderTabs() {
    setTabsEl.innerHTML = "";
    for (const setId of visibleSetIds()) {
      const { got, total } = setCounts(setId);
      const btn = document.createElement("button");
      btn.className = "set-tab" + (setId === currentSet ? " active" : "") + (got === total ? " complete" : "");
      btn.dataset.set = setId;
      btn.innerHTML = `<span>${setLabel(setId)}</span><span class="set-tab-count">${got}/${total}</span>`;
      btn.addEventListener("click", () => selectSet(setId));
      setTabsEl.appendChild(btn);
    }
  }

  function renderSeriesSelect() {
    const game = GAMES[currentGame];
    seriesSelectEl.hidden = !game.hasSeries;
    if (!game.hasSeries) return;
    const data = dataByGame[currentGame];
    seriesSelectEl.innerHTML = "";
    for (const s of data.seriesList) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      if (s === currentSeries) opt.selected = true;
      seriesSelectEl.appendChild(opt);
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
    let newSinceExport = 0;
    for (const key of Object.keys(GAMES)) {
      const lastCount = parseInt(localStorage.getItem(GAMES[key].lastExportCountKey) || "0", 10);
      newSinceExport += Math.max(0, ownedByGame[key].size - lastCount);
    }
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
    for (const key of Object.keys(GAMES)) {
      localStorage.setItem(GAMES[key].lastExportCountKey, String(ownedByGame[key].size));
    }
    checkBackupReminder();
  }

  function renderTopCard(topCard) {
    const btn = $("#topCardBtn");
    const stat = $("#topCardStat");
    if (topCard) {
      const nameEl = $("#topCardName");
      const priceEl = $("#topCardPrice");
      const imgEl = $("#topCardImg");
      nameEl.textContent = `${topCard.name} (${cardCodeLabel(topCard)})`;
      priceEl.textContent = formatPrice(topCard.price);
      imgEl.src = topCard.img;
      imgEl.alt = topCard.name || topCard.id;
      btn.title = `Tu carta mas cara: ${topCard.name} (${cardCodeLabel(topCard)})`;
      btn.hidden = false;
      btn.onclick = () => jumpToCard(topCard);
      if (stat) {
        stat.textContent = `🏆 Tu carta mas cara: ${topCard.name} (${cardCodeLabel(topCard)}) · ${formatPrice(topCard.price)}`;
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
    localStorage.setItem(GAMES[currentGame].lastSetKey, currentSet);
    if (GAMES[currentGame].hasSeries) {
      currentSeries = card.series;
      localStorage.setItem(GAMES[currentGame].lastSeriesKey, currentSeries);
      renderSeriesSelect();
    }
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
    const hay = normalize(card.name) + " " + normalize(card.id) + " " + normalize(card.number || "");
    return hay.includes(searchTerm);
  }

  function buildCardEl(card) {
    const el = document.createElement("div");
    const isOwned = owned.has(card.id);
    el.className = "card" + (isOwned ? " owned" : " missing") + (interested.has(card.id) ? " interest" : "");
    el.dataset.id = card.id;

    const colorBar = document.createElement("div");
    colorBar.className = "color-bar";
    colorBar.style.background = cardColorHex(card);
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

    const ribbon = document.createElement("div");
    ribbon.className = "interest-ribbon";
    ribbon.textContent = "QUIERO";
    el.appendChild(ribbon);

    const check = document.createElement("div");
    check.className = "owned-check";
    check.textContent = "✓";
    el.appendChild(check);

    const priceText = formatPrice(card.price);
    const codeLabel = cardCodeLabel(card);
    const label = document.createElement("div");
    label.className = "code-label";
    label.textContent = priceText ? `${codeLabel} · ${priceText}` : codeLabel;
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
      askConfirmToggle(card, el);
    });
  }

  let pendingConfirmAction = null;
  let pendingInterestCard = null;

  function updateInterestBtn(card) {
    const btn = $("#confirmInterestBtn");
    const isInterested = interested.has(card.id);
    btn.classList.toggle("on", isInterested);
    btn.textContent = isInterested ? "📌 Marcada de interes" : "📌 Marcar de interes";
  }

  function showConfirm({ text, imgSrc, imgAlt, card, onConfirm }) {
    pendingConfirmAction = onConfirm;
    pendingInterestCard = card || null;
    const imgEl = $("#confirmImg");
    if (imgSrc) {
      imgEl.src = imgSrc;
      imgEl.alt = imgAlt || "";
      imgEl.hidden = false;
    } else {
      imgEl.hidden = true;
    }
    const pinBtn = $("#confirmInterestBtn");
    if (card) {
      pinBtn.hidden = false;
      updateInterestBtn(card);
    } else {
      pinBtn.hidden = true;
    }
    $("#confirmText").textContent = text;
    $("#confirmDialog").hidden = false;
  }

  function askConfirmToggle(card, el) {
    const willBecomeOwned = !owned.has(card.id);
    showConfirm({
      text: willBecomeOwned
        ? `¿Marcar "${card.name}" (${cardCodeLabel(card)}) como obtenida?`
        : `¿Marcar "${card.name}" (${cardCodeLabel(card)}) como faltante?`,
      imgSrc: card.img,
      imgAlt: card.name || card.id,
      card: card,
      onConfirm: () => toggleOwned(card, el)
    });
  }

  function closeConfirmDialog() {
    pendingConfirmAction = null;
    pendingInterestCard = null;
    $("#confirmDialog").hidden = true;
  }

  function setupConfirmDialog() {
    $("#confirmOkBtn").addEventListener("click", () => {
      const action = pendingConfirmAction;
      closeConfirmDialog();
      if (action) action();
    });
    $("#confirmCancelBtn").addEventListener("click", closeConfirmDialog);
    $("#confirmInterestBtn").addEventListener("click", () => {
      if (!pendingInterestCard) return;
      toggleInterest(pendingInterestCard);
      updateInterestBtn(pendingInterestCard);
      const cardEl = grid.querySelector(`.card[data-id="${CSS.escape(pendingInterestCard.id)}"]`);
      if (cardEl) cardEl.classList.toggle("interest", interested.has(pendingInterestCard.id));
    });
    $("#confirmDialog").addEventListener("click", (e) => {
      if (e.target.id === "confirmDialog") closeConfirmDialog();
    });
  }

  const MAX_ZOOM_SCALE = 4;
  const DOUBLE_TAP_ZOOM = 2.5;
  const DOUBLE_TAP_MS = 280;
  const TAP_MOVE_CANCEL_PX = 10;

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

  function touchDistance(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }

  function setupZoomGestures() {
    const img = $("#zoomImg");

    let touchStartXY = null;
    let touchMoved = false;
    let isPanning = false;
    let panStartTx = 0;
    let panStartTy = 0;
    let pinchStartDist = null;
    let pinchStartScale = 1;
    let lastTapTime = 0;
    let singleTapTimer = null;

    const clearSingleTapTimer = () => { clearTimeout(singleTapTimer); singleTapTimer = null; };
    const endGestureFlag = () => { setTimeout(() => { zoomGestureActive = false; }, 50); };

    img.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        clearSingleTapTimer();
        zoomGestureActive = true;
        pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
        pinchStartScale = zoomScale;
        e.preventDefault();
        return;
      }
      if (e.touches.length === 1) {
        touchStartXY = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        touchMoved = false;
        isPanning = false;
        panStartTx = zoomTx;
        panStartTy = zoomTy;
      }
    }, { passive: false });

    img.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2 && pinchStartDist) {
        const newDist = touchDistance(e.touches[0], e.touches[1]);
        zoomScale = Math.min(MAX_ZOOM_SCALE, Math.max(1, pinchStartScale * (newDist / pinchStartDist)));
        applyZoomTransform();
        e.preventDefault();
        return;
      }
      if (e.touches.length === 1 && touchStartXY) {
        const dx = e.touches[0].clientX - touchStartXY.x;
        const dy = e.touches[0].clientY - touchStartXY.y;
        if (!touchMoved && Math.hypot(dx, dy) > TAP_MOVE_CANCEL_PX) {
          touchMoved = true;
          if (zoomScale > 1) isPanning = true;
        }
        if (isPanning) {
          zoomTx = panStartTx + dx;
          zoomTy = panStartTy + dy;
          applyZoomTransform();
          zoomGestureActive = true;
          e.preventDefault();
        }
      }
    }, { passive: false });

    img.addEventListener("touchend", (e) => {
      e.preventDefault();
      if (e.touches.length > 0) return;

      const wasPinch = pinchStartDist !== null;
      const wasPan = isPanning;
      pinchStartDist = null;
      isPanning = false;
      const moved = touchMoved;
      touchStartXY = null;
      touchMoved = false;

      if (wasPinch || wasPan) { endGestureFlag(); return; }
      if (moved) return;

      const now = Date.now();
      if (now - lastTapTime < DOUBLE_TAP_MS) {
        clearSingleTapTimer();
        lastTapTime = 0;
        if (zoomScale > 1.02) {
          resetZoomTransform();
        } else {
          zoomScale = DOUBLE_TAP_ZOOM;
          zoomTx = 0;
          zoomTy = 0;
          applyZoomTransform();
        }
        if (navigator.vibrate) navigator.vibrate(15);
      } else {
        lastTapTime = now;
        singleTapTimer = setTimeout(() => {
          singleTapTimer = null;
          if (zoomScale <= 1.02) closeZoom();
        }, DOUBLE_TAP_MS);
      }
    });

    img.addEventListener("touchcancel", () => {
      clearSingleTapTimer();
      pinchStartDist = null;
      isPanning = false;
      touchStartXY = null;
      touchMoved = false;
      endGestureFlag();
    });

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
    img.src = card.imgLarge || card.img;
    img.alt = card.name || card.id;
    const priceText = formatPrice(card.price);
    caption.textContent = `${card.name} (${cardCodeLabel(card)})` + (priceText ? ` · ${priceText}` : "");
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
      for (const [setId, list] of bySet.entries()) {
        const matches = list.filter(c => cardMatchesSearch(c) && cardMatchesFilter(c));
        if (!matches.length) continue;
        const heading = document.createElement("div");
        heading.className = "set-heading";
        heading.textContent = setLabel(setId);
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

  function setupSeriesSelect() {
    seriesSelectEl.addEventListener("change", () => {
      currentSeries = seriesSelectEl.value;
      localStorage.setItem(GAMES[currentGame].lastSeriesKey, currentSeries);
      searchTerm = "";
      searchInput.value = "";
      clearSearchBtn.hidden = true;
      const ids = visibleSetIds();
      currentSet = ids[0] || null;
      if (currentSet) localStorage.setItem(GAMES[currentGame].lastSetKey, currentSet);
      renderTabs();
      renderGrid();
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
      const gamesPayload = {};
      for (const key of Object.keys(GAMES)) gamesPayload[key] = Array.from(ownedByGame[key]);
      const payload = { exportedAt: new Date().toISOString(), games: gamesPayload };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tcg-coleccion-${new Date().toISOString().slice(0,10)}.json`;
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
          let totalImported = 0;
          if (data.games && typeof data.games === "object") {
            for (const key of Object.keys(GAMES)) {
              const ids = Array.isArray(data.games[key]) ? data.games[key] : [];
              ids.forEach(id => ownedByGame[key].add(id));
              totalImported += ids.length;
            }
          } else {
            // Backups viejos (antes de sumar Pokemon) solo tenian cartas de One Piece.
            const ids = Array.isArray(data.owned) ? data.owned : Array.isArray(data) ? data : [];
            ids.forEach(id => ownedByGame.onepiece.add(id));
            totalImported += ids.length;
          }
          for (const key of Object.keys(GAMES)) {
            localStorage.setItem(GAMES[key].ownedKey, JSON.stringify(Array.from(ownedByGame[key])));
          }
          owned = ownedByGame[currentGame];
          markBackedUp();
          renderOverall();
          renderTabs();
          renderGrid();
          showToast(`Importadas ${totalImported} cartas`);
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
      sheet.hidden = true;
      showConfirm({
        text: `¿Vaciar todo el progreso del set ${setLabel(currentSet)}?`,
        onConfirm: () => {
          const list = bySet.get(currentSet) || [];
          list.forEach(c => owned.delete(c.id));
          saveOwned();
          renderOverall();
          renderTabs();
          renderGrid();
          showToast(`Set ${setLabel(currentSet)} vaciado`);
        }
      });
    });

    $("#qrToggleBtn").addEventListener("click", () => {
      const box = $("#qrBox");
      if (box.hidden) {
        if (!box.dataset.rendered) {
          const url = location.href.split("#")[0].split("?")[0];
          const qr = qrcode(0, "M");
          qr.addData(url);
          qr.make();
          $("#qrCanvas").innerHTML = qr.createSvgTag(5, 8);
          $("#qrUrl").textContent = url;
          box.dataset.rendered = "1";
        }
        box.hidden = false;
      } else {
        box.hidden = true;
      }
    });
  }

  function loadThemeFonts(theme) {
    if (!theme.fonts) return;
    const href = `https://fonts.googleapis.com/css2?family=${theme.fonts}&display=swap`;
    let link = document.getElementById("theme-font-link");
    if (!link) {
      link = document.createElement("link");
      link.id = "theme-font-link";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }

  function renderThemeSwatches() {
    const container = $("#themeSwatches");
    container.innerHTML = "";
    for (const theme of THEMES) {
      const btn = document.createElement("button");
      btn.className = "theme-swatch" + (theme.key === currentTheme ? " active" : "");
      btn.style.setProperty("--sw1", theme.sw1);
      btn.style.setProperty("--sw2", theme.sw2);
      btn.innerHTML = `<span class="swatch-dot"></span><span>${theme.label}</span>`;
      btn.addEventListener("click", () => applyTheme(theme.key));
      container.appendChild(btn);
    }
  }

  function applyTheme(themeKey) {
    const theme = THEMES.find(t => t.key === themeKey) || THEMES[0];
    currentTheme = theme.key;
    Array.from(document.body.classList)
      .filter(c => c.startsWith("theme-"))
      .forEach(c => document.body.classList.remove(c));
    if (theme.key !== "default") {
      document.body.classList.add(`theme-${theme.key}`);
      loadThemeFonts(theme);
    }
    localStorage.setItem(THEME_KEY, theme.key);
    renderThemeSwatches();
  }

  function sortCardsForGame(gameKey, list) {
    if (GAMES[gameKey].hasSeries) {
      list.sort((a, b) => {
        const na = parseInt(((a.number || "").match(/\d+/) || ["999999"])[0], 10);
        const nb = parseInt(((b.number || "").match(/\d+/) || ["999999"])[0], 10);
        if (na !== nb) return na - nb;
        return (a.number || "").localeCompare(b.number || "", undefined, { numeric: true });
      });
    } else {
      list.sort((a, b) => a.number - b.number || a.variant.localeCompare(b.variant));
    }
  }

  async function loadGameData(gameKey) {
    const game = GAMES[gameKey];
    const res = await fetch(game.dataUrl);
    const cardsList = await res.json();

    const setMap = new Map();
    const setMeta = new Map();
    for (const card of cardsList) {
      if (!setMap.has(card.set)) setMap.set(card.set, []);
      setMap.get(card.set).push(card);
      if (game.hasSeries && !setMeta.has(card.set)) {
        setMeta.set(card.set, {
          name: card.setName, series: card.series,
          releaseDate: card.releaseDate, printedTotal: card.printedTotal
        });
      }
    }
    for (const list of setMap.values()) sortCardsForGame(gameKey, list);

    let seriesList = null;
    let sortedSetMap;
    if (game.hasSeries) {
      const seriesDates = new Map();
      for (const meta of setMeta.values()) {
        const cur = seriesDates.get(meta.series);
        if (cur === undefined || (meta.releaseDate && meta.releaseDate < cur)) {
          seriesDates.set(meta.series, meta.releaseDate || cur || "");
        }
      }
      seriesList = Array.from(seriesDates.entries())
        .sort((a, b) => (a[1] || "").localeCompare(b[1] || ""))
        .map(([s]) => s);

      const sortedEntries = Array.from(setMap.entries())
        .sort((a, b) => (setMeta.get(a[0]).releaseDate || "").localeCompare(setMeta.get(b[0]).releaseDate || ""));
      sortedSetMap = new Map(sortedEntries);
    } else {
      const sortedEntries = Array.from(setMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
      sortedSetMap = new Map(sortedEntries);
    }

    dataByGame[gameKey] = { cards: cardsList, bySet: sortedSetMap, setMeta, seriesList };
  }

  function setupSeriesForGame(gameKey) {
    const game = GAMES[gameKey];
    const data = dataByGame[gameKey];
    const savedSeries = localStorage.getItem(game.lastSeriesKey);
    currentSeries = (savedSeries && data.seriesList.includes(savedSeries))
      ? savedSeries
      : data.seriesList[data.seriesList.length - 1];
    localStorage.setItem(game.lastSeriesKey, currentSeries);
    renderSeriesSelect();
  }

  function setupCurrentSetForGame(gameKey) {
    const game = GAMES[gameKey];
    const data = dataByGame[gameKey];
    const lastSet = localStorage.getItem(game.lastSetKey);

    if (game.hasSeries) {
      const validLastSet = lastSet && data.bySet.has(lastSet) &&
        data.setMeta.get(lastSet).series === currentSeries;
      currentSet = validLastSet ? lastSet : (visibleSetIds()[0] || null);
    } else {
      currentSet = (lastSet && data.bySet.has(lastSet)) ? lastSet : data.bySet.keys().next().value;
    }
    if (currentSet) localStorage.setItem(game.lastSetKey, currentSet);
  }

  async function switchGame(gameKey) {
    if (gameKey === currentGame || !GAMES[gameKey]) return;
    currentGame = gameKey;
    localStorage.setItem(LASTGAME_KEY, gameKey);
    document.querySelectorAll(".game-tab").forEach(b => b.classList.toggle("active", b.dataset.game === gameKey));
    document.body.classList.toggle("game-pokemon", gameKey === "pokemon");
    $("#gameTitle").textContent = `${GAMES[gameKey].icon} Mi Coleccion`;

    owned = ownedByGame[gameKey];
    interested = interestByGame[gameKey];
    searchTerm = "";
    searchInput.value = "";
    clearSearchBtn.hidden = true;
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === "all"));
    currentFilter = "all";

    if (!dataByGame[gameKey]) {
      grid.innerHTML = "";
      setTabsEl.innerHTML = "";
      emptyState.hidden = true;
      showToast("Cargando cartas...");
      await loadGameData(gameKey);
    }
    cards = dataByGame[gameKey].cards;
    bySet = dataByGame[gameKey].bySet;

    if (GAMES[gameKey].hasSeries) setupSeriesForGame(gameKey);
    else seriesSelectEl.hidden = true;
    setupCurrentSetForGame(gameKey);

    renderTabs();
    renderOverall();
    renderGrid();
  }

  function setupGameTabs() {
    document.querySelectorAll(".game-tab").forEach(btn => {
      btn.addEventListener("click", () => switchGame(btn.dataset.game));
    });
  }

  async function init() {
    loadOwnedAll();
    loadInterestAll();
    const savedGame = localStorage.getItem(LASTGAME_KEY);
    if (savedGame && GAMES[savedGame]) currentGame = savedGame;
    owned = ownedByGame[currentGame];
    interested = interestByGame[currentGame];

    document.querySelectorAll(".game-tab").forEach(b => b.classList.toggle("active", b.dataset.game === currentGame));
    document.body.classList.toggle("game-pokemon", currentGame === "pokemon");
    $("#gameTitle").textContent = `${GAMES[currentGame].icon} Mi Coleccion`;

    setupSearch();
    setupFilters();
    setupMenu();
    setupGameTabs();
    setupSeriesSelect();
    setupConfirmDialog();
    applyTheme(localStorage.getItem(THEME_KEY) || "default");
    $("#zoomOverlay").addEventListener("click", () => {
      if (!zoomGestureActive) closeZoom();
    });
    setupZoomGestures();

    await loadGameData(currentGame);
    cards = dataByGame[currentGame].cards;
    bySet = dataByGame[currentGame].bySet;

    if (GAMES[currentGame].hasSeries) setupSeriesForGame(currentGame);
    setupCurrentSetForGame(currentGame);

    renderTabs();
    renderOverall();
    renderGrid();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  init();
})();
