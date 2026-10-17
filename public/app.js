/* =========================================================
   ONLINE SPHERE — MAIN JAVASCRIPT
   Version: Advanced UI + Dynamic Package Fees
   + M-Pesa STK Push Diagnostics
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    /* ---------------------------------------------------------
       CONFIGURATION
    --------------------------------------------------------- */

    const MPESA_STK_ENDPOINT =
        "https://online-sphere-backend.onrender.com/api/mpesa/stkpush";

    const PACKAGE_PRICES = Object.freeze({
        Bronze: 1000,
        Silver: 1750,
        Gold: 2500
    });

    /* ---------------------------------------------------------
       HELPERS
    --------------------------------------------------------- */

    const $ = (selector, parent = document) =>
        parent.querySelector(selector);

    const $$ = (selector, parent = document) =>
        [...parent.querySelectorAll(selector)];

    const formatKES = amount =>
        `KSh ${Number(amount).toLocaleString("en-KE")}`;

    /* ---------------------------------------------------------
       PAGE LOADER
    --------------------------------------------------------- */

    const pageLoader = $(".page-loader");

    if (pageLoader) {
        setTimeout(() => {
            pageLoader.classList.add("hidden");

            setTimeout(() => {
                pageLoader.style.display = "none";
            }, 500);
        }, 700);
    }

    /* ---------------------------------------------------------
       MOBILE MENU
    --------------------------------------------------------- */

    const menuBtn = $(".menu-btn");
    const nav = $("nav");

    if (menuBtn && nav) {
        menuBtn.addEventListener("click", () => {
            nav.classList.toggle("active");
            menuBtn.classList.toggle("active");
        });

        $$("nav a").forEach(link => {
            link.addEventListener("click", () => {
                nav.classList.remove("active");
                menuBtn.classList.remove("active");
            });
        });
    }

    /* ---------------------------------------------------------
       THEME SWITCHER
    --------------------------------------------------------- */

    const themeButton = $(".theme-button");

    let savedTheme = null;

    try {
        savedTheme = localStorage.getItem("onlineSphereTheme");
    } catch (error) {
        console.warn("Theme preference unavailable.", error);
    }

    if (savedTheme === "light") {
        document.body.classList.add("light-theme");
    }

    function updateThemeIcon() {
        if (!themeButton) return;

        const lightMode =
            document.body.classList.contains("light-theme");

        themeButton.textContent = lightMode ? "☀️" : "🌙";

        themeButton.setAttribute(
            "aria-label",
            lightMode
                ? "Switch to dark mode"
                : "Switch to light mode"
        );
    }

    updateThemeIcon();

    if (themeButton) {
        themeButton.addEventListener("click", () => {
            document.body.classList.toggle("light-theme");

            const isLight =
                document.body.classList.contains("light-theme");

            try {
                localStorage.setItem(
                    "onlineSphereTheme",
                    isLight ? "light" : "dark"
                );
            } catch (error) {
                console.warn("Could not save theme.", error);
            }

            updateThemeIcon();

            showToast(
                "Theme Updated",
                isLight
                    ? "Light mode enabled."
                    : "Dark mode enabled."
            );
        });
    }

    /* ---------------------------------------------------------
       SMOOTH SCROLLING
    --------------------------------------------------------- */

    $$('a[href^="#"]').forEach(link => {
        link.addEventListener("click", event => {
            const targetId = link.getAttribute("href");

            if (!targetId || targetId === "#") return;

            let target;

            try {
                target = document.querySelector(targetId);
            } catch {
                return;
            }

            if (target) {
                event.preventDefault();

                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        });
    });

    /* ---------------------------------------------------------
       BACK TO TOP
    --------------------------------------------------------- */

    const backToTop = $(".back-to-top");

    function updateBackToTop() {
        if (!backToTop) return;

        backToTop.classList.toggle(
            "visible",
            window.scrollY > 500
        );
    }

    window.addEventListener(
        "scroll",
        updateBackToTop,
        { passive: true }
    );

    updateBackToTop();

    if (backToTop) {
        backToTop.addEventListener("click", () => {
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });
    }

    /* ---------------------------------------------------------
       TOAST NOTIFICATIONS
    --------------------------------------------------------- */

    const toast = $(".toast");

    const toastTitle = toast
        ? $("strong", toast)
        : null;

    const toastMessage = toast
        ? $("p", toast)
        : null;

    const toastClose = toast
        ? $("button", toast)
        : null;

    let toastTimer;

    function showToast(
        title = "Online Sphere",
        message = "Action completed.",
        type = "success"
    ) {
        if (!toast) {
            console.log(`${title}: ${message}`);
            return;
        }

        if (toastTitle) {
            toastTitle.textContent = title;
        }

        if (toastMessage) {
            toastMessage.textContent = message;
        }

        toast.classList.remove("warning", "error");

        if (type === "warning" || type === "error") {
            toast.classList.add("warning");
        }

        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 8000);
    }

    if (toastClose) {
        toastClose.addEventListener("click", () => {
            toast.classList.remove("show");
        });
    }

    /* ---------------------------------------------------------
       MODALS
    --------------------------------------------------------- */

    const modals = $$(".modal");

    function openModal(selector) {
        const modal = $(selector);

        if (!modal) return;

        modal.classList.add("active");
        document.body.classList.add("modal-open");
    }

    function closeModal(modal) {
        if (!modal) return;

        modal.classList.remove("active");

        const anotherOpen = modals.some(item =>
            item.classList.contains("active")
        );

        if (!anotherOpen) {
            document.body.classList.remove("modal-open");
        }
    }

    $$(".modal-close").forEach(button => {
        button.addEventListener("click", () => {
            closeModal(button.closest(".modal"));
        });
    });

    $$(".modal-overlay").forEach(overlay => {
        overlay.addEventListener("click", () => {
            closeModal(overlay.closest(".modal"));
        });
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            modals.forEach(modal => closeModal(modal));
        }
    });

    /* ---------------------------------------------------------
       DEPOSIT / WITHDRAW BUTTONS
    --------------------------------------------------------- */

    const depositButton = $(".deposit-action");
    const withdrawButton = $(".withdraw-action");

    if (depositButton) {
        depositButton.addEventListener("click", () => {
            openModal("#depositModal");
        });
    }

    if (withdrawButton) {
        withdrawButton.addEventListener("click", () => {
            openModal("#withdrawModal");
        });
    }

    /* ---------------------------------------------------------
       KENYAN PHONE NUMBER NORMALIZATION
    --------------------------------------------------------- */

    function normalizeKenyanPhone(value) {
        let phone = String(value || "")
            .trim()
            .replace(/[\s()-]/g, "");

        if (phone.startsWith("+")) {
            phone = phone.slice(1);
        }

        if (/^0[17]\d{8}$/.test(phone)) {
            phone = "254" + phone.slice(1);
        }

        if (!/^254[17]\d{8}$/.test(phone)) {
            return null;
        }

        return phone;
    }

    /* ---------------------------------------------------------
       DYNAMIC PACKAGE FEES + M-PESA STK PUSH
    --------------------------------------------------------- */

    const depositForm = $("#depositForm");

    if (depositForm) {
        const depositPackage =
            $("#depositPackage", depositForm);

        const depositPhone =
            $("#depositPhone", depositForm);

        const depositSubmitButton =
            $('button[type="submit"]', depositForm);

        const packageFeeDisplay =
            $("#depositPackageFee");

        const paymentStatus =
            $("#depositPaymentStatus");

        let depositRequestInProgress = false;

        function getPackagePrice(packageName) {
            if (
                !Object.prototype.hasOwnProperty.call(
                    PACKAGE_PRICES,
                    packageName
                )
            ) {
                return null;
            }

            return PACKAGE_PRICES[packageName];
        }

        function updatePackageFee() {
            if (!depositPackage) return;

            const packageName =
                depositPackage.value.trim();

            const amount = getPackagePrice(packageName);

            if (packageFeeDisplay) {
                packageFeeDisplay.textContent =
                    amount === null
                        ? "Select a package"
                        : formatKES(amount);
            }

            $$("[data-selected-package-fee]", depositForm)
                .forEach(element => {
                    element.textContent =
                        amount === null
                            ? "Select a package"
                            : formatKES(amount);

                    element.dataset.amount =
                        amount === null
                            ? ""
                            : String(amount);
                });

            if (
                depositSubmitButton &&
                !depositRequestInProgress
            ) {
                depositSubmitButton.textContent =
                    amount === null
                        ? "Pay with M-Pesa"
                        : `Pay ${formatKES(amount)}`;
            }
        }

        if (depositPackage) {
            depositPackage.addEventListener(
                "change",
                updatePackageFee
            );

            updatePackageFee();
        }

        depositForm.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                if (depositRequestInProgress) return;

                if (!depositPackage || !depositPhone) {
                    showToast(
                        "Form Setup Error",
                        "Missing package or phone field. Check index.html.",
                        "error"
                    );
                    return;
                }

                const packageName =
                    depositPackage.value.trim();

                const amount =
                    getPackagePrice(packageName);

                const phone =
                    normalizeKenyanPhone(
                        depositPhone.value
                    );

                if (amount === null) {
                    showToast(
                        "Select a Package",
                        "Please select Bronze, Silver or Gold.",
                        "error"
                    );

                    depositPackage.focus();
                    return;
                }

                if (!phone) {
                    showToast(
                        "Invalid Phone Number",
                        "Enter a valid Kenyan M-Pesa number, such as 0712345678.",
                        "error"
                    );

                    depositPhone.focus();
                    return;
                }

                const confirmed = window.confirm(
                    `Selected package: ${packageName}\n` +
                    `Amount: ${formatKES(amount)}\n` +
                    `Phone: ${phone}\n\n` +
                    "Continue with the M-Pesa payment request?"
                );

                if (!confirmed) return;

                depositRequestInProgress = true;

                if (depositSubmitButton) {
                    depositSubmitButton.disabled = true;
                    depositSubmitButton.textContent =
                        "Requesting M-Pesa...";
                }

                if (paymentStatus) {
                    paymentStatus.hidden = true;
                    paymentStatus.textContent = "";
                }

                try {
                    /* SEND STK PUSH REQUEST */

                    const response = await fetch(
                        MPESA_STK_ENDPOINT,
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Accept": "application/json"
                            },
                            body: JSON.stringify({
                                phone: phone,
                                packageName: packageName
                            })
                        }
                    );

                    /* READ THE RAW RESPONSE */

                    const responseText =
                        await response.text();

                    const contentType =
                        response.headers.get("content-type") || "";

                    /* DIAGNOSTIC INFORMATION */

                    console.log(
                        "Online Sphere STK diagnostic:",
                        {
                            httpStatus: response.status,
                            responseOK: response.ok,
                            contentType: contentType,
                            responseBody:
                                responseText.slice(0, 1000)
                        }
                    );

                    /* PARSE JSON SAFELY */

                    let result;

                    try {
                        result = JSON.parse(responseText);
                    } catch (parseError) {
                        console.error(
                            "STK response JSON parsing failed:",
                            parseError
                        );

                        throw new Error(
                            `Render returned non-JSON data. ` +
                            `HTTP ${response.status}; ` +
                            `Content-Type: ${contentType}; ` +
                            `Response: ${
                                responseText.slice(0, 250) ||
                                "(empty response)"
                            }`
                        );
                    }

                    /* CHECK HTTP AND API ERRORS */

                    if (!response.ok || result.success === false) {
                        const serverMessage =
                            typeof result.message === "string"
                                ? result.message
                                : typeof result.error === "string"
                                    ? result.error
                                    : "";

                        throw new Error(
                            serverMessage ||
                            `STK Push failed with HTTP ${response.status}.`
                        );
                    }

                    /* CHECK THE APPLICATION RESPONSE */

                    if (result.success !== true) {
                        console.warn(
                            "STK response has no success:true flag.",
                            result
                        );
                    }

                    /* REQUEST ACCEPTED — PAYMENT NOT YET CONFIRMED */

                    showToast(
                        "M-Pesa Request Sent",
                        `Check ${phone} for an STK Push prompt for ${formatKES(amount)}. Payment is not confirmed yet.`
                    );

                    if (paymentStatus) {
                        paymentStatus.textContent =
                            `STK Push response received for ${packageName}, ${formatKES(amount)}. ` +
                            "Complete the prompt on your phone and wait for payment confirmation.";

                        paymentStatus.hidden = false;

                        paymentStatus.setAttribute(
                            "role",
                            "status"
                        );

                        paymentStatus.setAttribute(
                            "aria-live",
                            "polite"
                        );
                    }

                    console.log(
                        "Online Sphere STK response parsed:",
                        result
                    );

                    /*
                     * IMPORTANT:
                     * An accepted STK request is not proof of payment.
                     * Only the verified Daraja callback should confirm
                     * payment and trigger any account activation.
                     */

                } catch (error) {
                    console.error(
                        "Online Sphere M-Pesa deposit error:",
                        error
                    );

                    const message =
                        error && error.message
                            ? error.message
                            : "Unable to contact the payment server. Check your connection.";

                    showToast(
                        "Payment Request Failed",
                        message,
                        "error"
                    );

                    if (paymentStatus) {
                        paymentStatus.textContent = message;
                        paymentStatus.hidden = false;

                        paymentStatus.setAttribute(
                            "role",
                            "alert"
                        );

                        paymentStatus.setAttribute(
                            "aria-live",
                            "assertive"
                        );
                    }

                } finally {
                    depositRequestInProgress = false;

                    if (depositSubmitButton) {
                        depositSubmitButton.disabled = false;
                        updatePackageFee();
                    }
                }
            }
        );
    }

    /* ---------------------------------------------------------
       DEMO WITHDRAW FORM
       Actual withdrawals require a secure backend.
    --------------------------------------------------------- */

    const withdrawForm = $("#withdrawForm");

    if (withdrawForm) {
        withdrawForm.addEventListener(
            "submit",
            event => {
                event.preventDefault();

                showToast(
                    "Withdrawals Not Connected",
                    "This withdrawal form is a demonstration. No money has been sent.",
                    "warning"
                );
            }
        );
    }

    /* ---------------------------------------------------------
       SECURITY SCREEN
    --------------------------------------------------------- */

    const securityScreen = $(".security-screen");
    const securityForm = $("#securityForm");

    let accessGranted = null;

    try {
        accessGranted =
            localStorage.getItem("onlineSphereAccess");
    } catch (error) {
        console.warn("Could not read access preference.", error);
    }

    if (
        securityScreen &&
        accessGranted === "granted"
    ) {
        securityScreen.classList.add("security-hidden");
    }

    if (securityForm) {
        securityForm.addEventListener(
            "submit",
            event => {
                event.preventDefault();

                securityScreen?.classList.add(
                    "security-hidden"
                );

                try {
                    localStorage.setItem(
                        "onlineSphereAccess",
                        "granted"
                    );
                } catch (error) {
                    console.warn(
                        "Could not save access preference.",
                        error
                    );
                }

                showToast(
                    "Access Granted",
                    "Welcome to Online Sphere."
                );
            }
        );
    }

    /* ---------------------------------------------------------
       PROFILE BUTTON
    --------------------------------------------------------- */

    const profileButton = $(".profile-button");

    if (profileButton) {
        profileButton.addEventListener("click", () => {
            showToast(
                "Profile",
                "Profile management will be available in the next update."
            );
        });
    }

    /* ---------------------------------------------------------
       FEATURE LINKS
    --------------------------------------------------------- */

    $$(".feature-link").forEach(link => {
        link.addEventListener("click", event => {
            const href = link.getAttribute("href");

            if (!href || href === "#") {
                event.preventDefault();

                showToast(
                    "Online Sphere",
                    "This feature is ready for the next development stage."
                );
            }
        });
    });

    /* ---------------------------------------------------------
       ACTION BUTTONS
    --------------------------------------------------------- */

    $$(".primary-btn, .secondary-btn, .primary-small, .outline-button")
        .forEach(button => {
            button.addEventListener("click", event => {
                const href = button.getAttribute("href");

                const text =
                    button.textContent.trim().toLowerCase();

                if (href && href !== "#") return;

                if (
                    button.classList.contains("deposit-action") ||
                    button.classList.contains("withdraw-action")
                ) {
                    return;
                }

                event.preventDefault();

                if (
                    text.includes("support") ||
                    text.includes("help")
                ) {
                    showToast(
                        "Support",
                        "Support centre is ready for integration."
                    );
                } else if (text.includes("explore")) {
                    const features =
                        document.querySelector("#features");

                    if (features) {
                        features.scrollIntoView({
                            behavior: "smooth"
                        });
                    }
                } else {
                    showToast(
                        "Online Sphere",
                        "This feature is ready for the next development stage."
                    );
                }
            });
        });

    /* ---------------------------------------------------------
       ACTIVE NAVIGATION
    --------------------------------------------------------- */

    const sections = $$("section[id]");
    const navLinks = $$('nav a[href^="#"]');

    function updateActiveNavigation() {
        const scrollPosition = window.scrollY + 180;

        let currentSection = "";

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;

            if (
                scrollPosition >= sectionTop &&
                scrollPosition < sectionTop + sectionHeight
            ) {
                currentSection =
                    section.getAttribute("id");
            }
        });

        navLinks.forEach(link => {
            link.classList.remove("active");

            if (
                currentSection &&
                link.getAttribute("href") ===
                    `#${currentSection}`
            ) {
                link.classList.add("active");
            }
        });
    }

    window.addEventListener(
        "scroll",
        updateActiveNavigation,
        { passive: true }
    );

    updateActiveNavigation();

    /* ---------------------------------------------------------
       NUMBER COUNTER ANIMATION
    --------------------------------------------------------- */

    function animateCounter(element) {
        const target = Number(
            element.dataset.target ||
            element.textContent.replace(/[^0-9.]/g, "")
        );

        if (!target) return;

        const duration = 1200;
        const startTime = performance.now();

        function update(currentTime) {
            const progress = Math.min(
                (currentTime - startTime) / duration,
                1
            );

            const value = Math.floor(progress * target);

            element.textContent =
                value.toLocaleString("en-KE");

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent =
                    target.toLocaleString("en-KE");
            }
        }

        requestAnimationFrame(update);
    }

    /* ---------------------------------------------------------
       INTERSECTION OBSERVER
    --------------------------------------------------------- */

    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("in-view");

                        if (
                            entry.target.classList.contains("counter") &&
                            !entry.target.dataset.animated
                        ) {
                            entry.target.dataset.animated = "true";
                            animateCounter(entry.target);
                        }
                    }
                });
            },
            {
                threshold: 0.15
            }
        );

        $$(".feature-card, .quick-stat, .security-item, .counter")
            .forEach(element => {
                observer.observe(element);
            });
    }

    /* ---------------------------------------------------------
       AMOUNT INPUT FORMATTING
    --------------------------------------------------------- */

    $$(".amount-input").forEach(input => {
        input.addEventListener("input", () => {
            const value =
                input.value.replace(/[^0-9]/g, "");

            input.dataset.rawValue = value;
        });
    });

    /* ---------------------------------------------------------
       PREVENT DOUBLE SUBMISSIONS
    --------------------------------------------------------- */

    $$("form").forEach(form => {
        if (form.id === "depositForm") return;

        form.addEventListener("submit", () => {
            const submitButton =
                form.querySelector('button[type="submit"]');

            if (!submitButton) return;

            submitButton.dataset.originalText =
                submitButton.textContent;

            submitButton.disabled = true;
            submitButton.textContent = "Processing...";

            setTimeout(() => {
                submitButton.disabled = false;

                submitButton.textContent =
                    submitButton.dataset.originalText ||
                    "Submit";
            }, 1500);
        });
    });

    /* ---------------------------------------------------------
       CURRENT YEAR
    --------------------------------------------------------- */

    $$(".current-year").forEach(element => {
        element.textContent =
            new Date().getFullYear();
    });

    /* ---------------------------------------------------------
       ONLINE STATUS
    --------------------------------------------------------- */

    function updateOnlineStatus() {
        const status = $(".account-status");

        if (!status) return;

        const statusText =
            status.querySelector("span:last-child");

        if (navigator.onLine) {
            if (statusText) {
                statusText.textContent = "Online";
            }

            status.classList.remove("offline");
        } else {
            if (statusText) {
                statusText.textContent = "Offline";
            }

            status.classList.add("offline");
        }
    }

    window.addEventListener(
        "online",
        updateOnlineStatus
    );

    window.addEventListener(
        "offline",
        updateOnlineStatus
    );

    updateOnlineStatus();

    /* ---------------------------------------------------------
       INITIAL READY MESSAGE
    --------------------------------------------------------- */

    setTimeout(() => {
        let welcomeShown = false;

        try {
            welcomeShown = Boolean(
                sessionStorage.getItem("onlineSphereWelcome")
            );
        } catch (error) {
            console.warn(
                "Could not read welcome preference.",
                error
            );
        }

        if (!welcomeShown) {
            showToast(
                "Online Sphere",
                "Welcome to your digital platform."
            );

            try {
                sessionStorage.setItem(
                    "onlineSphereWelcome",
                    "true"
                );
            } catch (error) {
                console.warn(
                    "Could not save welcome preference.",
                    error
                );
            }
        }
    }, 1800);

});
