require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

/*
=========================================================
ONLINE SPHERE - M-PESA BACKEND
=========================================================
*/

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const REQUEST_TIMEOUT = 15000;
const LOG_MAX_DEPTH = 3;

const MPESA_ENV = (process.env.MPESA_ENV || "sandbox").trim().toLowerCase();

const PACKAGES = Object.freeze({
    Bronze: 1000,
    Silver: 1750,
    Gold: 2500,
});

const VALID_PACKAGE_NAMES = Object.keys(PACKAGES);

const DARAJA_BASE_URL =
    MPESA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

/*
=========================================================
STRUCTURED LOGGING
=========================================================
*/

const LOG_LEVELS = {
    ERROR: { emoji: "❌", color: "\x1b[31m" },
    WARN: { emoji: "⚠️", color: "\x1b[33m" },
    INFO: { emoji: "ℹ️", color: "\x1b[36m" },
    SUCCESS: { emoji: "✅", color: "\x1b[32m" },
    DEBUG: { emoji: "🔍", color: "\x1b[35m" },
};

const RESET_COLOR = "\x1b[0m";

function sanitizeData(data, depth = 0) {
    if (depth > LOG_MAX_DEPTH) return "[MAX_DEPTH]";
    if (data === null || data === undefined) return data;

    if (typeof data !== "object") return data;

    if (Array.isArray(data)) {
        return data.map((item) => sanitizeData(item, depth + 1));
    }

    const sensitiveKeys = [
        "password",
        "passkey",
        "secret",
        "token",
        "authorization",
        "credentials",
        "consumerkey",
        "consumer_key",
        "apikey",
        "api_key",
    ];

    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
        const normalizedKey = key.toLowerCase().replace(/[-\s]/g, "");

        if (
            sensitiveKeys.some((sensitive) =>
                normalizedKey.includes(sensitive.replace(/_/g, ""))
            )
        ) {
            sanitized[key] = "***REDACTED***";
        } else {
            sanitized[key] = sanitizeData(value, depth + 1);
        }
    }

    return sanitized;
}

function log(level, requestId, message, data = {}, context = {}) {
    const timestamp = new Date().toISOString();
    const levelInfo = LOG_LEVELS[level] || {
        emoji: "📝",
        color: "",
    };

    const requestTag = requestId ? `[${requestId}]` : "[SYSTEM]";
    const colorCode = levelInfo.color || "";

    let formattedMessage =
        `${colorCode}[${timestamp}] ${levelInfo.emoji} ${level}` +
        `${RESET_COLOR} ${requestTag} ${message}`;

    if (context.duration !== undefined) {
        formattedMessage += ` (${context.duration}ms)`;
    }

    console.log(formattedMessage);

    if (Object.keys(data).length > 0) {
        console.log(JSON.stringify(sanitizeData(data), null, 2));
    }
}

/*
=========================================================
REQUEST ID AND TIMING
=========================================================
*/

