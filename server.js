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
LOGGING UTILITIES
=========================================================
*/

const LOG_LEVELS = {
    ERROR: "❌ ERROR",
    WARN: "⚠️  WARN",
    INFO: "ℹ️  INFO",
    SUCCESS: "✅ SUCCESS",
    DEBUG: "🔍 DEBUG",
};

/**
 * Enhanced logger with request tracking
 * @param {string} level - Log level key
 * @param {string} requestId - Request ID for tracking
 * @param {string} message - Log message
 * @param {object} data - Additional data to log
 */
function log(level, requestId, message, data = {}) {
    const timestamp = new Date().toISOString();
    const levelLabel = LOG_LEVELS[level] || "LOG";
    const requestTag = requestId ? `[${requestId}]` : "[SYSTEM]";
    
    console.log(`[${timestamp}] ${levelLabel} ${requestTag} ${message}`);
    
    if (Object.keys(data).length > 0) {
        console.log(`  └─ ${JSON.stringify(data, null, 2).split("\n").join("\n     ")}`);
    }
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

        log("WARN", null, `CORS violation attempt from origin: ${origin}`);
        callback(new Error("CORS policy violation"));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-Request-ID"],
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
    req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader("X-Request-ID", req.id);
    next();
});

// Request logging middleware with enhanced details
app.use((req, res, next) => {
    const method = req.method.padEnd(6);
    const path = req.path.padEnd(30);
    const userAgent = req.headers["user-agent"] ? `"${req.headers["user-agent"].substring(0, 40)}"` : "unknown";
    
    log("INFO", req.id, `Incoming request`, {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers["user-agent"]?.substring(0, 60) || "unknown",
    });
    
    next();
});

