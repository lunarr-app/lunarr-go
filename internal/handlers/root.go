package handlers

import "github.com/gofiber/fiber/v2"

func RootHandler(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"hello": "world",
	})
}
