(function () {
  const form = document.getElementById("cms-login-form");
  const submitButton = document.getElementById("cms-login-submit");
  const statusEl = document.getElementById("cms-login-status");

  function setBusy(isBusy) {
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? "Signing In..." : "Enter CMS";
  }

  function setStatus(message) {
    statusEl.textContent = message;
  }

  async function redirectIfAuthenticated() {
    try {
      const response = await fetch("/api/cms/session", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      if (payload.authenticated) {
        window.location.href = "./cms-admin.html";
      }
    } catch (error) {
      console.error(error);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");

    setBusy(true);
    setStatus("Signing you in...");

    try {
      const response = await fetch("/api/cms/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "Unable to sign in.");
      }

      setStatus("Login successful. Opening the dashboard...");
      window.location.href = "./cms-admin.html";
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Unable to sign in right now.");
    } finally {
      setBusy(false);
    }
  });

  redirectIfAuthenticated();
})();
