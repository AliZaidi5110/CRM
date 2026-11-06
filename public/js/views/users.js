// User Management & RBAC Administration View Controller (Section 6 & 30)
const UsersView = {
  pageSize: 10,
  currentPage: 1,
  filteredUsers: [],
  async render(container) {
    container.innerHTML = `
      <div class="users-management-page">
      <div class="dashboard-header">
        <div>
          <h2 style="font-size:22px;font-weight:800;letter-spacing:-0.02em">User & Access Management</h2>
          <p style="color:var(--text-muted);font-size:13.5px">Manage agent credentials, role permissions, team assignments, and account status.</p>
        </div>
        <button class="btn btn-primary" onclick="UsersView.openCreateUserModal()">+ Create New User</button>
      </div>

      <div class="table-card users-table-card">
        <div class="table-header-toolbar">
          <input type="text" id="users-search-input" class="form-control" style="width:280px;font-size:13px;padding:7px 12px" placeholder="Search user by name, username..." oninput="UsersView.filterUsers()" />
          <span id="users-count-summary" class="text-muted-small"></span>
        </div>

        <div class="table-responsive users-table-scroll" aria-label="User list">
          <table class="data-table users-directory-table">
            <thead>
              <tr>
                <th>User / Name</th>
                <th>Role</th>
                <th>Primary Team</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Created</th>
                <th style="text-align:right">Actions</th>
              </tr>
            </thead>
            <tbody id="users-table-body">
              <tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-dim)">Loading users...</td></tr>
            </tbody>
          </table>
        </div>
        <div class="users-pagination" aria-label="User list pages">
          <span id="users-page-summary" class="text-muted-small"></span>
          <div id="users-page-controls"></div>
        </div>
      </div>
      </div>
    `;

    await this.loadUsers();
  },

  async loadUsers() {
    const tbody = document.getElementById("users-table-body");
    if (!tbody) return;

    try {
      const res = await API.get("/users");
      this.allUsers = res.users || [];
      this.currentPage = 1;
      this.renderUserRows(this.allUsers);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="color:var(--accent-rose);text-align:center;padding:24px">${err.message}</td></tr>`;
    }
  },

  filterUsers() {
    const q = document.getElementById("users-search-input").value.toLowerCase().trim();
    this.currentPage = 1;
    const filtered = (this.allUsers || []).filter(u =>
      u.full_name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
    this.renderUserRows(filtered);
  },

  renderUserRows(users) {
    const tbody = document.getElementById("users-table-body");
    if (!tbody) return;
    this.filteredUsers = users;
    const pageCount = Math.max(1, Math.ceil(users.length / this.pageSize));
    this.currentPage = Math.min(this.currentPage, pageCount);
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pageUsers = users.slice(startIndex, startIndex + this.pageSize);
    const countSummary = document.getElementById("users-count-summary");
    const pageSummary = document.getElementById("users-page-summary");
    const pageControls = document.getElementById("users-page-controls");
    if (countSummary) countSummary.textContent = `Showing ${pageUsers.length} of ${users.length} users`;
    if (pageSummary) pageSummary.textContent = users.length ? `Page ${this.currentPage} of ${pageCount}` : "Page 1 of 1";
    if (pageControls) pageControls.innerHTML = this.paginationMarkup(pageCount);

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-dim)">No users found matching query.</td></tr>`;
      return;
    }

    tbody.innerHTML = pageUsers.map(u => `
      <tr>
        <td data-label="User / Name">
          <div style="font-weight:700;color:var(--text-main)">${u.role === 'agent' && u.is_active ? `<button class="employee-name-link" onclick="EmployeeFinanceView.openActivity('${u.id}')" title="View this agent's leads and callbacks">${this.escape(u.full_name)}</button>` : this.escape(u.full_name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">@${this.escape(u.username)} • ${this.escape(u.email)}</div>
        </td>
        <td data-label="Role">
          <span class="badge" style="background:var(--primary-light);color:var(--primary)">${u.role_display || u.role}</span>
        </td>
        <td data-label="Primary Team">
          <span style="font-weight:600;font-size:13px">${u.team_name || '<span style="color:var(--text-dim)">No Team</span>'}</span>
        </td>
        <td data-label="Status">
          <span class="badge ${u.is_active ? 'badge-converted' : 'badge-lost'}">${u.is_active ? 'Active' : 'Suspended'}</span>
        </td>
        <td data-label="Last Login" style="font-size:12px;color:var(--text-muted)">
          ${u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
        </td>
        <td data-label="Created" style="font-size:12px;color:var(--text-muted)">
          ${u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}
        </td>
        <td data-label="Actions" class="users-actions-cell" style="text-align:right">
          <div style="display:inline-flex;gap:6px">
            <button class="btn btn-secondary btn-sm" onclick="UsersView.openResetPasswordModal('${u.id}', '${u.username}')" title="Reset Password">Reset password</button>
            <button class="btn btn-secondary btn-sm" onclick="UsersView.toggleStatus('${u.id}')" title="Toggle Active/Suspended">
              ${u.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  },

  paginationMarkup(pageCount) {
    if (pageCount <= 1) return "";
    const first = Math.max(1, Math.min(this.currentPage - 2, pageCount - 4));
    const last = Math.min(pageCount, first + 4);
    let pages = "";
    if (first > 1) pages += `<button class="btn btn-secondary btn-sm" onclick="UsersView.goToPage(1)">1</button><span>…</span>`;
    for (let page = first; page <= last; page++) pages += `<button class="btn btn-secondary btn-sm ${page === this.currentPage ? 'active' : ''}" aria-current="${page === this.currentPage ? 'page' : 'false'}" onclick="UsersView.goToPage(${page})">${page}</button>`;
    if (last < pageCount) pages += `<span>…</span><button class="btn btn-secondary btn-sm" onclick="UsersView.goToPage(${pageCount})">${pageCount}</button>`;
    return `<button class="btn btn-secondary btn-sm" ${this.currentPage === 1 ? 'disabled' : ''} onclick="UsersView.goToPage(${this.currentPage - 1})">Previous</button>${pages}<button class="btn btn-secondary btn-sm" ${this.currentPage === pageCount ? 'disabled' : ''} onclick="UsersView.goToPage(${this.currentPage + 1})">Next</button>`;
  },

  goToPage(page) {
    const count = Math.max(1, Math.ceil((this.filteredUsers || []).length / this.pageSize));
    this.currentPage = Math.max(1, Math.min(page, count));
    this.renderUserRows(this.filteredUsers || []);
  },

  escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  },

  async toggleStatus(userId) {
    try {
      const res = await API.post(`/users/${userId}/toggle-status`);
      showToast("Status Changed", res.message, "success");
      await this.loadUsers();
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  openResetPasswordModal(userId, username) {
    openModal({
      title: `Reset Password for @${username}`,
      content: `
        <div class="form-group">
          <label class="form-label">New Password</label>
          <div class="password-control">
            <input type="password" id="reset-new-pw" class="form-control" placeholder="Minimum 6 characters" />
            <button type="button" class="password-toggle" aria-label="Show password" title="Show password" onclick="App.togglePasswordVisibility('reset-new-pw', this)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="UsersView.submitResetPassword('${userId}')">Update Password</button>
      `
    });
  },

  async submitResetPassword(userId) {
    const pw = document.getElementById("reset-new-pw").value;
    if (!pw || pw.length < 6) {
      showToast("Weak Password", "Password must be at least 6 characters", "warning");
      return;
    }

    try {
      await API.post(`/users/${userId}/reset-password`, { new_password: pw });
      closeModal();
      showToast("Password Reset", "User credentials updated", "success");
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  async openCreateUserModal() {
    try {
      const teamRes = await API.get("/teams");
      const teams = teamRes.teams || [];

      openModal({
        title: "Create User Account",
        width: "620px",
        content: `
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Full Name *</label>
              <input type="text" id="nu-fullname" class="form-control" placeholder="e.g. John Doe" />
            </div>
            <div class="form-group">
              <label class="form-label">Username *</label>
              <input type="text" id="nu-username" class="form-control" placeholder="e.g. jdoe01" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Email Address *</label>
              <input type="email" id="nu-email" class="form-control" placeholder="john@callpro.com" />
            </div>
            <div class="form-group">
              <label class="form-label">Initial Password *</label>
              <div class="password-control">
                <input type="password" id="nu-password" class="form-control" placeholder="Minimum 6 characters" />
                <button type="button" class="password-toggle" aria-label="Show password" title="Show password" onclick="App.togglePasswordVisibility('nu-password', this)">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Role</label>
              <select id="nu-role" class="form-control">
                <option value="agent" selected>Call Center Agent</option>
                <option value="team_leader">Team Leader</option>
                <option value="super_admin">Super Administrator</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Assign Team</label>
              <select id="nu-team" class="form-control">
                <option value="">No Primary Team</option>
                ${teams.map(t => `<option value="${t.id}">${t.name}</option>`).join("")}
              </select>
            </div>
          </div>
        `,
        footer: `
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="UsersView.submitCreateUser()">Create User</button>
        `
      });
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  async submitCreateUser() {
    const fullName = document.getElementById("nu-fullname").value.trim();
    const username = document.getElementById("nu-username").value.trim();
    const email = document.getElementById("nu-email").value.trim();
    const password = document.getElementById("nu-password").value;
    const role = document.getElementById("nu-role").value;
    const teamId = document.getElementById("nu-team").value;

    if (!fullName || !username || !email || !password) {
      showToast("Incomplete", "All required fields must be filled", "error");
      return;
    }

    try {
      await API.post("/users", {
        full_name: fullName,
        username,
        email,
        password,
        role,
        team_id: teamId || null
      });
      closeModal();
      showToast("User Created", `Created account for ${username}`, "success");
      await this.loadUsers();
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  }
};

window.UsersView = UsersView;
