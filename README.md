<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Online Sphere Commerce | Mentor Benson</title>
  <link rel="stylesheet" href="styles.css">
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
