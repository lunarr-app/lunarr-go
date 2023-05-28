document.addEventListener("DOMContentLoaded", function () {
  const signupForm = document.getElementById("signup-form");
  const signupButton = signupForm.querySelector("button");
  const loader = signupButton.querySelector(".loader");
  const errorMessage = document.getElementById("error-message");
  const successMessage = document.getElementById("success-message");

  signupForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const displayname = event.target.displayname.value;
    const username = event.target.username.value;
    const password = event.target.password.value;
    const sex = event.target.sex.value;

    // Disable the signup button and show the loader
    signupButton.disabled = true;
    loader.style.display = "block";

    // Perform signup request
    fetch("/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayname, username, password, sex }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "success") {
          // Successful signup
          successMessage.style.display = "block";
          successMessage.textContent =
            data.message || "Account created successfully!";
        } else {
          // Failed signup
          errorMessage.style.display = "block";
          errorMessage.textContent =
            data.message || "An error occurred. Please try again later.";
        }
      })
      .catch((err) => {
        // Error occurred during signup request
        errorMessage.style.display = "block";
        errorMessage.textContent =
          err.message || "An error occurred. Please try again later.";
      })
      .finally(() => {
        // Enable the signup button and hide the loader
        signupButton.disabled = false;
        loader.style.display = "none";
      });
  });
});
