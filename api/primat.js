export default async function handler(req, res) {
  try {
    const q = req.query.q || "banan";

    const response = await fetch(
      "https://primat.nu/api/v3/demo/products?q=" +
      encodeURIComponent(q)
    );

    if (!response.ok) {
      throw new Error("Primat svarade med " + response.status);
    }

    const data = await response.json();

    res.status(200).json(data);

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
}
