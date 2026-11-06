// Audit Trail View Controller (Section 23 & 57)
const AuditView = {
  currentPage: 1,

  async render(container) {
    container.innerHTML = `
      <div class="dashboard-header">
        <div>
          <h2 style="font-size:22px;font-weight:800;letter-spacing:-0.02em">Immutable System Audit Logs</h2>
          <p style="color:var(--text-muted);font-size:13.5px">Tamper-evident chronological log of every security, assignment, transfer, and lead lifecycle event.</p>
        </div>
      </div>

      <div class="table-card">
        <div class="table-header-toolbar">
          <input type="text" id="audit-search-input" class="form-control" style="width:280px;font-size:13px;padding:7px 12px" placeholder="Search action, summary..." oninput="AuditView.debouncedSearch()" />
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User / Initiator</th>
                <th>Action Type</th>
                <th>Target Entity</th>
                <th>Summary</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody id="audit-table-body">
              <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-dim)">Loading audit trail...</td></tr>
            </tbody>
          </table>
        </div>

        <div style="padding:14px 20px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center">
          <div id="audit-count-summary" style="font-size:12.5px;color:var(--text-muted)">Showing logs</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="AuditView.changePage(-1)">Previous</button>
            <button class="btn btn-secondary btn-sm" onclick="AuditView.changePage(1)">Next</button>
          </div>
        </div>
      </div>
    `;

    await this.loadLogs();
  },

  debouncedSearch() {
    clearTimeout(this._timeout);
    this._timeout = setTimeout(() => {
      this.currentPage = 1;
      this.loadLogs();
    }, 300);
  },

  changePage(delta) {
    this.currentPage = Math.max(1, this.currentPage + delta);
    this.loadLogs();
  },

  async loadLogs() {
    const tbody = document.getElementById("audit-table-body");
    const countEl = document.getElementById("audit-count-summary");
    if (!tbody) return;

    const q = document.getElementById("audit-search-input")?.value.trim() || "";

    try {
      const res = await API.get("/audit", { page: this.currentPage, per_page: 25, search: q });
      const logs = res.logs || [];

      countEl.innerText = `Showing ${logs.length} of ${res.total} entries (Page ${this.currentPage} of ${res.pages || 1})`;

      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-dim)">No audit entries found.</td></tr>`;
        return;
      }

      tbody.innerHTML = logs.map(l => `
        <tr>
          <td style="font-size:12px;font-family:var(--font-mono);color:var(--text-muted)">${l.created_formatted}</td>
          <td>
            <strong>${l.user_name}</strong>
            ${l.username ? `<span style="font-size:11px;color:var(--text-dim);display:block">@${l.username}</span>` : ''}
          </td>
          <td>
            <span class="badge" style="background:var(--bg-elevated);color:var(--accent-cyan);border:1px solid var(--border-light)">
              ${l.action}
            </span>
          </td>
          <td style="font-size:12.5px">${l.entity_type || '-'}</td>
          <td style="font-size:13px">${l.summary}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="AuditView.showDetails('${encodeURIComponent(JSON.stringify(l.details))}')">View JSON</button>
          </td>
        </tr>
      `).join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:var(--accent-rose);text-align:center;padding:24px">${err.message}</td></tr>`;
    }
  },

  showDetails(encodedJson) {
    const details = JSON.parse(decodeURIComponent(encodedJson));
    openModal({
      title: "Audit Event Metadata & Diff",
      content: `<pre style="background:var(--bg-main);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;color:var(--accent-cyan);font-family:var(--font-mono);font-size:12.5px;max-height:360px;overflow-y:auto">${JSON.stringify(details, null, 2)}</pre>`,
      footer: `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`
    });
  }
};

window.AuditView = AuditView;
