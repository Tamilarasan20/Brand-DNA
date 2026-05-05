fetch("http://localhost:3000/api/extract-dna", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://stripe.com" })
}).then(r => r.json()).then(console.log).catch(console.error);
