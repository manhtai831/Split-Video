document.addEventListener("DOMContentLoaded", function () {
  const hamburger = document.querySelector(".hamburger");
  const backdrop = document.querySelector(".sidebar-backdrop");
  const sidebarLinks = document.querySelectorAll(".sidebar-nav a, .sidebar-user__profile");

  function closeSidebar() {
    document.body.classList.remove("sidebar-open");
  }

  function toggleSidebar() {
    document.body.classList.toggle("sidebar-open");
  }

  if (hamburger) {
    hamburger.addEventListener("click", toggleSidebar);
  }

  if (backdrop) {
    backdrop.addEventListener("click", closeSidebar);
  }

  sidebarLinks.forEach(function (link) {
    link.addEventListener("click", closeSidebar);
  });

  const logoutBtn = document.getElementById("sidebarLogoutBtn");
  const logoutModal = document.getElementById("logoutConfirmModal");
  const logoutCancel = document.getElementById("logoutConfirmCancel");

  if (!logoutBtn || !logoutModal) {
    return;
  }

  logoutBtn.addEventListener("click", function () {
    if (typeof logoutModal.showModal === "function") {
      logoutModal.showModal();
    }
  });

  if (logoutCancel) {
    logoutCancel.addEventListener("click", function () {
      logoutModal.close();
    });
  }

  logoutModal.addEventListener("click", function (event) {
    if (event.target === logoutModal) {
      logoutModal.close();
    }
  });
});
