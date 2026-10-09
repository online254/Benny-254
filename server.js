require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

/*
=========================================================
CONSTANTS & CONFIGURATION
=========================================================
*/

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const REQUEST_TIMEOUT = 15000; // 15 seconds
const LOG_MAX_DEPTH = 3;

const PACKAGES = {
    Bronze: 1000,
    Silver: 1750,
    Gold: 2500,
};

const VALID_PACKAGE_NAMES = Object.keys(PACKAGES);

const DARAJA_BASE_URL =
    process.env.MPESA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

/*
=========================================================
LOGGING UTILITIES - STRUCTURED LOGGING ENGINE
=========================================================
*/

const LOG_LEVELS = {
    ERROR: { emoji: "❌", level: 0, color: "\x1b[31m" },      // Red
    WARN: { emoji: "⚠️ ", level: 1, color: "\x1b[33m" },      // Yellow
    INFO: { emoji: "ℹ️ ", level: 2, color: "\x1b[36m" },      // Cyan
    SUCCESS: { emoji: "✅", level: 3, color: "\x1b[32m" },    // Green
    DEBUG: { emoji: "🔍", level: 4, color: "\x1b[35m" },      // Magenta
};

const RESET_COLOR = "\x1b[0m";

/**
 * Structured logging engine with request tracking and context
 * Features:
 * - Request ID tracking for distributed tracing
 * - Performance monitoring
 * - Structured JSON output support
 * - Safe data serialization
 * @param {string} level - Log level key
 * @param {string} requestId - Request ID for tracking
 * @param {string} message - Log message
 * @param {object} data - Additional data to log
 * @param {object} context - Additional context (e.g., performance metrics)
 */
function log(level, requestId, message, data = {}, context = {}) {
    const timestamp = new Date().toISOString();
    const levelInfo = LOG_LEVELS[level] || { emoji: "📝", level: 5 };
    const requestTag = requestId ? `[${requestId}]` : "[SYSTEM]";
    
    // Color coding for terminal output
    const colorCode = levelInfo.color;
    const levelLabel = `${levelInfo.emoji} ${level}`;
    
    // Construct base log entry
    const logEntry = {
        timestamp,
        level,
        requestId: requestId || null,
        message,
        ...context,
    };

    // Build formatted message
    let formattedMessage = `${colorCode}[${timestamp}] ${levelLabel}${RESET_COLOR} ${requestTag} ${message}`;

    // Add performance metrics if available
    if (context.duration) {
        formattedMessage += ` (${context.duration}ms)`;
    }

    console.log(formattedMessage);

    // Log structured data if present
    if (Object.keys(data).length > 0) {
        const sanitizedData = sanitizeData(data);
        const dataString = JSON.stringify(sanitizedData, null, 2);
        const indentedData = dataString.split("\n").map((line, i) => i === 0 ? `  └─ ${line}` : `     ${line}`).join("\n");
        console.log(indentedData);
    }

    // Return structured log entry for potential storage/monitoring
    return { ...logEntry, data };
}

/**
 * Sanitizes sensitive data from logs
 * Masks passwords, tokens, and secrets
 * @param {any} data - Data to sanitize
 * @param {number} depth - Current recursion depth
 * @returns {any} Sanitized data
 */
function sanitizeData(data, depth = 0) {
    if (depth > LOG_MAX_DEPTH) return "[MAX_DEPTH]";
    if (data === null || data === undefined) return data;
    if (typeof data !== "object") return data;

    if (Array.isArray(data)) {
        return data.map(item => sanitizeData(item, depth + 1));
    }

    const sensitiveKeys = ["password", "passkey", "secret", "token", "key", "authorization", "credentials"];
    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
            sanitized[key] = "***REDACTED***";
        } else {
            sanitized[key] = sanitizeData(value, depth + 1);
        }
    }

    return sanitized;
}

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

        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        log("WARN", null, `CORS violation attempt from origin: ${origin}`, {
            attemptedOrigin: origin,
            allowedOrigins,
        });
        callback(new Error("CORS policy violation"));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-Request-ID", "X-Response-Time"],
    maxAge: 3600,
    optionsSuccessStatus: 200,
};

