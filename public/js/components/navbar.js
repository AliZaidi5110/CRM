// Top Navbar Component
const Navbar = {
  render() {
    const el = document.getElementById("top-navbar-root");
    if (!el) return;

    const user = Auth.getUser();
    if (!user) {
      el.innerHTML = "";
      return;
    }

    const welcomeName = String(user.full_name || user.username).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
    const agentWelcome = user.role === "agent" ? `<div class="navbar-agent-welcome">Welcome, <strong>${welcomeName}</strong></div>` : "";
    const notificationsButton = user.role === "agent" ? "" : `
          <button class="btn btn-secondary btn-sm" onclick="App.showNotifications()" title="Notifications" style="position:relative">
             <span id="notification-badge" class="nav-badge hidden" style="position:absolute;top:-4px;right:-4px;background:var(--accent-rose);color:#fff">0</span>
          </button>`;

    el.innerHTML = `
      <div class="top-navbar">
        <div class="navbar-search">
          <span class="search-icon"></span>
          <input type="text" id="global-search-input" class="search-input" placeholder="Search customer, phone, company, postcode... [ / ]" autocomplete="off" />
          <div id="global-search-dropdown" class="search-dropdown"></div>
        </div>

        <div class="navbar-actions">
          ${agentWelcome}
          <div id="sync-status-indicator" class="sync-status-indicator">
            <span class="spinner" style="font-size:11px">⟳</span> Syncing...
          </div>

          <div id="connection-status-pill" class="status-pill online" onclick="SyncEngine.toggleSimulateOffline()">
            <span class="dot"></span> Online <span style="font-size:10px;opacity:0.6;margin-left:2px">(Simulate)</span>
          </div>

          ${notificationsButton}

          <button class="btn btn-secondary btn-sm" onclick="Auth.logout()" title="Logout (${user.username})">
             Logout
          </button>
        </div>
      </div>
    `;

    this.bindSearch();
    SyncEngine.updateStatusUI();
  },

  bindSearch() {
    const input = document.getElementById("global-search-input");
    const dropdown = document.getElementById("global-search-dropdown");
    if (!input || !dropdown) return;

    let timeout = null;
    input.addEventListener("input", (e) => {
      clearTimeout(timeout);
      const val = e.target.value.trim();
      if (val.length < 2) {
        dropdown.classList.remove("active");
        dropdown.innerHTML = "";
        return;
      }

      timeout = setTimeout(async () => {
        try {
          let items = [];
          if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
            const res = await API.get("/customers", { search: val, per_page: 8 });
            items = res.items || [];
          } else {
            // Offline search in IndexedDB
            const all = await CRMDB.getAll("customers");
            const q = val.toLowerCase();
            items = all.filter(c =>
              (c.full_name && c.full_name.toLowerCase().includes(q)) ||
              (c.company_name && c.company_name.toLowerCase().includes(q)) ||
              (c.phone && c.phone.includes(q)) ||
              (c.postcode && c.postcode.toLowerCase().includes(q))
            ).slice(0, 8);
          }

          if (items.length === 0) {
            dropdown.innerHTML = `<div style="padding:14px;color:var(--text-dim);text-align:center;font-size:13px">No customers found for "${val}"</div>`;
          } else {
            dropdown.innerHTML = items.map(c => `
              <div class="search-dropdown-item" onclick="App.openCustomer('${c.id}')">
                <div style="font-weight:700;font-size:13.5px;color:var(--text-main)">${c.full_name}</div>
                <div style="font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between;margin-top:2px">
                  <span>${c.company_name || "Private"} • <span style="font-family:var(--font-mono)">${c.phone}</span></span>
                  <span class="badge badge-${(c.lead_status || 'new').toLowerCase()}">${c.lead_status}</span>
                </div>
              </div>
            `).join("");
          }
          dropdown.classList.add("active");
        } catch (err) {
          console.error("Search error:", err);
        }
      }, 250);
    });

    // Close on outside click
    document.addEventListener("click", (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove("active");
      }
    });

    // Keyboard shortcut "/" to focus search
    window.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== input && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
        e.preventDefault();
        input.focus();
      }
    });
  }
};

window.Navbar = Navbar;
