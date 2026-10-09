require("dotenv").config();

const express = require("express");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

function normalizePackageName(packageName) {
    if (typeof packageName !== "string") return "";

    const trimmed = packageName.trim();
    if (!trimmed) return "";

    const match = Object.keys(PACKAGES).find(
        (name) => name.toLowerCase() === trimmed.toLowerCase()
    );

    return match || "";
}

function normalizePhoneNumber(phone) {
    if (phone === null || phone === undefined) return "";

    let phoneNumber = String(phone).replace(/\s+/g, "").replace(/^\+/, "");

    if (phoneNumber.startsWith("0")) {
        phoneNumber = `254${phoneNumber.substring(1)}`;
    }

    if (phoneNumber.startsWith("254")) {
        return phoneNumber;
    }

    return "";
}

/*
=========================================================
DARAJA URLs
=========================================================
*/

// Sandbox
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
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
        throw new Error(
            "MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET is missing."
        );
    }

    const credentials = Buffer.from(
        `${consumerKey}:${consumerSecret}`
    ).toString("base64");

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

    if (!response.ok || !data.access_token) {
        console.error("Daraja OAuth error:", data);
        throw new Error("Unable to obtain Daraja access token.");
    }

    return data.access_token;
}

/*
=========================================================
HELPER: CREATE STK PASSWORD
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
            message: "Invalid membership package.",
        });
    }

    res.json({
        success: true,
        package: packageKey,
        amount: PACKAGES[packageKey],
    });
});

/*
=========================================================
REAL MPESA STK PUSH
=========================================================
*/

app.post("/api/mpesa/stkpush", async (req, res) => {
    try {
        const { phone, packageName } = req.body;
        const normalizedPackageName = normalizePackageName(packageName);

        /*
        ---------------------------------------------
        VALIDATE PACKAGE
        ---------------------------------------------
        */

        if (!normalizedPackageName) {
            return res.status(400).json({
                success: false,
                message: "Invalid membership package.",
            });
        }

        /*
        ---------------------------------------------
        SERVER-SIDE AMOUNT
        ---------------------------------------------
        */

        const amount = PACKAGES[normalizedPackageName];

        /*
        ---------------------------------------------
        VALIDATE PHONE
        ---------------------------------------------
        */

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "M-Pesa phone number is required.",
            });
        }

        const phoneNumber = normalizePhoneNumber(phone);

        if (!/^254[17]\d{8}$/.test(phoneNumber)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Kenyan M-Pesa number.",
            });
        }

        /*
        ---------------------------------------------
        CHECK DARAJA CONFIGURATION
        ---------------------------------------------
        */

        const shortcode = process.env.MPESA_SHORTCODE;
        const passkey = process.env.MPESA_PASSKEY;
        const callbackUrl = process.env.MPESA_CALLBACK_URL;

        if (!shortcode || !passkey || !callbackUrl) {
            return res.status(500).json({
                success: false,
                message: "M-Pesa environment variables are not configured.",
            });
        }

        /*
        ---------------------------------------------
        GET ACCESS TOKEN
        ---------------------------------------------
        */

        const accessToken = await getAccessToken();

        /*
        ---------------------------------------------
        CREATE TIMESTAMP
        ---------------------------------------------
        */

        const timestamp = createTimestamp();

        /*
        ---------------------------------------------
        CREATE PASSWORD
        ---------------------------------------------
        */

        const password = Buffer.from(
            `${shortcode}${passkey}${timestamp}`
        ).toString("base64");

        /*
        ---------------------------------------------
        STK PUSH REQUEST
        ---------------------------------------------
        */

        const stkPayload = {
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: phoneNumber,
            PartyB: shortcode,
            PhoneNumber: phoneNumber,
            CallBackURL: callbackUrl,
            AccountReference: `ONLINE-SPHERE-${normalizedPackageName}`,
            TransactionDesc: `Online Sphere ${normalizedPackageName} Membership`,
        };

        console.log("Sending STK Push:");
        console.log({
            package: normalizedPackageName,
            amount,
            phone: phoneNumber,
        });

        /*
        ---------------------------------------------
        SEND REQUEST TO SAFARICOM
        ---------------------------------------------
        */

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

        console.log("Daraja STK response:", data);

        /*
        ---------------------------------------------
        DARAJA ERROR
        ---------------------------------------------
        */

        if (!response.ok) {
            return res.status(502).json({
                success: false,
                message: "Safaricom rejected the STK Push request.",
                error: data,
            });
        }

        /*
        ---------------------------------------------
        SUCCESS
        ---------------------------------------------
        */

        return res.json({
            success: true,
            message: "STK Push sent. Check your phone and enter your M-Pesa PIN.",
            package: normalizedPackageName,
            amount,
            phone: phoneNumber,
            merchantRequestID: data.MerchantRequestID,
            checkoutRequestID: data.CheckoutRequestID,
            responseCode: data.ResponseCode,
            responseDescription: data.ResponseDescription,
        });
    } catch (error) {
        console.error("STK Push error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to send M-Pesa STK Push.",
            error: error.message,
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

    console.log(JSON.stringify(req.body, null, 2));

    const callback = req.body?.Body?.stkCallback;

    if (!callback) {
        console.log("Invalid callback structure.");
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

        console.log("SUCCESSFUL PAYMENT:");
        console.log(paymentData);
    } else {
        console.log("Payment was not completed.");
    }

    res.json({
        ResultCode: 0,
        ResultDesc: "Accepted",
    });
});

/*
=========================================================
START SERVER
=========================================================
*/

app.listen(PORT, () => {
    console.log(`Online Sphere server running on port ${PORT}`);
    console.log(
        `M-Pesa environment: ${process.env.MPESA_ENV || "sandbox"}`
    );
});
