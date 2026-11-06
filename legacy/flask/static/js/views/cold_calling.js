// Dedicated Cold-Calling Workspace View Controller (Section 37)
const ColdCallingView = {
  currentCustomer: null,
  activeCallSession: null,
  timerInterval: null,
  elapsedSeconds: 0,
  selectedDisposition: null,

  async render(container, customerId = null) {
    container.innerHTML = `
      <div id="cold-call-root" class="cold-calling-layout">
        <!-- Left Column: Customer Profile & Queue -->
        <div class="calling-col">
          <div class="calling-col-header">
            <div class="calling-col-title"> Customer Info</div>
            <button class="btn btn-secondary btn-sm" onclick="ColdCallingView.openLeadPicker()" title="Switch Lead">
               Switch
            </button>
          </div>
          <div id="cc-lead-info" class="calling-col-body">
            <div style="text-align:center;padding:30px;color:var(--text-dim)">Loading customer...</div>
          </div>
        </div>

        <!-- Center Column: Call Controls, HUD & Disposition -->
        <div class="calling-col">
          <div class="calling-col-header">
            <div class="calling-col-title"> Call Controls & Outcome</div>
            <div style="display:flex;align-items:center;gap:8px">
              <button class="btn btn-secondary btn-sm" onclick="HelpingHand.openGlobalModal()" style="color:var(--accent-amber);border-color:rgba(245,158,11,0.4);font-weight:700">
                 Helping Hand
              </button>
              <div id="cc-call-status-badge" class="call-status-badge">Idle</div>
            </div>
          </div>
          <div class="calling-col-body">
            <!-- Live Call Timer HUD -->
            <div class="call-hud">
              <div style="font-size:12px;text-transform:uppercase;color:var(--text-muted);font-weight:600">Active Duration</div>
              <div id="cc-call-timer" class="call-timer">00:00</div>
              
              <div class="call-action-btns">
                <button id="btn-start-call" class="btn btn-success btn-call-large" onclick="ColdCallingView.startCall()">
                   Start Call
                </button>
                <button id="btn-end-call" class="btn btn-danger btn-call-large hidden" onclick="ColdCallingView.endCall()">
                   Hang Up
                </button>
              </div>
            </div>

            <!-- 1-Click Outcome Disposition Grid -->
            <div>
              <label class="form-label">Call Outcome / Disposition (Single Click)</label>
              <div id="disposition-grid-container" class="disposition-grid">
                <div class="disposition-btn" data-outcome="Interested" onclick="ColdCallingView.selectDisposition('Interested')">⭐ Interested</div>
                <div class="disposition-btn" data-outcome="Callback Requested" onclick="ColdCallingView.selectDisposition('Callback Requested')"> Callback Req</div>
                <div class="disposition-btn" data-outcome="Follow-up Required" onclick="ColdCallingView.selectDisposition('Follow-up Required')"> Follow-up</div>
                <div class="disposition-btn" data-outcome="Converted" onclick="ColdCallingView.selectDisposition('Converted')"> Converted</div>
                <div class="disposition-btn" data-outcome="No Answer" onclick="ColdCallingView.selectDisposition('No Answer')"> No Answer</div>
                <div class="disposition-btn" data-outcome="Busy" onclick="ColdCallingView.selectDisposition('Busy')">⏳ Busy</div>
                <div class="disposition-btn" data-outcome="Not Interested" onclick="ColdCallingView.selectDisposition('Not Interested')"> Not Interested</div>
                <div class="disposition-btn" data-outcome="Wrong Number" onclick="ColdCallingView.selectDisposition('Wrong Number')">️ Wrong Number</div>
                <div class="disposition-btn" data-outcome="Do Not Call" onclick="ColdCallingView.selectDisposition('Do Not Call')"> Do Not Call</div>
              </div>
            </div>

            <!-- Notes & Next Action -->
            <div class="form-group" style="margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <label class="form-label" style="margin-bottom:0">Conversation Notes</label>
                <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:1px 6px" onclick="ColdCallingView.switchRightTab('helpinghand')" title="View Sales Rebuttals">
                   Insert Rebuttal
                </button>
              </div>
              <textarea id="cc-call-notes" class="form-control" placeholder="Customer currently using Worldpay paying £50/month. Asked for lower card rates..."></textarea>
            </div>

            <div class="form-group" style="margin-bottom:8px">
              <label class="form-label">Next Action</label>
              <input type="text" id="cc-next-action" class="form-control" placeholder="e.g. Send comparison pricing sheet" />
            </div>

            <!-- Quick Callback Scheduler Container -->
            <div id="cc-callback-panel" style="background:var(--bg-main);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:12px;margin-bottom:12px">
              <div style="font-size:12px;font-weight:700;color:var(--accent-amber);margin-bottom:8px;display:flex;align-items:center;gap:6px">
                 Schedule Callback (Optional)
              </div>
              <div class="form-row">
                <div>
                  <label class="form-label" style="font-size:11px">Date</label>
                  <input type="date" id="cc-cb-date" class="form-control" style="padding:6px 10px;font-size:12.5px" />
                </div>
                <div>
                  <label class="form-label" style="font-size:11px">Time</label>
                  <input type="time" id="cc-cb-time" class="form-control" style="padding:6px 10px;font-size:12.5px" />
                </div>
                <div>
                  <label class="form-label" style="font-size:11px">Priority</label>
                  <select id="cc-cb-priority" class="form-control" style="padding:6px 10px;font-size:12.5px">
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Submit Toolbar -->
            <div style="display:flex;gap:12px;justify-content:space-between;margin-top:auto">
              <button class="btn btn-secondary" onclick="ColdCallingView.openAssignToLeaderModal()">
                 Assign to Team Leader
              </button>
              <button class="btn btn-primary" onclick="ColdCallingView.saveCallRecord()">
                 Save Call & Outcome
              </button>
            </div>
          </div>
        </div>

        <!-- Right Column: Interactive Tab Suite (History, Helping Hand, Close Deal) -->
        <div class="calling-col calling-col-history">
          <div class="col-tab-bar">
            <button id="tab-btn-history" class="col-tab-btn active" onclick="ColdCallingView.switchRightTab('history')">
               History
            </button>
            <button id="tab-btn-helpinghand" class="col-tab-btn" onclick="ColdCallingView.switchRightTab('helpinghand')">
               Helping Hand
            </button>
            <button id="tab-btn-closedeal" class="col-tab-btn" onclick="ColdCallingView.switchRightTab('closedeal')">
              ️ Close Deal
            </button>
          </div>

          <!-- Tab Pane 1: Conversation History -->
          <div id="pane-history" class="calling-col-body" style="display:flex">
            <div id="cc-timeline-body" style="width:100%">
              <div style="text-align:center;padding:30px;color:var(--text-dim)">No interactions logged yet.</div>
            </div>
          </div>

          <!-- Tab Pane 2: Helping Hand Embedded -->
          <div id="pane-helpinghand" class="calling-col-body" style="display:none;padding:12px">
            <div id="cc-helpinghand-container" style="width:100%"></div>
          </div>

          <!-- Tab Pane 3: Close Deal Embedded -->
          <div id="pane-closedeal" class="calling-col-body" style="display:none;padding:12px">
            <div id="cc-closedeal-container" style="width:100%"></div>
          </div>
        </div>
      </div>
    `;

    // Set tomorrow 11:30 AM as default callback helper
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateInput = document.getElementById("cc-cb-date");
    const timeInput = document.getElementById("cc-cb-time");
    if (dateInput) dateInput.value = tomorrow.toISOString().split("T")[0];
    if (timeInput) timeInput.value = "11:30";

    await this.loadCustomer(customerId);
  },

  async loadCustomer(customerId) {
    try {
      let cust = null;
      if (customerId) {
        if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
          const res = await API.get(`/customers/${customerId}`);
          cust = res.customer;
        } else {
          cust = await CRMDB.get("customers", customerId);
        }
      }

      if (!cust) {
        // Grab first available customer
        if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
          const res = await API.get("/customers", { per_page: 1 });
          if (res.items && res.items.length) cust = res.items[0];
        } else {
          const all = await CRMDB.getAll("customers");
          if (all.length) cust = all[0];
        }
      }

      this.currentCustomer = cust;
      this.renderCustomerLeftCol(cust);
      if (cust) {
        this.loadCustomerTimeline(cust.id);
      }
    } catch (err) {
      document.getElementById("cc-lead-info").innerHTML = `<div style="color:var(--accent-rose)">${err.message}</div>`;
    }
  },

  renderCustomerLeftCol(cust) {
    const el = document.getElementById("cc-lead-info");
    if (!el) return;

    if (!cust) {
      el.innerHTML = `
        <div style="text-align:center;padding:40px 10px">
          <p style="color:var(--text-dim);font-size:13.5px">No leads found in current queue.</p>
          <button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="App.openCreateLeadModal()">+ Create New Lead</button>
        </div>
      `;
      return;
    }

    el.innerHTML = `
      <div class="lead-meta-row">
        <span class="lead-meta-label">Customer Name</span>
        <span class="lead-meta-val" style="font-size:16px">${cust.full_name}</span>
      </div>

      <div class="lead-meta-row">
        <span class="lead-meta-label">Company</span>
        <span class="lead-meta-val">${cust.company_name || 'Individual Merchant'}</span>
      </div>

      <div class="lead-meta-row">
        <span class="lead-meta-label">Phone Number</span>
        <span class="lead-meta-val highlight" style="font-size:17px">${cust.phone}</span>
      </div>

      <div class="lead-meta-row">
        <span class="lead-meta-label">Previous Terminal Provider</span>
        <span class="lead-meta-val" style="color:var(--accent-amber)">${cust.previous_provider || 'Not Specified'}</span>
      </div>

      <div class="lead-meta-row">
        <span class="lead-meta-label">Industry & Location</span>
        <span class="lead-meta-val">${cust.industry || 'General'} • ${cust.city || cust.postcode || 'UK'}</span>
      </div>

      <div class="lead-meta-row">
        <span class="lead-meta-label">Current Pipeline Status</span>
        <div><span class="badge badge-${(cust.lead_status || 'new').toLowerCase()}">${cust.lead_status}</span></div>
      </div>

      ${cust.next_callback_date ? `
        <div class="lead-meta-row">
          <span class="lead-meta-label">Next Scheduled Callback</span>
          <span class="lead-meta-val" style="color:var(--accent-cyan);font-size:12.5px">${new Date(cust.next_callback_date).toLocaleString()}</span>
        </div>
      ` : ''}

      <div class="lead-meta-row">
        <span class="lead-meta-label">Tags</span>
        <div class="tag-cloud">
          ${(cust.tags || cust.tags_list || []).map(t => `<span class="custom-tag-pill">${t}</span>`).join('') || '<span style="font-size:12px;color:var(--text-dim)">None</span>'}
        </div>
      </div>

      <div class="lead-meta-row" style="margin-top:auto;padding-top:12px;border-top:1px solid var(--border-subtle)">
        <span class="lead-meta-label">Initial Notes</span>
        <div style="font-size:12.5px;color:var(--text-muted);line-height:1.4">${cust.notes || 'No prior notes recorded.'}</div>
      </div>
    `;
  },

  async loadCustomerTimeline(customerId) {
    const el = document.getElementById("cc-timeline-body");
    if (!el) return;

    try {
      let conversations = [];
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        const res = await API.get(`/customers/${customerId}`);
        conversations = res.conversations || [];
      } else {
        const allConvos = await CRMDB.getAll("conversations");
        conversations = allConvos.filter(c => c.customer_id === customerId);
      }

      if (conversations.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-dim);font-size:13px">No interaction history yet. Complete this call to log the first timeline entry!</div>';
        return;
      }

      el.innerHTML = `
        <div class="timeline-container">
          ${conversations.map(c => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-card">
                <div class="timeline-meta">
                  <span class="timeline-agent">${c.agent_name || 'Agent'}</span>
                  <span>${c.created_at ? new Date(c.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</span>
                </div>
                ${c.outcome ? `<div class="timeline-outcome" style="color:var(--accent-amber)">Outcome: ${c.outcome}</div>` : ''}
                <div class="timeline-summary">${c.summary || c.notes || ''}</div>
                ${c.next_action ? `<div class="timeline-next-action">Next: ${c.next_action}</div>` : ''}
                ${c.callback_info ? `<div class="timeline-next-action" style="color:var(--accent-cyan)">Callback: ${c.callback_info}</div>` : ''}
              </div>
            </div>
          `).join("")}
        </div>
      `;
    } catch (err) {
      el.innerHTML = `<div style="color:var(--accent-rose);font-size:12px">${err.message}</div>`;
    }
  },

  reloadTimeline() {
    if (this.currentCustomer) this.loadCustomerTimeline(this.currentCustomer.id);
  },

  // Live Simulated VoIP Call
  async startCall() {
    if (!this.currentCustomer) {
      showToast("No Customer", "Please select a customer first", "error");
      return;
    }

    const timerEl = document.getElementById("cc-call-timer");
    const statusEl = document.getElementById("cc-call-status-badge");
    const btnStart = document.getElementById("btn-start-call");
    const btnEnd = document.getElementById("btn-end-call");

    statusEl.className = "call-status-badge ringing";
    statusEl.innerText = "Ringing...";

    btnStart.classList.add("hidden");
    btnEnd.classList.remove("hidden");

    this.elapsedSeconds = 0;
    this.updateTimerDisplay();

    // Call telephony endpoint if online
    if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
      try {
        const res = await API.post("/telephony/call", {
          customer_id: this.currentCustomer.id,
          phone: this.currentCustomer.phone
        });
        this.activeCallSession = res.session_id;
      } catch (e) {
        console.warn("Telephony simulation online:", e);
      }
    }

    // Connect after 1.5 seconds ringing
    setTimeout(() => {
      statusEl.className = "call-status-badge connected";
      statusEl.innerText = "Connected";
      timerEl.classList.add("active");

      this.timerInterval = setInterval(() => {
        this.elapsedSeconds++;
        this.updateTimerDisplay();
      }, 1000);
    }, 1500);
  },

  endCall() {
    clearInterval(this.timerInterval);
    const timerEl = document.getElementById("cc-call-timer");
    const statusEl = document.getElementById("cc-call-status-badge");
    const btnStart = document.getElementById("btn-start-call");
    const btnEnd = document.getElementById("btn-end-call");

    statusEl.className = "call-status-badge";
    statusEl.innerText = "Call Ended";
    timerEl.classList.remove("active");

    btnStart.classList.remove("hidden");
    btnEnd.classList.add("hidden");

    if (this.activeCallSession && SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
      API.post("/telephony/hangup", { session_id: this.activeCallSession }).catch(() => {});
    }

    showToast("Call Ended", `Duration: ${this.formatDuration(this.elapsedSeconds)}. Please select outcome disposition.`, "info");
  },

  updateTimerDisplay() {
    const el = document.getElementById("cc-call-timer");
    if (el) el.innerText = this.formatDuration(this.elapsedSeconds);
  },

  formatDuration(totalSec) {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  },

  selectDisposition(outcome) {
    this.selectedDisposition = outcome;
    const btns = document.querySelectorAll(".disposition-btn");
    btns.forEach(b => {
      b.classList.toggle("selected", b.getAttribute("data-outcome") === outcome);
    });

    // Auto-focus notes or callback
    if (outcome === "Interested" || outcome === "Callback Requested") {
      document.getElementById("cc-call-notes").focus();
    }
  },

  async saveCallRecord() {
    if (!this.currentCustomer) return;

    if (!this.selectedDisposition) {
      showToast("Select Outcome", "Please select an outcome disposition before saving", "warning");
      return;
    }

    const notes = document.getElementById("cc-call-notes").value.trim();
    const nextAction = document.getElementById("cc-next-action").value.trim();
    const cbDate = document.getElementById("cc-cb-date").value;
    const cbTime = document.getElementById("cc-cb-time").value;

    const payload = {
      customer_id: this.currentCustomer.id,
      duration_seconds: this.elapsedSeconds,
      outcome: this.selectedDisposition,
      notes: notes,
      next_action: nextAction,
      callback_date: cbDate || null,
      callback_time: cbTime || null,
      call_type: "Outbound"
    };

    try {
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        await API.post("/calls", payload);
      } else {
        // Enqueue offline call mutation
        await SyncEngine.enqueueMutation("CREATE", "CALL", null, payload);
      }

      showToast("Call Logged", `Outcome: ${this.selectedDisposition}`, "success");

      // Reset form controls
      this.elapsedSeconds = 0;
      this.updateTimerDisplay();
      this.selectedDisposition = null;
      document.querySelectorAll(".disposition-btn").forEach(b => b.classList.remove("selected"));
      document.getElementById("cc-call-notes").value = "";
      document.getElementById("cc-next-action").value = "";

      // Reload timeline and customer info
      await this.loadCustomer(this.currentCustomer.id);
    } catch (err) {
      showToast("Save Error", err.message, "error");
    }
  },

  openAssignToLeaderModal() {
    if (!this.currentCustomer) return;

    openModal({
      title: "Assign Lead to Team Leader",
      content: `
        <div class="assignment-help-note">
          <strong>Your Team Lead is selected automatically.</strong>
          <span>The lead and its pending callbacks will appear in the Team Lead's team queue, where the team can follow up.</span>
        </div>
        <div class="form-group">
          <label class="form-label">Customer</label>
          <input type="text" class="form-control" value="${this.currentCustomer.full_name} (${this.currentCustomer.company_name || 'No Company'})" disabled />
        </div>
        <div class="form-group">
          <label class="form-label">Reason for Team Leader Attention</label>
          <input type="text" id="asgn-leader-reason" class="form-control" value="Needs Team Lead follow-up" placeholder="Why should the Team Lead review this?" />
        </div>
        <div class="form-group">
          <label class="form-label">Priority</label>
          <select id="asgn-leader-priority" class="form-control">
            <option value="HIGH" selected>High Priority</option>
            <option value="URGENT">Urgent Priority</option>
            <option value="MEDIUM">Medium Priority</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Detailed Notes for Team Leader</label>
          <textarea id="asgn-leader-notes" class="form-control" placeholder="Explain the customer situation and what action is required..."></textarea>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="ColdCallingView.submitAssignToLeader()">Confirm Assignment</button>
      `
    });
  },

  async submitAssignToLeader() {
    const reason = document.getElementById("asgn-leader-reason").value.trim();
    const priority = document.getElementById("asgn-leader-priority").value;
    const notes = document.getElementById("asgn-leader-notes").value.trim();

    try {
      const payload = { customer_id: this.currentCustomer.id, reason, priority, notes };
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        await API.post("/assignments/assign-to-leader", payload);
      } else {
        await SyncEngine.enqueueMutation("CREATE", "ASSIGNMENT", null, payload);
      }

      closeModal();
      showToast("Sent to Team Lead", "The lead and pending callbacks are now in your team lead's queue.", "success");
      await this.loadCustomer(this.currentCustomer.id);
    } catch (err) {
      showToast("Assignment Error", err.message, "error");
    }
  },

  async openAssignForCustomer(customerId) {
    try {
      await this.loadCustomer(customerId);
      this.openAssignToLeaderModal();
    } catch (err) {
      showToast("Unable to open lead", err.message, "error");
    }
  },

  async openLeadPicker() {
    try {
      let leads = [];
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        const res = await API.get("/customers", { per_page: 25 });
        leads = res.items || [];
      } else {
        leads = await CRMDB.getAll("customers");
      }

      openModal({
        title: "Select Lead for Cold Calling",
        content: `
          <div style="max-height:360px;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
            ${leads.map(l => `
              <div style="padding:10px 14px;background:var(--bg-main);border:1px solid var(--border-subtle);border-radius:var(--radius-md);display:flex;justify-content:space-between;align-items:center;cursor:pointer"
                   onclick="ColdCallingView.loadCustomer('${l.id}');closeModal()">
                <div>
                  <div style="font-weight:700;font-size:13.5px">${l.full_name}</div>
                  <div style="font-size:12px;color:var(--text-muted)">${l.company_name || 'Independent'} • ${l.phone}</div>
                </div>
                <span class="badge badge-${(l.lead_status || 'new').toLowerCase()}">${l.lead_status}</span>
              </div>
            `).join("")}
          </div>
        `,
        footer: `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`
      });
    } catch (e) {
      showToast("Error", e.message, "error");
    }
  },

  switchRightTab(tabName) {
    document.querySelectorAll(".col-tab-btn").forEach(b => b.classList.remove("active"));
    const paneHist = document.getElementById("pane-history");
    const paneHH = document.getElementById("pane-helpinghand");
    const paneDeal = document.getElementById("pane-closedeal");

    if (paneHist) paneHist.style.display = "none";
    if (paneHH) paneHH.style.display = "none";
    if (paneDeal) paneDeal.style.display = "none";

    const btn = document.getElementById(`tab-btn-${tabName}`);
    if (btn) btn.classList.add("active");

    if (tabName === "history") {
      if (paneHist) paneHist.style.display = "flex";
    } else if (tabName === "helpinghand") {
      if (paneHH) paneHH.style.display = "flex";
      const hhContainer = document.getElementById("cc-helpinghand-container");
      if (hhContainer && window.HelpingHand) {
        hhContainer.innerHTML = HelpingHand.renderHelpingHandHTML(this.currentCustomer, { isModal: false });
        if (HelpingHand.activeTab === "calculator") {
          setTimeout(() => HelpingHand.runCalculator(), 50);
        }
      }
    } else if (tabName === "closedeal") {
      if (paneDeal) paneDeal.style.display = "flex";
      const dealContainer = document.getElementById("cc-closedeal-container");
      if (dealContainer && window.HelpingHand) {
        HelpingHand.activeTab = "closing";
        dealContainer.innerHTML = HelpingHand.renderHelpingHandHTML(this.currentCustomer, { isModal: false });
      }
    }
  }
};

window.ColdCallingView = ColdCallingView;
