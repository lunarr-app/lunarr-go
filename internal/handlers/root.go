package handlers

import "github.com/gofiber/fiber/v2"

// @Summary Hello
// @Description Hello
// @Tags root
// @Accept json
// @Produce json
// @Success 200 {object} ResponseHello
// @Router /hello [get]
func RootHandlerHello(c *fiber.Ctx) error {
	return c.JSON(ResponseHello{
		Hello: "world",
	})
}

func RootHandlerWeb(c *fiber.Ctx) error {
	return c.Redirect("/app")
}

type ResponseHello struct {
	Hello string `json:"hello"`
}
