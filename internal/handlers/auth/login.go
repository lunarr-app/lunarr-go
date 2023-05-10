package auth

import (
	"context"
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/kataras/iris/v12"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
)

func LoginHandler(ctx iris.Context) {
	var loginReq models.UserLogin
	if err := ctx.ReadJSON(&loginReq); err != nil {
		ctx.StatusCode(http.StatusBadRequest)
		ctx.JSON(map[string]string{"status": http.StatusText(http.StatusBadRequest), "message": err.Error()})
		return
	}

	// Validate user input
	validate := validator.New()
	if err := validate.Struct(loginReq); err != nil {
		ctx.StatusCode(http.StatusBadRequest)
		ctx.JSON(map[string]string{"status": http.StatusText(http.StatusBadRequest), "message": err.Error()})
		return
	}

	// Find user in database
	var user models.UserSignup
	err := db.UsersAccounts.FindOne(context.Background(), bson.M{"username": loginReq.Username}).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			ctx.StatusCode(http.StatusBadRequest)
			ctx.JSON(map[string]string{"status": http.StatusText(http.StatusBadRequest), "message": "Invalid username or password"})
			return
		} else {
			ctx.StatusCode(http.StatusInternalServerError)
			ctx.JSON(map[string]string{"status": http.StatusText(http.StatusInternalServerError), "message": "Failed to find user"})
			return
		}
	}

	// Compare password hash
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(loginReq.Password)); err != nil {
		ctx.StatusCode(http.StatusBadRequest)
		ctx.JSON(map[string]string{"status": http.StatusText(http.StatusBadRequest), "message": "Invalid username or password"})
		return
	}

	// Generate JWT token
	token, err := generateToken(user.Username)
	if err != nil {
		ctx.StatusCode(http.StatusInternalServerError)
		ctx.JSON(map[string]string{"status": http.StatusText(http.StatusInternalServerError), "message": "Failed to generate token"})
		return
	}

	ctx.StatusCode(http.StatusOK)
	ctx.JSON(map[string]string{"status": http.StatusText(http.StatusOK), "token": token})
}

func generateToken(username string) (string, error) {
	// TODO: implement JWT token generation
	return "", nil
}
