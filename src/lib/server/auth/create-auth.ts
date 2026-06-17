import { getRequestEvent } from "$app/server";
import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { appEnv } from "../config/env";
import { getDb } from "../db";
import {
  API_KEY_DISPLAY_PREFIX_LENGTH,
  API_KEY_MAX_EXPIRES_IN_DAYS,
  API_KEY_MAX_NAME_LENGTH,
  API_KEY_PREFIX,
} from "./api-key-config";
import { lunarrAuthSafeguards } from "./plugins/lunarr-auth-safeguards";
import { lunarrSignupPolicy } from "./plugins/signup-policy";

async function createAuth() {
  return betterAuth({
    appName: "Lunarr",
    baseURL: appEnv.ORIGIN,
    secret: appEnv.AUTH_SECRET,
    database: {
      db: await getDb(),
      type: "sqlite",
    },
    user: {
      fields: {
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    session: {
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    account: {
      fields: {
        accountId: "account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
    },
    rateLimit: {
      window: 60,
      max: 100,
    },
    plugins: [
      lunarrSignupPolicy(),
      admin({
        adminRoles: ["admin"],
        defaultRole: "user",
        schema: {
          user: {
            fields: {
              banReason: "ban_reason",
              banExpires: "ban_expires",
            },
          },
          session: {
            fields: {
              impersonatedBy: "impersonated_by",
            },
          },
        },
      }),
      lunarrAuthSafeguards(),
      apiKey({
        defaultPrefix: API_KEY_PREFIX,
        maximumNameLength: API_KEY_MAX_NAME_LENGTH,
        startingCharactersConfig: {
          charactersLength: API_KEY_DISPLAY_PREFIX_LENGTH,
        },
        keyExpiration: {
          maxExpiresIn: API_KEY_MAX_EXPIRES_IN_DAYS,
          minExpiresIn: 0,
        },
        rateLimit: {
          enabled: false,
        },
        enableSessionForAPIKeys: true,
        schema: {
          apikey: {
            fields: {
              configId: "config_id",
              referenceId: "reference_id",
              refillInterval: "refill_interval",
              refillAmount: "refill_amount",
              lastRefillAt: "last_refill_at",
              rateLimitEnabled: "rate_limit_enabled",
              rateLimitTimeWindow: "rate_limit_time_window",
              rateLimitMax: "rate_limit_max",
              requestCount: "request_count",
              lastRequest: "last_request",
              expiresAt: "expires_at",
              createdAt: "created_at",
              updatedAt: "updated_at",
            },
          },
        },
      }),
      sveltekitCookies(getRequestEvent),
    ],
  });
}

export let auth = await createAuth();

export async function rebindAuthForTests() {
  auth = await createAuth();
}

export type AuthSession = typeof auth.$Infer.Session;
