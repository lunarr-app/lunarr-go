package handlers

import "github.com/gofiber/fiber/v2"

type ResponseHello struct {
	Hello string `json:"hello"`
}

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
