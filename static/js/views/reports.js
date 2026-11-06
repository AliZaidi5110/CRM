// Reports & Analytics View Controller (Section 22)
const ReportsView = {
  currentRange: "this_month",

  async render(container) {
    container.innerHTML = `
      <div class="dashboard-header">
        <div>
          <h2 style="font-size:22px;font-weight:800;letter-spacing:-0.02em">CRM Overview</h2>
          <p style="color:var(--text-muted);font-size:13.5px">Customer records, lead progress, and team ownership.</p>
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          <div class="date-pill-group">
            <button class="date-pill ${this.currentRange === 'today' ? 'active' : ''}" onclick="ReportsView.setRange('today')">Today</button>
            <button class="date-pill ${this.currentRange === 'this_week' ? 'active' : ''}" onclick="ReportsView.setRange('this_week')">This Week</button>
            <button class="date-pill ${this.currentRange === 'this_month' ? 'active' : ''}" onclick="ReportsView.setRange('this_month')">This Month</button>
          </div>
          <button class="btn btn-primary btn-sm" onclick="ReportsView.exportCSV()"> Export CSV</button>
        </div>
      </div>

      <div id="reports-content" style="display:flex;flex-direction:column;gap:24px">
        <div style="padding:40px;text-align:center;color:var(--text-muted)">Generating comprehensive analytics...</div>
      </div>
    `;

    await this.loadReports();
  },

  async setRange(r) {
    this.currentRange = r;
    const pills = document.querySelectorAll(".date-pill");
    pills.forEach(p => p.classList.toggle("active", p.innerText.toLowerCase().replace(" ", "_") === r));
    await this.loadReports();
  },

  async loadReports() {
    const el = document.getElementById("reports-content");
    if (!el) return;

    try {
      const data = await API.get("/reports/admin", { range: this.currentRange });

      const funnel = data.funnel || {};
      const maxVal = Math.max(...Object.values(funnel), 1);

      el.innerHTML = `
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-header"><span class="kpi-label">Total Leads</span><div class="kpi-icon-wrap" style="color:var(--accent-cyan)"></div></div>
            <div class="kpi-value">${data.total_leads}</div>
            <div class="kpi-subtext">Entire database</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header"><span class="kpi-label">Conversions</span><div class="kpi-icon-wrap" style="color:var(--accent-emerald)"></div></div>
            <div class="kpi-value" style="color:var(--accent-emerald)">${data.total_converted}</div>
            <div class="kpi-subtext"><span class="kpi-badge positive">${data.conversion_rate}%</span> win rate</div>
          </div>
        </div>

        <div class="dashboard-grid-2">
          <div class="table-card" style="padding:20px">
            <h3 style="font-size:14px;font-weight:700;margin-bottom:14px">Conversion Funnel Stages</h3>
            <div class="funnel-container">
              ${Object.entries(funnel).map(([stage, count]) => {
                const pct = ((count / maxVal) * 100).toFixed(0);
                return `
                  <div class="funnel-step">
                    <div class="funnel-header">
                      <span class="funnel-label">${stage}</span>
                      <span class="funnel-count">${count}</span>
                    </div>
                    <div class="funnel-track">
                      <div class="funnel-fill" style="width:${pct}%;background:var(--primary)"></div>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <div class="table-card" style="padding:20px">
            <h3 style="font-size:14px;font-weight:700;margin-bottom:14px">Lead Sources Distribution</h3>
            <div style="display:flex;flex-direction:column;gap:12px">
              ${(data.lead_sources || []).map(s => `
                <div>
                  <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:4px">
                    <span>${s.source}</span>
                    <span style="font-family:var(--font-mono);color:var(--accent-cyan)">${s.count}</span>
                  </div>
                  <div class="funnel-track">
                    <div class="funnel-fill" style="width:${((s.count / Math.max(data.total_leads, 1)) * 100).toFixed(0)}%;background:var(--accent-cyan)"></div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>

        <div class="table-card">
          <div class="table-header-toolbar">
            <h3 style="font-size:14px;font-weight:700">Team Performance Breakdown</h3>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Team Name</th>
                <th>Team Leader</th>
                <th>Assigned Leads</th>
                <th>Conversions</th>
                <th>Conversion Rate</th>
              </tr>
            </thead>
            <tbody>
              ${(data.team_performance || []).map(t => `
                <tr>
                  <td><strong>${t.team_name}</strong></td>
                  <td>${t.team_leader}</td>
                  <td>${t.leads}</td>
                  <td><strong style="color:var(--accent-emerald)">${t.conversions}</strong></td>
                  <td><span class="kpi-badge positive">${t.conversion_rate}%</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      el.innerHTML = `<div style="color:var(--accent-rose);padding:30px">${err.message}</div>`;
    }
  },

  async exportCSV() {
    try {
      showToast("Generating Export", "Downloading customer records CSV...", "info");
      const res = await fetch("/api/reports/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API.getToken()}`
        },
        body: JSON.stringify({ filters: {} })
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crm_export_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast("Export Ready", "CSV file successfully downloaded", "success");
    } catch (err) {
      showToast("Export Failed", err.message, "error");
    }
  }
};

window.ReportsView = ReportsView;