app.use((req, res, next) => {
    req.id =
        `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    req.startTime = Date.now();

    res.setHeader("X-Request-ID", req.id);

    res.on("finish", () => {
        const duration = Date.now() - req.startTime;
        const level =
            res.statusCode >= 500
                ? "ERROR"
                : res.statusCode >= 400
                    ? "WARN"
                    : "INFO";

        log(
            level,
            req.id,
            `${req.method} ${req.path} completed`,
            {
                statusCode: res.statusCode,
                responseTimeMs: duration,
            },
            { duration }
        );
    });

    next();
});

/*
=========================================================
CORS CONFIGURATION
=========================================================
*/

const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = (
            process.env.ALLOWED_ORIGINS ||
            "http://localhost:3000,http://localhost:3001"
        )
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

        // Requests without an Origin include server-to-server requests.
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        log("WARN", null, "CORS request rejected", {
            attemptedOrigin: origin,
        });

        return callback(new Error("CORS policy violation"));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-Request-ID"],
    maxAge: 3600,
    optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

/*
=========================================================
STANDARD RESPONSE HELPER
=========================================================
*/

function sendResponse(res, statusCode, data, metadata = {}) {
    return res.status(statusCode).json({
        success: statusCode < 400,
        timestamp: new Date().toISOString(),
        requestId: metadata.requestId || null,
        ...data,
    });
}

/*
=========================================================
PACKAGE VALIDATION
=========================================================
*/

function validatePackageName(packageName) {
    if (typeof packageName !== "string" || !packageName.trim()) {
        return {
            valid: false,
            error: "A valid package name is required.",
            code: "MISSING_PACKAGE",
            hint: `Available packages: ${VALID_PACKAGE_NAMES.join(", ")}`,
        };
    }

    const trimmed = packageName.trim();

    const matchedName = VALID_PACKAGE_NAMES.find(
        (name) => name.toLowerCase() === trimmed.toLowerCase()
    );

    if (!matchedName) {
        return {
            valid: false,
            error: "The selected package does not exist.",
            code: "INVALID_PACKAGE",
            hint: `Choose: ${VALID_PACKAGE_NAMES.join(", ")}`,
        };
    }

    return {
        valid: true,
        name: matchedName,
        amount: PACKAGES[matchedName],
    };
}

/*
=========================================================
KENYAN PHONE NUMBER VALIDATION
=========================================================
*/

function validatePhoneNumber(phone) {
    if (phone === null || phone === undefined || String(phone).trim() === "") {
        return {
            valid: false,
            error: "Phone number is required.",
            code: "MISSING_PHONE",
            hint: "Use a Kenyan number such as 0712345678 or 254712345678.",
        };
    }

    let normalized = String(phone).replace(/[\s()-]/g, "");

    if (normalized.startsWith("+")) {
        normalized = normalized.substring(1);
    }

    if (normalized.startsWith("0")) {
        normalized = "254" + normalized.substring(1);
    }

    if (!/^254[17]\d{8}$/.test(normalized)) {
        return {
            valid: false,
            error: "Enter a valid Kenyan M-PESA phone number.",
            code: "INVALID_PHONE",
            hint: "Use a number beginning with 07, 01, or 254.",
        };
    }

    return {
        valid: true,
        phone: normalized,
    };
}

function validateStkPushRequest(body) {
    const phoneResult = validatePhoneNumber(body?.phone);

    if (!phoneResult.valid) {
        return {
            ...phoneResult,
            statusCode: 400,
        };
    }

    const packageResult = validatePackageName(body?.packageName);

    if (!packageResult.valid) {
        return {
            ...packageResult,
            statusCode: 400,
        };
    }

    return {
        valid: true,
        phone: phoneResult.phone,
        packageName: packageResult.name,
        amount: packageResult.amount,
        statusCode: 200,
    };
}

/*
=========================================================
M-PESA CONFIGURATION VALIDATION
=========================================================
*/

function validateMpesaConfig(requestId = null) {
    if (!["sandbox", "production"].includes(MPESA_ENV)) {
        return {
            valid: false,
            error: "MPESA_ENV must be either sandbox or production.",
            code: "INVALID_MPESA_ENV",
        };
    }

    const requiredVars = {
        MPESA_SHORTCODE: process.env.MPESA_SHORTCODE,
        MPESA_PASSKEY: process.env.MPESA_PASSKEY,
        MPESA_CALLBACK_URL: process.env.MPESA_CALLBACK_URL,
        MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
        MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
    };

    const missing = Object.entries(requiredVars)
        .filter(([, value]) => !value || !String(value).trim())
        .map(([name]) => name);

    if (missing.length > 0) {
        log("ERROR", requestId, "M-PESA configuration is incomplete", {
            missingVariables: missing,
            environment: MPESA_ENV,
        });

        return {
            valid: false,
            error: `Missing required environment variables: ${missing.join(", ")}`,
            code: "CONFIG_MISSING",
            missing,
        };
    }

    const shortcode = requiredVars.MPESA_SHORTCODE.trim();
    const callbackUrl = requiredVars.MPESA_CALLBACK_URL.trim();

    if (!/^\d{5,6}$/.test(shortcode)) {
        return {
            valid: false,
            error: "MPESA_SHORTCODE must contain 5 or 6 digits.",
            code: "INVALID_SHORTCODE",
        };
    }

    let parsedCallbackUrl;

    try {
        parsedCallbackUrl = new URL(callbackUrl);
    } catch {
        return {
            valid: false,
            error: "MPESA_CALLBACK_URL must be a valid URL.",
            code: "INVALID_CALLBACK_URL",
        };
    }

    if (
        !["http:", "https:"].includes(parsedCallbackUrl.protocol) ||
        !parsedCallbackUrl.hostname
    ) {
        return {
            valid: false,
            error: "MPESA_CALLBACK_URL must be an HTTP or HTTPS URL.",
            code: "INVALID_CALLBACK_URL",
        };
    }

    if (
        MPESA_ENV === "production" &&
        parsedCallbackUrl.protocol !== "https:"
    ) {
        return {
            valid: false,
            error: "Production callback URLs must use HTTPS.",
            code: "CALLBACK_HTTPS_REQUIRED",
        };
    }

    return {
        valid: true,
        config: {
            shortcode,
            passkey: requiredVars.MPESA_PASSKEY.trim(),
            callbackUrl,
            consumerKey: requiredVars.MPESA_CONSUMER_KEY.trim(),
            consumerSecret: requiredVars.MPESA_CONSUMER_SECRET.trim(),
        },
    };
}

/*
=========================================================
KENYA TIME STAMP
=========================================================
*/

function createTimestamp() {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Nairobi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date());

    const values = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    return (
        values.year +
        values.month +
        values.day +
        values.hour +
        values.minute +
        values.second
    );
}

function maskPhoneNumber(phone) {
    if (!phone) return "****";
    return "****" + String(phone).slice(-4);
}

/*
=========================================================
FETCH WITH TIMEOUT
=========================================================
*/

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();

    const timeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT
    );

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

/*
=========================================================
DARAJA OAUTH TOKEN
=========================================================
*/

async function getAccessToken(requestId = null) {
    const validation = validateMpesaConfig(requestId);

    if (!validation.valid) {
        throw new Error(validation.error);
    }

    const { consumerKey, consumerSecret } = validation.config;

    const credentials = Buffer.from(
        `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    let response;

    try {
        response = await fetchWithTimeout(
            `${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
            {
                method: "GET",
                headers: {
                    Authorization: `Basic ${credentials}`,
                    Accept: "application/json",
                },
            }
        );
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("Daraja authentication request timed out.");
        }

        throw new Error("Could not connect to the Daraja authentication service.");
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.access_token) {
        log("ERROR", requestId, "Daraja authentication failed", {
            httpStatus: response.status,
            error: data.error_description || data.error || "Authentication rejected",
        });

        throw new Error(
            "Daraja authentication failed. Check the environment and API credentials."
        );
    }

    log("SUCCESS", requestId, "Daraja access token obtained");

    return data.access_token;
}

/*
=========================================================
ROOT AND HEALTH ROUTES
=========================================================
*/

app.get("/", (req, res) => {
    return sendResponse(
        res,
        200,
        {
            message: "Online Sphere Daraja backend is running.",
            version: "2.3.0",
            environment: MPESA_ENV,
            uptime: Math.floor(process.uptime()),
        },
        { requestId: req.id }
    );
});

app.get("/health", (req, res) => {
    const validation = validateMpesaConfig(req.id);
    const healthy = validation.valid;

    log("INFO", req.id, `Health status: ${healthy ? "healthy" : "degraded"}`, {
        configured: healthy,
        environment: MPESA_ENV,
        nodeVersion: process.version,
    });

    return sendResponse(
        res,
        healthy ? 200 : 503,
        {
            status: healthy ? "healthy" : "degraded",
            message: healthy
                ? "Required configuration checks passed."
                : "Service configuration incomplete.",
            diagnostic: healthy
                ? "All required configuration checks passed. Daraja authentication has not been tested by this endpoint."
                : validation.error,
            environment: MPESA_ENV,
            uptime: Math.floor(process.uptime()),
            checks: {
                configuration: healthy ? "pass" : "fail",
                api: "not_tested",
            },
        },
        { requestId: req.id }
    );
});

/*
=========================================================
PACKAGE ROUTES
=========================================================
*/

app.get("/api/packages", (req, res) => {
    const packages = VALID_PACKAGE_NAMES.map((name) => ({
        name,
        amount: PACKAGES[name],
        currency: "KES",
    }));

    return sendResponse(
        res,
        200,
        {
            message: "Available Online Sphere membership packages.",
            count: packages.length,
            packages,
        },
        { requestId: req.id }
    );
});

app.get("/api/package/:packageName", (req, res) => {
    const result = validatePackageName(req.params.packageName);

    if (!result.valid) {
        return sendResponse(
            res,
            400,
            {
                message: result.error,
                hint: result.hint,
                code: result.code,
                availablePackages: VALID_PACKAGE_NAMES,
            },
            { requestId: req.id }
        );
    }

    return sendResponse(
        res,
        200,
        {
            message: "Package information retrieved.",
            package: result.name,
            amount: result.amount,
            currency: "KES",
        },
        { requestId: req.id }
    );
});

/*
=========================================================
M-PESA STK PUSH ROUTE
=========================================================
*/

app.post("/api/mpesa/stkpush", async (req, res) => {
    try {
        const requestValidation = validateStkPushRequest(req.body);

        if (!requestValidation.valid) {
            return sendResponse(
                res,
                requestValidation.statusCode || 400,
                {
                    message: requestValidation.error,
                    hint: requestValidation.hint,
                    code: requestValidation.code,
                },
                { requestId: req.id }
            );
        }

        const configValidation = validateMpesaConfig(req.id);

        if (!configValidation.valid) {
            return sendResponse(
                res,
                503,
                {
                    message: "M-PESA is not configured correctly.",
                    code: configValidation.code,
                    diagnostic: configValidation.error,
                },
                { requestId: req.id }
            );
        }

        const { packageName, phone, amount } = requestValidation;
        const { shortcode, passkey, callbackUrl } = configValidation.config;

        let accessToken;

        try {
            accessToken = await getAccessToken(req.id);
        } catch (error) {
            log("ERROR", req.id, "Could not authenticate with Daraja", {
                error: error.message,
            });

            return sendResponse(
                res,
                503,
                {
                    message: "M-PESA authentication failed. Please try again later.",
                    code: "AUTH_FAILED",
                },
                { requestId: req.id }
            );
        }

        const timestamp = createTimestamp();

        const password = Buffer.from(
            `${shortcode}${passkey}${timestamp}`
        ).toString("base64");

        const payload = {
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: phone,
            PartyB: shortcode,
            PhoneNumber: phone,
            CallBackURL: callbackUrl,
            AccountReference: `SPHERE-${packageName.toUpperCase()}`,
            TransactionDesc: `Online Sphere ${packageName} Membership`,
        };

        log("INFO", req.id, "Submitting STK Push request", {
            package: packageName,
            amount,
            phone: maskPhoneNumber(phone),
            environment: MPESA_ENV,
        });

        let response;
        let data;

        try {
            response = await fetchWithTimeout(
                `${DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    },
                    body: JSON.stringify(payload),
                }
            );

            data = await response.json().catch(() => ({}));
        } catch (error) {
            const message =
                error.name === "AbortError"
                    ? "Daraja STK Push request timed out."
                    : "Could not connect to Daraja STK Push service.";

            log("ERROR", req.id, message);

            return sendResponse(
                res,
                502,
                {
                    message:
                        "We could not confirm the STK Push response. Check the transaction status before retrying.",
                    code: "DARAJA_CONNECTION_ERROR",
                },
                { requestId: req.id }
            );
        }

        if (!response.ok || String(data.ResponseCode) !== "0") {
            log("WARN", req.id, "Daraja rejected the STK Push request", {
                httpStatus: response.status,
                responseCode: data.ResponseCode,
                responseDescription: data.ResponseDescription,
                package: packageName,
            });

            return sendResponse(
                res,
                502,
                {
                    message:
                        data.errorMessage ||
                        data.ResponseDescription ||
                        "Safaricom rejected the STK Push request.",
                    code: "SAFARICOM_ERROR",
                },
                { requestId: req.id }
            );
        }

        log("SUCCESS", req.id, "STK Push request accepted by Daraja", {
            package: packageName,
            amount,
            phone: maskPhoneNumber(phone),
            merchantRequestID: data.MerchantRequestID,
            checkoutRequestID: data.CheckoutRequestID,
        });

        return sendResponse(
            res,
            200,
            {
                message:
                    "STK Push request accepted. Check your phone for the M-PESA prompt.",
                package: packageName,
                amount,
                currency: "KES",
                phone: maskPhoneNumber(phone),
                merchantRequestID: data.MerchantRequestID,
                checkoutRequestID: data.CheckoutRequestID,
                paymentStatus: "PENDING",
            },
            { requestId: req.id }
        );
    } catch (error) {
        log("ERROR", req.id, "Unexpected STK Push error", {
            error: error.message,
        });

        return sendResponse(
            res,
            500,
            {
                message: "An unexpected error occurred while starting payment.",
                code: "INTERNAL_ERROR",
            },
            { requestId: req.id }
        );
    }
});

