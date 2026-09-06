export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://primat.nu/api/v3/demo/products?q=banan"
    );

    const data = await response.json();

    res.status(200).json(data);

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
}