// Empty body validation for POST requests
app.use((req, res, next) => {
    if (req.method === "POST" && (!req.body || Object.keys(req.body).length === 0)) {
        log("WARN", req.id, "Empty POST request body received");
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
VALIDATION FUNCTIONS
=========================================================
*/

/**
 * Normalizes package name to match available packages
 * @param {any} packageName - Package name from request
 * @returns {string} Normalized package name or empty string
 */
function normalizePackageName(packageName) {
    if (typeof packageName !== "string") return "";

    const trimmed = packageName.trim();
    if (!trimmed) return "";

    const match = VALID_PACKAGE_NAMES.find(
        (name) => name.toLowerCase() === trimmed.toLowerCase()
    );

    return match || "";
}

/**
 * Normalizes phone number to 254xxx format
 * @param {any} phone - Phone number from request
 * @returns {string} Normalized phone number or empty string
 */
function normalizePhoneNumber(phone) {
    if (phone === null || phone === undefined) return "";

    let phoneNumber = String(phone)
        .replace(/\s+/g, "")
        .replace(/^\+/, "");

    if (phoneNumber.startsWith("0")) {
        phoneNumber = `254${phoneNumber.substring(1)}`;
    }

    if (phoneNumber.startsWith("254")) {
        return phoneNumber;
    }

    return "";
}

/**
 * Validates Kenyan phone number format (254[17]xxxxxxxx)
 * @param {string} phoneNumber - Normalized phone number
 * @returns {boolean} True if valid, false otherwise
 */
function validatePhoneNumber(phoneNumber) {
    return /^254[17]\d{8}$/.test(phoneNumber);
}

/**
 * Comprehensive validation for STK Push request
 * Returns structured validation result with error details and hints
 * @param {object} body - Request body
 * @returns {object} Validation result with status and details
 */
function validateStkPushRequest(body) {
    const { phone, packageName } = body || {};

    // Validate packageName existence
    if (!packageName) {
        return {
            valid: false,
            error: "Package name is required.",
            hint: `Available packages: ${VALID_PACKAGE_NAMES.join(", ")}`,
            code: "MISSING_PACKAGE",
            statusCode: 400,
        };
    }

    // Validate packageName value
    const normalizedPackage = normalizePackageName(packageName);
    if (!normalizedPackage) {
        return {
            valid: false,
            error: `Invalid package: "${packageName}"`,
            hint: `Use one of: ${VALID_PACKAGE_NAMES.join(", ")}`,
            code: "INVALID_PACKAGE",
            statusCode: 400,
        };
    }

    // Validate phone existence
    if (!phone) {
        return {
            valid: false,
            error: "Phone number is required.",
            hint: "Provide a valid Kenyan M-Pesa number (07xxxxxxxx or 254-7xxxxxxxxx)",
            code: "MISSING_PHONE",
            statusCode: 400,
        };
    }

    // Normalize and validate phone format
    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
        return {
            valid: false,
            error: `Phone number could not be normalized: "${phone}"`,
            hint: "Use format: 07xxxxxxxxx, 01xxxxxxxxx, or +254-7xx-xxx-xxx",
            code: "INVALID_PHONE_FORMAT",
            statusCode: 400,
        };
    }

    // Validate phone passes regex check
    if (!validatePhoneNumber(normalizedPhone)) {
        return {
            valid: false,
            error: `Invalid Kenyan M-Pesa number: ${normalizedPhone}`,
            hint: "Must be 254[1-7]xxxxxxxx (254 + carrier digit 1 or 7 + 8 digits)",
            code: "INVALID_PHONE_VALIDATION",
            statusCode: 400,
        };
    }

    return {
        valid: true,
        error: null,
        packageName: normalizedPackage,
        phone: normalizedPhone,
        statusCode: 200,
    };
}

/**
 * Validates M-Pesa environment configuration
 * Checks for all required environment variables
 * @returns {object} Validation result with config or missing variables
 */
function validateMpesaConfig() {
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
        return {
            valid: false,
            error: `Missing environment variables: ${missing.join(", ")}`,
            missing,
            statusCode: 500,
        };
    }

    return {
        valid: true,
        error: null,
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
 * Fetches Daraja OAuth access token
 * @returns {Promise<string>} Access token
 * @throws {Error} If authentication fails
 */
async function getAccessToken() {
    const configValidation = validateMpesaConfig();
    if (!configValidation.valid) {
        throw new Error(configValidation.error);
    }

    const { consumerKey, consumerSecret } = configValidation.config;
    const credentials = Buffer.from(
        `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    try {
        const response = await fetch(
            `${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
            {
                method: "GET",
                headers: {
                    Authorization: `Basic ${credentials}`,
                    Accept: "application/json",
                },
                timeout: 10000,
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                `OAuth failed: ${errorData.error_description || response.statusText}`
            );
        }

        const data = await response.json();

        if (!data.access_token) {
            throw new Error("No access token in response from Daraja");
        }

        return data.access_token;
    } catch (error) {
        throw new Error(`Authentication failed: ${error.message}`);
    }
}

/**
 * Sends standardized JSON response with timestamp
 * @param {object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {object} data - Response data
 */
function sendResponse(res, statusCode, data) {
    res.status(statusCode).json({
        success: statusCode < 400,
        timestamp: new Date().toISOString(),
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
        version: "2.1.0",
        environment: process.env.MPESA_ENV || "sandbox",
        uptime: process.uptime(),
    });
});

app.get("/health", (req, res) => {
    const configValidation = validateMpesaConfig();
    const status = configValidation.valid ? "healthy" : "degraded";

    log("INFO", req.id, `Health status: ${status}`, {
        environment: process.env.MPESA_ENV || "sandbox",
        configured: configValidation.valid,
    });

    sendResponse(res, configValidation.valid ? 200 : 503, {
        status,
        message: configValidation.valid
            ? "Service is operational"
            : "Service configuration incomplete",
        environment: process.env.MPESA_ENV || "sandbox",
    });
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
        packages,
    });
});

app.get("/api/package/:packageName", (req, res) => {
    const packageKey = normalizePackageName(req.params.packageName);

    if (!packageKey) {
        log("WARN", req.id, `Invalid package requested: "${req.params.packageName}"`);
        return sendResponse(res, 400, {
            message: `Invalid package: "${req.params.packageName}"`,
            hint: `Use one of: ${VALID_PACKAGE_NAMES.join(", ")}`,
            availablePackages: VALID_PACKAGE_NAMES,
            code: "INVALID_PACKAGE",
        });
    }

    log("INFO", req.id, `Package info retrieved: ${packageKey}`, {
        package: packageKey,
        amount: PACKAGES[packageKey],
    });

    sendResponse(res, 200, {
        message: "Package information retrieved",
        package: packageKey,
        amount: PACKAGES[packageKey],
        currency: "KES",
    });
});

/*
=========================================================
ROUTES: M-PESA STK PUSH
=========================================================
*/

