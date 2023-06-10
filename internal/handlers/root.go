package handlers

import "github.com/gofiber/fiber/v2"

func RootHandlerHello(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"hello": "world",
	})
}

func RootHandlerWeb(c *fiber.Ctx) error {
	return c.Redirect("/app")
}
