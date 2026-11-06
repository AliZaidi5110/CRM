// Toast Notification Controller
function showToast(title, desc = "", type = "info", duration = 4000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const iconMap = {
    success: "OK",
    error: "Error",
    warning: "",
    info: "Info"
  };

  toast.innerHTML = `
    <div style="font-size:16px;font-weight:bold">${iconMap[type] || "•"}</div>
    <div style="flex:1">
      <div class="toast-title">${title}</div>
      ${desc ? `<div class="toast-desc">${desc}</div>` : ""}
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideInToast 0.25s ease reverse forwards";
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

window.showToast = showToast;
