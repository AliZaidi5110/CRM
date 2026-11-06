// AI Assistant View Controller (Section 39, 40 & 41)
const AiAssistantView = {
  currentCustomerId: null,

  render(drawerEl, customerId = null) {
    this.currentCustomerId = customerId;

    drawerEl.innerHTML = `
      <div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.2)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:20px"></span>
          <div>
            <h3 style="font-size:15px;font-weight:700">CallPro AI Assistant</h3>
            <span style="font-size:11px;color:var(--accent-cyan);font-weight:600">Enterprise CRM Intelligence</span>
          </div>
        </div>
        <button class="modal-close-btn" onclick="App.closeAiDrawer()"></button>
      </div>

      <div style="padding:12px 16px;background:rgba(99,102,241,0.08);border-bottom:1px solid var(--border-subtle);display:flex;gap:6px;overflow-x:auto">
        <button class="btn btn-secondary btn-sm" onclick="AiAssistantView.runQuery('Show my callbacks for today')"> My Callbacks Today</button>
        <button class="btn btn-secondary btn-sm" onclick="AiAssistantView.runQuery('Show my interested leads')">⭐ Interested Leads</button>
        <button class="btn btn-secondary btn-sm" onclick="AiAssistantView.runQuery('Show Team A\\'s overdue callbacks')">️ Team A Overdue</button>
      </div>

      <div id="ai-chat-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px">
        <div style="background:var(--bg-main);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:12px 14px;font-size:13px;line-height:1.4">
           Hello! I am your CallPro AI assistant. Ask me questions like:
          <ul style="margin:8px 0 0 16px;color:var(--text-muted);font-size:12px">
            <li>"Show my callbacks for today"</li>
            <li>"Summarize ABC Restaurant"</li>
            <li>"Show Team A's overdue callbacks"</li>
            <li>"Show all leads assigned to me"</li>
          </ul>
        </div>
      </div>

      <div style="padding:14px;border-top:1px solid var(--border-subtle);background:var(--bg-surface)">
        <div style="display:flex;gap:8px">
          <input type="text" id="ai-chat-input" class="form-control" style="font-size:13px" placeholder="Ask AI CRM Assistant..." onkeypress="if(event.key==='Enter') AiAssistantView.sendQuery()" />
          <button class="btn btn-primary" onclick="AiAssistantView.sendQuery()">Send</button>
        </div>
      </div>
    `;

    if (customerId) {
      this.summarizeCurrentCustomer(customerId);
    }
  },

  async summarizeCurrentCustomer(customerId) {
    const chat = document.getElementById("ai-chat-messages");
    if (!chat) return;

    chat.innerHTML += `
      <div style="background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(6,182,212,0.1));border:1px solid rgba(99,102,241,0.3);border-radius:var(--radius-md);padding:14px;font-size:13px">
        <div style="font-weight:700;color:var(--accent-cyan);margin-bottom:6px"> Analyzing Customer History...</div>
      </div>
    `;

    try {
      const summary = await API.post("/ai/summarize", { customer_id: customerId });
      chat.innerHTML += `
        <div style="background:var(--bg-main);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;font-size:13px;line-height:1.4">
          <div style="font-weight:700;color:var(--text-main);margin-bottom:4px">${summary.customer_name} (${summary.company || 'Private'})</div>
          <div style="color:var(--text-muted);margin-bottom:8px">${summary.ai_summary}</div>
          <div style="padding:8px 10px;background:rgba(245,158,11,0.1);border-left:3px solid var(--accent-amber);border-radius:var(--radius-sm);margin-top:6px;font-size:12px">
            <strong>Recommended Next Action:</strong> ${summary.recommended_next_action}
          </div>
        </div>
      `;
      chat.scrollTop = chat.scrollHeight;
    } catch (err) {
      chat.innerHTML += `<div style="color:var(--accent-rose);font-size:12px">${err.message}</div>`;
    }
  },

  runQuery(text) {
    const input = document.getElementById("ai-chat-input");
    if (input) {
      input.value = text;
      this.sendQuery();
    }
  },

  async sendQuery() {
    const input = document.getElementById("ai-chat-input");
    const chat = document.getElementById("ai-chat-messages");
    if (!input || !chat) return;

    const query = input.value.trim();
    if (!query) return;

    // User message
    chat.innerHTML += `
      <div style="align-self:flex-end;background:var(--primary);color:#fff;border-radius:var(--radius-md) var(--radius-md) 0 var(--radius-md);padding:8px 14px;font-size:13px;max-width:85%">
        ${query}
      </div>
    `;
    input.value = "";
    chat.scrollTop = chat.scrollHeight;

    // AI Thinking
    const thinkingId = "ai-think-" + Date.now();
    chat.innerHTML += `
      <div id="${thinkingId}" style="align-self:flex-start;background:var(--bg-main);border:1px solid var(--border-subtle);border-radius:var(--radius-md) var(--radius-md) var(--radius-md) 0;padding:10px 14px;font-size:12.5px;color:var(--text-muted)">
        Thinking...
      </div>
    `;
    chat.scrollTop = chat.scrollHeight;

    try {
      const res = await API.post("/ai/query", { query });
      const el = document.getElementById(thinkingId);
      if (el) el.remove();

      let replyContent = res.response;
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        replyContent += `
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
            ${res.data.slice(0, 5).map(item => `
              <div style="padding:6px 10px;background:rgba(0,0,0,0.25);border-radius:var(--radius-sm);display:flex;justify-content:space-between;cursor:pointer"
                   onclick="App.openCustomer('${item.id || item.customer_id}')">
                <span><strong>${item.full_name || item.customer_name}</strong> (${item.company_name || item.customer_company || 'Private'})</span>
                <span style="color:var(--accent-cyan);font-family:var(--font-mono)">${item.phone || item.scheduled_formatted || ''}</span>
              </div>
            `).join("")}
          </div>
        `;
      }

      chat.innerHTML += `
        <div style="align-self:flex-start;background:var(--bg-main);border:1px solid ${res.success ? 'var(--border-subtle)' : 'var(--accent-rose)'};border-radius:var(--radius-md) var(--radius-md) var(--radius-md) 0;padding:12px 14px;font-size:13px;line-height:1.4;max-width:90%">
          ${replyContent}
        </div>
      `;
      chat.scrollTop = chat.scrollHeight;
    } catch (err) {
      const el = document.getElementById(thinkingId);
      if (el) el.remove();
      chat.innerHTML += `
        <div style="align-self:flex-start;background:rgba(239,68,68,0.15);border:1px solid var(--accent-rose);border-radius:var(--radius-md);padding:10px 14px;font-size:12px;color:#FCA5A5">
          ${err.message}
        </div>
      `;
      chat.scrollTop = chat.scrollHeight;
    }
  }
};

window.AiAssistantView = AiAssistantView;
