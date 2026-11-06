// Lead Transfers & Team Leader Review Workflow (Section 16 & 17)
const LeadTransferView = {
  async render(container) {
    const user = Auth.getUser();
    const isLeaderOrAdmin = user.role === "team_leader" || user.role === "super_admin";

    container.innerHTML = `
      <div class="lead-transfer-page">
      <div class="dashboard-header">
        <div>
          <h2 style="font-size:22px;font-weight:800;letter-spacing:-0.02em">Lead Sharing & Transfers</h2>
          <p style="color:var(--text-muted);font-size:13.5px">Share a customer with your Team Lead for support. New leads are also visible to Admin.</p>
        </div>
      </div>

      ${isLeaderOrAdmin ? `
        <div class="table-card lead-review-card">
          <div class="table-header-toolbar">
            <h3 style="font-size:15px;font-weight:700">Leads waiting for review</h3>
          </div>
          <div class="table-responsive">
            <table class="data-table lead-review-table">
              <colgroup><col class="review-date-col"><col class="review-customer-col"><col class="review-agent-col"><col class="review-reason-col"><col class="review-priority-col"><col class="review-action-col"></colgroup>
              <thead>
                <tr>
                  <th>Submitted At</th>
                  <th>Customer / Company</th>
                  <th>Submitted By</th>
                  <th>Reason</th>
                  <th>Priority</th>
                  <th style="text-align:right">Action</th>
                </tr>
              </thead>
              <tbody id="pending-assignments-body">
                <tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-dim)">Loading submissions...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <div class="table-card">
        <div class="table-header-toolbar">
          <h3 style="font-size:15px;font-weight:700">Share with your Team Lead</h3>
        </div>
        <div class="lead-transfer-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Select Customer</label>
              <select id="transfer-cust-select" class="form-control">
                <option value="">Choose a customer lead...</option>
              </select>
            </div>
            <div class="form-group assignment-admin-note">
              <span>Admin visibility</span>
              <strong>All new leads appear in the Admin customer list automatically.</strong>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Reason for sharing</label>
            <input type="text" id="transfer-reason" class="form-control" placeholder="e.g. Commercial account segment over £50k turnover, requires specialist team" />
          </div>

          <div class="form-group">
            <label class="form-label">Handover Notes</label>
            <textarea id="transfer-notes" class="form-control" placeholder="Context, details of conversations, key requirements..."></textarea>
          </div>

          <button class="btn btn-primary" onclick="LeadTransferView.submitTransferRequest()">
            Submit Request
          </button>
        </div>
      </div>
      </div>
    `;

    await this.initData();
  },

  async initData() {
    const user = Auth.getUser();

    // Populate customer select
    try {
      const res = await API.get("/customers", { per_page: 50 });
      const select = document.getElementById("transfer-cust-select");
      if (select && res.items) {
        select.innerHTML = `<option value="">Choose a customer lead...</option>` +
          res.items.map(c => `<option value="${c.id}">${c.full_name} (${c.company_name || 'Independent'}) - ${c.phone}</option>`).join("");
      }

      // Load pending reviews if leader/admin
      if (user.role === "team_leader" || user.role === "super_admin") {
        const pending = await API.get("/assignments/pending");
        const tbody = document.getElementById("pending-assignments-body");
        if (tbody) {
          const list = pending.pending || [];
          if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-dim)">No leads currently awaiting Team Leader review.</td></tr>`;
          } else {
            tbody.innerHTML = list.map(item => `
              <tr>
                <td data-label="Submitted">${new Date(item.created_at).toLocaleString()}</td>
                <td data-label="Customer / Company">
                  <div class="review-customer-name">${item.customer_name || 'Customer record unavailable'}</div>
                  <div class="review-customer-company">${item.customer_company || 'Individual customer'}</div>
                </td>
                <td data-label="Submitted by">${item.from_user_name || 'Agent'}</td>
                <td data-label="Reason">${item.reason || 'No reason provided'}</td>
                <td data-label="Priority"><span class="badge badge-priority-high">${item.priority || 'Medium'}</span></td>
                <td data-label="Actions" class="review-action-cell">
                  <div class="lead-review-actions">
                    <button class="btn btn-secondary btn-sm" onclick="App.openCustomer('${item.customer_id}')">View profile</button>
                    <button class="btn btn-primary btn-sm" onclick="LeadTransferView.openReassignModal('${item.customer_id}')">Reassign to Agent</button>
                  </div>
                </td>
              </tr>
            `).join("");
          }
        }
      }
    } catch (err) {
      console.warn("Transfer init error:", err);
    }
  },

  async openReassignModal(customerId) {
    try {
      const userRes = await API.get("/users", { role: "agent" });
      const agents = userRes.users || [];

      openModal({
        title: "Reassign Lead to Agent",
        content: `
          <div class="form-group">
            <label class="form-label">Select Agent</label>
            <select id="reassign-agent-id" class="form-control">
              ${agents.map(a => `<option value="${a.id}">${a.full_name} (@${a.username})</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Instructions / Reassignment Reason</label>
            <input type="text" id="reassign-reason" class="form-control" placeholder="e.g. Assigned to close card machine deal with 0.85% rate." />
          </div>
          <div class="form-group">
            <label class="form-label">Supervisor Notes</label>
            <textarea id="reassign-notes" class="form-control" placeholder="Provide context on agreed discounts or next steps..."></textarea>
          </div>
        `,
        footer: `
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="LeadTransferView.submitReassignment('${customerId}')">Confirm Reassignment</button>
        `
      });
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  async submitReassignment(customerId) {
    const targetAgentId = document.getElementById("reassign-agent-id").value;
    const reason = document.getElementById("reassign-reason").value.trim();
    const notes = document.getElementById("reassign-notes").value.trim();

    try {
      await API.post("/assignments/reassign", {
        customer_id: customerId,
        target_agent_id: targetAgentId,
        reason,
        notes
      });
      closeModal();
      showToast("Reassigned", "Lead successfully reassigned to agent", "success");
      await this.initData();
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  async submitTransferRequest() {
    const custId = document.getElementById("transfer-cust-select").value;
    const reason = document.getElementById("transfer-reason").value.trim();
    const notes = document.getElementById("transfer-notes").value.trim();

    if (!custId) {
      showToast("Select Customer", "Please choose a customer to transfer", "warning");
      return;
    }
    if (!reason) {
      showToast("Reason Required", "Please specify the transfer reason", "warning");
      return;
    }

    try {
      await API.post("/assignments/assign-to-leader", { customer_id: custId, reason, notes, priority: "HIGH" });
      showToast("Shared with Team Lead", "The lead remains in your list, and Admin can see it as well.", "success");
      this.render(document.getElementById("main-viewport-content"));
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  }
};

window.LeadTransferView = LeadTransferView;
