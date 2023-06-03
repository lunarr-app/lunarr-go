package router

import (
	"github.com/gofiber/fiber/v2"
)

func NotFoundPage(c *fiber.Ctx) error {
	return c.Render("404", nil)
}

func InternalServerErrorPage(c *fiber.Ctx) error {
	return c.Render("500", nil)
}
