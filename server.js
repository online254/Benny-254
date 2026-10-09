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

        console.warn(`CORS violation from origin: ${origin}`);
        callback(new Error("CORS policy violation"));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-Request-ID"],
    maxAge: 3600, // 1 hour
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

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${req.id}] ${req.method} ${req.path}`);
    next();
});

// Request validation middleware
app.use(express.json());
app.use((req, res, next) => {
    if (req.method === "POST" && Object.keys(req.body).length === 0) {
        return res.status(400).json({
            success: false,
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
 * Validates request body for STK Push endpoint
 * @param {object} body - Request body
 * @returns {object} { valid: boolean, error?: string, code?: string, packageName?: string, phone?: string }
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
 * @returns {object} { valid: boolean, error?: string, missing?: string[], config?: object }
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
 * Creates timestamp in YYYYMMDDHHmmss format for M-Pesa
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
 * Fetches access token from Daraja API
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
        console.error("Access token error:", error);
        throw new Error(`Authentication failed: ${error.message}`);
    }
}

/**
 * Sends formatted JSON response
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
ROUTES: HEALTH CHECK
=========================================================
*/

app.get("/", (req, res) => {
    sendResponse(res, 200, {
        message: "Online Sphere Daraja backend is running",
        version: "2.0.0",
        environment: process.env.MPESA_ENV || "sandbox",
        uptime: process.uptime(),
    });
});

app.get("/health", (req, res) => {
    const configValidation = validateMpesaConfig();
    const status = configValidation.valid ? "healthy" : "degraded";

    sendResponse(res, configValidation.valid ? 200 : 503, {
        status,
        message: configValidation.valid
            ? "Service is operational"
            : "Service configuration incomplete",
        environment: process.env.MPESA_ENV || "sandbox",
        timestamp: new Date().toISOString(),
    });
});

/*
=========================================================
ROUTES: PACKAGE PRICING
=========================================================
*/

app.get("/api/packages", (req, res) => {
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
        return sendResponse(res, 400, {
            message: `Invalid package: "${req.params.packageName}"`,
            availablePackages: VALID_PACKAGE_NAMES,
            code: "INVALID_PACKAGE",
        });
    }

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
            console.error("Config error:", configValidation.error);
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
        } catch (error) {
            console.error("Auth error:", error.message);
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

        console.log(`[${req.id}] STK Push initiated`, {
            package: packageName,
            amount,
            phone: phone.slice(-4).padStart(phone.length, "*"),
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
            console.warn(`[${req.id}] STK Push rejected`, {
                code: data.ResponseCode,
                description: data.ResponseDescription,
            });

            return sendResponse(res, 502, {
                message:
                    data.ResponseDescription ||
                    "M-Pesa rejected the request. Please try again.",
                responseCode: data.ResponseCode,
                code: "SAFARICOM_ERROR",
            });
        }

        console.log(`[${req.id}] STK Push successful`, {
            merchantRequestID: data.MerchantRequestID,
        });

        return sendResponse(res, 200, {
            message: "STK Push sent successfully",
            hint: "Check your phone and enter your M-Pesa PIN",
            package: packageName,
            amount,
            currency: "KES",
            phone: phone.slice(-4).padStart(phone.length, "*"),
            merchantRequestID: data.MerchantRequestID,
            checkoutRequestID: data.CheckoutRequestID,
        });
    } catch (error) {
        console.error(`[${req.id}] Unexpected error:`, error);
        return sendResponse(res, 500, {
            message: "An unexpected error occurred",
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

    console.log(`[${req.id}] Callback received`);

    if (!callback) {
        console.warn(`[${req.id}] Invalid callback structure`);
        return res.json({
            ResultCode: 0,
            ResultDesc: "Accepted",
        });
    }

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc } =
        callback;

    console.log(`[${req.id}] Callback details`, {
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

        console.log(`[${req.id}] ✅ Payment successful`, {
            amount: paymentData.Amount,
            receiptNumber: paymentData.ReceiptNumber,
        });

        /*
        TODO: Save payment to database
        - Store MerchantRequestID, CheckoutRequestID
        - Link to user account
        - Activate membership
        - Send confirmation email/SMS
        */
    } else {
        console.log(`[${req.id}] ❌ Payment failed: ${ResultDesc}`);
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
    sendResponse(res, 404, {
        message: `Endpoint not found: ${req.method} ${req.path}`,
        code: "NOT_FOUND",
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(`[${req.id}] Unhandled error:`, err);

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
    console.log(`\n${"=".repeat(60)}`);
    console.log("🚀 Online Sphere M-Pesa Backend");
    console.log(`${"=".repeat(60)}`);
    console.log(`Port:        ${PORT}`);
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`M-Pesa Mode: ${process.env.MPESA_ENV || "sandbox"}`);
    console.log(`Started:     ${new Date().toISOString()}`);
    console.log(`${"=".repeat(60)}\n`);
});
