// Customer 360 Degree Profile View Controller (Section 10)
const CustomerProfileView = {
  customer: null,
  activeTab: "timeline",

  async render(container, customerId) {
    if (!customerId) {
      container.innerHTML = `<div style="padding:40px;color:var(--accent-rose)">No customer ID provided</div>`;
      return;
    }

    container.innerHTML = `
      <div id="customer-profile-loading" style="padding:40px;text-align:center;color:var(--text-muted)">
        Loading customer profile...
      </div>
      <div id="customer-profile-content" class="hidden"></div>
    `;

    await this.loadProfile(customerId);
  },

  async loadProfile(customerId) {
    const loadingEl = document.getElementById("customer-profile-loading");
    const contentEl = document.getElementById("customer-profile-content");
    if (!contentEl) return;

    try {
      let data = null;
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        data = await API.get(`/customers/${customerId}`);
      } else {
        const cust = await CRMDB.get("customers", customerId);
        if (!await Auth.canAccessCustomer(cust)) throw new Error("You do not have access to this lead.");
        const allCalls = await CRMDB.getAll("calls");
        const allCb = await CRMDB.getAll("callbacks");
        const allConvo = await CRMDB.getAll("conversations");
        data = {
          customer: cust,
          calls: allCalls.filter(c => c.customer_id === customerId),
          callbacks: allCb.filter(cb => cb.customer_id === customerId),
          conversations: allConvo.filter(cv => cv.customer_id === customerId),
          assignments: []
        };
      }

      this.data = data;
      this.customer = data.customer;

      if (loadingEl) loadingEl.classList.add("hidden");
      contentEl.classList.remove("hidden");
      this.renderProfileContent(contentEl, data);
    } catch (err) {
      if (loadingEl) loadingEl.innerHTML = `<div style="color:var(--accent-rose)">Error loading customer profile: ${err.message}</div>`;
    }
  },

  renderProfileContent(container, data) {
    const c = data.customer;
    if (Auth.isRole("agent") && this.activeTab === "callbacks") this.activeTab = "timeline";

    container.innerHTML = `
      <!-- Top Profile Card -->
      <div class="table-card customer-profile-summary">
        <div class="customer-profile-header">
          <div>
            <div class="customer-profile-identity">
              <h2>${c.full_name}</h2>
              <span class="badge badge-${(c.lead_status || 'new').toLowerCase()}">${c.lead_status}</span>
              <span class="badge customer-priority-badge">${c.priority || 'MEDIUM'} Priority</span>
            </div>
            <p class="customer-profile-company">
              ${c.company_name || 'Individual Merchant'} • <span style="font-family:var(--font-mono)">${c.code}</span>
            </p>
          </div>

          <div class="customer-profile-actions">
            <button class="btn btn-secondary" onclick="CustomerProfileView.openEditModal()">Edit information</button>
          </div>
        </div>

        <div class="customer-profile-details">
          <div class="customer-profile-field">
            <span class="lead-meta-label">Phone numbers</span>
            <div class="customer-profile-value customer-profile-phone">${c.phone} ${c.secondary_phone ? ' / ' + c.secondary_phone : ''}</div>
          </div>
          <div class="customer-profile-field">
            <span class="lead-meta-label">Email</span>
            <div class="customer-profile-value">${c.email || 'None'}</div>
          </div>
          <div class="customer-profile-field">
            <span class="lead-meta-label">Assigned Agent & Team</span>
            <div class="customer-profile-value">
              ${c.assigned_agent_name || 'Unassigned'} <span class="customer-profile-secondary">• ${c.assigned_team_name || 'No Team'}</span>
            </div>
          </div>
          <div class="customer-profile-field">
            <span class="lead-meta-label">Address</span>
            <div class="customer-profile-value">
              ${[c.address, c.city, c.postcode, c.country].filter(Boolean).join(', ') || 'Not recorded'}
            </div>
          </div>
          <div class="customer-profile-field">
            <span class="lead-meta-label">Record code</span>
            <div class="customer-profile-value customer-profile-phone">${c.code || '—'}</div>
          </div>
        </div>
        ${c.notes ? `
          <div class="customer-profile-notes">
            <span class="lead-meta-label">Customer notes</span>
            <div class="customer-profile-value">${c.notes}</div>
          </div>
        ` : ''}
        ${c.tags?.length ? `
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
            ${c.tags.map(tag => `<span class="team-chip">${tag}</span>`).join('')}
          </div>
        ` : ''}
        ${c.custom_fields && Object.keys(c.custom_fields).filter(key => key !== 'closing_details').length ? `
          <div style="margin-top:16px">
            <span class="lead-meta-label">Additional customer details</span>
            <div class="customer-extra-fields">
              ${Object.entries(c.custom_fields).filter(([key]) => key !== 'closing_details').map(([key, value]) => `
                <div><span>${key.replace(/_/g, ' ')}</span><strong>${typeof value === 'object' ? JSON.stringify(value) : value}</strong></div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Tabs Navigation -->
      <div class="customer-profile-tabs">
        <button class="btn btn-secondary btn-sm ${this.activeTab === 'timeline' ? 'active' : ''}" onclick="CustomerProfileView.setTab('timeline')">
          Conversations & Notes (${data.conversations.length})
        </button>
        ${Auth.isRole("agent") ? '' : `<button class="btn btn-secondary btn-sm ${this.activeTab === 'callbacks' ? 'active' : ''}" onclick="CustomerProfileView.setTab('callbacks')">Callbacks (${data.callbacks.length})</button>`}
        <button class="btn btn-secondary btn-sm ${this.activeTab === 'assignments' ? 'active' : ''}" onclick="CustomerProfileView.setTab('assignments')">
          Assignment History (${data.assignments.length})
        </button>
      </div>

      <!-- Tab Content Area -->
      <div id="customer-tab-content"></div>
    `;

    this.renderActiveTabContent();
  },

  setTab(tab) {
    this.activeTab = tab;
    this.renderActiveTabContent();
  },

  renderActiveTabContent() {
    const el = document.getElementById("customer-tab-content");
    if (!el) return;

    if (this.activeTab === "timeline") {
      const convos = this.data.conversations || [];
      if (!convos.length) {
        el.innerHTML = `<div class="table-card" style="padding:30px;text-align:center;color:var(--text-dim)">No chronological interactions recorded yet.</div>`;
        return;
      }
      el.innerHTML = `
        <section class="customer-activity-section" aria-label="Customer activity history">
          <div class="customer-activity-heading"><h3>Activity history</h3><span>${convos.length} ${convos.length === 1 ? 'entry' : 'entries'}</span></div>
          <div class="timeline-container">
          ${convos.map(cv => `
            <div class="timeline-item">
              <div class="timeline-card">
                <div class="timeline-meta">
                  <span class="timeline-agent">${cv.agent_name || 'System'}</span>
                  <time>${cv.created_at ? new Date(cv.created_at).toLocaleString() : ''}</time>
                </div>
                ${cv.outcome ? `<div class="timeline-outcome"><span>Outcome</span><strong>${cv.outcome}</strong></div>` : ''}
                <div class="timeline-summary">${cv.summary || cv.notes || ''}</div>
                ${cv.next_action ? `<div class="timeline-next-action"><span>Next step</span><strong>${cv.next_action}</strong></div>` : ''}
                ${cv.callback_info ? `<div class="timeline-next-action timeline-callback"><span>Callback</span><strong>${cv.callback_info}</strong></div>` : ''}
              </div>
            </div>
          `).join("")}
          </div>
        </section>
      `;
    } else if (this.activeTab === "calls") {
      const calls = this.data.calls || [];
      if (!calls.length) {
        el.innerHTML = `<div class="table-card" style="padding:30px;text-align:center;color:var(--text-dim)">No phone calls logged for this customer.</div>`;
        return;
      }
      el.innerHTML = `
        <div class="table-card">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Agent</th>
                <th>Duration</th>
                <th>Outcome / Disposition</th>
                <th>Notes</th>
                <th>Next Action</th>
              </tr>
            </thead>
            <tbody>
              ${calls.map(cl => `
                <tr>
                  <td>${new Date(cl.created_at).toLocaleString()}</td>
                  <td><strong>${cl.agent_name}</strong></td>
                  <td style="font-family:var(--font-mono)">${cl.duration_formatted}</td>
                  <td><span class="badge badge-interested">${cl.outcome}</span></td>
                  <td>${cl.notes || 'No notes'}</td>
                  <td style="color:var(--accent-cyan)">${cl.next_action || '-'}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    } else if (this.activeTab === "callbacks") {
      const callbacks = this.data.callbacks || [];
      el.innerHTML = `
        <div class="table-card">
          <div class="table-header-toolbar">
            <h4 style="font-size:13.5px;font-weight:700">Scheduled Callbacks</h4>
            ${Auth.isRole("agent") ? '' : '<button class="btn btn-secondary btn-sm" onclick="CustomerProfileView.openScheduleCallbackModal()">+ Schedule Callback</button>'}
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Scheduled Date & Time</th>
                <th>Reason</th>
                <th>Assigned to</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Notes</th>
                <th style="text-align:right">Action</th>
              </tr>
            </thead>
            <tbody>
              ${callbacks.length ? callbacks.map(cb => `
                <tr>
                  <td><strong style="color:${cb.is_overdue ? 'var(--accent-rose)' : 'var(--text-main)'}">${cb.scheduled_formatted}</strong></td>
                  <td>${cb.reason}</td>
                  <td>${cb.agent_name || 'Unassigned'}</td>
                  <td>${cb.priority}</td>
                  <td><span class="badge badge-${cb.status.toLowerCase()}">${cb.status}</span></td>
                  <td>${cb.notes || '-'}</td>
                  <td style="text-align:right">
                    ${cb.status === 'PENDING' ? `
                      <button class="btn btn-success btn-sm" onclick="CustomerProfileView.completeCallback('${cb.id}')">Mark done</button>
                    ` : '<span style="color:var(--text-dim);font-size:12px">Completed</span>'}
                  </td>
                </tr>
              `).join("") : '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-dim)">No callbacks scheduled.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    } else if (this.activeTab === "assignments") {
      const assignments = this.data.assignments || [];
      el.innerHTML = `
        <div class="table-card">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>From Agent</th>
                <th>To Agent / Leader</th>
                <th>Assigned By</th>
                <th>Reason</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${assignments.length ? assignments.map(a => `
                <tr>
                  <td>${new Date(a.created_at).toLocaleString()}</td>
                  <td>${a.from_user_name || 'Unassigned'}</td>
                  <td><strong>${a.to_user_name}</strong></td>
                  <td>${a.assigned_by_name}</td>
                  <td>${a.reason || 'Lead Handover'}</td>
                  <td><span class="badge" style="background:var(--bg-elevated);color:var(--accent-cyan)">${a.status}</span></td>
                </tr>
              `).join("") : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-dim)">No reassignments recorded yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    } else if (this.activeTab === "closing") {
      const closing = this.customer.closing_details;
      if (!closing) {
        el.innerHTML = `
          <div class="table-card" style="padding:40px;text-align:center">
            <div style="font-size:36px;margin-bottom:12px"></div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:6px">No Merchant Agreement Onboarded Yet</h3>
            <p style="color:var(--text-muted);font-size:13px;max-width:420px;margin:0 auto 16px">Capture UK business, personal, and bank settlement details to close the card machine deal.</p>
          </div>
        `;
        return;
      }

      el.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px">
          <!-- Business & Agreement Details -->
          <div class="table-card" style="padding:18px">
            <div style="font-weight:700;font-size:14px;color:var(--accent-cyan);margin-bottom:14px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px">
               UK Business Entity Details
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
              <div><strong style="color:var(--text-muted)">Business Name:</strong> ${closing.business.business_name}</div>
              <div><strong style="color:var(--text-muted)">Entity Structure:</strong> <span class="badge" style="background:var(--bg-elevated);color:var(--text-main)">${closing.business.entity_type}</span></div>
              <div><strong style="color:var(--text-muted)">Trading Address:</strong> ${closing.business.business_address || 'Not specified'}</div>
              <div><strong style="color:var(--text-muted)">Landline:</strong> ${closing.business.landline || 'None'}</div>
              <div><strong style="color:var(--text-muted)">Trading History:</strong> ${closing.business.trading_years ? closing.business.trading_years + ' Years' : 'N/A'}</div>
            </div>
          </div>

          <!-- Signatory Personal Details -->
          <div class="table-card" style="padding:18px">
            <div style="font-weight:700;font-size:14px;color:var(--accent-indigo);margin-bottom:14px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px">
               Authorized Signatory
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
              <div><strong style="color:var(--text-muted)">Full Legal Name:</strong> ${closing.personal.full_name}</div>
              <div><strong style="color:var(--text-muted)">Mobile:</strong> <span style="font-family:var(--font-mono)">${closing.personal.mobile_number}</span></div>
              <div><strong style="color:var(--text-muted)">Date of Birth:</strong> ${closing.personal.dob || 'Not provided'}</div>
              <div><strong style="color:var(--text-muted)">Email:</strong> ${closing.personal.email || 'None'}</div>
              <div><strong style="color:var(--text-muted)">Closed By:</strong> ${closing.closed_by_name || 'Agent'} (${new Date(closing.closed_at).toLocaleDateString()})</div>
            </div>
          </div>

          <!-- Settlement Banking Details -->
          <div class="table-card" style="padding:18px">
            <div style="font-weight:700;font-size:14px;color:var(--accent-emerald);margin-bottom:14px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px">
               Settlement Bank Account (UK BACS)
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
              <div><strong style="color:var(--text-muted)">Bank Institution:</strong> ${closing.bank.bank_name}</div>
              <div><strong style="color:var(--text-muted)">Account Title:</strong> ${closing.bank.account_title}</div>
              <div><strong style="color:var(--text-muted)">Sort Code:</strong> <span style="font-family:var(--font-mono);color:var(--accent-cyan);font-weight:700;font-size:15px">${closing.bank.sort_code}</span></div>
              <div><strong style="color:var(--text-muted)">Account Number:</strong> <span style="font-family:var(--font-mono);font-size:15px">${closing.bank.account_number_masked || closing.bank.account_number}</span></div>
            </div>
          </div>

          <!-- Card Machine Plan Agreed -->
          <div class="table-card" style="padding:18px;background:linear-gradient(135deg,rgba(99,102,241,0.1),rgba(16,185,129,0.08))">
            <div style="font-weight:700;font-size:14px;color:var(--accent-amber);margin-bottom:14px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px">
               Card Machine Plan Agreed
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
              <div><strong style="color:var(--text-muted)">Provider & Plan:</strong> <strong style="font-size:15px;color:var(--text-main)">${closing.plan.provider_plan}</strong></div>
              <div><strong style="color:var(--text-muted)">Monthly Turnover:</strong> £${(closing.plan.monthly_turnover || 0).toLocaleString()}</div>
              <div><strong style="color:var(--text-muted)">Agreed Rates:</strong> ${closing.plan.debit_rate}% Debit / ${closing.plan.credit_rate}% Credit</div>
              <div><strong style="color:var(--text-muted)">Terminal Rental:</strong> £${(closing.plan.terminal_rental || 0).toFixed(2)} / month</div>
              <div><strong style="color:var(--text-muted)">Special Instructions:</strong> <em>${closing.plan.notes || 'None'}</em></div>
            </div>
          </div>
        </div>
      `;
    }
  },

  async completeCallback(callbackId) {
    try {
      await API.post(`/callbacks/${callbackId}/complete`, { notes: "Completed via profile view" });
      showToast("Callback Completed", "Marked callback as done", "success");
      await this.loadProfile(this.customer.id);
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  openScheduleCallbackModal() {
    openModal({
      title: "Schedule Customer Callback",
      content: `
        <div class="form-group">
          <label class="form-label">Date & Time</label>
          <input type="datetime-local" id="prof-cb-dt" class="form-control" />
        </div>
        <div class="form-group">
          <label class="form-label">Reason</label>
          <input type="text" id="prof-cb-reason" class="form-control" placeholder="Discuss contract rates" />
        </div>
        <div class="form-group">
          <label class="form-label">Priority</label>
          <select id="prof-cb-priority" class="form-control">
            <option value="MEDIUM">Medium</option>
            <option value="HIGH" selected>High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
        ${Auth.isRole("agent") ? `
          <div class="form-group">
            <label class="form-label">Assign callback to</label>
            <select id="prof-cb-assignee" class="form-control">
              <option value="self">Keep in my callback list</option>
              <option value="admin">Assign to Admin</option>
            </select>
            <span class="text-muted-small">Callbacks you create stay visible in your list.</span>
          </div>
        ` : ''}
      `,
      footer: `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="CustomerProfileView.submitScheduleCallback()">Schedule</button>
      `
    });
  },

  async submitScheduleCallback() {
    const dt = document.getElementById("prof-cb-dt").value;
    const reason = document.getElementById("prof-cb-reason").value.trim();
    const priority = document.getElementById("prof-cb-priority").value;

    if (!dt || !reason) {
      showToast("Incomplete", "Date and reason required", "error");
      return;
    }

    try {
      const payload = { customer_id: this.customer.id, scheduled_at: dt, reason, priority, assign_to_admin: Auth.isRole("agent") && document.getElementById("prof-cb-assignee")?.value === "admin" };
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        await API.post("/callbacks", payload);
      } else {
        await SyncEngine.enqueueMutation("CREATE", "CALLBACK", null, payload);
      }
      closeModal();
      showToast("Scheduled", payload.assign_to_admin ? "Assigned to Admin. It remains visible in your callback list too." : "Saved in your callback list.", "success");
      await this.loadProfile(this.customer.id);
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  openEditModal() {
    const c = this.customer;
    openModal({
      title: "Edit Customer Information",
      content: `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input type="text" id="edit-c-name" class="form-control" value="${c.full_name}" />
          </div>
          <div class="form-group">
            <label class="form-label">Company Name</label>
            <input type="text" id="edit-c-company" class="form-control" value="${c.company_name || ''}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input type="text" id="edit-c-phone" class="form-control" value="${c.phone}" />
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="edit-c-email" class="form-control" value="${c.email || ''}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select id="edit-c-status" class="form-control">
              ${["NEW","CONTACTED","INTERESTED","FOLLOW_UP","QUALIFIED","CONVERTED","LOST","NOT_INTERESTED"].map(st => `
                <option value="${st}" ${c.lead_status === st ? 'selected' : ''}>${st}</option>
              `).join("")}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Provider</label>
            <input type="text" id="edit-c-provider" class="form-control" value="${c.previous_provider || ''}" />
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="CustomerProfileView.submitEdit()">Save Changes</button>
      `
    });
  },

  async submitEdit() {
    const payload = {
      full_name: document.getElementById("edit-c-name").value.trim(),
      company_name: document.getElementById("edit-c-company").value.trim(),
      phone: document.getElementById("edit-c-phone").value.trim(),
      email: document.getElementById("edit-c-email").value.trim(),
      lead_status: document.getElementById("edit-c-status").value,
      previous_provider: document.getElementById("edit-c-provider").value.trim()
    };

    try {
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        await API.put(`/customers/${this.customer.id}`, payload);
      } else {
        await SyncEngine.enqueueMutation("UPDATE", "CUSTOMER", this.customer.id, payload);
      }
      closeModal();
      showToast("Updated", "Customer profile updated", "success");
      await this.loadProfile(this.customer.id);
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  }
};

window.CustomerProfileView = CustomerProfileView;
