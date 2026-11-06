// Leads & Customers Directory View Controller
const LeadsView = {
  currentPage: 1,
  currentFilters: {},
  searchTimer: null,
  fetchSequence: 0,

  async render(container) {
    container.innerHTML = `
      <div class="dashboard-header leads-page-header">
        <div>
          <h2 style="font-size:22px;font-weight:800;letter-spacing:-0.02em">Customers</h2>
          <p style="color:var(--text-muted);font-size:13.5px">Customer details and Team Lead follow-up.</p>
          <p id="leads-count-summary" class="leads-count-summary">Loading leads…</p>
        </div>
        <div style="display:flex;gap:12px">
          <button class="btn btn-secondary" onclick="App.navigate('import_export')">Import customers</button>
          <button class="btn btn-primary" onclick="LeadsView.openCreateLeadModal()">+ New Lead</button>
        </div>
      </div>

      <div class="table-card">
        <!-- Filter Toolbar -->
        <div class="table-header-toolbar leads-filter-toolbar">
          <input type="search" id="leads-filter-search" class="form-control" placeholder="Search customer, phone, or company" />
          <button class="btn btn-secondary btn-sm" onclick="LeadsView.applyFilters()">Search</button>
        </div>

        <!-- Table Container -->
        <div class="leads-table-container">
          <table class="data-table leads-directory-table">
            <thead>
              <tr>
                <th>Customer / Company</th>
                <th>Phone</th>
                <th>Team & Agent Actions</th>
              </tr>
            </thead>
            <tbody id="leads-table-body">
              <tr><td colspan="3" style="text-align:center;padding:30px;color:var(--text-dim)">Loading customers...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Footer -->
        <div style="padding:14px 20px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:12.5px;color:var(--text-muted)">Browse customers</div>
          <div style="display:flex;gap:8px">
            <button id="leads-prev-btn" class="btn btn-secondary btn-sm" onclick="LeadsView.changePage(-1)">Previous</button>
            <button id="leads-next-btn" class="btn btn-secondary btn-sm" onclick="LeadsView.changePage(1)">Next</button>
          </div>
        </div>
      </div>
    `;

    const searchInput = document.getElementById("leads-filter-search");
    searchInput.value = this.currentFilters.search || "";
    searchInput.addEventListener("input", () => {
      clearTimeout(this.searchTimer);
      if (!searchInput.value.trim()) {
        this.applyFilters();
        return;
      }
      this.searchTimer = setTimeout(() => this.applyFilters(), 250);
    });
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.applyFilters();
    });

    await this.fetchLeads();
  },

  applyFilters() {
    this.currentFilters = {
      search: document.getElementById("leads-filter-search").value.trim(),
      lead_status: "",
      priority: ""
    };
    this.currentPage = 1;
    this.fetchLeads();
  },

  changePage(delta) {
    this.currentPage = Math.max(1, this.currentPage + delta);
    this.fetchLeads();
  },

  async openAssignForCustomer(customerId) {
    try {
      const customer = SyncEngine.isOnline && !SyncEngine.isSimulatedOffline
        ? (await API.get("/customers/" + customerId)).customer
        : await CRMDB.get("customers", customerId);
      if (!customer || !await Auth.canAccessCustomer(customer)) {
        throw new Error("You do not have access to this lead.");
      }
      this.assignmentCustomerId = customerId;
      openModal({
        title: "Share lead with Team Lead",
        content:
          '<div class="assignment-help-note"><strong>Your Team Lead is selected automatically.</strong>' +
          '<span>The lead and its pending callbacks will appear in the Team Lead team queue.</span></div>' +
          '<div class="form-group"><label class="form-label">Customer</label>' +
          '<input id="asgn-leader-customer" class="form-control" disabled /></div>' +
          '<div class="form-group"><label class="form-label">Reason for follow-up</label>' +
          '<input id="asgn-leader-reason" class="form-control" value="Needs Team Lead follow-up" /></div>' +
          '<div class="form-group"><label class="form-label">Priority</label>' +
          '<select id="asgn-leader-priority" class="form-control"><option value="HIGH">High</option>' +
          '<option value="URGENT">Urgent</option><option value="MEDIUM">Medium</option></select></div>' +
          '<div class="form-group"><label class="form-label">Notes for Team Lead</label>' +
          '<textarea id="asgn-leader-notes" class="form-control" placeholder="What should the Team Lead know?"></textarea></div>',
        footer: '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>' +
          '<button class="btn btn-primary" onclick="LeadsView.submitAssignToLeader()">Share with Team Lead</button>'
      });
      document.getElementById("asgn-leader-customer").value =
        customer.full_name + " (" + (customer.company_name || "No Company") + ")";
    } catch (err) {
      showToast("Unable to open lead", err.message, "error");
    }
  },

  async submitAssignToLeader() {
    const payload = {
      customer_id: this.assignmentCustomerId,
      reason: document.getElementById("asgn-leader-reason").value.trim(),
      priority: document.getElementById("asgn-leader-priority").value,
      notes: document.getElementById("asgn-leader-notes").value.trim()
    };
    try {
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        await API.post("/assignments/assign-to-leader", payload);
      } else {
        await SyncEngine.enqueueMutation("CREATE", "ASSIGNMENT", null, payload);
      }
      closeModal();
      showToast("Shared with Team Lead", "The lead and pending callbacks are now in the team queue.", "success");
      await this.fetchLeads();
    } catch (err) {
      showToast("Assignment Error", err.message, "error");
    }
  },

  async fetchLeads() {
    const requestSequence = this.fetchSequence = (this.fetchSequence || 0) + 1;
    const tbody = document.getElementById("leads-table-body");
    const countEl = document.getElementById("leads-count-summary");
    if (!tbody) return;

    try {
      let items = [];
      let total = 0;

      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        const params = { page: this.currentPage, per_page: 15, ...this.currentFilters };
        const res = await API.get("/customers", params);
        items = res.items || [];
        total = res.total || 0;
      } else {
        // Query local IndexedDB
        let all = await CRMDB.getAll("customers");
        const user = Auth.getUser();
        if (user?.role === "agent") {
          all = all.filter(c => c.assigned_agent_id === user.id || (!c.assigned_agent_id && c.assigned_team_id === user.team_id));
        } else if (user?.role === "team_leader") {
          const teams = await CRMDB.getMeta("teams");
          const teamIds = new Set([user.team_id, ...(teams || []).filter(team => team.team_leader_id === user.id).map(team => team.id)]);
          all = all.filter(c => teamIds.has(c.assigned_team_id));
        }
        const f = this.currentFilters;
        if (f.search) {
          const q = f.search.toLowerCase();
          all = all.filter(c => (c.full_name && c.full_name.toLowerCase().includes(q)) || (c.company_name && c.company_name.toLowerCase().includes(q)) || (c.phone && c.phone.includes(q)));
        }
        if (f.lead_status) all = all.filter(c => c.lead_status === f.lead_status);
        if (f.priority) all = all.filter(c => c.priority === f.priority);

        total = all.length;
        items = all.slice((this.currentPage - 1) * 15, this.currentPage * 15);
      }

      // Ignore an older request if a newer search or clear action completed first.
      if (requestSequence !== this.fetchSequence || !document.getElementById("leads-table-body")) return;

      const pageCount = Math.max(1, Math.ceil(total / 15));
      countEl.innerText = `Showing ${items.length} of ${total} customers · Page ${this.currentPage} of ${pageCount}`;
      const previous = document.getElementById("leads-prev-btn");
      const next = document.getElementById("leads-next-btn");
      if (previous) previous.disabled = this.currentPage <= 1;
      if (next) next.disabled = this.currentPage >= pageCount;

      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:36px;color:var(--text-dim)">No matching customers found.</td></tr>`;
        return;
      }

      tbody.innerHTML = items.map(c => `
        <tr>
          <td data-label="Customer / Company">
            <div style="font-weight:700;color:var(--text-main);cursor:pointer" onclick="App.openCustomer('${c.id}')">${c.full_name}</div>
            <div style="font-size:12px;color:var(--text-muted)">${c.company_name || 'Individual Merchant'}</div>
          </td>
          <td data-label="Phone" style="font-family:var(--font-mono);font-size:13px;color:var(--accent-cyan)">
            ${c.phone}
          </td>
          <td data-label="Team & Agent Actions">
            <div class="lead-assignment-actions">
              <div><div style="font-size:12.5px">${c.assigned_agent_name || 'Unassigned'}</div>
              <div style="font-size:11px;color:var(--text-dim)">${c.assigned_team_name || 'No Team'}</div></div>
              <div class="lead-row-actions">
              ${Auth.isRole("agent") ? `<button class="btn btn-secondary btn-sm" onclick="LeadsView.openAssignForCustomer('${c.id}')" title="Share this customer with your Team Lead">Share</button>` : ''}
              <button class="btn btn-primary btn-sm" onclick="App.openCustomer('${c.id}')">Profile</button>
              </div>
            </div>
          </td>
        </tr>
      `).join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--accent-rose)">${err.message}</td></tr>`;
    }
  },

  openCreateLeadModal() {
    const user = Auth.getUser();
    const isAgent = Auth.isRole("agent");
    openModal({
      title: "Create New Customer Lead",
      width: "680px",
      content: `
        <div id="duplicate-warning-banner" class="alert-banner warning hidden" style="margin-bottom:16px"></div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">First Name</label>
            <input type="text" id="nl-first-name" class="form-control" placeholder="John" />
          </div>
          <div class="form-group">
            <label class="form-label">Last Name</label>
            <input type="text" id="nl-last-name" class="form-control" placeholder="Smith" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Company / Business Name</label>
            <input type="text" id="nl-company" class="form-control" placeholder="ABC Restaurant" onblur="LeadsView.checkDuplicateInput()" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number *</label>
            <input type="text" id="nl-phone" class="form-control" placeholder="07712345678" onblur="LeadsView.checkDuplicateInput()" required />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input type="email" id="nl-email" class="form-control" placeholder="john@abcrestaurant.com" onblur="LeadsView.checkDuplicateInput()" />
          </div>
          <div class="form-group">
            <label class="form-label">Address</label>
            <input type="text" id="nl-address" class="form-control" placeholder="Street, area, city" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Current Provider</label>
            <input type="text" id="nl-provider" class="form-control" placeholder="e.g. Worldpay, Barclays, Stripe" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Initial Notes & Pain Points</label>
          <textarea id="nl-notes" class="form-control" placeholder="Current card machine rates, monthly fees, contract expiry..."></textarea>
        </div>

        ${isAgent ? `
          <div class="lead-submission-note">
            <strong>Admin will see this lead as soon as you save it.</strong>
            <span>It will also stay in your own customer list.</span>
          </div>
        ` : ''}
      `,
      footer: `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="LeadsView.submitNewLead()">Save Lead</button>
      `
    });
  },

  async checkDuplicateInput() {
    const phone = document.getElementById("nl-phone")?.value.trim();
    const email = document.getElementById("nl-email")?.value.trim();
    const company = document.getElementById("nl-company")?.value.trim();
    const banner = document.getElementById("duplicate-warning-banner");
    if (!banner) return;

    if (!phone && !email && !company) {
      banner.classList.add("hidden");
      return;
    }

    try {
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        const res = await API.post("/customers/check-duplicate", { phone, email, company_name: company });
        if (res.has_duplicates) {
          const match = res.duplicates[0];
          banner.innerHTML = `
            <div>
              <strong>Potential duplicate detected:</strong> Found existing customer <strong>${match.full_name}</strong> (${match.company_name || 'No company'}, ${match.phone}) in <strong>${match.assigned_team_name || 'Team'}</strong>.
            </div>
          `;
          banner.classList.remove("hidden");
          return;
        }
      }
      banner.classList.add("hidden");
    } catch {
      banner.classList.add("hidden");
    }
  },

  async submitNewLead(force = false) {
    const firstName = document.getElementById("nl-first-name").value.trim();
    const lastName = document.getElementById("nl-last-name").value.trim();
    const company = document.getElementById("nl-company").value.trim();
    const phone = document.getElementById("nl-phone").value.trim();
    const email = document.getElementById("nl-email").value.trim();
    const address = document.getElementById("nl-address").value.trim();
    const provider = document.getElementById("nl-provider").value.trim();
    const notes = document.getElementById("nl-notes").value.trim();

    if (!phone) {
      showToast("Missing Phone", "Phone number is required", "error");
      return;
    }

    const fullName = `${firstName} ${lastName}`.trim() || company || "Unnamed Lead";

    const payload = {
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      company_name: company,
      phone,
      email,
      address,
      previous_provider: provider,
      notes,
      lead_status: "NEW",
      force
    };

    try {
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        const res = await API.post("/customers", payload);
        closeModal();
        showToast(Auth.isRole("agent") ? "Lead submitted" : "Lead created", Auth.isRole("agent") ? `${fullName} is now in the Admin customer list and remains in your list.` : `${fullName} was added to the customer list.`, "success");
        await this.fetchLeads();
      } else {
        // Enqueue offline
        await SyncEngine.enqueueMutation("CREATE", "CUSTOMER", null, payload);
        closeModal();
        showToast("Saved locally", `Created ${fullName}. It will sync to Admin and your customer list when you reconnect.`, "success");
        await this.fetchLeads();
      }
    } catch (err) {
      if (err.message.includes("Duplicate")) {
        const banner = document.getElementById("duplicate-warning-banner");
        if (banner) {
          banner.innerHTML = `<div><strong>Duplicate Found:</strong> A customer with this phone or company already exists. <button class="btn btn-danger btn-sm" style="margin-left:8px" onclick="LeadsView.submitNewLead(true)">Create Anyway</button></div>`;
          banner.classList.remove("hidden");
        }
      } else {
        showToast("Error", err.message, "error");
      }
    }
  }
};

window.LeadsView = LeadsView;