/*
=========================================================
MIDDLEWARE SETUP
=========================================================
*/

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request ID middleware for tracking
app.use((req, res, next) => {
    req.id = `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    req.startTime = Date.now();
    res.setHeader("X-Request-ID", req.id);
    next();
});

// Enhanced request logging middleware with timing and context
app.use((req, res, next) => {
    const method = req.method;
    const path = req.path;
    const userAgent = req.headers["user-agent"] || "unknown";
    const contentLength = req.headers["content-length"] || 0;

    log("INFO", req.id, `Incoming ${method} request`, {
        method,
        path,
        ip: req.ip,
        contentLength,
        userAgent: userAgent.substring(0, 60),
        referer: req.headers["referer"] || "none",
    });

    // Capture response completion for performance tracking
    res.on("finish", () => {
        const duration = Date.now() - req.startTime;
        const statusCode = res.statusCode;
        const statusCategory = statusCode < 400 ? "SUCCESS" : statusCode < 500 ? "WARN" : "ERROR";

        log(statusCategory, req.id, `${method} ${path} completed`, {
            statusCode,
            responseTime: `${duration}ms`,
            contentLength: res.getHeader("content-length") || 0,
        }, { duration });
    });

    next();
});

// Request body validation middleware
app.use((req, res, next) => {
    // Validate content type for POST/PUT requests
    if (["POST", "PUT"].includes(req.method)) {
        const contentType = req.headers["content-type"];
        if (!contentType || !contentType.includes("application/json")) {
            log("WARN", req.id, "Invalid Content-Type header", {
                received: contentType || "none",
                expected: "application/json",
                method: req.method,
            });
            return res.status(415).json({
                success: false,
                timestamp: new Date().toISOString(),
                message: "Content-Type must be application/json",
                code: "INVALID_CONTENT_TYPE",
            });
        }
    }

    // Empty body validation for POST requests
    if (req.method === "POST" && (!req.body || Object.keys(req.body).length === 0)) {
        log("WARN", req.id, "Empty POST request body received", {
            contentType: req.headers["content-type"],
        });
        return res.status(400).json({
            success: false,
            timestamp: new Date().toISOString(),
            message: "Request body is empty or invalid JSON.",
            code: "EMPTY_BODY",
        });
    }

    next();
});

/*
=========================================================
VALIDATION FUNCTIONS WITH ENHANCED ERROR CONTEXT
=========================================================
*/

/**
 * Validates and normalizes package name
 * Returns detailed validation result with error context
 * @param {any} packageName - Package name from request
 * @returns {object} { valid, name, error, code }
 */
function validatePackageName(packageName) {
    if (!packageName) {
        return {
            valid: false,
            error: "Package name is required",
            code: "MISSING_PACKAGE",
            hint: `Available: ${VALID_PACKAGE_NAMES.join(", ")}`,
        };
    }

    if (typeof packageName !== "string") {
        return {
            valid: false,
            error: `Package name must be a string, received ${typeof packageName}`,
            code: "INVALID_PACKAGE_TYPE",
            received: packageName,
        };
    }

    const trimmed = packageName.trim();
    if (!trimmed) {
        return {
            valid: false,
            error: "Package name cannot be empty or whitespace",
            code: "EMPTY_PACKAGE",
        };
    }

    const match = VALID_PACKAGE_NAMES.find(
        (name) => name.toLowerCase() === trimmed.toLowerCase()
    );

    if (!match) {
        return {
            valid: false,
            error: `Invalid package: "${packageName}"`,
            code: "INVALID_PACKAGE",
            received: packageName,
            hint: `Use one of: ${VALID_PACKAGE_NAMES.join(", ")}`,
            availablePackages: VALID_PACKAGE_NAMES,
        };
    }

    return {
        valid: true,
        name: match,
        amount: PACKAGES[match],
    };
}

/**
 * Validates and normalizes phone number to 254xxx format
 * Returns detailed validation result with error context
 * @param {any} phone - Phone number from request
 * @returns {object} { valid, phone, error, code }
 */
function validatePhoneNumber(phone) {
    if (phone === null || phone === undefined) {
        return {
            valid: false,
            error: "Phone number is required",
            code: "MISSING_PHONE",
            hint: "Use format: 07xxxxxxxxx, 01xxxxxxxxx, or +254-7xx-xxx-xxx",
        };
    }

    let phoneNumber = String(phone)
        .replace(/\s+/g, "")
        .replace(/^\+/, "");

    // Normalize leading 0
    if (phoneNumber.startsWith("0")) {
        phoneNumber = `254${phoneNumber.substring(1)}`;
    }

    // Validate format
    if (!phoneNumber.startsWith("254")) {
        return {
            valid: false,
            error: `Phone number must start with 254 or 0, received: "${phone}"`,
            code: "INVALID_PHONE_FORMAT",
            received: phone,
            hint: "Use format: 07xxxxxxxxx, 01xxxxxxxxx, or +254-7xx-xxx-xxx",
        };
    }

    // Validate Kenyan carrier (1 or 7)
    if (!/^254[17]\d{8}$/.test(phoneNumber)) {
        return {
            valid: false,
            error: `Invalid Kenyan M-Pesa number: ${phoneNumber}`,
            code: "INVALID_PHONE_VALIDATION",
            received: phone,
            hint: "Must be 254[1-7]xxxxxxxx (254 + carrier digit 1 or 7 + 8 more digits)",
            pattern: "^254[17]\\d{8}$",
        };
    }

    return {
        valid: true,
        phone: phoneNumber,
    };
}

/**
 * Comprehensive validation for STK Push request
 * Returns structured validation result with full error context
 * @param {object} body - Request body
 * @param {string} requestId - Request ID for tracking
 * @returns {object} Validation result with status and details
 */
function validateStkPushRequest(body, requestId = null) {
    const { phone, packageName } = body || {};

    // Validate phone
    const phoneValidation = validatePhoneNumber(phone);
    if (!phoneValidation.valid) {
        log("WARN", requestId, `Phone validation failed: ${phoneValidation.code}`, {
            error: phoneValidation.error,
            hint: phoneValidation.hint,
        });
        return {
            valid: false,
            ...phoneValidation,
            statusCode: 400,
        };
    }

    // Validate package
    const packageValidation = validatePackageName(packageName);
    if (!packageValidation.valid) {
        log("WARN", requestId, `Package validation failed: ${packageValidation.code}`, {
            error: packageValidation.error,
            hint: packageValidation.hint,
        });
        return {
            valid: false,
            ...packageValidation,
            statusCode: 400,
        };
    }

    return {
        valid: true,
        phone: phoneValidation.phone,
        packageName: packageValidation.name,
        amount: packageValidation.amount,
        statusCode: 200,
    };
}

/**
 * Validates M-Pesa environment configuration
 * Checks for all required environment variables with detailed error context
 * @param {string} requestId - Request ID for tracking
 * @returns {object} Validation result with config or missing variables
 */
function validateMpesaConfig(requestId = null) {
    const requiredVars = {
        MPESA_SHORTCODE: process.env.MPESA_SHORTCODE,
        MPESA_PASSKEY: process.env.MPESA_PASSKEY,
        MPESA_CALLBACK_URL: process.env.MPESA_CALLBACK_URL,
        MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
        MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
    };

    const missing = Object.entries(requiredVars)
        .filter(([_, value]) => !value)
        .map(([key, _]) => key);

    if (missing.length > 0) {
        log("ERROR", requestId, "M-Pesa configuration validation failed", {
            missingVariables: missing,
            totalMissing: missing.length,
            environment: process.env.MPESA_ENV || "sandbox",
        });

        return {
            valid: false,
            error: `Missing required environment variables: ${missing.join(", ")}`,
            missing,
            statusCode: 500,
            code: "CONFIG_MISSING",
        };
    }

    // Validate format of shortcode and callback URL
    const shortcode = requiredVars.MPESA_SHORTCODE;
    const callbackUrl = requiredVars.MPESA_CALLBACK_URL;

    if (!/^\d{5,6}$/.test(shortcode)) {
        log("WARN", requestId, "M-Pesa shortcode format invalid", {
            shortcode,
            pattern: "5-6 digits",
        });
        return {
            valid: false,
            error: "MPESA_SHORTCODE must be 5-6 digits",
            code: "CONFIG_INVALID",
            statusCode: 500,
        };
    }

    if (!/^https?:\/\/.+/.test(callbackUrl)) {
        log("WARN", requestId, "M-Pesa callback URL format invalid", {
            callbackUrl,
        });
        return {
            valid: false,
            error: "MPESA_CALLBACK_URL must be a valid URL",
            code: "CONFIG_INVALID",
            statusCode: 500,
        };
    }

    return {
        valid: true,
        config: {
            shortcode: requiredVars.MPESA_SHORTCODE,
            passkey: requiredVars.MPESA_PASSKEY,
            callbackUrl: requiredVars.MPESA_CALLBACK_URL,
            consumerKey: requiredVars.MPESA_CONSUMER_KEY,
            consumerSecret: requiredVars.MPESA_CONSUMER_SECRET,
        },
        statusCode: 200,
    };
}

/*
=========================================================
HELPER FUNCTIONS
=========================================================
*/

/**
 * Creates timestamp in YYYYMMDDHHmmss format for M-Pesa STK Push
 * @returns {string} Formatted timestamp
 */
function createTimestamp() {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0"),
    ].join("");
}

/**
 * Masks phone number for safe logging (shows only last 4 digits)
 * @param {string} phone - Full phone number
 * @returns {string} Masked phone number
 */
function maskPhoneNumber(phone) {
    if (!phone || phone.length < 4) return "****";
    return phone.slice(-4).padStart(phone.length, "*");
}

/**
 * Fetches Daraja OAuth access token with enhanced error handling
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<string>} Access token
 * @throws {Error} If authentication fails with detailed context
 */
async function getAccessToken(requestId = null) {
    const configValidation = validateMpesaConfig(requestId);
    if (!configValidation.valid) {
        throw new Error(configValidation.error);
    }

    const { consumerKey, consumerSecret } = configValidation.config;
    const credentials = Buffer.from(
        `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    try {
        log("INFO", requestId, "Requesting Daraja OAuth token", {
            endpoint: `${DARAJA_BASE_URL}/oauth/v1/generate`,
            environment: process.env.MPESA_ENV || "sandbox",
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        const response = await fetch(
            `${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
            {
                method: "GET",
                headers: {
                    Authorization: `Basic ${credentials}`,
                    Accept: "application/json",
                },
                signal: controller.signal,
            }
        ).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error_description || response.statusText;
            log("WARN", requestId, "Daraja OAuth request failed", {
                status: response.status,
                error: errorMsg,
            });
            throw new Error(`OAuth failed (${response.status}): ${errorMsg}`);
        }

        const data = await response.json();

        if (!data.access_token) {
            log("ERROR", requestId, "No access token in Daraja response", {
                response: Object.keys(data),
            });
            throw new Error("No access token in response from Daraja");
        }

        log("SUCCESS", requestId, "Daraja OAuth token obtained successfully");
        return data.access_token;
    } catch (error) {
        if (error.name === "AbortError") {
            log("ERROR", requestId, "Daraja OAuth request timed out", {
                timeout: `${REQUEST_TIMEOUT}ms`,
            });
            throw new Error(`Authentication timeout (${REQUEST_TIMEOUT}ms)`);
        }
        log("ERROR", requestId, "Authentication error", {
            error: error.message,
        });
        throw new Error(`Authentication failed: ${error.message}`);
    }
}

/**
 * Sends standardized JSON response with timestamp and metadata
 * @param {object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {object} data - Response data
 * @param {object} metadata - Optional metadata (e.g., request ID)
 */
function sendResponse(res, statusCode, data, metadata = {}) {
    res.status(statusCode).json({
        success: statusCode < 400,
        timestamp: new Date().toISOString(),
        requestId: metadata.requestId || null,
        ...data,
    });
}

/*
=========================================================
ROUTES: HEALTH & STATUS
=========================================================
*/

app.get("/", (req, res) => {
    log("INFO", req.id, "Health check requested");
    sendResponse(res, 200, {
        message: "Online Sphere Daraja backend is running",
        version: "2.2.0",
        environment: process.env.MPESA_ENV || "sandbox",
        uptime: Math.floor(process.uptime()),
    }, { requestId: req.id });
});

app.get("/health", (req, res) => {
    const configValidation = validateMpesaConfig(req.id);
    const status = configValidation.valid ? "healthy" : "degraded";

    log("INFO", req.id, `Health status: ${status}`, {
        environment: process.env.MPESA_ENV || "sandbox",
        configured: configValidation.valid,
        nodeVersion: process.version,
    });

    sendResponse(res, configValidation.valid ? 200 : 503, {
        status,
        message: configValidation.valid
            ? "Service is operational"
            : "Service configuration incomplete",
        environment: process.env.MPESA_ENV || "sandbox",
        uptime: Math.floor(process.uptime()),
        checks: {
            configuration: configValidation.valid ? "pass" : "fail",
            api: "pass",
        },
    }, { requestId: req.id });
});

/*
=========================================================
ROUTES: PACKAGE PRICING
=========================================================
*/

app.get("/api/packages", (req, res) => {
    log("INFO", req.id, "Packages list requested");
    
    const packages = VALID_PACKAGE_NAMES.map((name) => ({
        name,
        amount: PACKAGES[name],
        currency: "KES",
    }));

    sendResponse(res, 200, {
        message: "Available membership packages",
        count: packages.length,
        packages,
    }, { requestId: req.id });
});

app.get("/api/package/:packageName", (req, res) => {
    const packageValidation = validatePackageName(req.params.packageName);

    if (!packageValidation.valid) {
        log("WARN", req.id, `Package retrieval failed: ${packageValidation.code}`, {
            requested: req.params.packageName,
            error: packageValidation.error,
        });
        return sendResponse(res, 400, {
            message: packageValidation.error,
            hint: packageValidation.hint,
            availablePackages: VALID_PACKAGE_NAMES,
            code: packageValidation.code,
        }, { requestId: req.id });
    }

    log("INFO", req.id, `Package info retrieved: ${packageValidation.name}`, {
        package: packageValidation.name,
        amount: packageValidation.amount,
    });

    sendResponse(res, 200, {
        message: "Package information retrieved",
        package: packageValidation.name,
        amount: packageValidation.amount,
        currency: "KES",
    }, { requestId: req.id });
});

/*
=========================================================
ROUTES: M-PESA STK PUSH
=========================================================
*/

app.post("/api/mpesa/stkpush", async (req, res) => {
    let duration = 0;
    try {
        // Validate request body
        const validation = validateStkPushRequest(req.body, req.id);
        if (!validation.valid) {
            return sendResponse(res, validation.statusCode, {
                message: validation.error,
                hint: validation.hint,
                code: validation.code,
            }, { requestId: req.id });
        }

        const { packageName, phone, amount } = validation;

        // Validate M-Pesa configuration
        const configValidation = validateMpesaConfig(req.id);
        if (!configValidation.valid) {
            return sendResponse(res, 503, {
                message: "M-Pesa service is temporarily unavailable",
                code: configValidation.code,
                details: "Configuration validation failed",
            }, { requestId: req.id });
        }

        const { shortcode, passkey, callbackUrl } = configValidation.config;

        // Get access token
        let accessToken;
        try {
            accessToken = await getAccessToken(req.id);
            log("SUCCESS", req.id, "Access token obtained");
        } catch (error) {
            log("ERROR", req.id, "Failed to get access token", {
                error: error.message,
            });
            return sendResponse(res, 503, {
                message: "Failed to authenticate with M-Pesa. Please try again.",
                code: "AUTH_FAILED",
            }, { requestId: req.id });
        }

        // Prepare STK payload
        const timestamp = createTimestamp();
        const password = Buffer.from(
            `${shortcode}${passkey}${timestamp}`
        ).toString("base64");

        const stkPayload = {
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

        log("INFO", req.id, "STK Push initiated", {
            package: packageName,
            amount,
            phone: maskPhoneNumber(phone),
            timestamp,
            environment: process.env.MPESA_ENV || "sandbox",
        });

        // Send to Daraja
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        const response = await fetch(
            `${DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(stkPayload),
                signal: controller.signal,
            }
        ).finally(() => clearTimeout(timeoutId));

        const data = await response.json();

        if (!response.ok || data.ResponseCode !== "0") {
            log("WARN", req.id, "STK Push rejected by Daraja", {
                responseCode: data.ResponseCode,
                responseDescription: data.ResponseDescription,
                httpStatus: response.status,
                package: packageName,
                phone: maskPhoneNumber(phone),
            });

            return sendResponse(res, 502, {
                message:
                    data.ResponseDescription ||
                    "M-Pesa rejected the request. Please verify your details and try again.",
                responseCode: data.ResponseCode,
                code: "SAFARICOM_ERROR",
            }, { requestId: req.id });
        }

        log("SUCCESS", req.id, "STK Push sent successfully", {
            merchantRequestID: data.MerchantRequestID,
            checkoutRequestID: data.CheckoutRequestID,
            package: packageName,
            amount,
            phone: maskPhoneNumber(phone),
        });

        return sendResponse(res, 200, {
            message: "STK Push sent successfully. Check your phone and enter your M-Pesa PIN.",
            package: packageName,
            amount,
            currency: "KES",
            phone: maskPhoneNumber(phone),
            merchantRequestID: data.MerchantRequestID,
            checkoutRequestID: data.CheckoutRequestID,
        }, { requestId: req.id });
    } catch (error) {
        const errorContext = {
            error: error.message,
            type: error.name,
        };

        if (error.stack) {
            errorContext.stack = error.stack;
        }

        log("ERROR", req.id, "Unexpected error in STK Push", errorContext);
        return sendResponse(res, 500, {
            message: "An unexpected error occurred while processing your request.",
            code: "INTERNAL_ERROR",
        }, { requestId: req.id });
    }
});

/*
=========================================================
ROUTES: M-PESA CALLBACK
=========================================================
*/

app.post("/api/mpesa/callback", (req, res) => {
    try {
        const callback = req.body?.Body?.stkCallback;

        log("INFO", req.id, "M-Pesa callback received", {
            hasCallback: !!callback,
            bodyKeys: Object.keys(req.body || {}),
        });

        if (!callback) {
            log("WARN", req.id, "Invalid callback structure - missing stkCallback", {
                receivedKeys: Object.keys(req.body || {}),
            });
            return res.json({
                ResultCode: 0,
                ResultDesc: "Accepted",
            });
        }

        const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc } =
            callback;

        log("INFO", req.id, "Callback details", {
            MerchantRequestID,
            CheckoutRequestID,
            ResultCode,
            ResultDesc,
        });

        if (ResultCode === 0) {
            const metadata = callback.CallbackMetadata?.Item || [];
            const paymentData = {};

            metadata.forEach((item) => {
                paymentData[item.Name] = item.Value;
            });

            log("SUCCESS", req.id, "Payment successful", {
                amount: paymentData.Amount,
                receiptNumber: paymentData.ReceiptNumber,
                transactionDate: paymentData.TransactionDate,
                phoneNumber: maskPhoneNumber(paymentData.PhoneNumber),
                merchantRequestID: MerchantRequestID,
            });

            /*
            TODO: Save payment to database
            - Store MerchantRequestID, CheckoutRequestID
            - Link to user account
            - Activate membership
            - Send confirmation email/SMS
            - Track transaction in analytics
            */
        } else {
            log("WARN", req.id, "Payment failed", {
                resultCode: ResultCode,
                resultDescription: ResultDesc,
                merchantRequestID: MerchantRequestID,
            });
        }

        // Always return success to Safaricom
        res.json({
            ResultCode: 0,
            ResultDesc: "Accepted",
        });
    } catch (error) {
        log("ERROR", req.id, "Error processing M-Pesa callback", {
            error: error.message,
            stack: error.stack,
        });
        // Still return success to avoid Safaricom retries
        res.json({
            ResultCode: 0,
            ResultDesc: "Accepted",
        });
    }
});

/*
=========================================================
ERROR HANDLERS
=========================================================
*/

// 404 Handler
app.use((req, res) => {
    log("WARN", req.id, `Endpoint not found: ${req.method} ${req.path}`, {
        availableEndpoints: [
            "GET /",
            "GET /health",
            "GET /api/packages",
            "GET /api/package/:packageName",
            "POST /api/mpesa/stkpush",
            "POST /api/mpesa/callback",
        ],
    });
    sendResponse(res, 404, {
        message: `Endpoint not found: ${req.method} ${req.path}`,
        code: "NOT_FOUND",
        availableEndpoints: [
            "GET /",
            "GET /health",
            "GET /api/packages",
            "GET /api/package/:packageName",
            "POST /api/mpesa/stkpush",
            "POST /api/mpesa/callback",
        ],
    }, { requestId: req.id });
});

// Global error handler
app.use((err, req, res, next) => {
    const errorContext = {
        error: err.message,
        type: err.name,
        statusCode: err.statusCode || 500,
    };

    if (process.env.NODE_ENV === "development" && err.stack) {
        errorContext.stack = err.stack;
    }

    log("ERROR", req.id, "Unhandled error in Express", errorContext);

    sendResponse(res, 500, {
        message: "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
    }, { requestId: req.id });
});

/*
=========================================================
SERVER STARTUP
=========================================================
*/

const server = app.listen(PORT, () => {
    const startupInfo = {
        port: PORT,
        environment: NODE_ENV,
        mpesaMode: process.env.MPESA_ENV || "sandbox",
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
    };

    console.log(`\n${"=".repeat(70)}`);
    console.log("🚀 Online Sphere M-Pesa Backend v2.2.0");
    console.log(`${"=".repeat(70)}`);
    console.log(`Port:          ${startupInfo.port}`);
    console.log(`Environment:   ${startupInfo.environment}`);
    console.log(`M-Pesa Mode:   ${startupInfo.mpesaMode}`);
    console.log(`Node Version:  ${startupInfo.nodeVersion}`);
    console.log(`Started:       ${startupInfo.timestamp}`);
    console.log(`${"=".repeat(70)}\n`);

    log("SUCCESS", null, "Server started successfully", startupInfo);
});

// Graceful shutdown handler
process.on("SIGTERM", () => {
    log("INFO", null, "SIGTERM signal received: closing HTTP server");
    server.close(() => {
        log("SUCCESS", null, "HTTP server closed");
        process.exit(0);
    });
});

process.on("SIGINT", () => {
    log("INFO", null, "SIGINT signal received: closing HTTP server");
    server.close(() => {
        log("SUCCESS", null, "HTTP server closed");
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
    log("ERROR", null, "Uncaught exception", {
        error: error.message,
        stack: error.stack,
    });
    process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
    log("ERROR", null, "Unhandled promise rejection", {
        reason: String(reason),
        promise: promise.toString(),
    });
});
