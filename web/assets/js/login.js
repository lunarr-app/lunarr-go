document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.getElementById("login-form");
  const loginButton = loginForm.querySelector("button");
  const loader = loginButton.querySelector(".loader");
  const errorMessage = document.getElementById("error-message");

  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const username = event.target.username.value;
    const password = event.target.password.value;

    // Disable the login button and show the loader
    loginButton.disabled = true;
    loader.style.display = "block";

    // Perform login request
    fetch("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.api_key) {
          // Successful login
          window.location.href = "/dashboard"; // Redirect to dashboard page
        } else {
          // Failed login
          errorMessage.style.display = "block";
          errorMessage.textContent = data.message;
        }
      })
      .catch((err) => {
        // Error occurred during login request
        errorMessage.style.display = "block";
        errorMessage.textContent =
          err.message || "An error occurred. Please try again later.";
      })
      .finally(() => {
        // Enable the login button and hide the loader
        loginButton.disabled = false;
        loader.style.display = "none";
      });
  });
});
