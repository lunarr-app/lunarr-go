package auth

import (
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/kataras/iris/v12"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
)

func LoginHandler(ctx iris.Context) {
	var loginReq models.UserLogin
	if err := ctx.ReadJSON(&loginReq); err != nil {
		ctx.StopWithJSON(http.StatusBadRequest, iris.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": err.Error(),
		})
		return
	}

	// Validate user input
	validate := validator.New()
	if err := validate.Struct(loginReq); err != nil {
		ctx.StopWithJSON(http.StatusBadRequest, iris.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": err.Error(),
		})
		return
	}

	// Find user in database
	user, err := db.FindUserByUsername(loginReq.Username)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			ctx.StopWithJSON(http.StatusBadRequest, iris.Map{
				"status":  http.StatusText(http.StatusBadRequest),
				"message": "Invalid username or password",
			})
			return
		} else {
			ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
				"status":  http.StatusText(http.StatusInternalServerError),
				"message": "Failed to find user",
			})
			return
		}
	}

	// Compare password hash
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(loginReq.Password)); err != nil {
		ctx.StopWithJSON(http.StatusBadRequest, iris.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": "Invalid username or password",
		})
		return
	}

	ctx.StatusCode(http.StatusOK)
	ctx.JSON(map[string]string{"status": http.StatusText(http.StatusOK), "api_key": user.APIKey})
}
