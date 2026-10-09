require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

/*
=========================================================
CORS CONFIGURATION
=========================================================
*/

const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001").split(",");
        const normalizedOrigins = allowedOrigins.map((item) => item.trim()).filter(Boolean);

        if (!origin || normalizedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`CORS policy: origin ${origin} is not allowed.`));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Middleware to log incoming requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

const PORT = process.env.PORT || 3000;

/*
=========================================================
ONLINE SPHERE MEMBERSHIP PRICES
=========================================================
*/

const PACKAGES = {
    Bronze: 1000,
    Silver: 1750,
    Gold: 2500,
};

const VALID_PACKAGE_NAMES = Object.keys(PACKAGES);

/*
=========================================================
VALIDATION FUNCTIONS
=========================================================
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

function validatePhoneNumber(phoneNumber) {
    return /^254[17]\d{8}$/.test(phoneNumber);
}

function validateStkPushRequest(body) {
    const { phone, packageName } = body || {};

    if (!packageName) {
        return {
            valid: false,
            error: "Package name is required. Available: Bronze, Silver, Gold.",
            code: "MISSING_PACKAGE",
        };
    }

    const normalizedPackage = normalizePackageName(packageName);
    if (!normalizedPackage) {
        return {
            valid: false,
            error: `"${packageName}" is not a valid package. Available: ${VALID_PACKAGE_NAMES.join(", ")}.`,
            code: "INVALID_PACKAGE",
        };
    }

    if (!phone) {
        return {
            valid: false,
            error: "Phone number is required.",
            code: "MISSING_PHONE",
        };
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
        return {
            valid: false,
            error: `"${phone}" could not be normalized. Use format: 07xxxxxxxxx, 01xxxxxxxxx, or +254-7xx-xxx-xxx.`,
            code: "INVALID_PHONE_FORMAT",
        };
    }

    if (!validatePhoneNumber(normalizedPhone)) {
        return {
            valid: false,
            error: `"${normalizedPhone}" is not a valid Kenyan M-Pesa number. Must match: 254[1-7]xxxxxxxx (12 digits).`,
            code: "INVALID_PHONE_VALIDATION",
        };
    }

    return {
        valid: true,
        error: null,
        packageName: normalizedPackage,
        phone: normalizedPhone,
    };
}

function validateMpesaConfig() {
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const callbackUrl = process.env.MPESA_CALLBACK_URL;
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

    const missing = [];

    if (!shortcode) missing.push("MPESA_SHORTCODE");
    if (!passkey) missing.push("MPESA_PASSKEY");
    if (!callbackUrl) missing.push("MPESA_CALLBACK_URL");
    if (!consumerKey) missing.push("MPESA_CONSUMER_KEY");
    if (!consumerSecret) missing.push("MPESA_CONSUMER_SECRET");

    if (missing.length > 0) {
        return {
            valid: false,
            error: `Missing required M-Pesa environment variables: ${missing.join(", ")}.`,
            missing,
        };
    }

    return {
        valid: true,
        error: null,
        config: { shortcode, passkey, callbackUrl, consumerKey, consumerSecret },
    };
}

/*
=========================================================
DARAJA URLs
=========================================================
*/

const DARAJA_BASE_URL =
    process.env.MPESA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

/*
=========================================================
HELPER: GET DARAJA ACCESS TOKEN
=========================================================
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
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Daraja OAuth error:", data);
            throw new Error(
                `Authentication failed: ${data.error_description || "Unknown error"}`
            );
        }

        if (!data.access_token) {
            console.error("No access token in response:", data);
            throw new Error("No access token received from Daraja.");
        }

        return data.access_token;
    } catch (error) {
        console.error("Failed to get access token:", error);
        throw new Error(`Failed to authenticate with M-Pesa: ${error.message}`);
    }
}

/*
=========================================================
HELPER: CREATE STK TIMESTAMP
=========================================================
*/

function createTimestamp() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/*
=========================================================
HEALTH CHECK
=========================================================
*/

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Online Sphere Daraja backend is running.",
        environment: process.env.MPESA_ENV || "sandbox",
        timestamp: new Date().toISOString(),
    });
});

/*
=========================================================
CHECK PACKAGE PRICE
=========================================================
*/

app.get("/api/package/:packageName", (req, res) => {
    const packageKey = normalizePackageName(req.params.packageName);

    if (!packageKey) {
        return res.status(400).json({
            success: false,
            message: `Invalid package "${req.params.packageName}". Available packages: ${VALID_PACKAGE_NAMES.join(", ")}.`,
            availablePackages: VALID_PACKAGE_NAMES,
            code: "INVALID_PACKAGE",
        });
    }

    res.json({
        success: true,
        package: packageKey,
        amount: PACKAGES[packageKey],
        currency: "KES",
    });
});