/*
=========================================================
M-PESA CALLBACK ROUTE
=========================================================

IMPORTANT:
This route currently logs callback results only.
It does not save payments, verify them against a database,
or activate memberships. Those features must be implemented
before production membership payments are enabled.
*/

app.post("/api/mpesa/callback", (req, res) => {
    try {
        const callback = req.body?.Body?.stkCallback;

        if (!callback) {
            log("WARN", req.id, "Callback received with an unexpected structure", {
                bodyKeys: Object.keys(req.body || {}),
            });

            return res.status(200).json({
                ResultCode: 0,
                ResultDesc: "Accepted",
            });
        }

        const {
            MerchantRequestID,
            CheckoutRequestID,
            ResultCode,
            ResultDesc,
        } = callback;

        if (Number(ResultCode) === 0) {
            const items = callback.CallbackMetadata?.Item || [];
            const paymentData = {};

            for (const item of items) {
                if (item.Name) {
                    paymentData[item.Name] = item.Value;
                }
            }

            log("SUCCESS", req.id, "M-PESA success callback received", {
                merchantRequestID: MerchantRequestID,
                checkoutRequestID: CheckoutRequestID,
                amount: paymentData.Amount,
                receiptNumber: paymentData.ReceiptNumber,
                transactionDate: paymentData.TransactionDate,
                phone: maskPhoneNumber(paymentData.PhoneNumber),
            });

            /*
             * TODO BEFORE PRODUCTION:
             * 1. Match CheckoutRequestID to a stored pending payment.
             * 2. Verify the expected amount and account/member.
             * 3. Store the M-PESA receipt with a unique constraint.
             * 4. Make callback processing idempotent.
             * 5. Activate the membership only after verification.
             * 6. Record the event in an auditable database ledger.
             */
        } else {
            log("WARN", req.id, "M-PESA failure callback received", {
                merchantRequestID: MerchantRequestID,
                checkoutRequestID: CheckoutRequestID,
                resultCode: ResultCode,
                resultDescription: ResultDesc,
            });
        }

        return res.status(200).json({
            ResultCode: 0,
            ResultDesc: "Accepted",
        });
    } catch (error) {
        log("ERROR", req.id, "Error processing M-PESA callback", {
            error: error.message,
        });

        return res.status(200).json({
            ResultCode: 0,
            ResultDesc: "Accepted",
        });
    }
});

