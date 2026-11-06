// Team Management View Controller (Section 5 & 31)
const TeamsView = {
  async render(container) {
    container.innerHTML = `
      <div class="dashboard-header">
        <div>
          <h2 style="font-size:22px;font-weight:800;letter-spacing:-0.02em">Team Management</h2>
          <p style="color:var(--text-muted);font-size:13.5px">Configure dynamic teams, assign team leaders, and manage agent rosters.</p>
        </div>
        <button class="btn btn-primary" onclick="TeamsView.openCreateTeamModal()">+ Create New Team</button>
      </div>

      <div id="teams-grid-container" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:20px">
        <div style="padding:40px;text-align:center;color:var(--text-muted)">Loading teams...</div>
      </div>
    `;

    await this.loadTeams();
  },

  async loadTeams() {
    const el = document.getElementById("teams-grid-container");
    if (!el) return;

    try {
      const res = await API.get("/teams");
      const teams = res.teams || [];

      if (teams.length === 0) {
        el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-dim)">No teams configured. Click "+ Create New Team" to get started.</div>`;
        return;
      }

      el.innerHTML = teams.map(t => `
        <div class="table-card">
          <div class="table-header-toolbar">
            <div>
              <h3 style="font-size:16px;font-weight:700;color:var(--text-main)">${t.name}</h3>
              <p style="font-size:12px;color:var(--text-muted)">${t.description || 'No description'}</p>
            </div>
            <span class="badge ${t.is_active ? 'badge-converted' : 'badge-lost'}">${t.is_active ? 'Active' : 'Inactive'}</span>
          </div>

          <div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);background:rgba(0,0,0,0.1)">
            <span class="lead-meta-label">Team Leader</span>
            <div style="font-size:14px;font-weight:700;color:var(--accent-cyan);margin-top:2px">
               ${t.team_leader_name || 'No Team Leader Assigned'}
            </div>
          </div>

          <div style="padding:16px 20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <span class="lead-meta-label">Assigned Agents (${t.members ? t.members.length : 0})</span>
              <button class="btn btn-secondary btn-sm" onclick="TeamsView.openAddMemberModal('${t.id}')">+ Add Agent</button>
            </div>

            <div style="display:flex;flex-direction:column;gap:8px">
              ${(t.members || []).map(m => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-main);border-radius:var(--radius-md);font-size:13px">
                  <div>
                    <strong>${m.user_name}</strong>
                    <span style="font-size:11px;color:var(--text-dim);margin-left:6px">@${m.username}</span>
                  </div>
                  <button class="btn btn-secondary btn-sm" style="color:var(--accent-rose)" onclick="TeamsView.removeMember('${t.id}', '${m.user_id}')" title="Remove agent">Remove</button>
                </div>
              `).join("") || '<div style="font-size:12px;color:var(--text-dim);padding:10px 0">No agents assigned yet.</div>'}
            </div>
          </div>

          <div style="padding:12px 20px;border-top:1px solid var(--border-subtle);display:flex;justify-content:flex-end;gap:8px;background:rgba(0,0,0,0.15)">
            <button class="btn btn-secondary btn-sm" onclick="TeamsView.openEditTeamModal('${t.id}', '${encodeURIComponent(t.name)}', '${t.team_leader_id || ''}')">Edit Team</button>
          </div>
        </div>
      `).join("");
    } catch (err) {
      el.innerHTML = `<div style="color:var(--accent-rose);padding:30px">${err.message}</div>`;
    }
  },

  async openCreateTeamModal() {
    try {
      const leadersRes = await API.get("/users", { role: "team_leader" });
      const leaders = leadersRes.users || [];

      openModal({
        title: "Create Dynamic Team",
        content: `
          <div class="form-group">
            <label class="form-label">Team Name *</label>
            <input type="text" id="new-team-name" class="form-control" placeholder="e.g. Team C - Enterprise" />
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <input type="text" id="new-team-desc" class="form-control" placeholder="Specialist high-turnover card machine campaigns" />
          </div>
          <div class="form-group">
            <label class="form-label">Assign Team Leader</label>
            <select id="new-team-leader" class="form-control">
              <option value="">Choose a Team Leader...</option>
              ${leaders.map(l => `<option value="${l.id}">${l.full_name} (@${l.username})</option>`).join("")}
            </select>
          </div>
        `,
        footer: `
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="TeamsView.submitCreateTeam()">Create Team</button>
        `
      });
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  async submitCreateTeam() {
    const name = document.getElementById("new-team-name").value.trim();
    const desc = document.getElementById("new-team-desc").value.trim();
    const leaderId = document.getElementById("new-team-leader").value;

    if (!name) {
      showToast("Missing Name", "Team name is required", "error");
      return;
    }

    try {
      await API.post("/teams", { name, description: desc, team_leader_id: leaderId || null });
      closeModal();
      showToast("Team Created", `Team '${name}' successfully configured`, "success");
      await this.loadTeams();
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  async openAddMemberModal(teamId) {
    try {
      const usersRes = await API.get("/users", { role: "agent" });
      const agents = usersRes.users || [];

      openModal({
        title: "Add Agent to Team",
        content: `
          <div class="form-group">
            <label class="form-label">Select Agent</label>
            <select id="add-agent-user-id" class="form-control">
              ${agents.map(a => `<option value="${a.id}">${a.full_name} (@${a.username}) - Current: ${a.team_name || 'No team'}</option>`).join("")}
            </select>
          </div>
        `,
        footer: `
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="TeamsView.submitAddMember('${teamId}')">Add to Team</button>
        `
      });
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  async submitAddMember(teamId) {
    const userId = document.getElementById("add-agent-user-id").value;
    try {
      await API.post(`/teams/${teamId}/members`, { user_id: userId });
      closeModal();
      showToast("Agent Added", "Member added to team roster", "success");
      await this.loadTeams();
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  async removeMember(teamId, userId) {
    if (!confirm("Are you sure you want to remove this agent from the team?")) return;
    try {
      await API.delete(`/teams/${teamId}/members/${userId}`);
      showToast("Removed", "Member removed from team", "info");
      await this.loadTeams();
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  openEditTeamModal(teamId, encodedName, leaderId) {
    const name = decodeURIComponent(encodedName);
    openModal({
      title: `Edit Team: ${name}`,
      content: `
        <div class="form-group">
          <label class="form-label">Team Name</label>
          <input type="text" id="edit-team-name" class="form-control" value="${name}" />
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="TeamsView.submitEditTeam('${teamId}')">Save Changes</button>
      `
    });
  },

  async submitEditTeam(teamId) {
    const name = document.getElementById("edit-team-name").value.trim();
    if (!name) return;
    try {
      await API.put(`/teams/${teamId}`, { name });
      closeModal();
      showToast("Team Updated", "Saved changes", "success");
      await this.loadTeams();
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  }
};

window.TeamsView = TeamsView;
