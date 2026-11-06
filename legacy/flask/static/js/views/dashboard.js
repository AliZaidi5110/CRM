// Dashboard View Controller
const DashboardView = {
  currentRange: "today",

  async render(container) {
    const user = Auth.getUser();
    if (!user) return;

    container.innerHTML = `
      <div class="dashboard-header">
        <div>
          <h2 style="font-size:22px;font-weight:800;letter-spacing:-0.02em">
            Welcome back, ${user.full_name || user.username}
          </h2>
          <p style="color:var(--text-muted);font-size:13.5px">
            ${user.role_display || user.role} • ${user.team_name ? user.team_name + ' • ' : ''}Customer follow-up workspace
          </p>
        </div>

        <div class="date-pill-group">
          <button class="date-pill ${this.currentRange === 'today' ? 'active' : ''}" onclick="DashboardView.setRange('today')">Today</button>
          <button class="date-pill ${this.currentRange === 'yesterday' ? 'active' : ''}" onclick="DashboardView.setRange('yesterday')">Yesterday</button>
          <button class="date-pill ${this.currentRange === 'this_week' ? 'active' : ''}" onclick="DashboardView.setRange('this_week')">This Week</button>
          <button class="date-pill ${this.currentRange === 'this_month' ? 'active' : ''}" onclick="DashboardView.setRange('this_month')">This Month</button>
        </div>
      </div>

      <div id="dashboard-metrics-loading" style="padding:40px;text-align:center;color:var(--text-muted)">
        Loading live CRM metrics...
      </div>

      <div id="dashboard-metrics-content" class="hidden" style="display:flex;flex-direction:column;gap:24px"></div>
    `;

    await this.loadMetrics();
  },

  async setRange(range) {
    this.currentRange = range;
    const pills = document.querySelectorAll(".date-pill");
    pills.forEach(p => p.classList.toggle("active", p.innerText.toLowerCase().replace(" ", "_") === range));
    await this.loadMetrics();
  },

  async loadMetrics() {
    const loadingEl = document.getElementById("dashboard-metrics-loading");
    const contentEl = document.getElementById("dashboard-metrics-content");
    if (!contentEl) return;

    try {
      let data = null;
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        data = await API.get("/reports/dashboard", { range: this.currentRange });
      } else {
        // Compute basic metrics from IndexedDB cache
        const allCust = await CRMDB.getAll("customers");
        const allCalls = await CRMDB.getAll("calls");

        data = {
          user_role: Auth.getUser().role,
          total_assigned_leads: allCust.length,
          new_leads: allCust.filter(c => c.lead_status === "NEW").length,
          interested_leads: allCust.filter(c => c.lead_status === "INTERESTED").length,
          converted_leads: allCust.filter(c => c.lead_status === "CONVERTED").length,
          conversion_rate: allCust.length ? ((allCust.filter(c => c.lead_status === "CONVERTED").length / allCust.length) * 100).toFixed(1) : 0,
          calls_period: allCalls.length,
          total_users: 6,
          total_teams: 2,
          total_leads: allCust.length,
          total_converted: allCust.filter(c => c.lead_status === "CONVERTED").length,
          funnel: {
            NEW: allCust.filter(c => c.lead_status === "NEW").length,
            CONTACTED: allCust.filter(c => c.lead_status === "CONTACTED").length,
            INTERESTED: allCust.filter(c => c.lead_status === "INTERESTED").length,
            CONVERTED: allCust.filter(c => c.lead_status === "CONVERTED").length
          }
        };
      }

      if (loadingEl) loadingEl.classList.add("hidden");
      contentEl.classList.remove("hidden");

      if (data.user_role === "agent") {
        this.renderAgentDashboard(contentEl, data);
      } else if (data.user_role === "team_leader") {
        this.renderTeamLeaderDashboard(contentEl, data);
      } else {
        this.renderAdminDashboard(contentEl, data);
      }
    } catch (err) {
      if (loadingEl) loadingEl.innerHTML = `<div style="color:var(--accent-rose)">Failed to load dashboard metrics: ${err.message}</div>`;
    }
  },

  renderAgentDashboard(container, data) {
    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Assigned Leads</span>
            <div class="kpi-icon-wrap" style="background:rgba(59, 130, 246, 0.15);color:var(--status-new)"></div>
          </div>
          <div class="kpi-value">${data.total_assigned_leads}</div>
          <div class="kpi-subtext">Active in queue</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">New Leads</span>
            <div class="kpi-icon-wrap" style="background:rgba(245, 158, 11, 0.15);color:var(--accent-amber)"></div>
          </div>
          <div class="kpi-value">${data.new_leads}</div>
          <div class="kpi-subtext">New in your customer list</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Conversions</span>
            <div class="kpi-icon-wrap" style="background:rgba(16, 185, 129, 0.15);color:var(--accent-emerald)"></div>
          </div>
          <div class="kpi-value" style="color:var(--accent-emerald)">${data.converted_leads}</div>
          <div class="kpi-subtext"><span class="kpi-badge positive">${data.conversion_rate}%</span> win rate</div>
        </div>
      </div>

      <div style="display:flex;gap:16px;background:linear-gradient(135deg,rgba(99, 102, 241, 0.1),rgba(6, 182, 212, 0.05));border:1px solid rgba(99, 102, 241, 0.25);border-radius:var(--radius-lg);padding:24px;align-items:center;justify-content:space-between">
        <div>
          <h3 style="font-size:16px;font-weight:700">Keep customer follow-ups moving</h3>
          <p style="color:var(--text-muted);font-size:13px;margin-top:4px">Open your customer list to review customer details or share a lead with your Team Lead.</p>
        </div>
        <button class="btn btn-primary" onclick="App.navigate('leads')">
           Open My Leads
        </button>
      </div>
    `;
  },

  renderTeamLeaderDashboard(container, data) {
    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Team Members</span>
            <div class="kpi-icon-wrap" style="background:rgba(6, 182, 212, 0.15);color:var(--accent-cyan)"></div>
          </div>
          <div class="kpi-value">${data.total_team_members}</div>
          <div class="kpi-subtext">Active agents</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Total Team Leads</span>
            <div class="kpi-icon-wrap" style="background:rgba(99, 102, 241, 0.15);color:var(--primary)"></div>
          </div>
          <div class="kpi-value">${data.total_team_leads}</div>
          <div class="kpi-subtext">${data.new_leads} uncontacted</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Team Conversion</span>
            <div class="kpi-icon-wrap" style="background:rgba(16, 185, 129, 0.15);color:var(--accent-emerald)"></div>
          </div>
          <div class="kpi-value" style="color:var(--accent-emerald)">${data.converted_leads}</div>
          <div class="kpi-subtext"><span class="kpi-badge positive">${data.team_conversion_rate}%</span> team rate</div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-header-toolbar">
          <h3 style="font-size:14px;font-weight:700">Team Agent Performance Leaderboard</h3>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:50px">Rank</th>
                <th>Agent</th>
                <th>Assigned Leads</th>
                <th>Conversions</th>
                <th>Conversion Rate</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${(data.agent_leaderboard || []).map((ag, i) => `
                <tr>
                  <td><div class="leaderboard-rank rank-${i+1}">#${i+1}</div></td>
                  <td><strong>${ag.agent_name}</strong> <span style="font-size:11px;color:var(--text-dim)">(@${ag.username})</span></td>
                  <td>${ag.leads_count}</td>
                  <td><strong style="color:var(--accent-emerald)">${ag.conversions}</strong></td>
                  <td><span class="kpi-badge positive">${ag.conversion_rate}%</span></td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="App.openAgentReport('${ag.agent_id}')">View Activity</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderAdminDashboard(container, data) {
    const funnel = data.funnel || {};
    const maxVal = Math.max(...Object.values(funnel), 1);

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Total Users</span>
            <div class="kpi-icon-wrap" style="background:rgba(99, 102, 241, 0.15);color:var(--primary)"></div>
          </div>
          <div class="kpi-value">${data.total_users}</div>
          <div class="kpi-subtext">${data.total_teams} active teams</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Company Leads</span>
            <div class="kpi-icon-wrap" style="background:rgba(6, 182, 212, 0.15);color:var(--accent-cyan)"></div>
          </div>
          <div class="kpi-value">${data.total_leads}</div>
          <div class="kpi-subtext">Total accounts in CRM</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Total Converted</span>
            <div class="kpi-icon-wrap" style="background:rgba(16, 185, 129, 0.15);color:var(--accent-emerald)"></div>
          </div>
          <div class="kpi-value" style="color:var(--accent-emerald)">${data.total_converted}</div>
          <div class="kpi-subtext"><span class="kpi-badge positive">${data.conversion_rate}%</span> company rate</div>
        </div>
      </div>

      <div class="dashboard-grid-2">
        <div class="table-card" style="padding:20px">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">Company Conversion Funnel</h3>
          <div class="funnel-container">
            ${Object.entries(funnel).map(([stage, count]) => {
              const pct = ((count / maxVal) * 100).toFixed(0);
              const colorMap = {
                NEW: "#3B82F6", CONTACTED: "#6366F1", INTERESTED: "#F59E0B",
                FOLLOW_UP: "#8B5CF6", QUALIFIED: "#06B6D4", CONVERTED: "#10B981", LOST: "#EF4444"
              };
              return `
                <div class="funnel-step">
                  <div class="funnel-header">
                    <span class="funnel-label">${stage}</span>
                    <span class="funnel-count">${count}</span>
                  </div>
                  <div class="funnel-track">
                    <div class="funnel-fill" style="width:${pct}%;background:${colorMap[stage] || '#6366F1'}"></div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <div class="table-card">
          <div class="table-header-toolbar">
            <h3 style="font-size:14px;font-weight:700">Team Comparison</h3>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Leader</th>
                  <th>Leads</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                ${(data.team_performance || []).map(t => `
                  <tr>
                    <td><strong>${t.team_name}</strong></td>
                    <td style="color:var(--text-muted)">${t.team_leader}</td>
                    <td>${t.leads}</td>
                    <td><span class="kpi-badge positive">${t.conversion_rate}%</span></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }
};

window.DashboardView = DashboardView;