/*
=========================================================
UNKNOWN ROUTES
=========================================================
*/

app.use((req, res) => {
    const availableEndpoints = [
        "GET /",
        "GET /health",
        "GET /api/packages",
        "GET /api/package/:packageName",
        "POST /api/mpesa/stkpush",
        "POST /api/mpesa/callback",
    ];

    return sendResponse(
        res,
        404,
        {
            message: `Endpoint not found: ${req.method} ${req.path}`,
            code: "NOT_FOUND",
            availableEndpoints,
        },
        { requestId: req.id }
    );
});

/*
=========================================================
GLOBAL ERROR HANDLER
=========================================================
*/

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    log("ERROR", req.id, "Express error handler", {
        error: err.message,
        type: err.name,
    });

    if (err.type === "entity.parse.failed") {
        return sendResponse(
            res,
            400,
            {
                message: "Invalid JSON request body.",
                code: "INVALID_JSON",
            },
            { requestId: req.id }
        );
    }

    if (err.message === "CORS policy violation") {
        return sendResponse(
            res,
            403,
            {
                message: "This website is not allowed to access the API.",
                code: "CORS_BLOCKED",
            },
            { requestId: req.id }
        );
    }

    return sendResponse(
        res,
        500,
        {
            message: "Internal server error.",
            code: "INTERNAL_SERVER_ERROR",
        },
        { requestId: req.id }
    );
});

