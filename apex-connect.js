// Reef Keeper recovery hotfix for Apex Integration + Long-Term tool overlays.
// Safe to keep until the full original modules are restored.

(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showToastSafe(message) {
    try {
      if (typeof showToast === "function") return showToast(message);
      const toast = $("toast");
      if (toast) {
        toast.textContent = message;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 1800);
      }
    } catch (_) {}
  }

  if (typeof window.openLongTermTool !== "function") {
    window.openLongTermTool = function openLongTermTool(name) {
      const overlay = $(`tool-${name}-overlay`);
      if (!overlay) {
        showToastSafe(`Tool not found: ${name}`);
        return;
      }

      overlay.classList.add("visible", "open", "active");
      overlay.style.display = "flex";

      if (name === "memory") {
        renderTankMemoryRecovery();
      }
    };
  }

  if (typeof window.closeLongTermTool !== "function") {
    window.closeLongTermTool = function closeLongTermTool(name) {
      const overlay = $(`tool-${name}-overlay`);
      if (!overlay) return;
      overlay.classList.remove("visible", "open", "active");
      overlay.style.display = "";
    };
  }

  if (typeof window.handleToolOverlayClick !== "function") {
    window.handleToolOverlayClick = function handleToolOverlayClick(event, name) {
      if (event && event.target && event.target.id === `tool-${name}-overlay`) {
        window.closeLongTermTool(name);
      }
    };
  }

  if (typeof window.scrollToolToTop !== "function") {
    window.scrollToolToTop = function scrollToolToTop(name) {
      const body = $(`tool-${name}-body`);
      if (body) body.scrollTo({ top: 0, behavior: "smooth" });
    };
  }

  function getTankMemory() {
    try {
      return JSON.parse(localStorage.getItem("reef_tank_memory_v1") || "[]");
    } catch (_) {
      return [];
    }
  }

  function setTankMemory(items) {
    try {
      localStorage.setItem("reef_tank_memory_v1", JSON.stringify(items || []));
    } catch (_) {}
  }

  function renderTankMemoryRecovery() {
    const box = $("tank-memory-v8");
    if (!box) return;

    const items = getTankMemory();

    box.innerHTML = `
      <div class="long-term-intro">
        Tank Memory stores important reef facts that Reef Keeper should keep using.
      </div>

      <div class="kb-form">
        <input class="inventory-input" id="recovery-memory-title" placeholder="Short title, e.g., Chaeto reactor canceled">
        <textarea class="inventory-notes" id="recovery-memory-note" rows="3" placeholder="Important tank fact, rule, decision, or context..."></textarea>
        <button class="long-term-btn secondary" type="button" onclick="saveRecoveryTankMemory()">Save Memory</button>
      </div>

      <div id="recovery-memory-list" class="strategy-list">
        ${
          items.length
            ? items
                .map(
                  (item, index) => `
                    <div class="strategy-item">
                      <div>
                        <strong>${esc(item.title || "Tank memory")}</strong>
                        <span>${esc(item.note || "")}</span>
                      </div>
                      <button class="hidden-tasks-btn hidden-tasks-secondary" type="button" onclick="deleteRecoveryTankMemory(${index})">Delete</button>
                    </div>
                  `
                )
                .join("")
            : `<div class="muted">No tank memory saved yet.</div>`
        }
      </div>
    `;
  }

  window.saveRecoveryTankMemory = function saveRecoveryTankMemory() {
    const title = $("recovery-memory-title")?.value?.trim();
    const note = $("recovery-memory-note")?.value?.trim();

    if (!title && !note) {
      showToastSafe("Add a title or note first.");
      return;
    }

    const items = getTankMemory();
    items.unshift({
      id: Date.now().toString(36),
      title: title || "Tank memory",
      note: note || "",
      createdAt: new Date().toISOString(),
    });

    setTankMemory(items);
    renderTankMemoryRecovery();
    showToastSafe("Tank memory saved");
  };

  window.deleteRecoveryTankMemory = function deleteRecoveryTankMemory(index) {
    const items = getTankMemory();
    items.splice(index, 1);
    setTankMemory(items);
    renderTankMemoryRecovery();
    showToastSafe("Tank memory deleted");
  };

  async function getApexStatus() {
    const res = await fetch("/api/apex-status", { cache: "no-store" });
    return res.json();
  }

  function findInput(status, name) {
    const inputs = status?.raw?.istat?.inputs || [];
    return inputs.find((item) => item.name === name || item.type === name);
  }

  function findOutput(status, name) {
    const outputs = status?.raw?.istat?.outputs || [];
    return outputs.find((item) => item.name === name);
  }

  function outputState(output) {
    return output?.status?.[0] || "—";
  }

  function renderApexPanel(status) {
    const panel = $("apex-settings-panel");
    if (!panel) return;

    if (!status || !status.ok) {
      panel.innerHTML = `
        <div class="long-term-intro">
          Apex bridge is configured, but no live Apex status is available yet.
        </div>
        <button class="long-term-btn secondary" type="button" onclick="ReefKeeperApex.refresh()">Refresh Apex Status</button>
      `;
      return;
    }

    const temp = findInput(status, "Tmp")?.value;
    const ph = findInput(status, "pH")?.value;
    const orp = findInput(status, "ORP")?.value;

    const rows = [
      ["Temp", temp != null ? `${temp} °F` : "—"],
      ["pH", ph ?? "—"],
      ["ORP", orp != null ? `${orp} mV` : "—"],
      ["Return1", outputState(findOutput(status, "Return1"))],
      ["Return2", outputState(findOutput(status, "Return2"))],
      ["UV pump", outputState(findOutput(status, "UVpump"))],
      ["Skimmer", outputState(findOutput(status, "Skimmer"))],
      ["ATO", outputState(findOutput(status, "ATO"))],
      ["Heat1", outputState(findOutput(status, "Heat1"))],
      ["Heat2", outputState(findOutput(status, "Heat2"))],
    ];

    panel.innerHTML = `
      <div class="long-term-intro">
        Raspberry Pi Apex bridge is live. Last sync:
        <strong>${esc(status.receivedAt || "unknown")}</strong>
      </div>

      <div class="status-grid">
        ${rows
          .map(
            ([label, value]) => `
              <div class="status-chip">
                <div class="status-chip-label">${esc(label)}</div>
                <div class="status-chip-val">${esc(value)}</div>
              </div>
            `
          )
          .join("")}
      </div>

      <div class="backup-note">
        Source: ${esc(status.source || status.apexSourceUrl || "Apex")}
      </div>

      <button class="long-term-btn secondary" type="button" onclick="ReefKeeperApex.refresh()">Refresh Apex Status</button>
    `;
  }

  window.ReefKeeperApex = window.ReefKeeperApex || {};

  window.ReefKeeperApex.renderApexSettings = async function renderApexSettings() {
    const panel = $("apex-settings-panel");
    if (panel) {
      panel.innerHTML = `<div class="long-term-intro">Loading Apex status…</div>`;
    }

    try {
      const status = await getApexStatus();
      renderApexPanel(status);
    } catch (error) {
      if (panel) {
        panel.innerHTML = `
          <div class="long-term-intro">
            Could not load Apex status: ${esc(error.message || error)}
          </div>
          <button class="long-term-btn secondary" type="button" onclick="ReefKeeperApex.refresh()">Try Again</button>
        `;
      }
    }
  };

  window.ReefKeeperApex.refresh = window.ReefKeeperApex.renderApexSettings;

  window.ReefKeeperApex.openSettings = function openSettings() {
    if (typeof showWorkspace === "function") {
      showWorkspace("settings");
    }

    setTimeout(() => {
      const card = $("apex-settings-card");
      if (card) {
        try {
          card.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (_) {
          card.scrollIntoView();
        }
      }
      window.ReefKeeperApex.renderApexSettings();
    }, 150);
  };

  document.addEventListener("DOMContentLoaded", function () {
    try {
      if ($("apex-settings-panel")) {
        window.ReefKeeperApex.renderApexSettings();
      }
    } catch (_) {}
  });
})();
// Force recovery override for Tank Memory overlay.
// This runs after the existing app functions and replaces the broken memory opener.
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getMemoryItems() {
    const keys = [
      "reef_tank_memory_v1",
      "reef_tank_memory",
      "reef_long_term_memory",
      "reef_knowledge_base_v1",
      "reef_kb_items_v1"
    ];

    for (const key of keys) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        if (Array.isArray(value) && value.length) return value;
      } catch (_) {}
    }

    return [];
  }

  function saveMemoryItems(items) {
    try {
      localStorage.setItem("reef_tank_memory_v1", JSON.stringify(items || []));
    } catch (_) {}
  }

  window.renderTankMemoryRecovery = function renderTankMemoryRecovery() {
    const box = $("tank-memory-v8");
    if (!box) return;

    const items = getMemoryItems();

    box.innerHTML = `
      <div class="long-term-intro">
        Tank Memory stores important reef facts, decisions, and rules that Reef Keeper should keep using.
      </div>

      <div class="kb-form">
        <input class="inventory-input" id="recovery-memory-title" placeholder="Short title, e.g., Chaeto reactor canceled">
        <textarea class="inventory-notes" id="recovery-memory-note" rows="3" placeholder="Important tank fact, rule, decision, or context..."></textarea>
        <button class="long-term-btn secondary" type="button" onclick="saveRecoveryTankMemory()">Save Memory</button>
      </div>

      <div id="recovery-memory-list" class="strategy-list">
        ${
          items.length
            ? items.map((item, index) => `
                <div class="strategy-item">
                  <div>
                    <strong>${esc(item.title || item.name || item.category || "Tank memory")}</strong>
                    <span>${esc(item.note || item.text || item.content || item.value || item.description || "")}</span>
                  </div>
                  <button class="hidden-tasks-btn hidden-tasks-secondary" type="button" onclick="deleteRecoveryTankMemory(${index})">Delete</button>
                </div>
              `).join("")
            : `<div class="muted">No tank memory saved yet.</div>`
        }
      </div>
    `;
  };

  window.saveRecoveryTankMemory = function saveRecoveryTankMemory() {
    const title = $("recovery-memory-title")?.value?.trim();
    const note = $("recovery-memory-note")?.value?.trim();

    if (!title && !note) {
      alert("Add a title or note first.");
      return;
    }

    const items = getMemoryItems();
    items.unshift({
      id: Date.now().toString(36),
      title: title || "Tank memory",
      note: note || "",
      createdAt: new Date().toISOString()
    });

    saveMemoryItems(items);
    window.renderTankMemoryRecovery();
  };

  window.deleteRecoveryTankMemory = function deleteRecoveryTankMemory(index) {
    const items = getMemoryItems();
    items.splice(index, 1);
    saveMemoryItems(items);
    window.renderTankMemoryRecovery();
  };

  const oldOpenLongTermTool = window.openLongTermTool;

  window.openLongTermTool = function openLongTermTool(name) {
    if (name === "memory") {
      const overlay = $("tool-memory-overlay");
      if (!overlay) {
        alert("Tank Memory overlay not found.");
        return;
      }

      overlay.classList.add("visible", "open", "active");
      overlay.style.display = "flex";

      setTimeout(() => {
        window.renderTankMemoryRecovery();
      }, 50);

      return;
    }

    if (typeof oldOpenLongTermTool === "function") {
      return oldOpenLongTermTool.apply(this, arguments);
    }

    const overlay = $(`tool-${name}-overlay`);
    if (overlay) {
      overlay.classList.add("visible", "open", "active");
      overlay.style.display = "flex";
    }
  };

  const oldCloseLongTermTool = window.closeLongTermTool;

  window.closeLongTermTool = function closeLongTermTool(name) {
    const overlay = $(`tool-${name}-overlay`);
    if (overlay) {
      overlay.classList.remove("visible", "open", "active");
      overlay.style.display = "";
      return;
    }

    if (typeof oldCloseLongTermTool === "function") {
      return oldCloseLongTermTool.apply(this, arguments);
    }
  };

  window.handleToolOverlayClick = function handleToolOverlayClick(event, name) {
    if (event && event.target && event.target.id === `tool-${name}-overlay`) {
      window.closeLongTermTool(name);
    }
  };

  window.scrollToolToTop = function scrollToolToTop(name) {
    const body = $(`tool-${name}-body`);
    if (body) body.scrollTo({ top: 0, behavior: "smooth" });
  };
})();
