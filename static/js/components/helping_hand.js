// UK SME Card Machine Sales - Helping Hand & Rebuttal Engine
// Shift4 & myPOS Sales Companion, Price Calculator & Deal Closing

const HelpingHand = {
  activeTab: "rebuttals", // 'rebuttals' | 'callflow' | 'calculator' | 'closing'
  rebuttalsData: [
    {
      id: "happy_with_provider",
      tag: "Provider",
      customer_says: "“I’m happy with my current provider.”",
      agent_response: "Absolutely, Sir. I’m not asking you to change today—just let me check if I can save you money. What rate are you currently on?",
      context: "Disarm resistance, pivot immediately to comparing rates."
    },
    {
      id: "not_interested",
      tag: "General",
      customer_says: "“Not interested.”",
      agent_response: "Fair enough. Just one thing—if I could reduce your processing cost, would you at least compare the figures?",
      context: "Low-friction challenge: ask for permission to compare numbers."
    },
    {
      id: "in_contract",
      tag: "Contract",
      customer_says: "“I’m in contract.”",
      agent_response: "No problem. When does it expire? I can simply check back closer to the renewal.",
      context: "Capture the renewal month to schedule a high-value callback."
    },
    {
      id: "use_worldpay",
      tag: "Competitor",
      customer_says: "“I use Worldpay.”",
      agent_response: "Got you. What are they charging you overall—rate plus any terminal rental? Because with us, there’s no contract, no rental—just 1.25% per transaction. Just so I can see if it’s actually worth your time, Sir—roughly what’s your monthly card turnover?",
      context: "Expose hidden Worldpay terminal rentals and authorization fees."
    },
    {
      id: "use_sumup",
      tag: "Competitor",
      customer_says: "“I use SumUp.”",
      agent_response: "Sure. Roughly how much are you processing monthly? I’ll tell you straight away if switching would make sense.",
      context: "SumUp is 1.69%-1.75%. Over £1,500/mo, Shift4 saves them hundreds."
    },
    {
      id: "rate_too_high",
      tag: "Pricing",
      customer_says: "“Your rate is too high.”",
      agent_response: "I understand. What rate are you currently getting?",
      context: "Get exact current debit and credit figures to expose total bill cost."
    },
    {
      id: "send_email",
      tag: "Brush-off",
      customer_says: "“Send me an email.”",
      agent_response: "Of course. Just so I send something relevant—roughly what’s your monthly card turnover?",
      context: "Qualify before emailing to compute accurate bespoke savings."
    },
    {
      id: "speak_to_partner",
      tag: "Partner",
      customer_says: "“I need to speak to my partner.”",
      agent_response: "Absolutely. Before you do, what would they need to know to make the decision?",
      context: "Identify the partner's main priority (terminal rental vs rate vs contract)."
    },
    {
      id: "dont_want_change_machines",
      tag: "Terminal",
      customer_says: "“I don’t want to change machines.”",
      agent_response: "That’s fine. The machine is the easy part—the main point is what you’re paying to process each transaction.",
      context: "Direct attention away from physical swap to continuous cashflow savings."
    },
    {
      id: "dont_pay_rental",
      tag: "Rental",
      customer_says: "“I don’t pay rental.”",
      agent_response: "Perfect. Then let’s focus purely on your transaction rate—what percentage are you currently paying?",
      context: "No-rental setups (Zettle/Square/SumUp) charge exorbitant transaction rates (1.75%+)."
    },
    {
      id: "how_much_cost",
      tag: "Pricing",
      customer_says: "“How much does it cost?”",
      agent_response: "It depends on your turnover, Sir. What are you roughly doing in card payments each month?",
      context: "Tie pricing directly to turnover tier: 1.25% under £5k, 0.70% over £5k."
    },
    {
      id: "barely_take_cards",
      tag: "Turnover",
      customer_says: "“We barely take card payments.”",
      agent_response: "Even better—what’s the rough monthly amount? If the saving is tiny, I’ll tell you honestly.",
      context: "Total honesty disarms suspicion; zero rental means no fixed loss."
    },
    {
      id: "too_busy",
      tag: "Brush-off",
      customer_says: "“I’m too busy.”",
      agent_response: "I’ll take 20 seconds, Sir—who are you currently processing with?",
      context: "Request only 20 seconds and a single factual piece of data."
    },
    {
      id: "call_me_later",
      tag: "Callback",
      customer_says: "“Call me later.”",
      agent_response: "Absolutely. What time suits you better—later today or tomorrow?",
      context: "Offer a binary choice to lock in a specific callback time."
    },
    {
      id: "not_decision_maker",
      tag: "Authority",
      customer_says: "“I’m not the decision maker.”",
      agent_response: "No problem. Who normally handles your card payments?",
      context: "Extract business owner / financial director name and direct contact."
    }
  ],

  callFlows: {
    openingTemplate: "Hi Sir, good afternoon! {name} here, Key Accounts Manager. I’ll keep it brief—we’re helping UK businesses cut their card-machine costs, so I just wanted to check who you’re currently using?",
    branches: [
      {
        trigger: "If Worldpay",
        icon: "",
        script: "Got you. And are you paying a monthly rental on that? Because with us, there’s no contract, no rental—just 1.25% per transaction. Just so I can see if it’s actually worth your time, Sir—roughly what’s your monthly card turnover?"
      },
      {
        trigger: "If Not Interested",
        icon: "",
        script: "Fair enough, Sir. Just give me 20 seconds—if I can’t show you a saving, I’ll get out of your way."
      },
      {
        trigger: "If They Ask For Email",
        icon: "",
        script: "Absolutely. Just one figure so I don’t waste your time—what’s your approximate monthly card turnover?"
      },
      {
        trigger: "If Happy With Current Provider",
        icon: "",
        script: "That’s good to hear. I’m not here to fix something that isn’t broken—I just want to see if we can make the same setup cheaper."
      }
    ],
    closerRules: [
      "Ask questions instead of giving a long explanation.",
      "Find out the current provider, rate/fees and approximate monthly card turnover.",
      "Use the customer’s answer to continue the conversation rather than jumping into a full pitch.",
      "Keep the first response short—aim to earn another 10–20 seconds.",
      "Never claim a competitor charges a specific fee unless you have confirmed it applies to that customer’s agreement."
    ]
  },

  pricingPlans: {
    shift4: {
      name: "Shift4 Card Machine Plan",
      badge: "No Rental • No Contract • No Monthly Fee",
      tier_under_5k: 1.25,
      tier_over_5k: 0.70,
      amex: 1.90,
      cnp: 1.99
    },
    mypos: {
      name: "myPOS Card Machine Plan",
      badge: "Debit 0.32% • Credit 0.66% • Auth 3p",
      debit: 0.32,
      credit: 0.66,
      auth: 0.03,
      rental: 25.00,
      contract: "18 Months"
    }
  },

  async init() {
    try {
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        const res = await API.get("/rebuttals");
        if (res.rebuttals) this.rebuttalsData = res.rebuttals;
        if (res.call_flows) {
          this.callFlows.openingTemplate = res.call_flows.opening.raw_template || res.call_flows.opening.script;
          this.callFlows.branches = res.call_flows.branches || this.callFlows.branches;
          this.callFlows.closerRules = res.call_flows.closer_rules || this.callFlows.closerRules;
        }
      }
    } catch (e) {
      // Fallback to embedded data silently
    }
  },

  renderHelpingHandHTML(customer, options = { isModal: false }) {
    const user = Auth.getUser() || { full_name: "Ali", first_name: "Ali" };
    const agentName = user.first_name || user.full_name.split(" ")[0] || "Ali";
    const openingText = this.callFlows.openingTemplate.replace("{name}", agentName).replace("{agent_name}", agentName);

    return `
      <div class="helping-hand-wrapper ${options.isModal ? 'hh-modal-mode' : ''}">
        <!-- Sub-Nav Tab Bar -->
        <div class="hh-nav-bar">
          <button class="hh-nav-btn ${this.activeTab === 'rebuttals' ? 'active' : ''}" onclick="HelpingHand.switchTab('rebuttals')">
             Rebuttals (15)
          </button>
          <button class="hh-nav-btn ${this.activeTab === 'callflow' ? 'active' : ''}" onclick="HelpingHand.switchTab('callflow')">
             Call Flow & Pitch
          </button>
          <button class="hh-nav-btn ${this.activeTab === 'calculator' ? 'active' : ''}" onclick="HelpingHand.switchTab('calculator')">
             Price Calculator
          </button>
          <button class="hh-nav-btn ${this.activeTab === 'closing' ? 'active' : ''}" onclick="HelpingHand.switchTab('closing')">
            ️ Close Deal Form
          </button>
        </div>

        <!-- Tab 1: Rebuttals Engine -->
        <div id="hh-tab-rebuttals" class="hh-tab-pane ${this.activeTab === 'rebuttals' ? 'active' : ''}">
          <div class="hh-search-box">
            <span style="font-size:16px"></span>
            <input type="text" id="rebuttal-search-input" class="form-control" placeholder="Search objection: 'Worldpay', 'too high', 'contract', 'busy'..." oninput="HelpingHand.filterRebuttals()" />
            <button class="btn btn-secondary btn-sm" onclick="HelpingHand.clearRebuttalSearch()">Clear</button>
          </div>

          <div class="hh-tags-filter" id="rebuttal-tag-filters">
            <span class="hh-tag-chip active" onclick="HelpingHand.filterByTag('ALL')">All</span>
            <span class="hh-tag-chip" onclick="HelpingHand.filterByTag('Competitor')">Worldpay / SumUp</span>
            <span class="hh-tag-chip" onclick="HelpingHand.filterByTag('Pricing')">Rates & Fees</span>
            <span class="hh-tag-chip" onclick="HelpingHand.filterByTag('Contract')">Contracts</span>
            <span class="hh-tag-chip" onclick="HelpingHand.filterByTag('Brush-off')">Brush-offs</span>
          </div>

          <div class="hh-rebuttals-list" id="hh-rebuttals-list">
            ${this.renderRebuttalsList(this.rebuttalsData)}
          </div>
        </div>

        <!-- Tab 2: Call Flow & Attention Grabber -->
        <div id="hh-tab-callflow" class="hh-tab-pane ${this.activeTab === 'callflow' ? 'active' : ''}">
          <div class="hh-card" style="border-left:4px solid var(--accent-indigo)">
            <div class="hh-card-header">
              <span class="hh-badge hh-badge-blue">Step 1 • Attention Grabbing Opening</span>
              <button class="btn btn-secondary btn-sm" onclick="HelpingHand.copyText('${escape(openingText)}', 'Opening script copied')"> Copy</button>
            </div>
            <div class="hh-script-speech" style="font-size:14.5px;font-weight:600;color:var(--text-main);line-height:1.5">
              “${openingText}”
            </div>
          </div>

          <div style="margin-top:14px;font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">
            Branching Decision Responses
          </div>

          <div class="hh-branches-grid">
            ${this.callFlows.branches.map(b => `
              <div class="hh-branch-card">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                  <div style="font-weight:700;font-size:13px;color:var(--accent-amber)">${b.icon} ${b.trigger}</div>
                  <button class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:11px" onclick="HelpingHand.copyText('${escape(b.script)}', 'Script copied')">Copy</button>
                </div>
                <div style="font-size:13px;color:var(--text-main);line-height:1.45;background:var(--bg-main);padding:10px;border-radius:6px;border:1px solid var(--border-subtle)">
                  “${b.script}”
                </div>
                <div style="margin-top:6px;display:flex;justify-content:flex-end">
                  <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:3px 8px" onclick="HelpingHand.insertIntoCallNotes('${escape(b.trigger + ': ' + b.script)}')"> Insert into Notes</button>
                </div>
              </div>
            `).join("")}
          </div>

          <div class="hh-card" style="margin-top:16px;background:rgba(245,158,11,0.05);border-color:rgba(245,158,11,0.25)">
            <div style="font-weight:700;font-size:13.5px;color:var(--accent-amber);margin-bottom:10px">
              ️ Closer Rules (Keep in Mind)
            </div>
            <ul class="hh-closer-rules-list">
              ${this.callFlows.closerRules.map(r => `<li>${r}</li>`).join("")}
            </ul>
          </div>
        </div>

        <!-- Tab 3: Price Plan & Savings Calculator -->
        <div id="hh-tab-calculator" class="hh-tab-pane ${this.activeTab === 'calculator' ? 'active' : ''}">
          <div class="calc-grid-layout">
            <!-- Inputs -->
            <div class="calc-inputs-panel">
              <div style="font-weight:700;font-size:13px;color:var(--text-main);margin-bottom:10px;display:flex;align-items:center;gap:6px">
                ️ Merchant Details
              </div>

              <div class="form-group" style="margin-bottom:10px">
                <label class="form-label" style="font-size:11.5px">Monthly Card Turnover (£)</label>
                <div style="display:flex;gap:6px;align-items:center">
                  <input type="number" id="calc-turnover" class="form-control" value="6500" min="100" step="500" oninput="HelpingHand.runCalculator()" />
                </div>
                <div style="display:flex;gap:4px;margin-top:4px">
                  <button class="btn btn-secondary btn-sm" style="font-size:10px;padding:2px 6px" onclick="HelpingHand.setTurnover(2500)">£2.5k</button>
                  <button class="btn btn-secondary btn-sm" style="font-size:10px;padding:2px 6px" onclick="HelpingHand.setTurnover(5000)">£5k Tier</button>
                  <button class="btn btn-secondary btn-sm" style="font-size:10px;padding:2px 6px" onclick="HelpingHand.setTurnover(8500)">£8.5k</button>
                  <button class="btn btn-secondary btn-sm" style="font-size:10px;padding:2px 6px" onclick="HelpingHand.setTurnover(15000)">£15k</button>
                </div>
              </div>

              <div class="form-group" style="margin-bottom:10px">
                <label class="form-label" style="font-size:11.5px">Current Provider</label>
                <select id="calc-provider" class="form-control" onchange="HelpingHand.onProviderChange()">
                  <option value="Worldpay">Worldpay (£25 rental + 1.75%)</option>
                  <option value="SumUp">SumUp (No rental + 1.69%)</option>
                  <option value="Barclaycard">Barclaycard (£20 rental + 1.60%)</option>
                  <option value="Square">Square (No rental + 1.75%)</option>
                  <option value="Zettle">Zettle (No rental + 1.75%)</option>
                  <option value="Clover">Clover (£30 rental + 1.80%)</option>
                  <option value="Other">Other / Custom</option>
                </select>
              </div>

              <div class="form-row" style="margin-bottom:10px">
                <div>
                  <label class="form-label" style="font-size:11.5px">Current Rate (%)</label>
                  <input type="number" id="calc-curr-rate" class="form-control" value="1.75" step="0.05" oninput="HelpingHand.runCalculator()" />
                </div>
                <div>
                  <label class="form-label" style="font-size:11.5px">Terminal Rental (£/mo)</label>
                  <input type="number" id="calc-curr-rental" class="form-control" value="25.00" step="5" oninput="HelpingHand.runCalculator()" />
                </div>
              </div>

              <button class="btn btn-secondary btn-sm" style="width:100%" onclick="HelpingHand.copyPitchScript()">
                 Copy Pitch / Savings Quote
              </button>
            </div>

            <!-- Side by Side Results Comparison -->
            <div class="calc-results-panel">
              <!-- Shift4 Plan Highlight -->
              <div class="plan-card shift4-highlight">
                <div class="plan-card-tag">⭐ RECOMMENDED</div>
                <div class="plan-card-title">Shift4 Price Plan</div>
                <div class="plan-card-sub">No Rental • No Contract • No Monthly Fee</div>
                
                <div class="plan-metrics-row">
                  <div class="plan-metric">
                    <span class="m-label">Applied Rate</span>
                    <span id="shift4-rate-badge" class="m-val" style="color:var(--accent-emerald)">0.70%</span>
                  </div>
                  <div class="plan-metric">
                    <span class="m-label">Monthly Cost</span>
                    <span id="shift4-monthly-cost" class="m-val">£45.50</span>
                  </div>
                </div>

                <div class="savings-glow-box">
                  <div style="font-size:11px;text-transform:uppercase;color:rgba(255,255,255,0.8);font-weight:700">Projected Annual Savings</div>
                  <div id="shift4-annual-savings" style="font-size:24px;font-weight:800;color:#fff;margin:2px 0">£1,120 / yr</div>
                  <div id="shift4-tier-expl" style="font-size:11px;color:rgba(255,255,255,0.85)">Volume Rate: 0.70% (Turnover ≥ £5,000)</div>
                </div>

                <div style="font-size:11px;color:var(--text-muted);margin-top:6px;display:flex;justify-content:space-between">
                  <span>Amex: <strong>1.90%</strong></span>
                  <span>CNP / Virtual: <strong>1.99%</strong></span>
                  <span>Rental: <strong>£0.00</strong></span>
                </div>
              </div>

              <!-- myPOS Alternative -->
              <div class="plan-card mypos-card">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div class="plan-card-title" style="font-size:14px">myPOS Alternative Plan</div>
                  <span class="badge" style="background:var(--border-subtle);color:var(--text-main);font-size:11px">18 Mo Contract</span>
                </div>
                <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:8px">Debit 0.32% • Credit 0.66% • Auth 3p • £25 Rental</div>

                <div class="plan-metrics-row">
                  <div class="plan-metric">
                    <span class="m-label">Monthly Cost</span>
                    <span id="mypos-monthly-cost" class="m-val">£57.80</span>
                  </div>
                  <div class="plan-metric">
                    <span class="m-label">Annual Savings</span>
                    <span id="mypos-annual-savings" class="m-val" style="color:var(--accent-emerald)">£972 / yr</span>
                  </div>
                </div>
              </div>

              <!-- Current Provider Baseline -->
              <div style="padding:10px 12px;background:var(--bg-main);border:1px solid var(--border-subtle);border-radius:var(--radius-md);font-size:12px;display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text-muted)">Current Provider Cost:</span>
                <span id="curr-provider-annual" style="font-weight:700;color:var(--accent-rose)">£1,665 / yr (£138.75/mo)</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab 4: Deal Closing & Merchant Onboarding Form -->
        <div id="hh-tab-closing" class="hh-tab-pane ${this.activeTab === 'closing' ? 'active' : ''}">
          <div class="deal-close-container">
            <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
              <div>
                <div style="font-weight:700;font-size:13.5px;color:var(--accent-emerald)"> UK SME Merchant Closing Agreement</div>
                <div style="font-size:11.5px;color:var(--text-muted)">Capture business, personal & banking details to finalize onboarding.</div>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="HelpingHand.prefillFromCustomer('${customer ? customer.id : ''}')"> Pre-fill Customer Data</button>
            </div>

            <!-- Section 1: Business Details -->
            <div class="deal-section-header">1. Business Details</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Business Name *</label>
                <input type="text" id="dc-biz-name" class="form-control" value="${customer ? (customer.company_name || customer.full_name) : ''}" placeholder="e.g. Camden Coffee Roasters" />
              </div>
              <div class="form-group">
                <label class="form-label">Entity Type *</label>
                <select id="dc-biz-entity" class="form-control">
                  <option value="Ltd">Limited Company (Ltd)</option>
                  <option value="Sole Trader">Sole Trader</option>
                  <option value="Partnership">Partnership</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Business Address *</label>
              <input type="text" id="dc-biz-address" class="form-control" value="${customer ? (customer.address || (customer.city ? customer.city + ', UK' : '')) : ''}" placeholder="Street address, city, postcode" />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Landline Number</label>
                <input type="text" id="dc-biz-landline" class="form-control" placeholder="020 7946 0123" />
              </div>
              <div class="form-group">
                <label class="form-label">Trading Years</label>
                <input type="number" id="dc-biz-years" class="form-control" value="3" min="0" max="100" />
              </div>
            </div>

            <!-- Section 2: Personal Details -->
            <div class="deal-section-header">2. Signatory / Personal Details</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Full Name *</label>
                <input type="text" id="dc-pers-name" class="form-control" value="${customer ? customer.full_name : ''}" placeholder="e.g. Johnathan Smith" />
              </div>
              <div class="form-group">
                <label class="form-label">Mobile Number *</label>
                <input type="text" id="dc-pers-mobile" class="form-control" value="${customer ? customer.phone : ''}" placeholder="07123 456789" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Date of Birth (DOB) *</label>
                <input type="date" id="dc-pers-dob" class="form-control" value="1985-06-15" />
              </div>
              <div class="form-group">
                <label class="form-label">Email Address *</label>
                <input type="email" id="dc-pers-email" class="form-control" value="${customer ? (customer.email || '') : ''}" placeholder="director@company.co.uk" />
              </div>
            </div>

            <!-- Section 3: Bank Details -->
            <div class="deal-section-header">3. Settlement Bank Details</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Bank Name *</label>
                <input type="text" id="dc-bank-name" class="form-control" placeholder="e.g. Barclays, Lloyds, HSBC, NatWest" value="Barclays" />
              </div>
              <div class="form-group">
                <label class="form-label">Account Title / Name on Account *</label>
                <input type="text" id="dc-bank-title" class="form-control" placeholder="e.g. Camden Coffee Roasters Ltd" value="${customer ? (customer.company_name || customer.full_name) : ''}" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">UK Sort Code * (6 digits)</label>
                <input type="text" id="dc-bank-sort" class="form-control" placeholder="20-00-00" maxlength="8" oninput="HelpingHand.formatSortCode(this)" value="20-04-15" />
              </div>
              <div class="form-group">
                <label class="form-label">Account Number * (8 digits)</label>
                <input type="text" id="dc-bank-acc" class="form-control" placeholder="12345678" maxlength="8" oninput="HelpingHand.formatAccountNumber(this)" value="83749201" />
              </div>
            </div>

            <!-- Section 4: Card Machine Agreement -->
            <div class="deal-section-header">4. Selected Card Machine Agreement</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Selected Provider Plan</label>
                <select id="dc-plan-choice" class="form-control" onchange="HelpingHand.onDealPlanChange()">
                  <option value="Shift4" selected>Shift4 (No Rental, No Contract, 0.70% / 1.25%)</option>
                  <option value="myPOS">myPOS (Debit 0.32%, Credit 0.66%, £25 Rental, 18 Mo)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Monthly Card Turnover (£)</label>
                <input type="number" id="dc-plan-turnover" class="form-control" value="6500" oninput="HelpingHand.syncDealRates()" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Agreed Debit/Credit Rate (%)</label>
                <input type="number" id="dc-plan-rate" class="form-control" value="0.70" step="0.01" />
              </div>
              <div class="form-group">
                <label class="form-label">Monthly Terminal Rental (£)</label>
                <input type="number" id="dc-plan-rental" class="form-control" value="0.00" step="1" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Onboarding Notes & Special Instructions</label>
              <textarea id="dc-plan-notes" class="form-control" placeholder="Customer switching from Worldpay. Merchant requested 1 terminal delivery by Friday..."></textarea>
            </div>

            <!-- Submit Button -->
            <div style="margin-top:16px;display:flex;gap:12px;justify-content:flex-end">
              <button class="btn btn-success" style="padding:10px 22px;font-size:14px;font-weight:700" onclick="HelpingHand.submitDeal('${customer ? customer.id : ''}')">
                 Submit Deal Closure & Onboard
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderRebuttalsList(list) {
    if (!list || list.length === 0) {
      return `<div style="text-align:center;padding:30px;color:var(--text-dim)">No matching rebuttals found.</div>`;
    }

    return list.map(r => `
      <div class="rebuttal-item-card" id="reb-${r.id}">
        <div class="rebuttal-card-top">
          <span class="hh-badge hh-badge-amber">${r.tag || 'Objection'}</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:11px" onclick="HelpingHand.copyText('${escape(r.agent_response)}', 'Response copied')">
               Copy
            </button>
            <button class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:11px" onclick="HelpingHand.insertIntoCallNotes('${escape(r.customer_says + ' -> ' + r.agent_response)}')">
               Notes
            </button>
          </div>
        </div>

        <div class="customer-say-bubble">
          <span style="font-weight:700;color:var(--accent-rose)">Customer:</span> ${r.customer_says}
        </div>

        <div class="agent-script-bubble">
          <span style="font-weight:700;color:var(--accent-emerald)">Your Response:</span> ${r.agent_response}
        </div>

        ${r.context ? `<div class="rebuttal-context-tip"> <em>${r.context}</em></div>` : ''}
      </div>
    `).join("");
  },

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll(".hh-nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".hh-tab-pane").forEach(p => p.classList.remove("active"));

    const btn = Array.from(document.querySelectorAll(".hh-nav-btn")).find(b => b.innerText.toLowerCase().includes(tab.toLowerCase()));
    if (btn) btn.classList.add("active");

    const pane = document.getElementById(`hh-tab-${tab}`);
    if (pane) pane.classList.add("active");

    if (tab === "calculator") {
      this.runCalculator();
    }
  },

  filterRebuttals() {
    const query = (document.getElementById("rebuttal-search-input")?.value || "").toLowerCase().trim();
    const filtered = this.rebuttalsData.filter(r => 
      r.customer_says.toLowerCase().includes(query) ||
      r.agent_response.toLowerCase().includes(query) ||
      (r.tag && r.tag.toLowerCase().includes(query)) ||
      (r.context && r.context.toLowerCase().includes(query))
    );
    const listEl = document.getElementById("hh-rebuttals-list");
    if (listEl) listEl.innerHTML = this.renderRebuttalsList(filtered);
  },

  clearRebuttalSearch() {
    const input = document.getElementById("rebuttal-search-input");
    if (input) {
      input.value = "";
      this.filterRebuttals();
    }
  },

  filterByTag(tag) {
    document.querySelectorAll(".hh-tag-chip").forEach(c => c.classList.remove("active"));
    event.target.classList.add("active");

    if (tag === "ALL") {
      const listEl = document.getElementById("hh-rebuttals-list");
      if (listEl) listEl.innerHTML = this.renderRebuttalsList(this.rebuttalsData);
      return;
    }

    const filtered = this.rebuttalsData.filter(r => (r.tag || "").toLowerCase() === tag.toLowerCase());
    const listEl = document.getElementById("hh-rebuttals-list");
    if (listEl) listEl.innerHTML = this.renderRebuttalsList(filtered);
  },

  copyText(escapedText, toastMsg = "Copied to clipboard") {
    const text = unescape(escapedText);
    navigator.clipboard.writeText(text).then(() => {
      showToast("Clipboard", toastMsg, "info");
    }).catch(() => {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("Clipboard", toastMsg, "info");
    });
  },

  insertIntoCallNotes(escapedText) {
    const text = unescape(escapedText);
    const notesEl = document.getElementById("cc-call-notes");
    if (!notesEl) {
      this.copyText(escapedText, "Copied script to clipboard");
      return;
    }
    const current = notesEl.value.trim();
    notesEl.value = current ? `${current}\n\n[Rebuttal]: ${text}` : `[Rebuttal]: ${text}`;
    showToast("Notes Updated", "Rebuttal script inserted into call notes", "success");
  },

  setTurnover(val) {
    const el = document.getElementById("calc-turnover");
    if (el) {
      el.value = val;
      this.runCalculator();
    }
  },

  onProviderChange() {
    const provider = document.getElementById("calc-provider")?.value;
    const rateEl = document.getElementById("calc-curr-rate");
    const rentalEl = document.getElementById("calc-curr-rental");

    if (provider === "Worldpay") {
      if (rateEl) rateEl.value = "1.75";
      if (rentalEl) rentalEl.value = "25.00";
    } else if (provider === "SumUp" || provider === "Square" || provider === "Zettle") {
      if (rateEl) rateEl.value = provider === "SumUp" ? "1.69" : "1.75";
      if (rentalEl) rentalEl.value = "0.00";
    } else if (provider === "Barclaycard") {
      if (rateEl) rateEl.value = "1.60";
      if (rentalEl) rentalEl.value = "20.00";
    } else if (provider === "Clover") {
      if (rateEl) rateEl.value = "1.80";
      if (rentalEl) rentalEl.value = "30.00";
    }
    this.runCalculator();
  },

  runCalculator() {
    const turnover = parseFloat(document.getElementById("calc-turnover")?.value || 0);
    const currRate = parseFloat(document.getElementById("calc-curr-rate")?.value || 1.75);
    const currRental = parseFloat(document.getElementById("calc-curr-rental")?.value || 25.0);

    // Current cost
    const currProcessing = (turnover * currRate) / 100.0;
    const currMonthly = currProcessing + currRental;
    const currAnnual = currMonthly * 12.0;

    // Shift4: <5000 -> 1.25%, >=5000 -> 0.70%
    const shift4Rate = turnover < 5000 ? 1.25 : 0.70;
    const shift4Monthly = (turnover * shift4Rate) / 100.0;
    const shift4Annual = shift4Monthly * 12.0;
    const shift4Savings = Math.max(0, currAnnual - shift4Annual);

    // myPOS: 70% debit (0.32%) + 30% credit (0.66%) + 3p auth (est 100 tx) + £25 rental
    const txCount = turnover > 0 ? Math.round(turnover / 25) : 100;
    const myposMonthly = (turnover * 0.70 * 0.0032) + (turnover * 0.30 * 0.0066) + (txCount * 0.03) + 25.0;
    const myposAnnual = myposMonthly * 12.0;
    const myposSavings = Math.max(0, currAnnual - myposAnnual);

    // Update DOM
    const sRateBadge = document.getElementById("shift4-rate-badge");
    const sMonthly = document.getElementById("shift4-monthly-cost");
    const sSavings = document.getElementById("shift4-annual-savings");
    const sTier = document.getElementById("shift4-tier-expl");

    if (sRateBadge) sRateBadge.innerText = `${shift4Rate.toFixed(2)}%`;
    if (sMonthly) sMonthly.innerText = `£${shift4Monthly.toFixed(2)}`;
    if (sSavings) sSavings.innerText = `£${Math.round(shift4Savings).toLocaleString()} / yr`;
    if (sTier) sTier.innerText = turnover < 5000 ? "Standard Rate: 1.25% (Turnover < £5,000)" : "Volume Rate: 0.70% (Turnover ≥ £5,000)";

    const mMonthly = document.getElementById("mypos-monthly-cost");
    const mSavings = document.getElementById("mypos-annual-savings");
    if (mMonthly) mMonthly.innerText = `£${myposMonthly.toFixed(2)}`;
    if (mSavings) mSavings.innerText = `£${Math.round(myposSavings).toLocaleString()} / yr`;

    const cAnnual = document.getElementById("curr-provider-annual");
    if (cAnnual) cAnnual.innerText = `£${Math.round(currAnnual).toLocaleString()} / yr (£${currMonthly.toFixed(2)}/mo)`;
  },

  copyPitchScript() {
    const turnover = parseFloat(document.getElementById("calc-turnover")?.value || 0);
    const shift4Rate = turnover < 5000 ? 1.25 : 0.70;
    const currRental = parseFloat(document.getElementById("calc-curr-rental")?.value || 25.0);
    const currRate = parseFloat(document.getElementById("calc-curr-rate")?.value || 1.75);

    const currMonthly = ((turnover * currRate) / 100.0) + currRental;
    const shift4Monthly = (turnover * shift4Rate) / 100.0;
    const annualSavings = Math.max(0, (currMonthly - shift4Monthly) * 12);

    const pitch = `“Sir, on your £${turnover.toLocaleString()} monthly turnover, your rate drops to ${shift4Rate}% with Shift4. You eliminate all £${currRental}/mo terminal rental and contract commitments entirely. That saves your business approximately £${Math.round(annualSavings).toLocaleString()} every single year. Can we set this up for you today?”`;

    this.copyText(escape(pitch), "Pitch script copied to clipboard");
  },

  formatSortCode(input) {
    let val = input.value.replace(/[^0-9]/g, "");
    if (val.length > 6) val = val.substring(0, 6);
    let formatted = "";
    for (let i = 0; i < val.length; i++) {
      if (i === 2 || i === 4) formatted += "-";
      formatted += val[i];
    }
    input.value = formatted;
  },

  formatAccountNumber(input) {
    input.value = input.value.replace(/[^0-9]/g, "").substring(0, 8);
  },

  onDealPlanChange() {
    const plan = document.getElementById("dc-plan-choice")?.value;
    const turnover = parseFloat(document.getElementById("dc-plan-turnover")?.value || 6500);
    const rateEl = document.getElementById("dc-plan-rate");
    const rentalEl = document.getElementById("dc-plan-rental");

    if (plan === "Shift4") {
      if (rateEl) rateEl.value = turnover < 5000 ? "1.25" : "0.70";
      if (rentalEl) rentalEl.value = "0.00";
    } else {
      if (rateEl) rateEl.value = "0.32"; // debit
      if (rentalEl) rentalEl.value = "25.00";
    }
  },

  syncDealRates() {
    this.onDealPlanChange();
  },

  prefillFromCustomer(customerId) {
    if (!ColdCallingView.currentCustomer) return;
    const c = ColdCallingView.currentCustomer;
    if (document.getElementById("dc-biz-name")) document.getElementById("dc-biz-name").value = c.company_name || c.full_name;
    if (document.getElementById("dc-biz-address")) document.getElementById("dc-biz-address").value = c.address || (c.city ? c.city + ', UK' : '');
    if (document.getElementById("dc-pers-name")) document.getElementById("dc-pers-name").value = c.full_name;
    if (document.getElementById("dc-pers-mobile")) document.getElementById("dc-pers-mobile").value = c.phone;
    if (document.getElementById("dc-pers-email")) document.getElementById("dc-pers-email").value = c.email || '';
    if (document.getElementById("dc-bank-title")) document.getElementById("dc-bank-title").value = c.company_name || c.full_name;
    showToast("Data Synced", "Pre-filled customer details into onboarding form", "info");
  },

  async submitDeal(customerId) {
    if (!customerId && ColdCallingView.currentCustomer) {
      customerId = ColdCallingView.currentCustomer.id;
    }

    if (!customerId) {
      showToast("Missing Customer", "Please select a lead first", "warning");
      return;
    }

    const bizName = document.getElementById("dc-biz-name")?.value.trim();
    const entityType = document.getElementById("dc-biz-entity")?.value;
    const bizAddress = document.getElementById("dc-biz-address")?.value.trim();
    const landline = document.getElementById("dc-biz-landline")?.value.trim();
    const tradingYears = document.getElementById("dc-biz-years")?.value;

    const persName = document.getElementById("dc-pers-name")?.value.trim();
    const persMobile = document.getElementById("dc-pers-mobile")?.value.trim();
    const persDob = document.getElementById("dc-pers-dob")?.value;
    const persEmail = document.getElementById("dc-pers-email")?.value.trim();

    const bankName = document.getElementById("dc-bank-name")?.value.trim();
    const bankTitle = document.getElementById("dc-bank-title")?.value.trim();
    const sortCode = document.getElementById("dc-bank-sort")?.value.trim();
    const accountNumber = document.getElementById("dc-bank-acc")?.value.trim();

    const planChoice = document.getElementById("dc-plan-choice")?.value;
    const turnover = parseFloat(document.getElementById("dc-plan-turnover")?.value || 0);
    const agreedRate = parseFloat(document.getElementById("dc-plan-rate")?.value || 0.70);
    const agreedRental = parseFloat(document.getElementById("dc-plan-rental")?.value || 0.0);
    const planNotes = document.getElementById("dc-plan-notes")?.value.trim();

    if (!bizName) {
      showToast("Validation Error", "Business Name is required", "warning");
      return;
    }
    if (!persName || !persMobile) {
      showToast("Validation Error", "Signatory Name and Mobile Number are required", "warning");
      return;
    }
    if (!bankName || !bankTitle) {
      showToast("Validation Error", "Bank Name and Account Title are required", "warning");
      return;
    }
    const cleanSort = sortCode.replace(/[^0-9]/g, "");
    if (cleanSort.length !== 6) {
      showToast("Validation Error", "Sort code must be 6 digits (e.g. 20-04-15)", "warning");
      return;
    }
    const cleanAcc = accountNumber.replace(/[^0-9]/g, "");
    if (cleanAcc.length !== 8) {
      showToast("Validation Error", "Bank account number must be 8 digits", "warning");
      return;
    }

    const payload = {
      business_details: {
        business_name: bizName,
        entity_type: entityType,
        business_address: bizAddress,
        landline: landline,
        trading_years: tradingYears
      },
      personal_details: {
        full_name: persName,
        mobile_number: persMobile,
        dob: persDob,
        email: persEmail
      },
      bank_details: {
        bank_name: bankName,
        account_title: bankTitle,
        sort_code: sortCode,
        account_number: accountNumber
      },
      selected_plan: {
        provider_plan: planChoice,
        monthly_turnover: turnover,
        debit_rate: agreedRate,
        credit_rate: agreedRate,
        terminal_rental: agreedRental,
        notes: planNotes
      }
    };

    try {
      if (SyncEngine.isOnline && !SyncEngine.isSimulatedOffline) {
        const res = await API.post(`/customers/${customerId}/close-deal`, payload);
        showToast("Deal Closed!", `Successfully onboarded ${bizName} on ${planChoice}!`, "success");
      } else {
        await SyncEngine.enqueueMutation("UPDATE", "CUSTOMER", customerId, {
          action: "CLOSE_DEAL",
          ...payload
        });
        showToast("Deal Saved Offline", "Will sync to cloud automatically on reconnection", "info");
      }

      // Close modal if open
      closeModal();

      // Refresh cold calling customer profile and timeline
      if (window.ColdCallingView && ColdCallingView.currentCustomer) {
        await ColdCallingView.loadCustomer(customerId);
      }
    } catch (err) {
      showToast("Closing Error", err.message, "error");
    }
  },

  openGlobalModal(customerId = null) {
    let customer = null;
    if (window.ColdCallingView && ColdCallingView.currentCustomer) {
      customer = ColdCallingView.currentCustomer;
    }

    openModal({
      title: " UK Card Machine Sales — Helping Hand & Rebuttal Playbook",
      width: "880px",
      content: this.renderHelpingHandHTML(customer, { isModal: true }),
      footer: `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`
    });

    // Run calculator once rendered
    setTimeout(() => {
      this.runCalculator();
    }, 100);
  }
};

window.HelpingHand = HelpingHand;
HelpingHand.init();
