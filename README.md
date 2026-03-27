<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Online Sphere Commerce | Mentor Benson</title>
  <style>
    /* General Reset */
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f9f9f9;
    }

    h1, h2, h3 {
      color: #003366; /* Professional dark blue */
    }

    p {
      color: #555; /* Subtle gray for readability */
      margin: 10px 0;
    }

    a {
      color: #0066cc; /* Link blue */
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .btn-primary, .btn-secondary {
      display: inline-block;
      padding: 10px 20px;
      margin: 10px 0;
      font-size: 1rem;
      font-weight: bold;
      text-align: center;
      color: #fff;
      border: none;
      cursor: pointer;
      border-radius: 5px;
    }

    .btn-primary {
      background-color: #0078d7;
    }

    .btn-primary:hover {
      background-color: #005a9e;
    }

    .btn-secondary {
      background-color: #29a329;
    }

    .btn-secondary:hover {
      background-color: #1d751d;
    }

    .hero {
      background: linear-gradient(rgba(0, 0, 51, 0.7), rgba(0, 0, 51, 0.7)), url('images/hero-bg.jpg') no-repeat center center/cover;
      color: #fff;
      text-align: center;
      padding: 100px 20px;
    }

    .hero h1 {
      font-size: 2.5rem;
      margin-bottom: 10px;
    }

    .hero p {
      font-size: 1.2rem;
    }

    section {
      padding: 40px 20px;
      background: #fff;
      margin: 20px auto;
      max-width: 1000px;
      border-radius: 10px;
      box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.1);
    }

    section#about {
      background: #eaf4fc;
    }

    .gallery-grid {
      display: flex;
      justify-content: center;
      gap: 15px;
      flex-wrap: wrap;
    }

    .gallery-grid img {
      width: 100%;
      max-width: 300px;
      border-radius: 10px;
      box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.1);
    }

    #products .product-list {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    }

    .product-card {
      background: #fafafa;
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 20px;
      flex: 1;
      min-width: 280px;
      text-align: center;
      box-shadow: 0px 1px 3px rgba(0, 0, 0, 0.2);
    }

    .product-card h3 {
      color: #003366;
    }

    form {
      margin-top: 20px;
      background: #f7f7f7;
      border: 1px solid #ddd;
      padding: 20px;
      border-radius: 10px;
    }

    label {
      display: block;
      margin: 10px 0 5px;
      color: #555;
    }

    input, button {
      display: block;
      width: 100%;
      padding: 10px;
      margin-bottom: 10px;
      border-radius: 5px;
      border: 1px solid #bbb;
      font-size: 1rem;
    }

    footer {
      text-align: center;
      padding: 20px;
      background-color: #003366;
      color: #fff;
    }

    footer p {
      margin: 0;
    }
  </style>
</head>
<body>
  <!-- Hero Section -->
  <header class="hero">
    <div class="hero-content">
      <h1>Welcome to Online Sphere Commerce</h1>
      <p>Trusted digital platform for e-commerce, learning, and consulting.</p>
      <a href="#products" class="btn-primary">Explore Products</a>
    </div>
  </header>

  <!-- About Section -->
  <section id="about">
    <h2>About Us</h2>
    <p>Founded by Mentor Benson, Online Sphere Commerce blends local relevance with global reach. 
       We provide e-commerce solutions, digital learning, and consulting services tailored for modern entrepreneurs.</p>
  </section>

  <!-- Gallery Section -->
  <section id="gallery">
    <h2>Gallery</h2>
    <div class="gallery-grid">
      <img src="images/photo1.jpg" alt="Business showcase">
      <img src="images/photo2.jpg" alt="Certificate">
      <img src="images/photo3.jpg" alt="Event">
    </div>
  </section>

  <!-- Products Section -->
  <section id="products">
    <h2>Our Products</h2>
    <div class="product-list">
      <div class="product-card">
        <h3>Digital Course</h3>
        <p>Learn digital marketing and e-commerce strategies.</p>
        <button class="btn-secondary">Buy Now</button>
      </div>
      <div class="product-card">
        <h3>Consulting Session</h3>
        <p>One-on-one mentorship with Benson.</p>
        <button class="btn-secondary">Book Now</button>
      </div>
    </div>
  </section>

  <!-- Payment Section -->
  <section id="payment">
    <h2>Secure Payment</h2>
    <form id="mpesaForm" method="POST" action="/process_payment">
      <label for="phone">Enter Phone Number (Safaricom):</label>
      <input type="text" id="phone" name="phone" placeholder="2547XXXXXXXX" required>

      <label for="amount">Amount (KES):</label>
      <input type="number" id="amount" name="amount" required>

      <button type="submit" class="btn-primary">Pay with M-PESA</button>
    </form>
    <p>Payments are processed securely via M-PESA STK Push.</p>
  </section>

  <!-- Contact Section -->
  <section id="contact">
    <h2>Contact Us</h2>
    <p>Email: info@onlinespherecommerce.com</p>
    <p>Phone: +2547XXXXXXXX</p>
  </section>

  <!-- Footer -->
  <footer>
    <p>&copy; 2026 Online Sphere Commerce | Mentor Benson</p>
  </footer>
</body>
</html>
