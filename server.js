require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const db = require("./database/database.db.js");

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

// MEMBERSHIP PACKAGES
const PACKAGES = Object.freeze({
    Bronze: 1000,
    Silver: 1750,
    Gold: 2500
});

// M-PESA CONFIGURATION
const requiredEnv = [
    "MPESA_CONSUMER_KEY",
    "MPESA_CONSUMER_SECRET",
    "MPESA_SHORTCODE",
    "MPESA_PASSKEY",
    "MPESA_CALLBACK_URL"
];

function missingConfiguration() {
    return requiredEnv.filter(key => !process.env[key]);
}

// PHONE NUMBER NORMALIZATION
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

    return /^254[71]\d{8}$/.test(value) ? value : null;
}

// SAFARICOM API ENVIRONMENT
function getBaseUrl() {
    return process.env.MPESA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";
}

// GET M-PESA ACCESS TOKEN
async function getAccessToken() {
    const credentials = Buffer.from(
        `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString("base64");

    const response = await fetch(
        `${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
        {
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

// M-PESA TIMESTAMP
function getTimestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");

    return d.getFullYear() +
        pad(d.getMonth() + 1) +
        pad(d.getDate()) +
        pad(d.getHours()) +
        pad(d.getMinutes()) +
        pad(d.getSeconds());
}

// M-PESA PASSWORD
function createPassword(timestamp) {
    return Buffer.from(
        process.env.MPESA_SHORTCODE +
        process.env.MPESA_PASSKEY +
        timestamp
    ).toString("base64");
}

// UPDATE PAYMENT ATTEMPT
function updateAttempt(requestId, status) {
    db.prepare(`
        UPDATE payment_attempts
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE request_id = ?
    `).run(status, requestId);
}

// HOME
app.get("/", (req, res) => {
    res.json({
        success: true,
        service: "Online Sphere Backend",
        status: "running",
        endpoints: [
            "GET /health",
            "GET /api/packages",
            "POST /api/mpesa/stkpush",
            "POST /api/mpesa/callback",
            "POST /api/ai/chat"
        ]
    });
});

// HEALTH CHECK
app.get("/health", (req, res) => {
    const missing = missingConfiguration();

    res.status(missing.length ? 503 : 200).json({
        success: missing.length === 0,
        service: "Online Sphere Backend",
        status: missing.length ? "configuration_incomplete" : "ready",
        mpesaEnvironment: process.env.MPESA_ENV || "sandbox",
        database: "connected",
        missingConfiguration: missing
    });
});

// MEMBERSHIP PACKAGES
app.get("/api/packages", (req, res) => {
    res.json({
        success: true,
        currency: "KES",
        packages: Object.entries(PACKAGES).map(([name, price]) => ({
            name,
            price
        }))
    });
});

// M-PESA STK PUSH
app.post("/api/mpesa/stkpush", async (req, res) => {
    const requestId = crypto.randomUUID();
    let attemptCreated = false;

    try {
        const missing = missingConfiguration();

        if (missing.length) {
            return res.status(503).json({
                success: false,
                requestId,
                message: "Payment service is not fully configured."
            });
        }

        const phone = normalizePhone(req.body?.phone);
        const packageName = String(
            req.body?.packageName || ""
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

        // Amount is controlled by the backend, not the browser.
        const amount = PACKAGES[packageName];

        db.prepare(`
            INSERT INTO payment_attempts
                (request_id, phone, package_name, amount, status)
            VALUES (?, ?, ?, ?, 'pending')
        `).run(requestId, phone, packageName, amount);

        attemptCreated = true;

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
            updateAttempt(requestId, "rejected");

            return res.status(502).json({
                success: false,
                requestId,
                message: "M-Pesa did not accept the payment request.",
                details: data.errorMessage ||
                    data.ResponseDescription ||
                    "Check your M-Pesa configuration and try again."
            });
        }

        db.prepare(`
            UPDATE payment_attempts
            SET merchant_request_id = ?,
                checkout_request_id = ?,
                status = 'stk_sent',
                updated_at = CURRENT_TIMESTAMP
            WHERE request_id = ?
        `).run(
            data.MerchantRequestID || null,
            data.CheckoutRequestID || null,
            requestId
        );

        console.log(`[${requestId}] STK request accepted`, {
            packageName,
            amount,
            checkoutRequestId: data.CheckoutRequestID
        });

        return res.json({
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
        console.error(`[${requestId}] STK error:`, error.message);

        if (attemptCreated) {
            try {
                updateAttempt(requestId, "request_error");
            } catch (dbError) {
                console.error(
                    "Could not update payment attempt:",
                    dbError.message
                );
            }
        }

        return res.status(502).json({
            success: false,
            requestId,
            message: "The payment request could not be completed. Check the service logs before retrying."
        });
    }
});

// M-PESA CALLBACK
app.post("/api/mpesa/callback", (req, res) => {
    const callback = req.body?.Body?.stkCallback;

    if (!callback || !callback.CheckoutRequestID) {
        return res.status(400).json({
            ResultCode: 1,
            ResultDesc: "Invalid callback payload"
        });
    }

    try {
        const attempt = db.prepare(`
            SELECT * FROM payment_attempts
            WHERE checkout_request_id = ?
        `).get(callback.CheckoutRequestID);

        if (!attempt) {
            console.error("Unmatched M-Pesa callback", {
                checkoutRequestId: callback.CheckoutRequestID
            });

            return res.json({
                ResultCode: 0,
                ResultDesc: "Callback received for review"
            });
        }

        if (["paid", "paid_unlinked", "review"].includes(attempt.status)) {
            return res.json({
                ResultCode: 0,
                ResultDesc: "Callback already processed or under review"
            });
        }

        const resultCode = Number(callback.ResultCode);

        if (resultCode !== 0) {
            db.prepare(`
                UPDATE payment_attempts
                SET status = 'failed',
                    result_code = ?,
                    result_description = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                resultCode,
                String(callback.ResultDesc || "Payment failed"),
                attempt.id
            );

            return res.json({
                ResultCode: 0,
                ResultDesc: "Payment failure recorded"
            });
        }

        const items = callback.CallbackMetadata?.Item || [];
        const metadata = {};

        for (const item of items) {
            if (item.Name) {
                metadata[item.Name] = item.Value ?? null;
            }
        }

        const paidAmount = Number(metadata.Amount);
        const receipt = String(
            metadata.MpesaReceiptNumber || ""
        ).trim();
        const paidPhone = normalizePhone(metadata.PhoneNumber);

        const validPayment =
            paidAmount === attempt.amount &&
            paidAmount === PACKAGES[attempt.package_name] &&
            paidPhone === attempt.phone &&
            /^[A-Z0-9]{6,20}$/.test(receipt);

        if (!validPayment) {
            db.prepare(`
                UPDATE payment_attempts
                SET status = 'review',
                    result_code = ?,
                    result_description = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                resultCode,
                "Payment details did not match the original request",
                attempt.id
            );

            console.error("M-Pesa payment requires review", {
                requestId: attempt.request_id,
                checkoutRequestId: attempt.checkout_request_id
            });

            return res.json({
                ResultCode: 0,
                ResultDesc: "Payment received for review"
            });
        }

        const users = db.prepare(
            "SELECT id, phone FROM users"
        ).all();

        const user = users.find(
            u => normalizePhone(u.phone) === attempt.phone
        );

        const account = user
            ? db.prepare(
                "SELECT id FROM accounts WHERE user_id = ?"
            ).get(user.id)
            : null;

        const transaction = db.transaction(() => {
            if (!user || !account) {
                db.prepare(`
                    UPDATE payment_attempts
                    SET status = 'paid_unlinked',
                        mpesa_receipt = ?,
                        result_code = ?,
                        result_description = ?,
                        transaction_date = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(
                    receipt,
                    resultCode,
                    String(callback.ResultDesc || "Success"),
                    metadata.TransactionDate == null
                        ? null
                        : String(metadata.TransactionDate),
                    attempt.id
                );

                return "paid_unlinked";
            }

            db.prepare(`
                INSERT INTO transactions
                    (user_id, account_id, type, amount, status,
                     reference, description)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                user.id,
                account.id,
                "membership_payment",
                attempt.amount,
                "completed",
                receipt,
                `Online Sphere ${attempt.package_name} membership`
            );

            db.prepare(`
                UPDATE accounts
                SET package = ?,
                    activation_fee = ?,
                    status = 'active',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            `).run(
                attempt.package_name,
                attempt.amount,
                account.id,
                user.id
            );

            db.prepare(`
                UPDATE payment_attempts
                SET status = 'paid',
                    mpesa_receipt = ?,
                    result_code = ?,
                    result_description = ?,
                    transaction_date = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                receipt,
                resultCode,
                String(callback.ResultDesc || "Success"),
                metadata.TransactionDate == null
                    ? null
                    : String(metadata.TransactionDate),
                attempt.id
            );

            return "paid";
        });

        const outcome = transaction();

        console.log("M-Pesa callback processed", {
            requestId: attempt.request_id,
            outcome
        });

        return res.json({
            ResultCode: 0,
            ResultDesc: "Callback processed"
        });

    } catch (error) {
        console.error(
            "M-Pesa callback processing error:",
            error.message
        );

        return res.json({
            ResultCode: 0,
            ResultDesc: "Callback received for investigation"
        });
    }
});

// ONLINE SPHERE AI CHAT
// This route must stay above the 404 handler.
app.post("/api/ai/chat", async (req, res) => {
    try {
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            return res.status(503).json({
                success: false,
                message: "Online Sphere AI is not configured."
            });
        }

        const message =
            typeof req.body?.message === "string"
                ? req.body.message.trim()
                : "";

        if (!message) {
            return res.status(400).json({
                success: false,
                message: "Please enter a message."
            });
        }

        if (message.length > 2000) {
            return res.status(413).json({
                success: false,
                message: "Please keep your message under 2000 characters."
            });
        }

        const OpenAI = require("openai");

        const client = new OpenAI({
            apiKey,
            timeout: 30000,
            maxRetries: 1
        });

        const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

        const response = await client.responses.create({
            model,
            instructions:
                "You are Online Sphere AI, a helpful digital assistant for Online Sphere. " +
                "Help users understand website navigation, digital skills, opportunity categories, " +
                "membership information, and online safety. Be friendly, clear, and honest. " +
                "Never invent available tasks, member statistics, payments, testimonials, or job offers. " +
                "Never guarantee earnings, employment, or payment approval. " +
                "Explain that opportunities depend on actual published listings and their requirements. " +
                "Never request passwords, API keys, or M-Pesa PINs. " +
                "If you do not know a current platform detail, say so honestly.",
            input: message,
            max_output_tokens: 500
        });

        const reply = response.output_text;

        if (!reply) {
            console.error(
                "[Online Sphere AI] Empty response from model:",
                model
            );

            return res.status(502).json({
                success: false,
                message: "The AI returned no text. Please try again."
            });
        }

        return res.json({
            success: true,
            reply
        });

    } catch (error) {
        // Diagnostic details only; never log API credentials.
        console.error("[Online Sphere AI] Request failed:", {
            name: error?.name,
            message: error?.message,
            status: error?.status,
            code: error?.code,
            type: error?.type,
            requestId: error?.request_id
        });

        return res.status(502).json({
            success: false,
            message: "Online Sphere AI is temporarily unavailable. Please try again."
        });
    }
});

// 404 HANDLER — keep after every API route.
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found."
    });
});

// GENERAL ERROR HANDLER
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

// START SERVER
app.listen(PORT, () => {
    console.log(`Online Sphere backend running on port ${PORT}`);
});
