// Sidebar Navigation Component
const Sidebar = {
  activeRoute: "dashboard",

  render() {
    const el = document.getElementById("sidebar-root");
    if (!el) return;

    const user = Auth.getUser();
    if (!user) {
      el.innerHTML = "";
      return;
    }

    const role = user.role;
    const isSuperAdmin = role === "super_admin";
    const isTeamLeader = role === "team_leader";
    const isAgent = role === "agent";

    el.innerHTML = `
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="brand-icon">CRM</div>
          <div class="brand-text">
            <h1>CallPro CRM</h1>
            <span>Customer Workspace</span>
          </div>
        </div>

        <nav class="sidebar-nav">
          <div class="nav-section-title">Core Operations</div>
          
          <div class="nav-item ${this.activeRoute === 'dashboard' ? 'active' : ''}" onclick="App.navigate('dashboard')">
            <span class="icon">D</span>
            <span>Dashboard</span>
          </div>

          ${isSuperAdmin ? `
            <div class="nav-item ${this.activeRoute === 'users' ? 'active' : ''}" onclick="App.navigate('users')">
              <span class="icon">U</span>
              <span>Users & Access</span>
            </div>
          ` : ''}

          <div class="nav-item ${this.activeRoute === 'leads' ? 'active' : ''}" onclick="App.navigate('leads')">
            <span class="icon">C</span>
            <span>${isAgent ? 'My Customers' : (isTeamLeader ? 'Team Customers' : 'All Customers')}</span>
          </div>

          ${!isAgent ? `
            <div class="nav-item ${this.activeRoute === 'callbacks' ? 'active' : ''}" onclick="App.navigate('callbacks')">
              <span class="icon">F</span>
              <span>Callbacks</span>
              <span id="sidebar-cb-badge" class="nav-badge hidden" style="background:var(--accent-rose);color:#fff">0</span>
            </div>
          ` : ''}

          ${!isAgent ? `
            <div class="nav-item ${this.activeRoute === 'transfers' ? 'active' : ''}" onclick="App.navigate('transfers')">
              <span class="icon">A</span>
              <span>${isTeamLeader ? 'Team Lead Inbox' : 'Lead Assignments'}</span>
              <span id="sidebar-transfer-badge" class="nav-badge hidden" style="background:var(--accent-amber);color:#000">0</span>
            </div>
          ` : ''}

          ${(isSuperAdmin || isTeamLeader) ? `
            <div class="nav-section-title">Management</div>
            
            <div class="nav-item ${this.activeRoute === 'reports' ? 'active' : ''}" onclick="App.navigate('reports')">
              <span class="icon">R</span>
              <span>Reports & Analytics</span>
            </div>

            <div class="nav-item ${this.activeRoute === 'teams' ? 'active' : ''}" onclick="App.navigate('teams')">
              <span class="icon">T</span>
              <span>Team Management</span>
            </div>
          ` : ''}

          ${isSuperAdmin ? `
            <div class="nav-section-title">Administration</div>
            
            <div class="nav-item ${this.activeRoute === 'audit' ? 'active' : ''}" onclick="App.navigate('audit')">
              <span class="icon">L</span>
              <span>Audit Logs</span>
            </div>

            <div class="nav-item ${this.activeRoute === 'import_export' ? 'active' : ''}" onclick="App.navigate('import_export')">
              <span class="icon">I</span>
              <span>Import & Export</span>
            </div>

            <div class="nav-item ${this.activeRoute === 'contracts' ? 'active' : ''}" onclick="App.navigate('contracts')">
              <span class="icon">C</span>
              <span>Contracts</span>
            </div>

            <div class="nav-item ${this.activeRoute === 'finance' ? 'active' : ''}" onclick="App.navigate('finance')">
              <span class="icon">F</span>
              <span>Finance</span>
            </div>

            <div class="nav-item ${this.activeRoute === 'employee_finance' ? 'active' : ''}" onclick="App.navigate('employee_finance')">
              <span class="icon">E</span>
              <span>Employees & Sales</span>
            </div>
          ` : ''}
        </nav>

        <div class="sidebar-footer">
          <div class="user-snippet">
            <div class="avatar">${user.full_name ? user.full_name[0].toUpperCase() : 'U'}</div>
            <div class="user-info">
              <div class="user-name truncate">${user.full_name || user.username}</div>
              <div class="user-role-badge">${user.role_display || user.role} ${user.team_name ? '• ' + user.team_name : ''}</div>
            </div>
          </div>
        </div>
      </aside>
    `;

    el.querySelectorAll(".nav-item").forEach(item => {
      const label = Array.from(item.children)
        .filter(child => !child.classList.contains("icon") && !child.classList.contains("nav-badge"))
        .map(child => child.textContent.trim())
        .filter(Boolean)
        .join(" ");
      item.title = label;
      item.setAttribute("aria-label", label);
      item.setAttribute("role", "link");
      item.tabIndex = 0;
      item.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          item.click();
        }
      });
    });

    this.refreshBadges();
  },

  async refreshBadges() {
    try {
      const cbBadge = document.getElementById("sidebar-cb-badge");
      if (cbBadge) {
        const cbData = await API.get("/callbacks");
        const overdueCount = cbData.counts ? cbData.counts.overdue : 0;
        if (overdueCount > 0) {
          cbBadge.innerText = overdueCount;
          cbBadge.classList.remove("hidden");
        } else {
          cbBadge.classList.add("hidden");
        }
      }

      if (Auth.isRole("team_leader") || Auth.isRole("super_admin")) {
        const pendingData = await API.get("/assignments/pending");
        const count = (pendingData.pending || []).length;
        const transBadge = document.getElementById("sidebar-transfer-badge");
        if (transBadge) {
          if (count > 0) {
            transBadge.innerText = count;
            transBadge.classList.remove("hidden");
          } else {
            transBadge.classList.add("hidden");
          }
        }
      }
    } catch {
      // Ignore if offline
    }
  }
};

window.Sidebar = Sidebar;
