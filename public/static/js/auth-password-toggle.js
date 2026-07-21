(function () {
  function setVisible(wrap, input, btn, visible) {
    input.type = visible ? "text" : "password";
    btn.setAttribute("aria-pressed", visible ? "true" : "false");
    btn.setAttribute(
      "aria-label",
      visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"
    );
    btn.title = visible ? "Ẩn mật khẩu" : "Hiện mật khẩu";
    wrap.classList.toggle("password-field--visible", visible);
  }

  document.querySelectorAll(".password-field").forEach(function (wrap) {
    var input = wrap.querySelector("input");
    var btn = wrap.querySelector(".password-field__toggle");
    if (!input || !btn) return;

    setVisible(wrap, input, btn, false);

    btn.addEventListener("click", function () {
      setVisible(wrap, input, btn, input.type === "password");
    });
  });
})();
