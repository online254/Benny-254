require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

app.use(cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));

const PACKAGES = Object.freeze({
    Bronze: 1000,
    Silver: 1750,
    Gold: 2500
});

const requiredEnv = [
    "MPESA_CONSUMER_KEY",
    "MPESA_CONSUMER_SECRET",
    "MPESA_SHORTCODE",
    "MPESA_PASSKEY",
    "MPESA_CALLBACK_URL"
];

function missingConfiguration() {
    return requiredEnv.filter(
        key => !process.env[key]
    );
}

function normalizePhone(phone) {
    let value = String(phone || "").replace(/\s+/g, "");

    if (value.startsWith("+")) {
        value = value.slice(1);
    }

    if (value.startsWith("0")) {
        value = "254" + value.slice(1);
    } else if (value.startsWith("7") || value.startsWith("1")) {
        value = "254" + value;
    }

    if (!/^254[71]\d{8}$/.test(value)) {
        return null;
    }

    return value;
}

function getBaseUrl() {
    return process.env.MPESA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";
}

async function getAccessToken() {
    const key = process.env.MPESA_CONSUMER_KEY;
    const secret = process.env.MPESA_CONSUMER_SECRET;

    const credentials = Buffer.from(
        `${key}:${secret}`
    ).toString("base64");

    const response = await fetch(
        `${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
        {
            method: "GET",
            headers: {
                Authorization: `Basic ${credentials}`
            },
            signal: AbortSignal.timeout(20000)
        }
    );

    const data = await response.json();

    if (!response.ok || !data.access_token) {
        throw new Error("M-Pesa authentication failed");
    }

    return data.access_token;
}

function createPassword(timestamp) {
    const raw =
        process.env.MPESA_SHORTCODE +
        process.env.MPESA_PASSKEY +
        timestamp;

    return Buffer.from(raw).toString("base64");
}

function getTimestamp() {
    const date = new Date();

    const pad = value => String(value).padStart(2, "0");

    return date.getFullYear() +
        pad(date.getMonth() + 1) +
        pad(date.getDate()) +
        pad(date.getHours()) +
        pad(date.getMinutes()) +
        pad(date.getSeconds());
}

function safeError(error) {
    console.error("[Online Sphere]", error.message);
    return "The payment request could not be completed. Please try again.";
}

/*
=========================================================
HOME / API STATUS
=========================================================
*/

app.get("/", (req, res) => {
    res.json({
        success: true,
        service: "Online Sphere M-Pesa Backend",
        status: "running",
        endpoints: [
            "GET /health",
            "GET /api/packages",
            "POST /api/mpesa/stkpush",
            "POST /api/mpesa/callback"
        ]
    });
});

/*
=========================================================
HEALTH CHECK
=========================================================
*/

app.get("/health", (req, res) => {
    const missing = missingConfiguration();

    res.status(missing.length ? 503 : 200).json({
        success: missing.length === 0,
        service: "Online Sphere Backend",
        status: missing.length ? "configuration_incomplete" : "ready",
        mpesaEnvironment: process.env.MPESA_ENV || "sandbox",
        missingConfiguration: missing
    });
});

/*
=========================================================
MEMBERSHIP PACKAGES
=========================================================
*/

app.get("/api/packages", (req, res) => {
    res.json({
        success: true,
        currency: "KES",
        packages: Object.entries(PACKAGES).map(
            ([name, price]) => ({
                name,
                price
            })
        )
    });
});

/*
=========================================================
M-PESA STK PUSH
Expected JSON:
{
  "phone": "2547XXXXXXXX",
  "packageName": "Bronze"
}
=========================================================
*/

app.post("/api/mpesa/stkpush", async (req, res) => {
    const requestId = crypto.randomUUID();

    try {
        const missing = missingConfiguration();

        if (missing.length) {
            return res.status(503).json({
                success: false,
                requestId,
                message: "Payment service is not fully configured."
            });
        }

        const phone = normalizePhone(req.body.phone);
        const packageName = String(
            req.body.packageName || ""
        ).trim();

        if (!phone) {
            return res.status(400).json({
                success: false,
                requestId,
                message: "Enter a valid Kenyan M-Pesa phone number."
            });
        }

        if (!Object.prototype.hasOwnProperty.call(
            PACKAGES,
            packageName
        )) {
            return res.status(400).json({
                success: false,
                requestId,
                message: "Select a valid membership package."
            });
        }

        const amount = PACKAGES[packageName];
        const timestamp = getTimestamp();
        const token = await getAccessToken();

        const payload = {
            BusinessShortCode: process.env.MPESA_SHORTCODE,
            Password: createPassword(timestamp),
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: phone,
            PartyB: process.env.MPESA_SHORTCODE,
            PhoneNumber: phone,
            CallBackURL: process.env.MPESA_CALLBACK_URL,
            AccountReference: `OS-${packageName}`,
            TransactionDesc: `Online Sphere ${packageName}`
        };

        const response = await fetch(
            `${getBaseUrl()}/mpesa/stkpush/v1/processrequest`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(30000)
            }
        );

        const data = await response.json();

        if (!response.ok || data.ResponseCode !== "0") {
            console.error(
                `[${requestId}] STK request rejected`,
                {
                    status: response.status,
                    responseCode: data.ResponseCode,
                    errorCode: data.errorCode
                }
            );

            return res.status(502).json({
                success: false,
                requestId,
                message: "M-Pesa did not accept the payment request.",
                details: data.errorMessage ||
                    data.ResponseDescription ||
                    "Check your M-Pesa configuration and try again."
            });
        }

        console.log(`[${requestId}] STK request accepted`, {
            packageName,
            amount,
            checkoutRequestId: data.CheckoutRequestID
        });

        return res.status(200).json({
            success: true,
            requestId,
            message: "STK Push sent. Check your phone to complete payment.",
            packageName,
            amount,
            currency: "KES",
            merchantRequestId: data.MerchantRequestID,
            checkoutRequestId: data.CheckoutRequestID,
            customerMessage: data.CustomerMessage
        });

    } catch (error) {
        console.error(`[${requestId}] STK error`, error.message);

        return res.status(502).json({
            success: false,
            requestId,
            message: safeError(error)
        });
    }
});

/*
=========================================================
M-PESA CALLBACK
IMPORTANT:
A callback alone does not update membership or a wallet.
Persist and verify successful payments before granting access.
=========================================================
*/

app.post("/api/mpesa/callback", (req, res) => {
    const callback = req.body?.Body?.stkCallback;

    if (!callback) {
        return res.status(400).json({
            ResultCode: 1,
            ResultDesc: "Invalid callback payload"
        });
    }

    const resultCode = Number(callback.ResultCode);

    console.log("[M-Pesa callback]", {
        merchantRequestId: callback.MerchantRequestID,
        checkoutRequestId: callback.CheckoutRequestID,
        resultCode,
        resultDescription: callback.ResultDesc
    });

    if (resultCode === 0) {
        const items =
            callback.CallbackMetadata?.Item || [];

        const metadata = {};

        for (const item of items) {
            if (item.Name) {
                metadata[item.Name] = item.Value ?? null;
            }
        }

        console.log("[M-Pesa payment result]", {
            amount: metadata.Amount,
            receiptNumber: metadata.MpesaReceiptNumber,
            transactionDate: metadata.TransactionDate,
            phoneNumber: metadata.PhoneNumber
        });

        /*
         * TODO: Save the verified payment in your database.
         * Match CheckoutRequestID to a stored pending order.
         * Verify package, amount, phone, and receipt.
         * Process each payment only once.
         * Never grant membership from browser data alone.
         */
    }

    return res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Callback received successfully"
    });
});

/*
=========================================================
UNKNOWN ROUTES AND ERROR HANDLING
=========================================================
*/

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found."
    });
});

app.use((err, req, res, next) => {
    console.error("[API error]", err.message);

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({
        success: false,
        message: "An internal server error occurred."
    });
});

app.listen(PORT, () => {
    console.log(`Online Sphere backend running on port ${PORT}`);
});