/*
=========================================================
REAL MPESA STK PUSH
=========================================================
*/

app.post("/api/mpesa/stkpush", async (req, res) => {
    try {
        const validation = validateStkPushRequest(req.body);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.error,
                code: validation.code,
            });
        }

        const { packageName, phone } = validation;
        const amount = PACKAGES[packageName];

        const configValidation = validateMpesaConfig();
        if (!configValidation.valid) {
            console.error("M-Pesa configuration error:", configValidation.error);
            return res.status(500).json({
                success: false,
                message: "M-Pesa service is not properly configured.",
                code: "CONFIG_ERROR",
            });
        }

        const { shortcode, passkey, callbackUrl } = configValidation.config;

        let accessToken;
        try {
            accessToken = await getAccessToken();
        } catch (error) {
            console.error("Authentication error:", error);
            return res.status(503).json({
                success: false,
                message: "Unable to authenticate with M-Pesa service. Please try again later.",
                code: "AUTH_FAILED",
            });
        }

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
            AccountReference: `ONLINE-SPHERE-${packageName}`,
            TransactionDesc: `Online Sphere ${packageName} Membership`,
        };

        console.log("Sending STK Push:", {
            package: packageName,
            amount,
            phone,
            timestamp,
            environment: process.env.MPESA_ENV || "sandbox",
        });

        const response = await fetch(
            `${DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(stkPayload),
            }
        );

        const data = await response.json();

        console.log("Daraja response:", {
            status: response.status,
            code: data.ResponseCode,
            description: data.ResponseDescription,
        });

        if (!response.ok || data.ResponseCode !== "0") {
            return res.status(502).json({
                success: false,
                message:
                    data.ResponseDescription ||
                    "M-Pesa service rejected the request. Please verify your details and try again.",
                responseCode: data.ResponseCode,
                responseDescription: data.ResponseDescription,
                code: "SAFARICOM_ERROR",
            });
        }

        return res.json({
            success: true,
            message: "STK Push sent successfully. Check your phone and enter your M-Pesa PIN.",
            package: packageName,
            amount,
            currency: "KES",
            phone,
            merchantRequestID: data.MerchantRequestID,
            checkoutRequestID: data.CheckoutRequestID,
            responseCode: data.ResponseCode,
            responseDescription: data.ResponseDescription,
        });
    } catch (error) {
        console.error("STK Push error:", error);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while processing your request.",
            error: error.message,
            code: "INTERNAL_ERROR",
        });
    }
});

/*
=========================================================
MPESA CALLBACK
=========================================================
*/

app.post("/api/mpesa/callback", (req, res) => {
    console.log("\n================================");
    console.log("M-PESA CALLBACK RECEIVED");
    console.log("================================");
    console.log("Timestamp:", new Date().toISOString());

    const callback = req.body?.Body?.stkCallback;

    if (!callback) {
        console.log("⚠️  Invalid callback structure. Expected Body.stkCallback.");
        return res.json({
            ResultCode: 0,
            ResultDesc: "Accepted",
        });
    }

    console.log("MerchantRequestID:", callback.MerchantRequestID);
    console.log("CheckoutRequestID:", callback.CheckoutRequestID);
    console.log("ResultCode:", callback.ResultCode);
    console.log("ResultDesc:", callback.ResultDesc);

    if (callback.ResultCode === 0) {
        const metadata = callback.CallbackMetadata?.Item || [];
        const paymentData = {};

        metadata.forEach((item) => {
            paymentData[item.Name] = item.Value;
        });

        console.log("✅ SUCCESSFUL PAYMENT:");
        console.log(paymentData);

        /*
        TODO: Save payment to database
        - Store MerchantRequestID, CheckoutRequestID
        - Link to user account
        - Activate membership
        - Send confirmation email/SMS
        */
    } else {
        console.log("❌ Payment was not completed.");
        console.log("Result Description:", callback.ResultDesc);
    }

    res.json({
        ResultCode: 0,
        ResultDesc: "Accepted",
    });
});

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Endpoint not found: ${req.method} ${req.path}`,
        code: "NOT_FOUND",
    });
});

app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);

    res.status(500).json({
        success: false,
        message: "An unexpected server error occurred.",
        code: "INTERNAL_SERVER_ERROR",
    });
});

app.listen(PORT, () => {
    console.log(`\n${"=".repeat(50)}`);
    console.log("🚀 Online Sphere Server Started");
    console.log(`${"=".repeat(50)}`);
    console.log(`Port: ${PORT}`);
    console.log(`M-Pesa Environment: ${process.env.MPESA_ENV || "sandbox"}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`${"=".repeat(50)}\n`);
});