app.post("/api/mpesa/stkpush", async (req, res) => {
    try {
        // Validate request body
        const validation = validateStkPushRequest(req.body);
        if (!validation.valid) {
            log("WARN", req.id, `Validation failed: ${validation.code}`, {
                error: validation.error,
                hint: validation.hint,
            });
            return sendResponse(res, validation.statusCode, {
                message: validation.error,
                hint: validation.hint,
                code: validation.code,
            });
        }

        const { packageName, phone } = validation;
        const amount = PACKAGES[packageName];

        // Validate M-Pesa configuration
        const configValidation = validateMpesaConfig();
        if (!configValidation.valid) {
            log("ERROR", req.id, "M-Pesa config validation failed", {
                error: configValidation.error,
                missing: configValidation.missing,
            });
            return sendResponse(res, 503, {
                message: "M-Pesa service is temporarily unavailable",
                code: "CONFIG_ERROR",
            });
        }

        const { shortcode, passkey, callbackUrl } = configValidation.config;

        // Get access token
        let accessToken;
        try {
            accessToken = await getAccessToken();
            log("SUCCESS", req.id, "Access token obtained");
        } catch (error) {
            log("ERROR", req.id, "Failed to get access token", {
                error: error.message,
            });
            return sendResponse(res, 503, {
                message: "Failed to authenticate with M-Pesa. Please try again.",
                code: "AUTH_FAILED",
            });
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
        const response = await fetch(
            `${DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(stkPayload),
                timeout: 15000,
            }
        );

        const data = await response.json();

        if (!response.ok || data.ResponseCode !== "0") {
            log("WARN", req.id, "STK Push rejected by Daraja", {
                responseCode: data.ResponseCode,
                responseDescription: data.ResponseDescription,
                httpStatus: response.status,
            });

            return sendResponse(res, 502, {
                message:
                    data.ResponseDescription ||
                    "M-Pesa rejected the request. Please verify your details and try again.",
                responseCode: data.ResponseCode,
                code: "SAFARICOM_ERROR",
            });
        }

        log("SUCCESS", req.id, "STK Push sent successfully", {
            merchantRequestID: data.MerchantRequestID,
            checkoutRequestID: data.CheckoutRequestID,
            package: packageName,
            amount,
        });

        return sendResponse(res, 200, {
            message: "STK Push sent successfully. Check your phone and enter your M-Pesa PIN.",
            package: packageName,
            amount,
            currency: "KES",
            phone: maskPhoneNumber(phone),
            merchantRequestID: data.MerchantRequestID,
            checkoutRequestID: data.CheckoutRequestID,
        });
    } catch (error) {
        log("ERROR", req.id, "Unexpected error in STK Push", {
            error: error.message,
            stack: error.stack,
        });
        return sendResponse(res, 500, {
            message: "An unexpected error occurred while processing your request.",
            code: "INTERNAL_ERROR",
        });
    }
});

/*
=========================================================
ROUTES: M-PESA CALLBACK
=========================================================
*/

app.post("/api/mpesa/callback", (req, res) => {
    const callback = req.body?.Body?.stkCallback;

    log("INFO", req.id, "M-Pesa callback received");

    if (!callback) {
        log("WARN", req.id, "Invalid callback structure - missing stkCallback");
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
        });

        /*
        TODO: Save payment to database
        - Store MerchantRequestID, CheckoutRequestID
        - Link to user account
        - Activate membership
        - Send confirmation email/SMS
        */
    } else {
        log("WARN", req.id, "Payment failed", {
            resultCode: ResultCode,
            resultDescription: ResultDesc,
        });
    }

    // Always return success to Safaricom
    res.json({
        ResultCode: 0,
        ResultDesc: "Accepted",
    });
});

/*
=========================================================
ERROR HANDLERS
=========================================================
*/

// 404 Handler
app.use((req, res) => {
    log("WARN", req.id, `Endpoint not found: ${req.method} ${req.path}`);
    sendResponse(res, 404, {
        message: `Endpoint not found: ${req.method} ${req.path}`,
        code: "NOT_FOUND",
    });
});

// Global error handler
app.use((err, req, res, next) => {
    log("ERROR", req.id, "Unhandled error in Express", {
        error: err.message,
        stack: err.stack,
    });

    sendResponse(res, 500, {
        message: "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
    });
});

/*
=========================================================
SERVER STARTUP
=========================================================
*/

app.listen(PORT, () => {
    console.log(`\n${"=".repeat(70)}`);
    console.log("🚀 Online Sphere M-Pesa Backend v2.1.0");
    console.log(`${"=".repeat(70)}`);
    console.log(`Port:        ${PORT}`);
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`M-Pesa Mode: ${process.env.MPESA_ENV || "sandbox"}`);
    console.log(`Started:     ${new Date().toISOString()}`);
    console.log(`${"=".repeat(70)}\n`);

    log("SUCCESS", null, "Server started successfully", {
        port: PORT,
        environment: NODE_ENV,
        mpesaMode: process.env.MPESA_ENV || "sandbox",
    });
});
