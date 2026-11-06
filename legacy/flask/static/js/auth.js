// CallPro CRM Authentication & Authorization Module
const Auth = {
  currentUser: null,

  async init() {
    const savedUser = localStorage.getItem("crm_user");
    if (savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
      } catch {
        this.currentUser = null;
      }
    }
    return this.currentUser;
  },

  getUser() {
    return this.currentUser;
  },

  isLoggedIn() {
    return !!API.getToken() && !!this.currentUser;
  },

  hasPermission(permCode) {
    if (!this.currentUser) return false;
    if (this.currentUser.role === "super_admin") return true;
    const permissions = this.currentUser.permissions || [];
    return permissions.includes(permCode);
  },

  isRole(roleName) {
    if (!this.currentUser) return false;
    return this.currentUser.role === roleName;
  },

  async canAccessCustomer(customer) {
    const user = this.currentUser;
    if (!user || !customer) return false;
    if (user.role === "super_admin") return true;
    if (user.role === "team_leader") {
      const teams = await CRMDB.getMeta("teams").catch(() => []);
      const teamIds = new Set([user.team_id, ...(teams || []).filter(team => team.team_leader_id === user.id).map(team => team.id)]);
      return teamIds.has(customer.assigned_team_id);
    }
    return customer.assigned_agent_id === user.id || (
      !customer.assigned_agent_id && customer.assigned_team_id === user.team_id
    );
  },

  async login(username, password) {
    try {
      // 1. Online login attempt
      const res = await API.post("/auth/login", { username, password });
      API.setToken(res.token);
      this.currentUser = res.user;
      localStorage.setItem("crm_user", JSON.stringify(res.user));

      // Cache session offline in IndexedDB
      await CRMDB.setMeta("cached_session", {
        user: res.user,
        token: res.token,
        cached_at: Date.now()
      });

      // Bootstrap offline cache
      SyncEngine.bootstrapCache();

      return { success: true, user: res.user };
    } catch (err) {
      // 2. Offline fallback login check (Section 50)
      if (err.isNetworkError || SyncEngine.isSimulatedOffline) {
        const cached = await CRMDB.getMeta("cached_session");
        if (cached && cached.user && cached.user.username === username) {
          // Check max offline session age (7 days)
          const ageMs = Date.now() - cached.cached_at;
          const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
          if (ageMs < maxAgeMs) {
            this.currentUser = cached.user;
            API.setToken(cached.token);
            localStorage.setItem("crm_user", JSON.stringify(cached.user));
            if (window.showToast) {
              window.showToast("Offline Login", "Logged in using securely cached offline credentials", "warning");
            }
            return { success: true, user: cached.user, offline: true };
          }
        }
      }
      throw err;
    }
  },

  async logout() {
    try {
      await API.post("/auth/logout");
    } catch {
      // Ignore if offline
    }
    API.setToken(null);
    localStorage.removeItem("crm_user");
    this.currentUser = null;
    window.location.hash = "#login";
  }
};

window.Auth = Auth;
