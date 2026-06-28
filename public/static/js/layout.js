document.addEventListener("DOMContentLoaded", function () {
  const hamburger = document.querySelector(".hamburger");
  const backdrop = document.querySelector(".sidebar-backdrop");
  const sidebarLinks = document.querySelectorAll(".sidebar-nav a");

  function openSidebar() {
    document.body.classList.add("sidebar-open");
  }

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
});