/*
=========================================================
SERVER STARTUP AND SHUTDOWN
=========================================================
*/

const server = app.listen(PORT, () => {
    console.log("\n==============================================");
    console.log("Online Sphere M-PESA Backend v2.3.0");
    console.log("==============================================");
    console.log(`Port:         ${PORT}`);
    console.log(`Node version: ${process.version}`);
    console.log(`Environment:  ${NODE_ENV}`);
    console.log(`M-PESA mode:  ${MPESA_ENV}`);
    console.log("==============================================\n");

    log("SUCCESS", null, "Server started successfully", {
        port: PORT,
        environment: NODE_ENV,
        mpesaMode: MPESA_ENV,
    });
});

function shutdown(signal) {
    log("INFO", null, `${signal} received; shutting down server`);

    server.close(() => {
        log("SUCCESS", null, "HTTP server closed");
        process.exit(0);
    });

    setTimeout(() => {
        log("ERROR", null, "Shutdown timed out; forcing exit");
        process.exit(1);
    }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (error) => {
    log("ERROR", null, "Uncaught exception", {
        error: error.message,
        stack: error.stack,
    });

    process.exit(1);
});

process.on("unhandledRejection", (reason) => {
    log("ERROR", null, "Unhandled promise rejection", {
        reason: String(reason),
    });
});
