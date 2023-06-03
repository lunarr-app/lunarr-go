package router

import (
	"github.com/gofiber/fiber/v2"
)

func LoginPage(c *fiber.Ctx) error {
	return c.Render("login", nil)
}

func SignupPage(c *fiber.Ctx) error {
	return c.Render("signup", nil)
}
