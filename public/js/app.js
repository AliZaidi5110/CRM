// CallPro CRM Master Application Router & State Manager
const App = {
  currentRoute: "dashboard",

  async init() {
    await Auth.init();

    // Rebuild the authenticated shell after a full page refresh. The early
    // DOMContentLoaded check runs before Auth.init restores the saved user.
    if (Auth.isLoggedIn()) this.renderAppShell();

    // Next.js owns page/asset delivery; IndexedDB still stores offline records.

    // Hash route listener
    window.addEventListener("hashchange", () => this.handleRoute());

    // Sync refresh listener
    window.addEventListener("crm:synced", () => {
      this.handleRoute();
      Sidebar.refreshBadges();
    });

    this.handleRoute();
  },

  handleRoute() {
    const rawHash = window.location.hash.slice(1) || "dashboard";
    const [route, param] = rawHash.split("/");

    if (!Auth.isLoggedIn() && route !== "login") {
      window.location.hash = "#login";
      this.renderLoginView();
      return;
    }

    if (Auth.isLoggedIn() && route === "login") {
      window.location.hash = "#dashboard";
      return;
    }

    if (route === "login") {
      this.renderLoginView();
      return;
    }

    // Render Shell (Navbar + Sidebar)
    Navbar.render();
    Sidebar.activeRoute = route;
    Sidebar.render();

    const mainContainer = document.getElementById("main-viewport-content");
    if (!mainContainer) return;

    this.currentRoute = route;

    switch (route) {
      case "dashboard":
        DashboardView.render(mainContainer);
        break;
      case "coldcall":
        this.navigate("leads");
        return;
      case "leads":
        LeadsView.render(mainContainer);
        break;
      case "customer":
        CustomerProfileView.render(mainContainer, param);
        break;
      case "callbacks":
        if (Auth.isRole("agent")) this.navigate("leads");
        else CallbacksView.render(mainContainer);
        break;
      case "transfers":
        if (Auth.isRole("agent")) this.navigate("leads");
        else LeadTransferView.render(mainContainer);
        break;
      case "reports":
        ReportsView.render(mainContainer);
        break;
      case "teams":
        TeamsView.render(mainContainer);
        break;
      case "users":
        UsersView.render(mainContainer);
        break;
      case "audit":
        AuditView.render(mainContainer);
        break;
      case "import_export":
        ImportExportView.render(mainContainer);
        break;
      case "contracts":
        if (Auth.isRole("super_admin")) ContractsView.render(mainContainer);
        else DashboardView.render(mainContainer);
        break;
      case "finance":
        if (Auth.isRole("super_admin")) FinanceView.render(mainContainer);
        else DashboardView.render(mainContainer);
        break;
      case "employee_finance":
        if (Auth.isRole("super_admin")) EmployeeFinanceView.render(mainContainer);
        else DashboardView.render(mainContainer);
        break;
      default:
        DashboardView.render(mainContainer);
        break;
    }
  },

  navigate(route, param = "") {
    window.location.hash = param ? `#${route}/${param}` : `#${route}`;
  },

  openCustomer(id) {
    this.navigate("customer", id);
  },

  openCreateLeadModal() {
    LeadsView.openCreateLeadModal();
  },

  async showNotifications() {
    const cbData = await API.get("/callbacks");
    const overdue = cbData.overdue || [];
    const today = cbData.today || [];

    openModal({
      title: "Notification Center",
      content: `
        <div style="display:flex;flex-direction:column;gap:10px">
          ${overdue.map(c => `
            <div style="padding:10px 14px;background:rgba(239,68,68,0.12);border-left:3px solid var(--accent-rose);border-radius:var(--radius-sm)">
              <div style="font-weight:700;font-size:13px;color:#FDA4AF"> Callback Overdue: ${c.customer_name}</div>
              <div style="font-size:12px;color:var(--text-muted)">Scheduled for ${c.scheduled_formatted}. Reason: ${c.reason}</div>
            </div>
          `).join("")}

          ${today.map(c => `
            <div style="padding:10px 14px;background:rgba(245,158,11,0.12);border-left:3px solid var(--accent-amber);border-radius:var(--radius-sm)">
              <div style="font-weight:700;font-size:13px;color:#FDE68A"> Due Today: ${c.customer_name} (${c.scheduled_formatted.split(',')[1] || ''})</div>
              <div style="font-size:12px;color:var(--text-muted)">Reason: ${c.reason}</div>
            </div>
          `).join("")}

          ${(!overdue.length && !today.length) ? '<div style="padding:20px;text-align:center;color:var(--text-dim)">No active urgent alerts. You are completely caught up!</div>' : ''}
        </div>
      `,
      footer: `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`
    });
  },

  renderLoginView() {
    const root = document.getElementById("app-root");
    if (!root) return;

    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at center, rgba(99,102,241,0.15), var(--bg-main) 70%);padding:20px">
        <div class="table-card" style="width:100%;max-width:440px;padding:32px;box-shadow:var(--shadow-lg);border-color:var(--border-light)">
          <div style="text-align:center;margin-bottom:24px">
            <div class="brand-icon" style="margin:0 auto 12px;width:48px;height:48px;font-size:24px"></div>
            <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.02em">CallPro CRM</h1>
            <p style="color:var(--text-muted);font-size:13px;margin-top:4px">Customer details and team follow-up</p>
          </div>

          <form id="login-form" onsubmit="App.handleLoginSubmit(event)">
            <div class="form-group">
              <label class="form-label">Username or Email</label>
              <input type="text" id="login-username" class="form-control" placeholder="e.g. admin or agent_ali" required />
            </div>

            <div class="form-group">
              <label class="form-label">Password</label>
              <div class="password-control">
                <input type="password" id="login-password" class="form-control" placeholder="Enter your password" required />
                <button type="button" class="password-toggle" aria-label="Show password" title="Show password" onclick="App.togglePasswordVisibility('login-password', this)">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </div>

            <button type="submit" id="btn-login-submit" class="btn btn-primary" style="width:100%;margin-top:8px">
              Sign In to CRM
            </button>
          </form>

          <div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--border-subtle)">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-dim);letter-spacing:0.06em;margin-bottom:10px;text-align:center">
              Quick Test Accounts (Click to Fill)
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <button class="btn btn-secondary btn-sm" onclick="App.fillDemoLogin('admin', 'admin123')">
                ️ Super Admin
              </button>
              <button class="btn btn-secondary btn-sm" onclick="App.fillDemoLogin('leader_a', 'leader123')">
                 Team Leader A
              </button>
              <button class="btn btn-secondary btn-sm" onclick="App.fillDemoLogin('agent_ali', 'agent123')">
                 Ali Khan
              </button>
              <button class="btn btn-secondary btn-sm" onclick="App.fillDemoLogin('agent_ahmed', 'agent123')">
                 Ahmed Raza
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  fillDemoLogin(u, p) {
    const userEl = document.getElementById("login-username");
    const passEl = document.getElementById("login-password");
    if (userEl && passEl) {
      userEl.value = u;
      passEl.value = p;
      this.handleLoginSubmit(new Event("submit"));
    }
  },

  togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input || !button) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.setAttribute("aria-label", show ? "Hide password" : "Show password");
    button.title = show ? "Hide password" : "Show password";
    button.innerHTML = show
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.7M6.2 6.3C3.5 8.1 2 12 2 12s3.6 7 10 7c1.2 0 2.3-.2 3.3-.6"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  },

  async handleLoginSubmit(event) {
    if (event) event.preventDefault();
    const u = document.getElementById("login-username")?.value.trim();
    const p = document.getElementById("login-password")?.value;
    const btn = document.getElementById("btn-login-submit");

    if (!u || !p) return;
    if (btn) {
      btn.disabled = true;
      btn.innerText = "Authenticating...";
    }

    try {
      await Auth.login(u, p);
      showToast("Welcome Back", "Authentication successful", "success");
      
      // Render standard shell
      this.renderAppShell();
      window.location.hash = "#dashboard";
    } catch (err) {
      showToast("Login Failed", err.message, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = "Sign In to CRM";
      }
    }
  },

  renderAppShell() {
    const root = document.getElementById("app-root");
    if (!root) return;

    root.innerHTML = `
      <div class="app-container">
        <!-- Sidebar -->
        <div id="sidebar-root"></div>

        <!-- Main Viewport -->
        <div class="main-viewport">
          <!-- Top Navbar -->
          <div id="top-navbar-root"></div>

          <!-- Main View Container -->
          <main id="main-viewport-content" class="view-container"></main>
        </div>
      </div>

      <!-- Universal Modal Backdrop -->
      <div id="universal-modal-backdrop" class="modal-backdrop">
        <div id="universal-modal-card" class="modal-card">
          <div class="modal-header">
            <h3 id="universal-modal-title">Modal Title</h3>
            <button class="modal-close-btn" aria-label="Close" onclick="closeModal()">Close</button>
          </div>
          <div id="universal-modal-body" class="modal-body"></div>
          <div id="universal-modal-footer" class="modal-footer"></div>
        </div>
      </div>

      <!-- Toast Container -->
      <div id="toast-container"></div>
    `;
  }
};

window.App = App;
// Initialized by the Next.js client component after scripts load in order.
