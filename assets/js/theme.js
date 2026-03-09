(function () {
    "use strict";
    const savedTheme = localStorage.getItem("gameHubTheme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
  })();
  