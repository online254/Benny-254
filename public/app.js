/* =========================================================
   ONLINE SPHERE — MAIN JAVASCRIPT
   Version: Advanced UI + M-Pesa STK Push
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    /* ---------------------------------------------------------
       CONFIGURATION
    --------------------------------------------------------- */

    const MPESA_STK_ENDPOINT =
        "https://zeronline-sphere-api.onrender.com/api/mpesa/stkpush";

    const PACKAGE_PRICES = {
        Bronze: 1000,
        Silver: 1750,
        Gold: 2500
    };

    /* ---------------------------------------------------------
       HELPERS
    --------------------------------------------------------- */

    const $ = (selector, parent = document) =>
        parent.querySelector(selector);

    const $$ = (selector, parent = document) =>
        [...parent.querySelectorAll(selector)];

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

    const savedTheme =
        localStorage.getItem("onlineSphereTheme");

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

            localStorage.setItem(
                "onlineSphereTheme",
                isLight ? "light" : "dark"
            );

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
            const targetId =
                link.getAttribute("href");

            if (!targetId || targetId === "#") return;

            const target =
                document.querySelector(targetId);

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

        if (window.scrollY > 500) {
            backToTop.classList.add("visible");
        } else {
            backToTop.classList.remove("visible");
        }
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
       TOAST NOTIFICATION
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

        toast.classList.remove("warning");

        if (type === "warning" || type === "error") {
            toast.classList.add("warning");
        }

        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 5000);
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

        const anotherOpen =
            modals.some(item =>
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
       M-PESA PHONE NORMALIZATION
       Accepts:
       0712345678
       0112345678
       254712345678
       +254712345678
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
       M-PESA DEPOSIT FORM
       The matching HTML form must contain:
       #depositPackage
       #depositPhone
       #depositForm
    --------------------------------------------------------- */

    const depositForm = $("#depositForm");

    if (depositForm) {
        const depositPackage =
            $("#depositPackage", depositForm);

        const depositPhone =
            $("#depositPhone", depositForm);

        const depositSubmitButton =
            $('button[type="submit"]', depositForm);

        let depositRequestInProgress = false;

        depositForm.addEventListener("submit", async event => {
            event.preventDefault();

            if (depositRequestInProgress) {
                return;
            }

            if (!depositPackage || !depositPhone) {
                showToast(
                    "Form Setup Error",
                    "The package or phone field is missing. Please update index.html.",
                    "error"
                );
                return;
            }

            const packageName = depositPackage.value.trim();
            const phone = normalizeKenyanPhone(
                depositPhone.value
            );

            if (!Object.prototype.hasOwnProperty.call(
                PACKAGE_PRICES,
                packageName
            )) {
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

            const amount = PACKAGE_PRICES[packageName];

            const confirmed = window.confirm(
                `Continue with ${packageName} membership for KSh ${amount.toLocaleString("en-KE")}?\n\n` +
                `An M-Pesa payment prompt will be requested for ${phone}.`
            );

            if (!confirmed) {
                return;
            }

            depositRequestInProgress = true;

            if (depositSubmitButton) {
                depositSubmitButton.disabled = true;
                depositSubmitButton.textContent =
                    "Requesting M-Pesa...";
            }

            try {
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

                const responseText =
                    await response.text();

                let result = {};

                if (responseText) {
                    try {
                        result = JSON.parse(responseText);
                    } catch {
                        throw new Error(
                            "The server returned an invalid response. Check the Render logs and backend endpoint."
                        );
                    }
                }

                if (!response.ok) {
                    const serverMessage =
                        typeof result.message === "string"
                            ? result.message
                            : typeof result.error === "string"
                                ? result.error
                                : "";

                    if (response.status >= 500) {
                        throw new Error(
                            serverMessage ||
                            "The payment server encountered an error. Please check Render logs before trying again."
                        );
                    }

                    throw new Error(
                        serverMessage ||
                        `The payment request failed (HTTP ${response.status}).`
                    );
                }

                /*
                 * A successful HTTP response only means the
                 * backend accepted the request. It does not
                 * prove that the customer paid.
                 */

                showToast(
                    "M-Pesa Request Sent",
                    `Check ${phone} for an M-Pesa prompt. Complete the prompt if it appears. Your payment is not confirmed yet.`,
                    "success"
                );

                const statusElement =
                    $("#depositPaymentStatus");

                if (statusElement) {
                    statusElement.textContent =
                        `STK Push request accepted for ${phone}. Complete the prompt on your phone. Waiting for payment confirmation.`;

                    statusElement.hidden = false;
                    statusElement.setAttribute(
                        "role",
                        "status"
                    );
                    statusElement.setAttribute(
                        "aria-live",
                        "polite"
                    );
                }

                /*
                 * Do not credit a balance or activate membership
                 * here. That must happen after server-side
                 * verification of the Daraja callback.
                 */

            } catch (error) {
                console.error(
                    "Online Sphere M-Pesa deposit error:",
                    error
                );

                showToast(
                    "Payment Request Failed",
                    error && error.message
                        ? error.message
                        : "Unable to contact the payment server. Check your internet connection and try again.",
                    "error"
                );

                const statusElement =
                    $("#depositPaymentStatus");

                if (statusElement) {
                    statusElement.textContent =
                        error && error.message
                            ? error.message
                            : "The payment request failed. Please try again.";

                    statusElement.hidden = false;
                    statusElement.setAttribute(
                        "role",
                        "alert"
                    );
                }

            } finally {
                depositRequestInProgress = false;

                if (depositSubmitButton) {
                    depositSubmitButton.disabled = false;
                    depositSubmitButton.textContent =
                        "Pay with M-Pesa";
                }
            }
        });
    }

    /* ---------------------------------------------------------
       DEMO WITHDRAW FORM
       Actual withdrawals require a secure backend.
    --------------------------------------------------------- */

    const withdrawForm = $("#withdrawForm");

    if (withdrawForm) {
        withdrawForm.addEventListener("submit", event => {
            event.preventDefault();

            showToast(
                "Withdrawals Not Connected",
                "This withdrawal form is a demonstration. No money has been sent.",
                "warning"
            );
        });
    }

    /* ---------------------------------------------------------
       SECURITY SCREEN
    --------------------------------------------------------- */

    const securityScreen = $(".security-screen");
    const securityForm = $("#securityForm");

    const accessGranted =
        localStorage.getItem("onlineSphereAccess");

    if (
        securityScreen &&
        accessGranted === "granted"
    ) {
        securityScreen.classList.add("security-hidden");
    }

    if (securityForm) {
        securityForm.addEventListener("submit", event => {
            event.preventDefault();

            securityScreen?.classList.add("security-hidden");

            localStorage.setItem(
                "onlineSphereAccess",
                "granted"
            );

            showToast(
                "Access Granted",
                "Welcome to Online Sphere."
            );
        });
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

                if (href && href !== "#") {
                    return;
                }

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
                currentSection = section.getAttribute("id");
            }
        });

        navLinks.forEach(link => {
            link.classList.remove("active");

            const href = link.getAttribute("href");

            if (
                currentSection &&
                href === `#${currentSection}`
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
                value.toLocaleString();

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent =
                    target.toLocaleString();
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
       The deposit handler manages its own request lock.
    --------------------------------------------------------- */

    $$("form").forEach(form => {
        if (form.id === "depositForm") {
            return;
        }

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

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    updateOnlineStatus();

    /* ---------------------------------------------------------
       INITIAL READY MESSAGE
    --------------------------------------------------------- */

    setTimeout(() => {
        if (!sessionStorage.getItem("onlineSphereWelcome")) {
            showToast(
                "Online Sphere",
                "Welcome to your advanced digital platform."
            );

            sessionStorage.setItem(
                "onlineSphereWelcome",
                "true"
            );
        }
    }, 1800);

});
