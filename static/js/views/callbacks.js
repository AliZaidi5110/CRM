// Callbacks Management View Controller (Section 13)
const CallbacksView = {
  activeTab: "today",

  async render(container) {
    if (Auth.isRole("agent")) {
      App.navigate("leads");
      return;
    }
    const isAgent = Auth.isRole("agent");
    container.innerHTML = `
      <div class="dashboard-header">
        <div>
          <h2 style="font-size:22px;font-weight:800;letter-spacing:-0.02em">Callback Management</h2>
          <p style="color:var(--text-muted);font-size:13.5px">Manage customer follow-ups${isAgent ? '. Keep a callback in your list or assign it to Admin.' : '.'}</p>
        </div>
        ${isAgent ? '<button class="btn btn-primary" onclick="CallbacksView.openCreateModal()">Schedule callback</button>' : ''}
      </div>

      <!-- Overdue Callbacks Alert Banner -->
      <div id="callbacks-overdue-alert" class="alert-banner danger hidden" style="margin-bottom:16px"></div>

      <!-- Tab Buttons with Counts -->
      <div style="display:flex;gap:8px;border-bottom:1px solid var(--border-subtle);margin-bottom:20px">
        <button id="cb-tab-btn-today" class="btn btn-secondary btn-sm active" onclick="CallbacksView.setTab('today')">
           Today's Callbacks (<span id="cb-count-today">0</span>)
        </button>
        <button id="cb-tab-btn-overdue" class="btn btn-secondary btn-sm" onclick="CallbacksView.setTab('overdue')">
          ️ Overdue (<span id="cb-count-overdue">0</span>)
        </button>
        <button id="cb-tab-btn-upcoming" class="btn btn-secondary btn-sm" onclick="CallbacksView.setTab('upcoming')">
           Upcoming (<span id="cb-count-upcoming">0</span>)
        </button>
        <button id="cb-tab-btn-completed" class="btn btn-secondary btn-sm" onclick="CallbacksView.setTab('completed')">
          Completed (<span id="cb-count-completed">0</span>)
        </button>
      </div>

      <div class="table-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Scheduled Time</th>
                <th>Customer / Company</th>
                <th>Phone</th>
                <th>Created by</th>
                <th>Assigned to</th>
                <th>Team</th>
                <th>Reason</th>
                <th>Priority</th>
                <th style="text-align:right">Action</th>
              </tr>
            </thead>
            <tbody id="callbacks-table-body">
              <tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-dim)">Loading callbacks...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    await this.loadCallbacks();
  },

  setTab(tab) {
    this.activeTab = tab;
    ["today", "overdue", "upcoming", "completed"].forEach(t => {
      const btn = document.getElementById(`cb-tab-btn-${t}`);
      if (btn) btn.classList.toggle("active", t === tab);
    });
    this.renderCurrentList();
  },

  async loadCallbacks() {
    try {
      let data = null;
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        data = await API.get("/callbacks");
      } else {
        const allCb = await CRMDB.getAll("callbacks");
        const allCust = await CRMDB.getAll("customers");
        const custMap = Object.fromEntries(allCust.map(c => [c.id, c]));
        const user = Auth.getUser();
        const visibleCallbacks = user?.role === "agent"
          ? allCb.filter(cb => cb.agent_id === user.id || cb.created_by_id === user.id)
          : allCb;
        if (user?.role === "team_leader") {
          const teams = await CRMDB.getMeta("teams");
          const teamIds = new Set([user.team_id, ...(teams || []).filter(team => team.team_leader_id === user.id).map(team => team.id)]);
          visibleCallbacks.splice(0, visibleCallbacks.length, ...allCb.filter(cb => teamIds.has(cb.team_id) || teamIds.has(custMap[cb.customer_id]?.assigned_team_id)));
        }

        const now = new Date();
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        const enriched = visibleCallbacks.map(cb => {
          const cust = custMap[cb.customer_id] || {};
          const sched = new Date(cb.scheduled_at);
          return {
            ...cb,
            customer_name: cust.full_name || "Unknown",
            customer_company: cust.company_name,
            customer_phone: cust.phone,
            scheduled_formatted: sched.toLocaleString(),
            is_overdue: cb.status === "PENDING" && sched < now,
            is_today: sched >= startToday && sched <= endToday
          };
        });

        data = {
          today: enriched.filter(cb => cb.is_today && cb.status === "PENDING"),
          overdue: enriched.filter(cb => cb.is_overdue && cb.status === "PENDING"),
          upcoming: enriched.filter(cb => !cb.is_today && !cb.is_overdue && cb.status === "PENDING"),
          completed: enriched.filter(cb => cb.status === "COMPLETED"),
          counts: {
            today: enriched.filter(cb => cb.is_today && cb.status === "PENDING").length,
            overdue: enriched.filter(cb => cb.is_overdue && cb.status === "PENDING").length,
            upcoming: enriched.filter(cb => !cb.is_today && !cb.is_overdue && cb.status === "PENDING").length,
            completed: enriched.filter(cb => cb.status === "COMPLETED").length
          }
        };
      }

      this.data = data;
      this.updateCounts();
      this.renderCurrentList();
    } catch (err) {
      document.getElementById("callbacks-table-body").innerHTML = `<tr><td colspan="9" style="color:var(--accent-rose);text-align:center;padding:24px">${err.message}</td></tr>`;
    }
  },

  updateCounts() {
    const c = this.data.counts || {};
    document.getElementById("cb-count-today").innerText = c.today || 0;
    document.getElementById("cb-count-overdue").innerText = c.overdue || 0;
    document.getElementById("cb-count-upcoming").innerText = c.upcoming || 0;
    document.getElementById("cb-count-completed").innerText = c.completed || 0;

    const alertBanner = document.getElementById("callbacks-overdue-alert");
    if (alertBanner) {
      if (c.overdue > 0) {
        alertBanner.innerHTML = `<div><strong> High Priority Alert:</strong> You have <strong>${c.overdue}</strong> overdue callback(s) that require immediate contact!</div>`;
        alertBanner.classList.remove("hidden");
      } else {
        alertBanner.classList.add("hidden");
      }
    }
  },

  renderCurrentList() {
    const tbody = document.getElementById("callbacks-table-body");
    if (!tbody || !this.data) return;

    const list = this.data[this.activeTab] || [];
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--text-dim)">No callbacks in this view. Schedule a follow-up from a customer profile or use Schedule callback.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(cb => `
      <tr>
        <td>
          <strong style="color:${cb.is_overdue ? 'var(--accent-rose)' : 'var(--text-main)'}">${cb.scheduled_formatted}</strong>
          ${cb.is_overdue ? '<span style="font-size:10.5px;color:var(--accent-rose);display:block">OVERDUE</span>' : ''}
        </td>
        <td>
          <div style="font-weight:700;color:var(--text-main);cursor:pointer" onclick="App.openCustomer('${cb.customer_id}')">${cb.customer_name}</div>
          <div style="font-size:12px;color:var(--text-muted)">${cb.customer_company || 'Private'}</div>
        </td>
        <td style="font-family:var(--font-mono);color:var(--accent-cyan)">${cb.customer_phone || '-'}</td>
        <td style="font-size:12.5px">${cb.created_by_name || cb.agent_name || 'Unknown'}</td>
        <td style="font-size:12.5px">${cb.agent_name || 'Unassigned'}</td>
        <td><span class="team-chip">${cb.team_name || 'No team assigned'}</span></td>
        <td>${cb.reason}</td>
        <td>
          <span style="font-size:11.5px;font-weight:700;color:${cb.priority === 'HIGH' || cb.priority === 'URGENT' ? 'var(--accent-rose)' : 'var(--text-muted)'}">
            ${cb.priority}
          </span>
        </td>
        <td style="text-align:right">
          <div style="display:inline-flex;gap:6px">
            ${cb.status === 'PENDING' ? `
              <button class="btn btn-success btn-sm" onclick="CallbacksView.markDone('${cb.id}')">Done</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join("");
  },

  async markDone(cbId) {
    try {
      await API.post(`/callbacks/${cbId}/complete`, { notes: "Completed via callbacks manager" });
      showToast("Completed", "Callback marked as completed", "success");
      await this.loadCallbacks();
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  async openCreateModal() {
    try {
      const response = await API.get("/customers", { per_page: 100 });
      const customers = response.items || [];
      if (!customers.length) {
        showToast("No customers available", "Create a customer first, then schedule a callback.", "warning");
        return;
      }
      const localNow = new Date();
      localNow.setMinutes(localNow.getMinutes() - localNow.getTimezoneOffset());
      const initialDate = localNow.toISOString().slice(0, 16);
      openModal({
        title: "Schedule customer callback",
        content: `<form id="callback-create-form" class="admin-form" onsubmit="CallbacksView.submitCreate(event)">
          <div class="form-group"><label class="form-label">Customer</label><select id="new-callback-customer" class="form-control" required><option value="">Choose a customer...</option>${customers.map(c => `<option value="${c.id}">${this.escape(c.full_name)}${c.company_name ? ` — ${this.escape(c.company_name)}` : ''} · ${this.escape(c.phone)}</option>`).join("")}</select></div>
          <div class="form-row"><div class="form-group"><label class="form-label">Date & time</label><input id="new-callback-time" type="datetime-local" class="form-control" value="${initialDate}" required></div><div class="form-group"><label class="form-label">Priority</label><select id="new-callback-priority" class="form-control"><option value="MEDIUM">Medium</option><option value="HIGH" selected>High</option><option value="URGENT">Urgent</option><option value="LOW">Low</option></select></div></div>
          <div class="form-group"><label class="form-label">Reason for callback</label><input id="new-callback-reason" class="form-control" maxlength="255" placeholder="What should be followed up?" required></div>
          <div class="form-group"><label class="form-label">Assign callback to</label><select id="new-callback-assignee" class="form-control"><option value="self">Keep in my callback list</option><option value="admin">Assign to Admin</option></select><span class="text-muted-small">You will still be able to see callbacks you created.</span></div>
        </form>`,
        footer: '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" form="callback-create-form" type="submit">Create callback</button>'
      });
    } catch (err) {
      showToast("Unable to load customers", err.message, "error");
    }
  },

  async submitCreate(event) {
    event.preventDefault();
    const payload = {
      customer_id: document.getElementById("new-callback-customer").value,
      scheduled_at: document.getElementById("new-callback-time").value,
      reason: document.getElementById("new-callback-reason").value.trim(),
      priority: document.getElementById("new-callback-priority").value,
      assign_to_admin: document.getElementById("new-callback-assignee").value === "admin"
    };
    try {
      await API.post("/callbacks", payload);
      closeModal();
      showToast("Callback scheduled", payload.assign_to_admin ? "Assigned to Admin. It remains visible in your callback list too." : "Saved in your callback list.", "success");
      await this.loadCallbacks();
    } catch (err) {
      showToast("Unable to schedule callback", err.message, "error");
    }
  },

  escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }
};

window.CallbacksView = CallbacksView;
